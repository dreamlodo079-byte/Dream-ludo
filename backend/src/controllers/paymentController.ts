import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { runInTransaction } from '../config/db';
import { Transaction, TransactionType, TransactionStatus } from '../models/Transaction';
import { User } from '../models/User';
import { Match, MatchStatus } from '../models/Match';
import { Types } from 'mongoose';
import { joinQueue, leaveQueue } from '../services/matchmaker';
import { getIO } from '../services/socketManager';
import { calculateCommission, validateEntryFee } from '../services/commissionService';

export const paymentRouter = Router();

// Gateway Webhook Verification Secret
const WEBHOOK_SECRET = process.env.PAYMENT_WEBHOOK_SECRET || 'super_secret_gateway_key';

/**
 * Headless S2S Payment Pay-in ('/api/payments/create-order' and '/api/v1/payments/create-order')
 * Calls payment/bank API to generate dynamic UPI URI (upi://pay?pa=...) and raw payload for custom native QR SVG rendering
 */
paymentRouter.post(['/create-order', '/v1/payments/create-order'], async (req: Request, res: Response) => {
  const { userId, amount, upiId } = req.body;
  const payeeVpa = upiId || process.env.UPI_PAYEE_VPA || 'dreamludoplatform@bank';

  if (!userId || !amount || Number(amount) <= 0) {
    return res.status(400).json({ error: 'Valid userId and positive amount are required' });
  }

  try {
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const transactionId = `ord_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const payeeName = process.env.UPI_PAYEE_NAME || 'DreamLudo Platform';
    const upiUri = `upi://pay?pa=${encodeURIComponent(payeeVpa)}&pn=${encodeURIComponent(payeeName)}&am=${amount}&tr=${transactionId}&cu=INR`;

    // Log PENDING deposit transaction in ledger
    const pendingTxn = new Transaction({
      userId: new Types.ObjectId(userId),
      amount: Number(amount),
      type: TransactionType.DEPOSIT,
      status: TransactionStatus.PENDING,
      referenceId: transactionId,
    });
    await pendingTxn.save();

    const rawPayload = {
      pa: payeeVpa,
      pn: payeeName,
      am: Number(amount),
      tr: transactionId,
      cu: 'INR',
      upiUri,
    };

    return res.json({
      success: true,
      orderId: transactionId,
      transactionId,
      upiUri,
      amount: Number(amount),
      rawPayload,
      message: 'Payment order created successfully',
    });
  } catch (error: any) {
    console.error('Failed to create payment order:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * Server-Side Match Creation Endpoint ('/api/payments/matches/create' and '/api/v1/matches/create')
 * Recalculates platform fee and winner payout server-side using commissionService.
 * Validates minimum entry (₹1) and maximum cap (₹10,000).
 */
paymentRouter.post(['/matches/create', '/v1/matches/create'], async (req: Request, res: Response) => {
  const { creatorId, entryFee } = req.body;

  if (!creatorId || entryFee === undefined) {
    return res.status(400).json({ error: 'creatorId and entryFee are required' });
  }

  const numFee = Number(entryFee);
  const validation = validateEntryFee(numFee);
  if (!validation.valid) {
    return res.status(400).json({ error: validation.message });
  }

  // Recalculate platform fee and winner payout strictly server-side using commissionService
  const breakdown = calculateCommission(numFee);

  try {
    const creator = await User.findById(creatorId);
    if (!creator) {
      return res.status(404).json({ error: 'Creator user not found' });
    }

    const matchId = `match_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const newMatch = new Match({
      matchId,
      creatorId: new Types.ObjectId(creatorId),
      entryFee: breakdown.entryFee,
      platformFee: breakdown.platformFee,
      winnerPayout: breakdown.winnerPayout,
      status: MatchStatus.WAITING,
    });

    await newMatch.save();

    return res.json({
      success: true,
      match: newMatch,
      commission: breakdown,
    });
  } catch (error: any) {
    console.error('Match creation error:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * Webhook Handler ('/api/payments/webhook' and '/api/v1/payments/webhook')
 * Validates HMAC signature, checks duplicate utr, safely credits walletBalance, and emits PAYMENT_SUCCESS Socket.IO event.
 */
paymentRouter.post(['/webhook', '/v1/payments/webhook'], async (req: Request, res: Response) => {
  const signature = req.headers['x-gateway-signature'] as string;
  const payload = req.body;

  if (!signature && process.env.NODE_ENV === 'production') {
    return res.status(400).json({ error: 'Missing gateway signature' });
  }

  // 1. Cryptographic HMAC signature check to ensure payload authenticity
  if (signature) {
    const rawBody = (req as any).rawBody || JSON.stringify(payload);
    const expectedSignature = crypto
      .createHmac('sha256', WEBHOOK_SECRET)
      .update(rawBody)
      .digest('hex');

    if (signature !== expectedSignature) {
      console.warn('Invalid webhook signature detected');
      return res.status(401).json({ error: 'Unauthorized signature payload' });
    }
  }

  const { userId, transactionId, utr, amount, status } = payload;
  
  if (!userId || !transactionId || !amount || !status) {
    return res.status(400).json({ error: 'Missing required payload parameters' });
  }

  try {
    // 2. Perform atomic ledger update inside Mongoose session transaction
    const result = await runInTransaction(async (session) => {
      // Check for duplicate transaction or duplicate UTR in MongoDB to guarantee idempotency
      const query = utr ? { $or: [{ referenceId: transactionId }, { utr }] } : { referenceId: transactionId };
      const duplicateTxn = await Transaction.findOne(query).session(session);
      
      if (duplicateTxn) {
        if (duplicateTxn.status === TransactionStatus.SUCCESS) {
          return { success: true, message: 'Transaction already processed successfully' };
        }
        if (status === 'SUCCESS') {
          duplicateTxn.status = TransactionStatus.SUCCESS;
          if (utr) duplicateTxn.utr = utr;
          await duplicateTxn.save({ session });
          return { success: true, message: 'Transaction status updated to SUCCESS' };
        }
        return { success: true, message: 'Transaction duplicate and state remains unchanged' };
      }

      // Check if user exists
      const user = await User.findById(userId).session(session);
      if (!user) {
        throw new Error(`User with ID ${userId} does not exist`);
      }

      // Create new deposit transaction record
      const depositTxn = new Transaction({
        userId: new Types.ObjectId(userId),
        amount: Number(amount),
        type: TransactionType.DEPOSIT,
        status: status === 'SUCCESS' ? TransactionStatus.SUCCESS : TransactionStatus.FAILED,
        referenceId: transactionId,
        utr: utr || undefined,
      });

      await depositTxn.save({ session });
      return { success: true, message: 'Deposit ledger record created successfully' };
    });

    // 3. Emit real-time PAYMENT_SUCCESS Socket.IO event to client socket upon payment confirmation
    if (status === 'SUCCESS') {
      try {
        const io = getIO();
        if (io) {
          io.emit('PAYMENT_SUCCESS', {
            userId,
            amount: Number(amount),
            transactionId,
            utr: utr || transactionId,
            status: 'SUCCESS',
            timestamp: Date.now(),
          });
          console.log(`Emitted PAYMENT_SUCCESS event for user ${userId}, amount ₹${amount}`);
        }
      } catch (wsErr) {
        console.error('Failed to broadcast PAYMENT_SUCCESS Socket.IO event:', wsErr);
      }
    }

    return res.status(200).json(result);
  } catch (error: any) {
    console.error('Webhook processing failed:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * Route to generate a mock payment intent (useful for mobile frontends to initiate deposits).
 */
paymentRouter.post('/create-intent', async (req: Request, res: Response) => {
  const { userId, amount } = req.body;

  if (!userId || !amount) {
    return res.status(400).json({ error: 'UserId and amount are required' });
  }

  try {
    const transactionId = `txn_${Date.now()}_${Math.floor(Math.random() * 100000)}`;

    // Create a PENDING transaction row to log intent start
    const pendingTxn = new Transaction({
      userId: new Types.ObjectId(userId),
      amount: Number(amount),
      type: TransactionType.DEPOSIT,
      status: TransactionStatus.PENDING,
      referenceId: transactionId,
    });

    await pendingTxn.save();

    // In a real application, you would generate a gateway payload here.
    // For convenience in testing/demos, we return the payment URL/UPI string.
    const upiIntentString = `upi://pay?pa=dreamludoplatform@bank&pn=DreamLudoPlatform&am=${amount}&tr=${transactionId}&cu=INR`;

    return res.json({
      success: true,
      transactionId,
      upiIntent: upiIntentString,
      message: 'Pending deposit intent created successfully',
    });
  } catch (error: any) {
    console.error('Failed to create payment intent:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * Developer sandbox helper to simulate webhook completion
 */
paymentRouter.post('/simulate-success', async (req: Request, res: Response) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({ error: 'Sandbox simulation endpoints are disabled in production.' });
  }

  const { userId, transactionId, amount } = req.body;
  if (!userId || !transactionId || !amount) {
    return res.status(400).json({ error: 'Missing parameters' });
  }

  try {
    const result = await runInTransaction(async (session) => {
      const duplicateTxn = await Transaction.findOne({ referenceId: transactionId }).session(session);
      if (duplicateTxn) {
        duplicateTxn.status = TransactionStatus.SUCCESS;
        await duplicateTxn.save({ session });
        return { success: true, message: 'Transaction duplicate updated to SUCCESS' };
      }

      const depositTxn = new Transaction({
        userId: new Types.ObjectId(userId),
        amount: Number(amount),
        type: TransactionType.DEPOSIT,
        status: TransactionStatus.SUCCESS,
        referenceId: transactionId,
      });

      await depositTxn.save({ session });
      return { success: true, message: 'Deposit ledger record created successfully via simulation' };
    });

    return res.json(result);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/payments/admin/resolve-dispute
 * Protected explicitly by 'x-admin-key' validation.
 * Accepts transactionReferenceId, queries ledger, if PENDING updates to SUCCESS.
 */
paymentRouter.post('/admin/resolve-dispute', async (req: Request, res: Response) => {
  const adminKey = req.headers['x-admin-key'] as string;
  const ADMIN_API_KEY = process.env.ADMIN_API_KEY || 'master_admin_secret_key';

  if (adminKey !== ADMIN_API_KEY) {
    return res.status(401).json({ error: 'Unauthorized admin access' });
  }

  const { transactionReferenceId } = req.body;
  if (!transactionReferenceId) {
    return res.status(400).json({ error: 'transactionReferenceId parameter is required' });
  }

  try {
    const result = await runInTransaction(async (session) => {
      const txn = await Transaction.findOne({ referenceId: transactionReferenceId }).session(session);
      if (!txn) {
        throw new Error(`Transaction with reference ID ${transactionReferenceId} not found`);
      }

      if (txn.status !== TransactionStatus.PENDING) {
        throw new Error(`Transaction is already resolved with status ${txn.status}`);
      }

      txn.status = TransactionStatus.SUCCESS;
      await txn.save({ session });

      return {
        success: true,
        message: 'Transaction dispute resolved successfully. Ledger updated to SUCCESS.',
        transaction: txn,
      };
    });

    return res.json(result);
  } catch (error: any) {
    console.error('Dispute resolution error:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * Route to trigger matchmaking joining for clients
 */
paymentRouter.post('/matchmaker/join', async (req: Request, res: Response) => {
  const { userId, username, socketId, entryFee, roomCode, passcode, mode, customRules } = req.body;

  if (!userId || !username || !socketId || !entryFee) {
    return res.status(400).json({ error: 'Missing parameters' });
  }

  try {
    const result = await joinQueue(
      userId,
      username,
      socketId,
      Number(entryFee),
      roomCode,
      passcode,
      mode,
      customRules
    );
    return res.json(result);
  } catch (error: any) {
    console.error('Matchmaking join request error:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * Route to cancel matchmaking queue and refund entry fee
 */
paymentRouter.post('/matchmaker/leave', async (req: Request, res: Response) => {
  const { userId } = req.body;
  if (!userId) {
    return res.status(400).json({ error: 'UserId is required' });
  }

  try {
    const result = await leaveQueue(userId);
    return res.json(result);
  } catch (error: any) {
    console.error('Matchmaking leave request error:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * Route to check a user's current matchmaking status
 */
paymentRouter.get('/matchmaker/status/:userId', async (req: Request, res: Response) => {
  const { userId } = req.params;
  const { getRedisClient } = require('../config/redis');
  const redis = getRedisClient();
  if (!redis) {
    return res.status(500).json({ error: 'Redis not available' });
  }

  try {
    const allKeys = await redis.keys('queue:tier_*_mode_*');
    for (const key of allKeys) {
      const queue = await redis.lRange(key, 0, -1);
      for (const item of queue) {
        const player = JSON.parse(item);
        if (player.userId === userId) {
          const match = key.match(/^queue:tier_(\d+)_mode_(QUICK|REGULAR)$/);
          const tier = match ? parseInt(match[1], 10) : 10;
          const mode = match ? match[2] : 'REGULAR';
          return res.json({
            success: true,
            status: 'WAITING',
            tier,
            mode,
            joinedAt: player.joinedAt
          });
        }
      }
    }
    return res.json({ success: true, status: 'IDLE' });
  } catch (error: any) {
    console.error('Matchmaking status query error:', error);
    return res.status(500).json({ error: error.message });
  }
});
