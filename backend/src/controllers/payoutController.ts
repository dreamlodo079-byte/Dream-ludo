import { Router, Request, Response } from 'express';
import axios from 'axios';
import { runInTransaction } from '../config/db';
import { Transaction, TransactionType, TransactionStatus, getUserBalances } from '../models/Transaction';
import { User } from '../models/User';
import { Types } from 'mongoose';

export const payoutRouter = Router();

// Business banking payout credentials (Cashfree Payouts / RazorpayX)
const PAYOUT_CLIENT_ID = process.env.PAYMENT_CLIENT_ID || 'mock_payout_client_id';
const PAYOUT_CLIENT_SECRET = process.env.PAYMENT_CLIENT_SECRET || 'mock_payout_client_secret';
const PAYOUT_API_URL = process.env.PAYOUT_API_URL || 'https://payout-api.cashfree.com/payout/v1'; // Cashfree example
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || 'master_admin_secret_key';

// Fixed ID for platform/system profits ledger
const PLATFORM_USER_ID = '000000000000000000000000';

/**
 * Endpoint '/api/payout/withdraw'
 * Single-Tap User Payout Engine
 */
payoutRouter.post('/withdraw', async (req: Request, res: Response) => {
  const { userId, amount, upiId } = req.body;

  if (!userId || !amount || !upiId) {
    return res.status(400).json({ error: 'UserId, amount, and upiId are required' });
  }

  const withdrawAmount = Number(amount);
  if (withdrawAmount <= 0) {
    return res.status(400).json({ error: 'Withdrawal amount must be greater than zero' });
  }

  const referenceId = `payout_${Date.now()}_${userId}_${Math.floor(Math.random() * 1000)}`;

  try {
    // 1. Double-Entry ledger validation and locking funds
    const lockedTxnId = await runInTransaction(async (session) => {
      // Fetch user balances from ledger
      const balances = await getUserBalances(userId);
      if (balances.winnings < withdrawAmount) {
        throw new Error('Insufficient winnings balance to perform withdrawal');
      }

      const user = await User.findById(userId).session(session);
      if (!user) {
        throw new Error('User not found');
      }

      // Record a PENDING DEBIT row to lock the funds
      const pendingDebitTxn = new Transaction({
        userId: new Types.ObjectId(userId),
        amount: -withdrawAmount, // Negative to represent withdrawal debit
        type: TransactionType.WITHDRAWAL,
        status: TransactionStatus.PENDING,
        referenceId,
      });

      await pendingDebitTxn.save({ session });
      return pendingDebitTxn._id;
    });

    // 2. Dispatch bank IMPS wire transfer via Payment Payout SDK
    console.log(`Dispatching bank payout request for ${withdrawAmount} to UPI ID ${upiId}`);
    const payoutResponse = await dispatchBankPayout({
      referenceId,
      amount: withdrawAmount,
      upiId,
      purpose: 'Winnings Withdrawal',
    });

    // 3. Update ledger status based on payout response
    const finalStatus = payoutResponse.success ? TransactionStatus.SUCCESS : TransactionStatus.FAILED;

    await Transaction.findByIdAndUpdate(lockedTxnId, {
      status: finalStatus,
    });

    if (finalStatus === TransactionStatus.FAILED) {
      return res.status(500).json({
        success: false,
        error: 'Payout gateway failed. Funds have been credited back.',
        details: payoutResponse.message,
      });
    }

    return res.json({
      success: true,
      message: 'Withdrawal settled into bank account within 3 seconds.',
      referenceId,
    });
  } catch (error: any) {
    console.error('Withdrawal error:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * Endpoint '/api/payout/clear-commissions'
 * One-Tap Admin Settlement
 */
payoutRouter.post('/clear-commissions', async (req: Request, res: Response) => {
  const adminKey = req.headers['x-admin-key'] as string;
  const { adminUpiId } = req.body;

  if (adminKey !== ADMIN_API_KEY) {
    return res.status(401).json({ error: 'Unauthorized admin access' });
  }

  if (!adminUpiId) {
    return res.status(400).json({ error: 'Admin UPI ID is required for settlement' });
  }

  const referenceId = `admin_clear_${Date.now()}`;

  try {
    const lockedTxnId = await runInTransaction(async (session) => {
      // Calculate total platform commissions in ledger
      const balanceDetails = await getUserBalances(PLATFORM_USER_ID);
      const totalCommission = balanceDetails.total; // Sum of platform commissions minus withdrawals

      if (totalCommission <= 0) {
        throw new Error('No accumulated platform commissions to withdraw');
      }

      // Record a PENDING DEBIT row for the Platform User
      const adminDebitTxn = new Transaction({
        userId: new Types.ObjectId(PLATFORM_USER_ID),
        amount: -totalCommission,
        type: TransactionType.WITHDRAWAL,
        status: TransactionStatus.PENDING,
        referenceId,
      });

      await adminDebitTxn.save({ session });
      return { txnId: adminDebitTxn._id, amount: totalCommission };
    });

    console.log(`Clearing ${lockedTxnId.amount} commission profits to admin UPI ID ${adminUpiId}`);
    const payoutResponse = await dispatchBankPayout({
      referenceId,
      amount: lockedTxnId.amount,
      upiId: adminUpiId,
      purpose: 'Admin Commission Settlement',
    });

    const finalStatus = payoutResponse.success ? TransactionStatus.SUCCESS : TransactionStatus.FAILED;

    await Transaction.findByIdAndUpdate(lockedTxnId.txnId, {
      status: finalStatus,
    });

    if (finalStatus === TransactionStatus.FAILED) {
      return res.status(500).json({
        success: false,
        error: 'Commission settlement failed.',
        details: payoutResponse.message,
      });
    }

    return res.json({
      success: true,
      message: 'Admin commission settlement cleared to bank account.',
      clearedAmount: lockedTxnId.amount,
      referenceId,
    });
  } catch (error: any) {
    console.error('Commission settlement error:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * Endpoint '/api/payout/admin/summary'
 * Secure endpoint giving platform analytics to the admin
 */
payoutRouter.get('/admin/summary', async (req: Request, res: Response) => {
  const adminKey = req.headers['x-admin-key'] as string;
  if (adminKey !== ADMIN_API_KEY) {
    return res.status(401).json({ error: 'Unauthorized admin access' });
  }

  try {
    const totalUsers = await User.countDocuments();
    
    // Net platforms commissions
    const platformBalances = await getUserBalances(PLATFORM_USER_ID);
    
    // Aggregation of total deposits
    const depositsAgg = await Transaction.aggregate([
      { $match: { type: TransactionType.DEPOSIT, status: TransactionStatus.SUCCESS } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);
    const totalDeposits = depositsAgg[0]?.total || 0;

    // Aggregation of total user withdrawals (excluding admin/platform payouts)
    const userWithdrawalsAgg = await Transaction.aggregate([
      { 
        $match: { 
          type: TransactionType.WITHDRAWAL, 
          status: TransactionStatus.SUCCESS, 
          userId: { $ne: new Types.ObjectId(PLATFORM_USER_ID) } 
        } 
      },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);
    const totalUserWithdrawals = Math.abs(userWithdrawalsAgg[0]?.total || 0);

    return res.json({
      success: true,
      summary: {
        totalUsers,
        totalCommissions: platformBalances.total,
        totalDeposits,
        totalUserWithdrawals,
      }
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// Helper for Fetching Wallet Details (used by Client useWallet hook)
payoutRouter.get('/balance/:userId', async (req, res) => {
  const { userId } = req.params;
  try {
    const balances = await getUserBalances(userId);
    const history = await Transaction.find({ userId: new Types.ObjectId(userId) }).sort({ createdAt: -1 });
    return res.json({
      success: true,
      balances,
      history,
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

/**
 * Programmatic interface connecting to corporate banking payout endpoint.
 * Demonstrates a production-grade Axios integration mapping Cashfree payouts.
 */
async function dispatchBankPayout(params: {
  referenceId: string;
  amount: number;
  upiId: string;
  purpose: string;
}): Promise<{ success: boolean; message: string }> {
  // If sandbox or mock credentials, simulate instant wire transfer
  if (PAYOUT_CLIENT_ID === 'mock_payout_client_id') {
    await new Promise((resolve) => setTimeout(resolve, 1000)); // Simulate bank lag
    return { success: true, message: 'Mock transfer successful' };
  }

  try {
    const response = await axios.post(
      `${PAYOUT_API_URL}/requestTransfer`,
      {
        transferId: params.referenceId,
        amount: params.amount,
        transferMode: 'UPI',
        upiId: params.upiId,
        remarks: params.purpose,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Client-Id': PAYOUT_CLIENT_ID,
          'X-Client-Secret': PAYOUT_CLIENT_SECRET,
        },
      }
    );

    if (response.data.status === 'SUCCESS') {
      return { success: true, message: 'Transfer settled successfully' };
    } else {
      return { success: false, message: response.data.message || 'Transfer failed' };
    }
  } catch (error: any) {
    console.error('Error dispatching bank payout API:', error.response?.data || error.message);
    return { success: false, message: error.response?.data?.message || error.message };
  }
}
