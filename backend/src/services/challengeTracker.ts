import { getRedisClient } from '../config/redis';
import { runInTransaction } from '../config/db';
import { Transaction, TransactionType, TransactionStatus } from '../models/Transaction';
import { Types } from 'mongoose';

const DAILY_TARGET = 10;
const REWARD_AMOUNT = 50; // ₹50 reward credit for playing 10 games

/**
 * Utility to get current YYYY-MM-DD date string.
 */
const getTodayKeySuffix = (): string => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * Increments match count for a user in Redis and grants a wallet reward if threshold is met.
 * Triggered automatically on server authoritative match completion.
 */
export const trackDailyMatch = async (userId: string): Promise<void> => {
  const redis = getRedisClient();
  if (!redis) return;

  const dateSuffix = getTodayKeySuffix();
  const redisKey = `challenges:${userId}:date:${dateSuffix}`;

  try {
    // 1. Increment count in Redis
    const currentCount = await redis.incr(redisKey);
    
    // Set 48 hour expiry on key to keep Redis clean
    if (currentCount === 1) {
      await redis.expire(redisKey, 172800);
    }

    console.log(`User ${userId} daily match progress: ${currentCount}/${DAILY_TARGET}`);

    // 2. Grant reward when exactly hitting target threshold
    if (currentCount === DAILY_TARGET) {
      const referenceId = `reward_daily_${userId}_${dateSuffix}`;

      await runInTransaction(async (session) => {
        // Double check idempotency by checking if referenceId exists in database
        const existingTxn = await Transaction.findOne({ referenceId }).session(session);
        if (existingTxn) {
          console.log(`Daily challenge reward already credited for user ${userId} today`);
          return;
        }

        const rewardTxn = new Transaction({
          userId: new Types.ObjectId(userId),
          amount: REWARD_AMOUNT,
          type: TransactionType.WINNINGS,
          status: TransactionStatus.SUCCESS,
          referenceId,
        });

        await rewardTxn.save({ session });
        console.log(`Daily challenge reward of ₹${REWARD_AMOUNT} credited to user ${userId}`);
      });
    }
  } catch (error) {
    console.error(`Failed to track daily match challenges for user ${userId}:`, error);
  }
};

/**
 * Returns current challenge progress for a user (count, target, reward)
 */
export const getDailyProgress = async (
  userId: string
): Promise<{ count: number; target: number; reward: number; isCompleted: boolean }> => {
  const redis = getRedisClient();
  if (!redis) {
    return { count: 0, target: DAILY_TARGET, reward: REWARD_AMOUNT, isCompleted: false };
  }

  const dateSuffix = getTodayKeySuffix();
  const redisKey = `challenges:${userId}:date:${dateSuffix}`;

  try {
    const rawVal = await redis.get(redisKey);
    const count = rawVal ? parseInt(rawVal, 10) : 0;
    return {
      count,
      target: DAILY_TARGET,
      reward: REWARD_AMOUNT,
      isCompleted: count >= DAILY_TARGET,
    };
  } catch (err) {
    console.error('Error fetching daily challenge progress:', err);
    return { count: 0, target: DAILY_TARGET, reward: REWARD_AMOUNT, isCompleted: false };
  }
};
