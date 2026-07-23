import { getRedisClient, cacheRoomState } from '../config/redis';
import { createInitialState } from './gameEngine';
import { startRoomTimer, registerUserToRoom, getIO } from './socketManager';
import { runInTransaction } from '../config/db';
import { Transaction, TransactionType, TransactionStatus, getUserBalances } from '../models/Transaction';
import { User } from '../models/User';
import { Types } from 'mongoose';

const TICK_INTERVAL = 1000; // 1 second matchmaking tick

export const getMatchmakingTimeoutMs = (_tier: number): number => {
  return 13000; // Strictly 13 seconds matchmaking wait time on all matching tiers
};

export interface QueueUser {
  userId: string;
  username: string;
  socketId: string;
  joinedAt: number;
  gameMode?: 'QUICK' | 'REGULAR' | 'ROOMS';
  queueId?: string;
}

const MIN_ENTRY_FEE = 3; // Minimum allowed entry fee in INR

let checkQueueInterval: NodeJS.Timeout | null = null;

const botNames = [
  'Rahul_99', 'Aarav_Sharma', 'Vikram_RMG', 'Amit_Verma', 'Rohan_Ludo',
  'Priya_Singh', 'Karan_Player', 'Deepak_98', 'Rajesh_K', 'Sunil_R',
  'Sanjay_M', 'Anil_Kumar', 'Vijay_P', 'Manish_S', 'Suresh_Player',
  'Pooja_Sharma', 'Neha_Gupta', 'Ramesh_Ludo', 'Ajay_King', 'Dinesh_Master',
  'Abhishek_07', 'Sachin_Pro', 'Varun_95', 'Gaurav_X', 'Nitin_RMG',
  'Mohit_Star', 'Pawan_Ludo', 'Ritik_Player', 'Suraj_R', 'Deepika_S'
];

const getRandomBotName = (): string => {
  return botNames[Math.floor(Math.random() * botNames.length)];
};

export const processMatchmakingQueue = async (tier: number, mode: 'QUICK' | 'REGULAR'): Promise<void> => {
  const redis = getRedisClient();
  const io = getIO();
  if (!redis || !io) return;

  // Mode ROOMS is excluded from automatic matchmaking and bot injection queues
  if (mode as string === 'ROOMS') return;

  const lockKey = `lock:matchmaker:${tier}:${mode}`;

  // Attempt to acquire an atomic lock for 1 second
  const acquired = await redis.set(lockKey, 'locked', {
    NX: true,
    PX: 1000
  });

  if (!acquired) {
    return;
  }

  const queueKey = `queue:tier_${tier}_mode_${mode}`;
  try {
    const queueLen = await redis.lLen(queueKey);
    if (queueLen >= 2) {
      // Match 2 human players
      const player1Str = await redis.lPop(queueKey);
      const player2Str = await redis.lPop(queueKey);

      if (player1Str && player2Str) {
        const player1: QueueUser = JSON.parse(player1Str);
        const player2: QueueUser = JSON.parse(player2Str);

        await createLiveMatch(player1, player2, tier, false, mode);
      }
    } else if (queueLen === 1) {
      // Check for timeout -> Bot Injection
      const playerStr = await redis.lIndex(queueKey, 0);
      if (playerStr) {
        const player: QueueUser = JSON.parse(playerStr);
        const elapsed = Date.now() - player.joinedAt;

        const timeoutMs = getMatchmakingTimeoutMs(tier);
        if (elapsed >= timeoutMs) {
          await redis.lPop(queueKey);

          // Spawn server bot
          const botId = `bot_${Date.now()}`;
          const botUsername = getRandomBotName();
          const botPlayer: QueueUser = {
            userId: botId,
            username: botUsername,
            socketId: `socket_${botId}`,
            joinedAt: Date.now(),
            gameMode: mode,
          };

          await createLiveMatch(player, botPlayer, tier, true, mode);
        }
      }
    }
  } catch (error) {
    console.error(`Matchmaking cycle exception for tier ${tier} mode ${mode}: `, error);
  }
};

/**
 * Starts the active matchmaking loop.
 */
export const startMatchmakingLoop = (): void => {
  if (checkQueueInterval) return;

  checkQueueInterval = setInterval(async () => {
    const redis = getRedisClient();
    if (!redis) return;

    // Dynamically discover all active queue keys so custom fee tiers are processed
    try {
      const allKeys = await redis.keys('queue:tier_*_mode_*');
      for (const key of allKeys) {
        // Parse tier and mode from key pattern: queue:tier_<fee>_mode_<MODE>
        const match = key.match(/^queue:tier_(\d+)_mode_(QUICK|REGULAR)$/);
        if (match) {
          const tier = parseInt(match[1], 10);
          const mode = match[2] as 'QUICK' | 'REGULAR';
          await processMatchmakingQueue(tier, mode);
        }
      }
    } catch (err) {
      console.error('Matchmaking loop key scan error:', err);
    }
  }, TICK_INTERVAL);
};

/**
 * Handles adding user to entry fee tier and mode sorted queue.
 */
export const joinQueue = async (
  userId: string,
  username: string,
  socketId: string,
  entryFee: number,
  roomCode?: string,
  passcode?: string,
  gameMode: 'QUICK' | 'REGULAR' | 'ROOMS' = 'REGULAR',
  customRules?: { turnTimer?: number; tokenCount?: number }
): Promise<{ success: boolean; message: string }> => {
  // Validate entry fee: must be a whole number and at least MIN_ENTRY_FEE
  if (!Number.isInteger(entryFee) || entryFee < MIN_ENTRY_FEE) {
    return { success: false, message: `Entry fee must be a whole number of at least ₹${MIN_ENTRY_FEE}` };
  }

  // 1. Pre-verify balance
  const balances = await getUserBalances(userId);
  if (balances.total < entryFee) {
    return { success: false, message: 'Insufficient balance to join match' };
  }

  const redis = getRedisClient();
  if (!redis) {
    return { success: false, message: 'Redis not available' };
  }

  const queueUser: QueueUser = {
    userId,
    username,
    socketId,
    joinedAt: Date.now(),
    gameMode,
  };

  // If private room credentials are provided, match directly
  if (roomCode && passcode) {
    const lobbyKey = `private_lobby:${roomCode}:${passcode}`;
    const waitingLobbyStr = await redis.get(lobbyKey);

    if (waitingLobbyStr) {
      const lobbyData = JSON.parse(waitingLobbyStr);
      const waitingPlayer: QueueUser = lobbyData.creator;
      const rules = lobbyData.customRules;
      const fee = lobbyData.entryFee;
      const mode = lobbyData.gameMode || 'ROOMS';

      if (waitingPlayer.userId === userId) {
        return { success: true, message: 'Already waiting in private room' };
      }

      // Check opponent balance
      const oppBalances = await getUserBalances(waitingPlayer.userId);
      if (oppBalances.total < fee) {
        await redis.del(lobbyKey);
        return { success: false, message: 'Opponent has insufficient balance to play' };
      }

      // Delete the waiting key
      await redis.del(lobbyKey);

      // Launch the match asynchronously with cached creator parameters
      createLiveMatch(waitingPlayer, queueUser, fee, false, mode, rules);

      return { success: true, message: 'Lobby joined! Match starting...' };
    } else {
      // Store creator player parameters (10 minutes TTL)
      const lobbyData = {
        creator: queueUser,
        customRules,
        entryFee,
        gameMode: 'ROOMS'
      };
      await redis.set(lobbyKey, JSON.stringify(lobbyData), { PX: 600000 });
      return { success: true, message: 'Waiting for friend to join room...' };
    }
  }

  const queueKey = `queue:tier_${entryFee}_mode_${gameMode}`;

  // Check if player is already in this queue to prevent duplicates
  const existingQueue = await redis.lRange(queueKey, 0, -1);
  const isAlreadyQueued = existingQueue.some((item: string) => JSON.parse(item).userId === userId);

  if (isAlreadyQueued) {
    return { success: true, message: 'Already in queue' };
  }

  // Debit fee immediately inside Mongoose transaction for queue protection
  const queueId = `queue_${userId}_${entryFee}_${Date.now()}`;
  queueUser.queueId = queueId;

  try {
    await runInTransaction(async (session) => {
      await deductEntryFee(userId, entryFee, queueId, session);
    });
  } catch (err: any) {
    console.error(`Immediate joinQueue debit failed for user ${userId}:`, err);
    return { success: false, message: err.message || 'Failed to debit entry fee from wallet' };
  }

  await redis.rPush(queueKey, JSON.stringify(queueUser));
  console.log(`User ${username} (${userId}) joined queue tier ${entryFee} mode ${gameMode}`);

  // Ensure loop is running
  startMatchmakingLoop();

  return { success: true, message: 'Successfully joined matchmaking queue' };
};

/**
 * Refunds entry fee to user's wallet slots based on ENTRY_FEE_DEBIT transaction records.
 */
export const refundEntryFee = async (
  userId: string,
  _entryFee: number,
  queueId: string,
  session: any
): Promise<void> => {
  const user = await User.findById(userId).session(session);
  if (!user) {
    throw new Error(`User not found: ${userId}`);
  }

  // Query transaction ledger for successful entry fee debits for this queue join
  const transactions = await Transaction.find({
    userId: new Types.ObjectId(userId),
    referenceId: { $in: [
      `entry_bonus_${queueId}_${userId}`,
      `entry_deposit_${queueId}_${userId}`,
      `entry_winnings_${queueId}_${userId}`
    ]},
    status: TransactionStatus.SUCCESS
  }).session(session);

  let bonusRefund = 0;
  let depositRefund = 0;
  let winningsRefund = 0;

  for (const txn of transactions) {
    const amount = Math.abs(txn.amount);
    if (txn.referenceId.startsWith(`entry_bonus_${queueId}`)) {
      bonusRefund = amount;
    } else if (txn.referenceId.startsWith(`entry_deposit_${queueId}`)) {
      depositRefund = amount;
    } else if (txn.referenceId.startsWith(`entry_winnings_${queueId}`)) {
      winningsRefund = amount;
    }
  }

  // Refund precise amounts back
  user.bonusBalance = Math.round(((user.bonusBalance || 0) + bonusRefund) * 100) / 100;
  user.depositBalance = Math.round(((user.depositBalance || 0) + depositRefund) * 100) / 100;
  user.winningsBalance = Math.round(((user.winningsBalance || 0) + winningsRefund) * 100) / 100;
  await user.save({ session });

  // Record refund transaction entries
  if (bonusRefund > 0) {
    const bonusTxn = new Transaction({
      userId: new Types.ObjectId(userId),
      amount: bonusRefund,
      type: TransactionType.ENTRY_FEE_REFUND,
      status: TransactionStatus.SUCCESS,
      referenceId: `refund_bonus_${queueId}_${userId}`,
    });
    await bonusTxn.save({ session });
  }

  if (depositRefund > 0) {
    const depositTxn = new Transaction({
      userId: new Types.ObjectId(userId),
      amount: depositRefund,
      type: TransactionType.ENTRY_FEE_REFUND,
      status: TransactionStatus.SUCCESS,
      referenceId: `refund_deposit_${queueId}_${userId}`,
    });
    await depositTxn.save({ session });
  }

  if (winningsRefund > 0) {
    const winningsTxn = new Transaction({
      userId: new Types.ObjectId(userId),
      amount: winningsRefund,
      type: TransactionType.ENTRY_FEE_REFUND,
      status: TransactionStatus.SUCCESS,
      referenceId: `refund_winnings_${queueId}_${userId}`,
    });
    await winningsTxn.save({ session });
  }
};

/**
 * Removes a player from the queue and performs transaction refund.
 */
export const leaveQueue = async (userId: string): Promise<{ success: boolean; message: string }> => {
  const redis = getRedisClient();
  if (!redis) {
    return { success: false, message: 'Redis not available' };
  }

  try {
    const allKeys = await redis.keys('queue:tier_*_mode_*');
    for (const key of allKeys) {
      const queue = await redis.lRange(key, 0, -1);
      for (const item of queue) {
        const player = JSON.parse(item) as QueueUser;
        if (player.userId === userId) {
          // Remove from Redis queue
          await redis.lRem(key, 0, item);
          
          // Parse tier (entryFee) from the key name
          const match = key.match(/^queue:tier_(\d+)_mode_(QUICK|REGULAR)$/);
          if (match) {
            const entryFee = parseInt(match[1], 10);
            const queueId = player.queueId || `queue_${userId}_${entryFee}`;
            
            // Refund inside transaction
            await runInTransaction(async (session) => {
              await refundEntryFee(userId, entryFee, queueId, session);
            });
            console.log(`User ${userId} left queue tier ${entryFee} and was refunded.`);
            return { success: true, message: 'Successfully left queue and refunded entry fee' };
          }
        }
      }
    }
    return { success: true, message: 'Not active in any queue' };
  } catch (error: any) {
    console.error('Error leaving matchmaking queue:', error);
    return { success: false, message: error.message || 'Failed to leave queue' };
  }
};

/**
 * Creates room, processes fee transaction, and launches match
 */
const createLiveMatch = async (
  p1: QueueUser,
  p2: QueueUser,
  entryFee: number,
  hasBot = false,
  gameMode: 'QUICK' | 'REGULAR' | 'ROOMS' = 'REGULAR',
  customRules?: { turnTimer?: number; tokenCount?: number },
  promoState?: 'PROMO_WIN_FORCED' | 'PROMO_LOSE_FORCED'
): Promise<void> => {
  const roomId = `room_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  const io = getIO();

  try {
    // 1. Process entry fees inside a database transaction (only for private lobbies)
    if (gameMode === 'ROOMS') {
      await runInTransaction(async (session) => {
        // Human 1 entry fee
        await deductEntryFee(p1.userId, entryFee, roomId, session);

        // Human 2 entry fee
        await deductEntryFee(p2.userId, entryFee, roomId, session);
      });
    }

    // Increment playing count in LobbyStateService
    try {
      const { incrementPlayingCount } = require('./lobbyService');
      await incrementPlayingCount(entryFee, hasBot ? 1 : 2);
    } catch (err) {
      console.error('Failed to increment playing count on match start:', err);
    }

    // Check if either player is a promoter, and fetch their config state
    let promoOverride: 'PROMOTER_MUST_WIN' | 'PROMOTER_MUST_LOSE' | undefined = undefined;
    const p1User = await User.findById(p1.userId);
    const p2User = !hasBot ? await User.findById(p2.userId) : null;

    if (p1User && p1User.isPromoter) {
      const stakeKey = `stake_${entryFee}`;
      let promoStateVal = 'MUST_LOSE';
      if (p1User.promoMatchState) {
        if (typeof p1User.promoMatchState.get === 'function') {
          promoStateVal = p1User.promoMatchState.get(stakeKey) || 'MUST_LOSE';
        } else {
          promoStateVal = p1User.promoMatchState[stakeKey] || 'MUST_LOSE';
        }
      }
      promoOverride = promoStateVal === 'MUST_WIN' ? 'PROMOTER_MUST_WIN' : 'PROMOTER_MUST_LOSE';
    } else if (p2User && p2User.isPromoter) {
      const stakeKey = `stake_${entryFee}`;
      let promoStateVal = 'MUST_LOSE';
      if (p2User.promoMatchState) {
        if (typeof p2User.promoMatchState.get === 'function') {
          promoStateVal = p2User.promoMatchState.get(stakeKey) || 'MUST_LOSE';
        } else {
          promoStateVal = p2User.promoMatchState[stakeKey] || 'MUST_LOSE';
        }
      }
      promoOverride = promoStateVal === 'MUST_WIN' ? 'PROMOTER_MUST_WIN' : 'PROMOTER_MUST_LOSE';
    }

    // 2. Initialize Match State
    const matchState = createInitialState(
      roomId,
      { id: p1.userId, username: p1.username, isBot: false, isPromoter: p1User?.isPromoter || false },
      { id: p2.userId, username: p2.username, isBot: hasBot, isPromoter: p2User?.isPromoter || false },
      entryFee,
      gameMode,
      customRules
    );

    if (promoOverride) {
      matchState.promoOverride = promoOverride;
    }

    if (promoState) {
      matchState.promoState = promoState;
    }

    // Save mapping in socket manager for reconnection purposes
    registerUserToRoom(p1.userId, roomId);
    if (!hasBot) {
      registerUserToRoom(p2.userId, roomId);
    }

    // Cache state in Redis and connect sockets to room
    const p1Socket = io.sockets.sockets.get(p1.socketId);
    if (p1Socket) p1Socket.join(roomId);

    if (!hasBot) {
      const p2Socket = io.sockets.sockets.get(p2.socketId);
      if (p2Socket) p2Socket.join(roomId);
    }

    if (!hasBot) {
      // Human vs Human matchmaking synchronization handshake
      matchState.status = 'MATCH_PENDING';
      
      // Save tracking info on players
      matchState.players[0].queueId = p1.queueId;
      matchState.players[0].socketId = p1.socketId;
      matchState.players[0].joinedAt = p1.joinedAt;

      matchState.players[1].queueId = p2.queueId;
      matchState.players[1].socketId = p2.socketId;
      matchState.players[1].joinedAt = p2.joinedAt;

      await cacheRoomState(roomId, matchState);
      
      console.log(`Match pending handshake in room ${roomId}. Players: ${p1.username} vs ${p2.username}`);

      // Dispatch MATCH_FOUND_ACK to trigger client overlays
      io.to(roomId).emit('MATCH_FOUND_ACK', {
        roomId,
        entryFee,
        gameMode,
        players: matchState.players.map(p => ({
          id: p.id,
          username: p.username,
          isBot: p.isBot
        }))
      });

      // Start safety timeout fallback (5 seconds)
      const { setHandshakeTimer, handleHandshakeTimeout } = require('./socketManager');
      const handshakeTimeout = setTimeout(async () => {
        await handleHandshakeTimeout(roomId);
      }, 5000);
      setHandshakeTimer(roomId, handshakeTimeout);

    } else {
      // Bot match: immediately start active game session
      matchState.status = 'ACTIVE';
      await cacheRoomState(roomId, matchState);

      console.log(`Match created in room ${roomId} against bot. Player: ${p1.username}`);

      // Emit start signals
      io.to(roomId).emit('MATCH_START', { roomId, state: matchState });
      io.to(roomId).emit('START_MATCH_GAME', { roomId, state: matchState });

      // Start turn countdown timer
      startRoomTimer(roomId);

      // Trigger bot's initial turn
      const activePlayer = matchState.players[matchState.activePlayerIndex];
      if (activePlayer.isBot) {
        const { triggerBotTurn } = require('./botDriver'); // Avoid circular dependency
        triggerBotTurn(roomId);
      }
    }
  } catch (error) {
    console.error(`Failed to initialize match for room ${roomId}:`, error);

    // Notify clients about transaction/initialization failure
    const socket1 = io.sockets.sockets.get(p1.socketId);
    if (socket1) socket1.emit('ERROR', { message: 'Failed to start match due to transaction error.' });

    if (!hasBot) {
      const socket2 = io.sockets.sockets.get(p2.socketId);
      if (socket2) socket2.emit('ERROR', { message: 'Failed to start match due to transaction error.' });
    }
  }
};

/**
 * Deducts entry fee using sequentially prioritized wallet balances:
 * 1. Up to 10% of entryFee from bonusBalance
 * 2. Next remaining fraction from depositBalance
 * 3. Next remaining remainder from winningsBalance
 * 
 * Creates separate Transaction ledger records of type ENTRY_FEE_DEBIT for each deduction.
 */
async function deductEntryFee(
  userId: string,
  entryFee: number,
  roomId: string,
  session: any
): Promise<void> {
  if (entryFee === 0) {
    return; // Free mode - no wallet balance debit
  }

  const user = await User.findById(userId).session(session);
  if (!user) {
    throw new Error(`User not found: ${userId}`);
  }

  // 1. Calculate maximum 10% allowed from bonusBalance
  const maxBonusDeduction = Math.round(entryFee * 0.10 * 100) / 100;
  const actualBonusDeduction = Math.round(Math.min(user.bonusBalance || 0, maxBonusDeduction) * 100) / 100;

  // Remaining fee after bonus deduction
  let remainingFee = Math.round((entryFee - actualBonusDeduction) * 100) / 100;

  // 2. Deduct from depositBalance
  const actualDepositDeduction = Math.round(Math.min(user.depositBalance || 0, remainingFee) * 100) / 100;
  remainingFee = Math.round((remainingFee - actualDepositDeduction) * 100) / 100;

  // 3. Deduct from winningsBalance
  const actualWinningsDeduction = remainingFee;

  // 4. Verify total balances are sufficient
  if (user.winningsBalance < actualWinningsDeduction) {
    throw new Error(`Insufficient aggregate balance for user ${userId} to join match (Required: ₹${entryFee})`);
  }

  // 5. Update user balance fields
  user.bonusBalance = Math.max(0, Math.round(((user.bonusBalance || 0) - actualBonusDeduction) * 100) / 100);
  user.depositBalance = Math.max(0, Math.round(((user.depositBalance || 0) - actualDepositDeduction) * 100) / 100);
  user.winningsBalance = Math.max(0, Math.round(((user.winningsBalance || 0) - actualWinningsDeduction) * 100) / 100);
  await user.save({ session });

  // 6. Append immutable transaction rows (ENTRY_FEE_DEBIT) for every non-zero deduction
  if (actualBonusDeduction > 0) {
    const bonusTxn = new Transaction({
      userId: new Types.ObjectId(userId),
      amount: -actualBonusDeduction,
      type: TransactionType.ENTRY_FEE_DEBIT,
      status: TransactionStatus.SUCCESS,
      referenceId: `entry_bonus_${roomId}_${userId}`,
    });
    await bonusTxn.save({ session });
  }

  if (actualDepositDeduction > 0) {
    const depositTxn = new Transaction({
      userId: new Types.ObjectId(userId),
      amount: -actualDepositDeduction,
      type: TransactionType.ENTRY_FEE_DEBIT,
      status: TransactionStatus.SUCCESS,
      referenceId: `entry_deposit_${roomId}_${userId}`,
    });
    await depositTxn.save({ session });
  }

  if (actualWinningsDeduction > 0) {
    const winningsTxn = new Transaction({
      userId: new Types.ObjectId(userId),
      amount: -actualWinningsDeduction,
      type: TransactionType.ENTRY_FEE_DEBIT,
      status: TransactionStatus.SUCCESS,
      referenceId: `entry_winnings_${roomId}_${userId}`,
    });
    await winningsTxn.save({ session });
  }
}
