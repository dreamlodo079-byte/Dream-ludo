import { Server, Socket } from 'socket.io';
import { getRoomState, cacheRoomState, deleteRoomState, getRedisClient, createDuplicateRedisClient } from '../config/redis';
import { createAdapter } from '@socket.io/redis-adapter';
import { runWithRoomLock } from '../utils/mutex';
import {
  MatchState,
  executeRoll,
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

// Map of roomId -> NodeJS.Timeout for the 10-second turn timer
const turnTimerIntervals = new Map<string, NodeJS.Timeout>();

// Map of userId -> NodeJS.Timeout for the 60-second reconnection grace period
const reconnectTimers = new Map<string, NodeJS.Timeout>();

// Map of roomId -> NodeJS.Timeout for the 5-second handshake timer
const handshakeTimers = new Map<string, NodeJS.Timeout>();

export const setHandshakeTimer = (roomId: string, timer: NodeJS.Timeout): void => {
  handshakeTimers.set(roomId, timer);
};

export const clearHandshakeTimer = (roomId: string): void => {
  const timer = handshakeTimers.get(roomId);
  if (timer) {
    clearTimeout(timer);
    handshakeTimers.delete(roomId);
  }
};

// Map of userId -> current active roomId
const userActiveRooms = new Map<string, string>();

// Map of socketId -> userId
const socketUserMap = new Map<string, string>();

// Map of userId -> array of active socketIds (for multi-device concurrent session enforcement)
const userDeviceSockets = new Map<string, string[]>();

export const initializeSocketIO = async (server: any): Promise<Server> => {
  io = new Server(server, {
    transports: ['websocket', 'polling'],
    pingInterval: 10000,
    pingTimeout: 5000,
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
        const isAdminUser =
          userDoc?.isAdmin ||
          userDoc?.role === 'SUPER_ADMIN' ||
          userDoc?.phone === '7389927777' ||
          userDoc?.phone === '7024065858' ||
          userDoc?.phone === '9302561971';
        const maxAllowedSessions = isAdminUser ? 3 : 1;

        let activeSockets = userDeviceSockets.get(userId) || [];
        // Filter out stale/disconnected sockets
        activeSockets = activeSockets.filter((sid) => io.sockets.sockets.has(sid));

        // Disconnect oldest socket(s) if limit exceeded
        while (activeSockets.length >= maxAllowedSessions) {
          const oldestSocketId = activeSockets.shift();
          if (oldestSocketId && oldestSocketId !== socket.id) {
            io.to(oldestSocketId).emit('SESSION_TERMINATED', {
              message: isAdminUser
                ? 'Admin account device limit reached (max 3 devices). Disconnecting oldest session.'
                : 'You have logged in from another device. Disconnecting this session.',
            });
            io.in(oldestSocketId).disconnectSockets(true);
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

    socket.on('READY_TO_ENTER', async ({ roomId }: { roomId: string }) => {
      const userId = socketUserMap.get(socket.id);
      if (!userId || !roomId) return;

      const state: MatchState | null = await getRoomState(roomId);
      if (!state || state.status !== 'MATCH_PENDING' || state.isTerminated) return;

      const pIndex = state.players.findIndex((p) => p.id === userId);
      if (pIndex !== -1) {
        state.players[pIndex].ready = true;
        await cacheRoomState(roomId, state);
        console.log(`Player ${userId} marked ready in room ${roomId}`);
      }

      // Check if both players (or all human players) are ready
      const allReady = state.players.every((p) => p.isBot || p.ready);
      if (allReady) {
        clearHandshakeTimer(roomId);
        state.status = 'ACTIVE';
        await cacheRoomState(roomId, state);

        console.log(`Handshake succeeded for room ${roomId}. Starting game.`);

        // Emit START_MATCH_GAME to the room
        io.to(roomId).emit('START_MATCH_GAME', { roomId, state });

        // Start turn countdown timer
        startRoomTimer(roomId);

        // Trigger bot turn if needed (unlikely on dual ready, but safe fallback)
        const activePlayer = state.players[state.activePlayerIndex];
        if (activePlayer.isBot) {
          triggerBotTurn(roomId);
        }
      }
    });

    socket.on('REQUEST_ROLL', async ({ roomId }: { roomId: string }) => {
      runWithRoomLock(roomId, async () => {
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

      if (state.transitionPending) {
        socket.emit('ERROR', { message: 'Please wait for the pawn movement animation to complete' });
        return;
      }

      if (state.hasRolled) {
        socket.emit('ERROR', { message: 'Already rolled' });
        return;
      }

      try {
        const { roll, shouldPassTurn, consecutiveReset } = executeRoll(state);
        
        // Reset turn timer on successful roll so player has a fresh 10s to choose their token
        if (!shouldPassTurn) {
          state.turnTimer = state.customRules?.turnTimer || (state.gameMode === 'ROOMS' && state.customRules?.turnTimer) || 10;
        }

        await cacheRoomState(roomId, state);

        io.to(roomId).emit('DICE_ROLLED', {
          playerIndex: state.activePlayerIndex,
          roll,
          consecutiveReset,
          state,
        });

        if (shouldPassTurn) {
          if (consecutiveReset) {
            // We can keep this alert or remove it. The user just said "Turn skipped, User rolled 3 invalid move turn skipped".
            // Let's remove the alerts completely as requested to keep it smooth.
          }
          
          // Set transition to give clients time to animate the dice roll before passing turn
          state.transitionPending = true;
          await cacheRoomState(roomId, state);
          
          setTimeout(() => {
            runWithRoomLock(roomId, async () => {
              try {
                const latestState: MatchState | null = await getRoomState(roomId);
                if (!latestState || latestState.isTerminated) return;

                const { rotateTurn } = require('./gameEngine');
                rotateTurn(latestState);
                latestState.transitionPending = false;
                await cacheRoomState(roomId, latestState);
                io.to(roomId).emit('MATCH_STATE_UPDATE', latestState);
                checkAndTriggerBot(roomId, latestState);
              } catch (err) {
                console.error(`Error finalizing skipped turn for room ${roomId}:`, err);
              }
            });
          }, 1500);

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
    });

    socket.on('REQUEST_MOVE', async ({ roomId, tokenIndex }: { roomId: string; tokenIndex: number }) => {
      runWithRoomLock(roomId, async () => {
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

      if (state.transitionPending) {
        socket.emit('ERROR', { message: 'Please wait for the pawn movement animation to complete' });
        return;
      }

      try {
        const { executeMove, rotateTurn } = require('./gameEngine');
        const roll = state.diceRoll || 1;
        const { capturedToken, getsBonusRoll } = executeMove(state, tokenIndex);
        state.transitionPending = true;
        await cacheRoomState(roomId, state);

        io.to(roomId).emit('TOKEN_MOVED', {
          playerIndex: state.activePlayerIndex,
          tokenIndex,
          capturedToken,
          state,
        });

        // Delay switching dynamically to give clients time to animate the move
        let transitionDelay = roll * 280 + 350;
        if (capturedToken) {
          transitionDelay += 950;
        }
        
        setTimeout(() => {
          runWithRoomLock(roomId, async () => {
            try {
              const latestState: MatchState | null = await getRoomState(roomId);
              if (!latestState || latestState.isTerminated) return;

              if (latestState.winnerId) {
                await handleMatchTermination(roomId, latestState);
              } else {
                latestState.transitionPending = false;
                if (getsBonusRoll) {
                  latestState.hasRolled = false;
                  latestState.diceRoll = null;
                  latestState.turnTimer = latestState.customRules?.turnTimer || (latestState.gameMode === 'ROOMS' && latestState.customRules?.turnTimer) || 10;
                } else {
                  rotateTurn(latestState);
                }

                await cacheRoomState(roomId, latestState);
                io.to(roomId).emit('MATCH_STATE_UPDATE', latestState);
                checkAndTriggerBot(roomId, latestState);
              }
            } catch (err) {
              console.error(`Error finalizing delayed turn transition for room ${roomId}:`, err);
            }
          });
        }, transitionDelay);

        } catch (err: any) {
          socket.emit('ERROR', { message: err.message });
        }
      });
    });

    socket.on('FORFEIT_MATCH', async ({ roomId }: { roomId: string }) => {
      runWithRoomLock(roomId, async () => {
        const userId = socketUserMap.get(socket.id);
        if (!userId || !roomId) return;


        console.log(`User ${userId} requested explicit forfeit for room ${roomId}`);
        const state: MatchState | null = await getRoomState(roomId);
        if (state && !state.isTerminated) {
          const pIndex = state.players.findIndex((p) => p.id === userId);
          if (pIndex !== -1) {
            state.players[pIndex].hasLeft = true;
            const activeHumans = state.players.filter((p) => !p.hasLeft && !p.isBot);
            
            if (activeHumans.length <= 1) {
              state.winnerId = activeHumans.length === 1 ? activeHumans[0].id : state.players.find(p => p.id !== userId)?.id || state.players[0].id;
              state.isTerminated = true;
              await cacheRoomState(roomId, state);
              userActiveRooms.delete(userId);
              socket.leave(roomId);
              io.to(roomId).emit('MATCH_STATE_UPDATE', state);
              await handleMatchTermination(roomId, state);
            } else {
              if (state.activePlayerIndex === pIndex) {
                const { rotateTurn } = require('./gameEngine');
                rotateTurn(state);
              }
              await cacheRoomState(roomId, state);
              userActiveRooms.delete(userId);
              socket.leave(roomId);
              io.to(roomId).emit('MATCH_STATE_UPDATE', state);
              
              const nextPlayer = state.players[state.activePlayerIndex];
              if (nextPlayer.isBot) {
                const { triggerBotTurn } = require('./botDriver');
                triggerBotTurn(roomId);
              }
            }
          }
        } else {
          userActiveRooms.delete(userId);
          socket.leave(roomId);
        }
      });
    });

    socket.on('disconnect', () => {
      const userId = socketUserMap.get(socket.id);
      console.log(`Socket disconnected: ${socket.id} (User: ${userId})`);
      if (userId) {
        const existing = userDeviceSockets.get(userId) || [];
        userDeviceSockets.set(userId, existing.filter((sid) => sid !== socket.id));

        const roomId = userActiveRooms.get(userId);
        if (roomId) {
          getRoomState(roomId).then(async (state) => {
            if (state && state.status === 'MATCH_PENDING') {
              console.log(`User ${userId} disconnected during handshake in room ${roomId}. Aborting match.`);
              await handleHandshakeTimeout(roomId);
              return;
            }

            // Start 60-second grace period for reconnection
            io.to(roomId).emit('SYSTEM_ALERT', { message: `A player has disconnected. Grace period of 60 seconds to reconnect.` });
            const timer = setTimeout(async () => {
              console.log(`Reconnection timeout. User ${userId} forfeited match in room ${roomId}`);
              const latestState: MatchState | null = await getRoomState(roomId);
              if (latestState && !latestState.isTerminated) {
                // Forfeit: The other player wins (stable userId search)
                const pIndex = latestState.players.findIndex((p) => p.id === userId);
                if (pIndex !== -1) {
                  latestState.players[pIndex].hasLeft = true;
                  const activeHumans = latestState.players.filter((p) => !p.hasLeft && !p.isBot);
                  
                  if (activeHumans.length <= 1) {
                    latestState.winnerId = activeHumans.length === 1 ? activeHumans[0].id : latestState.players.find(p => p.id !== userId)?.id || latestState.players[0].id;
                    latestState.isTerminated = true;
                    await cacheRoomState(roomId, latestState);
                    io.to(roomId).emit('MATCH_STATE_UPDATE', latestState);
                    await handleMatchTermination(roomId, latestState);
                  } else {
                    if (latestState.activePlayerIndex === pIndex) {
                      const { rotateTurn } = require('./gameEngine');
                      rotateTurn(latestState);
                    }
                    await cacheRoomState(roomId, latestState);
                    io.to(roomId).emit('MATCH_STATE_UPDATE', latestState);
                    
                    const nextPlayer = latestState.players[latestState.activePlayerIndex];
                    if (nextPlayer.isBot) {
                      const { triggerBotTurn } = require('./botDriver');
                      triggerBotTurn(roomId);
                    }
                  }
                }
              }
            }, 60000);

            reconnectTimers.set(userId, timer);
          });
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
 * Periodically checks the 10-second countdown timer for active games.
 */
export const startRoomTimer = (roomId: string): void => {
  // Clear any existing timer
  if (turnTimerIntervals.has(roomId)) {
    clearInterval(turnTimerIntervals.get(roomId)!);
  }

  const interval = setInterval(() => {
    runWithRoomLock(roomId, async () => {
      try {
        const state: MatchState | null = await getRoomState(roomId);
        if (!state || state.isTerminated) {
        clearInterval(interval);
        turnTimerIntervals.delete(roomId);
        return;
      }

      // Process global countdown timer for active match modes
      if (state.matchTimer !== undefined) {
        state.matchTimer -= 1;
        if (state.matchTimer <= 0) {
          state.isTerminated = true;

          // Determine winner using score and tie-breaker rules
          const score0 = state.scores ? state.scores[0] : 0;
          const score1 = state.scores ? state.scores[1] : 0;

          if (score0 > score1) {
            state.winnerId = state.players[0].id;
          } else if (score1 > score0) {
            state.winnerId = state.players[1].id;
          } else {
            // TIE-BREAKER 1: Compare tokens at home (56)
            const home0 = state.players[0].tokens.filter(pos => pos === 56).length;
            const home1 = state.players[1].tokens.filter(pos => pos === 56).length;

            if (home0 > home1) {
              state.winnerId = state.players[0].id;
            } else if (home1 > home0) {
              state.winnerId = state.players[1].id;
            } else {
              // TIE-BREAKER 2: Compare overall progress (sum of positions)
              const progress0 = state.players[0].tokens.reduce((acc, pos) => acc + (pos === -1 ? 0 : pos), 0);
              const progress1 = state.players[1].tokens.reduce((acc, pos) => acc + (pos === -1 ? 0 : pos), 0);

              if (progress0 > progress1) {
                state.winnerId = state.players[0].id;
              } else if (progress1 > progress0) {
                state.winnerId = state.players[1].id;
              } else {
                // Fallback
                state.winnerId = state.players[0].id;
              }
            }
          }

          await cacheRoomState(roomId, state);
          await handleMatchTermination(roomId, state);
          return;
        }
      }

      // Safeguard turnTimer against NaN or non-number types
      if (typeof state.turnTimer !== 'number' || isNaN(state.turnTimer)) {
        state.turnTimer = 10;
      }

      state.turnTimer -= 1;

      if (state.turnTimer <= 0) {
        // Time out! Skip turn
        const pIndex = state.activePlayerIndex;
        const player = state.players[pIndex];
        player.missedTurns = (player.missedTurns || 0) + 1;
        
        let message = 'Turn skipped due to inactivity.';
        if (player.missedTurns >= 3) {
          player.hasLeft = true;
          message = 'You missed 3 turns and forfeited.';
          const activeHumans = state.players.filter((p) => !p.hasLeft && !p.isBot);
          
          if (activeHumans.length <= 1) {
            state.winnerId = activeHumans.length === 1 ? activeHumans[0].id : state.players.find(p => !p.hasLeft)?.id || state.players[0].id;
            state.isTerminated = true;
          } else {
            skipTurn(state);
          }
        } else {
          skipTurn(state);
        }

        await cacheRoomState(roomId, state);
        io.to(roomId).emit('TURN_SKIPPED', {
          message,
          state: state,
          skippedPlayerId: player.id,
        });

        if (state.isTerminated) {
          await handleMatchTermination(roomId, state);
          return;
        }

        checkAndTriggerBot(roomId, state);
      } else {
        // Save the updated timer to Redis
        await cacheRoomState(roomId, state);

        io.to(roomId).emit('TIMER_TICK', {
          turnTimer: state.turnTimer,
          activePlayerIndex: state.activePlayerIndex,
          matchTimer: state.matchTimer,
          scores: state.scores,
        });
      }
    } catch (error) {
      console.error(`Error in room timer tick for room ${roomId}:`, error);
    }
    });
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
  const commissionRate = 0.10; // 10% platform profit commission
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

      // 2. Record Winnings for the winner (if human) & credit 2% lifetime commission to referrer
      if (!winner.isBot) {
        const winningsTxn = new Transaction({
          userId: new Types.ObjectId(winner.id),
          amount: winningsAmount,
          type: TransactionType.WINNINGS,
          status: TransactionStatus.SUCCESS,
          referenceId: `win_${roomId}_${Date.now()}`,
        });
        await winningsTxn.save({ session });

        // Credit 2% lifetime winnings commission to winner's referrer
        try {
          const winnerUser = await User.findById(winner.id).session(session);
          if (winnerUser && winnerUser.referredBy) {
            const referrer = await User.findOne({
              $or: [
                { referralCode: winnerUser.referredBy },
                ...(Types.ObjectId.isValid(winnerUser.referredBy) ? [{ _id: new Types.ObjectId(winnerUser.referredBy) }] : [])
              ]
            }).session(session);

            if (referrer && referrer._id.toString() !== winnerUser._id.toString()) {
              const referralComm = Math.round((winningsAmount * 0.02) * 100) / 100;
              if (referralComm > 0) {
                const refCommTxn = new Transaction({
                  userId: referrer._id,
                  amount: referralComm,
                  type: TransactionType.REFERRAL_COMMISSION,
                  status: TransactionStatus.SUCCESS,
                  referenceId: `ref_comm_${roomId}_${winner.id}_${Date.now()}`,
                });
                await refCommTxn.save({ session });
                console.log(`[Referral Lifetime 2%] Credited ₹${referralComm} (2% of ₹${winningsAmount}) to referrer ${referrer.username} for winner ${winnerUser.username}`);
              }
            }
          }
        } catch (refErr) {
          console.error('Error processing lifetime referral commission:', refErr);
        }
      }

      // Check and update promoter state
      for (const p of state.players) {
        if (p.isBot) continue;
        const playerDoc = await User.findById(p.id).session(session);
        if (playerDoc && playerDoc.isPromoter) {
          const stakeKey = `stake_${state.entryFee}`;
          let currentPromoState = 'MUST_LOSE';
          if (playerDoc.promoMatchState) {
            if (typeof playerDoc.promoMatchState.get === 'function') {
              currentPromoState = playerDoc.promoMatchState.get(stakeKey) || 'MUST_LOSE';
            } else {
              currentPromoState = playerDoc.promoMatchState[stakeKey] || 'MUST_LOSE';
            }
          }

          const isWinner = p.id === winner.id;
          const newPromoState = isWinner ? 'MUST_LOSE' : 'MUST_WIN';

          if (!playerDoc.promoMatchState) {
            playerDoc.promoMatchState = {};
          }
          if (typeof playerDoc.promoMatchState.set === 'function') {
            playerDoc.promoMatchState.set(stakeKey, newPromoState);
          } else {
            playerDoc.promoMatchState[stakeKey] = newPromoState;
          }
          playerDoc.markModified('promoMatchState');
          await playerDoc.save({ session });
          console.log(`Flipped promoter ${p.id} stake ${state.entryFee} state from ${currentPromoState} to ${newPromoState} (Won: ${isWinner}) in regular match`);
        }
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
  const activeSockets = userDeviceSockets.get(userId) || [];
  activeSockets.forEach((sid) => {
    const sock = io?.sockets.sockets.get(sid);
    if (sock) {
      sock.join(roomId);
    }
  });
};

export const getIO = (): Server => {
  return io;
};

export const broadcastTournamentUpdate = async (): Promise<void> => {
  try {
    const { Tournament, TournamentStatus } = require('../models/Tournament');
    const list = await Tournament.find({
      status: { $in: [TournamentStatus.UPCOMING, TournamentStatus.ACTIVE] },
    }).sort({ endsAt: 1 });
    if (io) {
      io.emit('TOURNAMENTS_UPDATED', { tournaments: list });
      console.log(`Broadcasted TOURNAMENTS_UPDATED to all connected clients (${list.length} active tournaments)`);
    }
  } catch (err) {
    console.error('Error broadcasting tournament updates:', err);
  }
};

export const handleHandshakeTimeout = async (roomId: string): Promise<void> => {
  clearHandshakeTimer(roomId);
  const state: MatchState | null = await getRoomState(roomId);
  if (!state || state.status === 'ACTIVE' || state.isTerminated) return;

  console.log(`Handshake timed out/cancelled for room ${roomId}. Performing re-queue/refund routines.`);

  // Mark state as terminated so no further actions are processed
  state.isTerminated = true;
  await cacheRoomState(roomId, state);

  const redis = getRedisClient();
  const { refundEntryFee } = require('./matchmaker');

  for (const player of state.players) {
    if (player.isBot) continue;

    // Disconnect user socket from room mapping
    userActiveRooms.delete(player.id);

    // Get player's active socket connections
    const sids = userDeviceSockets.get(player.id) || [];
    
    if (player.ready) {
      // 1. Re-queue the ready player to the front of their matchmaking tier (high-priority slot)
      const queueKey = `queue:tier_${state.entryFee}_mode_${state.gameMode || 'REGULAR'}`;
      const queueUser = {
        userId: player.id,
        username: player.username,
        socketId: player.socketId || (sids[0] || ''),
        joinedAt: player.joinedAt || Date.now(),
        gameMode: state.gameMode,
        queueId: player.queueId,
      };

      if (redis) {
        await redis.lPush(queueKey, JSON.stringify(queueUser));
        console.log(`Returned ready player ${player.username} (${player.id}) to front of queue: ${queueKey}`);
      }

      // Notify player of handshake timeout, telling them they are re-queued
      sids.forEach((sid) => {
        const sock = io.sockets.sockets.get(sid);
        if (sock) {
          sock.emit('MATCH_HANDSHAKE_TIMEOUT', {
            roomId,
            reason: 'Opponent failed to connect. Searching for a new match...',
            action: 'RE-ENTER_QUEUE',
          });
        }
      });
    } else {
      // 2. Refund the player who timed out/failed to join
      if (player.queueId) {
        console.log(`Refunding timed out player ${player.username} (${player.id}) for queue session ${player.queueId}`);
        try {
          await runInTransaction(async (session) => {
            await refundEntryFee(player.id, state.entryFee, player.queueId!, session);
          });
        } catch (err) {
          console.error(`Refund transaction failed for user ${player.id} on handshake timeout:`, err);
        }
      }

      // Notify player of handshake timeout, telling them search is dismissed
      sids.forEach((sid) => {
        const sock = io.sockets.sockets.get(sid);
        if (sock) {
          sock.emit('MATCH_HANDSHAKE_TIMEOUT', {
            roomId,
            reason: 'Connection handshake timed out.',
            action: 'DISMISS',
          });
        }
      });
    }
  }

  // Cleanup room state from Redis cache
  await deleteRoomState(roomId);
};
