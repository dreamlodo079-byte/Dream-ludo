import { getRoomState, cacheRoomState, deleteRoomState } from '../config/redis';
import { MatchState, executeRoll, executeMove, getValidMoves, getCommonIndex, rotateTurn } from './gameEngine';
import { getIO } from './socketManager';
import { runInTransaction } from '../config/db';
import { Transaction, TransactionType, TransactionStatus } from '../models/Transaction';
import { Types } from 'mongoose';
import { trackDailyMatch } from './challengeTracker';

// Safe zone common indices
const SAFE_COMMON_INDICES = [0, 8, 13, 21, 26, 34, 39, 47];

/**
 * Triggers a bot action (roll or move) with a human-like delay (1.5s - 3.0s).
 */
export const triggerBotTurn = (roomId: string): void => {
  const delay = Math.random() * 1500 + 1500; // 1500ms to 3000ms delay

  setTimeout(async () => {
    try {
      const state: MatchState | null = await getRoomState(roomId);
      if (!state || state.isTerminated) return;

      const activePlayer = state.players[state.activePlayerIndex];
      if (!activePlayer.isBot) return; // Verify active player is still a bot

      const io = getIO();

      if (!state.hasRolled) {
        // Roll Phase
        const { roll, shouldPassTurn, consecutiveReset } = executeRoll(state);
        await cacheRoomState(roomId, state);

        io.to(roomId).emit('DICE_ROLLED', {
          playerIndex: state.activePlayerIndex,
          roll,
          consecutiveReset,
          state,
        });

        if (shouldPassTurn) {
          io.to(roomId).emit('MATCH_STATE_UPDATE', state);
          // If turn shifted to another bot (unlikely in 1v1 unless bot rolled 3 6s), trigger bot turn
          const nextPlayer = state.players[state.activePlayerIndex];
          if (nextPlayer.isBot) {
            triggerBotTurn(roomId);
          }
        } else {
          // Trigger next phase (move)
          io.to(roomId).emit('MATCH_STATE_UPDATE', state);
          triggerBotTurn(roomId);
        }
      } else {
        // Move Phase
        if (state.diceRoll === null) return;

        const validMoves = getValidMoves(state, state.diceRoll);
        if (validMoves.length === 0) {
          // This should have been handled in roll, but safeguard here
          rotateTurn(state);
          await cacheRoomState(roomId, state);
          io.to(roomId).emit('MATCH_STATE_UPDATE', state);

          const nextPlayer = state.players[state.activePlayerIndex];
          if (nextPlayer.isBot) {
            triggerBotTurn(roomId);
          }
          return;
        }

        // Determine which token to move using weighted matrix logic
        const selectedTokenIndex = selectBotTokenWeighted(state, validMoves);

        const { capturedToken } = executeMove(state, selectedTokenIndex);
        await cacheRoomState(roomId, state);

        io.to(roomId).emit('TOKEN_MOVED', {
          playerIndex: state.activePlayerIndex,
          tokenIndex: selectedTokenIndex,
          capturedToken,
          state,
        });

        if (state.isTerminated) {
          await handleBotMatchTermination(roomId, state);
        } else {
          io.to(roomId).emit('MATCH_STATE_UPDATE', state);
          const nextPlayer = state.players[state.activePlayerIndex];
          if (nextPlayer.isBot) {
            triggerBotTurn(roomId);
          }
        }
      }
    } catch (err) {
      console.error(`Error executing bot turn in room ${roomId}:`, err);
    }
  }, delay);
};

/**
 * Weighted strategic selection of token movements to emulate human players.
 * Can make mistakes.
 */
const selectBotTokenWeighted = (state: MatchState, validMoves: number[]): number => {
  if (validMoves.length === 1) return validMoves[0];

  const botIndex = state.activePlayerIndex;
  const bot = state.players[botIndex];
  const opponentIndex = (botIndex + 1) % state.players.length;
  const opponent = state.players[opponentIndex];
  const roll = state.diceRoll!;

  // Map each valid move to a weight
  const moveWeights = validMoves.map((tokenIndex) => {
    const currentPos = bot.tokens[tokenIndex];
    let weight = 15; // default low base weight

    // 1. Release token: moderately high preference
    if (currentPos === -1 && roll === 6) {
      weight = 50;
    }

    const nextPos = currentPos + roll;

    if (nextPos <= 56) {
      // 2. Can cut/capture opponent: extremely high preference (80 weight)
      const nextCommonIndex = getCommonIndex(botIndex, nextPos);
      if (nextCommonIndex !== -1 && !SAFE_COMMON_INDICES.includes(nextCommonIndex)) {
        const canCapture = opponent.tokens.some((oppPos) => {
          return getCommonIndex(opponentIndex, oppPos) === nextCommonIndex;
        });
        if (canCapture) {
          weight = 90; // High priority capture
        }
      }

      // 3. Can reach home terminal (56): very high preference (75 weight)
      if (nextPos === 56) {
        weight = 80;
      }

      // 4. Entering safe zone: medium preference (45 weight)
      if (nextCommonIndex !== -1 && SAFE_COMMON_INDICES.includes(nextCommonIndex)) {
        weight = 45;
      }

      // 5. Escaping a danger spot (if current position is exposed to opponent capture)
      const currentCommonIndex = getCommonIndex(botIndex, currentPos);
      if (currentCommonIndex !== -1 && !SAFE_COMMON_INDICES.includes(currentCommonIndex)) {
        const isExposed = opponent.tokens.some((oppPos) => {
          const oppCommon = getCommonIndex(opponentIndex, oppPos);
          // Check if opponent is within a 6-roll range
          if (oppCommon === -1) return false;
          const dist = (currentCommonIndex - oppCommon + 52) % 52;
          return dist > 0 && dist <= 6;
        });
        if (isExposed) {
          weight += 20; // Save token priority
        }
      }
    }

    return { tokenIndex, weight };
  });

  // Calculate sum of weights
  const totalWeight = moveWeights.reduce((sum, item) => sum + item.weight, 0);

  // Roll random number
  let randomVal = Math.random() * totalWeight;

  for (const item of moveWeights) {
    randomVal -= item.weight;
    if (randomVal <= 0) {
      return item.tokenIndex;
    }
  }

  return validMoves[0];
};

/**
 * Handle termination inside bot logic to avoid import loops
 */
const handleBotMatchTermination = async (roomId: string, state: MatchState): Promise<void> => {
  const io = getIO();
  const winner = state.players.find((p) => p.id === state.winnerId);

  if (!state.winnerId || !winner) return;

  const totalPrizePool = state.entryFee * 2;
  const commissionRate = 0.10; // 10% platform commission
  const commissionAmount = totalPrizePool * commissionRate;
  const winningsAmount = totalPrizePool - commissionAmount;

  try {
    // Record transactions in an atomic MongoDB session transaction
    await runInTransaction(async (session) => {
      // Platform commission
      const commissionTxn = new Transaction({
        userId: new Types.ObjectId('000000000000000000000000'),
        amount: commissionAmount,
        type: TransactionType.PLATFORM_COMMISSION,
        status: TransactionStatus.SUCCESS,
        referenceId: `comm_${roomId}_${Date.now()}`,
      });
      await commissionTxn.save({ session });

      // Winner winnings (if human)
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

    console.log(`Bot Match ${roomId} completed. Platform commission: +${commissionAmount}, Winner: ${winner.username} (+${winningsAmount})`);

    // Emit final results
    io.to(roomId).emit('MATCH_TERMINATED', {
      winnerId: state.winnerId,
      winnerUsername: winner.username,
      winnings: winningsAmount,
    });

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
      console.error('Failed to decrement playing count on bot match end:', err);
    }

    // Cleanup room cache in Redis
    await deleteRoomState(roomId);
  } catch (error) {
    console.error('Failed to settle wallet transactions for completed bot match:', error);
  }
};
