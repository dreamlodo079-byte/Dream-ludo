import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Modal,
  Alert,
  ActivityIndicator,
  Animated,
  Easing,
  StatusBar,
  SafeAreaView,
  useWindowDimensions,
} from 'react-native';
import Svg, {
  Rect,
  Circle,
  Path,
  G,
  Polygon,
  Defs,
  LinearGradient,
  RadialGradient,
  Stop,
  Ellipse,
  Text as SvgText,
} from 'react-native-svg';
import axios from 'axios';

const API_SERVER_URL = process.env.EXPO_PUBLIC_SERVER_URL || 'http://localhost:5000';

const { width: initWidth, height: initHeight } = Dimensions.get('window');
// Initial dummy values for StyleSheet
const INITIAL_MAX_BOARD = Math.min(initWidth - 20, 500);
const INITIAL_BOARD_SIZE = Math.min(INITIAL_MAX_BOARD, initHeight - 380);
const INITIAL_CELL_SIZE = INITIAL_BOARD_SIZE / 15;

interface UserProfile {
  _id: string;
  phone: string;
  username: string;
}

interface GameScreenProps {
  roomId: string;
  currentUser: UserProfile;
  onLeaveMatch: () => void;
  matchState: any;
  winnerInfo: any;
  alertMessage: string | null;
  clearAlert: () => void;
  requestRoll: (roomId: string) => void;
  requestMove: (roomId: string, tokenIndex: number) => void;
  requestForfeit?: (roomId: string) => void;
  isConnected: boolean;
}

// ============ BOLD PREMIUM COLOR PALETTE ============
const COLORS = {
  red: {
    primary: '#E63946',
    dark: '#B71C2E',
    light: '#FFCDD2',
    bg: '#FFEBEE',
    gradient1: '#FF5252',
    gradient2: '#D32F2F',
  },
  green: {
    primary: '#2E7D32',
    dark: '#1B5E20',
    light: '#C8E6C9',
    bg: '#E8F5E9',
    gradient1: '#43A047',
    gradient2: '#1B5E20',
  },
  blue: {
    primary: '#1976D2',
    dark: '#0D47A1',
    light: '#BBDEFB',
    bg: '#E3F2FD',
    gradient1: '#2196F3',
    gradient2: '#0D47A1',
  },
  yellow: {
    primary: '#F9A825',
    dark: '#F57F17',
    light: '#FFF9C4',
    bg: '#FFFDE7',
    gradient1: '#FDD835',
    gradient2: '#F57F17',
  },
};

const COMMON_TRACK_COORDS = [
  { x: 0, y: 6 }, { x: 1, y: 6 }, { x: 2, y: 6 }, { x: 3, y: 6 }, { x: 4, y: 6 }, { x: 5, y: 6 },
  { x: 6, y: 5 }, { x: 6, y: 4 }, { x: 6, y: 3 }, { x: 6, y: 2 }, { x: 6, y: 1 }, { x: 6, y: 0 },
  { x: 7, y: 0 },
  { x: 8, y: 0 }, { x: 8, y: 1 }, { x: 8, y: 2 }, { x: 8, y: 3 }, { x: 8, y: 4 }, { x: 8, y: 5 },
  { x: 9, y: 6 }, { x: 10, y: 6 }, { x: 11, y: 6 }, { x: 12, y: 6 }, { x: 13, y: 6 }, { x: 14, y: 6 },
  { x: 14, y: 7 },
  { x: 14, y: 8 }, { x: 13, y: 8 }, { x: 12, y: 8 }, { x: 11, y: 8 }, { x: 10, y: 8 }, { x: 9, y: 8 },
  { x: 8, y: 9 }, { x: 8, y: 10 }, { x: 8, y: 11 }, { x: 8, y: 12 }, { x: 8, y: 13 }, { x: 8, y: 14 },
  { x: 7, y: 14 },
  { x: 6, y: 14 }, { x: 6, y: 13 }, { x: 6, y: 12 }, { x: 6, y: 11 }, { x: 6, y: 10 }, { x: 6, y: 9 },
  { x: 5, y: 8 }, { x: 4, y: 8 }, { x: 3, y: 8 }, { x: 2, y: 8 }, { x: 1, y: 8 }, { x: 0, y: 8 },
  { x: 0, y: 7 },
];

const SAFE_COMMON_INDICES = [1, 9, 14, 22, 27, 35, 40, 48];
const PLAYER_START_OFFSETS = [1, 27];

const getCommonIndex = (playerIndex: number, pos: number): number => {
  if (pos < 0 || pos > 50) return -1;
  const startOffset = PLAYER_START_OFFSETS[playerIndex];
  return (startOffset + pos) % 52;
};

const RED_YARD_TOKEN_COORDS = [
  { x: 1.8, y: 1.8 }, { x: 4.2, y: 1.8 },
  { x: 1.8, y: 4.2 }, { x: 4.2, y: 4.2 },
];

const GREEN_YARD_TOKEN_COORDS = [
  { x: 10.8, y: 10.8 }, { x: 13.2, y: 10.8 },
  { x: 10.8, y: 13.2 }, { x: 13.2, y: 13.2 },
];

const RED_HOME_PATH_COORDS = [
  { x: 1, y: 7 }, { x: 2, y: 7 }, { x: 3, y: 7 }, { x: 4, y: 7 }, { x: 5, y: 7 }, { x: 6, y: 7 },
];

const GREEN_HOME_PATH_COORDS = [
  { x: 13, y: 7 }, { x: 12, y: 7 }, { x: 11, y: 7 }, { x: 10, y: 7 }, { x: 9, y: 7 }, { x: 8, y: 7 },
];

// ============ PREMIUM 3D DICE ============
interface DiceProps {
  value: number;
  size: number;
}

const Dice: React.FC<DiceProps> = ({ value, size }) => {
  const dotSize = size * 0.1;
  const padding = size * 0.26;
  const center = size / 2;
  const low = padding;
  const high = size - padding;

  const getDots = () => {
    switch (value) {
      case 1: return [{ x: center, y: center }];
      case 2: return [{ x: low, y: low }, { x: high, y: high }];
      case 3: return [{ x: low, y: low }, { x: center, y: center }, { x: high, y: high }];
      case 4: return [{ x: low, y: low }, { x: high, y: low }, { x: low, y: high }, { x: high, y: high }];
      case 5: return [{ x: low, y: low }, { x: high, y: low }, { x: center, y: center }, { x: low, y: high }, { x: high, y: high }];
      case 6: return [{ x: low, y: low }, { x: high, y: low }, { x: low, y: center }, { x: high, y: center }, { x: low, y: high }, { x: high, y: high }];
      default: return [];
    }
  };

  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <Defs>
        <LinearGradient id="dice3DGrad" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#FFFFFF" />
          <Stop offset="0.5" stopColor="#F1F5F9" />
          <Stop offset="1" stopColor="#CBD5E1" />
        </LinearGradient>
        <RadialGradient id="diceShine" cx="30%" cy="30%" r="60%">
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0.9" />
          <Stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
        </RadialGradient>
      </Defs>
      {/* Shadow */}
      <Rect x={4} y={6} width={size - 6} height={size - 6} rx={14} ry={14} fill="#000" opacity={0.15} />
      {/* Main dice body */}
      <Rect
        x={2}
        y={2}
        width={size - 6}
        height={size - 6}
        rx={13}
        ry={13}
        fill="url(#dice3DGrad)"
        stroke="#94A3B8"
        strokeWidth={1.5}
      />
      {/* Glossy highlight */}
      <Rect
        x={5}
        y={5}
        width={(size - 6) * 0.5}
        height={(size - 6) * 0.4}
        rx={10}
        ry={10}
        fill="url(#diceShine)"
      />
      {getDots().map((dot, i) => (
        <G key={i}>
          <Circle cx={dot.x + 0.5} cy={dot.y + 0.5} r={dotSize} fill="#000" opacity={0.2} />
          <Circle cx={dot.x} cy={dot.y} r={dotSize} fill="#1E293B" />
          <Circle cx={dot.x - dotSize * 0.3} cy={dot.y - dotSize * 0.3} r={dotSize * 0.35} fill="#FFF" opacity={0.4} />
        </G>
      ))}
    </Svg>
  );
};

// ============ PREMIUM 3D PAWN ============
interface Pawn3DProps {
  color: 'red' | 'green' | 'blue' | 'yellow';
  size: number;
}

const Pawn3D: React.FC<Pawn3DProps> = ({ color, size }) => {
  const c = COLORS[color];
  const gradId = `${color}PawnGrad`;
  const shineId = `${color}Shine`;

  return (
    <Svg width={size} height={size * 1.15} viewBox="0 0 32 36">
      <Defs>
        <LinearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={c.gradient1} />
          <Stop offset="0.6" stopColor={c.primary} />
          <Stop offset="1" stopColor={c.dark} />
        </LinearGradient>
        <RadialGradient id={shineId} cx="35%" cy="30%" r="35%">
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0.9" />
          <Stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
        </RadialGradient>
      </Defs>

      {/* Deep shadow */}
      <Ellipse cx="16" cy="33" rx="10" ry="2.5" fill="#000000" opacity="0.35" />

      {/* Base */}
      <Ellipse cx="16" cy="30" rx="9" ry="3" fill={c.dark} />
      <Ellipse cx="16" cy="29" rx="9" ry="3" fill={`url(#${gradId})`} stroke="#FFFFFF" strokeWidth="0.8" />

      {/* Neck (tapered body) */}
      <Path
        d="M 10 29 C 10 24, 12 18, 13 14 L 19 14 C 20 18, 22 24, 22 29 Z"
        fill={`url(#${gradId})`}
      />

      {/* Glossy Head */}
      <Circle cx="16" cy="11" r="7" fill={`url(#${gradId})`} stroke="#FFFFFF" strokeWidth="0.8" />
      <Circle cx="16" cy="11" r="7" fill={`url(#${shineId})`} />
    </Svg>
  );
};

// ============ STAR VECTOR SVG ============
const renderStar = (cx: number, cy: number, r: number) => {
  const points: string[] = [];
  for (let i = 0; i < 10; i++) {
    const angle = (Math.PI / 5) * i - Math.PI / 2;
    const radius = i % 2 === 0 ? r : r * 0.42;
    points.push(`${cx + Math.cos(angle) * radius},${cy + Math.sin(angle) * radius}`);
  }
  return `M ${points.join(' L ')} Z`;
};

const getStarPath = renderStar;

// ============ ARROW PATH FOR HOME ENTRY ============
const getArrowPath = (cx: number, cy: number, size: number, direction: 'up' | 'down' | 'left' | 'right') => {
  const s = size * 0.35;
  switch (direction) {
    case 'right':
      return `M ${cx - s} ${cy - s} L ${cx + s} ${cy} L ${cx - s} ${cy + s} Z`;
    case 'left':
      return `M ${cx + s} ${cy - s} L ${cx - s} ${cy} L ${cx + s} ${cy + s} Z`;
    case 'up':
      return `M ${cx - s} ${cy + s} L ${cx} ${cy - s} L ${cx + s} ${cy + s} Z`;
    case 'down':
      return `M ${cx - s} ${cy - s} L ${cx} ${cy + s} L ${cx + s} ${cy - s} Z`;
  }
};

// ============ PLAYER CARD (PREMIUM LIKE MPL/ZUPEE) ============
interface PlayerCardProps {
  username: string;
  color: 'red' | 'green';
  isActive: boolean;
  isCurrentUser: boolean;
  turnTimer: number;
  totalTime: number;
  tokensHome: number;
  align: 'left' | 'right';
  totalTokens: number;
  score?: number;
}

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const PlayerCard: React.FC<PlayerCardProps> = ({
  username,
  color,
  isActive,
  isCurrentUser,
  turnTimer,
  totalTime,
  tokensHome,
  align,
  totalTokens,
  score,
}) => {
  const c = COLORS[color];
  const animatedRatio = useRef(new Animated.Value(turnTimer / totalTime)).current;

  useEffect(() => {
    if (isActive) {
      Animated.timing(animatedRatio, {
        toValue: Math.max(0, (turnTimer - 1) / totalTime),
        duration: 1000,
        useNativeDriver: false,
        easing: Easing.linear,
      }).start();
    } else {
      animatedRatio.setValue(1);
    }
  }, [turnTimer, isActive, totalTime]);

  // Circle timer SVG calculations
  const ringSize = 36;
  const strokeWidth = 2.5;
  const radius = (ringSize - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  
  const animatedDashoffset = animatedRatio.interpolate({
    inputRange: [0, 1],
    outputRange: [circumference, 0],
  });
  
  const timerColor = turnTimer <= 4 ? '#EF4444' : c.primary;

  return (
    <Animated.View
      style={[
        styles.playerCard,
        {
          borderColor: isActive ? c.primary : '#E2E8F0',
          borderWidth: isActive ? 2 : 1.5,
          backgroundColor: isActive ? c.bg : '#FFFFFF',
        },
      ]}
    >
      {/* Avatar Container with Timer Ring */}
      <View style={styles.avatarWrapper}>
        <Svg width={ringSize} height={ringSize} style={styles.timerRing}>
          <Circle
            cx={ringSize / 2}
            cy={ringSize / 2}
            r={radius}
            stroke="#E2E8F0"
            strokeWidth={strokeWidth}
            fill="none"
          />
          {isActive && (
            <AnimatedCircle
              cx={ringSize / 2}
              cy={ringSize / 2}
              r={radius}
              stroke={timerColor}
              strokeWidth={strokeWidth}
              fill="none"
              strokeDasharray={circumference}
              strokeDashoffset={animatedDashoffset}
              strokeLinecap="round"
              transform={`rotate(-90 ${ringSize / 2} ${ringSize / 2})`}
            />
          )}
        </Svg>
        <View style={[styles.avatar, { backgroundColor: c.primary }]}>
          <Text style={styles.avatarText}>{username.charAt(0).toUpperCase()}</Text>
        </View>
        {isActive && (
          <View style={[styles.timerBadge, { backgroundColor: timerColor }]}>
            <Text style={styles.timerBadgeText}>{turnTimer}</Text>
          </View>
        )}
      </View>

      {/* Player Info */}
      <View style={[styles.playerInfo, align === 'right' && { alignItems: 'flex-end' }]}>
        <Text style={[styles.playerName, { color: '#0F172A' }]} numberOfLines={1}>
          {username}
          {isCurrentUser && <Text style={{ color: c.primary }}> (You)</Text>}
        </Text>
        <View style={[styles.playerStats, { flexDirection: align === 'right' ? 'row-reverse' : 'row', flexWrap: 'wrap', gap: 4, justifyContent: align === 'right' ? 'flex-end' : 'flex-start' }]}>
          <View style={[styles.tokenBadge, { backgroundColor: c.bg, borderColor: c.primary, paddingHorizontal: 5, paddingVertical: 1.5, borderRadius: 6 }]}>
            <Text style={[styles.tokenBadgeText, { color: c.dark, fontSize: 8.5 }]}>🏠 {tokensHome}/{totalTokens}</Text>
          </View>
          {score !== undefined && (
            <View style={{ backgroundColor: '#FEF3C7', borderColor: '#F59E0B', borderWidth: 1, borderRadius: 6, paddingHorizontal: 5, paddingVertical: 1.5 }}>
              <Text style={{ fontSize: 8.5, fontWeight: '800', color: '#B45309' }}>🏆 {score} pts</Text>
            </View>
          )}
        </View>
        {isActive && (
          <Text style={[styles.turnLabel, { color: c.primary }]}>● PLAYING</Text>
        )}
      </View>
    </Animated.View>
  );
};

// ============ MAIN GAME SCREEN ============
import SoundManager from '../utils/SoundManager';

// ============ MAIN GAME SCREEN ============
export const GameScreen: React.FC<GameScreenProps> = ({
  roomId,
  currentUser,
  onLeaveMatch,
  matchState,
  winnerInfo,
  alertMessage,
  clearAlert,
  requestRoll,
  requestMove,
  requestForfeit,
  isConnected,
}) => {
  const { width, height } = useWindowDimensions();
  const MAX_BOARD_WIDTH = Math.min(width - 20, 500);
  const BOARD_SIZE = Math.max(200, Math.min(MAX_BOARD_WIDTH, height - 380));
  const CELL_SIZE = BOARD_SIZE / 15;

  const [diceDisplayVal, setDiceDisplayVal] = useState<number>(1);
  const [isDiceAnimating, setIsDiceAnimating] = useState(false);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [previousTimer, setPreviousTimer] = useState<number>(15);



  const diceScale = useRef(new Animated.Value(1)).current;
  const diceRotZ = useRef(new Animated.Value(0)).current;
  const tokenPulseAnim = useRef(new Animated.Value(1)).current;
  const yourTurnAnim = useRef(new Animated.Value(0)).current;

  const pawnPositions = useRef(
    Array.from({ length: 8 }, () => new Animated.ValueXY({ x: 0, y: 0 }))
  ).current;

  const visualPositions = useRef([-1, -1, -1, -1, -1, -1, -1, -1]);

  const pawnHeightOffsets = useRef(
    Array.from({ length: 8 }, () => new Animated.Value(0))
  ).current;

  const pawnScaleX = useRef(
    Array.from({ length: 8 }, () => new Animated.Value(1))
  ).current;

  const pawnScaleY = useRef(
    Array.from({ length: 8 }, () => new Animated.Value(1))
  ).current;

  const isTokenAnimating = useRef([false, false, false, false, false, false, false, false]);

  const toastAnim = useRef(new Animated.Value(-100)).current;

  useEffect(() => {
    if (alertMessage) {
      // Slide down
      Animated.spring(toastAnim, {
        toValue: 0,
        useNativeDriver: true,
        tension: 40,
        friction: 8,
      }).start();

      // Auto dismiss after 3 seconds
      const timer = setTimeout(() => {
        Animated.timing(toastAnim, {
          toValue: -100,
          duration: 300,
          useNativeDriver: true,
        }).start(() => {
          clearAlert();
        });
      }, 3000);

      return () => clearTimeout(timer);
    }
  }, [alertMessage, clearAlert, toastAnim]);

  // Pulse animation for playable tokens
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(tokenPulseAnim, { toValue: 1.15, duration: 600, useNativeDriver: true }),
        Animated.timing(tokenPulseAnim, { toValue: 1.0, duration: 600, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  const tokenRotateAnim = useRef(new Animated.Value(0)).current;

  // Rotation animation for playable tokens in yard
  useEffect(() => {
    Animated.loop(
      Animated.timing(tokenRotateAnim, {
        toValue: 1,
        duration: 4000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    ).start();
  }, []);

  const spinAnim = tokenRotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  // Your Turn banner animation
  useEffect(() => {
    if (!matchState) return;
    const activePlayer = matchState.players[matchState.activePlayerIndex];
    const isMyTurn = activePlayer.id === currentUser._id;

    if (isMyTurn && !matchState.hasRolled) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(yourTurnAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
          Animated.timing(yourTurnAnim, { toValue: 0.6, duration: 800, useNativeDriver: true }),
        ])
      ).start();
    } else {
      yourTurnAnim.setValue(1);
    }
  }, [matchState?.activePlayerIndex, matchState?.hasRolled]);

  const getStackingInfo = (pIdx: number, tIdx: number, pos: number) => {
    if (pos === -1 || pos === 56 || !matchState?.players) {
      return { subX: 0, subY: 0, scale: 1.0, stackCount: 1 };
    }

    const startOffset = PLAYER_START_OFFSETS[pIdx];
    let cellId: string;
    if (pos >= 51 && pos <= 55) {
      cellId = `home_${pIdx}_${pos}`;
    } else {
      const commonIdx = (startOffset + pos) % 52;
      cellId = `common_${commonIdx}`;
    }

    const coOccupying: Array<{ pIdx: number; tIdx: number; globalIdx: number }> = [];
    matchState.players.forEach((player: any, pIndex: number) => {
      const pStart = PLAYER_START_OFFSETS[pIndex];
      player.tokens.forEach((otherPos: number, tokenIndex: number) => {
        let otherCellId: string | null = null;
        if (otherPos >= 51 && otherPos <= 55) {
          otherCellId = `home_${pIndex}_${otherPos}`;
        } else if (otherPos >= 0 && otherPos <= 50) {
          const cIdx = (pStart + otherPos) % 52;
          otherCellId = `common_${cIdx}`;
        }
        if (otherCellId === cellId) {
          coOccupying.push({ pIdx: pIndex, tIdx: tokenIndex, globalIdx: pIndex * 4 + tokenIndex });
        }
      });
    });

    const stackCount = coOccupying.length;
    if (stackCount <= 1) {
      return { subX: 0, subY: 0, scale: 1.0, stackCount: 1 };
    }

    const myGlobalIdx = pIdx * 4 + tIdx;
    const subIndex = coOccupying.findIndex((item) => item.globalIdx === myGlobalIdx);
    const subIdx = subIndex === -1 ? 0 : subIndex;

    const offsetAmount = CELL_SIZE * 0.18;

    if (stackCount === 2) {
      const offsets = [
        { x: -offsetAmount, y: -offsetAmount * 0.5 },
        { x: offsetAmount, y: offsetAmount * 0.5 },
      ];
      const selected = offsets[subIdx % 2];
      return { subX: selected.x, subY: selected.y, scale: 0.76, stackCount };
    } else if (stackCount === 3) {
      const offsets = [
        { x: -offsetAmount, y: -offsetAmount * 0.7 },
        { x: offsetAmount, y: -offsetAmount * 0.7 },
        { x: 0, y: offsetAmount * 0.8 },
      ];
      const selected = offsets[subIdx % 3];
      return { subX: selected.x, subY: selected.y, scale: 0.68, stackCount };
    } else {
      const offsets = [
        { x: -offsetAmount, y: -offsetAmount * 0.7 },
        { x: offsetAmount, y: -offsetAmount * 0.7 },
        { x: -offsetAmount, y: offsetAmount * 0.7 },
        { x: offsetAmount, y: offsetAmount * 0.7 },
      ];
      const selected = offsets[subIdx % 4];
      return { subX: selected.x, subY: selected.y, scale: 0.60, stackCount };
    }
  };

  const getTokenCoords = (playerIndex: number, tokenIndex: number, pos: number): { x: number; y: number } => {
    let gridX = 0;
    let gridY = 0;

    if (pos === -1) {
      const yardCoords = playerIndex === 0 ? RED_YARD_TOKEN_COORDS : GREEN_YARD_TOKEN_COORDS;
      gridX = yardCoords[tokenIndex].x;
      gridY = yardCoords[tokenIndex].y;
    } else if (pos === 56) {
      gridX = 7.5;
      gridY = 7.5;
    } else if (pos >= 51 && pos <= 55) {
      const pathCoords = playerIndex === 0 ? RED_HOME_PATH_COORDS : GREEN_HOME_PATH_COORDS;
      const idx = pos - 51;
      gridX = pathCoords[idx].x + 0.5;
      gridY = pathCoords[idx].y + 0.5;
    } else {
      const startOffset = PLAYER_START_OFFSETS[playerIndex];
      const commonIdx = (startOffset + pos) % 52;
      const coord = COMMON_TRACK_COORDS[commonIdx];
      gridX = coord.x + 0.5;
      gridY = coord.y + 0.5;
    }

    const basePos = {
      x: gridX * CELL_SIZE - CELL_SIZE * 0.5,
      y: gridY * CELL_SIZE - CELL_SIZE * 0.6,
    };

    const stacking = getStackingInfo(playerIndex, tokenIndex, pos);
    return {
      x: basePos.x + stacking.subX,
      y: basePos.y + stacking.subY,
    };
  };

  useEffect(() => {
    if (!matchState) return;

    // Detect if there is a capture in this state update
    let activeCapture: {
      attackerIdx: number;
      attackerPIdx: number;
      attackerTIdx: number;
      attackerStart: number;
      attackerEnd: number;
      victimIdx: number;
      victimPIdx: number;
      victimTIdx: number;
      victimStart: number;
    } | null = null;

    matchState.players.forEach((player: any, pIdx: number) => {
      player.tokens.forEach((serverPos: number, tIdx: number) => {
        const tokenIdx = pIdx * 4 + tIdx;
        const visualPos = visualPositions.current[tokenIdx];

        if (serverPos > visualPos && visualPos !== -1) {
          const attackerCommon = getCommonIndex(pIdx, serverPos);
          matchState.players.forEach((oppPlayer: any, oppIdx: number) => {
            if (oppIdx === pIdx) return;
            oppPlayer.tokens.forEach((oppServerPos: number, oppTIdx: number) => {
              const oppTokenIdx = oppIdx * 4 + oppTIdx;
              const oppVisualPos = visualPositions.current[oppTokenIdx];
              if (oppServerPos === -1 && oppVisualPos !== -1) {
                const victimCommon = getCommonIndex(oppIdx, oppVisualPos);
                if (attackerCommon !== -1 && attackerCommon === victimCommon) {
                  activeCapture = {
                    attackerIdx: tokenIdx,
                    attackerPIdx: pIdx,
                    attackerTIdx: tIdx,
                    attackerStart: visualPos,
                    attackerEnd: serverPos,
                    victimIdx: oppTokenIdx,
                    victimPIdx: oppIdx,
                    victimTIdx: oppTIdx,
                    victimStart: oppVisualPos,
                  };
                }
              }
            });
          });
        }
      });
    });

    if (activeCapture) {
      const {
        attackerIdx, attackerPIdx, attackerTIdx, attackerStart, attackerEnd,
        victimIdx, victimPIdx, victimTIdx, victimStart
      } = activeCapture;

      // Lock both tokens from parallel rendering triggers
      isTokenAnimating.current[attackerIdx] = true;
      isTokenAnimating.current[victimIdx] = true;

      // Run sequence sequentially
      const runCoordinatedCapture = async () => {
        // 1. Attacker walks forward to target tile
        await animateStepPath(attackerPIdx, attackerTIdx, attackerStart, attackerEnd);
        // 2. Small dramatic impact pause
        await new Promise((r) => setTimeout(r, 150));
        // 3. Captured victim slides back to yard
        await animateBackwardPath(victimPIdx, victimTIdx, victimStart, -1);
      };

      runCoordinatedCapture();
    }

    matchState.players.forEach((player: any, pIdx: number) => {
      player.tokens.forEach((serverPos: number, tIdx: number) => {
        const tokenIdx = pIdx * 4 + tIdx;

        // Skip default animations if this token is currently in the active capture sequence
        if (activeCapture && (tokenIdx === activeCapture.attackerIdx || tokenIdx === activeCapture.victimIdx)) {
          return;
        }

        const visualPos = visualPositions.current[tokenIdx];
        const targetCoords = getTokenCoords(pIdx, tIdx, serverPos);

        if (visualPos === -1 && serverPos !== -1) {
          Animated.spring(pawnPositions[tokenIdx], {
            toValue: targetCoords,
            useNativeDriver: true,
            friction: 6,
            tension: 40,
          }).start();
          visualPositions.current[tokenIdx] = serverPos;
        } else if (serverPos < visualPos && !isTokenAnimating.current[tokenIdx]) {
          isTokenAnimating.current[tokenIdx] = true;
          animateBackwardPath(pIdx, tIdx, visualPos, serverPos);
        } else if (serverPos !== visualPos && !isTokenAnimating.current[tokenIdx]) {
          isTokenAnimating.current[tokenIdx] = true;
          animateStepPath(pIdx, tIdx, visualPos, serverPos);
        } else {
          pawnPositions[tokenIdx].setValue(targetCoords);
          visualPositions.current[tokenIdx] = serverPos;
        }
      });
    });
  }, [matchState?.players]);

  const animateBackwardPath = async (pIdx: number, tIdx: number, start: number, end: number) => {
    const tokenIdx = pIdx * 4 + tIdx;
    
    // Play pawn killed sound only for the victim player
    const myPlayerIndex = matchState?.players.findIndex((p: any) => p.id === currentUser._id);
    if (pIdx === myPlayerIndex) {
      SoundManager.playKilled();
    }

    const stopAt = Math.max(0, end);

    for (let currentStep = start; currentStep > stopAt; currentStep--) {
      const nextStep = currentStep - 1;
      const endCoords = getTokenCoords(pIdx, tIdx, nextStep);

      await new Promise<void>((resolve) => {
        Animated.timing(pawnPositions[tokenIdx], {
          toValue: endCoords,
          duration: 120, // satisfying step-by-step backward slide speed
          useNativeDriver: true,
          easing: Easing.linear,
        }).start(() => resolve());
      });
      visualPositions.current[tokenIdx] = nextStep;
    }

    // Now fly/spring from 0 into the yard lobby pocket (-1) if capturing
    const finalCoords = getTokenCoords(pIdx, tIdx, end);
    if (end === -1) {
      await new Promise<void>((resolve) => {
        Animated.spring(pawnPositions[tokenIdx], {
          toValue: finalCoords,
          useNativeDriver: true,
          friction: 6,
          tension: 40,
        }).start(() => resolve());
      });
      visualPositions.current[tokenIdx] = -1;
    } else {
      pawnPositions[tokenIdx].setValue(finalCoords);
      visualPositions.current[tokenIdx] = end;
    }
    isTokenAnimating.current[tokenIdx] = false;
  };

  const animateStepPath = async (pIdx: number, tIdx: number, start: number, end: number) => {
    const tokenIdx = pIdx * 4 + tIdx;
    
    SoundManager.playPawnHop(end - start, 280);

    for (let currentStep = start; currentStep < end; currentStep++) {
      const nextStep = currentStep + 1;
      const startCoords = getTokenCoords(pIdx, tIdx, currentStep);
      const endCoords = getTokenCoords(pIdx, tIdx, nextStep);

      await new Promise<void>((resolve) => {
        pawnPositions[tokenIdx].setValue(startCoords);
        pawnHeightOffsets[tokenIdx].setValue(0);
        pawnScaleX[tokenIdx].setValue(1);
        pawnScaleY[tokenIdx].setValue(1);

        Animated.parallel([
          Animated.timing(pawnPositions[tokenIdx], {
            toValue: endCoords,
            duration: 280,
            useNativeDriver: true,
            easing: Easing.linear,
          }),
          Animated.sequence([
            Animated.timing(pawnHeightOffsets[tokenIdx], {
              toValue: -32,
              duration: 140,
              useNativeDriver: true,
              easing: Easing.out(Easing.quad),
            }),
            Animated.timing(pawnHeightOffsets[tokenIdx], {
              toValue: 0,
              duration: 140,
              useNativeDriver: true,
              easing: Easing.in(Easing.quad),
            }),
          ]),
          Animated.sequence([
            Animated.parallel([
              Animated.timing(pawnScaleX[tokenIdx], { toValue: 0.85, duration: 140, useNativeDriver: Platform.OS !== 'web' }),
              Animated.timing(pawnScaleY[tokenIdx], { toValue: 1.15, duration: 140, useNativeDriver: Platform.OS !== 'web' }),
            ]),
            Animated.parallel([
              Animated.timing(pawnScaleX[tokenIdx], { toValue: 1.2, duration: 70, useNativeDriver: Platform.OS !== 'web' }),
              Animated.timing(pawnScaleY[tokenIdx], { toValue: 0.8, duration: 70, useNativeDriver: Platform.OS !== 'web' }),
            ]),
            Animated.parallel([
              Animated.timing(pawnScaleX[tokenIdx], { toValue: 1.0, duration: 70, useNativeDriver: Platform.OS !== 'web' }),
              Animated.timing(pawnScaleY[tokenIdx], { toValue: 1.0, duration: 70, useNativeDriver: Platform.OS !== 'web' }),
            ]),
          ]),
        ]).start(() => {
          visualPositions.current[tokenIdx] = nextStep;
          resolve();
        });
      });
    }

    // Play home sound if token entered home
    if (end === 56) {
      SoundManager.playHomeEnter();
    }

    isTokenAnimating.current[tokenIdx] = false;
  };

  useEffect(() => {
    if (matchState?.diceRoll !== undefined && matchState?.diceRoll !== null) {
      setIsDiceAnimating(true);
      SoundManager.playDiceRoll();

      Animated.parallel([
        Animated.sequence([
          Animated.timing(diceScale, { toValue: 1.3, duration: 150, useNativeDriver: true }),
          Animated.timing(diceScale, { toValue: 1.0, duration: 300, useNativeDriver: true }),
        ]),
        Animated.sequence([
          Animated.timing(diceRotZ, { toValue: 720, duration: 500, useNativeDriver: true, easing: Easing.out(Easing.cubic) }),
          Animated.timing(diceRotZ, { toValue: 0, duration: 0, useNativeDriver: true }),
        ]),
      ]).start();

      let count = 0;
      const interval = setInterval(() => {
        setDiceDisplayVal(Math.floor(Math.random() * 6) + 1);
        count++;
        if (count >= 8) {
          clearInterval(interval);
          setDiceDisplayVal(matchState.diceRoll);
          setIsDiceAnimating(false);
        }
      }, 60);
    }
  }, [matchState?.diceRoll]);

  // ============ MOUNT/SOUND EFFECT INIT ============
  useEffect(() => {
    SoundManager.preloadSounds().then(() => {
      SoundManager.playGameStart();
    });
    return () => {
      SoundManager.unloadAll();
    };
  }, []);

  if (!matchState) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <StatusBar barStyle="dark-content" backgroundColor="#F1F5F9" />
        <ActivityIndicator size="large" color="#6366F1" />
        <Text style={styles.loadingText}>JOINING MATCH...</Text>
        <Text style={styles.subtext}>{isConnected ? 'Connected to server' : 'Connecting...'}</Text>
      </SafeAreaView>
    );
  }

  const activePlayer = matchState.players[matchState.activePlayerIndex];
  const isMyTurn = activePlayer.id === currentUser._id;
  const myPlayerIndex = matchState.players.findIndex((p: any) => p.id === currentUser._id);
  const isWinner = winnerInfo !== null;

  const p1TokensHome = matchState.players[0].tokens.filter((t: number) => t === 56).length;
  const p2TokensHome = matchState.players[1].tokens.filter((t: number) => t === 56).length;

  const handleRollDice = () => {
    if (!isMyTurn || matchState.hasRolled || isDiceAnimating) return;
    requestRoll(roomId);
  };



  const handleTokenPress = (tokenIndex: number) => {
    if (!isMyTurn || !matchState.hasRolled) return;
    const myPlayer = matchState.players[myPlayerIndex];
    const pos = myPlayer.tokens[tokenIndex];
    const roll = matchState.diceRoll;

    if (roll === null) return;
    if (pos === 56) return;
    if (pos === -1 && matchState.gameMode !== 'QUICK' && roll !== 6) return;
    if (pos + roll > 56) return;

    requestMove(roomId, tokenIndex);
  };

  const handleExitPress = () => {
    setShowExitConfirm(true);
  };

  const confirmExit = () => {
    setShowExitConfirm(false);
    if (requestForfeit) {
      requestForfeit(roomId);
    }
    onLeaveMatch();
  };

  const rotZInterpolate = diceRotZ.interpolate({
    inputRange: [0, 720],
    outputRange: ['0deg', '720deg'],
  });

  const prizePool = (matchState.entryFee || 0) * 2 * 0.9;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F1F5F9" />

      {alertMessage && (
        <Animated.View
          style={[
            styles.toastContainer,
            {
              transform: [{ translateY: toastAnim }],
            },
          ]}
        >
          <Text style={styles.toastText}>📢 {alertMessage}</Text>
        </Animated.View>
      )}

      {/* ========== TOP BAR ========== */}
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.topExitBtn} onPress={handleExitPress} activeOpacity={0.7}>
          <Text style={styles.topExitIcon}>✕</Text>
        </TouchableOpacity>

        <View style={styles.prizePoolContainer}>
          <Text style={styles.prizePoolLabel}>PRIZE POOL</Text>
          <Text style={styles.prizePoolValue}>₹{prizePool.toFixed(0)}</Text>
          {matchState.gameMode === 'QUICK' && matchState.matchTimer !== undefined && (
            <Text style={styles.topMatchTimer}>
              ⏱️ {Math.floor(matchState.matchTimer / 60)}:{String(matchState.matchTimer % 60).padStart(2, '0')}
            </Text>
          )}
        </View>

        <View style={styles.connectionStatus}>
          <View style={[styles.connectionDot, { backgroundColor: isConnected ? '#10B981' : '#EF4444' }]} />
          <Text style={styles.connectionText}>{isConnected ? 'LIVE' : 'OFFLINE'}</Text>
        </View>
      </View>

      {/* ========== PLAYER CARDS ========== */}
      <View style={styles.playerCardsRow}>
        <PlayerCard
          username={matchState.players[0].username}
          color="red"
          isActive={matchState.activePlayerIndex === 0}
          isCurrentUser={matchState.players[0].id === currentUser._id}
          turnTimer={matchState.turnTimer}
          totalTime={15}
          tokensHome={p1TokensHome}
          totalTokens={matchState.players[0].tokens.length}
          score={matchState.gameMode === 'QUICK' ? (matchState.scores ? matchState.scores[0] : 0) : undefined}
          align="left"
        />
        <View style={styles.vsContainer}>
          <Text style={styles.vsText}>VS</Text>
        </View>
        <PlayerCard
          username={matchState.players[1].username}
          color="green"
          isActive={matchState.activePlayerIndex === 1}
          isCurrentUser={matchState.players[1].id === currentUser._id}
          turnTimer={matchState.turnTimer}
          totalTime={15}
          tokensHome={p2TokensHome}
          totalTokens={matchState.players[1].tokens.length}
          score={matchState.gameMode === 'QUICK' ? (matchState.scores ? matchState.scores[1] : 0) : undefined}
          align="right"
        />
      </View>

      {/* ========== BOARD ========== */}
      <View style={[styles.boardWrapper, { width: BOARD_SIZE, height: BOARD_SIZE }]}>
        <Svg width={BOARD_SIZE} height={BOARD_SIZE} style={styles.boardSvg}>
          <Defs>
            <LinearGradient id="redGrad" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={COLORS.red.gradient1} />
              <Stop offset="1" stopColor={COLORS.red.gradient2} />
            </LinearGradient>
            <LinearGradient id="greenGrad" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={COLORS.green.gradient1} />
              <Stop offset="1" stopColor={COLORS.green.gradient2} />
            </LinearGradient>
            <LinearGradient id="blueGrad" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={COLORS.blue.gradient1} />
              <Stop offset="1" stopColor={COLORS.blue.gradient2} />
            </LinearGradient>
            <LinearGradient id="yellowGrad" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={COLORS.yellow.gradient1} />
              <Stop offset="1" stopColor={COLORS.yellow.gradient2} />
            </LinearGradient>
            <LinearGradient id="starGrad" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor="#FBBF24" />
              <Stop offset="1" stopColor="#D97706" />
            </LinearGradient>
            <RadialGradient id="centerGlow" cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor="#FFF" stopOpacity="0.5" />
              <Stop offset="1" stopColor="#FFF" stopOpacity="0" />
            </RadialGradient>
          </Defs>

          {/* Board Background */}
          <Rect x={0} y={0} width={BOARD_SIZE} height={BOARD_SIZE} fill="#FFFFFF" />

          {/* ============ RED YARD (Top-Left) ============ */}
          <Rect
            x={0}
            y={0}
            width={CELL_SIZE * 6}
            height={CELL_SIZE * 6}
            fill="url(#redGrad)"
          />
          <Rect
            x={CELL_SIZE * 0.8}
            y={CELL_SIZE * 0.8}
            width={CELL_SIZE * 4.4}
            height={CELL_SIZE * 4.4}
            fill="#FFFFFF"
            rx={12}
          />
          <Rect
            x={CELL_SIZE * 1.2}
            y={CELL_SIZE * 1.2}
            width={CELL_SIZE * 3.6}
            height={CELL_SIZE * 3.6}
            fill="#FFFFFF"
            rx={8}
          />
          {RED_YARD_TOKEN_COORDS.map((coord, i) => (
            <G key={`red_yard_${i}`}>
              <Circle
                cx={coord.x * CELL_SIZE}
                cy={coord.y * CELL_SIZE}
                r={CELL_SIZE * 0.45}
                fill={COLORS.red.light}
              />
            </G>
          ))}

          {/* ============ YELLOW YARD (Top-Right) ============ */}
          <Rect
            x={CELL_SIZE * 9}
            y={0}
            width={CELL_SIZE * 6}
            height={CELL_SIZE * 6}
            fill="url(#yellowGrad)"
          />
          <Rect
            x={CELL_SIZE * 9.8}
            y={CELL_SIZE * 0.8}
            width={CELL_SIZE * 4.4}
            height={CELL_SIZE * 4.4}
            fill="#FFFFFF"
            rx={12}
          />
          <Rect
            x={CELL_SIZE * 10.2}
            y={CELL_SIZE * 1.2}
            width={CELL_SIZE * 3.6}
            height={CELL_SIZE * 3.6}
            fill="#FFFFFF"
            rx={8}
          />
          {[
            { x: 10.8, y: 1.8 }, { x: 13.2, y: 1.8 },
            { x: 10.8, y: 4.2 }, { x: 13.2, y: 4.2 },
          ].map((coord, i) => (
            <G key={`yellow_yard_${i}`}>
              <Circle
                cx={coord.x * CELL_SIZE}
                cy={coord.y * CELL_SIZE}
                r={CELL_SIZE * 0.45}
                fill={COLORS.yellow.light}
              />
            </G>
          ))}

          {/* ============ GREEN YARD (Bottom-Right) ============ */}
          <Rect
            x={CELL_SIZE * 9}
            y={CELL_SIZE * 9}
            width={CELL_SIZE * 6}
            height={CELL_SIZE * 6}
            fill="url(#greenGrad)"
          />
          <Rect
            x={CELL_SIZE * 9.8}
            y={CELL_SIZE * 9.8}
            width={CELL_SIZE * 4.4}
            height={CELL_SIZE * 4.4}
            fill="#FFFFFF"
            rx={12}
          />
          <Rect
            x={CELL_SIZE * 10.2}
            y={CELL_SIZE * 10.2}
            width={CELL_SIZE * 3.6}
            height={CELL_SIZE * 3.6}
            fill="#FFFFFF"
            rx={8}
          />
          {GREEN_YARD_TOKEN_COORDS.map((coord, i) => (
            <G key={`green_yard_${i}`}>
              <Circle
                cx={coord.x * CELL_SIZE}
                cy={coord.y * CELL_SIZE}
                r={CELL_SIZE * 0.45}
                fill={COLORS.green.light}
              />
            </G>
          ))}

          {/* ============ BLUE YARD (Bottom-Left) ============ */}
          <Rect
            x={0}
            y={CELL_SIZE * 9}
            width={CELL_SIZE * 6}
            height={CELL_SIZE * 6}
            fill="url(#blueGrad)"
          />
          <Rect
            x={CELL_SIZE * 0.8}
            y={CELL_SIZE * 9.8}
            width={CELL_SIZE * 4.4}
            height={CELL_SIZE * 4.4}
            fill="#FFFFFF"
            rx={12}
          />
          <Rect
            x={CELL_SIZE * 1.2}
            y={CELL_SIZE * 10.2}
            width={CELL_SIZE * 3.6}
            height={CELL_SIZE * 3.6}
            fill="#FFFFFF"
            rx={8}
          />
          {[
            { x: 1.8, y: 10.8 }, { x: 4.2, y: 10.8 },
            { x: 1.8, y: 13.2 }, { x: 4.2, y: 13.2 },
          ].map((coord, i) => (
            <G key={`blue_yard_${i}`}>
              <Circle
                cx={coord.x * CELL_SIZE}
                cy={coord.y * CELL_SIZE}
                r={CELL_SIZE * 0.45}
                fill={COLORS.blue.light}
              />
            </G>
          ))}

          {/* ============ CENTER HOME TRIANGLES ============ */}
          <Polygon
            points={`${CELL_SIZE * 6},${CELL_SIZE * 6} ${CELL_SIZE * 9},${CELL_SIZE * 6} ${CELL_SIZE * 7.5},${CELL_SIZE * 7.5}`}
            fill="url(#yellowGrad)"
            stroke="#FFF"
            strokeWidth={1}
          />
          <Polygon
            points={`${CELL_SIZE * 9},${CELL_SIZE * 6} ${CELL_SIZE * 9},${CELL_SIZE * 9} ${CELL_SIZE * 7.5},${CELL_SIZE * 7.5}`}
            fill="url(#greenGrad)"
            stroke="#FFF"
            strokeWidth={1}
          />
          <Polygon
            points={`${CELL_SIZE * 6},${CELL_SIZE * 9} ${CELL_SIZE * 9},${CELL_SIZE * 9} ${CELL_SIZE * 7.5},${CELL_SIZE * 7.5}`}
            fill="url(#blueGrad)"
            stroke="#FFF"
            strokeWidth={1}
          />
          <Polygon
            points={`${CELL_SIZE * 6},${CELL_SIZE * 6} ${CELL_SIZE * 6},${CELL_SIZE * 9} ${CELL_SIZE * 7.5},${CELL_SIZE * 7.5}`}
            fill="url(#redGrad)"
            stroke="#FFF"
            strokeWidth={1}
          />
          {/* Center glow */}
          <Circle cx={CELL_SIZE * 7.5} cy={CELL_SIZE * 7.5} r={CELL_SIZE * 0.5} fill="url(#centerGlow)" />

          {/* ============ COMMON TRACK ============ */}
          {COMMON_TRACK_COORDS.map((coord, index) => {
            const isSafe = SAFE_COMMON_INDICES.includes(index);
            const isRedStart = index === 1;
            const isYellowStart = index === 14;
            const isGreenStart = index === 27;
            const isBlueStart = index === 40;

            let fillSrc = '#FFFFFF';
            let borderColor = '#94A3B8';
            let borderWidth = 1;

            if (isRedStart) {
              fillSrc = 'url(#redGrad)';
              borderColor = COLORS.red.dark;
              borderWidth = 1.5;
            } else if (isYellowStart) {
              fillSrc = 'url(#yellowGrad)';
              borderColor = COLORS.yellow.dark;
              borderWidth = 1.5;
            } else if (isGreenStart) {
              fillSrc = 'url(#greenGrad)';
              borderColor = COLORS.green.dark;
              borderWidth = 1.5;
            } else if (isBlueStart) {
              fillSrc = 'url(#blueGrad)';
              borderColor = COLORS.blue.dark;
              borderWidth = 1.5;
            } else if (isSafe) {
              fillSrc = '#F1F5F9';
            }

            return (
              <G key={index}>
                <Rect
                  x={coord.x * CELL_SIZE}
                  y={coord.y * CELL_SIZE}
                  width={CELL_SIZE}
                  height={CELL_SIZE}
                  fill={fillSrc}
                  stroke={borderColor}
                  strokeWidth={borderWidth}
                />
                {isSafe && (
                  <Path
                    d={getStarPath(
                      coord.x * CELL_SIZE + CELL_SIZE / 2,
                      coord.y * CELL_SIZE + CELL_SIZE / 2,
                      CELL_SIZE * 0.32
                    )}
                    fill="url(#starGrad)"
                    stroke="#B45309"
                    strokeWidth={0.8}
                  />
                )}
                {/* Start position arrows */}
                {isRedStart && (
                  <Path
                    d={getArrowPath(coord.x * CELL_SIZE + CELL_SIZE / 2, coord.y * CELL_SIZE + CELL_SIZE / 2, CELL_SIZE, 'right')}
                    fill="#FFF"
                    opacity={0.9}
                  />
                )}
                {isGreenStart && (
                  <Path
                    d={getArrowPath(coord.x * CELL_SIZE + CELL_SIZE / 2, coord.y * CELL_SIZE + CELL_SIZE / 2, CELL_SIZE, 'left')}
                    fill="#FFF"
                    opacity={0.9}
                  />
                )}
                {isYellowStart && (
                  <Path
                    d={getArrowPath(coord.x * CELL_SIZE + CELL_SIZE / 2, coord.y * CELL_SIZE + CELL_SIZE / 2, CELL_SIZE, 'down')}
                    fill="#FFF"
                    opacity={0.9}
                  />
                )}
                {isBlueStart && (
                  <Path
                    d={getArrowPath(coord.x * CELL_SIZE + CELL_SIZE / 2, coord.y * CELL_SIZE + CELL_SIZE / 2, CELL_SIZE, 'up')}
                    fill="#FFF"
                    opacity={0.9}
                  />
                )}
              </G>
            );
          })}

          {/* ============ RED HOME PATH ============ */}
          {RED_HOME_PATH_COORDS.slice(0, 5).map((coord, i) => (
            <Rect
              key={`red_home_${i}`}
              x={coord.x * CELL_SIZE}
              y={coord.y * CELL_SIZE}
              width={CELL_SIZE}
              height={CELL_SIZE}
              fill="url(#redGrad)"
              stroke="#FFF"
              strokeWidth={1}
            />
          ))}

          {/* ============ YELLOW HOME PATH ============ */}
          {[1, 2, 3, 4, 5].map((yVal, i) => (
            <Rect
              key={`yellow_home_${i}`}
              x={7 * CELL_SIZE}
              y={yVal * CELL_SIZE}
              width={CELL_SIZE}
              height={CELL_SIZE}
              fill="url(#yellowGrad)"
              stroke="#FFF"
              strokeWidth={1}
            />
          ))}

          {/* ============ GREEN HOME PATH ============ */}
          {GREEN_HOME_PATH_COORDS.slice(0, 5).map((coord, i) => (
            <Rect
              key={`green_home_${i}`}
              x={coord.x * CELL_SIZE}
              y={coord.y * CELL_SIZE}
              width={CELL_SIZE}
              height={CELL_SIZE}
              fill="url(#greenGrad)"
              stroke="#FFF"
              strokeWidth={1}
            />
          ))}

          {/* ============ BLUE HOME PATH ============ */}
          {[9, 10, 11, 12, 13].map((yVal, i) => (
            <Rect
              key={`blue_home_${i}`}
              x={7 * CELL_SIZE}
              y={yVal * CELL_SIZE}
              width={CELL_SIZE}
              height={CELL_SIZE}
              fill="url(#blueGrad)"
              stroke="#FFF"
              strokeWidth={1}
            />
          ))}
        </Svg>

        {/* ============ PAWNS LAYER ============ */}
        {matchState.players.map((player: any, pIdx: number) => {
          // Group tokens of the same player that occupy the same cell index.
          // Tokens still in the yard (-1) or goal (56) are rendered individually.
          const groupsMap = new Map<string, number[]>();
          player.tokens.forEach((pos: number, tIdx: number) => {
            if (pos === -1) {
              groupsMap.set(`yard_${tIdx}`, [tIdx]);
            } else if (pos === 56) {
              groupsMap.set(`goal_${tIdx}`, [tIdx]);
            } else {
              const key = `track_${pos}`;
              if (!groupsMap.has(key)) {
                groupsMap.set(key, []);
              }
              groupsMap.get(key)!.push(tIdx);
            }
          });

          return Array.from(groupsMap.values()).map((tIdxs) => {
            const representativeTIdx = tIdxs[0];
            const tokenIdx = pIdx * 4 + representativeTIdx;
            const isUserToken = player.id === currentUser._id;
            const hasRollVal = matchState.diceRoll !== null;

            // The stack can be clicked to move if any token in it has a valid move
            const moveableTokenIndex = tIdxs.find((tIdx) => {
              const currentPos = player.tokens[tIdx];
              const roll = matchState.diceRoll;
              if (roll === null) return false;
              if (currentPos === 56) return false;
              if (currentPos === -1 && matchState.gameMode !== 'QUICK' && roll !== 6) return false;
              if (currentPos + roll > 56) return false;
              return true;
            });
            
            const canMoveToken = isUserToken && isMyTurn && hasRollVal && moveableTokenIndex !== undefined;
            const sizeMultiplier = canMoveToken ? tokenPulseAnim : 1.0;
            const isInYard = player.tokens[representativeTIdx] === -1;

            const handlePress = () => {
              if (canMoveToken && moveableTokenIndex !== undefined) {
                handleTokenPress(moveableTokenIndex);
              }
            };

            return (
              <Animated.View
                key={`${pIdx}_token_view_group_${representativeTIdx}`}
                style={[
                  styles.pawnWrapper,
                  { width: CELL_SIZE, height: CELL_SIZE * 1.15 },
                  {
                    transform: [
                      { translateX: pawnPositions[tokenIdx].x },
                      { translateY: pawnPositions[tokenIdx].y },
                      { translateY: pawnHeightOffsets[tokenIdx] },
                      { scaleX: pawnScaleX[tokenIdx] },
                      { scaleY: pawnScaleY[tokenIdx] },
                      { scale: sizeMultiplier },
                    ],
                  },
                ]}
              >
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={handlePress}
                  disabled={!canMoveToken}
                  style={styles.pawnTouch}
                >
                  <Animated.View 
                    pointerEvents="none"
                    style={{
                      position: 'absolute',
                      width: CELL_SIZE * 1.25,
                      height: CELL_SIZE * 1.25,
                      opacity: (canMoveToken && isInYard) ? 1 : 0,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Animated.View 
                      style={[
                        styles.dottedHighlight,
                        { width: CELL_SIZE * 1.25, height: CELL_SIZE * 1.25, borderRadius: (CELL_SIZE * 1.25) / 2 },
                        {
                          position: 'relative',
                          borderColor: pIdx === 0 ? COLORS.red.primary : COLORS.green.primary,
                          transform: [{ rotate: spinAnim }]
                        }
                      ]} 
                    />
                  </Animated.View>
                  <Animated.View 
                    pointerEvents="none"
                    style={[
                      styles.glowHighlight,
                      { width: CELL_SIZE * 1.05, height: CELL_SIZE * 1.05, borderRadius: (CELL_SIZE * 1.05) / 2 },
                      {
                        opacity: (canMoveToken && !isInYard) ? 1 : 0,
                        borderColor: pIdx === 0 ? COLORS.red.primary : COLORS.green.primary,
                        backgroundColor: pIdx === 0 ? 'rgba(230, 57, 70, 0.12)' : 'rgba(46, 125, 50, 0.12)',
                        shadowColor: pIdx === 0 ? COLORS.red.primary : COLORS.green.primary,
                      }
                    ]} 
                  />
                  <Pawn3D color={pIdx === 0 ? 'red' : 'green'} size={CELL_SIZE * 0.95} />
                  
                  {/* Micro-badge showing stack count */}
                  {tIdxs.length > 1 && (
                    <View style={styles.stackBadge}>
                      <Text style={styles.stackBadgeText}>{tIdxs.length}</Text>
                    </View>
                  )}
                </TouchableOpacity>
              </Animated.View>
            );
          });
        })}
      </View>



      {/* ============ BOTTOM CONTROL PANEL ============ */}
      <View style={styles.bottomPanel}>
        <View style={{ width: '100%', alignItems: 'center', justifyContent: 'center' }}>
          {isMyTurn ? (
            <Animated.View style={[styles.turnBanner, { opacity: yourTurnAnim }]}>
              <Text style={styles.turnBannerIcon}>🎯</Text>
              <Text style={styles.turnBannerText}>YOUR TURN</Text>
            </Animated.View>
          ) : (
            <View style={styles.waitingBanner}>
              <ActivityIndicator size="small" color="#64748B" />
              <Text style={styles.waitingText}>{activePlayer.username}'s turn...</Text>
            </View>
          )}

          <View style={styles.diceRow}>
            {/* DICE */}
            <TouchableOpacity
              onPress={handleRollDice}
              disabled={!isMyTurn || matchState.hasRolled || isDiceAnimating}
              activeOpacity={0.8}
            >
              <Animated.View
                style={[
                  styles.diceContainer,
                  isMyTurn && !matchState.hasRolled && styles.diceContainerActive,
                  {
                    transform: [
                      { scale: diceScale },
                      { rotate: rotZInterpolate },
                    ],
                  },
                ]}
              >
                {isDiceAnimating ? (
                  <ActivityIndicator color="#6366F1" size="large" />
                ) : (
                  <Dice value={diceDisplayVal} size={70} />
                )}
                {isMyTurn && !matchState.hasRolled && !isDiceAnimating && (
                  <View style={styles.tapHint}>
                    <Text style={styles.tapHintText}>TAP!</Text>
                  </View>
                )}
              </Animated.View>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* ============ EXIT CONFIRM MODAL ============ */}
      <Modal visible={showExitConfirm} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.exitModal}>
            <Text style={styles.exitModalIcon}>⚠️</Text>
            <Text style={styles.exitModalTitle}>Give Up Match?</Text>
            <Text style={styles.exitModalMessage}>
              You will lose your entry fee of{' '}
              <Text style={{ fontWeight: '900', color: '#EF4444' }}>
                ₹{matchState.entryFee || 0}
              </Text>{' '}
              and the other player will win the money.
            </Text>
            <View style={styles.exitModalButtons}>
              <TouchableOpacity
                style={styles.exitCancelBtn}
                onPress={() => setShowExitConfirm(false)}
                activeOpacity={0.8}
              >
                <Text style={styles.exitCancelText}>Keep Playing</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.exitConfirmBtn}
                onPress={confirmExit}
                activeOpacity={0.8}
              >
                <Text style={styles.exitConfirmText}>Give Up</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ============ VICTORY MODAL ============ */}
      <Modal visible={isWinner} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.victoryCard}>
            {winnerInfo?.winnerId === currentUser._id ? (
              <>
                {/* Play Win Sound */}
                {React.createElement(View, { onLayout: () => SoundManager.playWin() })}
                <Text style={styles.victoryEmoji}>🏆</Text>
                <Text style={styles.victoryTitle}>VICTORY!</Text>
                <Text style={styles.victorySub}>Congratulations, you won!</Text>
                <View style={styles.winningsBox}>
                  <Text style={styles.winningsLabel}>You Won</Text>
                  <Text style={styles.winningsAmount}>
                    ₹{winnerInfo?.winnings?.toFixed(2) || '0.00'}
                  </Text>
                  <Text style={styles.winningsCredited}>💰 Credited to Wallet</Text>
                </View>
              </>
            ) : (
              <>
                {/* Play Loss Sound */}
                {React.createElement(View, { onLayout: () => SoundManager.playLoss() })}
                <Text style={styles.victoryEmoji}>💔</Text>
                <Text style={[styles.victoryTitle, styles.defeatTitle]}>DEFEATED</Text>
                <Text style={styles.victorySub}>
                  {winnerInfo?.winnerUsername || 'Opponent'} won the match
                </Text>
                <Text style={styles.tryAgainText}>Better luck next time! 🎲</Text>
              </>
            )}
            <TouchableOpacity
              style={styles.closeModalBtn}
              onPress={onLeaveMatch}
              activeOpacity={0.85}
            >
              <Text style={styles.closeModalBtnText}>RETURN TO LOBBY</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    position: 'relative',
  },
  toastContainer: {
    position: 'absolute',
    top: 50,
    left: 20,
    right: 20,
    backgroundColor: 'rgba(15, 23, 42, 0.95)',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 10,
    zIndex: 9999,
  },
  toastText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
    textAlign: 'center',
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loadingText: {
    color: '#6366F1',
    fontWeight: 'bold',
    fontSize: 15,
    letterSpacing: 1,
    marginTop: 20,
  },
  subtext: {
    color: '#64748B',
    fontSize: 12,
    marginTop: 8,
  },

  // ============ TOP BAR ============
  topBar: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  topExitBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#FCA5A5',
  },
  topExitIcon: {
    fontSize: 18,
    fontWeight: '900',
    color: '#DC2626',
  },
  prizePoolContainer: {
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 20,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#F59E0B',
  },
  prizePoolLabel: {
    fontSize: 9,
    color: '#92400E',
    fontWeight: '700',
    letterSpacing: 1,
  },
  prizePoolValue: {
    fontSize: 18,
    color: '#78350F',
    fontWeight: '900',
    marginTop: 1,
  },
  connectionStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
  },
  connectionDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 5,
  },
  connectionText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#334155',
    letterSpacing: 0.5,
  },

  // ============ PLAYER CARDS ============
  playerCardsRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    paddingTop: 16,
    paddingBottom: 8,
  },
  playerCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    padding: 6,
    borderRadius: 14,
    borderWidth: 2,
    shadowOffset: { width: 0, height: 3 },
    shadowRadius: 8,
    elevation: 3,
  },
  avatarContainer: {
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    position: 'relative',
  },
  avatarWrapper: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
    position: 'relative',
  },
  timerRing: {
    position: 'absolute',
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#FFF',
  },
  avatarText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '900',
  },
  timerBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFF',
    paddingHorizontal: 4,
  },
  timerBadgeText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: '900',
  },
  playerInfo: {
    flex: 1,
  },
  playerName: {
    fontSize: 13,
    fontWeight: '800',
  },
  playerStats: {
    flexDirection: 'row',
    marginTop: 4,
  },
  tokenBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
  },
  tokenBadgeText: {
    fontSize: 10,
    fontWeight: '800',
  },
  turnLabel: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.5,
    marginTop: 3,
  },
  vsContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#1E293B',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 4,
  },
  vsText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '900',
  },

  // ============ BOARD ============
  boardWrapper: {
    position: 'relative',
    width: INITIAL_BOARD_SIZE,
    height: INITIAL_BOARD_SIZE,
    borderWidth: 3,
    borderColor: '#1E293B',
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  boardSvg: {
    backgroundColor: '#FFFFFF',
  },
  pawnWrapper: {
    position: 'absolute',
    width: INITIAL_CELL_SIZE,
    height: INITIAL_CELL_SIZE * 1.15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glowHighlight: {
    position: 'absolute',
    width: INITIAL_CELL_SIZE * 1.05,
    height: INITIAL_CELL_SIZE * 1.05,
    borderRadius: (INITIAL_CELL_SIZE * 1.05) / 2,
    borderWidth: 2.2,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 5,
  },
  dottedHighlight: {
    position: 'absolute',
    width: INITIAL_CELL_SIZE * 1.25,
    height: INITIAL_CELL_SIZE * 1.25,
    borderRadius: (INITIAL_CELL_SIZE * 1.25) / 2,
    borderWidth: 3,
    borderStyle: 'dashed',
  },

  // ============ BOTTOM PANEL ============
  bottomPanel: {
    width: '100%',
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 14,
    marginTop: 10,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 6,
  },
  turnBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EEF2FF',
    borderWidth: 1.5,
    borderColor: '#6366F1',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    alignSelf: 'center',
    marginBottom: 12,
  },
  turnBannerIcon: {
    fontSize: 16,
    marginRight: 6,
  },
  turnBannerText: {
    color: '#4F46E5',
    fontWeight: '900',
    fontSize: 13,
    letterSpacing: 1,
  },
  waitingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F1F5F9',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    alignSelf: 'center',
    marginBottom: 12,
  },
  waitingText: {
    color: '#64748B',
    fontWeight: '700',
    fontSize: 12,
    marginLeft: 8,
  },
  diceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  diceStatusCard: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginRight: 12,
  },
  diceStatusRow: {
    marginBottom: 10,
  },
  diceStatusLabel: {
    fontSize: 10,
    color: '#64748B',
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  diceStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 5,
  },
  diceStatusText: {
    fontSize: 11,
    fontWeight: '800',
  },
  sixesContainer: {},
  sixesDots: {
    flexDirection: 'row',
  },
  sixDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    marginRight: 5,
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  diceContainer: {
    width: 92,
    height: 92,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 5,
  },
  diceContainerActive: {
    borderColor: '#6366F1',
    borderWidth: 3,
    shadowColor: '#6366F1',
    shadowOpacity: 0.4,
    shadowRadius: 12,
    backgroundColor: '#EEF2FF',
  },
  tapHint: {
    position: 'absolute',
    bottom: -10,
    backgroundColor: '#6366F1',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  tapHintText: {
    color: '#FFF',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.5,
  },

  // ============ MODALS ============
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  exitModal: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
  },
  exitModalIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  exitModalTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: '#0F172A',
    marginBottom: 8,
  },
  exitModalMessage: {
    fontSize: 13,
    color: '#475569',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  exitModalButtons: {
    flexDirection: 'row',
    width: '100%',
    gap: 10,
  },
  exitCancelBtn: {
    flex: 1,
    backgroundColor: '#F1F5F9',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
  },
  exitCancelText: {
    color: '#334155',
    fontWeight: '800',
    fontSize: 13,
  },
  exitConfirmBtn: {
    flex: 1,
    backgroundColor: '#EF4444',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  exitConfirmText: {
    color: '#FFF',
    fontWeight: '800',
    fontSize: 13,
  },
  victoryCard: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 28,
    alignItems: 'center',
  },
  victoryEmoji: {
    fontSize: 64,
    marginBottom: 8,
  },
  victoryTitle: {
    fontSize: 30,
    fontWeight: '900',
    color: '#F59E0B',
    letterSpacing: 2,
  },
  defeatTitle: {
    color: '#EF4444',
  },
  victorySub: {
    color: '#64748B',
    fontSize: 14,
    marginTop: 6,
    fontWeight: '600',
  },
  winningsBox: {
    marginTop: 20,
    backgroundColor: '#F0FDF4',
    borderWidth: 2,
    borderColor: '#10B981',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    width: '100%',
  },
  winningsLabel: {
    color: '#065F46',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
  },
  winningsAmount: {
    color: '#059669',
    fontSize: 34,
    fontWeight: '900',
    marginTop: 4,
  },
  winningsCredited: {
    color: '#047857',
    fontSize: 11,
    fontWeight: '700',
    marginTop: 6,
  },
  tryAgainText: {
    color: '#475569',
    fontSize: 13,
    marginTop: 16,
    fontWeight: '600',
  },
  closeModalBtn: {
    backgroundColor: '#6366F1',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 30,
    marginTop: 24,
    width: '100%',
    alignItems: 'center',
  },
  closeModalBtnText: {
    color: '#FFFFFF',
    fontWeight: '900',
    fontSize: 14,
    letterSpacing: 1,
  },
  stackBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#F59E0B',
    borderRadius: 9,
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 1,
    zIndex: 10,
  },
  stackBadgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '900',
  },
  pawnTouch: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  reRollFloatingCard: {
    position: 'absolute',
    bottom: 120,
    left: 20,
    right: 20,
    backgroundColor: '#FEF3C7',
    borderWidth: 1.5,
    borderColor: '#F59E0B',
    borderRadius: 12,
    padding: 12,
    elevation: 6,
    shadowColor: '#B45309',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    zIndex: 999,
  },
  reRollCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  reRollTitle: {
    fontSize: 11,
    fontWeight: '900',
    color: '#78350F',
    letterSpacing: 0.5,
  },
  reRollCTA: {
    backgroundColor: '#D97706',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  reRollCTAText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '900',
  },
  progressBarBg: {
    height: 4,
    backgroundColor: '#FDE68A',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#D97706',
    borderRadius: 2,
  },
  topMatchTimer: {
    fontSize: 10,
    fontWeight: '900',
    color: '#EF4444',
    marginTop: 4,
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#FCA5A5',
    overflow: 'hidden',
    textAlign: 'center',
  },
});

export default GameScreen;