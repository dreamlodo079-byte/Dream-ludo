export interface Player {
  id: string; // Socket ID or User database ID
  username: string;
  color: 'red' | 'blue' | 'yellow' | 'green';
  tokens: number[]; // Array of tokens, values range from -1 (in yard) to 56 (home run terminal)
  isBot: boolean;
  ready?: boolean; // Handshake readiness flag
  queueId?: string; // Original matchmaking queue transaction reference
  socketId?: string; // Socket connection identifier
  joinedAt?: number; // Queue join timestamp for re-queuing
  isPromoter?: boolean;
  hasLeft?: boolean;
}

export interface MatchState {
  roomId: string;
  players: Player[];
  activePlayerIndex: number; // Index of the player whose turn it is (0 or 1)
  diceRoll: number | null; // Value of the current dice roll (1-6)
  hasRolled: boolean; // Whether the active player has rolled in this turn
  consecutiveSixes: number; // Counter for consecutive 6s rolled by the active player in this turn sequence
  winnerId: string | null;
  turnTimer: number; // Remaining time in seconds for the current turn (max 15s)
  isTerminated: boolean;
  entryFee: number;
  preTurnTokens?: number[][]; // Coordinates snapshot at start of turn to process 3x consecutive 6s rollback
  status?: 'MATCH_PENDING' | 'ACTIVE'; // State synchronization status

  // Custom Game Modes (QUICK, REGULAR, ROOMS)
  gameMode?: 'QUICK' | 'REGULAR' | 'ROOMS';
  transitionPending?: boolean; // Flag to block incoming roll/move actions during walk animations
  matchTimer?: number; // Countdown timer for QUICK mode
  scores?: number[]; // Scores for players in QUICK mode
  customRules?: {
    turnTimer?: number;
    tokenCount?: number;
  };
  promoState?: 'PROMO_WIN_FORCED' | 'PROMO_LOSE_FORCED';
  promoOverride?: 'PROMOTER_MUST_WIN' | 'PROMOTER_MUST_LOSE';
}

// Common track length
const COMMON_TRACK_LENGTH = 52;
// Safe zone common indices (0-indexed values matching the 8 global protected cells)
const SAFE_COMMON_INDICES = [1, 9, 14, 22, 27, 35, 40, 48];

/**
 * Returns the common board position index (0-51) for a player's local token position.
 * Returns -1 if token is in yard (-1) or on the home path (>= 51).
 */
export const getCommonIndex = (color: 'red' | 'blue' | 'yellow' | 'green', localPos: number): number => {
  if (localPos === -1 || localPos >= 51) {
    return -1;
  }
  const offsets: Record<string, number> = { red: 1, yellow: 14, green: 27, blue: 40 };
  const startOffset = offsets[color];
  return (startOffset + localPos) % COMMON_TRACK_LENGTH;
};

/**
 * Rotates turn control clockwise to the next player and resets rolling trackers.
 * Stashes the next player's token coordinates snapshot to support 3x consecutive 6s rollback.
 */
export const rotateTurn = (state: MatchState): void => {
  let loops = 0;
  do {
    state.activePlayerIndex = (state.activePlayerIndex + 1) % state.players.length;
    loops++;
    if (loops > state.players.length) break;
  } while (state.players[state.activePlayerIndex].hasLeft);

  state.turnTimer = state.customRules?.turnTimer || (state.gameMode === 'ROOMS' && state.customRules?.turnTimer) || 15;
  state.hasRolled = false;
  state.diceRoll = null;
  state.consecutiveSixes = 0;
  state.preTurnTokens = state.players.map((p) => [...p.tokens]);
};

/**
 * Creates the initial game state for a new match.
 */
export const createInitialState = (
  roomId: string,
  playersInit: { id: string; username: string; isBot: boolean; isPromoter?: boolean }[],
  entryFee: number,
  gameMode: 'QUICK' | 'REGULAR' | 'ROOMS' = 'REGULAR',
  customRules?: { turnTimer?: number; tokenCount?: number }
): MatchState => {
  const tokenCount = gameMode === 'QUICK' ? 2 : (gameMode === 'ROOMS' && customRules?.tokenCount) || 4;
  const initialTokens = Array.from({ length: tokenCount }, () => -1);
  const initialPreTurnTokens = Array.from({ length: playersInit.length }, () => Array.from({ length: tokenCount }, () => -1));

  let colors: ('red' | 'blue' | 'yellow' | 'green')[] = [];
  if (playersInit.length === 2) colors = ['red', 'green'];
  else if (playersInit.length === 3) colors = ['red', 'yellow', 'green'];
  else colors = ['red', 'yellow', 'green', 'blue'];

  const players = playersInit.map((p, idx) => ({
    id: p.id,
    username: p.username,
    color: colors[idx],
    tokens: [...initialTokens],
    isBot: p.isBot,
    isPromoter: p.isPromoter,
  }));

  return {
    roomId,
    players,
    activePlayerIndex: 0,
    diceRoll: null,
    hasRolled: false,
    consecutiveSixes: 0,
    winnerId: null,
    turnTimer: customRules?.turnTimer || 15,
    isTerminated: false,
    entryFee,
    preTurnTokens: initialPreTurnTokens,
    gameMode,
    matchTimer: gameMode === 'QUICK' ? 300 : undefined,
    scores: gameMode === 'QUICK' ? [0, 0] : undefined,
    customRules: gameMode === 'ROOMS' ? customRules : undefined,
  };
};

const hasOpponentBlockade = (state: MatchState, activePlayerIndex: number, nextPos: number): boolean => {
  const activePlayer = state.players[activePlayerIndex];
  const activeCommonIndex = getCommonIndex(activePlayer.color, nextPos);
  if (activeCommonIndex === -1 || SAFE_COMMON_INDICES.includes(activeCommonIndex)) {
    return false;
  }
  
  for (let oppIdx = 0; oppIdx < state.players.length; oppIdx++) {
    if (oppIdx === activePlayerIndex) continue;
    
    const opponent = state.players[oppIdx];
    let oppTokensCount = 0;
    for (let i = 0; i < opponent.tokens.length; i++) {
      const oppPos = opponent.tokens[i];
      const oppCommonIndex = getCommonIndex(opponent.color, oppPos);
      if (oppCommonIndex === activeCommonIndex) {
        oppTokensCount++;
      }
    }
    if (oppTokensCount >= 2) return true;
  }
  
  return false;
};

/**
 * Checks if a player has any valid moves with the current dice roll.
 */
export const getValidMoves = (state: MatchState, roll: number): number[] => {
  const activePlayerIndex = state.activePlayerIndex;
  const activePlayer = state.players[activePlayerIndex];
  const validTokenIndices: number[] = [];

  for (let i = 0; i < activePlayer.tokens.length; i++) {
    const pos = activePlayer.tokens[i];

    // Already home, cannot move
    if (pos === 56) continue;

    // Locked in yard: QUICK mode bypasses yard release constraint (any roll works)
    if (pos === -1) {
      if (state.gameMode === 'QUICK' || roll === 6) {
        const nextPos = 0;
        if (!hasOpponentBlockade(state, activePlayerIndex, nextPos)) {
          validTokenIndices.push(i);
        }
      }
      continue;
    }

    // On board: check if the new position does not exceed home run terminal (56)
    if (pos + roll <= 56) {
      const nextPos = pos + roll;
      if (!hasOpponentBlockade(state, activePlayerIndex, nextPos)) {
        validTokenIndices.push(i);
      }
    }
  }

  return validTokenIndices;
};

/**
 * Executes a dice roll for the active player.
 * Updates consecutive rolls and turn states as per authoritative rules.
 */
export const executeRoll = (state: MatchState): { roll: number; shouldPassTurn: boolean; consecutiveReset: boolean } => {
  if (state.hasRolled) {
    throw new Error('Player has already rolled this turn');
  }

  let roll = 1;

  if (state.promoOverride) {
    const activePlayer = state.players[state.activePlayerIndex];
    const isActivePromoter = activePlayer.isPromoter === true;

    // Weights corresponding to rolls 1 to 6
    const weights = [10.0, 10.0, 10.0, 10.0, 10.0, 10.0];

    for (let r = 1; r <= 6; r++) {
      let hasCapture = false;
      let hasHomeRun = false;
      let hasHomePath = false;
      let hasSafeLanding = false;
      let releasesToken = false;

      const validTokens = getValidMoves(state, r);
      for (const tokenIndex of validTokens) {
        const pos = activePlayer.tokens[tokenIndex];
        if (pos === -1 && r === 6) {
          releasesToken = true;
        }
        const nextPos = pos === -1 ? 0 : pos + r;
        if (nextPos === 56) {
          hasHomeRun = true;
        }
        if (nextPos >= 51 && nextPos < 56) {
          hasHomePath = true;
        }
        const nextCommonIndex = getCommonIndex(activePlayer.color, nextPos);
        if (nextCommonIndex !== -1) {
          if (SAFE_COMMON_INDICES.includes(nextCommonIndex)) {
            hasSafeLanding = true;
          } else {
            const oppIndex = (state.activePlayerIndex + 1) % 2;
            const opp = state.players[oppIndex];
            const canCap = opp.tokens.some((oppPos) => getCommonIndex(opp.color, oppPos) === nextCommonIndex);
            if (canCap) {
              hasCapture = true;
            }
          }
        }
      }

      // Apply rules based on promoOverride target
      if (state.promoOverride === 'PROMOTER_MUST_WIN') {
        if (isActivePromoter) {
          // Promoter's turn: boost helpful rolls
          if (hasCapture) weights[r - 1] += 200.0;
          if (hasHomeRun) weights[r - 1] += 150.0;
          if (releasesToken) weights[r - 1] += 80.0;
          if (hasHomePath) weights[r - 1] += 60.0;
          if (hasSafeLanding) weights[r - 1] += 40.0;
          if (r === 6) weights[r - 1] += 20.0;
        } else {
          // Real player's turn: penalize helpful rolls
          if (hasCapture) weights[r - 1] = 0.1; // avoid capturing promoter
          if (hasHomeRun) weights[r - 1] = 0.5; // avoid home run
          if (releasesToken) weights[r - 1] = 0.5; // avoid rolling 6
          if (hasHomePath) weights[r - 1] = 1.0;
          if (r === 6) weights[r - 1] = 0.2; // suppress 6s
        }
      } else if (state.promoOverride === 'PROMOTER_MUST_LOSE') {
        if (isActivePromoter) {
          // Promoter's turn: penalize promoter
          if (hasCapture) weights[r - 1] = 0.1;
          if (hasHomeRun) weights[r - 1] = 0.5;
          if (releasesToken) weights[r - 1] = 0.5;
          if (hasHomePath) weights[r - 1] = 1.0;
          if (r === 6) weights[r - 1] = 0.2;
        } else {
          // Real player's turn: boost real player
          if (hasCapture) weights[r - 1] += 200.0;
          if (hasHomeRun) weights[r - 1] += 150.0;
          if (releasesToken) weights[r - 1] += 80.0;
          if (hasHomePath) weights[r - 1] += 60.0;
          if (hasSafeLanding) weights[r - 1] += 40.0;
          if (r === 6) weights[r - 1] += 20.0;
        }
      }
    }

    // Weighted random selection of roll (1 to 6)
    const totalWeight = weights.reduce((sum, w) => sum + w, 0);
    let randomVal = Math.random() * totalWeight;
    let selectedRoll = 1;
    for (let i = 0; i < 6; i++) {
      randomVal -= weights[i];
      if (randomVal <= 0) {
        selectedRoll = i + 1;
        break;
      }
    }
    roll = selectedRoll;
  } else {
    // Normal random roll
    roll = Math.floor(Math.random() * 6) + 1;
  }

  state.diceRoll = roll;
  state.hasRolled = true;

  // Initialize pre-turn tokens if missing on load
  if (!state.preTurnTokens) {
    state.preTurnTokens = state.players.map((p) => [...p.tokens]);
  }

  if (roll === 6) {
    state.consecutiveSixes += 1;
    // 3 consecutive 6s nullified: reset counter, and pass turn (but don't revert tokens to avoid confusion)
    if (state.consecutiveSixes === 3) {
      state.consecutiveSixes = 0;
      state.diceRoll = null;
      state.hasRolled = false;
      rotateTurn(state);
      return { roll, shouldPassTurn: true, consecutiveReset: true };
    }
    
    const validMoves = getValidMoves(state, roll);
    return { roll, shouldPassTurn: validMoves.length === 0, consecutiveReset: false };
  } else {
    // Normal roll (1-5), reset consecutive sixes
    state.consecutiveSixes = 0;
    const validMoves = getValidMoves(state, roll);
    return { roll, shouldPassTurn: validMoves.length === 0, consecutiveReset: false };
  }
};

/**
 * Moves a token for the active player.
 * Checks for captures/cuts and handles win states.
 */
export const executeMove = (state: MatchState, tokenIndex: number): { capturedToken: { playerIndex: number; tokenIndex: number } | null; getsBonusRoll: boolean } => {
  if (!state.hasRolled || state.diceRoll === null) {
    throw new Error('Roll dice before making a move');
  }

  const roll = state.diceRoll;
  const activeIndex = state.activePlayerIndex;
  const activePlayer = state.players[activeIndex];

  if (tokenIndex < 0 || tokenIndex >= activePlayer.tokens.length) {
    throw new Error('Invalid token index');
  }

  const currentPos = activePlayer.tokens[tokenIndex];

  // Validate the move
  if (currentPos === 56) {
    throw new Error('Token is already home');
  }

  if (currentPos === -1 && state.gameMode !== 'QUICK' && roll !== 6) {
    throw new Error('Token is locked in yard and requires a 6 to release');
  }

  let nextPos = currentPos;
  if (currentPos === -1) {
    // Releasing to start tile
    nextPos = 0;
  } else {
    nextPos = currentPos + roll;
  }

  if (nextPos > 56) {
    throw new Error('Move exceeds board terminal path');
  }

  // Process capture if on common track (validate before mutating)
  let capturedToken: { playerIndex: number; tokenIndex: number } | null = null;
  let hasCaptured = false;
  const activeCommonIndex = getCommonIndex(activePlayer.color, nextPos);

  if (activeCommonIndex !== -1 && !SAFE_COMMON_INDICES.includes(activeCommonIndex)) {
    for (let oppIdx = 0; oppIdx < state.players.length; oppIdx++) {
      if (oppIdx === activeIndex) continue;
      
      const opponent = state.players[oppIdx];
      let oppTokensCount = 0;
      const oppMatchedIndices: number[] = [];
      
      for (let i = 0; i < opponent.tokens.length; i++) {
        const oppPos = opponent.tokens[i];
        const oppCommonIndex = getCommonIndex(opponent.color, oppPos);
        if (oppCommonIndex === activeCommonIndex) {
          oppTokensCount++;
          oppMatchedIndices.push(i);
        }
      }
      
      const isBlockaded = oppTokensCount >= 2;
      if (isBlockaded) {
        throw new Error("Cannot capture or land on tile protected by opponent's blockade stack!");
      }
      
      if (oppTokensCount > 0) {
        // Setup capture info to apply in the mutation phase
        capturedToken = { playerIndex: oppIdx, tokenIndex: oppMatchedIndices[0] };
        hasCaptured = true;
        break; // Only one opponent can occupy a non-safe cell (or else it would be a blockade/illegal)
      }
    }
  }

  let oppPosBeforeReset = -1;
  // --- MUTATION PHASE (Fully validated, safe to write state) ---
  activePlayer.tokens[tokenIndex] = nextPos;
  if (hasCaptured && capturedToken) {
    const opponent = state.players[capturedToken.playerIndex];
    oppPosBeforeReset = opponent.tokens[capturedToken.tokenIndex];
    opponent.tokens[capturedToken.tokenIndex] = -1; // Send back to yard
  }

  // Calculate scores for QUICK mode
  if (state.gameMode === 'QUICK') {
    if (!state.scores) {
      state.scores = [0, 0];
    }

    let pointsEarned = 0;
    if (currentPos === -1 && nextPos === 0) {
      pointsEarned = 1; // 1 tile advanced = 1 point
    } else {
      pointsEarned = nextPos - currentPos; // 1 tile advanced = 1 point
    }

    if (hasCaptured) {
      pointsEarned += 10; // 1 opponent captured = 10 points
      if (capturedToken && oppPosBeforeReset >= 0) {
        const opponentIndex = capturedToken.playerIndex;
        const pointsLost = oppPosBeforeReset + 1;
        state.scores[opponentIndex] = Math.max(0, state.scores[opponentIndex] - pointsLost);
      }
    }

    if (nextPos === 56) {
      pointsEarned += 56; // Home entry bonus (+56 points)
    }

    state.scores[activeIndex] += pointsEarned;
  }

  // Check if player won (all active tokens at 56)
  const isWinner = activePlayer.tokens.every((pos) => pos === 56);
  if (isWinner) {
    state.winnerId = activePlayer.id;
    state.isTerminated = true;
  }

  // Grant bonus roll if rolled 6, captured opponent, or reached goal (56)
  const getsBonusRoll = roll === 6 || hasCaptured || nextPos === 56;

  return { capturedToken, getsBonusRoll };
};

/**
 * Auto skips current player's turn if they run out of time.
 */
export const skipTurn = (state: MatchState): void => {
  rotateTurn(state);
};
