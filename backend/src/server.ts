import express, { Response } from 'express';
import http from 'http';
import cors from 'cors';
import dotenv from 'dotenv';
import helmet from 'helmet';
import jwt from 'jsonwebtoken';
import path from 'path';
import fs from 'fs';
import { connectDB, runInTransaction } from './config/db';
import { connectRedis } from './config/redis';
import { seedPlatformDatabase } from './config/seed';
import { initializeSocketIO } from './services/socketManager';
import { startTournamentScheduler } from './services/tournamentEngine';
import { paymentRouter } from './controllers/paymentController';
import { payoutRouter } from './controllers/payoutController';
import { tournamentRouter } from './controllers/tournamentController';
import { leaderboardRouter } from './controllers/leaderboardController';
import { walletRouter } from './controllers/walletController';
import { notificationRouter } from './controllers/notificationController';
import { adminWalletRouter } from './controllers/adminWalletController';
import { getDailyProgress, claimDailyReward } from './services/challengeTracker';
import { generalRateLimiter, strictRateLimiter, sanitizeInputMiddleware } from './middleware/security';
import { authenticateJWT, blacklistToken, JWT_SECRET, AuthenticatedRequest } from './middleware/auth';
import { User } from './models/User';
import { getRoomState, cacheRoomState, getRedisClient } from './config/redis';
import { getIO } from './services/socketManager';
import { getValidMoves, rotateTurn } from './services/gameEngine';
import { Transaction, TransactionType, TransactionStatus, getUserBalances } from './models/Transaction';
import { hashPassword } from './utils/hash';
import { Types } from 'mongoose';

dotenv.config();

const app = express();
const server = http.createServer(app);

// CORS setup
app.use(cors());

// Secure HTTP Headers using Helmet
app.use(helmet());

// Apply global rate limiting to all standard routes
app.use(generalRateLimiter);

// Parse JSON payloads and capture raw body buffer for secure webhook verification
app.use(express.json({
  verify: (req: any, _res, buf) => {
    req.rawBody = buf.toString();
  }
}));

// Neutralize NoSQL / XSS injection attempts
app.use(sanitizeInputMiddleware);

// Strict rate limiting rules for financial & auth routes
app.use('/api/payout/withdraw', strictRateLimiter);
app.use('/api/v1/wallet/withdraw/request', strictRateLimiter);
app.use('/api/users/login', strictRateLimiter);
app.use('/api/payments/webhook', strictRateLimiter);

import adminRouter from './routes/admin';

// Routes
app.use('/api/payments', paymentRouter);
app.use('/api/v1/payments', paymentRouter);
app.use('/api/payout', payoutRouter);
app.use('/api/v1/payout', payoutRouter);
app.use('/api/wallet', walletRouter);
app.use('/api/v1/wallet', walletRouter);
app.use('/api/notifications', notificationRouter);
app.use('/api/v1/notifications', notificationRouter);
app.use('/api/tournaments', tournamentRouter);
app.use('/api/leaderboard', leaderboardRouter);
app.use('/api/admin', adminRouter);
app.use('/api/admin', adminWalletRouter);
app.use('/api/v1/admin', adminWalletRouter);

// Serve public mobile-first APK download landing page
const publicDir = path.join(__dirname, '../public');
app.use(express.static(publicDir));
app.use(express.static('public'));

// Direct APK Download Endpoint
app.get(['/download/apk', '/dream-ludo.apk', '/download'], (_req, res) => {
  const apkPath = path.join(publicDir, 'downloads/dream-ludo.apk');
  if (fs.existsSync(apkPath)) {
    return res.download(apkPath, 'Dream-Ludo.apk');
  }

  res.setHeader('Content-Type', 'application/vnd.android.package-archive');
  res.setHeader('Content-Disposition', 'attachment; filename="Dream-Ludo.apk"');
  return res.send(Buffer.from('Dream Ludo APK Build Artifact Placeholder.'));
});

// Daily challenges query route
app.get('/api/challenges/:userId', async (req, res) => {
  const { userId } = req.params;
  try {
    const progress = await getDailyProgress(userId);
    return res.json({ success: true, progress });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// Daily challenges claim route
app.post('/api/challenges/claim', async (req, res) => {
  const { userId } = req.body;
  if (!userId) {
    return res.status(400).json({ error: 'userId is required' });
  }
  try {
    const result = await claimDailyReward(userId);
    return res.json(result);
  } catch (error: any) {
    return res.status(400).json({ error: error.message });
  }
});

// Send OTP Route
app.post('/api/users/send-otp', async (req, res) => {
  const { phone, username, password, isLogin } = req.body;

  if (!phone) {
    return res.status(400).json({ error: 'Phone number is required' });
  }

  // Indian phone validation (10 digits starting with 6-9, optional 91/+91 prefix)
  const phoneRegex = /^(?:\+91|91)?[6789]\d{9}$/;
  if (!phoneRegex.test(phone.trim())) {
    return res.status(400).json({ error: 'Invalid Indian phone number. Please enter a valid 10-digit number starting with 6, 7, 8, or 9 (with optional +91/91 prefix).' });
  }

  const normalizedPhone = phone.trim().slice(-10);

  try {
    const user = await User.findOne({ phone: normalizedPhone });

    if (isLogin) {
      if (!user) {
        return res.status(400).json({ error: 'Phone number not registered. Please sign up.' });
      }
      if (!password) {
        return res.status(400).json({ error: 'Password is required' });
      }
      const hashed = hashPassword(password);
      // Verify password if user has password set
      if (user.password && user.password !== hashed) {
        return res.status(400).json({ error: 'Incorrect password.' });
      }
    } else {
      // Signup mode
      if (user) {
        return res.status(400).json({ error: 'Phone number already registered. Please log in.' });
      }
      if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required for signup.' });
      }
    }

    // Support automatic bypass for testing phone
    let otp = '123456';
    if (normalizedPhone !== '9876543210') {
      otp = Math.floor(100000 + Math.random() * 900000).toString();
    }

    const redis = getRedisClient();
    if (redis) {
      await redis.set(`otp:${normalizedPhone}`, otp, { EX: 300 }); // 5 minutes TTL
    }

    console.log(`[SMS GATEWAY SIMULATION] Sent OTP ${otp} to phone ${normalizedPhone}`);

    return res.json({
      success: true,
      message: 'OTP sent successfully to your phone number.',
      otp, // returned for testing/development simulation
    });
  } catch (error: any) {
    console.error('Error sending OTP:', error);
    return res.status(500).json({ error: error.message });
  }
});

// Forgot Password - Send OTP Route
app.post('/api/users/forgot-password/send-otp', async (req, res) => {
  const { phone } = req.body;

  if (!phone) {
    return res.status(400).json({ error: 'Phone number is required' });
  }

  const phoneRegex = /^(?:\+91|91)?[6789]\d{9}$/;
  if (!phoneRegex.test(phone.trim())) {
    return res.status(400).json({ error: 'Invalid Indian phone number. Please enter a valid 10-digit number.' });
  }

  const normalizedPhone = phone.trim().slice(-10);

  try {
    const user = await User.findOne({ phone: normalizedPhone });
    if (!user) {
      return res.status(404).json({ error: 'No registered account found with this mobile number. Please check your phone number or sign up.' });
    }

    let otp = '123456';
    if (normalizedPhone !== '9876543210') {
      otp = Math.floor(100000 + Math.random() * 900000).toString();
    }

    const redis = getRedisClient();
    if (redis) {
      await redis.set(`forgot_otp:${normalizedPhone}`, otp, { EX: 300 }); // 5 minutes TTL
    }

    console.log(`[SMS GATEWAY FORGOT PASSWORD] Sent OTP ${otp} to phone ${normalizedPhone}`);

    return res.json({
      success: true,
      message: 'Password reset OTP sent successfully to your registered mobile number.',
      otp, // returned for testing/development simulation
    });
  } catch (error: any) {
    console.error('Error sending forgot password OTP:', error);
    return res.status(500).json({ error: error.message });
  }
});

// Forgot Password - Verify OTP & Reset Password Route
app.post('/api/users/forgot-password/reset', async (req, res) => {
  const { phone, otp, newPassword } = req.body;

  if (!phone || !otp || !newPassword) {
    return res.status(400).json({ error: 'Phone number, OTP, and new password are required.' });
  }

  if (newPassword.trim().length < 4) {
    return res.status(400).json({ error: 'New password must be at least 4 characters long.' });
  }

  const normalizedPhone = phone.trim().slice(-10);
  const otpStr = String(otp).trim();

  // Validate OTP with Master bypass for testing phase
  if (
    otpStr === '123456' ||
    normalizedPhone === '9876543210' ||
    normalizedPhone === '7389927777' ||
    normalizedPhone === '7024065858' ||
    normalizedPhone === '9302561971' ||
    process.env.NODE_ENV !== 'production'
  ) {
    // Universal Master OTP bypass for development / testing
  } else {
    const redis = getRedisClient();
    if (redis) {
      const cachedOtp = await redis.get(`forgot_otp:${normalizedPhone}`);
      if (!cachedOtp || cachedOtp !== otpStr) {
        return res.status(400).json({ error: 'Invalid or expired OTP. Please request a new OTP.' });
      }
      await redis.del(`forgot_otp:${normalizedPhone}`);
    }
  }

  try {
    const user = await User.findOne({ phone: normalizedPhone });
    if (!user) {
      return res.status(404).json({ error: 'Registered user account not found.' });
    }

    const hashed = hashPassword(newPassword.trim());
    user.password = hashed;
    await user.save();

    console.log(`Password reset successfully for phone ${normalizedPhone}`);

    return res.json({
      success: true,
      message: 'Password reset successfully! Please log in with your new password.',
    });
  } catch (error: any) {
    console.error('Error resetting password:', error);
    return res.status(500).json({ error: error.message });
  }
});

// Update Profile Avatar Route
app.post('/api/users/update-avatar', async (req, res) => {
  const { userId, avatar } = req.body;

  if (!userId || !avatar) {
    return res.status(400).json({ error: 'UserId and avatar are required' });
  }

  try {
    const user = await User.findByIdAndUpdate(userId, { avatar }, { new: true });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    return res.json({ success: true, user });
  } catch (error: any) {
    console.error('Error updating avatar:', error);
    return res.status(500).json({ error: error.message });
  }
});

// Helper function to process signup & referral inside an absolute Mongoose ACID transaction session
async function processSignupWithReferral(
  phone: string,
  username: string,
  passwordHash: string,
  referredByCode?: string
) {
  return await runInTransaction(async (session) => {
    let referrer: any = null;
    let validReferralCode: string | null = null;

    if (referredByCode && typeof referredByCode === 'string' && referredByCode.trim().length > 0) {
      const targetCode = referredByCode.trim().toUpperCase();
      const dreamCode = targetCode.replace(/^SEXUS/i, 'DREAM');
      const sexusCode = targetCode.replace(/^DREAM/i, 'SEXUS');
      // 1. Verification Gate: Locate the existing user document (the Referrer)
      referrer = await User.findOne({ referralCode: { $in: [targetCode, dreamCode, sexusCode] } }).session(session);
      if (referrer) {
        validReferralCode = referrer.referralCode;

        // 2. Referrer Reward Allocation: Increment friendsJoined by 1 & credit 10.00 to bonusBalance
        referrer.friendsJoined = (referrer.friendsJoined || 0) + 1;
        referrer.bonusBalance = Math.round(((referrer.bonusBalance || 0) + 10.00) * 100) / 100;
        await referrer.save({ session });

        // 3. Double-Entry Ledger Stamping: Append REFERRAL_BONUS_CREDIT transaction
        const refTxn = new Transaction({
          userId: referrer._id,
          amount: 10.00,
          type: TransactionType.REFERRAL_BONUS_CREDIT,
          status: TransactionStatus.SUCCESS,
          referenceId: `ref_bonus_${referrer._id}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        });
        await refTxn.save({ session });
      }
    }

    // 4. New User Reward Allocation: Create new user with referralCode and ₹10.00 bonus balance
    const suffix = Math.random().toString(36).substring(2, 8).toUpperCase();
    const newUserReferralCode = `DREAM${suffix}`;
    const isSuperAdmin = phone.endsWith('7389927777') || phone.endsWith('7024065858') || phone.endsWith('9302561971');

    const newUser = new User({
      phone,
      username,
      password: passwordHash,
      role: isSuperAdmin ? 'SUPER_ADMIN' : 'USER',
      isAdmin: isSuperAdmin,
      referralCode: newUserReferralCode,
      referredBy: validReferralCode,
      bonusBalance: 10.00, // ₹10.00 promotional welcome credits
    });
    await newUser.save({ session });

    // Seed Welcome Diamond credits
    const welcomeTxn = new Transaction({
      userId: newUser._id,
      amount: 1000,
      type: TransactionType.DEPOSIT,
      status: TransactionStatus.SUCCESS,
      referenceId: `welcome_${newUser._id.toString()}`,
    });
    await welcomeTxn.save({ session });

    return newUser;
  });
}

// Verify OTP Route
app.post('/api/users/verify-otp', async (req, res) => {
  const { phone, username, password, otp, isLogin, referredByCode } = req.body;

  if (!phone || !otp) {
    return res.status(400).json({ error: 'Phone and OTP are required' });
  }

  const normalizedPhone = phone.trim().slice(-10);
  const otpStr = String(otp).trim();

  // Master test OTP bypass for development / testing phase / admin login
  if (
    otpStr === '123456' ||
    normalizedPhone === '9876543210' ||
    normalizedPhone === '7389927777' ||
    normalizedPhone === '7024065858' ||
    normalizedPhone === '9302561971' ||
    process.env.NODE_ENV !== 'production'
  ) {
    // Universal Master OTP bypass for testing phase
  } else {
    const redis = getRedisClient();
    if (redis) {
      const cachedOtp = await redis.get(`otp:${normalizedPhone}`);
      if (cachedOtp && cachedOtp !== otpStr) {
        return res.status(400).json({ error: 'Invalid or expired OTP. Please try again.' });
      }
      if (cachedOtp) {
        await redis.del(`otp:${normalizedPhone}`);
      }
    }
  }

  try {
    let user = await User.findOne({ phone: normalizedPhone });

    if (!isLogin) {
      // Signup - create user
      if (user) {
        return res.status(400).json({ error: 'Phone already registered.' });
      }
      if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required for signup.' });
      }

      user = await processSignupWithReferral(
        normalizedPhone,
        username,
        hashPassword(password),
        referredByCode
      );
    } else {
      // Login
      if (!user) {
        return res.status(400).json({ error: 'User not registered. Please sign up.' });
      }
    }

    // Privilege switch: Check if phone signature is 7389927777
    if (user.phone.endsWith('7389927777') || user.phone.endsWith('7024065858') || user.phone.endsWith('9302561971')) {
      user.role = 'SUPER_ADMIN';
      user.isAdmin = true;
      await user.save();
    }

    const token = jwt.sign(
      {
        userId: user._id.toString(),
        username: user.username,
        role: user.role,
        isAdmin: user.isAdmin,
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    return res.json({ success: true, user, token });
  } catch (error: any) {
    console.error('Error verifying OTP:', error);
    return res.status(500).json({ error: error.message });
  }
});

// Basic Auth/User Registration Route
app.post('/api/users/login', async (req, res) => {
  const { phone, username, password, referredByCode } = req.body;
  if (!phone) {
    return res.status(400).json({ error: 'Phone is required' });
  }

  const normalizedPhone = phone.trim().slice(-10);

  try {
    let user = await User.findOne({ phone: normalizedPhone });

    if (user) {
      if (password) {
        const hashed = hashPassword(password);
        if (user.password && user.password !== hashed) {
          return res.status(400).json({ error: 'Incorrect password' });
        }
      }
    } else {
      // If user does not exist and username is provided, automatically create user (legacy welcome mode / Dev sandbox)
      if (!username) {
        return res.status(400).json({ error: 'User not found. Please register first.' });
      }

      user = await processSignupWithReferral(
        normalizedPhone,
        username,
        password ? hashPassword(password) : '',
        referredByCode
      );
    }

    // Privilege switch: Check if phone signature is 7389927777
    if (
      normalizedPhone === '7389927777' || user.phone.endsWith('7389927777') ||
      normalizedPhone === '7024065858' || user.phone.endsWith('7024065858') ||
      normalizedPhone === '9302561971' || user.phone.endsWith('9302561971')
    ) {
      user.role = 'SUPER_ADMIN';
      user.isAdmin = true;
      await user.save();
    }

    const token = jwt.sign(
      {
        userId: user._id.toString(),
        username: user.username,
        role: user.role,
        isAdmin: user.isAdmin,
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    return res.json({ success: true, user, token });
  } catch (error: any) {
    console.error('Error logging in user:', error);
    return res.status(500).json({ error: error.message });
  }
});

// KYC Submission & Auto-Approval Route
app.post('/api/users/kyc', async (req, res) => {
  const { userId, kycType, documentNumber, name } = req.body;

  if (!userId || !kycType || !documentNumber || !name) {
    return res.status(400).json({ error: 'userId, kycType, documentNumber, and name are required' });
  }

  if (kycType !== 'PAN' && kycType !== 'AADHAAR') {
    return res.status(400).json({ error: 'kycType must be either PAN or AADHAAR' });
  }

  // Format and check regex validation
  let normalizedDoc = documentNumber.trim();
  if (kycType === 'PAN') {
    const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
    normalizedDoc = normalizedDoc.toUpperCase();
    if (!panRegex.test(normalizedDoc)) {
      return res.status(400).json({ error: 'Invalid PAN card format. Must be like ABCDE1234F (5 uppercase letters, 4 digits, 1 uppercase letter).' });
    }
  } else if (kycType === 'AADHAAR') {
    const aadhaarRegex = /^\d{12}$/;
    normalizedDoc = normalizedDoc.replace(/\s|-/g, ''); // strip spaces/dashes
    if (!aadhaarRegex.test(normalizedDoc)) {
      return res.status(400).json({ error: 'Invalid Aadhaar format. Must be exactly 12 digits.' });
    }
  }

  try {
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    user.kycStatus = 'APPROVED';
    user.kycType = kycType;
    user.kycDocumentNumber = normalizedDoc;
    user.kycName = name.trim();
    user.isKycVerified = true;

    if (kycType === 'PAN') {
      user.panNumber = normalizedDoc;
    } else if (kycType === 'AADHAAR') {
      user.aadhaarNumber = normalizedDoc;
    }

    await user.save();

    return res.json({ success: true, user });
  } catch (error: any) {
    console.error('Error submitting KYC:', error);
    return res.status(500).json({ error: error.message });
  }
});

// Secure Asynchronous Logout Route committing JWT to Redis blacklist
app.post('/api/users/logout', authenticateJWT, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const token = req.token;
    if (token) {
      await blacklistToken(token);
    }
    return res.json({ success: true, message: 'Logged out successfully and session invalidated.' });
  } catch (error: any) {
    console.error('Logout error:', error);
    return res.status(500).json({ error: error.message });
  }
});

// Premium re-roll dice route (deducts 5 credits and resets active roll state)
app.post('/api/payments/re-roll', authenticateJWT, async (req: AuthenticatedRequest, res) => {
  const { roomId } = req.body;
  const userId = req.user?.userId;

  if (!roomId || !userId) {
    return res.status(400).json({ error: 'roomId and userId are required' });
  }

  try {
    const state = await getRoomState(roomId);
    if (!state) {
      return res.status(404).json({ error: 'Active match room not found' });
    }

    if (state.isTerminated) {
      return res.status(400).json({ error: 'Match has already terminated' });
    }

    // Verify turn ownership
    const activePlayer = state.players[state.activePlayerIndex];
    if (activePlayer.id !== userId) {
      return res.status(400).json({ error: 'It is not your turn' });
    }

    // Verify existing active roll exists
    if (!state.hasRolled || state.diceRoll === null) {
      return res.status(400).json({ error: 'You must roll the dice before you can request a re-roll' });
    }

    // Verify balance
    const balances = await getUserBalances(userId);
    if (balances.total < 5) {
      return res.status(400).json({ error: 'Insufficient balance. Re-rolling requires 5 premium credits (Diamonds)' });
    }

    // Deduct re-roll fee
    const feeTxn = new Transaction({
      userId: new Types.ObjectId(userId),
      amount: -5,
      type: TransactionType.ENTRY_FEE,
      status: TransactionStatus.SUCCESS,
      referenceId: `reroll_${roomId}_${Date.now()}`,
    });
    await feeTxn.save();

    const prevRoll = state.diceRoll;
    const newRoll = Math.floor(Math.random() * 6) + 1;
    state.diceRoll = newRoll;

    // Adjust consecutive sixes count
    if (prevRoll === 6) {
      state.consecutiveSixes = Math.max(0, state.consecutiveSixes - 1);
    }
    
    if (newRoll === 6) {
      state.consecutiveSixes += 1;
      
      // If 3 consecutive sixes are rolled
      if (state.consecutiveSixes === 3) {
        state.players.forEach((p: any, idx: number) => {
          if (state.preTurnTokens && state.preTurnTokens[idx]) {
            p.tokens = [...state.preTurnTokens[idx]];
          }
        });
        state.consecutiveSixes = 0;
        state.diceRoll = null;
        state.hasRolled = false;
        rotateTurn(state);
        
        await cacheRoomState(roomId, state);
        const io = getIO();
        io.to(roomId).emit('MATCH_STATE_UPDATE', state);
        io.to(roomId).emit('SYSTEM_ALERT', { message: `${activePlayer.username} rolled three 6s in a row. Turn voided!` });
        return res.json({ success: true, newRoll, state, message: 'Rolled three 6s. Turn voided!' });
      }
    }

    // Check valid moves with the new roll
    const validMoves = getValidMoves(state, newRoll);
    if (validMoves.length === 0) {
      // Pass turn
      rotateTurn(state);
      await cacheRoomState(roomId, state);
      const io = getIO();
      io.to(roomId).emit('MATCH_STATE_UPDATE', state);
      return res.json({ success: true, newRoll, state, message: 'No valid moves available. Turn passed!' });
    }

    // Cache updated state
    await cacheRoomState(roomId, state);

    // Broadcast DICE_ROLLED event to trigger re-roll animations
    const io = getIO();
    io.to(roomId).emit('DICE_ROLLED', {
      playerIndex: state.activePlayerIndex,
      roll: newRoll,
      state,
    });

    return res.json({ success: true, newRoll, state });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// Health check endpoint
app.get('/health', (_req, res) => {
  res.json({ status: 'healthy', timestamp: new Date() });
});

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    // Connect to database
    await connectDB();

    // Run platform initialization seed engine
    await seedPlatformDatabase();

    // Connect to Redis
    await connectRedis();

    // Initialize Socket Server
    await initializeSocketIO(server);

    // Start automated grand tournament bracket scheduler
    startTournamentScheduler();

    server.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();
