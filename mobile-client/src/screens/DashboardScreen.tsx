import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Share,
  Alert,
  ScrollView,
  Animated,
  useWindowDimensions,
  TextInput,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import axios from 'axios';
import Svg, { Circle, Path, Rect, Defs, RadialGradient, Stop, Polyline, LinearGradient } from 'react-native-svg';
import { useWallet } from '../hooks/useWallet';

// Import sub-screens to render in capsule view
import { LeaderboardScreen } from './LeaderboardScreen';
import { ChallengeScreen } from './ChallengeScreen';
import { AuthWalletScreen } from './AuthWalletScreen';
import { LiveArenaScreen } from './LiveArenaScreen';
import { AdminPanelScreen } from './AdminPanelScreen';
import { MatchmakingCardOverlay } from '../components/MatchmakingCardOverlay';
import { CustomAlertModal, CustomAlertOptions } from '../components/CustomAlertModal';
import { NotificationCenter } from '../components/NotificationCenter';

const API_SERVER_URL = process.env.EXPO_PUBLIC_SERVER_URL || 'http://localhost:5000';
const ENTRY_FEES = [50, 100, 500, 1000, 0];

const formatDateTime = (dateStr: string) => {
  if (!dateStr) return 'N/A';
  try {
    const d = new Date(dateStr);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = months[d.getMonth()];
    const date = d.getDate();
    let hours = d.getHours();
    const minutes = d.getMinutes().toString().padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12;
    return `${month} ${date}, ${hours}:${minutes} ${ampm}`;
  } catch (err) {
    return dateStr;
  }
};

interface AnimatedPressableProps {
  onPress: () => void;
  disabled?: boolean;
  style?: any;
  children: React.ReactNode;
}

const AnimatedPressable: React.FC<AnimatedPressableProps> = ({
  onPress,
  disabled,
  style,
  children,
}) => {
  const scale = useRef(new Animated.Value(1)).current;

  const onPressIn = () => {
    if (disabled) return;
    Animated.spring(scale, {
      toValue: 0.96,
      useNativeDriver: true,
      tension: 180,
      friction: 12,
    }).start();
  };

  const onPressOut = () => {
    if (disabled) return;
    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver: true,
      tension: 180,
      friction: 12,
    }).start();
  };

  // Safely flatten and separate layout and position properties from button decorations
  const flatStyle = style ? StyleSheet.flatten(style) : {};
  
  const layoutStyle: any = {
    transform: [{ scale }],
  };

  const presentationStyle: any = {};

  // Define layout keys that should remain on the outer Animated.View
  const layoutKeys = new Set([
    'width', 'height', 'flex', 'flexGrow', 'flexShrink',
    'margin', 'marginTop', 'marginBottom', 'marginLeft', 'marginRight',
    'marginHorizontal', 'marginVertical', 'position', 'top', 'bottom',
    'left', 'right', 'zIndex', 'alignSelf'
  ]);

  Object.keys(flatStyle).forEach((key) => {
    if (layoutKeys.has(key)) {
      layoutStyle[key] = flatStyle[key];
    } else {
      presentationStyle[key] = flatStyle[key];
    }
  });

  const innerStyle: any = {
    width: '100%',
    justifyContent: 'center',
  };
  if (flatStyle.height !== undefined) {
    innerStyle.height = '100%';
  }

  return (
    <Animated.View style={layoutStyle}>
      <TouchableOpacity
        activeOpacity={0.9}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        onPress={onPress}
        disabled={disabled}
        style={[presentationStyle, innerStyle]}
      >
        {children}
      </TouchableOpacity>
    </Animated.View>
  );
};

interface DashboardScreenProps {
  currentUser: { _id: string; username: string; isKycVerified?: boolean };
  socketId: string | null;
  onMatchFound: (roomId: string) => void;
  onGoToWallet: () => void;
  onGoToLeaderboard: () => void;
  onGoToChallenges: () => void;
  onLogout?: () => void;
  onUserUpdate?: (user: any) => void;
  socket: any;
}

export const DashboardScreen: React.FC<DashboardScreenProps> = ({
  currentUser,
  socketId,
  onLogout,
  onUserUpdate,
  socket,
}) => {
  const { width } = useWindowDimensions();
  const { balances, fetchWallet } = useWallet();

  const [currentView, setCurrentView] = useState<'HOME' | 'LIVE' | 'LEADERBOARD' | 'PROFILE' | 'ADMIN'>('HOME');

  const [customAlert, setCustomAlert] = useState<CustomAlertOptions>({
    visible: false,
    title: '',
    message: '',
    type: 'info',
  });

  const showCustomAlert = (
    title: string,
    message: string,
    type: 'success' | 'error' | 'info' | 'wallet' = 'info',
    onConfirm?: () => void,
    onCancel?: () => void,
    confirmText?: string,
    cancelText?: string
  ) => {
    setCustomAlert({
      visible: true,
      title,
      message,
      type,
      onConfirm,
      onCancel,
      confirmText,
      cancelText,
    });
  };

  // Upper Carousel Toggle tabs (QUICK, REGULAR, ROOMS)
  const [activeSegment, setActiveSegment] = useState<'QUICK' | 'REGULAR' | 'ROOMS'>('QUICK');
  const segmentTranslateX = useRef(new Animated.Value(0)).current;

  // Selected fee tier
  const [selectedTier, setSelectedTier] = useState<number>(50);

  // Matchmaking status
  const [isSearching, setIsSearching] = useState(false);
  const [searchTimer, setSearchTimer] = useState(13);

  // Private Lobby values
  const [lobbyDetails, setLobbyDetails] = useState<{ roomToken: string; passwordStr: string } | null>(null);
  const [isCreatingLobby, setIsCreatingLobby] = useState(false);
  const [joinRoomCode, setJoinRoomCode] = useState('');
  const [joinPasscode, setJoinPasscode] = useState('');
  const [customTokens, setCustomTokens] = useState<number>(4);
  const [customTimer, setCustomTimer] = useState<number>(15);
  const [isJoiningLobby, setIsJoiningLobby] = useState(false);
  const [customFeeText, setCustomFeeText] = useState('');
  // Dedicated Mode Modal state ('QUICK' | 'REGULAR' | 'ROOMS' | 'TOURNAMENTS' | 'SELECT_ALL' | null)
  const [selectedModeModal, setSelectedModeModal] = useState<'QUICK' | 'REGULAR' | 'ROOMS' | 'TOURNAMENTS' | 'SELECT_ALL' | null>(null);

  // Active Tournaments
  const [tournamentsList, setTournamentsList] = useState<any[]>([]);
  const [registeringTourId, setRegisteringTourId] = useState<string | null>(null);

  const fetchActiveTournament = async () => {
    try {
      const response = await axios.get(`${API_SERVER_URL}/api/tournaments`);
      if (response.data.success && Array.isArray(response.data.tournaments)) {
        setTournamentsList(response.data.tournaments);
      }
    } catch (err) {
      console.log('Error fetching tournament info:', err);
    }
  };

  const mainScrollRef = useRef<ScrollView>(null);

  // Animations
  const buttonScale = useRef(new Animated.Value(1)).current;
  const ctaPulse = useRef(new Animated.Value(1)).current;
  const radarPulse = useRef(new Animated.Value(1)).current;
  const radarOpacity = useRef(new Animated.Value(1)).current;

  // 3D Hero Animations
  const diceFloat = useRef(new Animated.Value(0)).current;
  const diceRotate = useRef(new Animated.Value(0)).current;
  const sparkleRotate = useRef(new Animated.Value(0)).current;
  const clashPulse = useRef(new Animated.Value(1)).current;

  const diceSpin = diceRotate.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const sparkleSpin = sparkleRotate.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  // Initial load
  useEffect(() => {
    fetchWallet(currentUser._id);
    fetchActiveTournament();

    Animated.loop(
      Animated.sequence([
        Animated.timing(ctaPulse, { toValue: 1.05, duration: 1000, useNativeDriver: true }),
        Animated.timing(ctaPulse, { toValue: 1, duration: 1000, useNativeDriver: true }),
      ])
    ).start();

    Animated.loop(
      Animated.parallel([
        Animated.timing(radarPulse, { toValue: 3, duration: 2000, useNativeDriver: true }),
        Animated.timing(radarOpacity, { toValue: 0, duration: 2000, useNativeDriver: true }),
      ])
    ).start();

    // 3D Floating Dice Loop
    Animated.loop(
      Animated.sequence([
        Animated.timing(diceFloat, { toValue: -10, duration: 1600, useNativeDriver: true }),
        Animated.timing(diceFloat, { toValue: 0, duration: 1600, useNativeDriver: true }),
      ])
    ).start();

    // 3D Continuous Dice Spin
    Animated.loop(
      Animated.timing(diceRotate, { toValue: 1, duration: 9000, useNativeDriver: true })
    ).start();

    // 3D Star Sparkle Ring Spin
    Animated.loop(
      Animated.timing(sparkleRotate, { toValue: 1, duration: 14000, useNativeDriver: true })
    ).start();

    // 3D Pawn Clash Pulse
    Animated.loop(
      Animated.sequence([
        Animated.timing(clashPulse, { toValue: 1.08, duration: 900, useNativeDriver: true }),
        Animated.timing(clashPulse, { toValue: 1, duration: 900, useNativeDriver: true }),
      ])
    ).start();
  }, [currentUser._id]);

  // Real-time Socket Listener for Tournament Mutations (Create, Edit, Delete, Register)
  useEffect(() => {
    if (!socket) return;
    const handleTournamentsUpdate = (data: { tournaments: any[] }) => {
      if (Array.isArray(data?.tournaments)) {
        setTournamentsList(data.tournaments);
      }
    };
    socket.on('TOURNAMENTS_UPDATED', handleTournamentsUpdate);
    return () => {
      socket.off('TOURNAMENTS_UPDATED', handleTournamentsUpdate);
    };
  }, [socket]);

  // Re-fetch tournaments when returning to HOME view
  useEffect(() => {
    if (currentView === 'HOME') {
      fetchActiveTournament();
    }
  }, [currentView]);

  // Handle Upper Segment slide animation
  useEffect(() => {
    let targetX = 0;
    const paddingOffset = 40; // Horizontal margins
    const containerWidth = Math.min(width, 600);
    const segmentWidth = (containerWidth - paddingOffset) / 3;
    if (activeSegment === 'REGULAR') targetX = segmentWidth;
    if (activeSegment === 'ROOMS') targetX = segmentWidth * 2;

    Animated.spring(segmentTranslateX, {
      toValue: targetX,
      useNativeDriver: true,
      tension: 60,
      friction: 10,
    }).start();
  }, [width, activeSegment, segmentTranslateX]);

  const handleJoinMatchmaking = async () => {
    if (!socketId) {
      showCustomAlert('Connection Notice', 'Establishing server link, please try again in a moment.', 'info');
      return;
    }

    if (selectedTier > 0 && balances.total < selectedTier) {
      showCustomAlert(
        'Insufficient Wallet Balance',
        `Your balance is ₹${balances.total.toFixed(2)}. Entry fee is ₹${selectedTier}. Please add cash or claim rewards to play!`,
        'wallet',
        () => setCurrentView('PROFILE'),
        () => {},
        'ADD CASH',
        'CANCEL'
      );
      return;
    }

    setIsSearching(true);
    setSearchTimer(13);

    const countdown = setInterval(() => {
      setSearchTimer((prev) => {
        if (prev <= 1) {
          clearInterval(countdown);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    try {
      const response = await axios.post(`${API_SERVER_URL}/api/payments/matchmaker/join`, {
        userId: currentUser._id,
        username: currentUser.username,
        socketId,
        entryFee: selectedTier,
        mode: activeSegment,
      });

      if (!response.data.success) {
        clearInterval(countdown);
        setIsSearching(false);
        showCustomAlert('Matchmaking Notice', response.data.message || 'Failed to enter queue.', 'info');
      }
    } catch (err: any) {
      clearInterval(countdown);
      setIsSearching(false);
      showCustomAlert('Error', err.response?.data?.error || err.message, 'error');
    }
  };

  const handleCancelQueue = async () => {
    setIsSearching(false);
    try {
      await axios.post(`${API_SERVER_URL}/api/payments/matchmaker/leave`, {
        userId: currentUser._id,
        entryFee: selectedTier,
      });
    } catch (err) {
      console.warn('Failed to cancel matchmaking from dashboard:', err);
    }
  };

  const handleCreatePrivateLobby = async () => {
    if (!socketId) {
      showCustomAlert('Connection Notice', 'Establishing server link...', 'info');
      return;
    }

    if (balances.total < selectedTier) {
      showCustomAlert('Insufficient Balance', 'Please top up your wallet in the Profile tab.', 'error');
      return;
    }

    setIsCreatingLobby(true);
    const roomToken = Math.floor(100000 + Math.random() * 900000).toString();
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let passwordStr = '';
    for (let i = 0; i < 6; i++) {
      passwordStr += characters.charAt(Math.floor(Math.random() * characters.length));
    }

    try {
      const response = await axios.post(`${API_SERVER_URL}/api/payments/matchmaker/join`, {
        userId: currentUser._id,
        username: currentUser.username,
        socketId,
        entryFee: selectedTier,
        roomCode: roomToken,
        passcode: passwordStr,
        mode: 'ROOMS',
        customRules: {
          tokenCount: customTokens,
          turnTimer: customTimer,
        }
      });

      if (response.data.success) {
        setLobbyDetails({ roomToken, passwordStr });
      } else {
        showCustomAlert('Lobby Error', response.data.message || 'Failed to initialize private lobby.', 'error');
      }
    } catch (err: any) {
      showCustomAlert('Lobby Setup Error', err.response?.data?.error || err.message, 'error');
    } finally {
      setIsCreatingLobby(false);
    }
  };

  const handleJoinPrivateLobby = async () => {
    if (!socketId) {
      showCustomAlert('Connection Notice', 'Establishing server link...', 'info');
      return;
    }

    if (!joinRoomCode || !joinPasscode) {
      showCustomAlert('Input Error', 'Please enter both the Room Code and Passcode.', 'error');
      return;
    }

    if (balances.total < selectedTier) {
      showCustomAlert('Insufficient Balance', 'Please top up your wallet in the Profile tab.', 'error');
      return;
    }

    setIsJoiningLobby(true);
    try {
      const response = await axios.post(`${API_SERVER_URL}/api/payments/matchmaker/join`, {
        userId: currentUser._id,
        username: currentUser.username,
        socketId,
        entryFee: selectedTier,
        roomCode: joinRoomCode.trim(),
        passcode: joinPasscode.trim(),
        mode: 'ROOMS',
      });

      if (response.data.success) {
        showCustomAlert('Success', 'Private room joined! Match starting shortly.', 'success');
      } else {
        showCustomAlert('Join Failure', response.data.message || 'Lobby not found or credentials mismatched.', 'error');
      }
    } catch (err: any) {
      showCustomAlert('Join Error', err.response?.data?.error || err.message, 'error');
    } finally {
      setIsJoiningLobby(false);
    }
  };

  const handleShareLobby = async () => {
    if (!lobbyDetails) return;
    try {
      const shareMessage = `🎲 Join my Private Dream Ludo Room!\n\nRoom Code: ${lobbyDetails.roomToken}\nPasscode: ${lobbyDetails.passwordStr}\nEntry Fee: ${selectedTier} INR\n\nOpen the app and input these credentials to join.`;
      await Share.share({ message: shareMessage });
    } catch (error: any) {
      showCustomAlert('Share Error', error.message, 'error');
    }
  };

  const handleJoinTournament = async (targetTour: any) => {
    if (!targetTour) return;
    const isAlreadyRegistered = targetTour.registeredUsers?.includes(currentUser._id);
    if (isAlreadyRegistered) {
      showCustomAlert('Tournament Registration', 'You are already registered! Check back when match starts.', 'info');
      return;
    }

    if (balances.total < targetTour.entryFee) {
      showCustomAlert(
        'Insufficient Balance',
        `Tournament registration requires entry fee of ₹${targetTour.entryFee}. Please top up your wallet in the Profile tab.`,
        'error'
      );
      return;
    }

    setRegisteringTourId(targetTour._id);
    try {
      const response = await axios.post(`${API_SERVER_URL}/api/tournaments/register`, {
        userId: currentUser._id,
        tournamentId: targetTour._id,
      });

      if (response.data.success) {
        showCustomAlert(
          'Registration Success!',
          `You are registered for ${targetTour.title}! Deducted ₹${targetTour.entryFee} entry fee.`,
          'success'
        );
        fetchWallet(currentUser._id);
        fetchActiveTournament();
      }
    } catch (err: any) {
      showCustomAlert('Registration Error', err.response?.data?.error || err.message, 'error');
    } finally {
      setRegisteringTourId(null);
    }
  };

  // Render bottom capsule tab item
  const renderFooterTab = (
    tabName: 'HOME' | 'LIVE' | 'LEADERBOARD' | 'PROFILE',
    label: string,
    iconRenderer: (isActive: boolean) => React.ReactNode
  ) => {
    const isActive = currentView === tabName;
    return (
      <TouchableOpacity
        style={[styles.footerTab, isActive && styles.footerTabActive]}
        onPress={() => {
          setIsSearching(false); // Stop matchmaking finder if switching tabs
          setCurrentView(tabName);
        }}
        activeOpacity={0.8}
      >
        {iconRenderer(isActive)}
        {isActive && <Text style={styles.footerTabText}>{label}</Text>}
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {/* Sub-view switcher */}
      {currentView === 'HOME' && (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          {/* Luxury Top Header (Notification Bell + Wallet Balance Pill + Crown Avatar) */}
          <View style={styles.header}>
            <Text style={styles.logoText}>DREAM LUDO</Text>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              {/* Notification Center Golden Bell */}
              <View style={styles.headerBellPill}>
                <NotificationCenter currentUser={currentUser} socket={socket} />
              </View>

              {/* Wallet Balance Pill */}
              <TouchableOpacity style={styles.walletPill} onPress={() => setCurrentView('PROFILE')}>
                <Svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4F46E5" strokeWidth="2.5" style={{ marginRight: 6 }}>
                  <Rect x="2" y="5" width="20" height="14" rx="2" />
                  <Path d="M2 10h20M6 14h4" />
                </Svg>
                <Text style={styles.walletBalance}>₹{balances.total.toFixed(0)}</Text>
              </TouchableOpacity>

              {/* Profile Crown Avatar */}
              <TouchableOpacity style={styles.avatarHeaderBtn} onPress={() => setCurrentView('PROFILE')}>
                <Text style={{ fontSize: 20 }}>{(currentUser as any)?.avatar || '👑'}</Text>
              </TouchableOpacity>
            </View>
          </View>

          <ScrollView ref={mainScrollRef} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {/* 3D Animated Hero Section */}
            <View style={styles.hero3DCard}>
              <Animated.View style={[styles.sparkleRing, { transform: [{ rotate: sparkleSpin }] }]}>
                <Svg width="260" height="260" viewBox="0 0 240 240">
                  <Circle cx="120" cy="120" r="100" fill="none" stroke="rgba(255, 255, 255, 0.12)" strokeWidth="1.5" strokeDasharray="6, 8" />
                  <Circle cx="120" cy="20" r="6" fill="#FBBF24" />
                  <Circle cx="220" cy="120" r="5" fill="#38BDF8" />
                  <Circle cx="120" cy="220" r="6" fill="#F43F5E" />
                  <Circle cx="20" cy="120" r="5" fill="#34D399" />
                </Svg>
              </Animated.View>

              <View style={styles.heroStage3D}>
                <Animated.View style={{ transform: [{ translateY: diceFloat }, { rotate: diceSpin }] }}>
                  <View style={styles.dice3DBox}>
                    <Text style={{ fontSize: 56 }}>🎲</Text>
                  </View>
                </Animated.View>
                <Animated.View style={[styles.pawnClashRow, { transform: [{ scale: clashPulse }] }]}>
                  <View style={[styles.pawn3D, styles.pawn3DRed]}>
                    <Text style={{ fontSize: 32 }}>🔴</Text>
                  </View>
                  <Text style={{ fontSize: 24, marginHorizontal: -4 }}>⚡</Text>
                  <View style={[styles.pawn3D, styles.pawn3DGreen]}>
                    <Text style={{ fontSize: 32 }}>🟢</Text>
                  </View>
                </Animated.View>
              </View>

              <Text style={styles.heroTitle}>DREAM LUDO</Text>
              <Text style={styles.heroSubtitle}>Supreme Ludo • Real Cash Battles</Text>

              <Animated.View style={{ transform: [{ scale: ctaPulse }] }}>
                <TouchableOpacity
                  style={styles.heroPlayNowBtn}
                  onPress={() => setSelectedModeModal('SELECT_ALL')}
                  activeOpacity={0.85}
                >
                  <Text style={styles.heroPlayNowText}>▶ SELECT MODE & PLAY</Text>
                </TouchableOpacity>
              </Animated.View>
            </View>

            {/* Top Game Modes Section */}
            <View style={{ marginTop: 4, marginBottom: 20 }}>
              <Text style={styles.topGamesHeader}>🔥 SELECT GAME MODE</Text>

              <View style={styles.gameModesGrid}>
                {/* 1. Quick Match */}
                <AnimatedPressable
                  style={[styles.mode3DCard, { backgroundColor: '#059669' }]}
                  onPress={() => setSelectedModeModal('QUICK')}
                >
                  <View style={styles.modeTagBadge}>
                    <Text style={styles.modeTagText}>⚡ 5 MIN FAST</Text>
                  </View>
                  <View style={styles.modeIconCircle}>
                    <Text style={{ fontSize: 32 }}>⚡</Text>
                  </View>
                  <View style={{ alignItems: 'center' }}>
                    <Text style={styles.modeCardTitle}>Quick Match</Text>
                    <Text style={styles.modeCardSub}>5-Minute Speed Battle</Text>
                  </View>
                  <View style={styles.modeCardFooter}>
                    <Text style={styles.modeFooterBtnText}>SELECT TIER ➔</Text>
                  </View>
                </AnimatedPressable>

                {/* 2. Regular Match */}
                <AnimatedPressable
                  style={[styles.mode3DCard, { backgroundColor: '#4F46E5' }]}
                  onPress={() => setSelectedModeModal('REGULAR')}
                >
                  <View style={styles.modeTagBadge}>
                    <Text style={styles.modeTagText}>🏆 8 MIN CLASSIC</Text>
                  </View>
                  <View style={styles.modeIconCircle}>
                    <Text style={{ fontSize: 32 }}>👑</Text>
                  </View>
                  <View style={{ alignItems: 'center' }}>
                    <Text style={styles.modeCardTitle}>Regular Match</Text>
                    <Text style={styles.modeCardSub}>8-Minute Full Strategy</Text>
                  </View>
                  <View style={styles.modeCardFooter}>
                    <Text style={styles.modeFooterBtnText}>SELECT TIER ➔</Text>
                  </View>
                </AnimatedPressable>

                {/* 3. Private Room */}
                <AnimatedPressable
                  style={[styles.mode3DCard, { backgroundColor: '#1D4ED8' }]}
                  onPress={() => setSelectedModeModal('ROOMS')}
                >
                  <View style={styles.modeTagBadge}>
                    <Text style={styles.modeTagText}>👥 ROOM CODE</Text>
                  </View>
                  <View style={styles.modeIconCircle}>
                    <Text style={{ fontSize: 32 }}>🔐</Text>
                  </View>
                  <View style={{ alignItems: 'center' }}>
                    <Text style={styles.modeCardTitle}>Private Room</Text>
                    <Text style={styles.modeCardSub}>Play With Friends</Text>
                  </View>
                  <View style={styles.modeCardFooter}>
                    <Text style={styles.modeFooterBtnText}>CREATE / JOIN ➔</Text>
                  </View>
                </AnimatedPressable>

                {/* 4. Live Tournaments */}
                <AnimatedPressable
                  style={[styles.mode3DCard, { backgroundColor: '#D97706' }]}
                  onPress={() => {
                    if (tournamentsList.length > 0) {
                      setSelectedModeModal('TOURNAMENTS');
                    } else {
                      showCustomAlert('Tournaments Coming Soon! 🏆', 'No active pool tournaments right now. New prize tournaments are announced daily!', 'info');
                    }
                  }}
                >
                  <View style={styles.modeTagBadge}>
                    <Text style={styles.modeTagText}>🥇 PRIZE POOLS</Text>
                  </View>
                  <View style={styles.modeIconCircle}>
                    <Text style={{ fontSize: 32 }}>🏆</Text>
                  </View>
                  <View style={{ alignItems: 'center' }}>
                    <Text style={styles.modeCardTitle}>Tournaments</Text>
                    <Text style={styles.modeCardSub}>Live Pool Brackets</Text>
                  </View>
                  <View style={styles.modeCardFooter}>
                    <Text style={styles.modeFooterBtnText}>
                      {tournamentsList.length > 0 ? 'VIEW POOLS ➔' : 'COMING SOON 🔒'}
                    </Text>
                  </View>
                </AnimatedPressable>
              </View>
            </View>
            {/* Active Tournaments section if any */}
            {tournamentsList.length > 0 && (
              <View style={{ marginTop: 12 }}>
                <Text style={styles.topGamesHeader}>🏆 LIVE POOL TOURNAMENTS</Text>
                {tournamentsList.map((tournamentItem) => {
                  const isUserReg = tournamentItem.registeredUsers?.includes(currentUser._id);
                  const isRegBusy = registeringTourId === tournamentItem._id;
                  const fillPct = Math.min(100, Math.round(((tournamentItem.registeredCount || 0) / (tournamentItem.maxEntries || 1)) * 100));
                  const spotsLeft = Math.max(0, (tournamentItem.maxEntries || 0) - (tournamentItem.registeredCount || 0));

                  return (
                    <View key={tournamentItem._id} style={styles.tournamentCard}>
                      <View style={styles.tournamentBanner}>
                        <View>
                          <Text style={styles.tournamentSub}>LIVE POOL TOURNAMENT</Text>
                          <Text style={styles.tournamentTitle}>{tournamentItem.title.toUpperCase()}</Text>
                        </View>
                        <View style={styles.prizeBadge}>
                          <Text style={styles.prizeText}>Prize Pool</Text>
                          <Text style={styles.prizePool}>₹{tournamentItem.totalPrizePool.toLocaleString()}</Text>
                        </View>
                      </View>

                      <View style={styles.trackerContainer}>
                        <View style={styles.trackerTextRow}>
                          <Text style={styles.trackerLabel}>Registration Density</Text>
                          <Text style={styles.trackerDensity}>
                            {tournamentItem.registeredCount}/{tournamentItem.maxEntries} Joined ({fillPct}%)
                          </Text>
                        </View>
                        <View style={styles.progressBarBg}>
                          <View style={[styles.progressBarFill, { width: `${fillPct}%` }]} />
                        </View>
                        <Text style={styles.spotsLeftText}>{spotsLeft.toLocaleString()} SPOTS LEFT</Text>
                      </View>

                      <View style={styles.timingRow}>
                        <View style={[styles.timingCol, styles.timingColLeft]}>
                          <Text style={styles.timingLabel}>REGISTRATION OPENS</Text>
                          <Text style={styles.timingValue}>{formatDateTime(tournamentItem.startsAt)}</Text>
                        </View>
                        <View style={styles.timingCol}>
                          <Text style={styles.timingLabel}>GAME STARTS</Text>
                          <Text style={styles.timingValue}>{formatDateTime(tournamentItem.endsAt)}</Text>
                        </View>
                      </View>

                      <View style={styles.buyInRow}>
                        <View>
                          <Text style={styles.buyInLabel}>Entry Fee</Text>
                          <Text style={styles.buyInValue}>₹{tournamentItem.entryFee}</Text>
                        </View>
                        <AnimatedPressable
                          style={[
                            styles.buyInBtn,
                            isUserReg && styles.buyInBtnRegistered,
                            isRegBusy && styles.buyInBtnDisabled
                          ]}
                          onPress={() => handleJoinTournament(tournamentItem)}
                          disabled={isRegBusy}
                        >
                          {isRegBusy ? (
                            <ActivityIndicator color="#FFF" />
                          ) : (
                            <Text style={styles.buyInBtnText}>
                              {isUserReg ? 'Registered • Awaiting Start' : 'Register Now'}
                            </Text>
                          )}
                        </AnimatedPressable>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      )}

      {currentView === 'LIVE' && (
        <LiveArenaScreen
          currentUser={currentUser}
          socketId={socketId}
          socket={socket}
          onBack={() => setCurrentView('HOME')}
          onUserUpdate={onUserUpdate}
        />
      )}

      {currentView === 'LEADERBOARD' && (
        <LeaderboardScreen onBack={() => setCurrentView('HOME')} />
      )}

      {currentView === 'PROFILE' && (
        <AuthWalletScreen
          currentUser={currentUser as any}
          onLoginSuccess={() => {}}
          onLogout={onLogout}
          onUserUpdate={onUserUpdate}
          onNavigateAdmin={() => setCurrentView('ADMIN')}
        />
      )}

      {currentView === 'ADMIN' && (
        <AdminPanelScreen onBack={() => setCurrentView('PROFILE')} />
      )}

      {/* Floating capsule footer navigation */}
      <View style={styles.footerCapsule}>
        {renderFooterTab('HOME', 'HOME', (isActive) => (
          <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={isActive ? "#4F46E5" : "#64748B"} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            <Polyline points="9 22 9 12 15 12 15 22" />
          </Svg>
        ))}

        {renderFooterTab('LIVE', 'LIVE', (isActive) => (
          <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={isActive ? "#4F46E5" : "#64748B"} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <Circle cx="12" cy="12" r="10" />
            <Circle cx="12" cy="12" r="6" />
            <Circle cx="12" cy="12" r="2" fill={isActive ? "#4F46E5" : "#64748B"} />
          </Svg>
        ))}

        {renderFooterTab('LEADERBOARD', 'RANKINGS', (isActive) => (
          <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={isActive ? "#4F46E5" : "#64748B"} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6M18 9h1.5a2.5 2.5 0 0 0 0-5H18M4 22h16M10 14.66V17h4v-2.34M12 2a7 7 0 0 0-7 7c0 3.18 2.13 5.86 5 6.71V20h4v-4.29c2.87-.85 5-3.53 5-6.71a7 7 0 0 0-7-7z" />
          </Svg>
        ))}

        {renderFooterTab('PROFILE', 'PROFILE', (isActive) => (
          <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={isActive ? "#4F46E5" : "#64748B"} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <Circle cx="12" cy="7" r="4" />
          </Svg>
        ))}
      </View>

      {/* Dedicated Game Mode Feature Modal */}
      <Modal
        visible={selectedModeModal !== null}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setSelectedModeModal(null)}
      >
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView style={styles.modalContentContainer} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
            {/* Modal Header */}
            <View style={styles.modalHeaderRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 8 }}>
                <Text style={{ fontSize: 24, marginRight: 8 }}>
                  {selectedModeModal === 'SELECT_ALL' ? '🎮' : selectedModeModal === 'QUICK' ? '⚡' : selectedModeModal === 'REGULAR' ? '👑' : selectedModeModal === 'ROOMS' ? '🔐' : '🥇'}
                </Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.modalTitleText} numberOfLines={1}>
                    {selectedModeModal === 'SELECT_ALL' ? 'Select Game Mode' : selectedModeModal === 'QUICK' ? 'Quick Match (5 Min)' : selectedModeModal === 'REGULAR' ? 'Regular Match (8 Min)' : selectedModeModal === 'ROOMS' ? 'Private Room' : 'Live Tournaments'}
                  </Text>
                  <Text style={styles.modalSubText} numberOfLines={1}>
                    {selectedModeModal === 'SELECT_ALL' ? 'Choose your preferred battle arena' : selectedModeModal === 'QUICK' ? 'Speed 2-Player Battle' : selectedModeModal === 'REGULAR' ? 'Classic 4-Pawn Strategy' : selectedModeModal === 'ROOMS' ? 'Play With Friends Code' : 'Pool & Bracket Competitions'}
                  </Text>
                </View>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                {selectedModeModal !== 'SELECT_ALL' && (
                  <TouchableOpacity 
                    style={[styles.modalCloseBtn, { marginRight: 6, width: 'auto', paddingHorizontal: 10, height: 32, borderRadius: 16 }]} 
                    onPress={() => setSelectedModeModal('SELECT_ALL')}
                  >
                    <Text style={[styles.modalCloseText, { fontSize: 11 }]}>◀ Modes</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity style={[styles.modalCloseBtn, { width: 32, height: 32, borderRadius: 16 }]} onPress={() => setSelectedModeModal(null)}>
                  <Text style={styles.modalCloseText}>✕</Text>
                </TouchableOpacity>
              </View>
            </View>

            <ScrollView style={{ paddingVertical: 12 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {selectedModeModal === 'SELECT_ALL' && (
                <View style={{ paddingBottom: 16 }}>
                  <Text style={styles.sectionHeader}>CHOOSE A GAME MODE TO PLAY</Text>

                  {/* Option 1: Quick Match */}
                  <TouchableOpacity
                    style={styles.modeOptionCard}
                    onPress={() => setSelectedModeModal('QUICK')}
                    activeOpacity={0.85}
                  >
                    <View style={styles.modeOptionHeader}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 8 }}>
                        <View style={[styles.modeOptionIconBg, { backgroundColor: '#ECFDF5' }]}>
                          <Text style={{ fontSize: 24 }}>⚡</Text>
                        </View>
                        <View style={{ marginLeft: 10, flex: 1 }}>
                          <Text style={styles.modeOptionTitle} numberOfLines={1}>Quick Match (5 Min)</Text>
                          <Text style={styles.modeOptionSub} numberOfLines={1}>Speed 2-Player Battle • 2 Pawns Home</Text>
                        </View>
                      </View>
                      <View style={[styles.modeOptionBadge, { backgroundColor: '#D1FAE5' }]}>
                        <Text style={[styles.modeOptionBadgeText, { color: '#047857' }]}>FAST</Text>
                      </View>
                    </View>
                    <View style={[styles.modeOptionActionBtn, { backgroundColor: '#059669' }]}>
                      <Text style={styles.modeOptionActionText}>SELECT QUICK MATCH ➔</Text>
                    </View>
                  </TouchableOpacity>

                  {/* Option 2: Regular Match */}
                  <TouchableOpacity
                    style={styles.modeOptionCard}
                    onPress={() => setSelectedModeModal('REGULAR')}
                    activeOpacity={0.85}
                  >
                    <View style={styles.modeOptionHeader}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 8 }}>
                        <View style={[styles.modeOptionIconBg, { backgroundColor: '#EEF2FF' }]}>
                          <Text style={{ fontSize: 24 }}>👑</Text>
                        </View>
                        <View style={{ marginLeft: 10, flex: 1 }}>
                          <Text style={styles.modeOptionTitle} numberOfLines={1}>Regular Match (8 Min)</Text>
                          <Text style={styles.modeOptionSub} numberOfLines={1}>Classic 4-Pawn Strategic Ludo Showdown</Text>
                        </View>
                      </View>
                      <View style={[styles.modeOptionBadge, { backgroundColor: '#E0E7FF' }]}>
                        <Text style={[styles.modeOptionBadgeText, { color: '#4338CA' }]}>CLASSIC</Text>
                      </View>
                    </View>
                    <View style={[styles.modeOptionActionBtn, { backgroundColor: '#4F46E5' }]}>
                      <Text style={styles.modeOptionActionText}>SELECT REGULAR MATCH ➔</Text>
                    </View>
                  </TouchableOpacity>

                  {/* Option 3: Private Room */}
                  <TouchableOpacity
                    style={styles.modeOptionCard}
                    onPress={() => setSelectedModeModal('ROOMS')}
                    activeOpacity={0.85}
                  >
                    <View style={styles.modeOptionHeader}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 8 }}>
                        <View style={[styles.modeOptionIconBg, { backgroundColor: '#EFF6FF' }]}>
                          <Text style={{ fontSize: 24 }}>🔐</Text>
                        </View>
                        <View style={{ marginLeft: 10, flex: 1 }}>
                          <Text style={styles.modeOptionTitle} numberOfLines={1}>Private Room</Text>
                          <Text style={styles.modeOptionSub} numberOfLines={1}>Play with Friends using 6-digit Code</Text>
                        </View>
                      </View>
                      <View style={[styles.modeOptionBadge, { backgroundColor: '#DBEAFE' }]}>
                        <Text style={[styles.modeOptionBadgeText, { color: '#1D4ED8' }]}>FRIENDS</Text>
                      </View>
                    </View>
                    <View style={[styles.modeOptionActionBtn, { backgroundColor: '#2563EB' }]}>
                      <Text style={styles.modeOptionActionText}>CREATE OR JOIN ROOM ➔</Text>
                    </View>
                  </TouchableOpacity>

                  {/* Option 4: Live Tournaments */}
                  <TouchableOpacity
                    style={styles.modeOptionCard}
                    onPress={() => {
                      if (tournamentsList.length === 0) {
                        setCustomAlert({
                          visible: true,
                          title: 'Tournaments Coming Soon',
                          message: 'Live pool tournaments are announced daily. Check back soon!',
                          type: 'info',
                        });
                      } else {
                        setSelectedModeModal('TOURNAMENTS');
                      }
                    }}
                    activeOpacity={0.85}
                  >
                    <View style={styles.modeOptionHeader}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 8 }}>
                        <View style={[styles.modeOptionIconBg, { backgroundColor: '#FFFBEB' }]}>
                          <Text style={{ fontSize: 24 }}>🥇</Text>
                        </View>
                        <View style={{ marginLeft: 10, flex: 1 }}>
                          <Text style={styles.modeOptionTitle} numberOfLines={1}>Live Tournaments</Text>
                          <Text style={styles.modeOptionSub} numberOfLines={1}>
                            {tournamentsList.length > 0 ? `${tournamentsList.length} Pool Tournaments Active!` : 'Pool & Bracket Tournaments'}
                          </Text>
                        </View>
                      </View>
                      <View style={[styles.modeOptionBadge, { backgroundColor: '#FEF3C7' }]}>
                        <Text style={[styles.modeOptionBadgeText, { color: '#B45309' }]}>POOLS</Text>
                      </View>
                    </View>
                    <View style={[styles.modeOptionActionBtn, { backgroundColor: '#D97706' }]}>
                      <Text style={styles.modeOptionActionText}>
                        {tournamentsList.length > 0 ? 'VIEW TOURNAMENTS ➔' : 'COMING SOON 🔒'}
                      </Text>
                    </View>
                  </TouchableOpacity>

                  {/* Option 5: Free Practice Mode (Normal Unhighlighted Card at the End) */}
                  <TouchableOpacity
                    style={styles.modeOptionCard}
                    onPress={() => {
                      setSelectedTier(0);
                      setSelectedModeModal('QUICK');
                    }}
                    activeOpacity={0.85}
                  >
                    <View style={styles.modeOptionHeader}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 8 }}>
                        <View style={[styles.modeOptionIconBg, { backgroundColor: '#F1F5F9' }]}>
                          <Text style={{ fontSize: 24 }}>🎮</Text>
                        </View>
                        <View style={{ marginLeft: 10, flex: 1 }}>
                          <Text style={styles.modeOptionTitle} numberOfLines={1}>Free Practice Mode</Text>
                          <Text style={styles.modeOptionSub} numberOfLines={1}>Unlimited Free Battles • No Balance Required</Text>
                        </View>
                      </View>
                      <View style={[styles.modeOptionBadge, { backgroundColor: '#F1F5F9' }]}>
                        <Text style={[styles.modeOptionBadgeText, { color: '#475569' }]}>FREE</Text>
                      </View>
                    </View>
                    <View style={[styles.modeOptionActionBtn, { backgroundColor: '#475569' }]}>
                      <Text style={styles.modeOptionActionText}>PLAY FREE PRACTICE ➔</Text>
                    </View>
                  </TouchableOpacity>
                </View>
              )}
              {(selectedModeModal === 'QUICK' || selectedModeModal === 'REGULAR') && (
                <View style={{ paddingBottom: 10 }}>
                  <Text style={styles.sectionHeader}>SELECT ENTRY FEE TIER</Text>
                  <View style={styles.tiersContainer}>
                    {ENTRY_FEES.map((fee) => (
                      <AnimatedPressable
                        key={fee}
                        style={[
                          styles.tierCard,
                          selectedTier === fee && styles.selectedTierCard,
                        ]}
                        onPress={() => { setSelectedTier(fee); setCustomFeeText(''); }}
                        disabled={isSearching}
                      >
                        <Text style={[styles.tierFeeText, selectedTier === fee && styles.selectedText]}>
                          {fee === 0 ? 'FREE' : `₹${fee}`}
                        </Text>
                        <View style={styles.winBadge}>
                          <Text style={styles.winBadgeText}>
                            {fee === 0 ? '🏆 PRACTICE' : `💰 WIN ₹${(fee * 1.8).toFixed(0)}`}
                          </Text>
                        </View>
                      </AnimatedPressable>
                    ))}
                  </View>

                  <View style={styles.customFeeContainer}>
                    <Text style={styles.customFeeLabel}>Or enter custom amount:</Text>
                    <View style={styles.customFeeInputWrapper}>
                      <Text style={styles.customFeeCurrency}>₹</Text>
                      <TextInput
                        style={styles.customFeeInput}
                        placeholder="Enter custom amount"
                        placeholderTextColor="#94A3B8"
                        keyboardType="numeric"
                        value={customFeeText}
                        onChangeText={(val) => {
                          const numeric = val.replace(/[^0-9]/g, '');
                          setCustomFeeText(numeric);
                          setSelectedTier(numeric ? Number(numeric) : 50);
                        }}
                        editable={!isSearching}
                      />
                    </View>
                  </View>

                  <AnimatedPressable
                    style={[styles.primaryActionBtn, { backgroundColor: selectedTier === 0 ? '#059669' : (selectedModeModal === 'QUICK' ? '#059669' : '#4F46E5'), marginTop: 16 }]}
                    onPress={() => {
                      setSelectedModeModal(null);
                      handleJoinMatchmaking();
                    }}
                  >
                    <Text style={styles.primaryActionText}>
                      {selectedTier === 0
                        ? (selectedModeModal === 'QUICK' ? '⚡ FIND FREE QUICK MATCH (₹0)' : '🎲 START FREE MATCH (₹0)')
                        : (selectedModeModal === 'QUICK' ? `⚡ FIND QUICK MATCH (₹${selectedTier})` : `🎲 START REGULAR MATCH (₹${selectedTier})`)
                      }
                    </Text>
                  </AnimatedPressable>
                </View>
              )}

              {selectedModeModal === 'ROOMS' && (
                <View style={{ paddingBottom: 10 }}>
                  <View style={styles.formCard}>
                    <Text style={styles.formCardHeader}>CREATE PRIVATE LOBBY</Text>
                    <Text style={styles.sectionHeader}>SELECT ENTRY FEE</Text>
                    <View style={styles.tiersContainer}>
                      {ENTRY_FEES.map((fee) => (
                        <TouchableOpacity
                          key={fee}
                          style={[styles.tierCard, selectedTier === fee && styles.selectedTierCard]}
                          onPress={() => { setSelectedTier(fee); setCustomFeeText(''); }}
                          activeOpacity={0.7}
                          disabled={!!lobbyDetails}
                        >
                          <Text style={[styles.tierFeeText, selectedTier === fee && styles.selectedText]}>₹{fee}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>

                    {!lobbyDetails && (
                      <View style={{ marginBottom: 16 }}>
                        <Text style={styles.sectionHeader}>CUSTOM RULES</Text>
                        <Text style={styles.toggleLabel}>Active Tokens per Player</Text>
                        <View style={styles.toggleRow}>
                          {[2, 3, 4].map((count) => (
                            <TouchableOpacity
                              key={count}
                              style={[styles.toggleBtn, customTokens === count && styles.toggleBtnActive]}
                              onPress={() => setCustomTokens(count)}
                            >
                              <Text style={[styles.toggleBtnText, customTokens === count && styles.toggleBtnTextActive]}>
                                {count} Tokens
                              </Text>
                            </TouchableOpacity>
                          ))}
                        </View>

                        <Text style={styles.toggleLabel}>Turn Timer Duration</Text>
                        <View style={styles.toggleRow}>
                          {[15, 30, 45].map((seconds) => (
                            <TouchableOpacity
                              key={seconds}
                              style={[styles.toggleBtn, customTimer === seconds && styles.toggleBtnActive]}
                              onPress={() => setCustomTimer(seconds)}
                            >
                              <Text style={[styles.toggleBtnText, customTimer === seconds && styles.toggleBtnTextActive]}>
                                {seconds}s
                              </Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      </View>
                    )}

                    {lobbyDetails ? (
                      <View style={styles.lobbyDetailsBox}>
                        <Text style={styles.lobbyHeader}>LOBBY CREATED SUCCESSFULLY</Text>
                        <Text style={styles.lobbyText}>Room Code: <Text style={styles.boldText}>{lobbyDetails.roomToken}</Text></Text>
                        <Text style={styles.lobbyText}>Passcode: <Text style={styles.boldText}>{lobbyDetails.passwordStr}</Text></Text>
                        <TouchableOpacity style={styles.whatsappBtn} onPress={handleShareLobby}>
                          <Text style={styles.whatsappBtnText}>🟢 INVITE VIA WHATSAPP</Text>
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <TouchableOpacity
                        style={styles.primaryActionBtn}
                        onPress={handleCreatePrivateLobby}
                        disabled={isCreatingLobby}
                      >
                        {isCreatingLobby ? <ActivityIndicator color="#FFF" /> : <Text style={styles.primaryActionText}>CREATE PRIVATE ROOM</Text>}
                      </TouchableOpacity>
                    )}
                  </View>

                  <View style={[styles.formCard, { marginTop: 16 }]}>
                    <Text style={styles.formCardHeader}>JOIN WITH ROOM CODE</Text>
                    <TextInput
                      style={styles.inputField}
                      placeholder="Enter 6-Digit Room Code"
                      placeholderTextColor="#94A3B8"
                      keyboardType="numeric"
                      value={joinRoomCode}
                      onChangeText={setJoinRoomCode}
                    />
                    <TextInput
                      style={styles.inputField}
                      placeholder="Enter Passcode"
                      placeholderTextColor="#94A3B8"
                      value={joinPasscode}
                      onChangeText={setJoinPasscode}
                      autoCapitalize="characters"
                    />
                    <TouchableOpacity
                      style={[styles.primaryActionBtn, { backgroundColor: '#2563EB' }]}
                      onPress={handleJoinPrivateLobby}
                      disabled={isJoiningLobby}
                    >
                      {isJoiningLobby ? <ActivityIndicator color="#FFF" /> : <Text style={styles.primaryActionText}>JOIN ROOM</Text>}
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {selectedModeModal === 'TOURNAMENTS' && (
                <View style={{ paddingBottom: 10 }}>
                  {tournamentsList.map((tournamentItem) => {
                    const isUserReg = tournamentItem.registeredUsers?.includes(currentUser._id);
                    const isRegBusy = registeringTourId === tournamentItem._id;
                    const fillPct = Math.min(100, Math.round(((tournamentItem.registeredCount || 0) / (tournamentItem.maxEntries || 1)) * 100));
                    const spotsLeft = Math.max(0, (tournamentItem.maxEntries || 0) - (tournamentItem.registeredCount || 0));

                    return (
                      <View key={tournamentItem._id} style={styles.tournamentCard}>
                        <View style={styles.tournamentBanner}>
                          <View>
                            <Text style={styles.tournamentSub}>LIVE POOL TOURNAMENT</Text>
                            <Text style={styles.tournamentTitle}>{tournamentItem.title.toUpperCase()}</Text>
                          </View>
                          <View style={styles.prizeBadge}>
                            <Text style={styles.prizeText}>Prize Pool</Text>
                            <Text style={styles.prizePool}>₹{tournamentItem.totalPrizePool.toLocaleString()}</Text>
                          </View>
                        </View>

                        <View style={styles.trackerContainer}>
                          <View style={styles.trackerTextRow}>
                            <Text style={styles.trackerLabel}>Registration Density</Text>
                            <Text style={styles.trackerDensity}>
                              {tournamentItem.registeredCount}/{tournamentItem.maxEntries} Joined ({fillPct}%)
                            </Text>
                          </View>
                          <View style={styles.progressBarBg}>
                            <View style={[styles.progressBarFill, { width: `${fillPct}%` }]} />
                          </View>
                          <Text style={styles.spotsLeftText}>{spotsLeft.toLocaleString()} SPOTS LEFT</Text>
                        </View>

                        <View style={styles.timingRow}>
                          <View style={[styles.timingCol, styles.timingColLeft]}>
                            <Text style={styles.timingLabel}>REGISTRATION OPENS</Text>
                            <Text style={styles.timingValue}>{formatDateTime(tournamentItem.startsAt)}</Text>
                          </View>
                          <View style={styles.timingCol}>
                            <Text style={styles.timingLabel}>GAME STARTS</Text>
                            <Text style={styles.timingValue}>{formatDateTime(tournamentItem.endsAt)}</Text>
                          </View>
                        </View>

                        <View style={styles.buyInRow}>
                          <View>
                            <Text style={styles.buyInLabel}>Entry Fee</Text>
                            <Text style={styles.buyInValue}>₹{tournamentItem.entryFee}</Text>
                          </View>
                          <AnimatedPressable
                            style={[
                              styles.buyInBtn,
                              isUserReg && styles.buyInBtnRegistered,
                              isRegBusy && styles.buyInBtnDisabled
                            ]}
                            onPress={() => {
                              setSelectedModeModal(null);
                              handleJoinTournament(tournamentItem);
                            }}
                            disabled={isRegBusy}
                          >
                            {isRegBusy ? (
                              <ActivityIndicator color="#FFF" />
                            ) : (
                              <Text style={styles.buyInBtnText}>
                                {isUserReg ? 'Registered • Awaiting Start' : 'Register Now'}
                              </Text>
                            )}
                          </AnimatedPressable>
                        </View>
                      </View>
                    );
                  })}
                </View>
              )}
            </ScrollView>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* Premium Custom Alert Modal */}
      <CustomAlertModal
        alert={customAlert}
        onClose={() => setCustomAlert((prev) => ({ ...prev, visible: false }))}
      />
      {/* Matchmaking Status Overlay Card */}
      <MatchmakingCardOverlay
        visible={isSearching}
        onCancel={handleCancelQueue}
        onAnimationComplete={() => setIsSearching(false)}
        durationSeconds={13}
        entryFee={selectedTier}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC', // Premium Canvas Backdrop (#F8FAFC canvas background)
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    justifyContent: 'flex-end',
  },
  modalContentContainer: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 20,
    maxHeight: '85%',
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
  },
  modalHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderColor: '#F1F5F9',
  },
  modalTitleText: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0F172A',
  },
  modalSubText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  modalCloseBtn: {
    backgroundColor: '#F1F5F9',
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCloseText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#64748B',
  },
  modeOptionCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 20,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 2,
  },
  modeOptionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  modeOptionIconBg: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeOptionTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#0F172A',
  },
  modeOptionSub: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
    marginTop: 2,
  },
  modeOptionBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  modeOptionBadgeText: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  modeOptionActionBtn: {
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeOptionActionText: {
    fontSize: 13,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 0.8,
  },
  dailyGiftBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E1B4B',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#6366F1',
  },
  dailyGiftText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#FACC15',
    marginLeft: 6,
  },
  bellBtn: {
    backgroundColor: '#EEF2FF',
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarHeaderBtn: {
    backgroundColor: '#EEF2FF',
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#4F46E5',
  },
  hero3DCard: {
    backgroundColor: '#1E1B4B',
    borderRadius: 28,
    paddingVertical: 36,
    paddingHorizontal: 20,
    alignItems: 'center',
    marginBottom: 24,
    minHeight: 385,
    justifyContent: 'space-between',
    position: 'relative',
    overflow: 'hidden',
    shadowColor: '#4F46E5',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.4,
    shadowRadius: 22,
    elevation: 9,
  },
  sparkleRing: {
    position: 'absolute',
    top: -10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroStage3D: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 18,
    height: 125,
  },
  dice3DBox: {
    backgroundColor: '#312E81',
    width: 82,
    height: 82,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2.5,
    borderColor: '#6366F1',
    shadowColor: '#818CF8',
    shadowOpacity: 0.7,
    shadowRadius: 16,
    elevation: 8,
  },
  pawnClashRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 16,
  },
  pawn3D: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  pawn3DRed: {
    backgroundColor: '#991B1B',
    borderColor: '#EF4444',
    shadowColor: '#EF4444',
    shadowOpacity: 0.8,
    shadowRadius: 10,
  },
  pawn3DGreen: {
    backgroundColor: '#065F46',
    borderColor: '#10B981',
    shadowColor: '#10B981',
    shadowOpacity: 0.8,
    shadowRadius: 10,
  },
  heroTitle: {
    fontSize: 28,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 2,
    marginTop: 6,
  },
  heroSubtitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#93C5FD',
    marginTop: 2,
    marginBottom: 20,
  },
  heroPlayNowBtn: {
    backgroundColor: '#FACC15',
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 28,
    shadowColor: '#FACC15',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5,
    shadowRadius: 14,
    elevation: 7,
  },
  heroPlayNowText: {
    fontSize: 14,
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: 1,
  },
  topGamesHeader: {
    fontSize: 15,
    fontWeight: '900',
    color: '#0F172A',
    marginBottom: 14,
    letterSpacing: 1,
  },
  gameModesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 14,
  },
  mode3DCard: {
    width: '48%',
    borderRadius: 22,
    padding: 12,
    paddingTop: 12,
    alignItems: 'center',
    position: 'relative',
    overflow: 'hidden',
    height: 165,
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 5,
  },
  modeTagBadge: {
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    alignSelf: 'flex-start',
  },
  modeTagText: {
    fontSize: 9,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  modeIconCircle: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 4,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  modeCardTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  modeCardSub: {
    fontSize: 10,
    fontWeight: '700',
    color: 'rgba(255, 255, 255, 0.85)',
    textAlign: 'center',
    marginTop: -2,
  },
  modeCardFooter: {
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
    width: '130%',
    paddingVertical: 5,
    alignItems: 'center',
    marginBottom: -10,
  },
  modeFooterBtnText: {
    fontSize: 11,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  header: {
    height: 70,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#334155',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 3,
    marginTop: Platform.OS === 'android' ? 24 : 0,
  },
  logoText: {
    fontSize: 22,
    fontWeight: '900',
    color: '#4F46E5', // Premium indigo accent
    letterSpacing: 3,
  },
  walletPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EEF2FF', // Active glow light-lavender
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#E0E7FF',
  },
  walletBalance: {
    fontSize: 13,
    fontWeight: '800',
    color: '#4F46E5', // Slate indigo accent
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 150, // Account for absolutely positioned bottom capsule bar
  },
  carouselContainer: {
    flexDirection: 'row',
    backgroundColor: '#E5E7EB',
    borderRadius: 24, // Global component macro radius
    padding: 4,
    marginBottom: 24,
    position: 'relative',
    height: 48,
    alignItems: 'center',
  },
  carouselActiveSlide: {
    position: 'absolute',
    height: '84%',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    left: 4,
  },
  carouselBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  carouselBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
  },
  carouselBtnTextActive: {
    color: '#4F46E5',
    fontWeight: 'bold',
  },
  sectionHeader: {
    fontSize: 11,
    color: '#475569',
    letterSpacing: 1,
    fontWeight: '700',
    marginBottom: 12,
    textTransform: 'uppercase',
  },
  tiersContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  tierCard: {
    width: '48%',
    backgroundColor: '#FFFFFF', // Card Surfaces
    borderRadius: 24, // Global component radius
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 12,
    // High-End Skeuomorphic Elevation & 3D shadow depth
    shadowColor: '#475569',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
    elevation: 6,
    position: 'relative',
    overflow: 'hidden',
  },
  selectedTierCard: {
    borderColor: '#4F46E5',
    backgroundColor: '#EEF2FF',
  },
  tierFeeText: {
    fontSize: 22,
    fontWeight: '900',
    color: '#0F172A',
  },
  winBadge: {
    marginTop: 6,
    backgroundColor: '#ECFDF5',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#D1FAE5',
  },
  winBadgeText: {
    color: '#10B981',
    fontSize: 11,
    fontWeight: '800',
  },
  selectedText: {
    color: '#4F46E5',
  },
  primaryActionBtn: {
    backgroundColor: '#4F46E5',
    borderRadius: 24, // Global component radius
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    // High-End Skeuomorphic Elevation & 3D shadow depth
    shadowColor: '#475569',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
    elevation: 6,
  },
  primaryActionText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 15,
    letterSpacing: 0.5,
  },
  searchingCard: {
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#475569',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.05,
    shadowRadius: 16,
    elevation: 4,
    marginBottom: 24,
  },
  searchingText: {
    color: '#0F172A',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginTop: 16,
  },
  timerText: {
    color: '#64748B',
    fontSize: 12,
    marginTop: 6,
    marginBottom: 20,
    fontWeight: '500',
  },
  cancelBtn: {
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 28,
  },
  cancelBtnText: {
    color: '#EF4444',
    fontWeight: 'bold',
    fontSize: 13,
  },
  formCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#475569',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.05,
    shadowRadius: 16,
    elevation: 4,
  },
  formCardHeader: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 16,
    letterSpacing: 0.5,
  },
  inputField: {
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    padding: 12,
    fontSize: 14,
    color: '#0F172A',
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    marginBottom: 16,
  },
  lobbyDetailsBox: {
    backgroundColor: '#F9FAFB',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
  },
  lobbyHeader: {
    fontSize: 12,
    fontWeight: '800',
    color: '#10B981',
    marginBottom: 12,
  },
  lobbyText: {
    fontSize: 14,
    color: '#475569',
    marginBottom: 6,
  },
  boldText: {
    fontWeight: 'bold',
    color: '#0F172A',
  },
  whatsappBtn: {
    backgroundColor: '#25D366',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    marginTop: 12,
  },
  whatsappBtnText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 13,
  },
  waitingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
  },
  waitingText: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '500',
  },
  tournamentCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    // High-End Skeuomorphic Elevation & 3D shadow depth
    shadowColor: '#475569',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
    elevation: 6,
    position: 'relative',
    overflow: 'hidden',
  },
  tournamentBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#FDE68A',
    marginBottom: 16,
  },
  tournamentSub: {
    fontSize: 9,
    fontWeight: '700',
    color: '#D97706',
    letterSpacing: 1,
  },
  tournamentTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#92400E',
    marginTop: 2,
  },
  prizeBadge: {
    alignItems: 'flex-end',
  },
  prizeText: {
    fontSize: 10,
    color: '#D97706',
    fontWeight: '600',
  },
  prizePool: {
    fontSize: 18,
    fontWeight: '900',
    color: '#B45309',
  },
  trackerContainer: {
    marginBottom: 16,
  },
  trackerTextRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  trackerLabel: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '500',
  },
  trackerDensity: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0F172A',
  },
  progressBarBg: {
    height: 6,
    backgroundColor: '#E5E7EB',
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 6,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#F59E0B',
    borderRadius: 3,
  },
  spotsLeftText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#EF4444',
  },
  timingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 16,
  },
  timingCol: {
    flex: 1,
    alignItems: 'center',
  },
  timingColLeft: {
    borderRightWidth: 1,
    borderColor: '#E2E8F0',
  },
  timingLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: '#64748B',
    marginBottom: 4,
    letterSpacing: 0.5,
  },
  timingValue: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
  },
  buyInRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderColor: '#E5E7EB',
    paddingTop: 12,
  },
  buyInLabel: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
  },
  buyInValue: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 2,
  },
  buyInBtn: {
    backgroundColor: '#10B981',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buyInBtnRegistered: {
    backgroundColor: '#64748B',
  },
  buyInBtnDisabled: {
    opacity: 0.6,
  },
  buyInBtnText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 13,
  },
  footerCapsule: {
    position: 'absolute',
    bottom: 20,
    alignSelf: 'center',
    width: '92%',
    maxWidth: 550,
    height: 70,
    backgroundColor: '#FFFFFF',
    borderRadius: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 10,
    // Global shadow profile
    shadowColor: '#475569',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.05,
    shadowRadius: 16,
    elevation: 4,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  footerTab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
  },
  footerTabActive: {
    backgroundColor: '#EEF2FF', // Active glow tint
  },
  footerTabText: {
    marginLeft: 6,
    color: '#4F46E5', // Brand Indigo accent active
    fontSize: 12,
    fontWeight: 'bold',
  },
  toggleLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
    marginTop: 8,
    marginBottom: 6,
  },
  toggleRow: {
    flexDirection: 'row',
    marginBottom: 12,
    backgroundColor: '#F3F4F6',
    padding: 3,
    borderRadius: 12,
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 10,
  },
  toggleBtnActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#475569',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 1,
  },
  toggleBtnText: {
    color: '#64748B',
    fontWeight: '700',
    fontSize: 11,
  },
  toggleBtnTextActive: {
    color: '#4F46E5',
  },
  customFeeContainer: {
    marginTop: 10,
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  customFeeLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 6,
  },
  customFeeInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingHorizontal: 12,
  },
  customFeeCurrency: {
    fontSize: 16,
    fontWeight: '700',
    color: '#4F46E5',
    marginRight: 6,
  },
  customFeeInput: {
    flex: 1,
    height: 40,
    fontSize: 14,
    color: '#0F172A',
    fontWeight: '600',
    padding: 0,
  },
  alertOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  alertCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    width: '100%',
    maxWidth: 320,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    elevation: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  alertIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  alertIcon_success: {
    backgroundColor: '#D1FAE5',
  },
  alertIcon_error: {
    backgroundColor: '#FEE2E2',
  },
  alertIcon_info: {
    backgroundColor: '#E0E7FF',
  },
  alertIconText: {
    fontSize: 22,
    fontWeight: '800',
  },
  alertTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 8,
    textAlign: 'center',
  },
  alertMessage: {
    fontSize: 13,
    color: '#475569',
    lineHeight: 18,
    textAlign: 'center',
    marginBottom: 20,
    fontWeight: '600',
  },
  alertButton: {
    width: '100%',
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  alertBtn_success: {
    backgroundColor: '#10B981',
  },
  alertBtn_error: {
    backgroundColor: '#EF4444',
  },
  alertBtn_info: {
    backgroundColor: '#4F46E5',
  },
  alertButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  headerBellPill: {
    backgroundColor: '#F8FAFC',
    borderRadius: 20,
    paddingHorizontal: 2,
    paddingVertical: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
