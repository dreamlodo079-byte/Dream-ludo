export interface Player {
  id: string; // Socket ID or User database ID
  username: string;
  color: 'red' | 'green';
  tokens: number[]; // Array of 4 tokens, values range from -1 (in yard) to 56 (home run terminal)
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
}

// Common track length
const COMMON_TRACK_LENGTH = 52;
// Safe zone common indices (0-indexed values matching the 8 global protected cells)
const SAFE_COMMON_INDICES = [0, 8, 13, 21, 26, 34, 39, 47];

// Start offsets on the common board for players
const PLAYER_START_OFFSETS = [0, 26];

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
  state.turnTimer = 15;
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
  entryFee: number
): MatchState => {
  return {
    roomId,
    players: [
      {
        id: player0.id,
        username: player0.username,
        color: 'red',
        tokens: [-1, -1, -1, -1],
        isBot: player0.isBot,
      },
      {
        id: player1.id,
        username: player1.username,
        color: 'green',
        tokens: [-1, -1, -1, -1],
        isBot: player1.isBot,
      },
    ],
    activePlayerIndex: 0,
    diceRoll: null,
    hasRolled: false,
    consecutiveSixes: 0,
    winnerId: null,
    turnTimer: 15,
    isTerminated: false,
    entryFee,
    preTurnTokens: [[-1, -1, -1, -1], [-1, -1, -1, -1]],
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

    // Locked in yard: requires a 6 to release to position 0
    if (pos === -1) {
      if (roll === 6) {
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
    
    // Player gets another roll sequence, first check if valid moves exist
    const validMoves = getValidMoves(state, roll);
    if (validMoves.length === 0) {
      // No moves available, pass turn immediately
      rotateTurn(state);
      return { roll, shouldPassTurn: true, consecutiveReset: false };
    }
    return { roll, shouldPassTurn: false, consecutiveReset: false };
  } else {
    // Normal roll (1-5), reset consecutive sixes
    state.consecutiveSixes = 0;
    const validMoves = getValidMoves(state, roll);
    if (validMoves.length === 0) {
      // No moves available, pass turn immediately
      rotateTurn(state);
      return { roll, shouldPassTurn: true, consecutiveReset: false };
    }
    return { roll, shouldPassTurn: false, consecutiveReset: false };
  }
};

/**
 * Moves a token for the active player.
 * Checks for captures/cuts and handles win states.
 */
export const executeMove = (state: MatchState, tokenIndex: number): { capturedToken: { playerIndex: number; tokenIndex: number } | null } => {
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

  if (currentPos === -1 && roll !== 6) {
    throw new Error('Token is locked in yard and requires a 6 to release');
  }

  let nextPos = currentPos;
  if (currentPos === -1 && roll === 6) {
    nextPos = 0; // Released to start tile
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

  // Reset roll state
  state.hasRolled = false;
  state.diceRoll = null;

  // Check if player won (all 4 tokens at 56)
  const isWinner = activePlayer.tokens.every((pos) => pos === 56);
  if (isWinner) {
    state.winnerId = activePlayer.id;
    state.isTerminated = true;
  } else {
    // Grant bonus roll if rolled 6, captured opponent, or reached goal (56)
    const getsBonusRoll = roll === 6 || hasCaptured || nextPos === 56;
    
    if (getsBonusRoll) {
      state.hasRolled = false;
      state.diceRoll = null;
      state.turnTimer = 15;
    } else {
      rotateTurn(state);
    }
  }

  return { capturedToken };
};

/**
 * Auto skips current player's turn if they run out of time.
 */
export const skipTurn = (state: MatchState): void => {
  rotateTurn(state);
};
