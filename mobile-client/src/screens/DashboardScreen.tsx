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
} from 'react-native';
import axios from 'axios';
import Svg, { Circle, Path, Rect, Defs, RadialGradient, Stop, Polyline } from 'react-native-svg';
import { useWallet } from '../hooks/useWallet';

// Import sub-screens to render in capsule view
import { LeaderboardScreen } from './LeaderboardScreen';
import { ChallengeScreen } from './ChallengeScreen';
import { AuthWalletScreen } from './AuthWalletScreen';

const API_SERVER_URL = process.env.EXPO_PUBLIC_SERVER_URL || 'http://localhost:5000';
const ENTRY_FEES = [50, 100, 500, 1000];

interface DashboardScreenProps {
  currentUser: { _id: string; username: string; isKycVerified?: boolean };
  socketId: string | null;
  onMatchFound: (roomId: string) => void;
  onGoToWallet: () => void;
  onGoToLeaderboard: () => void;
  onGoToChallenges: () => void;
  onLogout?: () => void;
  onUserUpdate?: (user: any) => void;
}

export const DashboardScreen: React.FC<DashboardScreenProps> = ({
  currentUser,
  socketId,
  onLogout,
  onUserUpdate,
}) => {
  const { width } = useWindowDimensions();
  const { balances, fetchWallet } = useWallet();

  // Unified Bottom Navigation view
  const [currentView, setCurrentView] = useState<'HOME' | 'LIVE' | 'LEADERBOARD' | 'PROFILE'>('HOME');

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
  const [isJoiningLobby, setIsJoiningLobby] = useState(false);

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
    const segmentWidth = (width - paddingOffset) / 3;
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
        Alert.alert('Matchmaking Notice', response.data.message || 'Failed to enter queue.');
      }
    } catch (err: any) {
      clearInterval(countdown);
      setIsSearching(false);
      Alert.alert('Error', err.response?.data?.error || err.message);
    }
  };

  const handleCreatePrivateLobby = async () => {
    if (!socketId) {
      Alert.alert('Connection Notice', 'Establishing server link...');
      return;
    }

    if (balances.total < selectedTier) {
      Alert.alert('Insufficient Balance', 'Please top up your wallet in the Profile tab.');
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
      });

      if (response.data.success) {
        setLobbyDetails({ roomToken, passwordStr });
      } else {
        Alert.alert('Lobby Error', response.data.message || 'Failed to initialize private lobby.');
      }
    } catch (err: any) {
      Alert.alert('Lobby Setup Error', err.response?.data?.error || err.message);
    } finally {
      setIsCreatingLobby(false);
    }
  };

  const handleJoinPrivateLobby = async () => {
    if (!socketId) {
      Alert.alert('Connection Notice', 'Establishing server link...');
      return;
    }

    if (!joinRoomCode || !joinPasscode) {
      Alert.alert('Input Error', 'Please enter both the Room Code and Passcode.');
      return;
    }

    if (balances.total < selectedTier) {
      Alert.alert('Insufficient Balance', 'Please top up your wallet in the Profile tab.');
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
        Alert.alert('Success', 'Private room joined! Match starting shortly.');
      } else {
        Alert.alert('Join Failure', response.data.message || 'Lobby not found or credentials mismatched.');
      }
    } catch (err: any) {
      Alert.alert('Join Error', err.response?.data?.error || err.message);
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
      Alert.alert('Share Error', error.message);
    }
  };

  const handleJoinTournament = async () => {
    if (!tournament) return;
    if (isRegistered) {
      Alert.alert('Tournament Registration', 'You are already registered! Check back when match starts.');
      return;
    }

    if (balances.total < tournament.entryFee) {
      Alert.alert(
        'Insufficient Balance',
        `Tournament registration requires entry fee of ₹${tournament.entryFee}. Please top up your wallet.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Add Cash', onPress: () => setCurrentView('PROFILE') },
        ]
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
        Alert.alert('Registration Successful', `Successfully registered for: ${tournament.title}!`);
        fetchWallet(currentUser._id);
        fetchActiveTournament();
      }
    } catch (err: any) {
      Alert.alert('Registration Failed', err.response?.data?.error || err.message);
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

            {/* QUICK Tab layout */}
            {activeSegment === 'QUICK' && (
              <View>
                <Text style={styles.sectionHeader}>SELECT QUICK MATCH FEE</Text>
                <View style={styles.tiersContainer}>
                  {ENTRY_FEES.map((fee) => (
                    <TouchableOpacity
                      key={fee}
                      style={[styles.tierCard, selectedTier === fee && styles.selectedTierCard]}
                      onPress={() => setSelectedTier(fee)}
                      activeOpacity={0.7}
                      disabled={isSearching}
                    >
                      <Text style={[styles.tierFeeText, selectedTier === fee && styles.selectedText]}>₹{fee}</Text>
                      <View style={styles.winBadge}>
                        <Text style={styles.winBadgeText}>💰 WIN ₹{(fee * 1.8).toFixed(0)}</Text>
                      </View>
                    </TouchableOpacity>
                  ))}
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
                  <Animated.View style={{ transform: [{ scale: buttonScale }, { scale: ctaPulse }] }}>
                    <TouchableOpacity
                      style={styles.primaryActionBtn}
                      onPress={handleJoinMatchmaking}
                      activeOpacity={0.9}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FFF" strokeWidth="2.5" strokeLinecap="round" style={{ marginRight: 8 }}>
                          <Path d="M20 4L4 20M4 4l16 16M12 12V4" />
                        </Svg>
                        <Text style={styles.primaryActionText}>FIND QUICK MATCH</Text>
                      </View>
                    </TouchableOpacity>
                  </Animated.View>
                )}
              </View>
            )}

            {/* REGULAR Tab layout */}
            {activeSegment === 'REGULAR' && (
              <View>
                {tournament && (
                  <View style={styles.tournamentCard}>
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
                      <TouchableOpacity
                        style={[
                          styles.buyInBtn,
                          isRegistered && styles.buyInBtnRegistered,
                          isRegisteringTournament && styles.buyInBtnDisabled
                        ]}
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
                      </TouchableOpacity>
                    </View>
                  </View>
                )}

                <Text style={styles.sectionHeader}>SELECT CLASSIC MATCH FEE</Text>
                <View style={styles.tiersContainer}>
                  {ENTRY_FEES.map((fee) => (
                    <TouchableOpacity
                      key={fee}
                      style={[styles.tierCard, selectedTier === fee && styles.selectedTierCard]}
                      onPress={() => setSelectedTier(fee)}
                      activeOpacity={0.7}
                      disabled={isSearching}
                    >
                      <Text style={[styles.tierFeeText, selectedTier === fee && styles.selectedText]}>₹{fee}</Text>
                      <View style={styles.winBadge}>
                        <Text style={styles.winBadgeText}>💰 WIN ₹{(fee * 1.8).toFixed(0)}</Text>
                      </View>
                    </TouchableOpacity>
                  ))}
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
                  <TouchableOpacity
                    style={[styles.primaryActionBtn, { backgroundColor: '#2563EB' }]}
                    onPress={handleJoinMatchmaking}
                    activeOpacity={0.9}
                  >
                    <Text style={styles.primaryActionText}>FIND REGULAR MATCH</Text>
                  </TouchableOpacity>
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
                        onPress={() => setSelectedTier(fee)}
                        activeOpacity={0.7}
                        disabled={!!lobbyDetails}
                      >
                        <Text style={[styles.tierFeeText, selectedTier === fee && styles.selectedText]}>₹{fee}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>

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
        <ChallengeScreen userId={currentUser._id} onBack={() => setCurrentView('HOME')} />
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
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3F4F6', // Ultra-light Slate Ice White Canvas
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
    // Global micro-shadow profile
    shadowColor: '#475569',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.05,
    shadowRadius: 16,
    elevation: 4,
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
    // Global shadow profile
    shadowColor: '#475569',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.05,
    shadowRadius: 16,
    elevation: 4,
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
    shadowColor: '#475569',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.05,
    shadowRadius: 16,
    elevation: 4,
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
    bottom: 0,
    left: 0,
    right: 0,
    height: 70,
    backgroundColor: '#FFFFFF',
    borderRadius: 40,
    marginHorizontal: 16,
    marginBottom: 20,
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
});
