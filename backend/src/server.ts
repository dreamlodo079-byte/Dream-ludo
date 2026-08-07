import express, { Response } from 'express';
import http from 'http';
import cors from 'cors';
import dotenv from 'dotenv';
import helmet from 'helmet';
import jwt from 'jsonwebtoken';
import path from 'path';

import { connectDB, runInTransaction } from './config/db';
import { connectRedis, getRedisClient } from './config/redis';
import axios from 'axios';
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
import { getRoomState, cacheRoomState } from './config/redis';
import { getIO } from './services/socketManager';
import { getValidMoves, rotateTurn } from './services/gameEngine';
import { Transaction, TransactionType, TransactionStatus, getUserBalances } from './models/Transaction';
import { hashPassword } from './utils/hash';
import { Types } from 'mongoose';

dotenv.config();

const app = express();
const server = http.createServer(app);

// CORS setup
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept']
}));

// Secure HTTP Headers using Helmet (configured for cross-origin LAN & mobile access)
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));

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

// Temporary secure endpoint to trigger production database cleanup remotely
app.get('/api/admin/clean-db', async (req: express.Request, res: express.Response) => {
  const key = req.query.key || req.headers['x-admin-key'];
  if (key !== (process.env.ADMIN_API_KEY || 'master_admin_secret_key')) {
    return res.status(403).json({ error: 'Unauthorized admin key' });
  }

  try {
    const phone = req.query.phone as string;
    const PLATFORM_USER_ID = '000000000000000000000000';

    if (phone) {
      const targetUser = await User.findOne({ phone });
      if (targetUser) {
        await User.deleteOne({ _id: targetUser._id });
        await Transaction.deleteMany({ userId: targetUser._id });
        return res.json({
          success: true,
          message: `Deleted account for phone ${phone}`,
          deletedUser: targetUser.username,
        });
      } else {
        return res.json({ success: true, message: `No account found for phone ${phone}` });
      }
    }

    const deleteAll = req.query.all === 'true' || req.query.wipe === 'true';

    let deletedUsersCount = 0;
    if (deleteAll) {
      const delRes = await User.deleteMany({ _id: { $ne: PLATFORM_USER_ID } });
      deletedUsersCount = delRes.deletedCount;
    } else {
      const deletedTesters = await User.deleteMany({
        $or: [
          { username: /QuickTester/i },
          { phone: '9876543210' },
          { phone: '9876543211' }
        ]
      });
      deletedUsersCount = deletedTesters.deletedCount;
    }

    const deletedTxns = await Transaction.deleteMany({});
    const { Match } = require('./models/Match');
    const { Notification } = require('./models/Notification');
    const deletedMatches = await Match.deleteMany({});
    const deletedNotifs = await Notification.deleteMany({});

    let platformUser = await User.findById(PLATFORM_USER_ID);
    if (platformUser) {
      platformUser.walletBalance = 0;
      platformUser.depositBalance = 0;
      platformUser.winningsBalance = 0;
      await platformUser.save();
    }

    const remainingUsers = await User.find({ _id: { $ne: PLATFORM_USER_ID } });
    for (const u of remainingUsers) {
      u.walletBalance = 0;
      u.depositBalance = 0;
      u.winningsBalance = 0;
      await u.save();
    }

    return res.json({
      success: true,
      message: '✅ Production Database Cleanup Complete!',
      deletedUsersCount,
      deletedTransactionsCount: deletedTxns.deletedCount,
      deletedMatchesCount: deletedMatches.deletedCount,
      deletedNotificationsCount: deletedNotifs.deletedCount,
      resetUsersCount: remainingUsers.length,
      platformProfitsBalance: '₹0.00'
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// Secure endpoint to credit wallet balance to admin profile remotely
app.get(['/api/system/add-balance', '/api/admin/add-balance'], async (req: express.Request, res: express.Response) => {
  const key = req.query.key || req.headers['x-admin-key'];
  if (key !== (process.env.ADMIN_API_KEY || 'master_admin_secret_key')) {
    return res.status(403).json({ error: 'Unauthorized admin key' });
  }

  const phone = (req.query.phone as string || '7389927777').trim().slice(-10);
  const amount = Number(req.query.amount) || 1000;

  try {
    const user = await User.findOne({ phone: new RegExp(phone + '$') });
    if (!user) {
      return res.status(404).json({ error: `User with phone ending in ${phone} not found.` });
    }

    user.depositBalance = (user.depositBalance || 0) + amount;
    user.walletBalance = (user.depositBalance || 0) + (user.winningsBalance || 0);
    await user.save();

    const txn = new Transaction({
      userId: user._id,
      amount,
      type: TransactionType.DEPOSIT,
      status: TransactionStatus.SUCCESS,
      referenceId: `admin_credit_${Date.now()}`,
    });
    await txn.save();

    return res.json({
      success: true,
      message: `Successfully credited ₹${amount} to ${user.username} (${user.phone})!`,
      username: user.username,
      phone: user.phone,
      depositBalance: user.depositBalance,
      winningsBalance: user.winningsBalance,
      totalWalletBalance: user.walletBalance,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

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

// --- Custom OTP System ---

// 1. Send OTP Route
app.post('/api/users/send-otp', async (req, res) => {
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ error: 'Phone number is required' });

  // Extract exactly 10 digits
  const normalizedPhone = phone.replace(/\D/g, '').slice(-10);
  if (normalizedPhone.length !== 10) {
    return res.status(400).json({ error: 'Invalid phone number format' });
  }

  // Generate a random 6-digit OTP
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  
  try {
    const redis = getRedisClient();
    if (!redis) throw new Error('Redis not available');
    
    // Store OTP in Redis for 5 minutes (300 seconds)
    await redis.set(`otp:${normalizedPhone}`, otp, { EX: 300 });

    console.log(`[OTP GENERATED] Phone: ${normalizedPhone} | OTP: ${otp} | Mock: 343432`);

    // Call Fast2SMS API
    const fast2smsKey = process.env.FAST2SMS_API_KEY || 'SJTU4ELrjV0oMnRzZO3iId6B2XNKupP9YQ1sFymxlaW7hqkeGbjAw4HquarO53cMEVZLspCRSz7eQY9N';
    if (fast2smsKey) {
      try {
        await axios.get('https://www.fast2sms.com/dev/bulkV2', {
          params: {
            authorization: fast2smsKey,
            variables_values: otp,
            route: 'otp',
            numbers: normalizedPhone
          }
        });
        console.log(`Fast2SMS SMS sent successfully to ${normalizedPhone}`);
      } catch (smsErr: any) {
        console.error('Fast2SMS failed to send SMS:', smsErr?.response?.data || smsErr.message);
        // We don't throw here so that the mock OTP still works for testing if SMS fails
      }
    }

    return res.json({ success: true, message: 'OTP sent successfully' });
  } catch (error: any) {
    console.error('Error sending OTP:', error);
    return res.status(500).json({ error: 'Failed to generate OTP' });
  }
});

// 2. Verify OTP Route (Login/Register)
app.post('/api/users/verify-otp', async (req, res) => {
  const { phone, otp, username, password, referredByCode } = req.body;

  if (!phone || !otp) {
    return res.status(400).json({ error: 'Phone and OTP are required' });
  }

  const normalizedPhone = phone.replace(/\D/g, '').slice(-10);

  try {
    const redis = getRedisClient();
    if (!redis) throw new Error('Redis not available');

    // 1. Verify OTP
    const storedOtp = await redis.get(`otp:${normalizedPhone}`);
    
    // ALLOW MOCK OTP '343432' ALWAYS
    if (otp !== '343432' && otp !== storedOtp) {
      return res.status(400).json({ error: 'Invalid or expired OTP' });
    }

    // Delete OTP after successful verification
    await redis.del(`otp:${normalizedPhone}`);

    // 2. Find or Create User in MongoDB
    let user = await User.findOne({ phone: normalizedPhone });

    if (!user) {
      // User doesn't exist, create them
      if (!username) {
        return res.status(400).json({ error: 'User not registered. Please provide a username to sign up.' });
      }

      user = await processSignupWithReferral(
        normalizedPhone,
        username,
        password ? hashPassword(password.trim()) : '',
        referredByCode
      );
    } else if (password) {
      user.password = hashPassword(password.trim());
      await user.save();
    }

    // Privilege switch & test balance allocation for admin test numbers
    if (
      normalizedPhone === '7389927777' || user.phone.endsWith('7389927777') ||
      normalizedPhone === '7024065858' || user.phone.endsWith('7024065858') ||
      normalizedPhone === '9302561971' || user.phone.endsWith('9302561971')
    ) {
      user.role = 'SUPER_ADMIN';
      user.isAdmin = true;
      if ((user.winningsBalance || 0) < 10000) {
        user.winningsBalance = 10000;
      }
      if ((user.depositBalance || 0) < 10000) {
        user.depositBalance = 10000;
      }
      await user.save();
    }

    // 3. Issue our Custom JWT for the application
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
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// 3. Reset Password OTP Route
app.post('/api/users/reset-password-otp', async (req, res) => {
  const { phone, otp, newPassword } = req.body;

  if (!phone || !otp || !newPassword) {
    return res.status(400).json({ error: 'Phone, OTP, and new password are required' });
  }

  if (newPassword.trim().length < 4) {
    return res.status(400).json({ error: 'New password must be at least 4 characters long.' });
  }

  const normalizedPhone = phone.replace(/\D/g, '').slice(-10);

  try {
    const redis = getRedisClient();
    if (!redis) throw new Error('Redis not available');

    // 1. Verify OTP
    const storedOtp = await redis.get(`otp:${normalizedPhone}`);
    
    // ALLOW MOCK OTP '343432' ALWAYS
    if (otp !== '343432' && otp !== storedOtp) {
      return res.status(400).json({ error: 'Invalid or expired OTP' });
    }

    // Delete OTP after successful verification
    await redis.del(`otp:${normalizedPhone}`);

    // 2. Find User in MongoDB
    let user = await User.findOne({ phone: normalizedPhone });

    if (!user) {
      return res.status(404).json({ error: 'Registered user account not found.' });
    }

    // 3. Reset Password
    const hashed = hashPassword(newPassword.trim());
    user.password = hashed;
    await user.save();

    console.log(`Password reset successfully via OTP for phone ${normalizedPhone}`);

    return res.json({
      success: true,
      message: 'Password reset successfully! Please log in with your new password.',
    });
  } catch (error: any) {
    console.error('Error resetting password via OTP:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Admin Test Balance Endpoint
app.post('/api/users/add-test-balance', async (req, res) => {
  const { phone, winningsAmount, depositAmount, secret } = req.body;
  if (secret !== 'DREAM_LUDO_TEST_KEY_999') {
    return res.status(403).json({ error: 'Unauthorized secret key.' });
  }

  const targetPhone = phone ? String(phone).slice(-10) : '7389927777';
  const winAmt = Number(winningsAmount) || 10000;
  const depAmt = Number(depositAmount) || 10000;

  try {
    const user = await User.findOne({ phone: { $regex: targetPhone } });
    if (!user) {
      return res.status(404).json({ error: `User with phone ${targetPhone} not found.` });
    }

    user.winningsBalance = (user.winningsBalance || 0) + winAmt;
    user.depositBalance = (user.depositBalance || 0) + depAmt;
    user.role = 'SUPER_ADMIN';
    user.isAdmin = true;
    await user.save();

    return res.json({
      success: true,
      message: `Credited ₹${winAmt} Winnings & ₹${depAmt} Deposit Balance to user ${user.username} (${user.phone}).`,
      user: {
        username: user.username,
        phone: user.phone,
        winningsBalance: user.winningsBalance,
        depositBalance: user.depositBalance,
      },
    });
  } catch (error: any) {
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

const sanitizeUserError = (error: any): string => {
  if (!error) return 'An error occurred. Please try again.';
  const msg = typeof error === 'string' ? error : error.message || '';

  if (error.code === 11000 || msg.includes('E11000') || msg.includes('duplicate key')) {
    if (msg.includes('phone')) {
      return 'This phone number is already registered. Please login instead.';
    } else if (msg.includes('username')) {
      return 'This username is already taken. Please choose another username.';
    } else {
      return 'An account with these details already exists. Please login instead.';
    }
  }

  if (msg && !msg.includes('E11000') && !msg.includes('CastError') && !msg.includes('ValidationError') && !msg.includes('MongoServerError') && !msg.includes('at ')) {
    return msg;
  }

  return 'Account verification failed. Please try again.';
};



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
        const hashed = hashPassword(password.trim());
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
        password ? hashPassword(password.trim()) : '',
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
    return res.status(400).json({ error: sanitizeUserError(error) });
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

// Serve static landing page & downloadable APK with zero-cache headers
const publicDir = path.join(__dirname, '../public');

app.get(['/download', '/download/apk', '/dream-ludo.apk', '/Dream-Ludo.apk'], (_req, res) => {
  const apkFilePath = path.join(publicDir, 'downloads/dream-ludo.apk');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Content-Type', 'application/vnd.android.package-archive');
  res.setHeader('Content-Disposition', 'attachment; filename="Dream-Ludo.apk"');
  return res.sendFile(apkFilePath);
});

app.use(express.static(publicDir, {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.apk')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
  }
}));

// Health check endpoint
app.get('/health', (_req, res) => {
  res.json({ status: 'healthy', timestamp: new Date() });
});

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    // Connect to database
    await connectDB();

    // Drop legacy non-sparse virtualAccountId_1 index if present
    try {
      await User.collection.dropIndex('virtualAccountId_1');
      console.log('Successfully dropped legacy non-sparse virtualAccountId_1 index from MongoDB');
    } catch (err) {
      // Ignore if index is not present
    }

    // Run platform initialization seed engine
    await seedPlatformDatabase();

    // Connect to Redis
    await connectRedis();

    // Initialize Socket Server
    await initializeSocketIO(server);

    // Start automated grand tournament bracket scheduler
    startTournamentScheduler();

    server.listen(Number(PORT), '0.0.0.0', () => {
      console.log(`Server running on http://0.0.0.0:${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();

