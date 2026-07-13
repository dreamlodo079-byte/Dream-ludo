import express, { Response } from 'express';
import http from 'http';
import cors from 'cors';
import dotenv from 'dotenv';
import helmet from 'helmet';
import jwt from 'jsonwebtoken';
import { connectDB } from './config/db';
import { connectRedis } from './config/redis';
import { seedPlatformDatabase } from './config/seed';
import { initializeSocketIO } from './services/socketManager';
import { paymentRouter } from './controllers/paymentController';
import { payoutRouter } from './controllers/payoutController';
import { tournamentRouter } from './controllers/tournamentController';
import { leaderboardRouter } from './controllers/leaderboardController';
import { getDailyProgress, claimDailyReward } from './services/challengeTracker';
import { generalRateLimiter, strictRateLimiter, sanitizeInputMiddleware } from './middleware/security';
import { authenticateJWT, blacklistToken, JWT_SECRET, AuthenticatedRequest } from './middleware/auth';
import { User } from './models/User';

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
app.use('/api/users/login', strictRateLimiter);
app.use('/api/payments/webhook', strictRateLimiter);

// Routes
app.use('/api/payments', paymentRouter);
app.use('/api/payout', payoutRouter);
app.use('/api/tournaments', tournamentRouter);
app.use('/api/leaderboard', leaderboardRouter);

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

// Basic Auth/User Registration Route
app.post('/api/users/login', async (req, res) => {
  const { phone, username } = req.body;
  if (!phone || !username) {
    return res.status(400).json({ error: 'Phone and username are required' });
  }

  // Indian phone validation (10 digits starting with 6-9, optional 91/+91 prefix)
  const phoneRegex = /^(?:\+91|91)?[6789]\d{9}$/;
  if (!phoneRegex.test(phone.trim())) {
    return res.status(400).json({ error: 'Invalid Indian phone number. Please enter a valid 10-digit number starting with 6, 7, 8, or 9 (with optional +91/91 prefix).' });
  }

  try {
    let user = await User.findOne({ phone });
    if (!user) {
      user = new User({ phone, username });
      await user.save();
    }

    // Sign JWT access token on login
    const token = jwt.sign(
      { userId: user._id.toString(), username: user.username },
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
    initializeSocketIO(server);

    server.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();
