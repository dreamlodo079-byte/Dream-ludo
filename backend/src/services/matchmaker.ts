import { getRedisClient, cacheRoomState } from '../config/redis';
import { createInitialState } from './gameEngine';
import { startRoomTimer, registerUserToRoom, getIO } from './socketManager';
import { runInTransaction } from '../config/db';
import { Transaction, TransactionType, TransactionStatus, getUserBalances } from '../models/Transaction';
import { Types } from 'mongoose';

const TICK_INTERVAL = 1000; // 1 second matchmaking tick
const MATCHMAKING_TIMEOUT_MS = 13000; // 13 seconds timeout for bot injection

export interface QueueUser {
  userId: string;
  username: string;
  socketId: string;
  joinedAt: number;
}

const SUPPORTED_TIERS = [50, 100, 500, 1000];

let checkQueueInterval: NodeJS.Timeout | null = null;

const botNames = [
  'ProLudoPlayer', 'DiceMaster', 'LuckyRoller', 'TokenRunner', 'LudoLegend',
  'KingOfLudo', 'SuperStriker', 'SafeZoneHero', 'SpeedRunner', 'VictorySeeker'
];

const getRandomBotName = (): string => {
  return botNames[Math.floor(Math.random() * botNames.length)];
};

export const processMatchmakingQueue = async (tier: number): Promise<void> => {
  const redis = getRedisClient();
  const io = getIO();
  if (!redis || !io) return;

  const lockKey = `lock:matchmaker:${tier}`;

  // Attempt to acquire an atomic lock for 1 second (1000 milliseconds)
  const acquired = await redis.set(lockKey, 'locked', {
    NX: true, // Only set if key does not exist
    PX: 1000  // Expiry in milliseconds
  });

  if (!acquired) {
    // Another clustered server instance is already running this loop tick
    return;
  }

  const queueKey = `queue:tier_${tier}`;
  try {
    const queueLen = await redis.lLen(queueKey);
    if (queueLen >= 2) {
      // Match 2 human players
      const player1Str = await redis.lPop(queueKey);
      const player2Str = await redis.lPop(queueKey);

      if (player1Str && player2Str) {
        const player1: QueueUser = JSON.parse(player1Str);
        const player2: QueueUser = JSON.parse(player2Str);

        await createLiveMatch(player1, player2, tier);
      }
    } else if (queueLen === 1) {
      // Check for 20 second timeout -> Bot Injection
      const playerStr = await redis.lIndex(queueKey, 0);
      if (playerStr) {
        const player: QueueUser = JSON.parse(playerStr);
        const elapsed = Date.now() - player.joinedAt;

        if (elapsed >= MATCHMAKING_TIMEOUT_MS) {
          // Pop the user out to process matchmaking
          await redis.lPop(queueKey);

          // Spawn server bot
          const botId = `bot_${Date.now()}`;
          const botUsername = `${getRandomBotName()} (Bot)`;
          const botPlayer: QueueUser = {
            userId: botId,
            username: botUsername,
            socketId: `socket_${botId}`,
            joinedAt: Date.now(),
          };

          await createLiveMatch(player, botPlayer, tier, true);
        }
      }
    }
  } catch (error) {
    console.error(`Matchmaking cycle exception for tier ${tier}: `, error);
  }
};

/**
 * Starts the active matchmaking loop.
 */
export const startMatchmakingLoop = (): void => {
  if (checkQueueInterval) return;

  checkQueueInterval = setInterval(async () => {
    for (const tier of SUPPORTED_TIERS) {
      await processMatchmakingQueue(tier);
    }
  }, TICK_INTERVAL);
};

/**
 * Handles adding user to entry fee tier sorted queue.
 */
export const joinQueue = async (
  userId: string,
  username: string,
  socketId: string,
  entryFee: number,
  roomCode?: string,
  passcode?: string
): Promise<{ success: boolean; message: string }> => {
  if (!SUPPORTED_TIERS.includes(entryFee)) {
    return { success: false, message: `Unsupported entry fee tier: ${entryFee}` };
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
  };

  // If private room credentials are provided, match directly
  if (roomCode && passcode) {
    const lobbyKey = `private_lobby:${roomCode}:${passcode}`;
    const waitingPlayerStr = await redis.get(lobbyKey);

    if (waitingPlayerStr) {
      const waitingPlayer: QueueUser = JSON.parse(waitingPlayerStr);

      if (waitingPlayer.userId === userId) {
        return { success: true, message: 'Already waiting in private room' };
      }

      // Check opponent balance
      const oppBalances = await getUserBalances(waitingPlayer.userId);
      if (oppBalances.total < entryFee) {
        await redis.del(lobbyKey);
        return { success: false, message: 'Opponent has insufficient balance to play' };
      }

      // Delete the waiting key
      await redis.del(lobbyKey);

      // Launch the match asynchronously
      createLiveMatch(waitingPlayer, queueUser, entryFee);

      return { success: true, message: 'Lobby joined! Match starting...' };
    } else {
      // Store current player as the waiting player (10 minutes TTL)
      await redis.set(lobbyKey, JSON.stringify(queueUser), { PX: 600000 });
      return { success: true, message: 'Waiting for friend to join room...' };
    }
  }

  const queueKey = `queue:tier_${entryFee}`;

  // Check if player is already in this or other queue to prevent duplicates
  const existingQueue = await redis.lRange(queueKey, 0, -1);
  const isAlreadyQueued = existingQueue.some((item: string) => JSON.parse(item).userId === userId);

  if (isAlreadyQueued) {
    return { success: true, message: 'Already in queue' };
  }

  await redis.rPush(queueKey, JSON.stringify(queueUser));
  console.log(`User ${username} (${userId}) joined queue tier ${entryFee}`);

  // Ensure loop is running
  startMatchmakingLoop();

  return { success: true, message: 'Successfully joined matchmaking queue' };
};

/**
 * Creates room, processes fee transaction, and launches match
 */
const createLiveMatch = async (
  p1: QueueUser,
  p2: QueueUser,
  entryFee: number,
  hasBot = false
): Promise<void> => {
  const roomId = `room_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  const io = getIO();

  try {
    // 1. Process entry fees inside a strict database transaction session
    await runInTransaction(async (session) => {
      // Human 1 entry fee
      const p1Txn = new Transaction({
        userId: new Types.ObjectId(p1.userId),
        amount: -entryFee,
        type: TransactionType.ENTRY_FEE,
        status: TransactionStatus.SUCCESS,
        referenceId: `entry_${roomId}_${p1.userId}`,
      });
      await p1Txn.save({ session });

      // Human 2 or bot entry fee
      if (!hasBot) {
        const p2Txn = new Transaction({
          userId: new Types.ObjectId(p2.userId),
          amount: -entryFee,
          type: TransactionType.ENTRY_FEE,
          status: TransactionStatus.SUCCESS,
          referenceId: `entry_${roomId}_${p2.userId}`,
        });
        await p2Txn.save({ session });
      }
    });

    // 2. Initialize Match State
    const matchState = createInitialState(
      roomId,
      { id: p1.userId, username: p1.username, isBot: false },
      { id: p2.userId, username: p2.username, isBot: hasBot },
      entryFee
    );

    // Save mapping in socket manager for reconnection purposes
    registerUserToRoom(p1.userId, roomId);
    if (!hasBot) {
      registerUserToRoom(p2.userId, roomId);
    }

    // 3. Cache state in Redis
    await cacheRoomState(roomId, matchState);

    // 4. Connect sockets to room
    const p1Socket = io.sockets.sockets.get(p1.socketId);
    if (p1Socket) p1Socket.join(roomId);

    if (!hasBot) {
      const p2Socket = io.sockets.sockets.get(p2.socketId);
      if (p2Socket) p2Socket.join(roomId);
    }

    console.log(`Match created in room ${roomId}. Players: ${p1.username} vs ${p2.username}`);

    // Emit match start and state
    io.to(roomId).emit('MATCH_START', { roomId, state: matchState });

    // Start turn countdown timer
    startRoomTimer(roomId);

    // If active player is the bot, trigger its initial play sequence
    const activePlayer = matchState.players[matchState.activePlayerIndex];
    if (activePlayer.isBot) {
      const { triggerBotTurn } = require('./botDriver'); // Avoid circular dependency
      triggerBotTurn(roomId);
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
