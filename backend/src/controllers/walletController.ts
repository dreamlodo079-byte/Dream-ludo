import { Router, Request, Response } from 'express';
import { runInTransaction } from '../config/db';
import { Transaction, TransactionType, TransactionStatus } from '../models/Transaction';
import { User } from '../models/User';
import { Notification } from '../models/Notification';
import { getIO } from '../services/socketManager';
import { Types } from 'mongoose';
import { getOrCreatePlatformConfig } from '../models/PlatformConfig';

export const walletRouter = Router();

/**
 * GET /api/v1/wallet/config
 * Returns current platform UPI ID and QR code URL
 */
walletRouter.get(['/config', '/v1/wallet/config'], async (_req: Request, res: Response) => {
  try {
    const config = await getOrCreatePlatformConfig();
    return res.json({
      success: true,
      platformUpiId: config.platformUpiId,
      platformQrUrl: config.platformQrUrl || '',
    });
  } catch (error: any) {
    console.error('Error fetching wallet config:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * 1. POST /api/v1/wallet/deposit/request
 * Automated Instant Deposit: Automatically verifies and credits user deposit balance instantly (No admin verification required)
 */
walletRouter.post(['/deposit/request', '/v1/wallet/deposit/request'], async (req: Request, res: Response) => {
  const { userId, amount, utr } = req.body;

  if (!userId || !amount) {
    return res.status(400).json({ error: 'userId and amount are required parameters.' });
  }

  const numAmount = Number(amount);
  if (isNaN(numAmount) || numAmount <= 0) {
    return res.status(400).json({ error: 'Deposit amount must be a positive number.' });
  }

  const cleanUtr = utr ? String(utr).trim() : `INSTANT_${Date.now()}`;

  try {
    const referenceId = `dep_auto_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    const { depositTxn, updatedUser, notification } = await runInTransaction(async (session) => {
      const user = await User.findById(userId).session(session);
      if (!user) {
        throw new Error('User not found');
      }

      // If UTR is provided, check for existing duplicate
      if (utr) {
        const existingTxn = await Transaction.findOne({ utr: cleanUtr }).session(session);
        if (existingTxn) {
          throw new Error(`UTR reference ${cleanUtr} has already been processed.`);
        }
      }

      // 1. We no longer credit instantly for manual UTR submissions
      // Wait for admin approval or webhook
      // user.depositBalance = (user.depositBalance || 0) + numAmount;
      // await user.save({ session });

      // 2. Create PENDING Transaction record
      const txn = new Transaction({
        userId: new Types.ObjectId(userId),
        amount: numAmount,
        type: TransactionType.DEPOSIT,
        status: TransactionStatus.PENDING,
        referenceId,
        utr: cleanUtr,
      });
      await txn.save({ session });

      // 3. Create Notification record
      const notif = new Notification({
        userId: new Types.ObjectId(userId),
        title: 'Deposit Pending Verification 🕒',
        message: `₹${numAmount.toFixed(2)} deposit requested. Pending admin verification.`,
        type: 'DEPOSIT_PENDING',
        isRead: false,
      });
      await notif.save({ session });

      return { depositTxn: txn, updatedUser: user, notification: notif };
    });

    // 4. Real-time WebSocket notification emission
    try {
      const io = getIO();
      if (io) {
        io.to(`user:${userId}`).emit('DEPOSIT_PENDING', {
          transactionId: depositTxn._id,
          amount: numAmount,
          userId,
        });

        io.to(`user:${userId}`).emit('NOTIFICATION_RECEIVED', {
          userId,
          notification,
        });

        io.to(`user:${userId}`).emit('WALLET_UPDATE', {
          userId,
          depositBalance: updatedUser.depositBalance,
          winningsBalance: updatedUser.winningsBalance,
          bonusBalance: updatedUser.bonusBalance,
          walletBalance: updatedUser.walletBalance,
        });
      }
    } catch (wsErr) {
      console.warn('Socket notification emit notice:', wsErr);
    }

    return res.json({
      success: true,
      message: `Deposit of ₹${numAmount.toFixed(2)} requested successfully. Awaiting admin verification!`,
      transaction: depositTxn,
      user: {
        _id: updatedUser._id,
        walletBalance: updatedUser.walletBalance,
        depositBalance: updatedUser.depositBalance,
        winningsBalance: updatedUser.winningsBalance,
        bonusBalance: updatedUser.bonusBalance,
      },
    });
  } catch (error: any) {
    console.error('Error processing instant deposit:', error);
    return res.status(400).json({ error: error.message || 'Deposit failed' });
  }
});

/**
 * 2. POST /api/v1/wallet/withdraw/request
 * Submits a manual withdrawal request, locking funds until admin processes it
 */
walletRouter.post(['/withdraw/request', '/v1/wallet/withdraw/request'], async (req: Request, res: Response) => {
  const { userId, amount, upiId } = req.body;

  if (!userId || !amount || !upiId) {
    return res.status(400).json({ error: 'userId, amount, and upiId are required parameters.' });
  }

  const withdrawAmount = Number(amount);
  if (isNaN(withdrawAmount) || withdrawAmount <= 0) {
    return res.status(400).json({ error: 'Withdrawal amount must be a positive number.' });
  }

  const cleanUpi = String(upiId).trim();

  try {
    const referenceId = `wd_req_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    const transaction = await runInTransaction(async (session) => {
      const user = await User.findById(userId).session(session);
      if (!user) {
        throw new Error('User not found');
      }

      const totalAvailable = user.winningsBalance || 0;
      if (totalAvailable < withdrawAmount) {
        throw new Error(`Insufficient winnings balance. Available: ₹${totalAvailable}`);
      }

      user.winningsBalance = (user.winningsBalance || 0) - withdrawAmount;
      user.lockedBalance = (user.lockedBalance || 0) + withdrawAmount;
      await user.save({ session });

      const txn = new Transaction({
        userId: new Types.ObjectId(userId),
        amount: withdrawAmount,
        type: TransactionType.WITHDRAWAL,
        status: TransactionStatus.PENDING,
        referenceId,
        paymentAddress: cleanUpi,
      });

      await txn.save({ session });

      const notif = new Notification({
        userId: new Types.ObjectId(userId),
        title: 'Withdrawal Request Submitted',
        message: `Your withdrawal request of ₹${withdrawAmount} via UPI (${cleanUpi}) is under review.`,
        type: 'WITHDRAWAL_SUCCESS',
        isRead: false,
      });
      await notif.save({ session });

      return txn;
    });

    return res.json({
      success: true,
      message: 'Withdrawal request submitted successfully',
      transaction,
    });
  } catch (error: any) {
    console.error('Error submitting withdrawal request:', error);
    return res.status(400).json({ error: error.message });
  }
});

/**
 * GET /api/v1/wallet/referrals/:userId
 * Returns detailed referral metrics, earnings, and transaction history
 */
walletRouter.get(['/referrals/:userId', '/v1/wallet/referrals/:userId'], async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const txns = await Transaction.find({
      userId: user._id,
      type: { $in: [TransactionType.REFERRAL_BONUS_CREDIT, TransactionType.REFERRAL_COMMISSION] },
      status: TransactionStatus.SUCCESS,
    }).sort({ createdAt: -1 }).limit(100);

    let totalSignupBonus = 0;
    let totalWinningsCommission = 0;

    const history = txns.map((t) => {
      if (t.type === TransactionType.REFERRAL_BONUS_CREDIT) {
        totalSignupBonus += t.amount;
      } else if (t.type === TransactionType.REFERRAL_COMMISSION) {
        totalWinningsCommission += t.amount;
      }

      return {
        _id: t._id,
        amount: t.amount,
        type: t.type === TransactionType.REFERRAL_BONUS_CREDIT ? 'SIGNUP_BONUS' : 'LIFETIME_COMMISSION',
        title: t.type === TransactionType.REFERRAL_BONUS_CREDIT ? '🎁 Instant Signup Reward' : '👑 2% Winnings Commission',
        description: t.type === TransactionType.REFERRAL_BONUS_CREDIT 
          ? '₹10 Instant bonus credited for friend signup' 
          : '2% Lifetime match win commission credited',
        date: t.createdAt,
      };
    });

    const friendsJoined = user.friendsJoined || 0;
    const totalEarnings = Math.round((totalSignupBonus + totalWinningsCommission) * 100) / 100;

    return res.json({
      success: true,
      referralCode: user.referralCode,
      friendsJoined,
      totalSignupBonus: Math.round(totalSignupBonus * 100) / 100,
      totalWinningsCommission: Math.round(totalWinningsCommission * 100) / 100,
      totalEarnings,
      history,
    });
  } catch (error: any) {
    console.error('Error fetching referral history:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});
