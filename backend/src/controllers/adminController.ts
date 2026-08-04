import { Response } from 'express';
import { User } from '../models/User';
import { AuthenticatedRequest } from '../middleware/auth';
import { runInTransaction } from '../config/db';

export const promoteUser = async (req: AuthenticatedRequest, res: Response) => {
  const { userId } = req.body;
  if (!userId) {
    return res.status(400).json({ error: 'userId is required' });
  }

  try {
    let resultError: string | null = null;
    let updatedUser = null;

    await runInTransaction(async (session) => {
      // 1. Check current active promoters count
      const promoterCount = await User.countDocuments({ isPromoter: true }).session(session);
      if (promoterCount >= 5) {
        resultError = 'Maximum limit of 5 promoters reached. Demote an existing promoter first.';
        return;
      }

      // 2. Find and promote the user
      const user = await User.findById(userId).session(session);
      if (!user) {
        resultError = 'User not found.';
        return;
      }

      user.isPromoter = true;
      user.promoMatchState = {}; // Initialize empty dynamic match history map
      
      // Mark schema property as modified to ensure Mongoose saves the empty object correctly
      user.markModified('promoMatchState');
      
      await user.save({ session });
      updatedUser = user;
    });

    if (resultError) {
      return res.status(400).json({ error: resultError });
    }

    return res.json({
      success: true,
      message: 'User successfully promoted to Promoter status.',
      user: updatedUser,
    });
  } catch (err: any) {
    console.error('Error promoting user:', err);
    return res.status(500).json({ error: err.message });
  }
};

export const demoteUser = async (req: AuthenticatedRequest, res: Response) => {
  const { userId } = req.body;
  if (!userId) {
    return res.status(400).json({ error: 'userId is required' });
  }

  try {
    let resultError: string | null = null;
    let updatedUser = null;

    await runInTransaction(async (session) => {
      const user = await User.findById(userId).session(session);
      if (!user) {
        resultError = 'User not found.';
        return;
      }

      user.isPromoter = false;
      user.promoMatchState = undefined; // unset/purge the promoMatchState map property

      await user.save({ session });
      updatedUser = user;
    });

    if (resultError) {
      return res.status(400).json({ error: resultError });
    }

    return res.json({
      success: true,
      message: 'User successfully demoted to regular status.',
      user: updatedUser,
    });
  } catch (err: any) {
    console.error('Error demoting user:', err);
    return res.status(500).json({ error: err.message });
  }
};

export const getUsers = async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const PLATFORM_USER_ID = '000000000000000000000000';
    const users = await User.find({
      _id: { $ne: PLATFORM_USER_ID },
      username: { $ne: 'Platform Profits' }
    })
      .select('_id username phone isPromoter kycStatus createdAt')
      .sort({ createdAt: -1 });

    const promoterCount = await User.countDocuments({ isPromoter: true });

    return res.json({
      success: true,
      users,
      promoterCount,
    });
  } catch (err: any) {
    console.error('Error fetching admin users:', err);
    return res.status(500).json({ error: err.message });
  }
};
