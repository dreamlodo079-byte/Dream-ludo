import React, { useState, useEffect, useRef, useMemo } from 'react';
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
  Platform,
  Image,
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
  avatar?: string;
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
  setWinnerInfo: (info: any) => void;
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
const PLAYER_START_OFFSETS = [1, 14, 27, 40];

const colorToIndex: Record<string, number> = { red: 0, yellow: 1, green: 2, blue: 3 };

const getCommonIndex = (colorStr: string, pos: number): number => {
  if (pos < 0 || pos > 50) return -1;
  const cIdx = colorToIndex[colorStr] ?? 0;
  const startOffset = PLAYER_START_OFFSETS[cIdx] || 1;
  return (startOffset + pos) % 52;
};

const RED_YARD_TOKEN_COORDS = [
  { x: 1.8, y: 1.8 }, { x: 4.2, y: 1.8 },
  { x: 1.8, y: 4.2 }, { x: 4.2, y: 4.2 },
];
const YELLOW_YARD_TOKEN_COORDS = [
  { x: 10.8, y: 1.8 }, { x: 13.2, y: 1.8 },
  { x: 10.8, y: 4.2 }, { x: 13.2, y: 4.2 },
];
const GREEN_YARD_TOKEN_COORDS = [
  { x: 10.8, y: 10.8 }, { x: 13.2, y: 10.8 },
  { x: 10.8, y: 13.2 }, { x: 13.2, y: 13.2 },
];
const BLUE_YARD_TOKEN_COORDS = [
  { x: 1.8, y: 10.8 }, { x: 4.2, y: 10.8 },
  { x: 1.8, y: 13.2 }, { x: 4.2, y: 13.2 },
];
const ALL_YARDS = [RED_YARD_TOKEN_COORDS, YELLOW_YARD_TOKEN_COORDS, GREEN_YARD_TOKEN_COORDS, BLUE_YARD_TOKEN_COORDS];

const RED_HOME_PATH_COORDS = [
  { x: 1, y: 7 }, { x: 2, y: 7 }, { x: 3, y: 7 }, { x: 4, y: 7 }, { x: 5, y: 7 }, { x: 6, y: 7 },
];
const YELLOW_HOME_PATH_COORDS = [
  { x: 7, y: 1 }, { x: 7, y: 2 }, { x: 7, y: 3 }, { x: 7, y: 4 }, { x: 7, y: 5 }, { x: 7, y: 6 },
];
const GREEN_HOME_PATH_COORDS = [
  { x: 13, y: 7 }, { x: 12, y: 7 }, { x: 11, y: 7 }, { x: 10, y: 7 }, { x: 9, y: 7 }, { x: 8, y: 7 },
];
const BLUE_HOME_PATH_COORDS = [
  { x: 7, y: 13 }, { x: 7, y: 12 }, { x: 7, y: 11 }, { x: 7, y: 10 }, { x: 7, y: 9 }, { x: 7, y: 8 },
];
const ALL_PATHS = [RED_HOME_PATH_COORDS, YELLOW_HOME_PATH_COORDS, GREEN_HOME_PATH_COORDS, BLUE_HOME_PATH_COORDS];

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
  avatar?: string;
  phone?: string;
  color: 'red' | 'green';
  isActive: boolean;
  isCurrentUser: boolean;
  turnTimer: number;
  totalTime: number;
  align: 'left' | 'right';
  diceValue: number;
  isDiceAnimating: boolean;
  canRoll: boolean;
  onRoll: () => void;
  avatarUri?: any;
  diceTransform?: any[];
  score?: number;
  missedTurns?: number;
}

const AnimatedPath = Animated.createAnimatedComponent(Path);

const maskPhone = (phone?: string) => {
  if (!phone) return '62#######60';
  const clean = phone.replace(/[^0-9]/g, '');
  if (clean.length < 4) return phone;
  return `${clean.substring(0, 2)}#######${clean.substring(clean.length - 2)}`;
};

const PlayerCard: React.FC<PlayerCardProps> = ({
  username,
  avatar,
  phone,
  color,
  isActive,
  isCurrentUser,
  turnTimer,
  totalTime,
  align,
  diceValue,
  isDiceAnimating,
  canRoll,
  onRoll,
  avatarUri,
  diceTransform,
  score,
  missedTurns,
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

  const perimeter = 259;
  
  const animatedDashoffset = animatedRatio.interpolate({
    inputRange: [0, 1],
    outputRange: [perimeter, 0],
  });
  
  const timerColor = turnTimer <= 4 ? '#EF4444' : c.primary; 

  const renderScorePill = () => (
    <View style={[
      styles.scorePillContainer,
      align === 'right' ? { marginRight: 6 } : { marginLeft: 6 }
    ]}>
      <Text style={styles.scoreIcon}>🏆</Text>
      <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
        <Text style={styles.scoreValueText}>{score ?? 0}</Text>
        <Text style={styles.scoreUnitText}> PTS</Text>
      </View>
    </View>
  );

  const renderDiceBubble = () => {
    const isLeft = align === 'right'; 
    
    // Original exact 80x80 SVG paths
    const rightAlignPath = "M 76 40 L 76 59 A 17 17 0 0 1 59 76 L 21 76 A 17 17 0 0 1 4 59 L 4 21 A 17 17 0 0 1 21 4 L 59 4 A 17 17 0 0 1 76 21 Z";
    const leftAlignPath = "M 4 40 L 4 21 A 17 17 0 0 1 21 4 L 59 4 A 17 17 0 0 1 76 21 L 76 59 A 17 17 0 0 1 59 76 L 21 76 A 17 17 0 0 1 4 59 Z";
    const pathData = isLeft ? rightAlignPath : leftAlignPath;

    return (
      <View style={styles.diceBoxWrapper}>
        <Svg width={80} height={80} style={StyleSheet.absoluteFill}>
          <Path d={pathData} stroke="#334155" strokeWidth={4} fill="none" />
          {isActive && (
            <AnimatedPath
              d={pathData}
              stroke={timerColor}
              strokeWidth={5.5}
              fill="none"
              strokeDasharray={perimeter}
              strokeDashoffset={animatedDashoffset}
              strokeLinecap="round"
            />
          )}
        </Svg>
        <TouchableOpacity
          disabled={!canRoll}
          onPress={onRoll}
          activeOpacity={0.8}
          style={{ width: 80, height: 80, alignItems: 'center', justifyContent: 'center' }}
        >
          {isActive && (
            <Animated.View style={[
              { alignItems: 'center', justifyContent: 'center' },
              diceTransform ? { transform: diceTransform } : undefined
            ]}>
              <Dice value={diceValue} size={54} />
            </Animated.View>
          )}
        </TouchableOpacity>
        <View style={[styles.bubblePointer, 
          isLeft ? { right: -6, transform: [{rotate: '45deg'}] } : { left: -6, transform: [{rotate: '45deg'}] },
          { backgroundColor: '#0F172A', borderColor: isActive ? timerColor : '#334155' },
          isLeft ? { borderTopWidth: 2, borderRightWidth: 2 } : { borderBottomWidth: 2, borderLeftWidth: 2 }
        ]} />
      </View>
    );
  };

  const renderHearts = () => {
    const skips = missedTurns || 0;
    return (
      <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: 4 }}>
        {[0, 1, 2].map((i) => {
          const isSolid = i < (3 - skips);
          return (
            <Svg key={i} width={14} height={14} viewBox="0 0 24 24" style={{ marginHorizontal: 2 }}>
              <Path
                d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
                fill={isSolid ? "#FFFFFF" : "none"}
                stroke={isSolid ? "#FFFFFF" : "rgba(255, 255, 255, 0.35)"}
                strokeWidth={isSolid ? 0 : 2}
              />
            </Svg>
          );
        })}
      </View>
    );
  };

  const renderAvatar = () => {
    const isImage = avatar && (avatar.startsWith('http') || avatar.startsWith('file'));
    return (
      <View style={{ alignItems: 'center' }}>
        <View style={[styles.avatarBorderContainer, { borderColor: c.primary, backgroundColor: '#0F172A' }]}>
          {isImage ? (
            <Image source={{ uri: avatar }} style={styles.avatarImageLarge} />
          ) : avatar ? (
            <Text style={{ fontSize: 36 }}>{avatar}</Text>
          ) : avatarUri ? (
            <Image source={avatarUri} style={styles.avatarImageLarge} />
          ) : (
            <Text style={{ fontSize: 36 }}>👑</Text>
          )}
        </View>
        {renderHearts()}
      </View>
    );
  };

  return (
    <View style={[styles.diagonalCardContainer, { alignItems: align === 'right' ? 'flex-end' : 'flex-start' }]}>
      {align === 'right' && (
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
          {score !== undefined && renderScorePill()}
          <View style={[styles.nameBadge, { backgroundColor: c.primary, marginBottom: 0 }]}>
            <Text style={styles.nameBadgeText}>{username.toUpperCase()}</Text>
          </View>
        </View>
      )}

      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        {align === 'right' && renderDiceBubble()}
        {renderAvatar()}
        {align === 'left' && renderDiceBubble()}
      </View>

      {align === 'left' && (
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
          <View style={[styles.nameBadge, { backgroundColor: c.primary }]}>
            <Text style={styles.nameBadgeText}>{maskPhone(phone)}</Text>
          </View>
          {score !== undefined && renderScorePill()}
        </View>
      )}
    </View>
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
  setWinnerInfo,
}) => {
  const { width, height } = useWindowDimensions();
  const MAX_BOARD_WIDTH = Math.min(width - 20, 500);
  const BOARD_SIZE = Math.max(200, Math.min(MAX_BOARD_WIDTH, height - 420));
  const CELL_SIZE = BOARD_SIZE / 15;

  const [diceDisplayVal, setDiceDisplayVal] = useState<number>(1);
  const [isDiceAnimating, setIsDiceAnimating] = useState(false);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [previousTimer, setPreviousTimer] = useState<number>(15);



  const diceScale = useRef(new Animated.Value(1)).current;
  const diceRotZ = useRef(new Animated.Value(0)).current;
  const tokenPulseAnim = useRef(new Animated.Value(1)).current;
  const yourTurnAnim = useRef(new Animated.Value(0)).current;

  // Match Found Transition State & Refs
  const [showMatchFound, setShowMatchFound] = useState(false);
  const matchFoundOpacity = useRef(new Animated.Value(1)).current;
  const avatarsScale = useRef(new Animated.Value(0)).current;
  const vsScale = useRef(new Animated.Value(0)).current;
  const vsOpacity = useRef(new Animated.Value(0)).current;
  const titleTranslateY = useRef(new Animated.Value(-150)).current;

  useEffect(() => {
    // Disabled to bypass intro overlay and keep focus on immediate board action
    setShowMatchFound(false);
  }, []);

  const pawnPositions = useRef(
    Array.from({ length: 16 }, () => new Animated.ValueXY({ x: 0, y: 0 }))
  ).current;

  const visualPositions = useRef(Array.from({ length: 16 }, () => -1));

  const pawnHeightOffsets = useRef(
    Array.from({ length: 16 }, () => new Animated.Value(0))
  ).current;

  const pawnScaleX = useRef(
    Array.from({ length: 16 }, () => new Animated.Value(1))
  ).current;

  const pawnScaleY = useRef(
    Array.from({ length: 16 }, () => new Animated.Value(1))
  ).current;

  const isTokenAnimating = useRef(Array.from({ length: 16 }, () => false));

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
    if (!activePlayer) return;
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
    if (pos === -1 || !matchState?.players) {
      return { subX: 0, subY: 0, scale: 1.0, stackCount: 1 };
    }

    const pColor = matchState.players[pIdx]?.color || 'red';
    const cIdx = colorToIndex[pColor] ?? pIdx;
    const startOffset = PLAYER_START_OFFSETS[cIdx];
    let cellId: string;
    if (pos === 56) {
      cellId = `goal_${pIdx}`;
    } else if (pos >= 51 && pos <= 55) {
      cellId = `home_${pIdx}_${pos}`;
    } else {
      const commonIdx = (startOffset + pos) % 52;
      cellId = `common_${commonIdx}`;
    }

    const coOccupying: Array<{ pIdx: number; tIdx: number; globalIdx: number }> = [];
    matchState.players.forEach((player: any, pIndex: number) => {
      const oppColor = player.color || 'red';
      const oppCIdx = colorToIndex[oppColor] ?? pIndex;
      const pStart = PLAYER_START_OFFSETS[oppCIdx];
      player.tokens.forEach((otherPos: number, tokenIndex: number) => {
        let otherCellId: string | null = null;
        if (otherPos === 56) {
          otherCellId = `goal_${pIndex}`;
        } else if (otherPos >= 51 && otherPos <= 55) {
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
    const pColor = matchState?.players?.[playerIndex]?.color || 'red';
    const cIdx = colorToIndex[pColor] ?? playerIndex;
    let gridX = 0;
    let gridY = 0;

    if (pos === -1) {
      const yardCoords = ALL_YARDS[cIdx] || RED_YARD_TOKEN_COORDS;
      gridX = yardCoords[tokenIndex].x;
      gridY = yardCoords[tokenIndex].y;
    } else if (pos === 56) {
      if (cIdx === 0) { gridX = 6.5; gridY = 7.5; }
      else if (cIdx === 1) { gridX = 7.5; gridY = 6.5; }
      else if (cIdx === 2) { gridX = 8.5; gridY = 7.5; }
      else { gridX = 7.5; gridY = 8.5; }
    } else if (pos >= 51 && pos <= 55) {
      const pathCoords = ALL_PATHS[cIdx] || RED_HOME_PATH_COORDS;
      const idx = pos - 51;
      gridX = pathCoords[idx].x + 0.5;
      gridY = pathCoords[idx].y + 0.5;
    } else {
      const startOffset = PLAYER_START_OFFSETS[cIdx];
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
    const finalX = basePos.x + stacking.subX;
    const finalY = basePos.y + stacking.subY;

    // Safety edge clamping to prevent pawns from overflowing the board boundaries
    const minX = 2;
    const maxX = BOARD_SIZE - CELL_SIZE - 2;
    const minY = -CELL_SIZE * 0.25;
    const maxY = BOARD_SIZE - CELL_SIZE * 1.15 - 2;

    return {
      x: Math.max(minX, Math.min(maxX, finalX)),
      y: Math.max(minY, Math.min(maxY, finalY)),
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
          const attackerColor = matchState.players[pIdx]?.color || 'red';
          const attackerCommon = getCommonIndex(attackerColor, serverPos);
          matchState.players.forEach((oppPlayer: any, oppIdx: number) => {
            if (oppIdx === pIdx) return;
            oppPlayer.tokens.forEach((oppServerPos: number, oppTIdx: number) => {
              const oppTokenIdx = oppIdx * 4 + oppTIdx;
              const oppVisualPos = visualPositions.current[oppTokenIdx];
              if (oppServerPos === -1 && oppVisualPos !== -1) {
                const victimColor = matchState.players[oppIdx]?.color || 'red';
                const victimCommon = getCommonIndex(victimColor, oppVisualPos);
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
          pawnHeightOffsets[tokenIdx].setValue(0);
          pawnScaleX[tokenIdx].setValue(1);
          pawnScaleY[tokenIdx].setValue(1);
          Animated.spring(pawnPositions[tokenIdx], {
            toValue: targetCoords,
            useNativeDriver: Platform.OS !== 'web',
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
          pawnHeightOffsets[tokenIdx].setValue(0);
          pawnScaleX[tokenIdx].setValue(1);
          pawnScaleY[tokenIdx].setValue(1);
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
    const stepCount = start - stopAt;
    // Calculate stepDuration dynamically to ensure the backtrack completes in ~450ms total
    const stepDuration = Math.max(15, Math.min(120, 450 / (stepCount || 1)));

    for (let currentStep = start; currentStep > stopAt; currentStep--) {
      const nextStep = currentStep - 1;
      const endCoords = getTokenCoords(pIdx, tIdx, nextStep);

      await new Promise<void>((resolve) => {
        Animated.timing(pawnPositions[tokenIdx], {
          toValue: endCoords,
          duration: stepDuration,
          useNativeDriver: Platform.OS !== 'web',
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
          useNativeDriver: Platform.OS !== 'web',
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
            useNativeDriver: Platform.OS !== 'web',
            easing: Easing.linear,
          }),
          Animated.sequence([
            Animated.timing(pawnHeightOffsets[tokenIdx], {
              toValue: -32,
              duration: 140,
              useNativeDriver: Platform.OS !== 'web',
              easing: Easing.out(Easing.quad),
            }),
            Animated.timing(pawnHeightOffsets[tokenIdx], {
              toValue: 0,
              duration: 140,
              useNativeDriver: Platform.OS !== 'web',
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

      setDiceDisplayVal(matchState.diceRoll);
      setIsDiceAnimating(false);
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

  const p1TokensHome = matchState.players[0]?.tokens?.filter((t: number) => t === 56).length || 0;
  const p2TokensHome = matchState.players[1]?.tokens?.filter((t: number) => t === 56).length || 0;

  const handleRollDice = () => {
    if (!isMyTurn || matchState.hasRolled || isDiceAnimating) return;
    requestRoll(roomId);
  };



  const handleTokenPress = (tokenIndex: number) => {
    if (!isMyTurn || !matchState.hasRolled || myPlayerIndex === -1) return;
    const myPlayer = matchState.players[myPlayerIndex];
    if (!myPlayer) return;
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

    // Instantly display Defeat banner and play loss sound locally
    const opponent = matchState?.players?.find((p: any) => p.id !== currentUser._id);
    setWinnerInfo({
      winnerId: opponent?.id || 'opponent',
      winnerUsername: opponent?.username || 'Opponent',
      winnings: 0,
    });
  };

  const rotZInterpolate = diceRotZ.interpolate({
    inputRange: [0, 720],
    outputRange: ['0deg', '720deg'],
  });

  const prizePool = (matchState.entryFee || 0) * 2 * 0.9;

  const myColor = currentUser ? matchState?.players.find((p: any) => p.id === currentUser._id)?.color : 'blue';
  let boardRotation = '0deg';
  let counterRotation = '0deg';
  let counterRotationAngle = 0;
  if (myColor === 'red') { boardRotation = '-90deg'; counterRotation = '90deg'; counterRotationAngle = 90; }
  else if (myColor === 'yellow') { boardRotation = '180deg'; counterRotation = '-180deg'; counterRotationAngle = -180; }
  else if (myColor === 'green') { boardRotation = '90deg'; counterRotation = '-90deg'; counterRotationAngle = -90; }

  const getScreenWrapperStyle = (playerColor: string) => {
    if (myColor === 'red') {
      if (playerColor === 'red') return { style: styles.bottomLeftPlayerWrapper, align: 'left' };
      if (playerColor === 'yellow') return { style: styles.topLeftPlayerWrapper, align: 'left' };
      if (playerColor === 'green') return { style: styles.topRightPlayerWrapper, align: 'right' };
      if (playerColor === 'blue') return { style: styles.bottomRightPlayerWrapper, align: 'right' };
    } else if (myColor === 'yellow') {
      if (playerColor === 'yellow') return { style: styles.bottomLeftPlayerWrapper, align: 'left' };
      if (playerColor === 'green') return { style: styles.topLeftPlayerWrapper, align: 'left' };
      if (playerColor === 'blue') return { style: styles.topRightPlayerWrapper, align: 'right' };
      if (playerColor === 'red') return { style: styles.bottomRightPlayerWrapper, align: 'right' };
    } else if (myColor === 'green') {
      if (playerColor === 'green') return { style: styles.bottomLeftPlayerWrapper, align: 'left' };
      if (playerColor === 'blue') return { style: styles.topLeftPlayerWrapper, align: 'left' };
      if (playerColor === 'red') return { style: styles.topRightPlayerWrapper, align: 'right' };
      if (playerColor === 'yellow') return { style: styles.bottomRightPlayerWrapper, align: 'right' };
    } else { // blue or default
      if (playerColor === 'blue') return { style: styles.bottomLeftPlayerWrapper, align: 'left' };
      if (playerColor === 'red') return { style: styles.topLeftPlayerWrapper, align: 'left' };
      if (playerColor === 'yellow') return { style: styles.topRightPlayerWrapper, align: 'right' };
      if (playerColor === 'green') return { style: styles.bottomRightPlayerWrapper, align: 'right' };
    }
    return { style: styles.topLeftPlayerWrapper, align: 'left' };
  };

  const playerScores = useMemo(() => {
    return matchState?.players?.map((_: any, idx: number) => matchState.scores?.[idx] || 0) || [];
  }, [matchState?.scores, matchState?.players]);

  const playerRanks = useMemo(() => {
    if (!playerScores.length) return [];
    const sortedScores = [...playerScores].sort((a: number, b: number) => b - a);
    return playerScores.map((score: number) => sortedScores.indexOf(score) + 1);
  }, [playerScores]);

  const getRankText = (rank: number) => {
    if (rank === 1) return '1ST MOVER';
    if (rank === 2) return '2ND MOVER';
    if (rank === 3) return '3RD MOVER';
    return '4TH MOVER';
  };

  const renderLobbyContent = (colorName: 'red'|'yellow'|'green'|'blue', cx: number, cy: number, tokenCoords: any[], colorTheme: any) => {
    if (matchState.gameMode === 'QUICK') {
      const pIdx = matchState.players.findIndex((p: any) => p.color === colorName);
      if (pIdx === -1) return null;
      const score = playerScores[pIdx] || 0;
      const rank = playerRanks[pIdx] || 4;
      const rankText = getRankText(rank);
      
      return (
        <G rotation={counterRotationAngle} origin={`${cx * CELL_SIZE}, ${cy * CELL_SIZE}`}>
          <Circle cx={cx * CELL_SIZE} cy={(cy - 0.2) * CELL_SIZE} r={CELL_SIZE * 1.8} fill="#FFFFFF" />
          <Circle cx={cx * CELL_SIZE} cy={(cy - 0.2) * CELL_SIZE} r={CELL_SIZE * 1.8} fill="none" stroke="#E2E8F0" strokeWidth={2} />
          <SvgText x={cx * CELL_SIZE} y={(cy - 0.8) * CELL_SIZE} fill="#334155" fontSize={CELL_SIZE * 0.4} fontWeight="bold" textAnchor="middle">SCORE</SvgText>
          <SvgText x={cx * CELL_SIZE} y={(cy + 0.3) * CELL_SIZE} fill="#0F172A" fontSize={CELL_SIZE * 1.2} fontWeight="bold" textAnchor="middle">{score}</SvgText>
          <Rect x={(cx - 1.5) * CELL_SIZE} y={(cy + 1.2) * CELL_SIZE} width={CELL_SIZE * 3} height={CELL_SIZE * 0.8} rx={CELL_SIZE * 0.4} fill={colorTheme.primary} stroke="#FFFFFF" strokeWidth={1} />
          <SvgText x={cx * CELL_SIZE} y={(cy + 1.75) * CELL_SIZE} fill="#FFFFFF" fontSize={CELL_SIZE * 0.35} fontWeight="bold" textAnchor="middle">{rankText}</SvgText>
        </G>
      );
    }
    return (
      <G rotation={counterRotationAngle} origin={`${cx * CELL_SIZE}, ${cy * CELL_SIZE}`}>
        <Rect x={(cx - 2.2) * CELL_SIZE} y={(cy - 2.2) * CELL_SIZE} width={CELL_SIZE * 4.4} height={CELL_SIZE * 4.4} fill="#FFFFFF" rx={12} />
        <Rect x={(cx - 1.8) * CELL_SIZE} y={(cy - 1.8) * CELL_SIZE} width={CELL_SIZE * 3.6} height={CELL_SIZE * 3.6} fill="#FFFFFF" rx={8} />
        {tokenCoords.map((coord, i) => (
          <G key={`${colorName}_yard_${i}`}>
            <Circle cx={coord.x * CELL_SIZE} cy={coord.y * CELL_SIZE} r={CELL_SIZE * 0.45} fill={colorTheme.light} />
          </G>
        ))}
      </G>
    );
  };


  return (
    <View style={styles.mainContainer}>
      <StatusBar barStyle="light-content" backgroundColor="#0B132B" />
      <View style={StyleSheet.absoluteFill}>
        <Svg height="100%" width="100%">
          <Defs>
            <LinearGradient id="bgGrad" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#0B132B" />
              <Stop offset="1" stopColor="#1E293B" />
            </LinearGradient>
          </Defs>
          <Rect width="100%" height="100%" fill="url(#bgGrad)" />
        </Svg>
      </View>

      <SafeAreaView style={styles.safeArea}>
        {/* ========== TOP BAR ========== */}
        <View style={styles.premiumTopBar}>
          <View style={styles.topBarLeft}>
            <TouchableOpacity style={styles.settingsBtn} onPress={handleExitPress}>
              <Text style={{ fontSize: 18, color: '#FFFFFF', fontWeight: 'bold' }}>✕</Text>
            </TouchableOpacity>
            <View style={styles.signalBars}>
              <View style={[styles.signalBar, { height: 6 }]} />
              <View style={[styles.signalBar, { height: 10 }]} />
              <View style={[styles.signalBar, { height: 14 }]} />
              <View style={[styles.signalBar, { height: 18 }]} />
            </View>
          </View>

          <View style={styles.prizePoolBadge}>
            <Text style={styles.prizePoolTitle}>🏆 PRIZE POOL 🏆</Text>
            <Text style={styles.premiumPrizePoolValue}>₹{prizePool.toFixed(0)}</Text>
          </View>
          <View style={{ width: 60 }} />
        </View>

        <View style={{ alignItems: 'center', marginTop: 10 }}>
          <View style={styles.matchTimerCapsule}>
            <Text style={styles.matchTimerText}>🕒 {matchState.gameMode === 'QUICK' && matchState.matchTimer !== undefined ? `${Math.floor(matchState.matchTimer / 60)}:${String(matchState.matchTimer % 60).padStart(2, '0')}` : '04:53'}</Text>
          </View>
        </View>

        {/* ========== GAME ARENA ========== */}
        <View style={styles.arenaContainer}>
          <View style={{ width: BOARD_SIZE, height: BOARD_SIZE + 240, justifyContent: 'center', position: 'relative' }}>
            {matchState.players.map((p: any, idx: number) => {
              if (p.hasLeft) return null;
              const { style: wrapperStyle, align } = getScreenWrapperStyle(p.color);

              return (
                <View key={p.id} style={wrapperStyle}>
                  <PlayerCard
                    username={p.username || `Player ${idx + 1}`}
                    avatar={p.avatar || (p.id === currentUser._id ? currentUser.avatar : undefined)}
                    phone={p.id === currentUser._id ? currentUser.phone : undefined}
                    color={p.color as any}
                    isActive={matchState.activePlayerIndex === idx}
                    isCurrentUser={p.id === currentUser._id}
                    turnTimer={matchState.turnTimer}
                    totalTime={15}
                    align={align as any}
                    diceValue={matchState.activePlayerIndex === idx ? (diceDisplayVal || 1) : 1}
                    isDiceAnimating={matchState.activePlayerIndex === idx && isDiceAnimating}
                    canRoll={isMyTurn && !matchState.hasRolled && !isDiceAnimating && matchState.activePlayerIndex === idx}
                    onRoll={handleRollDice}
                    avatarUri={require('../../assets/avatar.png')}
                    diceTransform={matchState.activePlayerIndex === idx ? [{ scale: diceScale }, { rotate: rotZInterpolate }] : undefined}
                    score={matchState.gameMode === 'QUICK' ? undefined : (matchState.scores ? matchState.scores[idx] : undefined)}
                    missedTurns={p.missedTurns}
                  />
                </View>
              );
            })}

            {/* ========== BOARD CONTAINER (OUTER) ========== */}
            <View style={{ alignSelf: 'center', position: 'relative', width: BOARD_SIZE, height: BOARD_SIZE, transform: [{ rotate: boardRotation }] }}>
              {/* Board Background wrapper (clips sharp SVG corners) */}
              <View style={[styles.boardWrapper, { width: BOARD_SIZE, height: BOARD_SIZE, overflow: 'hidden' }]}>
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
                  <Rect x={0} y={0} width={CELL_SIZE * 6} height={CELL_SIZE * 6} fill="url(#redGrad)" />
                  {renderLobbyContent('red', 3, 3, RED_YARD_TOKEN_COORDS, COLORS.red)}

                  {/* ============ YELLOW YARD (Top-Right) ============ */}
                  <Rect x={CELL_SIZE * 9} y={0} width={CELL_SIZE * 6} height={CELL_SIZE * 6} fill="url(#yellowGrad)" />
                  {renderLobbyContent('yellow', 12, 3, [
                    { x: 10.8, y: 1.8 }, { x: 13.2, y: 1.8 },
                    { x: 10.8, y: 4.2 }, { x: 13.2, y: 4.2 },
                  ], COLORS.yellow)}

                  {/* ============ GREEN YARD (Bottom-Right) ============ */}
                  <Rect x={CELL_SIZE * 9} y={CELL_SIZE * 9} width={CELL_SIZE * 6} height={CELL_SIZE * 6} fill="url(#greenGrad)" />
                  {renderLobbyContent('green', 12, 12, [
                    { x: 10.8, y: 10.8 }, { x: 13.2, y: 10.8 },
                    { x: 10.8, y: 13.2 }, { x: 13.2, y: 13.2 },
                  ], COLORS.green)}

                  {/* ============ BLUE YARD (Bottom-Left) ============ */}
                  <Rect x={0} y={CELL_SIZE * 9} width={CELL_SIZE * 6} height={CELL_SIZE * 6} fill="url(#blueGrad)" />
                  {renderLobbyContent('blue', 3, 12, [
                    { x: 1.8, y: 10.8 }, { x: 4.2, y: 10.8 },
                    { x: 1.8, y: 13.2 }, { x: 4.2, y: 13.2 },
                  ], COLORS.blue)}

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
                    
                    const isRedEntrance = index === 51;
                    const isYellowEntrance = index === 12;
                    const isGreenEntrance = index === 25;
                    const isBlueEntrance = index === 38;

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
                    const isStartPosition = isRedStart || isYellowStart || isGreenStart || isBlueStart;

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
                            fill={isStartPosition ? "#FFFFFF" : "url(#starGrad)"}
                            stroke={isStartPosition ? "none" : "#B45309"}
                            strokeWidth={isStartPosition ? 0 : 0.8}
                          />
                        )}
                        {/* Entrance position arrows */}
                        {isRedEntrance && (
                          <Path
                            d={getArrowPath(coord.x * CELL_SIZE + CELL_SIZE / 2, coord.y * CELL_SIZE + CELL_SIZE / 2, CELL_SIZE, 'right')}
                            fill="url(#redGrad)"
                            stroke="#FFFFFF"
                            strokeWidth={1.5}
                            opacity={0.95}
                          />
                        )}
                        {isYellowEntrance && (
                          <Path
                            d={getArrowPath(coord.x * CELL_SIZE + CELL_SIZE / 2, coord.y * CELL_SIZE + CELL_SIZE / 2, CELL_SIZE, 'down')}
                            fill="url(#yellowGrad)"
                            stroke="#FFFFFF"
                            strokeWidth={1.5}
                            opacity={0.95}
                          />
                        )}
                        {isGreenEntrance && (
                          <Path
                            d={getArrowPath(coord.x * CELL_SIZE + CELL_SIZE / 2, coord.y * CELL_SIZE + CELL_SIZE / 2, CELL_SIZE, 'left')}
                            fill="url(#greenGrad)"
                            stroke="#FFFFFF"
                            strokeWidth={1.5}
                            opacity={0.95}
                          />
                        )}
                        {isBlueEntrance && (
                          <Path
                            d={getArrowPath(coord.x * CELL_SIZE + CELL_SIZE / 2, coord.y * CELL_SIZE + CELL_SIZE / 2, CELL_SIZE, 'up')}
                            fill="url(#blueGrad)"
                            stroke="#FFFFFF"
                            strokeWidth={1.5}
                            opacity={0.95}
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
              </View>

              {/* ============ PAWNS LAYER (OUTSIDE CLIPPING VIEW) ============ */}
              <View
                style={{
                  position: 'absolute',
                  top: 3,
                  left: 3,
                  width: BOARD_SIZE - 6,
                  height: BOARD_SIZE - 6,
                  zIndex: 10,
                  elevation: 10
                }}
                pointerEvents="box-none"
              >
                {matchState.players.map((player: any, pIdx: number) => {
                  if (player.hasLeft) return null;
                  // Render each token individually to allow getStackingInfo to position them side-by-side
                  const tokensList = player.tokens.map((pos: number, tIdx: number) => ({
                    tIdxs: [tIdx],
                    representativeTIdx: tIdx,
                    pos,
                  }));

                  return tokensList.map(({ tIdxs, representativeTIdx, pos }: { tIdxs: number[]; representativeTIdx: number; pos: number }) => {
                    const tokenIdx = pIdx * 4 + representativeTIdx;
                    const isUserToken = player.id === currentUser._id;
                    const hasRollVal = matchState.diceRoll !== null;

                    // The stack can be clicked to move if any token in it has a valid move
                    const moveableTokenIndex = tIdxs.find((tIdx: number) => {
                      const currentPos = player.tokens[tIdx];
                      const roll = matchState.diceRoll;
                      if (roll === null) return false;
                      if (currentPos === 56) return false;
                      if (currentPos === -1 && matchState.gameMode !== 'QUICK' && roll !== 6) return false;
                      if (currentPos + roll > 56) return false;
                      return true;
                    });

                    const currentPos = player.tokens[representativeTIdx];
                    const canMoveToken = isUserToken && isMyTurn && hasRollVal && moveableTokenIndex !== undefined;
                    const stacking = getStackingInfo(pIdx, representativeTIdx, currentPos);
                    // Dynamic scale: if animating/pulse apply it, otherwise use stacking scale.
                    // When in goal (56), use stacking.scale directly (it's between 0.60 and 1.0)
                    const sizeMultiplier = currentPos === 56
                      ? stacking.scale
                      : (canMoveToken
                        ? tokenPulseAnim.interpolate({
                          inputRange: [1.0, 1.15],
                          outputRange: [stacking.scale, stacking.scale * 1.15],
                        })
                        : stacking.scale);
                    const isInYard = currentPos === -1;

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
                              { scaleX: pawnScaleX[tokenIdx] },
                              { scaleY: pawnScaleY[tokenIdx] },
                              { scale: sizeMultiplier },
                              { rotate: counterRotation },
                              { translateY: pawnHeightOffsets[tokenIdx] },
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
                                  borderColor: player.color === 'red' ? COLORS.red.primary : player.color === 'yellow' ? COLORS.yellow.primary : player.color === 'green' ? COLORS.green.primary : COLORS.blue.primary,
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
                                borderColor: player.color === 'red' ? COLORS.red.primary : player.color === 'yellow' ? COLORS.yellow.primary : player.color === 'green' ? COLORS.green.primary : COLORS.blue.primary,
                                backgroundColor: player.color === 'red' ? 'rgba(230, 57, 70, 0.12)' : player.color === 'yellow' ? 'rgba(250, 204, 21, 0.12)' : player.color === 'green' ? 'rgba(46, 125, 50, 0.12)' : 'rgba(30, 136, 229, 0.12)',
                                shadowColor: player.color === 'red' ? COLORS.red.primary : player.color === 'yellow' ? COLORS.yellow.primary : player.color === 'green' ? COLORS.green.primary : COLORS.blue.primary,
                              }
                            ]}
                          />
                          <Pawn3D color={player.color} size={CELL_SIZE * 0.95} />

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

        {showMatchFound && (
          <Animated.View
            style={[styles.matchFoundOverlay, { opacity: matchFoundOpacity }]}
            pointerEvents="auto"
          >
            <Animated.Text style={[styles.matchFoundTitle, { transform: [{ translateY: titleTranslateY }] }]}>
              MATCH FOUND
            </Animated.Text>

            <Animated.Text style={[styles.matchFoundSub, { opacity: vsOpacity }]}>
              {matchState.gameMode || 'REGULAR'} MODE
            </Animated.Text>

            <View style={styles.vsRow}>
              {/* Player 1 Circle */}
              <Animated.View style={[styles.matchFoundPlayerCircle, styles.playerCircleRed, { transform: [{ scale: avatarsScale }] }]}>
                <Text style={styles.matchFoundInitial}>
                  {matchState.players[0]?.username?.charAt(0).toUpperCase() || 'P'}
                </Text>
                <Text style={styles.matchFoundName} numberOfLines={1}>
                  {matchState.players[0]?.username || 'Player 1'}
                </Text>
              </Animated.View>

              {/* VS Circle */}
              <Animated.View style={[styles.matchFoundVsCircle, { opacity: vsOpacity, transform: [{ scale: vsScale }] }]}>
                <Text style={styles.matchFoundVsText}>VS</Text>
              </Animated.View>

              {/* Player 2 Circle */}
              <Animated.View style={[styles.matchFoundPlayerCircle, styles.playerCircleGreen, { transform: [{ scale: avatarsScale }] }]}>
                <Text style={styles.matchFoundInitial}>
                  {matchState.players[1]?.username?.charAt(0).toUpperCase() || 'P'}
                </Text>
                <Text style={styles.matchFoundName} numberOfLines={1}>
                  {matchState.players[1]?.username || 'Player 2'}
                </Text>
              </Animated.View>
            </View>

            <Animated.Text style={[styles.matchFoundFooter, { opacity: vsOpacity }]}>
              Prepare for battle...
            </Animated.Text>
          </Animated.View>
        )}
      </SafeAreaView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    position: 'relative',
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 24) + 6 : 6,
  },
  toastContainer: {
    position: 'absolute',
    top: Platform.OS === 'android' ? (StatusBar.currentHeight || 24) + 65 : 75,
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
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 24) + 10 : 20,
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
  matchFoundOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#0F172A',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10000,
  },
  matchFoundTitle: {
    fontSize: 32,
    fontWeight: '900',
    color: '#F59E0B',
    letterSpacing: 4,
    marginBottom: 8,
    textShadowColor: 'rgba(245, 158, 11, 0.4)',
    textShadowOffset: { width: 0, height: 4 },
    textShadowRadius: 10,
  },
  matchFoundSub: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#94A3B8',
    letterSpacing: 2,
    marginBottom: 60,
  },
  vsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  matchFoundPlayerCircle: {
    width: 110,
    height: 110,
    borderRadius: 55,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 10,
  },
  playerCircleRed: {
    backgroundColor: '#EF4444',
    borderColor: '#FCA5A5',
  },
  playerCircleGreen: {
    backgroundColor: '#10B981',
    borderColor: '#A7F3D0',
  },
  matchFoundInitial: {
    fontSize: 48,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  matchFoundName: {
    position: 'absolute',
    bottom: -35,
    fontSize: 15,
    fontWeight: 'bold',
    color: '#FFFFFF',
    width: 140,
    textAlign: 'center',
  },
  matchFoundVsCircle: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: '#1E293B',
    borderWidth: 3,
    borderColor: '#F59E0B',
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 20,
    shadowColor: '#F59E0B',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 8,
  },
  matchFoundVsText: {
    fontSize: 18,
    fontWeight: '900',
    color: '#F59E0B',
  },
  matchFoundFooter: {
    marginTop: 80,
    fontSize: 14,
    color: '#64748B',
    fontWeight: '600',
    letterSpacing: 1,
  },

  mainContainer: { flex: 1, backgroundColor: '#0B132B' },
  safeArea: { flex: 1, paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 24) + 6 : 6 },
  premiumTopBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, marginTop: 10 },
  topBarLeft: { flexDirection: 'row', alignItems: 'center' },
  settingsBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#1E293B', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#475569', marginRight: 10 },
  signalBars: { flexDirection: 'row', alignItems: 'flex-end', height: 18, gap: 2 },
  signalBar: { width: 4, backgroundColor: '#22C55E', borderRadius: 2 },
  prizePoolBadge: { alignItems: 'center', backgroundColor: '#0F172A', paddingHorizontal: 20, paddingVertical: 8, borderRadius: 16, borderWidth: 1.5, borderColor: '#F59E0B' },
  prizePoolTitle: { fontSize: 10, color: '#FCD34D', fontWeight: '800', letterSpacing: 1 },
  premiumPrizePoolValue: { fontSize: 18, color: '#FFFFFF', fontWeight: '900', marginTop: 2 },
  matchTimerCapsule: { backgroundColor: '#166534', paddingHorizontal: 16, paddingVertical: 6, borderRadius: 20, borderWidth: 2, borderColor: '#22C55E' },
  matchTimerText: { color: '#FFFFFF', fontWeight: '900', fontSize: 14, letterSpacing: 1 },
  arenaContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', position: 'relative', marginTop: -35 },
  topLeftPlayerWrapper: { position: 'absolute', top: 10, left: -10, zIndex: 100 },
  topRightPlayerWrapper: { position: 'absolute', top: 10, right: -10, zIndex: 100 },
  bottomLeftPlayerWrapper: { position: 'absolute', bottom: 10, left: -10, zIndex: 100 },
  bottomRightPlayerWrapper: { position: 'absolute', bottom: 10, right: -10, zIndex: 100 },
  diagonalCardContainer: { alignItems: 'center' },
  nameBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, marginBottom: 4 },
  nameBadgeText: { color: '#FFF', fontSize: 10, fontWeight: '900', letterSpacing: 0.5 },
  avatarDiceRow: { flexDirection: 'row', alignItems: 'center' },



  bubblePointer: { position: 'absolute', width: 10, height: 10 },



  avatarBorderContainer: { width: 68, height: 68, borderRadius: 34, borderWidth: 3.5, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0F172A', overflow: 'hidden', marginHorizontal: 4 },
  avatarImageLarge: { width: 60, height: 60, borderRadius: 30 },
  diceBoxWrapper: { width: 80, height: 80, borderRadius: 20, alignItems: 'center', justifyContent: 'center', position: 'relative', marginHorizontal: 8, backgroundColor: 'rgba(15, 23, 42, 0.95)' },
  scorePillContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0F172A',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#F59E0B',
    shadowColor: '#F59E0B',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 5,
  },
  scoreIcon: {
    fontSize: 14,
    marginRight: 6,
  },
  scoreValueText: {
    color: '#FFFFFF',
    fontWeight: '900',
    fontSize: 15,
    letterSpacing: 0.5,
  },
  scoreUnitText: {
    color: '#FCD34D',
    fontWeight: '800',
    fontSize: 11,
    letterSpacing: 0.5,
  },
});

export default GameScreen;