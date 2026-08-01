import { getRoomState, cacheRoomState, deleteRoomState } from '../config/redis';
import { MatchState, executeRoll, executeMove, getValidMoves, getCommonIndex, rotateTurn } from './gameEngine';
import { getIO } from './socketManager';
import { runWithRoomLock } from '../utils/mutex';
import { runInTransaction } from '../config/db';
import { Transaction, TransactionType, TransactionStatus } from '../models/Transaction';
import { Types } from 'mongoose';
import { trackDailyMatch } from './challengeTracker';

import { User } from '../models/User';

// Safe zone common indices (aligned with gameEngine.ts stars)
const SAFE_COMMON_INDICES = [1, 9, 14, 22, 27, 35, 40, 48];

/**
 * Triggers a bot action (roll or move) with a human-like delay (1.5s - 3.0s).
 */
export const triggerBotTurn = (roomId: string): void => {
  const delay = Math.random() * 1500 + 1500; // 1500ms to 3000ms delay

  setTimeout(() => {
    runWithRoomLock(roomId, async () => {
      try {
        const state: MatchState | null = await getRoomState(roomId);
        if (!state || state.isTerminated) return;

        const activePlayer = state.players[state.activePlayerIndex];
        if (!activePlayer.isBot) return; // Verify active player is still a bot

        const io = getIO();

        if (!state.hasRolled) {
          // Roll Phase
          const { roll, shouldPassTurn, consecutiveReset } = executeRoll(state);
          
          // Reset turn timer on successful roll so bot has a fresh 15s to choose its token
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
            if (consecutiveReset) {
              io.to(roomId).emit('SYSTEM_ALERT', { message: `${activePlayer.username} rolled three 6s in a row. Turn voided!` });
            } else {
              io.to(roomId).emit('SYSTEM_ALERT', { message: `${activePlayer.username} rolled ${roll} (No valid moves). Passing turn.` });
            }

            rotateTurn(state);
            await cacheRoomState(roomId, state);
            io.to(roomId).emit('MATCH_STATE_UPDATE', state);
            
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

          const { capturedToken, getsBonusRoll } = executeMove(state, selectedTokenIndex);
          state.transitionPending = true;
          await cacheRoomState(roomId, state);

          io.to(roomId).emit('TOKEN_MOVED', {
            playerIndex: state.activePlayerIndex,
            tokenIndex: selectedTokenIndex,
            capturedToken,
            state,
          });

          const transitionDelay = capturedToken ? 1800 : 1200;
          setTimeout(() => {
            runWithRoomLock(roomId, async () => {
              try {
                const latestState: MatchState | null = await getRoomState(roomId);
                if (!latestState || latestState.isTerminated) return;

                if (latestState.winnerId) {
                  await handleBotMatchTermination(roomId, latestState);
                } else {
                  latestState.transitionPending = false;
                  if (getsBonusRoll) {
                    latestState.hasRolled = false;
                    latestState.diceRoll = null;
                    latestState.turnTimer = latestState.customRules?.turnTimer || (latestState.gameMode === 'ROOMS' && latestState.customRules?.turnTimer) || 15;
                  } else {
                    rotateTurn(latestState);
                  }

                  await cacheRoomState(roomId, latestState);
                  io.to(roomId).emit('MATCH_STATE_UPDATE', latestState);

                  const nextPlayer = latestState.players[latestState.activePlayerIndex];
                  if (nextPlayer.isBot) {
                    triggerBotTurn(roomId);
                  }
                }
              } catch (err) {
                console.error(`Error finalizing bot delayed transition for room ${roomId}:`, err);
              }
            });
          }, transitionDelay);
        }
      } catch (err) {
        console.error(`Error executing bot turn in room ${roomId}:`, err);
      }
    });
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

  // 1. MUST LOSE FORCED: Play optimally with deterministic highest weight choice
  if (state.promoState === 'PROMO_LOSE_FORCED') {
    let bestTokenIndex = validMoves[0];
    let maxWeight = -1;

    for (const tokenIndex of validMoves) {
      const currentPos = bot.tokens[tokenIndex];
      let weight = 15;

      if (currentPos === -1 && roll === 6) {
        weight = 50;
      }

      const nextPos = currentPos + roll;
      if (nextPos <= 56) {
        const nextCommonIndex = getCommonIndex(bot.color, nextPos);
        if (nextCommonIndex !== -1 && !SAFE_COMMON_INDICES.includes(nextCommonIndex)) {
          const canCapture = opponent.tokens.some((oppPos) => {
            return getCommonIndex(opponent.color, oppPos) === nextCommonIndex;
          });
          if (canCapture) {
            weight = 95;
          }
        }

        if (nextPos === 56) {
          weight = 85;
        }

        if (nextCommonIndex !== -1 && SAFE_COMMON_INDICES.includes(nextCommonIndex)) {
          weight = 45;
        }

        const currentCommonIndex = getCommonIndex(bot.color, currentPos);
        if (currentCommonIndex !== -1 && !SAFE_COMMON_INDICES.includes(currentCommonIndex)) {
          const isExposed = opponent.tokens.some((oppPos) => {
            const oppCommon = getCommonIndex(opponent.color, oppPos);
            if (oppCommon === -1) return false;
            const dist = (currentCommonIndex - oppCommon + 52) % 52;
            return dist > 0 && dist <= 6;
          });
          if (isExposed) {
            weight += 20;
          }
        }
      }

      if (weight > maxWeight) {
        maxWeight = weight;
        bestTokenIndex = tokenIndex;
      }
    }
    return bestTokenIndex;
  }

  // 2. MUST WIN FORCED: Bot plays sub-optimally to guarantee the promoter wins
  if (state.promoState === 'PROMO_WIN_FORCED') {
    const moveWeights = validMoves.map((tokenIndex) => {
      const currentPos = bot.tokens[tokenIndex];
      let weight = 100; // start with high preference for standard moves

      if (currentPos === -1 && roll === 6) {
        weight = 10; // avoid releasing new tokens
      }

      const nextPos = currentPos + roll;
      if (nextPos <= 56) {
        const nextCommonIndex = getCommonIndex(bot.color, nextPos);
        
        // Avoid capturing promoter tokens
        if (nextCommonIndex !== -1 && !SAFE_COMMON_INDICES.includes(nextCommonIndex)) {
          const canCapture = opponent.tokens.some((oppPos) => {
            return getCommonIndex(opponent.color, oppPos) === nextCommonIndex;
          });
          if (canCapture) {
            weight = 1; // avoid capture at all costs
          }
        }

        // Avoid entering home zone
        if (nextPos === 56) {
          weight = 5;
        }

        // Avoid safe zones
        if (nextCommonIndex !== -1 && SAFE_COMMON_INDICES.includes(nextCommonIndex)) {
          weight = 15;
        }
      }
      return { tokenIndex, weight };
    });

    const totalWeight = moveWeights.reduce((sum, item) => sum + item.weight, 0);
    let randomVal = Math.random() * totalWeight;
    for (const item of moveWeights) {
      randomVal -= item.weight;
      if (randomVal <= 0) {
        return item.tokenIndex;
      }
    }
    return validMoves[0];
  }

  // 3. Regular bot matchmaking weighted check (default)
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
      const nextCommonIndex = getCommonIndex(bot.color, nextPos);
      if (nextCommonIndex !== -1 && !SAFE_COMMON_INDICES.includes(nextCommonIndex)) {
        const canCapture = opponent.tokens.some((oppPos) => {
          return getCommonIndex(opponent.color, oppPos) === nextCommonIndex;
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
      const currentCommonIndex = getCommonIndex(bot.color, currentPos);
      if (currentCommonIndex !== -1 && !SAFE_COMMON_INDICES.includes(currentCommonIndex)) {
        const isExposed = opponent.tokens.some((oppPos) => {
          const oppCommon = getCommonIndex(opponent.color, oppPos);
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
  const commissionRate = 0.10; // 10% platform profit commission
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

      // Winner winnings (if human) & 2% lifetime referral commission to referrer
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
          console.log(`Flipped promoter ${p.id} stake ${state.entryFee} state from ${currentPromoState} to ${newPromoState} (Won: ${isWinner}) in bot match`);
        }
      }
    });

    console.log(`Bot Match ${roomId} completed. Platform commission: +${commissionAmount}, Winner: ${winner.username} (+${winningsAmount})`);

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
      console.error('Failed to update tournament bracket on bot match completion:', err);
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
      console.error('Failed to decrement playing count on bot match end:', err);
    }

    // Cleanup room cache in Redis
    await deleteRoomState(roomId);
  } catch (error) {
    console.error('Failed to settle wallet transactions for completed bot match:', error);
  }
};
