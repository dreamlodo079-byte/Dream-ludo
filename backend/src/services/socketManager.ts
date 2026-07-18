import { Server, Socket } from 'socket.io';
import { getRoomState, cacheRoomState, deleteRoomState, getRedisClient, createDuplicateRedisClient } from '../config/redis';
import { createAdapter } from '@socket.io/redis-adapter';
import {
  MatchState,
  executeRoll,
  executeMove,
  skipTurn,
} from './gameEngine';
import { runInTransaction } from '../config/db';
import { Transaction, TransactionType, TransactionStatus } from '../models/Transaction';
import { Types } from 'mongoose';
import { triggerBotTurn } from './botDriver';
import { trackDailyMatch } from './challengeTracker';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../middleware/auth';

import { User } from '../models/User';

let io: Server;

// Map of roomId -> NodeJS.Timeout for the 15-second turn timer
const turnTimerIntervals = new Map<string, NodeJS.Timeout>();

// Map of userId -> NodeJS.Timeout for the 60-second reconnection grace period
const reconnectTimers = new Map<string, NodeJS.Timeout>();

// Map of userId -> current active roomId
const userActiveRooms = new Map<string, string>();

// Map of socketId -> userId
const socketUserMap = new Map<string, string>();

// Map of userId -> array of active socketIds (for multi-device concurrent session enforcement)
const userDeviceSockets = new Map<string, string[]>();

export const initializeSocketIO = async (server: any): Promise<Server> => {
  io = new Server(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
  });

  try {
    const redis = getRedisClient();
    if (redis && redis.constructor.name === 'InMemRedisStore') {
      throw new Error('Main Redis client is offline (InMemRedisStore active)');
    }
    const pubClient = createDuplicateRedisClient();
    const subClient = createDuplicateRedisClient();
    await Promise.all([
      Promise.race([pubClient.connect(), new Promise((_, reject) => setTimeout(() => reject(new Error('PubClient timeout')), 1500))]),
      Promise.race([subClient.connect(), new Promise((_, reject) => setTimeout(() => reject(new Error('SubClient timeout')), 1500))]),
    ]);
    io.adapter(createAdapter(pubClient, subClient));
    console.log('Clustered Socket.io Redis adapter initialized successfully.');
  } catch (err: any) {
    console.log('Redis adapter offline or connection timeout: Running Socket.io in single-node local mode.');
  }

  // Socket authentication middleware checking token blacklisting
  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.headers['x-auth-token'];
    if (token && typeof token === 'string') {
      try {
        const redis = getRedisClient();
        if (redis && redis.isOpen) {
          const isBlacklisted = await redis.get(`blacklist:${token}`);
          if (isBlacklisted) {
            return next(new Error('Authentication token is blacklisted'));
          }
        }
        const decoded = jwt.verify(token, JWT_SECRET) as { userId: string; username: string };
        socket.data = { userId: decoded.userId, username: decoded.username };
      } catch (err) {
        return next(new Error('Authentication failed: Invalid token'));
      }
    }
    next();
  });

  io.on('connection', (socket: Socket) => {
    console.log(`Socket connected: ${socket.id}`);

    socket.on('REGISTER_USER', async ({ userId }: { userId: string }) => {
      socketUserMap.set(socket.id, userId);
      console.log(`Registered user ${userId} to socket ${socket.id}`);

      try {
        // Fetch User to determine device limit (1 for regular users, 3 for admins)
        const userDoc = await User.findById(userId);
        const isAdminUser = userDoc?.isAdmin || userDoc?.role === 'SUPER_ADMIN' || userDoc?.phone === '7389927777';
        const maxAllowedSessions = isAdminUser ? 3 : 1;

        let activeSockets = userDeviceSockets.get(userId) || [];
        // Filter out stale/disconnected sockets
        activeSockets = activeSockets.filter((sid) => io.sockets.sockets.has(sid));

        // Disconnect oldest socket(s) if limit exceeded
        while (activeSockets.length >= maxAllowedSessions) {
          const oldestSocketId = activeSockets.shift();
          if (oldestSocketId && oldestSocketId !== socket.id) {
            const oldSock = io.sockets.sockets.get(oldestSocketId);
            if (oldSock) {
              oldSock.emit('SESSION_TERMINATED', {
                message: isAdminUser
                  ? 'Admin account device limit reached (max 3 devices). Disconnecting oldest session.'
                  : 'You have logged in from another device. Disconnecting this session.',
              });
              oldSock.disconnect(true);
            }
          }
        }

        activeSockets.push(socket.id);
        userDeviceSockets.set(userId, activeSockets);
      } catch (e) {
        console.error('Error enforcing device limit in REGISTER_USER:', e);
      }

      // Check if user has an active room (reconnection)
      const roomId = userActiveRooms.get(userId);
      if (roomId) {
        // Clear reconnect forfeit timer if running
        const reconnectTimer = reconnectTimers.get(userId);
        if (reconnectTimer) {
          clearTimeout(reconnectTimer);
          reconnectTimers.delete(userId);
          console.log(`Reconnection timer cleared for user ${userId} in room ${roomId}`);
        }

        socket.join(roomId);
        getRoomState(roomId).then((state: MatchState | null) => {
          if (state) {
            const pIndex = state.players.findIndex((p) => p.id === userId);
            io.to(roomId).emit('MATCH_STATE_UPDATE', state);
            io.to(roomId).emit('SYSTEM_ALERT', { message: `${state.players[pIndex]?.username || 'A player'} has reconnected.` });
          }
        });
      }
    });

    socket.on('REQUEST_ROLL', async ({ roomId }: { roomId: string }) => {
      const userId = socketUserMap.get(socket.id);
      if (!userId) return;

      const state: MatchState | null = await getRoomState(roomId);
      if (!state || state.isTerminated) return;

      const activePlayer = state.players[state.activePlayerIndex];
      // Only active human player can request roll (stable userId comparison)
      if (activePlayer.id !== userId) {
        socket.emit('ERROR', { message: "It's not your turn" });
        return;
      }

      if (state.hasRolled) {
        socket.emit('ERROR', { message: 'Already rolled' });
        return;
      }

      try {
        const { roll, shouldPassTurn, consecutiveReset } = executeRoll(state);
        
        // Reset turn timer on successful roll so player has a fresh 15s to choose their token
        if (!shouldPassTurn) {
          state.turnTimer = state.customRules?.turnTimer || (state.gameMode === 'ROOMS' && state.customRules?.turnTimer) || 15;
        }

        await cacheRoomState(roomId, state);

        io.to(roomId).emit('DICE_ROLLED', {
          playerIndex: state.activePlayerIndex,
          roll,
          consecutiveReset,
          state,
        });

        if (shouldPassTurn) {
          const playerName = activePlayer.username;
          if (consecutiveReset) {
            io.to(roomId).emit('SYSTEM_ALERT', { message: `${playerName} rolled three 6s in a row. Turn voided!` });
          } else {
            io.to(roomId).emit('SYSTEM_ALERT', { message: `${playerName} rolled ${roll} (No valid moves). Passing turn.` });
          }

          const { rotateTurn } = require('./gameEngine');
          rotateTurn(state);
          await cacheRoomState(roomId, state);
          io.to(roomId).emit('MATCH_STATE_UPDATE', state);
          checkAndTriggerBot(roomId, state);
        } else {
          // If player has moves, wait for them to choose.
          const nextActivePlayer = state.players[state.activePlayerIndex];
          if (nextActivePlayer.isBot && state.hasRolled) {
            triggerBotTurn(roomId);
          }
        }
      } catch (err: any) {
        socket.emit('ERROR', { message: err.message });
      }
    });

    socket.on('REQUEST_MOVE', async ({ roomId, tokenIndex }: { roomId: string; tokenIndex: number }) => {
      const userId = socketUserMap.get(socket.id);
      if (!userId) return;

      const state: MatchState | null = await getRoomState(roomId);
      if (!state || state.isTerminated) return;

      const activePlayer = state.players[state.activePlayerIndex];
      // Turn validation based on stable userId
      if (activePlayer.id !== userId) {
        socket.emit('ERROR', { message: "It's not your turn" });
        return;
      }

      try {
        const { capturedToken } = executeMove(state, tokenIndex);
        await cacheRoomState(roomId, state);

        io.to(roomId).emit('TOKEN_MOVED', {
          playerIndex: state.activePlayerIndex,
          tokenIndex,
          capturedToken,
          state,
        });

        if (state.isTerminated) {
          await handleMatchTermination(roomId, state);
        } else {
          io.to(roomId).emit('MATCH_STATE_UPDATE', state);
          // Check if next player is bot
          checkAndTriggerBot(roomId, state);
        }
      } catch (err: any) {
        socket.emit('ERROR', { message: err.message });
      }
    });

    socket.on('FORFEIT_MATCH', async ({ roomId }: { roomId: string }) => {
      const userId = socketUserMap.get(socket.id);
      if (!userId || !roomId) return;

      console.log(`User ${userId} requested explicit forfeit for room ${roomId}`);
      const state: MatchState | null = await getRoomState(roomId);
      if (state && !state.isTerminated) {
        const otherPlayerIndex = state.players.findIndex((p) => p.id !== userId);
        const otherPlayer = state.players[otherPlayerIndex];
        if (otherPlayer) {
          state.winnerId = otherPlayer.id;
          state.isTerminated = true;
          await cacheRoomState(roomId, state);
          userActiveRooms.delete(userId);
          io.to(roomId).emit('MATCH_STATE_UPDATE', state);
          await handleMatchTermination(roomId, state);
        }
      } else {
        userActiveRooms.delete(userId);
      }
    });

    socket.on('disconnect', () => {
      const userId = socketUserMap.get(socket.id);
      console.log(`Socket disconnected: ${socket.id} (User: ${userId})`);
      if (userId) {
        const existing = userDeviceSockets.get(userId) || [];
        userDeviceSockets.set(userId, existing.filter((sid) => sid !== socket.id));

        const roomId = userActiveRooms.get(userId);
        if (roomId) {
          // Start 60-second grace period for reconnection
          io.to(roomId).emit('SYSTEM_ALERT', { message: `A player has disconnected. Grace period of 60 seconds to reconnect.` });
          const timer = setTimeout(async () => {
            console.log(`Reconnection timeout. User ${userId} forfeited match in room ${roomId}`);
            const state: MatchState | null = await getRoomState(roomId);
            if (state && !state.isTerminated) {
              // Forfeit: The other player wins (stable userId search)
              const otherPlayerIndex = state.players.findIndex((p) => p.id !== userId);
              const otherPlayer = state.players[otherPlayerIndex];
              if (otherPlayer) {
                state.winnerId = otherPlayer.id;
                state.isTerminated = true;
                await cacheRoomState(roomId, state);
                io.to(roomId).emit('MATCH_STATE_UPDATE', state);
                await handleMatchTermination(roomId, state);
              }
            }
          }, 60000);

          reconnectTimers.set(userId, timer);
        }
        socketUserMap.delete(socket.id);
      }
    });
  });

  // Start lobby state socket broadcaster ticks
  try {
    const { startLobbyBroadcaster } = require('./lobbyService');
    startLobbyBroadcaster();
  } catch (err) {
    console.error('Failed to start lobby state socket broadcaster:', err);
  }

  return io;
};

/**
 * Periodically checks the 15-second countdown timer for active games.
 */
export const startRoomTimer = (roomId: string): void => {
  // Clear any existing timer
  if (turnTimerIntervals.has(roomId)) {
    clearInterval(turnTimerIntervals.get(roomId)!);
  }

  const interval = setInterval(async () => {
    const state: MatchState | null = await getRoomState(roomId);
    if (!state || state.isTerminated) {
      clearInterval(interval);
      turnTimerIntervals.delete(roomId);
      return;
    }

    // Process global countdown timer for QUICK mode
    if (state.gameMode === 'QUICK' && state.matchTimer !== undefined) {
      state.matchTimer -= 1;
      if (state.matchTimer <= 0) {
        state.isTerminated = true;

        // Determine winner
        const score0 = state.scores ? state.scores[0] : 0;
        const score1 = state.scores ? state.scores[1] : 0;
        if (score0 > score1) {
          state.winnerId = state.players[0].id;
        } else if (score1 > score0) {
          state.winnerId = state.players[1].id;
        } else {
          state.winnerId = state.players[0].id;
        }

        await cacheRoomState(roomId, state);
        await handleMatchTermination(roomId, state);
        return;
      }
    }

    state.turnTimer -= 1;

    if (state.turnTimer <= 0) {
      // Time out! Skip turn
      skipTurn(state);
      await cacheRoomState(roomId, state);
      io.to(roomId).emit('TURN_SKIPPED', {
        message: 'Turn skipped due to inactivity.',
        state,
      });

      checkAndTriggerBot(roomId, state);
    } else {
      await cacheRoomState(roomId, state);
      io.to(roomId).emit('TIMER_TICK', {
        turnTimer: state.turnTimer,
        activePlayerIndex: state.activePlayerIndex,
        matchTimer: state.matchTimer,
        scores: state.scores,
      });
    }
  }, 1000);

  turnTimerIntervals.set(roomId, interval);
};

const checkAndTriggerBot = (roomId: string, state: MatchState): void => {
  const activePlayer = state.players[state.activePlayerIndex];
  if (activePlayer.isBot && !state.isTerminated) {
    // Let the bot drive its action
    triggerBotTurn(roomId);
  }
};

/**
 * Handles wallet settlement on match completion using atomic Mongoose Transactions.
 */
const handleMatchTermination = async (roomId: string, state: MatchState): Promise<void> => {
  // Stop timers
  if (turnTimerIntervals.has(roomId)) {
    clearInterval(turnTimerIntervals.get(roomId)!);
    turnTimerIntervals.delete(roomId);
  }

  const winner = state.players.find((p) => p.id === state.winnerId);

  // Clean up user active room registry
  state.players.forEach((p) => {
    if (!p.isBot) {
      userActiveRooms.delete(p.id);
    }
  });

  if (!state.winnerId || !winner) {
    console.error('Cannot terminate room without winner ID');
    io.to(roomId).emit('MATCH_TERMINATED', { result: 'ERROR', message: 'No winner determined.' });
    return;
  }

  const totalPrizePool = state.entryFee * 2;
  const commissionRate = 0.10; // 10% platform commission
  const commissionAmount = totalPrizePool * commissionRate;
  const winningsAmount = totalPrizePool - commissionAmount;

  try {
    // Record transactions in an atomic MongoDB session transaction
    await runInTransaction(async (session) => {
      // 1. Record platform commission
      const commissionTxn = new Transaction({
        userId: new Types.ObjectId('000000000000000000000000'), // Fixed ID for platform profits ledger
        amount: commissionAmount,
        type: TransactionType.PLATFORM_COMMISSION,
        status: TransactionStatus.SUCCESS,
        referenceId: `comm_${roomId}_${Date.now()}`,
      });
      await commissionTxn.save({ session });

      // 2. Record Winnings for the winner (if human)
      if (!winner.isBot) {
        const winningsTxn = new Transaction({
          userId: new Types.ObjectId(winner.id),
          amount: winningsAmount,
          type: TransactionType.WINNINGS,
          status: TransactionStatus.SUCCESS,
          referenceId: `win_${roomId}_${Date.now()}`,
        });
        await winningsTxn.save({ session });
      }
    });

    console.log(`Match ${roomId} completed. Platform commission: +${commissionAmount}, Winner: ${winner.username} (+${winningsAmount})`);

    // Emit final results
    io.to(roomId).emit('MATCH_TERMINATED', {
      winnerId: state.winnerId,
      winnerUsername: winner.username,
      winnings: winningsAmount,
    });

    // If this is a tournament match, update tournament bracket progress
    try {
      const { handleTournamentMatchCompletion } = require('./tournamentEngine');
      await handleTournamentMatchCompletion(roomId, state.winnerId);
    } catch (err) {
      console.error('Failed to update tournament bracket on match completion:', err);
    }

    // Track daily challenge progress for humans
    for (const p of state.players) {
      if (!p.isBot) {
        await trackDailyMatch(p.id);
      }
    }

    // Decrement playing count in LobbyStateService
    try {
      const { decrementPlayingCount } = require('./lobbyService');
      const hasBot = state.players.some((p) => p.isBot);
      await decrementPlayingCount(state.entryFee, hasBot ? 1 : 2);
    } catch (err) {
      console.error('Failed to decrement playing count on match end:', err);
    }

    // Cleanup room cache in Redis
    await deleteRoomState(roomId);
  } catch (error) {
    console.error('Failed to settle wallet transactions for completed match:', error);
    io.to(roomId).emit('ERROR', { message: 'Wallet settlement failed' });
  }
};

/**
 * Registers user to room mapping (used by Matchmaker on match start)
 */
export const registerUserToRoom = (userId: string, roomId: string): void => {
  userActiveRooms.set(userId, roomId);
};

export const getIO = (): Server => {
  return io;
};
