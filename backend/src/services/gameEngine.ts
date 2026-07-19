export interface Player {
  id: string; // Socket ID or User database ID
  username: string;
  color: 'red' | 'green';
  tokens: number[]; // Array of tokens, values range from -1 (in yard) to 56 (home run terminal)
  isBot: boolean;
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

  // Custom Game Modes (QUICK, REGULAR, ROOMS)
  gameMode?: 'QUICK' | 'REGULAR' | 'ROOMS';
  matchTimer?: number; // Countdown timer for QUICK mode
  scores?: number[]; // Scores for players in QUICK mode
  customRules?: {
    turnTimer?: number;
    tokenCount?: number;
  };
}

// Common track length
const COMMON_TRACK_LENGTH = 52;
// Safe zone common indices (0-indexed values matching the 8 global protected cells)
const SAFE_COMMON_INDICES = [1, 9, 14, 22, 27, 35, 40, 48];

// Start offsets on the common board for players
const PLAYER_START_OFFSETS = [1, 27];

/**
 * Returns the common board position index (0-51) for a player's local token position.
 * Returns -1 if token is in yard (-1) or on the home path (>= 51).
 */
export const getCommonIndex = (playerIndex: number, localPos: number): number => {
  if (localPos === -1 || localPos >= 51) {
    return -1;
  }
  const startOffset = PLAYER_START_OFFSETS[playerIndex];
  return (startOffset + localPos) % COMMON_TRACK_LENGTH;
};

/**
 * Rotates turn control clockwise to the next player and resets rolling trackers.
 * Stashes the next player's token coordinates snapshot to support 3x consecutive 6s rollback.
 */
export const rotateTurn = (state: MatchState): void => {
  state.activePlayerIndex = (state.activePlayerIndex + 1) % state.players.length;
  state.turnTimer = state.customRules?.turnTimer || (state.gameMode === 'ROOMS' && state.customRules?.turnTimer) || 15;
  state.hasRolled = false;
  state.diceRoll = null;
  state.consecutiveSixes = 0;
  state.preTurnTokens = state.players.map((p) => [...p.tokens]);
};

/**
 * Creates the initial game state for a new 1v1 match.
 */
export const createInitialState = (
  roomId: string,
  player0: { id: string; username: string; isBot: boolean },
  player1: { id: string; username: string; isBot: boolean },
  entryFee: number,
  gameMode: 'QUICK' | 'REGULAR' | 'ROOMS' = 'REGULAR',
  customRules?: { turnTimer?: number; tokenCount?: number }
): MatchState => {
  const tokenCount = gameMode === 'QUICK' ? 2 : (gameMode === 'ROOMS' && customRules?.tokenCount) || 4;
  const initialTokens = Array.from({ length: tokenCount }, () => -1);
  const initialPreTurnTokens = Array.from({ length: 2 }, () => Array.from({ length: tokenCount }, () => -1));

  return {
    roomId,
    players: [
      {
        id: player0.id,
        username: player0.username,
        color: 'red',
        tokens: [...initialTokens],
        isBot: player0.isBot,
      },
      {
        id: player1.id,
        username: player1.username,
        color: 'green',
        tokens: [...initialTokens],
        isBot: player1.isBot,
      },
    ],
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

/**
 * Checks if a player has any valid moves with the current dice roll.
 */
export const getValidMoves = (state: MatchState, roll: number): number[] => {
  const activePlayer = state.players[state.activePlayerIndex];
  const validTokenIndices: number[] = [];

  for (let i = 0; i < activePlayer.tokens.length; i++) {
    const pos = activePlayer.tokens[i];

    // Already home, cannot move
    if (pos === 56) continue;

    // Locked in yard: QUICK mode bypasses yard release constraint (any roll works)
    if (pos === -1) {
      if (state.gameMode === 'QUICK' || roll === 6) {
        validTokenIndices.push(i);
      }
      continue;
    }

    // On board: check if the new position does not exceed home run terminal (56)
    if (pos + roll <= 56) {
      validTokenIndices.push(i);
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

  // Authoritative random roll (1-6)
  const roll = Math.floor(Math.random() * 6) + 1;
  state.diceRoll = roll;
  state.hasRolled = true;

  // Initialize pre-turn tokens if missing on load
  if (!state.preTurnTokens) {
    state.preTurnTokens = state.players.map((p) => [...p.tokens]);
  }

  if (roll === 6) {
    state.consecutiveSixes += 1;
    
    // 3 consecutive 6s nullified: reset tokens to pre-turn snapshot, reset counter, and pass turn
    if (state.consecutiveSixes === 3) {
      state.players.forEach((p, idx) => {
        if (state.preTurnTokens && state.preTurnTokens[idx]) {
          p.tokens = [...state.preTurnTokens[idx]];
        }
      });
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

  // Update token position
  activePlayer.tokens[tokenIndex] = nextPos;

  // Process capture if on common track
  let capturedToken: { playerIndex: number; tokenIndex: number } | null = null;
  const activeCommonIndex = getCommonIndex(activeIndex, nextPos);
  
  let hasCaptured = false;

  if (activeCommonIndex !== -1 && !SAFE_COMMON_INDICES.includes(activeCommonIndex)) {
    const opponentIndex = (activeIndex + 1) % state.players.length;
    const opponent = state.players[opponentIndex];
    
    // Check if opponent has a blockade stack (2 or more tokens at same index) protecting them
    let oppTokensCount = 0;
    const oppMatchedIndices: number[] = [];
    
    for (let i = 0; i < opponent.tokens.length; i++) {
      const oppPos = opponent.tokens[i];
      const oppCommonIndex = getCommonIndex(opponentIndex, oppPos);
      if (oppCommonIndex === activeCommonIndex) {
        oppTokensCount++;
        oppMatchedIndices.push(i);
      }
    }
    
    const isBlockaded = oppTokensCount >= 2;
    
    if (!isBlockaded && oppTokensCount > 0) {
      // Capture opponent's tokens: reset to yard (-1)
      oppMatchedIndices.forEach((i) => {
        opponent.tokens[i] = -1;
        capturedToken = { playerIndex: opponentIndex, tokenIndex: i };
      });
      hasCaptured = true;
    }
  }

  // Calculate scores for QUICK mode
  if (state.gameMode === 'QUICK') {
    let pointsEarned = 0;
    if (currentPos === -1 && nextPos === 0) {
      pointsEarned = 1; // 1 tile advanced = 1 point
    } else {
      pointsEarned = nextPos - currentPos; // 1 tile advanced = 1 point
    }

    if (hasCaptured) {
      pointsEarned += 10; // 1 opponent captured = 10 points
    }

    if (!state.scores) {
      state.scores = [0, 0];
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
