import { Router, Request, Response } from 'express';
import { Transaction, TransactionType, TransactionStatus } from '../models/Transaction';
import { PipelineStage } from 'mongoose';

export const leaderboardRouter = Router();

/**
 * GET /api/leaderboard
 * Returns the top 50 users filterable by time frames: 'all-time', 'this-month' (last 30 days), 'this-week' (last 7 days).
 */
leaderboardRouter.get('/', async (req: Request, res: Response) => {
  const timeframe = (req.query.timeframe as string) || 'all-time';

  try {
    const matchFilter: any = {
      type: TransactionType.WINNINGS,
      status: TransactionStatus.SUCCESS,
    };

    const now = new Date();

    if (timeframe === 'this-week') {
      const oneWeekAgo = new Date();
      oneWeekAgo.setDate(now.getDate() - 7);
      matchFilter.createdAt = { $gte: oneWeekAgo };
    } else if (timeframe === 'this-month') {
      const oneMonthAgo = new Date();
      oneMonthAgo.setDate(now.getDate() - 30);
      matchFilter.createdAt = { $gte: oneMonthAgo };
    }

    // High performance Mongo Aggregation Pipeline
    const pipeline: PipelineStage[] = [
      // 1. Filter WINNINGS transactions
      { $match: matchFilter },
      
      // 2. Group by user and sum earnings
      {
        $group: {
          _id: '$userId',
          netEarnings: { $sum: '$amount' },
        },
      },
      
      // 3. Sort by earnings descending
      { $sort: { netEarnings: -1 } },
      
      // 4. Limit to top 50
      { $limit: 50 },
      
      // 5. Look up User Profile details
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'userProfile',
        },
      },
      
      // 6. Unwind userProfile array
      { $unwind: '$userProfile' },
      
      // 7. Project clean response fields
      {
        $project: {
          _id: 1,
          netEarnings: 1,
          username: '$userProfile.username',
          phone: '$userProfile.phone',
        },
      },
    ];

    const topUsers = await Transaction.aggregate(pipeline);

    return res.json({
      success: true,
      timeframe,
      leaderboard: topUsers,
    });
  } catch (error: any) {
    console.error('Error fetching global leaderboard:', error);
    return res.status(500).json({ error: error.message });
  }
});
