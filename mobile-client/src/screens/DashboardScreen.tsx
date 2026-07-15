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
  Dimensions,
} from 'react-native';
import axios from 'axios';
import { useWallet } from '../hooks/useWallet';

const API_SERVER_URL = process.env.EXPO_PUBLIC_SERVER_URL || 'http://localhost:5000';
const { width } = Dimensions.get('window');

interface DashboardScreenProps {
  currentUser: { _id: string; username: string };
  socketId: string | null;
  onMatchFound: (roomId: string) => void;
  onGoToWallet: () => void;
  onGoToLeaderboard: () => void;
  onGoToChallenges: () => void;
  onLogout?: () => void;
}

const ENTRY_FEES = [50, 100, 500, 1000];

export const DashboardScreen: React.FC<DashboardScreenProps> = ({
  currentUser,
  socketId,
  onMatchFound,
  onGoToWallet,
  onGoToLeaderboard,
  onGoToChallenges,
  onLogout,
}) => {
  const { balances, fetchWallet } = useWallet();
  const [selectedTier, setSelectedTier] = useState<number>(50);
  const [isSearching, setIsSearching] = useState(false);
  const [searchTimer, setSearchTimer] = useState(13); // Align to 13 seconds
  const [lobbyDetails, setLobbyDetails] = useState<{ roomToken: string; passwordStr: string } | null>(null);

  // Top segment carousel tabs
  const [activeTab, setActiveTab] = useState<'REGULAR' | 'QUICK' | 'TURBO'>('REGULAR');
  const underlineTranslateX = useRef(new Animated.Value(0)).current;

  // Tournament details
  const [tournament, setTournament] = useState<any>(null);
  const [isRegisteringTournament, setIsRegisteringTournament] = useState(false);
  const [isRegistered, setIsRegistered] = useState(false);

  // Animations scale for button presses
  const buttonScale = useRef(new Animated.Value(1)).current;

  // Fetch wallet balance and active tournaments on load
  useEffect(() => {
    fetchWallet(currentUser._id);
    fetchActiveTournament();
  }, [currentUser._id]);

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

  // Underline slide animation for tab change
  const handleTabChange = (tab: 'REGULAR' | 'QUICK' | 'TURBO') => {
    setActiveTab(tab);
    let targetX = 0;
    const tabWidth = (width - 40) / 3;
    if (tab === 'QUICK') targetX = tabWidth;
    if (tab === 'TURBO') targetX = tabWidth * 2;

    Animated.spring(underlineTranslateX, {
      toValue: targetX,
      useNativeDriver: true,
      tension: 50,
      friction: 8,
    }).start();
  };

  const pressInButton = () => {
    Animated.spring(buttonScale, {
      toValue: 0.95,
      useNativeDriver: true,
    }).start();
  };

  const pressOutButton = () => {
    Animated.spring(buttonScale, {
      toValue: 1,
      useNativeDriver: true,
    }).start();
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
          { text: 'Add Cash', onPress: onGoToWallet },
        ]
      );
      return;
    }

    setIsSearching(true);
    setSearchTimer(13); // Align countdown limit to 13s

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
        mode: activeTab, // pass tab segment info
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

  const handleCreatePrivateLobby = () => {
    const roomToken = Math.floor(100000 + Math.random() * 900000).toString();
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let passwordStr = '';
    for (let i = 0; i < 6; i++) {
      passwordStr += characters.charAt(Math.floor(Math.random() * characters.length));
    }

    setLobbyDetails({ roomToken, passwordStr });
    Alert.alert('Room Created Successfully', `Invite code: ${roomToken}\nPasscode: ${passwordStr}\n\nShare this code with your friends to play together!`);
  };

  const handleShareLobby = async () => {
    if (!lobbyDetails) return;
    try {
      const shareMessage = `🎲 Join my Private Sexus Ludo Room!\n\nRoom Code: ${lobbyDetails.roomToken}\nPasscode: ${lobbyDetails.passwordStr}\nEntry Fee: ${selectedTier} INR\n\nClick here to join directly: https://sexus.platform/join?room=${lobbyDetails.roomToken}&pass=${lobbyDetails.passwordStr}`;
      await Share.share({ message: shareMessage });
    } catch (error: any) {
      Alert.alert('Share Error', error.message);
    }
  };

  const handleCancelSearch = async () => {
    setIsSearching(false);
    console.log('Cancelled search queue');
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
        `Tournament registration requires entry fee of ₹${tournament.entryFee}. Your current balance is ₹${balances.total.toFixed(2)}.`,
        [
          { text: 'Add Cash', onPress: onGoToWallet },
          { text: 'Cancel', style: 'cancel' },
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

  const handleLogout = async () => {
    try {
      await axios.post(`${API_SERVER_URL}/api/users/logout`);
    } catch (err) {
      console.log('Logout session bypass:', err);
    }
    delete axios.defaults.headers.common['x-auth-token'];
    if (onLogout) onLogout();
  };

  return (
    <View style={styles.container}>
      {/* Fixed Premium White Header Bar */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerLink} onPress={handleLogout}>
          <Text style={styles.logoutLinkText}>LOGOUT</Text>
        </TouchableOpacity>
        
        <Text style={styles.logoText}>SEXUS</Text>
        
        <TouchableOpacity style={styles.walletPill} onPress={onGoToWallet}>
          <Text style={styles.walletIcon}>🪙</Text>
          <Text style={styles.walletBalance}>₹{balances.total.toFixed(2)}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Navigation Tabs Selector with sliding line */}
        <View style={styles.tabsWrapper}>
          <View style={styles.tabsContainer}>
            <TouchableOpacity style={styles.tabBtn} onPress={() => handleTabChange('REGULAR')}>
              <Text style={[styles.tabBtnText, activeTab === 'REGULAR' && styles.tabBtnTextActive]}>REGULAR</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.tabBtn} onPress={() => handleTabChange('QUICK')}>
              <Text style={[styles.tabBtnText, activeTab === 'QUICK' && styles.tabBtnTextActive]}>QUICK</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.tabBtn} onPress={() => handleTabChange('TURBO')}>
              <Text style={[styles.tabBtnText, activeTab === 'TURBO' && styles.tabBtnTextActive]}>TURBO</Text>
            </TouchableOpacity>
          </View>
          {/* Sliding underline */}
          <Animated.View
            style={[
              styles.tabUnderline,
              {
                width: (width - 40) / 3,
                transform: [{ translateX: underlineTranslateX }],
              },
            ]}
          />
        </View>

        {/* Live Liquid Tournaments Module */}
        {tournament && (
          <View style={styles.tournamentCard}>
            <View style={styles.tournamentBanner}>
              <View>
                <Text style={styles.tournamentSub}>LIVE TOURNAMENT</Text>
                <Text style={styles.tournamentTitle}>{tournament.title.toUpperCase()}</Text>
              </View>
              <View style={styles.prizeBadge}>
                <Text style={styles.prizeText}>Prize Pool</Text>
                <Text style={styles.prizePool}>₹{tournament.totalPrizePool.toLocaleString()}</Text>
              </View>
            </View>

            {/* Density registration tracker bar */}
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

            {/* Buy-In Actions */}
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
                    {isRegistered ? 'Registered • Awaiting Start' : 'Join Tournament'}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Game Tier Selection List */}
        <Text style={styles.sectionHeader}>SELECT ENTRY FEE TIER</Text>
        <View style={styles.tiersContainer}>
          {ENTRY_FEES.map((fee) => (
            <TouchableOpacity
              key={fee}
              style={[styles.tierCard, selectedTier === fee && styles.selectedTierCard]}
              onPress={() => setSelectedTier(fee)}
              disabled={isSearching}
            >
              <Text style={[styles.tierFeeText, selectedTier === fee && styles.selectedText]}>
                ₹{fee}
              </Text>
              {/* Win payout field with Emerald Green color highlight */}
              <Text style={[styles.tierUnitText, selectedTier === fee ? styles.selectedUnitText : styles.greenWinText]}>
                Win ₹{(fee * 1.8).toFixed(0)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {isSearching ? (
          <View style={styles.searchingCard}>
            <ActivityIndicator size="large" color="#6366F1" />
            <Text style={styles.searchingText}>LOOKING FOR ACTIVE PLAYERS...</Text>
            <Text style={styles.timerText}>Starting match shortly in {searchTimer}s</Text>
            <TouchableOpacity style={styles.cancelBtn} onPress={handleCancelSearch}>
              <Text style={styles.cancelBtnText}>CANCEL</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.actionsContainer}>
            {/* Find Live Match Button with scale animation wrappers */}
            <Animated.View style={{ transform: [{ scale: buttonScale }] }}>
              <TouchableOpacity
                style={styles.primaryActionBtn}
                onPress={handleJoinMatchmaking}
                onPressIn={pressInButton}
                onPressOut={pressOutButton}
                activeOpacity={0.9}
              >
                <Text style={styles.primaryActionText}>FIND LIVE MATCH</Text>
              </TouchableOpacity>
            </Animated.View>

            <TouchableOpacity style={styles.secondaryActionBtn} onPress={handleCreatePrivateLobby}>
              <Text style={styles.secondaryActionText}>PLAY WITH FRIENDS</Text>
            </TouchableOpacity>

            {lobbyDetails && (
              <View style={styles.lobbyDetailsCard}>
                <Text style={styles.lobbyHeader}>PRIVATE LOBBY CREATED</Text>
                <Text style={styles.lobbyText}>Room Code: {lobbyDetails.roomToken}</Text>
                <Text style={styles.lobbyText}>Passcode: {lobbyDetails.passwordStr}</Text>
                
                <TouchableOpacity style={styles.shareBtn} onPress={handleShareLobby}>
                  <Text style={styles.shareBtnText}>INVITE VIA WHATSAPP</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}

        {/* Global navigation shortcuts */}
        <View style={styles.shortcutsRow}>
          <TouchableOpacity style={styles.shortcutBtn} onPress={onGoToLeaderboard}>
            <Text style={styles.shortcutEmoji}>🏆</Text>
            <Text style={styles.shortcutText}>Rankings</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.shortcutBtn} onPress={onGoToChallenges}>
            <Text style={styles.shortcutEmoji}>🎁</Text>
            <Text style={styles.shortcutText}>Milestones</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.shortcutBtn} onPress={onGoToWallet}>
            <Text style={styles.shortcutEmoji}>💳</Text>
            <Text style={styles.shortcutText}>Wallet</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC', // Clean Ice White Background
  },
  header: {
    height: 64,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderColor: '#F1F5F9', // Clean slate border
    marginTop: 20,
  },
  headerLink: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#FFF5F5',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FEE2E2',
  },
  logoutLinkText: {
    color: '#EF4444', // Red logout trigger link
    fontWeight: 'bold',
    fontSize: 10,
    letterSpacing: 0.5,
  },
  logoText: {
    fontSize: 20,
    fontWeight: '900',
    color: '#0F172A', // Centered Near Black Logo
    letterSpacing: 2,
    textAlign: 'center',
  },
  walletPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EEF2FF',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E0E7FF',
  },
  walletIcon: {
    fontSize: 13,
    marginRight: 4,
  },
  walletBalance: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#6366F1',
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  tabsWrapper: {
    marginBottom: 24,
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    padding: 3,
  },
  tabsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
  },
  tabBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
  },
  tabBtnTextActive: {
    color: '#6366F1',
    fontWeight: '700',
  },
  tabUnderline: {
    height: 3,
    backgroundColor: '#6366F1',
    borderRadius: 2,
  },
  tournamentCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 3,
  },
  tournamentBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFFBEB',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FEF3C7',
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
    backgroundColor: '#E2E8F0',
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
    borderColor: '#F1F5F9',
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
    borderRadius: 8,
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
    marginBottom: 24,
  },
  tierCard: {
    width: '48%',
    backgroundColor: '#FFFFFF', // Pure White Base surfaces
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#E2E8F0', // Crisp slate borders
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 12,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.03, // Micro-shadow profiles
    shadowRadius: 8,
    elevation: 3,
  },
  selectedTierCard: {
    borderColor: '#6366F1',
    backgroundColor: '#F8FAFF',
  },
  tierFeeText: {
    fontSize: 22,
    fontWeight: '900',
    color: '#0F172A',
  },
  tierUnitText: {
    fontSize: 11,
    marginTop: 3,
    fontWeight: '700',
  },
  greenWinText: {
    color: '#10B981', // Brilliant emerald accent Win text fields
  },
  selectedUnitText: {
    color: '#6366F1',
  },
  selectedText: {
    color: '#6366F1',
  },
  actionsContainer: {
    marginBottom: 24,
  },
  primaryActionBtn: {
    backgroundColor: '#6366F1',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginBottom: 12,
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 4,
  },
  primaryActionText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 15,
    letterSpacing: 1,
  },
  secondaryActionBtn: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    padding: 15,
    alignItems: 'center',
  },
  secondaryActionText: {
    color: '#0F172A',
    fontWeight: '600',
    fontSize: 14,
  },
  searchingCard: {
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 2,
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
    backgroundColor: '#F1F5F9',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 28,
  },
  cancelBtnText: {
    color: '#EF4444',
    fontWeight: 'bold',
    fontSize: 13,
  },
  lobbyDetailsCard: {
    marginTop: 12,
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  lobbyHeader: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#10B981',
    marginBottom: 8,
    letterSpacing: 1,
  },
  lobbyText: {
    color: '#334155',
    fontSize: 13,
    marginBottom: 4,
    fontWeight: '600',
  },
  shareBtn: {
    backgroundColor: '#25D366',
    borderRadius: 8,
    padding: 10,
    alignItems: 'center',
    marginTop: 10,
  },
  shareBtnText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 13,
  },
  shortcutsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderColor: '#E2E8F0',
    paddingTop: 24,
    marginTop: 10,
  },
  shortcutBtn: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    marginHorizontal: 4,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#F1F5F9',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.02,
    shadowRadius: 5,
    elevation: 1,
  },
  shortcutEmoji: {
    fontSize: 18,
    marginBottom: 4,
  },
  shortcutText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },
});
export default DashboardScreen;
