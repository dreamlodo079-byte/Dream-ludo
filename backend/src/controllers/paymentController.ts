import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { runInTransaction } from '../config/db';
import { Transaction, TransactionType, TransactionStatus } from '../models/Transaction';
import { User } from '../models/User';
import { Types } from 'mongoose';
import { joinQueue } from '../services/matchmaker';

export const paymentRouter = Router();

// Gateway Webhook Verification Secret
const WEBHOOK_SECRET = process.env.PAYMENT_WEBHOOK_SECRET || 'super_secret_gateway_key';

/**
 * Endpoint '/api/payments/webhook'
 * Receives payment status from gateways like UPI Intent, Paykun, or Easebuzz
 */
paymentRouter.post('/webhook', async (req: Request, res: Response) => {
  const signature = req.headers['x-gateway-signature'] as string;
  const payload = req.body;

  if (!signature) {
    return res.status(400).json({ error: 'Missing gateway signature' });
  }

  // 1. Cryptographic signature check to ensure payload authenticity using raw body string
  const rawBody = (req as any).rawBody || JSON.stringify(payload);
  const expectedSignature = crypto
    .createHmac('sha256', WEBHOOK_SECRET)
    .update(rawBody)
    .digest('hex');

  if (signature !== expectedSignature) {
    console.warn('Invalid webhook signature detected');
    return res.status(401).json({ error: 'Unauthorized signature payload' });
  }

  const { userId, transactionId, amount, status } = payload;
  
  if (!userId || !transactionId || !amount || !status) {
    return res.status(400).json({ error: 'Missing required payload parameters' });
  }

  try {
    // 2. Perform atomic ledger update inside Mongoose session transaction
    const result = await runInTransaction(async (session) => {
      // Check for duplicate transaction to guarantee idempotency
      const duplicateTxn = await Transaction.findOne({ referenceId: transactionId }).session(session);
      if (duplicateTxn) {
        if (duplicateTxn.status === TransactionStatus.SUCCESS) {
          return { success: true, message: 'Transaction already processed successfully' };
        }
        // Update pending status if state has changed
        if (status === 'SUCCESS') {
          duplicateTxn.status = TransactionStatus.SUCCESS;
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

      // Create new transaction row
      const depositTxn = new Transaction({
        userId: new Types.ObjectId(userId),
        amount: Number(amount),
        type: TransactionType.DEPOSIT,
        status: status === 'SUCCESS' ? TransactionStatus.SUCCESS : TransactionStatus.FAILED,
        referenceId: transactionId,
      });

      await depositTxn.save({ session });
      return { success: true, message: 'Deposit ledger record created successfully' };
    });

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
    const upiIntentString = `upi://pay?pa=sexusplatform@bank&pn=SexusPlatform&am=${amount}&tr=${transactionId}&cu=INR`;

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
  const { userId, username, socketId, entryFee } = req.body;

  if (!userId || !username || !socketId || !entryFee) {
    return res.status(400).json({ error: 'Missing parameters' });
  }

  try {
    const result = await joinQueue(userId, username, socketId, Number(entryFee));
    return res.json(result);
  } catch (error: any) {
    console.error('Matchmaking join request error:', error);
    return res.status(500).json({ error: error.message });
  }
});
