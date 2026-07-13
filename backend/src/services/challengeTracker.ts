import { getRedisClient } from '../config/redis';
import { runInTransaction } from '../config/db';
import { Transaction, TransactionType, TransactionStatus } from '../models/Transaction';
import { Types } from 'mongoose';

export const DAILY_TARGET = 10;
export const REWARD_AMOUNT = 50; // ₹50 reward credit for playing 10 games

/**
 * Utility to get current YYYY-MM-DD date string.
 */
export const getTodayKeySuffix = (): string => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * Increments match count for a user in Redis.
 * Triggered automatically on server authoritative match completion.
 */
export const trackDailyMatch = async (userId: string): Promise<void> => {
  const redis = getRedisClient();
  if (!redis) return;

  const dateSuffix = getTodayKeySuffix();
  const redisKey = `challenges:${userId}:date:${dateSuffix}`;

  try {
    // Increment count in Redis
    const currentCount = await redis.incr(redisKey);
    
    // Set 48 hour expiry on key to keep Redis clean
    if (currentCount === 1) {
      await redis.expire(redisKey, 172800);
    }

    console.log(`User ${userId} daily match progress: ${currentCount}/${DAILY_TARGET}`);
  } catch (error) {
    console.error(`Failed to track daily match challenges for user ${userId}:`, error);
  }
};

/**
 * Returns current challenge progress for a user (count, target, reward)
 * Checked against the ledger to determine if already claimed today
 */
export const getDailyProgress = async (
  userId: string
): Promise<{ count: number; target: number; reward: number; isCompleted: boolean }> => {
  const redis = getRedisClient();
  const dateSuffix = getTodayKeySuffix();
  const referenceId = `reward_daily_${userId}_${dateSuffix}`;

  try {
    // Query double-entry ledger to see if reward already claimed
    const existingTxn = await Transaction.findOne({ 
      userId: new Types.ObjectId(userId),
      referenceId 
    });
    const isCompleted = !!existingTxn;

    let count = 0;
    if (redis) {
      const rawVal = await redis.get(`challenges:${userId}:date:${dateSuffix}`);
      count = rawVal ? parseInt(rawVal, 10) : 0;
    }

    return {
      count,
      target: DAILY_TARGET,
      reward: REWARD_AMOUNT,
      isCompleted,
    };
  } catch (err) {
    console.error('Error fetching daily challenge progress:', err);
    return { count: 0, target: DAILY_TARGET, reward: REWARD_AMOUNT, isCompleted: false };
  }
};

/**
 * Claims reward for completed daily challenge
 */
export const claimDailyReward = async (
  userId: string
): Promise<{ success: boolean; reward: number; message: string }> => {
  return await runInTransaction(async (session) => {
    const progress = await getDailyProgress(userId);
    if (progress.count < progress.target) {
      throw new Error(`Objective criteria not met yet: ${progress.count}/${progress.target} matches played.`);
    }
    if (progress.isCompleted) {
      throw new Error('Daily challenge reward has already been claimed for today.');
    }

    const dateSuffix = getTodayKeySuffix();
    const referenceId = `reward_daily_${userId}_${dateSuffix}`;

    const rewardTxn = new Transaction({
      userId: new Types.ObjectId(userId),
      amount: REWARD_AMOUNT,
      type: TransactionType.WINNINGS,
      status: TransactionStatus.SUCCESS,
      referenceId,
    });

    await rewardTxn.save({ session });
    return {
      success: true,
      reward: REWARD_AMOUNT,
      message: `Reward of ₹${REWARD_AMOUNT} credited to winnings balance successfully.`,
    };
  });
};
