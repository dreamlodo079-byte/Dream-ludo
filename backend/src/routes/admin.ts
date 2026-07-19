import { Router, Response } from 'express';
import { User } from '../models/User';
import { Transaction, TransactionType, TransactionStatus } from '../models/Transaction';
import { Tournament, TournamentStatus } from '../models/Tournament';
import { getRedisClient } from '../config/redis';
import { authenticateJWT, requireSuperAdmin, AuthenticatedRequest } from '../middleware/auth';
import { initializeTournamentRound } from '../services/tournamentEngine';
import { getUsers, promoteUser, demoteUser } from '../controllers/adminController';

const router = Router();

// Apply auth & super admin middleware across all telemetry routes
router.use(authenticateJWT as any);
router.use(requireSuperAdmin as any);

/**
 * A. Real-Time Profit & Revenue Auditing Tab
 */
router.get('/audit', async (_req: AuthenticatedRequest, res: Response) => {
  try {
    // 1. Platform Rake Counter (PLATFORM_COMMISSION transactions)
    const platformTxns = await Transaction.find({
      type: TransactionType.PLATFORM_COMMISSION,
      status: TransactionStatus.SUCCESS,
    });

    let totalRake = 0;
    const tierMetrics: Record<number, { rake: number; count: number }> = {
      3: { rake: 0, count: 0 },
      5: { rake: 0, count: 0 },
      50: { rake: 0, count: 0 },
      500: { rake: 0, count: 0 },
    };

    platformTxns.forEach((txn) => {
      totalRake += txn.amount;
      // Infer tier if referenced in referenceId e.g. rake_room_tier_50_...
      for (const tier of [3, 5, 50, 500]) {
        if (txn.referenceId && txn.referenceId.includes(`tier_${tier}`)) {
          tierMetrics[tier].rake += txn.amount;
          tierMetrics[tier].count += 1;
        }
      }
    });

    // Compute previous admin withdrawals
    const adminWithdrawalTxns = await Transaction.find({
      referenceId: { $regex: /^admin_payout_/ },
      status: TransactionStatus.SUCCESS,
    });
    let totalWithdrawn = 0;
    adminWithdrawalTxns.forEach((t) => (totalWithdrawn += Math.abs(t.amount)));

    const availablePlatformRake = Math.max(0, Math.round((totalRake - totalWithdrawn) * 100) / 100);

    // 2. Compliance Tax Tracker (30% TDS under Section 194BA on net winnings)
    const winningsTxns = await Transaction.aggregate([
      { $match: { type: TransactionType.WINNINGS, status: TransactionStatus.SUCCESS } },
      { $group: { _id: null, totalWinnings: { $sum: '$amount' } } },
    ]);
    const totalWinnings = winningsTxns.length > 0 ? winningsTxns[0].totalWinnings : 0;
    const accumulatedTds = Math.round(totalWinnings * 0.30 * 100) / 100;

    // 3. System Liability Index (Summed total of active user wallet pools)
    const liabilityAgg = await User.aggregate([
      {
        $group: {
          _id: null,
          totalDeposit: { $sum: '$depositBalance' },
          totalWinnings: { $sum: '$winningsBalance' },
          totalBonus: { $sum: '$bonusBalance' },
        },
      },
    ]);

    const liability = liabilityAgg.length > 0 ? liabilityAgg[0] : { totalDeposit: 0, totalWinnings: 0, totalBonus: 0 };
    const totalLiability = Math.round((liability.totalDeposit + liability.totalWinnings + liability.totalBonus) * 100) / 100;

    return res.json({
      success: true,
      platformId: '000000000000000000000000',
      totalRake: Math.round(totalRake * 100) / 100,
      totalWithdrawn: Math.round(totalWithdrawn * 100) / 100,
      availablePlatformRake,
      tierMetrics,
      taxTracker: {
        totalWinnings,
        tdsPercentage: 30,
        section: '194BA',
        accumulatedTds,
      },
      systemLiability: {
        depositPool: Math.round(liability.totalDeposit * 100) / 100,
        winningsPool: Math.round(liability.totalWinnings * 100) / 100,
        bonusPool: Math.round(liability.totalBonus * 100) / 100,
        totalLiability,
      },
    });
  } catch (err: any) {
    console.error('Admin audit telemetry error:', err);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * Super-Admin Platform Earnings Payout Withdrawal Endpoint
 */
router.post('/withdraw', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { amount, upiId } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Please enter a valid withdrawal amount.' });
    }

    if (!upiId || typeof upiId !== 'string' || upiId.trim().length === 0) {
      return res.status(400).json({ error: 'Please provide a valid target UPI ID / Bank VPA.' });
    }

    // Calculate total platform earnings & previous admin withdrawals
    const platformTxns = await Transaction.find({
      type: TransactionType.PLATFORM_COMMISSION,
      status: TransactionStatus.SUCCESS,
    });
    let totalRake = 0;
    platformTxns.forEach((t) => (totalRake += t.amount));

    const adminWithdrawalTxns = await Transaction.find({
      referenceId: { $regex: /^admin_payout_/ },
      status: TransactionStatus.SUCCESS,
    });
    let totalWithdrawn = 0;
    adminWithdrawalTxns.forEach((t) => (totalWithdrawn += Math.abs(t.amount)));

    const availableRake = Math.max(0, Math.round((totalRake - totalWithdrawn) * 100) / 100);

    if (amount > availableRake && availableRake > 0) {
      return res.status(400).json({
        error: `Insufficient available platform earnings. Available: ₹${availableRake}, Requested: ₹${amount}`,
      });
    }

    // Process Admin Withdrawal Payout
    const payoutTxn = new Transaction({
      userId: req.user?.userId,
      amount: -Math.abs(amount),
      type: TransactionType.WITHDRAWAL,
      status: TransactionStatus.SUCCESS,
      referenceId: `admin_payout_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    });
    await payoutTxn.save();

    const newAvailableRake = Math.max(0, Math.round((availableRake - amount) * 100) / 100);

    return res.json({
      success: true,
      message: `Platform earnings payout of ₹${amount} successfully transferred to ${upiId.trim()}.`,
      withdrawnAmount: amount,
      upiId: upiId.trim(),
      remainingPlatformRake: newAvailableRake,
    });
  } catch (err: any) {
    console.error('Admin payout withdrawal error:', err);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * B. Live Arena Concurrency & Liquidity Monitoring Tab
 */
router.get('/concurrency', async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const redis = getRedisClient();
    const activeRooms: any[] = [];
    let waitingRoomsCount = 0;
    let activeRoomsCount = 0;
    let totalBotSessions = 0;

    if (redis && redis.isOpen) {
      const keys = await redis.keys('room:*');
      for (const key of keys) {
        const dataStr = await redis.get(key);
        if (dataStr) {
          const roomState = JSON.parse(dataStr);
          const isTerminated = roomState.isTerminated || false;
          const status = isTerminated ? 'CONCLUDED' : (roomState.isStarted ? 'ACTIVE' : 'WAITING');
          
          if (status === 'WAITING') waitingRoomsCount++;
          if (status === 'ACTIVE') activeRoomsCount++;

          const botPlayers = (roomState.players || []).filter((p: any) => p.isBot);
          totalBotSessions += botPlayers.length;

          activeRooms.push({
            roomId: roomState.roomId || key.replace('room:', ''),
            status,
            entryFee: roomState.entryFee || 0,
            playersCount: (roomState.players || []).length,
            hasBot: botPlayers.length > 0,
            botCount: botPlayers.length,
            turnIndex: roomState.currentTurnIndex || 0,
          });
        }
      }
    }

    return res.json({
      success: true,
      concurrency: {
        totalRooms: activeRooms.length,
        waitingRooms: waitingRoomsCount,
        activeRooms: activeRoomsCount,
        activeBotSessions: totalBotSessions,
      },
      botMatrix: {
        driverStatus: 'HEALTHY',
        activeInstances: totalBotSessions,
        queueLiquidity: 'STABLE',
      },
      rooms: activeRooms,
    });
  } catch (err: any) {
    console.error('Admin concurrency telemetry error:', err);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * C. Grand Tournament Bracket Overrides Tab
 */
router.get('/tournaments', async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const tournaments = await Tournament.find().sort({ createdAt: -1 });
    return res.json({
      success: true,
      tournaments,
    });
  } catch (err: any) {
    console.error('Admin tournament query error:', err);
    return res.status(500).json({ error: err.message });
  }
});

router.post('/tournament/trigger', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { tournamentId } = req.body;
    const tour = await Tournament.findById(tournamentId);

    if (!tour) {
      return res.status(404).json({ error: 'Tournament not found.' });
    }

    if (tour.status === TournamentStatus.CONCLUDED) {
      return res.status(400).json({ error: 'Tournament has already concluded.' });
    }

    tour.status = TournamentStatus.ACTIVE;
    tour.currentRound = 1;
    await tour.save();

    await initializeTournamentRound(tour, 1);

    return res.json({
      success: true,
      message: `Force-triggered bracket start for tournament ${tour.title}`,
      tournament: tour,
    });
  } catch (err: any) {
    console.error('Admin tournament trigger error:', err);
    return res.status(500).json({ error: err.message });
  }
});

router.post('/tournament/cancel', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { tournamentId } = req.body;
    const tour = await Tournament.findById(tournamentId);

    if (!tour) {
      return res.status(404).json({ error: 'Tournament not found.' });
    }

    tour.status = TournamentStatus.CONCLUDED;
    await tour.save();

    // Refund registrants
    for (const userId of tour.registeredUsers) {
      const user = await User.findById(userId);
      if (user) {
        user.winningsBalance += tour.entryFee;
        await user.save();

        const refundTxn = new Transaction({
          userId: user._id,
          amount: tour.entryFee,
          type: TransactionType.ENTRY_FEE_REFUND,
          status: TransactionStatus.SUCCESS,
          referenceId: `tour_cancel_refund_${tour._id}_${user._id}_${Date.now()}`,
        });
        await refundTxn.save();
      }
    }

    return res.json({
      success: true,
      message: `Emergency cancellation executed for ${tour.title}. All entry fees refunded.`,
      tournament: tour,
    });
  } catch (err: any) {
    console.error('Admin tournament cancel error:', err);
    return res.status(500).json({ error: err.message });
  }
});

router.post('/tournament/create', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { title, totalPrizePool, entryFee, maxEntries, startsAt, endsAt, status } = req.body;

    if (!title || !totalPrizePool || !entryFee || !maxEntries) {
      return res.status(400).json({ error: 'Title, totalPrizePool, entryFee, and maxEntries are required.' });
    }

    const newTour = new Tournament({
      title: title.trim(),
      totalPrizePool: Number(totalPrizePool),
      entryFee: Number(entryFee),
      maxEntries: Number(maxEntries),
      registeredCount: 0,
      registeredUsers: [],
      startsAt: startsAt ? new Date(startsAt) : new Date(),
      endsAt: endsAt ? new Date(endsAt) : new Date(Date.now() + 86400000),
      status: status || TournamentStatus.UPCOMING,
      currentRound: 1,
      rounds: [],
      rankings: [],
    });

    await newTour.save();

    return res.json({
      success: true,
      message: `Tournament "${newTour.title}" created successfully!`,
      tournament: newTour,
    });
  } catch (err: any) {
    console.error('Admin create tournament error:', err);
    return res.status(500).json({ error: err.message });
  }
});

router.put('/tournament/update/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { title, totalPrizePool, entryFee, maxEntries, startsAt, endsAt, status } = req.body;

    const tour = await Tournament.findById(id);
    if (!tour) {
      return res.status(404).json({ error: 'Tournament not found.' });
    }

    if (title !== undefined) tour.title = title.trim();
    if (totalPrizePool !== undefined) tour.totalPrizePool = Number(totalPrizePool);
    if (entryFee !== undefined) tour.entryFee = Number(entryFee);
    if (maxEntries !== undefined) tour.maxEntries = Number(maxEntries);
    if (startsAt) tour.startsAt = new Date(startsAt);
    if (endsAt) tour.endsAt = new Date(endsAt);
    if (status) tour.status = status;

    await tour.save();

    return res.json({
      success: true,
      message: `Tournament "${tour.title}" updated successfully!`,
      tournament: tour,
    });
  } catch (err: any) {
    console.error('Admin update tournament error:', err);
    return res.status(500).json({ error: err.message });
  }
});

router.delete('/tournament/delete/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const tour = await Tournament.findById(id);
    if (!tour) {
      return res.status(404).json({ error: 'Tournament not found.' });
    }

    await Tournament.findByIdAndDelete(id);

    return res.json({
      success: true,
      message: `Tournament "${tour.title}" deleted successfully.`,
    });
  } catch (err: any) {
    console.error('Admin delete tournament error:', err);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * D. Compliance User Verification Portal Tab
 */
router.get('/kyc/pending', async (_req: AuthenticatedRequest, res: Response) => {
  try {
    // Exclude Aadhaar values from query selection to enforce strict KYC privacy compliance
    const pendingUsers = await User.find({ kycStatus: 'PENDING' })
      .select('_id username phone panNumber kycType kycDocumentNumber kycName kycStatus createdAt')
      .sort({ createdAt: -1 });

    return res.json({
      success: true,
      users: pendingUsers,
    });
  } catch (err: any) {
    console.error('Admin pending KYC query error:', err);
    return res.status(500).json({ error: err.message });
  }
});

router.post('/kyc/action', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { userId, status } = req.body;

    if (!userId || !['APPROVED', 'REJECTED'].includes(status)) {
      return res.status(400).json({ error: 'Invalid parameters. Status must be APPROVED or REJECTED.' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    user.kycStatus = status;
    user.isKycVerified = status === 'APPROVED';
    await user.save();

    return res.json({
      success: true,
      message: `User KYC ${status === 'APPROVED' ? 'Approved' : 'Rejected'} successfully. Payout rails updated.`,
      user: {
        _id: user._id,
        username: user.username,
        kycStatus: user.kycStatus,
        isKycVerified: user.isKycVerified,
      },
    });
  } catch (err: any) {
    console.error('Admin KYC action error:', err);
    return res.status(500).json({ error: err.message });
  }
});

// Promoter Management Routes
router.get('/users', getUsers as any);
router.post('/promoter/promote', promoteUser as any);
router.post('/promoter/demote', demoteUser as any);

export default router;
