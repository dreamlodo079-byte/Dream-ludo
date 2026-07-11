import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Modal,
  Alert,
  ActivityIndicator,
} from 'react-native';
import Svg, { Rect, Circle, Path, G, Polygon } from 'react-native-svg';
import { useSocket } from '../hooks/useSocket';

const { width } = Dimensions.get('window');
const BOARD_SIZE = width - 40;
const CELL_SIZE = BOARD_SIZE / 15;

interface UserProfile {
  _id: string;
  phone: string;
  username: string;
}

interface GameScreenProps {
  roomId: string;
  currentUser: UserProfile;
  onLeaveMatch: () => void;
}

// 52 Common board coordinate slots (clockwise layout mapping)
const COMMON_TRACK_COORDS = [
  // Left arm, top row (0 to 5) moving right
  { x: 0, y: 6 }, { x: 1, y: 6 }, { x: 2, y: 6 }, { x: 3, y: 6 }, { x: 4, y: 6 }, { x: 5, y: 6 },
  // Top arm, left column (6 to 11) moving up
  { x: 6, y: 5 }, { x: 6, y: 4 }, { x: 6, y: 3 }, { x: 6, y: 2 }, { x: 6, y: 1 }, { x: 6, y: 0 },
  // Top arm, middle column (12) moving right
  { x: 7, y: 0 },
  // Top arm, right column (13 to 18) moving down
  { x: 8, y: 0 }, { x: 8, y: 1 }, { x: 8, y: 2 }, { x: 8, y: 3 }, { x: 8, y: 4 }, { x: 8, y: 5 },
  // Right arm, top row (19 to 24) moving right
  { x: 9, y: 6 }, { x: 10, y: 6 }, { x: 11, y: 6 }, { x: 12, y: 6 }, { x: 13, y: 6 }, { x: 14, y: 6 },
  // Right arm, middle row (25) moving down
  { x: 14, y: 7 },
  // Right arm, bottom row (26 to 31) moving left
  { x: 14, y: 8 }, { x: 13, y: 8 }, { x: 12, y: 8 }, { x: 11, y: 8 }, { x: 10, y: 8 }, { x: 9, y: 8 },
  // Bottom arm, right column (32 to 37) moving down
  { x: 8, y: 9 }, { x: 8, y: 10 }, { x: 8, y: 11 }, { x: 8, y: 12 }, { x: 8, y: 13 }, { x: 8, y: 14 },
  // Bottom arm, middle column (38) moving left
  { x: 7, y: 14 },
  // Bottom arm, left column (39 to 44) moving up
  { x: 6, y: 14 }, { x: 6, y: 13 }, { x: 6, y: 12 }, { x: 6, y: 11 }, { x: 6, y: 10 }, { x: 6, y: 9 },
  // Left arm, bottom row (45 to 50) moving left
  { x: 5, y: 8 }, { x: 4, y: 8 }, { x: 3, y: 8 }, { x: 2, y: 8 }, { x: 1, y: 8 }, { x: 0, y: 8 },
  // Left arm, middle row (51) moving up
  { x: 0, y: 7 },
];

// Safe zone common track indices (Red start: 1, Green start: 27, Star spaces: 8, 21, 34, 47)
const SAFE_COMMON_INDICES = [0, 8, 13, 21, 26, 34, 39, 47];

// Player start offsets on the 52-cell track
const PLAYER_START_OFFSETS = [0, 26];

// Yard coordinates for locked tokens (-1 position)
const RED_YARD_TOKEN_COORDS = [
  { x: 1.5, y: 1.5 }, { x: 3.5, y: 1.5 },
  { x: 1.5, y: 3.5 }, { x: 3.5, y: 3.5 }
];

const GREEN_YARD_TOKEN_COORDS = [
  { x: 10.5, y: 10.5 }, { x: 12.5, y: 10.5 },
  { x: 10.5, y: 12.5 }, { x: 12.5, y: 12.5 }
];

// Home path coordinates (51 to 56)
const RED_HOME_PATH_COORDS = [
  { x: 1, y: 7 }, { x: 2, y: 7 }, { x: 3, y: 7 }, { x: 4, y: 7 }, { x: 5, y: 7 }, { x: 6, y: 7 }
];

const GREEN_HOME_PATH_COORDS = [
  { x: 13, y: 7 }, { x: 12, y: 7 }, { x: 11, y: 7 }, { x: 10, y: 7 }, { x: 9, y: 7 }, { x: 8, y: 7 }
];

export const GameScreen: React.FC<GameScreenProps> = ({
  roomId,
  currentUser,
  onLeaveMatch,
}) => {
  const {
    isConnected,
    matchState,
    winnerInfo,
    alertMessage,
    clearAlert,
    requestRoll,
    requestMove,
  } = useSocket(currentUser._id);

  // Local dice animation
  const [diceDisplayVal, setDiceDisplayVal] = useState<number>(1);
  const [isDiceAnimating, setIsDiceAnimating] = useState(false);

  useEffect(() => {
    if (alertMessage) {
      Alert.alert('Game Alert', alertMessage, [{ text: 'OK', onPress: clearAlert }]);
    }
  }, [alertMessage, clearAlert]);

  // Synchronize server roll with local micro-animation
  useEffect(() => {
    if (matchState && matchState.diceRoll !== null) {
      setIsDiceAnimating(true);
      let count = 0;
      const interval = setInterval(() => {
        setDiceDisplayVal(Math.floor(Math.random() * 6) + 1);
        count++;
        if (count >= 6) {
          clearInterval(interval);
          setDiceDisplayVal(matchState.diceRoll);
          setIsDiceAnimating(false);
        }
      }, 80);
    }
  }, [matchState?.diceRoll]);

  if (!matchState) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#FF4D4D" />
        <Text style={styles.loadingText}>SYNCHRONIZING SECURE GAME ENGINE...</Text>
        <Text style={styles.subtext}>{isConnected ? 'Connected to Socket' : 'Connecting to Server...'}</Text>
      </View>
    );
  }

  const activePlayer = matchState.players[matchState.activePlayerIndex];
  const isMyTurn = activePlayer.id === currentUser._id || activePlayer.id === matchState.roomId; // matches socket registration
  
  // Find player indices
  const myPlayerIndex = matchState.players.findIndex((p: any) => p.id === currentUser._id || p.id === matchState.roomId);
  const isWinner = winnerInfo !== null;

  const handleRollDice = () => {
    if (!isMyTurn || matchState.hasRolled || isDiceAnimating) return;
    requestRoll(roomId);
  };

  const handleTokenPress = (tokenIndex: number) => {
    if (!isMyTurn || !matchState.hasRolled) return;
    
    // Client-side quick validation: is this token allowed to move?
    const myPlayer = matchState.players[myPlayerIndex];
    const pos = myPlayer.tokens[tokenIndex];
    const roll = matchState.diceRoll;

    if (roll === null) return;

    if (pos === 57) return;
    if (pos === -1 && roll !== 6) return;
    if (pos + roll > 57) return;

    requestMove(roomId, tokenIndex);
  };

  /**
   * Helper to calculate drawing coordinate position for a token on the SVG Canvas
   */
  const getTokenCoords = (playerIndex: number, tokenIndex: number): { cx: number; cy: number } => {
    const player = matchState.players[playerIndex];
    const pos = player.tokens[tokenIndex];

    let gridX = 0;
    let gridY = 0;

    if (pos === -1) {
      // Locked in Yard
      const yardCoords = playerIndex === 0 ? RED_YARD_TOKEN_COORDS : GREEN_YARD_TOKEN_COORDS;
      gridX = yardCoords[tokenIndex].x;
      gridY = yardCoords[tokenIndex].y;
    } else if (pos === 57) {
      // Home center
      gridX = 7.5;
      gridY = 7.5;
    } else if (pos >= 51 && pos <= 56) {
      // Home path
      const pathCoords = playerIndex === 0 ? RED_HOME_PATH_COORDS : GREEN_HOME_PATH_COORDS;
      const idx = pos - 51;
      gridX = pathCoords[idx].x + 0.5;
      gridY = pathCoords[idx].y + 0.5;
    } else {
      // Common Track
      const startOffset = PLAYER_START_OFFSETS[playerIndex];
      const commonIdx = (startOffset + pos) % 52;
      const coord = COMMON_TRACK_COORDS[commonIdx];
      gridX = coord.x + 0.5;
      gridY = coord.y + 0.5;
    }

    return {
      cx: gridX * CELL_SIZE,
      cy: gridY * CELL_SIZE,
    };
  };

  // Group all tokens to check for overlapping positions
  const allTokensOnCells: { [key: string]: { playerIndex: number; tokenIndex: number }[] } = {};

  matchState.players.forEach((player: any, pIdx: number) => {
    player.tokens.forEach((pos: number, tIdx: number) => {
      let cellKey = '';
      if (pos === -1) {
        cellKey = `yard_${pIdx}_${tIdx}`;
      } else if (pos === 57) {
        cellKey = `home_${pIdx}_${tIdx}`; // separate home offsets slightly
      } else if (pos >= 51) {
        cellKey = `path_${pIdx}_${pos}`;
      } else {
        const startOffset = PLAYER_START_OFFSETS[pIdx];
        const commonIdx = (startOffset + pos) % 52;
        cellKey = `common_${commonIdx}`;
      }

      if (!allTokensOnCells[cellKey]) {
        allTokensOnCells[cellKey] = [];
      }
      allTokensOnCells[cellKey].push({ playerIndex: pIdx, tokenIndex: tIdx });
    });
  });

  return (
    <View style={styles.container}>
      {/* HUD Info Area */}
      <View style={styles.hudContainer}>
        <View style={styles.playerInfoNode}>
          <View style={[styles.colorIndicator, { backgroundColor: '#FF4D4D' }]} />
          <Text style={styles.playerText} numberOfLines={1}>
            {matchState.players[0].username} (Red)
          </Text>
        </View>
        <View style={styles.timerContainer}>
          <Text style={styles.timerLabel}>TURN TIMER</Text>
          <Text style={[styles.timerValue, matchState.turnTimer <= 5 && styles.timerDanger]}>
            {matchState.turnTimer}s
          </Text>
        </View>
        <View style={styles.playerInfoNode}>
          <View style={[styles.colorIndicator, { backgroundColor: '#00E676' }]} />
          <Text style={[styles.playerText, styles.alignRight]} numberOfLines={1}>
            {matchState.players[1].username} (Green)
          </Text>
        </View>
      </View>

      {/* Authoritative Ludo SVG Layer */}
      <View style={styles.boardWrapper}>
        <Svg width={BOARD_SIZE} height={BOARD_SIZE} style={styles.boardSvg}>
          {/* Main Board Base */}
          <Rect x={0} y={0} width={BOARD_SIZE} height={BOARD_SIZE} fill="#20202A" />

          {/* Red Yard Box */}
          <Rect x={0} y={0} width={CELL_SIZE * 6} height={CELL_SIZE * 6} fill="#FF4D4D22" stroke="#FF4D4D" strokeWidth={2} />
          <Circle cx={CELL_SIZE * 3} cy={CELL_SIZE * 3} r={CELL_SIZE * 2.2} fill="#FF4D4D44" />
          {RED_YARD_TOKEN_COORDS.map((coord, i) => (
            <Circle key={i} cx={coord.x * CELL_SIZE} cy={coord.y * CELL_SIZE} r={CELL_SIZE * 0.45} fill="#20202A" stroke="#FF4D4D" strokeWidth={1} />
          ))}

          {/* Green Yard Box */}
          <Rect x={CELL_SIZE * 9} y={CELL_SIZE * 9} width={CELL_SIZE * 6} height={CELL_SIZE * 6} fill="#00E67622" stroke="#00E676" strokeWidth={2} />
          <Circle cx={CELL_SIZE * 12} cy={CELL_SIZE * 12} r={CELL_SIZE * 2.2} fill="#00E67644" />
          {GREEN_YARD_TOKEN_COORDS.map((coord, i) => (
            <Circle key={i} cx={coord.x * CELL_SIZE} cy={coord.y * CELL_SIZE} r={CELL_SIZE * 0.45} fill="#20202A" stroke="#00E676" strokeWidth={1} />
          ))}

          {/* Background Inactive Yards */}
          <Rect x={CELL_SIZE * 9} y={0} width={CELL_SIZE * 6} height={CELL_SIZE * 6} fill="#30304022" stroke="#303040" strokeWidth={1} />
          <Rect x={0} y={CELL_SIZE * 9} width={CELL_SIZE * 6} height={CELL_SIZE * 6} fill="#30304022" stroke="#303040" strokeWidth={1} />

          {/* Center Safe Home Triangles */}
          <Polygon
            points={`${CELL_SIZE * 6},${CELL_SIZE * 6} ${CELL_SIZE * 9},${CELL_SIZE * 6} ${CELL_SIZE * 7.5},${CELL_SIZE * 7.5}`}
            fill="#303040"
          />
          <Polygon
            points={`${CELL_SIZE * 9},${CELL_SIZE * 6} ${CELL_SIZE * 9},${CELL_SIZE * 9} ${CELL_SIZE * 7.5},${CELL_SIZE * 7.5}`}
            fill="#303040"
          />
          <Polygon
            points={`${CELL_SIZE * 6},${CELL_SIZE * 9} ${CELL_SIZE * 9},${CELL_SIZE * 9} ${CELL_SIZE * 7.5},${CELL_SIZE * 7.5}`}
            fill="#303040"
          />
          <Polygon
            points={`${CELL_SIZE * 6},${CELL_SIZE * 6} ${CELL_SIZE * 6},${CELL_SIZE * 9} ${CELL_SIZE * 7.5},${CELL_SIZE * 7.5}`}
            fill="#303040"
          />

          {/* Common Track Grid Drawing */}
          {COMMON_TRACK_COORDS.map((coord, index) => {
            const isSafe = SAFE_COMMON_INDICES.includes(index);
            const isRedStart = index === 0;
            const isGreenStart = index === 26;

            let fillColor = '#2A2A38';
            if (isRedStart) fillColor = '#FF4D4D66';
            else if (isGreenStart) fillColor = '#00E67666';
            else if (isSafe) fillColor = '#44445A';

            return (
              <G key={index}>
                <Rect
                  x={coord.x * CELL_SIZE}
                  y={coord.y * CELL_SIZE}
                  width={CELL_SIZE}
                  height={CELL_SIZE}
                  fill={fillColor}
                  stroke="#1B1B25"
                  strokeWidth={1}
                />
                {isSafe && !isRedStart && !isGreenStart && (
                  <Circle
                    cx={coord.x * CELL_SIZE + CELL_SIZE / 2}
                    cy={coord.y * CELL_SIZE + CELL_SIZE / 2}
                    r={CELL_SIZE * 0.15}
                    fill="#FFD600"
                  />
                )}
              </G>
            );
          })}

          {/* Red Home Path Cells (excluding center terminal) */}
          {RED_HOME_PATH_COORDS.slice(0, 5).map((coord, i) => (
            <Rect
              key={`red_home_${i}`}
              x={coord.x * CELL_SIZE}
              y={coord.y * CELL_SIZE}
              width={CELL_SIZE}
              height={CELL_SIZE}
              fill="#FF4D4D88"
              stroke="#1B1B25"
              strokeWidth={1}
            />
          ))}

          {/* Green Home Path Cells */}
          {GREEN_HOME_PATH_COORDS.slice(0, 5).map((coord, i) => (
            <Rect
              key={`green_home_${i}`}
              x={coord.x * CELL_SIZE}
              y={coord.y * CELL_SIZE}
              width={CELL_SIZE}
              height={CELL_SIZE}
              fill="#00E67688"
              stroke="#1B1B25"
              strokeWidth={1}
            />
          ))}

          {/* Render Tokens dynamically on the canvas */}
          {Object.keys(allTokensOnCells).map((key) => {
            const tokenGroup = allTokensOnCells[key];
            const size = tokenGroup.length;

            return tokenGroup.map((tokenInfo, i) => {
              const { playerIndex, tokenIndex } = tokenInfo;
              const player = matchState.players[playerIndex];
              const baseCoords = getTokenCoords(playerIndex, tokenIndex);

              // Apply offset shifts if multiple tokens are grouped on the same cell
              let cx = baseCoords.cx;
              let cy = baseCoords.cy;

              if (size > 1) {
                const angle = (i * 2 * Math.PI) / size;
                const offset = CELL_SIZE * 0.22;
                cx += Math.cos(angle) * offset;
                cy += Math.sin(angle) * offset;
              }

              const isUserToken = player.id === currentUser._id || player.id === matchState.roomId;
              const hasRollVal = matchState.diceRoll !== null;
              const canMoveToken = isUserToken && isMyTurn && hasRollVal && (() => {
                const pos = player.tokens[tokenIndex];
                const roll = matchState.diceRoll!;
                if (pos === 57) return false;
                if (pos === -1 && roll !== 6) return false;
                if (pos + roll > 57) return false;
                return true;
              })();

              return (
                <G key={`${playerIndex}_token_${tokenIndex}`}>
                  {/* Token Glow Indicator if playable */}
                  {canMoveToken && (
                    <Circle
                      cx={cx}
                      cy={cy}
                      r={CELL_SIZE * 0.44}
                      fill="transparent"
                      stroke="#FFD600"
                      strokeWidth={3}
                    />
                  )}

                  {/* Outer ring */}
                  <Circle
                    cx={cx}
                    cy={cy}
                    r={CELL_SIZE * 0.35}
                    fill={playerIndex === 0 ? '#FF4D4D' : '#00E676'}
                    stroke="#FFF"
                    strokeWidth={2}
                    onPress={() => handleTokenPress(tokenIndex)}
                  />

                  {/* Inner ring */}
                  <Circle
                    cx={cx}
                    cy={cy}
                    r={CELL_SIZE * 0.18}
                    fill="#FFF"
                    opacity={0.7}
                    onPress={() => handleTokenPress(tokenIndex)}
                  />
                </G>
              );
            });
          })}
        </Svg>
      </View>

      {/* Control Area (Turn labels & interactive dice element) */}
      <View style={styles.controlContainer}>
        {isMyTurn ? (
          <Text style={styles.turnNotifyText}>YOUR TURN - ROLL OR MOVE</Text>
        ) : (
          <Text style={styles.turnNotifyWaiting}>WAITING FOR {activePlayer.username}...</Text>
        )}

        <View style={styles.dicePlaySection}>
          <TouchableOpacity
            style={[
              styles.diceCard,
              isMyTurn && !matchState.hasRolled && styles.diceCardInteractive,
              isDiceAnimating && styles.diceCardAnimating,
            ]}
            onPress={handleRollDice}
            disabled={!isMyTurn || matchState.hasRolled || isDiceAnimating}
          >
            {isDiceAnimating ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <Text style={styles.diceText}>{diceDisplayVal}</Text>
            )}
          </TouchableOpacity>

          <View style={styles.rollMetadata}>
            <Text style={styles.rollMetaText}>
              Dice status: {matchState.hasRolled ? 'Rolled' : 'Ready'}
            </Text>
            <Text style={styles.rollMetaText}>
              Consecutive 6s: {matchState.consecutiveSixes} / 3
            </Text>
          </View>
        </View>

        <TouchableOpacity style={styles.forfeitBtn} onPress={onLeaveMatch}>
          <Text style={styles.forfeitBtnText}>FORFEIT MATCH</Text>
        </TouchableOpacity>
      </View>

      {/* Absolute Victory/Defeat Fullscreen Modal */}
      <Modal visible={isWinner} transparent animationType="fade">
        <View style={styles.victoryModalContainer}>
          <View style={styles.victoryCard}>
            {winnerInfo?.winnerId === currentUser._id || winnerInfo?.winnerId === matchState.roomId ? (
              <G>
                <Text style={styles.victoryTitle}>YOU WIN</Text>
                <Text style={styles.victorySub}>Platform Prize Settled Successfully</Text>
                <Text style={styles.winningsText}>+{winnerInfo?.winnings.toFixed(2)} INR</Text>
              </G>
            ) : (
              <G>
                <Text style={[styles.victoryTitle, styles.defeatTitle]}>YOU LOSE</Text>
                <Text style={styles.victorySub}>Opponent claimed the prize pool</Text>
              </G>
            )}

            <TouchableOpacity style={styles.closeModalBtn} onPress={onLeaveMatch}>
              <Text style={styles.closeModalBtnText}>RETURN TO ARENA</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0E0E12',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#0E0E12',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loadingText: {
    color: '#FF4D4D',
    fontWeight: 'bold',
    fontSize: 16,
    letterSpacing: 1,
    marginTop: 20,
  },
  subtext: {
    color: '#6E6E7E',
    fontSize: 12,
    marginTop: 8,
  },
  hudContainer: {
    width: BOARD_SIZE,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  playerInfoNode: {
    flex: 1.2,
    flexDirection: 'row',
    alignItems: 'center',
  },
  colorIndicator: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 6,
  },
  playerText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: 'bold',
    maxWidth: 90,
  },
  alignRight: {
    textAlign: 'right',
  },
  timerContainer: {
    flex: 0.8,
    alignItems: 'center',
  },
  timerLabel: {
    fontSize: 8,
    color: '#8A8A9E',
    letterSpacing: 0.5,
    fontWeight: 'bold',
  },
  timerValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#00E676',
    marginTop: 2,
  },
  timerDanger: {
    color: '#FF5252',
  },
  boardWrapper: {
    width: BOARD_SIZE,
    height: BOARD_SIZE,
    borderWidth: 2,
    borderColor: '#303040',
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#20202A',
  },
  boardSvg: {
    backgroundColor: '#20202A',
  },
  controlContainer: {
    width: BOARD_SIZE,
    marginTop: 20,
    alignItems: 'center',
  },
  turnNotifyText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#00E676',
    letterSpacing: 0.5,
    marginBottom: 15,
  },
  turnNotifyWaiting: {
    fontSize: 14,
    fontWeight: '500',
    color: '#8A8A9E',
    marginBottom: 15,
  },
  dicePlaySection: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  diceCard: {
    width: 64,
    height: 64,
    backgroundColor: '#20202B',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#44445C',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 5,
  },
  diceCardInteractive: {
    borderColor: '#FF4D4D',
    backgroundColor: '#FF4D4D15',
  },
  diceCardAnimating: {
    borderColor: '#00E676',
  },
  diceText: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFF',
  },
  rollMetadata: {
    marginLeft: 20,
  },
  rollMetaText: {
    color: '#8C8C9E',
    fontSize: 12,
    marginBottom: 4,
  },
  forfeitBtn: {
    backgroundColor: '#1C1C24',
    borderWidth: 1,
    borderColor: '#FF5252',
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  forfeitBtnText: {
    color: '#FF5252',
    fontSize: 13,
    fontWeight: 'bold',
  },
  victoryModalContainer: {
    flex: 1,
    backgroundColor: '#000000DD',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  victoryCard: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: '#181822',
    borderRadius: 16,
    padding: 30,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#FFD600',
    shadowColor: '#FFD600',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.2,
    shadowRadius: 15,
  },
  victoryTitle: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#FFD600',
    textAlign: 'center',
    letterSpacing: 2,
  },
  defeatTitle: {
    color: '#FF5252',
    borderColor: '#FF5252',
  },
  victorySub: {
    color: '#8A8A9E',
    fontSize: 13,
    marginTop: 10,
    textAlign: 'center',
  },
  winningsText: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#00E676',
    marginTop: 15,
    textAlign: 'center',
  },
  closeModalBtn: {
    backgroundColor: '#FFD600',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 30,
    marginTop: 30,
    width: '100%',
    alignItems: 'center',
  },
  closeModalBtnText: {
    color: '#12121A',
    fontWeight: 'bold',
    fontSize: 15,
  },
});
export default GameScreen;
