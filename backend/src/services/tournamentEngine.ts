import { Tournament, TournamentStatus, ITournamentMatch, ITournamentRound } from '../models/Tournament';
import { User } from '../models/User';
import { Transaction, TransactionType, TransactionStatus } from '../models/Transaction';
import { runInTransaction } from '../config/db';
import { getIO } from './socketManager';
import { createInitialState } from './gameEngine';
import { cacheRoomState } from '../config/redis';
import { Types } from 'mongoose';

const SCHEDULER_INTERVAL_MS = 5000;
const CONNECTION_TIMEOUT_MS = 60000; // 60 seconds connection check

let schedulerInterval: NodeJS.Timeout | null = null;

export const startTournamentScheduler = (): void => {
  if (schedulerInterval) return;

  schedulerInterval = setInterval(async () => {
    try {
      await checkUpcomingTournaments();
      await checkActiveTournamentsProgression();
    } catch (err) {
      console.error('Tournament scheduler tick error:', err);
    }
  }, SCHEDULER_INTERVAL_MS);

  console.log('Tournament automated scheduler started.');
};

/**
 * Checks for UPCOMING tournaments that have passed their start/end registration date.
 */
async function checkUpcomingTournaments(): Promise<void> {
  const now = new Date();
  const upcomingTournaments = await Tournament.find({
    status: TournamentStatus.UPCOMING,
    endsAt: { $lte: now }
  });

  for (const tour of upcomingTournaments) {
    console.log(`Starting tournament: ${tour.title} (${tour._id})`);
    
    const actualUsersCount = (tour.registeredUsers || []).length;
    if (actualUsersCount < 2) {
      console.log(`Tournament ${tour.title} has insufficient registered users (${actualUsersCount}). Concluding with refunds.`);
      await refundTournamentRegistrants(tour);
      continue;
    }

    // Shift state to ACTIVE
    tour.status = TournamentStatus.ACTIVE;
    await tour.save();

    // Start Round 1
    await initializeTournamentRound(tour, 1);
  }
}

/**
 * Periodically checks ACTIVE tournaments to ensure no rounds are stuck.
 */
async function checkActiveTournamentsProgression(): Promise<void> {
  const activeTournaments = await Tournament.find({ status: TournamentStatus.ACTIVE });
  for (const tour of activeTournaments) {
    const currentRound = tour.rounds.find(r => r.roundNumber === tour.currentRound);
    if (!currentRound) continue;

    for (const match of currentRound.matches) {
      if (match.status === 'PENDING') {
        // If it was created more than 60s ago and still pending, force progression
        // To be safe, we let startConnectionForfeitCheck do it, but we can verify if stuck
      }
    }
  }
}

/**
 * Refunds all registrants when a tournament fails to start.
 */
async function refundTournamentRegistrants(tour: any): Promise<void> {
  await runInTransaction(async (session) => {
    for (const userId of tour.registeredUsers) {
      const queueId = `tour_${tour._id}_${userId}`;
      
      // Look up entry fee transactions
      const transactions = await Transaction.find({
        userId,
        referenceId: { $in: [
          `entry_bonus_${queueId}_${userId}`,
          `entry_deposit_${queueId}_${userId}`,
          `entry_winnings_${queueId}_${userId}`
        ]},
        status: TransactionStatus.SUCCESS
      }).session(session);

      let refundAmount = 0;
      let bonus = 0;
      let deposit = 0;
      let winnings = 0;

      for (const t of transactions) {
        const amt = Math.abs(t.amount);
        refundAmount += amt;
        if (t.referenceId.includes('bonus')) bonus = amt;
        else if (t.referenceId.includes('deposit')) deposit = amt;
        else winnings = amt;
      }

      const user = await User.findById(userId).session(session);
      if (user) {
        user.bonusBalance = Math.round(((user.bonusBalance || 0) + bonus) * 100) / 100;
        user.depositBalance = Math.round(((user.depositBalance || 0) + deposit) * 100) / 100;
        user.winningsBalance = Math.round(((user.winningsBalance || 0) + winnings) * 100) / 100;
        await user.save({ session });

        // Record logs
        const refundTxn = new Transaction({
          userId,
          amount: refundAmount,
          type: TransactionType.ENTRY_FEE_REFUND,
          status: TransactionStatus.SUCCESS,
          referenceId: `tour_refund_${tour._id}_${userId}`,
        });
        await refundTxn.save({ session });
      }
    }

    tour.status = TournamentStatus.CONCLUDED;
    await tour.save({ session });
  });
}

/**
 * Initializes a bracket round, pairs active players, creates matches, and starts forfeit timers.
 */
export async function initializeTournamentRound(tour: any, roundNumber: number): Promise<void> {
  console.log(`Initializing Round ${roundNumber} for tournament ${tour.title}`);
  
  // 1. Get qualified players for this round
  let activePlayerIds: Types.ObjectId[] = [];
  if (roundNumber === 1) {
    activePlayerIds = [...tour.registeredUsers];
  } else {
    // Get winners from previous round
    const prevRound = tour.rounds.find((r: any) => r.roundNumber === roundNumber - 1);
    if (prevRound) {
      activePlayerIds = prevRound.matches.map((m: any) => m.winnerId).filter(Boolean);
    }
  }

  // Check minimum player requirement
  if (activePlayerIds.length < 2) {
    console.log(`Tournament ${tour.title} has fewer than 2 active players (${activePlayerIds.length}) in round ${roundNumber}. Concluding.`);
    if (roundNumber === 1) {
      await refundTournamentRegistrants(tour);
    } else {
      tour.status = TournamentStatus.CONCLUDED;
      await tour.save();
    }
    return;
  }

  // Shuffle players
  activePlayerIds.sort(() => Math.random() - 0.5);

  const matches: ITournamentMatch[] = [];
  const nextRoundPlayers: Types.ObjectId[] = [];

  // 2. Handle Odd Player bye
  if (activePlayerIds.length % 2 !== 0) {
    const byePlayer = activePlayerIds.pop();
    if (byePlayer) {
      console.log(`Player ${byePlayer} receives a BYE in round ${roundNumber}`);
      nextRoundPlayers.push(byePlayer);
    }
  }

  // 3. Pair players
  for (let i = 0; i < activePlayerIds.length; i += 2) {
    const p1 = activePlayerIds[i];
    const p2 = activePlayerIds[i + 1];
    const roomId = `tour_room_${tour._id}_r${roundNumber}_${i}`;

    matches.push({
      matchId: roomId,
      playerIds: [p1, p2],
      status: 'PENDING',
      winnerId: null
    });
  }

  const newRound: ITournamentRound = {
    roundNumber,
    playerIds: [...activePlayerIds, ...nextRoundPlayers],
    matches
  };

  tour.rounds.push(newRound);
  tour.currentRound = roundNumber;
  await tour.save();

  // 4. Initialize room state and notify
  const io = getIO();
  for (const m of matches) {
    try {
      const u1 = await User.findById(m.playerIds[0]);
      const u2 = await User.findById(m.playerIds[1]);

      if (u1 && u2) {
        // Init state in ludo game engine
        const state = createInitialState(
          m.matchId,
          { id: u1._id.toString(), username: u1.username, isBot: false },
          { id: u2._id.toString(), username: u2.username, isBot: false },
          tour.entryFee,
          'REGULAR'
        );
        await cacheRoomState(m.matchId, state);

        // Tell users to connect
        io.emit('TOURNAMENT_MATCH_ASSIGNED', {
          tournamentId: tour._id,
          roundNumber,
          roomId: m.matchId,
          players: [u1.username, u2.username]
        });
      }
    } catch (err) {
      console.error(`Failed to initialize room ${m.matchId}:`, err);
    }
  }

  // Start 60-second connection check
  startConnectionForfeitCheck(tour._id.toString(), roundNumber);
}

/**
 * Checks if players connected to the socket room. Forfeits players who fail to connect.
 */
function startConnectionForfeitCheck(tourId: string, roundNumber: number): void {
  setTimeout(async () => {
    try {
      const tour = await Tournament.findById(tourId);
      if (!tour) return;

      const round = tour.rounds.find(r => r.roundNumber === roundNumber);
      if (!round) return;

      let hasModifications = false;

      for (const match of round.matches) {
        if (match.status === 'PENDING') {
          const p1Connected = isUserConnectedToRoom(match.playerIds[0].toString(), match.matchId);
          const p2Connected = isUserConnectedToRoom(match.playerIds[1].toString(), match.matchId);

          if (!p1Connected || !p2Connected) {
            hasModifications = true;
            let winnerId = match.playerIds[0]; // Fallback winner

            if (p1Connected && !p2Connected) {
              winnerId = match.playerIds[0];
            } else if (!p1Connected && p2Connected) {
              winnerId = match.playerIds[1];
            }

            match.winnerId = winnerId;
            match.status = 'CONCLUDED';
            console.log(`Forfeit applied to match ${match.matchId}. Winner: ${winnerId}`);
            
            const io = getIO();
            io.to(match.matchId).emit('SYSTEM_ALERT', {
              message: 'Opponent failed to connect within 60s. Game forfeited.'
            });
            io.to(match.matchId).emit('MATCH_TERMINATED', {
              winnerId: winnerId.toString(),
              winnerUsername: 'Forfeit Winner',
              winnings: 0
            });
          } else {
            // Match is active
            match.status = 'ACTIVE';
            hasModifications = true;
          }
        }
      }

      if (hasModifications) {
        await tour.save();
        await checkAndAdvanceRound(tour, roundNumber);
      }
    } catch (err) {
      console.error('Connection forfeit check exception:', err);
    }
  }, CONNECTION_TIMEOUT_MS);
}

/**
 * Helpers to check if a user socket is active in a room.
 */
function isUserConnectedToRoom(userId: string, roomId: string): boolean {
  const io = getIO();
  if (!io) return false;

  const roomSockets = io.sockets.adapter.rooms.get(roomId);
  if (!roomSockets) return false;

  for (const socketId of roomSockets) {
    const socket = io.sockets.sockets.get(socketId);
    if (socket && socket.data && socket.data.userId === userId) {
      return true;
    }
  }
  return false;
}

/**
 * Triggered when a match completes. Validates round state and advances brackets.
 */
export const handleTournamentMatchCompletion = async (roomId: string, winnerId: string): Promise<void> => {
  // Extract tournamentId from roomId format: tour_room_<tourId>_r<roundNumber>_index
  const match = roomId.match(/^tour_room_([a-f\d]{24})_r(\d+)_\d+$/);
  if (!match) return;

  const tourId = match[1];
  const roundNumber = parseInt(match[2], 10);

  const tour = await Tournament.findById(tourId);
  if (!tour) return;

  const round = tour.rounds.find(r => r.roundNumber === roundNumber);
  if (!round) return;

  const tournamentMatch = round.matches.find(m => m.matchId === roomId);
  if (tournamentMatch && tournamentMatch.status !== 'CONCLUDED') {
    tournamentMatch.winnerId = new Types.ObjectId(winnerId);
    tournamentMatch.status = 'CONCLUDED';
    await tour.save();

    console.log(`Tournament match ${roomId} concluded. Winner: ${winnerId}`);
    await checkAndAdvanceRound(tour, roundNumber);
  }
};

/**
 * Verifies if all matches in a round finished, and progresses or concludes the tournament.
 */
async function checkAndAdvanceRound(tour: any, roundNumber: number): Promise<void> {
  const round = tour.rounds.find((r: any) => r.roundNumber === roundNumber);
  if (!round) return;

  const allFinished = round.matches.every((m: any) => m.status === 'CONCLUDED');
  if (!allFinished) return;

  // Gather winners
  const roundWinners = round.matches.map((m: any) => m.winnerId).filter(Boolean);

  // Add any bye players
  const prevRound = tour.rounds.find((r: any) => r.roundNumber === roundNumber);
  const totalQualified = roundWinners.length + (prevRound ? prevRound.playerIds.length - (round.matches.length * 2) : 0);

  if (totalQualified <= 1) {
    // Tournament Concluded!
    tour.status = TournamentStatus.CONCLUDED;
    
    // Set rankings
    const rankings = buildTournamentRankings(tour);
    tour.rankings = rankings;
    await tour.save();

    await settleTournamentPayouts(tour);
  } else {
    // Initialize next round
    await initializeTournamentRound(tour, roundNumber + 1);
  }
}

/**
 * Maps round failures and eliminations into ranking placements.
 */
function buildTournamentRankings(tour: any): any[] {
  const rankings: any[] = [];
  
  // 1st Place: Winner of final round match
  const finalRound = tour.rounds[tour.rounds.length - 1];
  if (finalRound && finalRound.matches.length > 0) {
    const finalMatch = finalRound.matches[0];
    if (finalMatch.winnerId) {
      rankings.push({ userId: finalMatch.winnerId, rank: 1 });
      
      const runnerUp = finalMatch.playerIds.find((id: any) => id.toString() !== finalMatch.winnerId.toString());
      if (runnerUp) {
        rankings.push({ userId: runnerUp, rank: 2 });
      }
    }
  }

  // Semi-final losers get Rank 3 and 4
  if (tour.rounds.length >= 2) {
    const semiRound = tour.rounds[tour.rounds.length - 2];
    if (semiRound) {
      const losers = semiRound.matches
        .map((m: any) => m.playerIds.find((id: any) => id.toString() !== m.winnerId?.toString()))
        .filter(Boolean);

      losers.forEach((l: any, i: number) => {
        rankings.push({ userId: l, rank: 3 + i });
      });
    }
  }

  return rankings;
}

/**
 * Atomic payout settlements running sequentially inside Mongoose sessions.
 */
async function settleTournamentPayouts(tour: any): Promise<void> {
  console.log(`Settling payouts for tournament: ${tour.title}`);
  
  const payoutTiers: Record<number, number> = {
    1: 0.50, // 1st Place gets 50%
    2: 0.25, // 2nd Place gets 25%
    3: 0.15, // 3rd Place gets 15%
    4: 0.10  // 4th Place gets 10%
  };

  await runInTransaction(async (session) => {
    let totalDistributed = 0;

    // 1. Distribute rewards directly into user winnings balance
    for (const r of tour.rankings) {
      const share = payoutTiers[r.rank];
      if (!share) continue;

      const rewardAmount = Math.round(tour.totalPrizePool * share * 100) / 100;
      totalDistributed += rewardAmount;

      const user = await User.findById(r.userId).session(session);
      if (user) {
        user.winningsBalance = Math.round(((user.winningsBalance || 0) + rewardAmount) * 100) / 100;
        await user.save({ session });

        const winTxn = new Transaction({
          userId: r.userId,
          amount: rewardAmount,
          type: TransactionType.TOURNAMENT_WIN_CREDIT,
          status: TransactionStatus.SUCCESS,
          referenceId: `tour_win_${tour._id}_r${r.rank}_${Date.now()}`,
        });
        await winTxn.save({ session });
      }
    }

    // 2. Audit remaining platform profit (Rake)
    const totalCollected = tour.registeredCount * tour.entryFee;
    const rake = Math.round((totalCollected - totalDistributed) * 100) / 100;

    if (rake > 0) {
      const commissionTxn = new Transaction({
        userId: new Types.ObjectId('000000000000000000000000'), // Platform profit ledger
        amount: rake,
        type: TransactionType.PLATFORM_COMMISSION,
        status: TransactionStatus.SUCCESS,
        referenceId: `tour_rake_${tour._id}_${Date.now()}`,
      });
      await commissionTxn.save({ session });
    }

    console.log(`Tournament ${tour.title} concluded. Prize Pool Distributed: ?${totalDistributed}, Platform Profit Rake: ?${rake}`);
  });

  // Notify players via socket
  const io = getIO();
  io.emit('TOURNAMENT_CONCLUDED', {
    tournamentId: tour._id,
    title: tour.title,
    winner: tour.rankings.find((r: any) => r.rank === 1)?.userId
  });
}
