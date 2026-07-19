import { Router, Request, Response } from 'express';
import { runInTransaction } from '../config/db';
import { Tournament, TournamentStatus } from '../models/Tournament';
import { Transaction, TransactionType, TransactionStatus, getUserBalances } from '../models/Transaction';
import { User } from '../models/User';
import { Types } from 'mongoose';

export const tournamentRouter = Router();

/**
 * GET /api/tournaments
 * Lists active and upcoming tournaments
 */
tournamentRouter.get('/', async (_req: Request, res: Response) => {
  try {
    const list = await Tournament.find({
      status: { $in: [TournamentStatus.UPCOMING, TournamentStatus.ACTIVE] },
    }).sort({ endsAt: 1 });
    
    return res.json({ success: true, tournaments: list });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/tournaments/register
 * Enters a user in a tournament and records the entry fee debit inside an atomic transaction session
 */
tournamentRouter.post('/register', async (req: Request, res: Response) => {
  const { userId, tournamentId } = req.body;

  if (!userId || !tournamentId) {
    return res.status(400).json({ error: 'UserId and tournamentId are required' });
  }

  try {
    const result = await runInTransaction(async (session) => {
      // 1. Fetch tournament and verify slot availability
      const tournament = await Tournament.findById(tournamentId).session(session);
      if (!tournament) {
        throw new Error('Tournament not found');
      }

      if (tournament.status === TournamentStatus.CONCLUDED) {
        throw new Error('Tournament has already concluded');
      }

      if (tournament.registeredCount >= tournament.maxEntries) {
        throw new Error('Tournament has reached maximum capacity');
      }

      // Check if user is already registered
      const isAlreadyRegistered = tournament.registeredUsers.includes(new Types.ObjectId(userId));
      if (isAlreadyRegistered) {
        throw new Error('User is already registered for this tournament');
      }

      // 2. Verify user balance covers the entry fee
      const balances = await getUserBalances(userId);
      if (balances.total < tournament.entryFee) {
        throw new Error('Insufficient wallet balance to register for tournament');
      }

      const user = await User.findById(userId).session(session);
      if (!user) {
        throw new Error('User not found');
      }

      // 3. Write immutable entry fee transaction row (debit)
      const entryFeeTxn = new Transaction({
        userId: new Types.ObjectId(userId),
        amount: -tournament.entryFee, // Negative to represent debit
        type: TransactionType.ENTRY_FEE,
        status: TransactionStatus.SUCCESS,
        referenceId: `tour_${tournamentId}_${userId}_${Date.now()}`,
      });
      await entryFeeTxn.save({ session });

      // 4. Update tournament counts and users list
      tournament.registeredUsers.push(new Types.ObjectId(userId));
      tournament.registeredCount += 1;
      
      // If full, we can mark active or remain upcoming, let's keep status update rules basic
      if (tournament.registeredCount === tournament.maxEntries) {
        tournament.status = TournamentStatus.ACTIVE;
      }
      
      await tournament.save({ session });

      return {
        success: true,
        message: 'Successfully registered for tournament',
        tournament,
      };
    });

    const { broadcastTournamentUpdate } = require('../services/socketManager');
    await broadcastTournamentUpdate();

    return res.json(result);
  } catch (error: any) {
    console.error('Tournament registration error:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/tournaments/test-run
 * Manual trigger route to seed and run a 4-player test bracket tournament.
 */
tournamentRouter.post('/test-run', async (_req: Request, res: Response) => {
  try {
    const testTour = new Tournament({
      title: 'Grand Tournament Test',
      totalPrizePool: 1000,
      entryFee: 10,
      maxEntries: 4,
      registeredCount: 4,
      startsAt: new Date(),
      endsAt: new Date(),
      status: TournamentStatus.ACTIVE,
    });

    // Create 4 mock users
    const mockUsers = [];
    for (let i = 0; i < 4; i++) {
      const phone = `900000000${i}`;
      let user = await User.findOne({ phone });
      if (!user) {
        user = new User({
          phone,
          username: `TestUser_${i}`,
          depositBalance: 100,
          winningsBalance: 0,
          bonusBalance: 0,
        });
        await user.save();
      }
      mockUsers.push(user._id);
    }

    testTour.registeredUsers = mockUsers;
    await testTour.save();

    // Start round 1 bracket matches
    const { initializeTournamentRound } = require('../services/tournamentEngine');
    await initializeTournamentRound(testTour, 1);

    return res.json({
      success: true,
      message: 'Grand Tournament Test Bracket Initialized!',
      tournament: testTour,
    });
  } catch (error: any) {
    console.error('Test run setup error:', error);
    return res.status(500).json({ error: error.message });
  }
});
