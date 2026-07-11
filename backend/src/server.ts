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
import { getDailyProgress } from './services/challengeTracker';
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

// Basic Auth/User Registration Route
app.post('/api/users/login', async (req, res) => {
  const { phone, username } = req.body;
  if (!phone || !username) {
    return res.status(400).json({ error: 'Phone and username are required' });
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
