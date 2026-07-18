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
} from 'react-native';
import axios from 'axios';
import Svg, { Circle, Path, Rect, Defs, RadialGradient, Stop, Polyline, LinearGradient } from 'react-native-svg';
import { useWallet } from '../hooks/useWallet';

// Import sub-screens to render in capsule view
import { LeaderboardScreen } from './LeaderboardScreen';
import { ChallengeScreen } from './ChallengeScreen';
import { AuthWalletScreen } from './AuthWalletScreen';
import { LiveArenaScreen } from './LiveArenaScreen';

const API_SERVER_URL = process.env.EXPO_PUBLIC_SERVER_URL || 'http://localhost:5000';
const ENTRY_FEES = [50, 100, 500, 1000];

interface AnimatedPressableProps {
  onPress: () => void;
  disabled?: boolean;
  style?: any;
  contentStyle?: any;
  children: React.ReactNode;
}

const AnimatedPressable: React.FC<AnimatedPressableProps> = ({
  onPress,
  disabled,
  style,
  contentStyle,
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

  return (
    <Animated.View style={[{ transform: [{ scale }] }, style]}>
      <TouchableOpacity
        activeOpacity={0.9}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        onPress={onPress}
        disabled={disabled}
        style={contentStyle}
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

  const [currentView, setCurrentView] = useState<'HOME' | 'LIVE' | 'LEADERBOARD' | 'PROFILE'>('HOME');

  const [customAlert, setCustomAlert] = useState<{ visible: boolean; title: string; message: string; type: 'success' | 'error' | 'info' }>({
    visible: false,
    title: '',
    message: '',
    type: 'info',
  });

  const showCustomAlert = (title: string, message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setCustomAlert({ visible: true, title, message, type });
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

  // Active Tournament
  const [tournament, setTournament] = useState<any>(null);
  const [isRegisteringTournament, setIsRegisteringTournament] = useState(false);
  const [isRegistered, setIsRegistered] = useState(false);

  // Animations
  const buttonScale = useRef(new Animated.Value(1)).current;
  const ctaPulse = useRef(new Animated.Value(1)).current;
  const radarPulse = useRef(new Animated.Value(1)).current;
  const radarOpacity = useRef(new Animated.Value(1)).current;

  // Initial load
  useEffect(() => {
    fetchWallet(currentUser._id);
    fetchActiveTournament();

    Animated.loop(
      Animated.sequence([
        Animated.timing(ctaPulse, { toValue: 1.03, duration: 1000, useNativeDriver: true }),
        Animated.timing(ctaPulse, { toValue: 1, duration: 1000, useNativeDriver: true }),
      ])
    ).start();

    Animated.loop(
      Animated.parallel([
        Animated.timing(radarPulse, { toValue: 3, duration: 2000, useNativeDriver: true }),
        Animated.timing(radarOpacity, { toValue: 0, duration: 2000, useNativeDriver: true }),
      ])
    ).start();
  }, [currentUser._id]);

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

  const fetchActiveTournament = async () => {
    try {
      const response = await axios.get(`${API_SERVER_URL}/api/tournaments`);
      if (response.data.success && response.data.tournaments.length > 0) {
        const tour = response.data.tournaments[0];
        setTournament(tour);
        if (tour.registeredUsers?.includes(currentUser._id)) {
          setIsRegistered(true);
        }
      }
    } catch (err) {
      console.log('Error fetching tournament info:', err);
    }
  };

  const handleJoinMatchmaking = async () => {
    if (!socketId) {
      Alert.alert('Connection Notice', 'Establishing server link, please try again in a moment.');
      return;
    }

    if (balances.total < selectedTier) {
      Alert.alert(
        'Insufficient Wallet Balance',
        `Your balance is ₹${balances.total.toFixed(2)}. Entry fee is ₹${selectedTier}. Please add cash or claim rewards to play!`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Add Cash', onPress: () => setCurrentView('PROFILE') },
        ]
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
      const shareMessage = `🎲 Join my Private Sexus Ludo Room!\n\nRoom Code: ${lobbyDetails.roomToken}\nPasscode: ${lobbyDetails.passwordStr}\nEntry Fee: ${selectedTier} INR\n\nOpen the app and input these credentials to join.`;
      await Share.share({ message: shareMessage });
    } catch (error: any) {
      showCustomAlert('Share Error', error.message, 'error');
    }
  };

  const handleJoinTournament = async () => {
    if (!tournament) return;
    if (isRegistered) {
      showCustomAlert('Tournament Registration', 'You are already registered! Check back when match starts.', 'info');
      return;
    }

    if (balances.total < tournament.entryFee) {
      showCustomAlert(
        'Insufficient Balance',
        `Tournament registration requires entry fee of ₹${tournament.entryFee}. Please top up your wallet in the Profile tab.`,
        'error'
      );
      return;
    }

    setIsRegisteringTournament(true);
    try {
      const response = await axios.post(`${API_SERVER_URL}/api/tournaments/register`, {
        userId: currentUser._id,
        tournamentId: tournament._id,
      });

      if (response.data.success) {
        setIsRegistered(true);
        showCustomAlert('Registration Successful', `Successfully registered for: ${tournament.title}!`, 'success');
        fetchWallet(currentUser._id);
        fetchActiveTournament();
      }
    } catch (err: any) {
      showCustomAlert('Registration Failed', err.response?.data?.error || err.message, 'error');
    } finally {
      setIsRegisteringTournament(false);
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
        <View style={{ flex: 1 }}>
          {/* Luxury Top Header */}
          <View style={styles.header}>
            <Text style={styles.logoText}>SEXUS</Text>
            <TouchableOpacity style={styles.walletPill} onPress={() => setCurrentView('PROFILE')}>
              <Svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4F46E5" strokeWidth="2.5" style={{ marginRight: 6 }}>
                <Rect x="2" y="5" width="20" height="14" rx="2" />
                <Path d="M2 10h20M6 14h4" />
              </Svg>
              <Text style={styles.walletBalance}>₹{balances.total.toFixed(2)}</Text>
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            {/* Carousel Toggle Selector */}
            <View style={styles.carouselContainer}>
              <Animated.View
                style={[
                  styles.carouselActiveSlide,
                  {
                    width: '33.33%',
                    transform: [{ translateX: segmentTranslateX }],
                  },
                ]}
              />
              <TouchableOpacity style={styles.carouselBtn} onPress={() => setActiveSegment('QUICK')}>
                <Text style={[styles.carouselBtnText, activeSegment === 'QUICK' && styles.carouselBtnTextActive]}>QUICK</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.carouselBtn} onPress={() => setActiveSegment('REGULAR')}>
                <Text style={[styles.carouselBtnText, activeSegment === 'REGULAR' && styles.carouselBtnTextActive]}>REGULAR</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.carouselBtn} onPress={() => setActiveSegment('ROOMS')}>
                <Text style={[styles.carouselBtnText, activeSegment === 'ROOMS' && styles.carouselBtnTextActive]}>ROOMS</Text>
              </TouchableOpacity>
            </View>

            {tournament && (
              <View style={styles.tournamentCard}>
                <Svg style={StyleSheet.absoluteFillObject} width="100%" height="100%" opacity={0.06}>
                  <Defs>
                    <LinearGradient id="isoGrad" x1="0" y1="0" x2="1" y2="1">
                      <Stop offset="0" stopColor="#4F46E5" stopOpacity="0.8" />
                      <Stop offset="1" stopColor="#10B981" stopOpacity="0.8" />
                    </LinearGradient>
                  </Defs>
                  <Path d="M0,20 L150,90 L300,20 M0,80 L150,150 L300,80" fill="none" stroke="url(#isoGrad)" strokeWidth="2" />
                  <Path d="M50,10 L120,45 L70,80 L0,45 Z" fill="url(#isoGrad)" opacity={0.2} />
                  <Path d="M200,100 L270,135 L220,170 L150,135 Z" fill="url(#isoGrad)" opacity={0.2} />
                  <Circle cx="280" cy="50" r="40" fill="url(#isoGrad)" opacity={0.15} />
                </Svg>
                <View style={styles.tournamentBanner}>
                  <View>
                    <Text style={styles.tournamentSub}>LIVE POOL TOURNAMENT</Text>
                    <Text style={styles.tournamentTitle}>{tournament.title.toUpperCase()}</Text>
                  </View>
                  <View style={styles.prizeBadge}>
                    <Text style={styles.prizeText}>Prize Pool</Text>
                    <Text style={styles.prizePool}>₹{tournament.totalPrizePool.toLocaleString()}</Text>
                  </View>
                </View>

                <View style={styles.trackerContainer}>
                  <View style={styles.trackerTextRow}>
                    <Text style={styles.trackerLabel}>Registration Density</Text>
                    <Text style={styles.trackerDensity}>
                      {tournament.registeredCount}/{tournament.maxEntries} Joined
                    </Text>
                  </View>
                  <View style={styles.progressBarBg}>
                    <View
                      style={[
                        styles.progressBarFill,
                        { width: `${(tournament.registeredCount / tournament.maxEntries) * 100}%` }
                      ]}
                    />
                  </View>
                  <Text style={styles.spotsLeftText}>
                    {(tournament.maxEntries - tournament.registeredCount).toLocaleString()} SPOTS LEFT
                  </Text>
                </View>

                <View style={styles.buyInRow}>
                  <View>
                    <Text style={styles.buyInLabel}>Entry Fee</Text>
                    <Text style={styles.buyInValue}>₹{tournament.entryFee}</Text>
                  </View>
                  <AnimatedPressable
                    style={[
                      styles.buyInBtn,
                      isRegistered && styles.buyInBtnRegistered,
                      isRegisteringTournament && styles.buyInBtnDisabled,
                      { paddingVertical: 0 }
                    ]}
                    contentStyle={{ width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center', paddingVertical: 12 }}
                    onPress={handleJoinTournament}
                    disabled={isRegisteringTournament}
                  >
                    {isRegisteringTournament ? (
                      <ActivityIndicator color="#FFF" />
                    ) : (
                      <Text style={styles.buyInBtnText}>
                        {isRegistered ? 'Registered • Awaiting Start' : 'Register Now'}
                      </Text>
                    )}
                  </AnimatedPressable>
                </View>
              </View>
            )}

            {/* QUICK Tab layout */}
            {activeSegment === 'QUICK' && (
              <View>
                <Text style={styles.sectionHeader}>SELECT QUICK MATCH FEE</Text>
                <View style={styles.tiersContainer}>
                  {ENTRY_FEES.map((fee) => (
                    <AnimatedPressable
                      key={fee}
                      style={[
                        styles.tierCard,
                        selectedTier === fee && styles.selectedTierCard,
                        { paddingVertical: 0 }
                      ]}
                      contentStyle={{ width: '100%', alignItems: 'center', justifyContent: 'center', paddingVertical: 16 }}
                      onPress={() => { setSelectedTier(fee); setCustomFeeText(''); }}
                      disabled={isSearching}
                    >
                      <Svg style={StyleSheet.absoluteFillObject} width="100%" height="100%" opacity={0.06}>
                        <Path d="M-10,30 L50,0 L110,30 L50,60 Z" fill="#4F46E5" />
                        <Path d="M50,70 L110,40 L170,70 L110,100 Z" fill="#10B981" />
                      </Svg>
                      <Text style={[styles.tierFeeText, selectedTier === fee && styles.selectedText]}>₹{fee}</Text>
                      <View style={styles.winBadge}>
                        <Text style={styles.winBadgeText}>💰 WIN ₹{(fee * 1.8).toFixed(0)}</Text>
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
                        if (numeric) {
                          setSelectedTier(Number(numeric));
                        } else {
                          setSelectedTier(50);
                        }
                      }}
                      editable={!isSearching}
                    />
                  </View>
                </View>

                {isSearching ? (
                  <View style={styles.searchingCard}>
                    <View style={{ alignItems: 'center', justifyContent: 'center', height: 120 }}>
                      <Animated.View style={{ transform: [{ scale: radarPulse }], opacity: radarOpacity, position: 'absolute' }}>
                        <Svg width="120" height="120" viewBox="0 0 120 120">
                          <Circle cx="60" cy="60" r="50" fill="none" stroke="#4F46E5" strokeWidth="2.5" opacity="0.4" />
                          <Circle cx="60" cy="60" r="30" fill="none" stroke="#4F46E5" strokeWidth="1.5" opacity="0.2" />
                        </Svg>
                      </Animated.View>
                      <ActivityIndicator size="large" color="#4F46E5" />
                    </View>
                    <Text style={styles.searchingText}>LOOKING FOR ACTIVE PLAYERS...</Text>
                    <Text style={styles.timerText}>Starting match shortly in {searchTimer}s</Text>
                    <TouchableOpacity style={styles.cancelBtn} onPress={() => setIsSearching(false)}>
                      <Text style={styles.cancelBtnText}>CANCEL</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <AnimatedPressable
                    style={[
                      styles.primaryActionBtn,
                      { padding: 0 }
                    ]}
                    contentStyle={{ width: '100%', padding: 16, alignItems: 'center', justifyContent: 'center', flexDirection: 'row' }}
                    onPress={handleJoinMatchmaking}
                  >
                    <Svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FFF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 8 }}>
                      <Path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
                    </Svg>
                    <Text style={styles.primaryActionText}>FIND QUICK MATCH</Text>
                  </AnimatedPressable>
                )}
              </View>
            )}

            {/* REGULAR Tab layout */}
            {activeSegment === 'REGULAR' && (
              <View>
                <Text style={styles.sectionHeader}>SELECT CLASSIC MATCH FEE</Text>
                <View style={styles.tiersContainer}>
                  {ENTRY_FEES.map((fee) => (
                    <AnimatedPressable
                      key={fee}
                      style={[
                        styles.tierCard,
                        selectedTier === fee && styles.selectedTierCard,
                        { paddingVertical: 0 }
                      ]}
                      contentStyle={{ width: '100%', alignItems: 'center', justifyContent: 'center', paddingVertical: 16 }}
                      onPress={() => { setSelectedTier(fee); setCustomFeeText(''); }}
                      disabled={isSearching}
                    >
                      <Svg style={StyleSheet.absoluteFillObject} width="100%" height="100%" opacity={0.06}>
                        <Path d="M-10,30 L50,0 L110,30 L50,60 Z" fill="#4F46E5" />
                        <Path d="M50,70 L110,40 L170,70 L110,100 Z" fill="#10B981" />
                      </Svg>
                      <Text style={[styles.tierFeeText, selectedTier === fee && styles.selectedText]}>₹{fee}</Text>
                      <View style={styles.winBadge}>
                        <Text style={styles.winBadgeText}>💰 WIN ₹{(fee * 1.8).toFixed(0)}</Text>
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
                        if (numeric) {
                          setSelectedTier(Number(numeric));
                        } else {
                          setSelectedTier(50);
                        }
                      }}
                      editable={!isSearching}
                    />
                  </View>
                </View>

                {isSearching ? (
                  <View style={styles.searchingCard}>
                    <View style={{ alignItems: 'center', justifyContent: 'center', height: 120 }}>
                      <ActivityIndicator size="large" color="#4F46E5" />
                    </View>
                    <Text style={styles.searchingText}>MATCHMAKING ACTIVE...</Text>
                    <TouchableOpacity style={styles.cancelBtn} onPress={() => setIsSearching(false)}>
                      <Text style={styles.cancelBtnText}>CANCEL</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <AnimatedPressable
                    style={[
                      styles.primaryActionBtn,
                      { backgroundColor: '#2563EB', padding: 0 }
                    ]}
                    contentStyle={{ width: '100%', padding: 16, alignItems: 'center', justifyContent: 'center' }}
                    onPress={handleJoinMatchmaking}
                  >
                    <Text style={styles.primaryActionText}>FIND REGULAR MATCH</Text>
                  </AnimatedPressable>
                )}
              </View>
            )}

            {/* ROOMS Tab layout */}
            {activeSegment === 'ROOMS' && (
              <View>
                {/* Create private room card */}
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
                          if (numeric) {
                            setSelectedTier(Number(numeric));
                          } else {
                            setSelectedTier(50);
                          }
                        }}
                        editable={!lobbyDetails}
                      />
                    </View>
                  </View>

                  {/* Custom Rules Selector */}
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
                      <View style={styles.waitingContainer}>
                        <ActivityIndicator size="small" color="#4F46E5" style={{ marginRight: 8 }} />
                        <Text style={styles.waitingText}>Waiting for opponent to connect...</Text>
                      </View>
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

                {/* Join private room card */}
                <View style={styles.formCard}>
                  <Text style={styles.formCardHeader}>JOIN WITH CODE</Text>
                  
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
          </ScrollView>
        </View>
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
        />
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

      {/* Premium Custom Alert Modal */}
      {customAlert.visible && (
        <Modal visible={true} transparent animationType="fade">
          <View style={styles.alertOverlay}>
            <View style={styles.alertCard}>
              <View style={[
                styles.alertIconCircle,
                customAlert.type === 'success' ? styles.alertIcon_success :
                customAlert.type === 'error' ? styles.alertIcon_error :
                styles.alertIcon_info
              ]}>
                <Text style={[styles.alertIconText, { color: customAlert.type === 'success' ? '#10B981' : customAlert.type === 'error' ? '#EF4444' : '#4F46E5' }]}>
                  {customAlert.type === 'success' ? '✓' : customAlert.type === 'error' ? '✕' : 'ℹ'}
                </Text>
              </View>
              <Text style={styles.alertTitle}>{customAlert.title}</Text>
              <Text style={styles.alertMessage}>{customAlert.message}</Text>
              <TouchableOpacity 
                style={[
                  styles.alertButton,
                  customAlert.type === 'success' ? styles.alertBtn_success :
                  customAlert.type === 'error' ? styles.alertBtn_error :
                  styles.alertBtn_info
                ]} 
                onPress={() => setCustomAlert({ ...customAlert, visible: false })}
                activeOpacity={0.8}
              >
                <Text style={styles.alertButtonText}>Got It</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC', // Premium Canvas Backdrop (#F8FAFC canvas background)
  },
  header: {
    height: 64,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderColor: '#E5E7EB',
    marginTop: 20,
  },
  logoText: {
    fontSize: 20,
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: 2,
  },
  walletPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EEF2FF', // Active glow light-lavender
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E0E7FF',
  },
  walletBalance: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#4F46E5', // Slate indigo accent
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 110, // Account for absolutely positioned bottom capsule bar
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
});
