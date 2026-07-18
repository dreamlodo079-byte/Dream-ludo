import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Animated,
  Dimensions,
  Platform,
} from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import axios from 'axios';

const API_SERVER_URL = process.env.EXPO_PUBLIC_SERVER_URL || 'http://localhost:5000';

interface LiveArenaScreenProps {
  currentUser: { _id: string; username: string };
  socketId: string | null;
  onBack: () => void;
  socket: any; // Passed from parent socket provider
  onUserUpdate?: (user: any) => void;
}

interface TierInfo {
  tier: number;
  timeout: number;
  prize: number;
}

const TIER_CONFIGS: TierInfo[] = [
  { tier: 3, timeout: 60, prize: 5 },
  { tier: 5, timeout: 60, prize: 9 },
  { tier: 10, timeout: 90, prize: 18 },
  { tier: 25, timeout: 90, prize: 45 },
  { tier: 50, timeout: 120, prize: 90 },
  { tier: 100, timeout: 120, prize: 180 },
  { tier: 250, timeout: 180, prize: 450 },
  { tier: 500, timeout: 180, prize: 900 },
];

export const LiveArenaScreen: React.FC<LiveArenaScreenProps> = ({
  currentUser,
  socketId,
  onBack,
  socket,
}) => {
  // Sockets counts delta state
  const [lobbyStats, setLobbyStats] = useState<Record<string, { waiting: number; playing: number }>>({});
  
  // Selected/Active search state
  const [isSearching, setIsSearching] = useState(false);
  const [searchingTier, setSearchingTier] = useState<TierInfo | null>(null);
  const [searchTimer, setSearchTimer] = useState(0);
  const [expandedTier, setExpandedTier] = useState<number | null>(null);

  // Animations
  const searchCountdownRef = useRef<NodeJS.Timeout | null>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const buttonScales = useRef<Record<number, Animated.Value>>({}).current;

  // Initialize scale animation configs for each tier button
  TIER_CONFIGS.forEach((item) => {
    if (!buttonScales[item.tier]) {
      buttonScales[item.tier] = new Animated.Value(1);
    }
  });

  // Pulse animation for WAITING status
  useEffect(() => {
    if (isSearching) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.2, duration: 800, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
        ])
      ).start();
    } else {
      pulseAnim.setValue(1);
    }
  }, [isSearching]);

  // Listen to Sockets LOBBY_STATE_DELTA event
  useEffect(() => {
    if (socket) {
      const handleLobbyDelta = (data: { success: boolean; delta: any }) => {
        if (data.success && data.delta) {
          setLobbyStats(data.delta);
        }
      };

      socket.on('LOBBY_STATE_DELTA', handleLobbyDelta);

      // Force an initial query to populate counts on load
      socket.emit('REQUEST_LOBBY_STATS');

      return () => {
        socket.off('LOBBY_STATE_DELTA', handleLobbyDelta);
      };
    }
  }, [socket]);

  // Check if player is already waiting in queue on component mount
  useEffect(() => {
    const checkQueueStatus = async () => {
      try {
        const response = await axios.get(`${API_SERVER_URL}/api/payments/matchmaker/status/${currentUser._id}`);
        if (response.data.success && response.data.status === 'WAITING') {
          const tierVal = response.data.tier;
          const matchedConfig = TIER_CONFIGS.find((c) => c.tier === tierVal) || TIER_CONFIGS[2];
          
          const elapsedSec = Math.floor((Date.now() - response.data.joinedAt) / 1000);
          const remaining = Math.max(0, matchedConfig.timeout - elapsedSec);
          
          setSearchingTier(matchedConfig);
          setIsSearching(true);
          setSearchTimer(remaining);

          startLocalCountdown(remaining);
        }
      } catch (err) {
        console.error('Failed to sync queue search status:', err);
      }
    };
    checkQueueStatus();

    return () => {
      if (searchCountdownRef.current) clearInterval(searchCountdownRef.current);
    };
  }, [currentUser._id]);

  const startLocalCountdown = (initialTime: number) => {
    if (searchCountdownRef.current) clearInterval(searchCountdownRef.current);
    
    let current = initialTime;
    searchCountdownRef.current = setInterval(() => {
      current--;
      setSearchTimer(current);
      if (current <= 0) {
        if (searchCountdownRef.current) {
          clearInterval(searchCountdownRef.current);
        }
        // Timeout bot injection will be triggered on the backend
      }
    }, 1000);
  };

  const handleRegisterTier = async (item: TierInfo) => {
    if (!socketId) {
      alert('Establishing server sync, please try again in a second.');
      return;
    }

    // Button press scale feedback
    Animated.sequence([
      Animated.timing(buttonScales[item.tier], { toValue: 0.9, duration: 100, useNativeDriver: true }),
      Animated.timing(buttonScales[item.tier], { toValue: 1, duration: 150, useNativeDriver: true }),
    ]).start();

    try {
      const response = await axios.post(`${API_SERVER_URL}/api/payments/matchmaker/join`, {
        userId: currentUser._id,
        username: currentUser.username,
        socketId,
        entryFee: item.tier,
        mode: 'REGULAR',
      });

      if (response.data.success) {
        setSearchingTier(item);
        setIsSearching(true);
        setSearchTimer(item.timeout);
        startLocalCountdown(item.timeout);
      } else {
        alert(response.data.message || 'Failed to register for matchmaking.');
      }
    } catch (err: any) {
      alert(err.response?.data?.error || err.message);
    }
  };

  const handleCancelSearch = async () => {
    if (searchCountdownRef.current) clearInterval(searchCountdownRef.current);
    
    try {
      const response = await axios.post(`${API_SERVER_URL}/api/payments/matchmaker/leave`, {
        userId: currentUser._id,
      });

      if (response.data.success) {
        setIsSearching(false);
        setSearchingTier(null);
        setSearchTimer(0);
      } else {
        alert(response.data.message || 'Failed to cancel search.');
      }
    } catch (err: any) {
      alert(err.response?.data?.error || err.message);
    }
  };

  const renderTierCard = ({ item }: { item: TierInfo }) => {
    const isThisSearching = isSearching && searchingTier?.tier === item.tier;
    const stats = lobbyStats[item.tier] || { waiting: 0, playing: 0 };
    const totalOnline = stats.waiting + stats.playing;
    const isExpanded = expandedTier === item.tier;

    return (
      <View style={[styles.cardContainer, isThisSearching && styles.cardContainerActive]}>
        <View style={styles.mainCardRow}>
          {/* Left Side: Active user headcount */}
          <View style={styles.leftInfoBlock}>
            <View style={styles.headcountRow}>
              <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#4F46E5" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <Path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <Circle cx="9" cy="7" r="4" />
                <Path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <Path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </Svg>
              <Text style={styles.headcountText}>
                {totalOnline > 0 ? `${totalOnline} Online` : '0 Players'}
              </Text>
            </View>
            <TouchableOpacity 
              style={styles.dropdownToggle}
              onPress={() => setExpandedTier(isExpanded ? null : item.tier)}
              activeOpacity={0.7}
            >
              <Text style={styles.dropdownToggleText}>
                {isExpanded ? 'Hide Prize Scale ?' : 'Show Prize Scale ?'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Middle: Waiting / Pulsing status capsule */}
          <View style={styles.middleCapsuleBlock}>
            {isThisSearching ? (
              <View style={styles.statusCapsuleWaiting}>
                <Animated.View style={[styles.pulsingDot, { transform: [{ scale: pulseAnim }] }]} />
                <Text style={styles.statusCapsuleText}>
                  {searchTimer}s Left
                </Text>
              </View>
            ) : (
              <View style={styles.statusCapsuleIdle}>
                <Text style={styles.statusCapsuleTextIdle}>Active Tiers</Text>
              </View>
            )}
          </View>

          {/* Right Side: Entry Fee Button */}
          <Animated.View style={{ transform: [{ scale: buttonScales[item.tier] }] }}>
            <TouchableOpacity
              style={[
                styles.actionButton,
                isThisSearching ? styles.cancelButton : styles.registerButton,
                isSearching && !isThisSearching && styles.actionButtonDisabled
              ]}
              onPress={() => (isThisSearching ? handleCancelSearch() : handleRegisterTier(item))}
              disabled={isSearching && !isThisSearching}
              activeOpacity={0.8}
            >
              <Text style={styles.actionButtonText}>
                {isThisSearching ? 'Cancel' : `?${item.tier}`}
              </Text>
            </TouchableOpacity>
          </Animated.View>
        </View>

        {/* Dropdown Prize Pool Card */}
        {isExpanded && (
          <View style={styles.prizePoolDetails}>
            <View style={styles.prizeDetailHeader}>
              <Text style={styles.prizeDetailTitle}>Winner-Takes-All Scale</Text>
            </View>
            <View style={styles.prizeRow}>
              <Text style={styles.prizeLabel}>Entry Fee:</Text>
              <Text style={styles.prizeValue}>?{item.tier} per player</Text>
            </View>
            <View style={styles.prizeRow}>
              <Text style={styles.prizeLabel}>Match Total:</Text>
              <Text style={styles.prizeValue}>?{item.tier * 2}</Text>
            </View>
            <View style={[styles.prizeRow, styles.commissionRow]}>
              <Text style={styles.prizeLabel}>Platform Fee (10%):</Text>
              <Text style={styles.prizeValue}>- ?{(item.tier * 2 * 0.1).toFixed(0)}</Text>
            </View>
            <View style={[styles.prizeRow, styles.netWinningsRow]}>
              <Text style={styles.netWinningsLabel}>Winner Payout:</Text>
              <Text style={styles.netWinningsValue}>WIN ?{item.prize}</Text>
            </View>
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Header bar */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={onBack} activeOpacity={0.7}>
          <Text style={styles.backBtnText}>? Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>LIVE BATTLE ARENA</Text>
        <View style={{ width: 60 }} />
      </View>

      {/* Tiers List */}
      <FlatList
        data={TIER_CONFIGS}
        keyExtractor={(item) => item.tier.toString()}
        renderItem={renderTierCard}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      />

      {/* Global Searching Overlay */}
      {isSearching && searchingTier && (
        <View style={styles.overlayContainer}>
          <View style={styles.overlayCard}>
            <ActivityIndicator size="large" color="#4F46E5" />
            <Text style={styles.overlayTitle}>Finding Opponent...</Text>
            <Text style={styles.overlaySubtitle}>Entry Tier: ?{searchingTier.tier}</Text>
            <Text style={styles.overlayTimer}>Estimated wait: {searchTimer}s</Text>
            <TouchableOpacity style={styles.overlayCancelBtn} onPress={handleCancelSearch} activeOpacity={0.85}>
              <Text style={styles.overlayCancelText}>Cancel Search</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3F4F6', // Crisp Premium Light Theme background
  },
  header: {
    height: 64,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderColor: '#E5E7EB',
    ...Platform.select({
      ios: { paddingTop: 10 },
    }),
  },
  backBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  backBtnText: {
    color: '#4F46E5',
    fontWeight: '700',
    fontSize: 14,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: 1,
  },
  listContent: {
    padding: 16,
    paddingBottom: 40,
  },
  cardContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    marginBottom: 14,
    padding: 16,
    shadowColor: '#475569',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.03,
    shadowRadius: 12,
    elevation: 3,
  },
  cardContainerActive: {
    borderColor: '#4F46E5',
    backgroundColor: '#F8FAFC',
  },
  mainCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  leftInfoBlock: {
    flex: 1.2,
    justifyContent: 'center',
  },
  headcountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  headcountText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
    marginLeft: 6,
  },
  dropdownToggle: {
    alignSelf: 'flex-start',
    paddingVertical: 2,
  },
  dropdownToggleText: {
    fontSize: 11,
    color: '#4F46E5',
    fontWeight: '700',
  },
  middleCapsuleBlock: {
    flex: 0.9,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  statusCapsuleWaiting: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  statusCapsuleIdle: {
    backgroundColor: '#F1F5F9',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 12,
  },
  statusCapsuleText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#D97706',
  },
  statusCapsuleTextIdle: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  pulsingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#D97706',
    marginRight: 6,
  },
  actionButton: {
    borderRadius: 14,
    height: 42,
    minWidth: 80,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 2,
  },
  registerButton: {
    backgroundColor: '#10B981',
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
  },
  cancelButton: {
    backgroundColor: '#EF4444',
    shadowColor: '#EF4444',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
  },
  actionButtonDisabled: {
    backgroundColor: '#CBD5E1',
    shadowOpacity: 0,
    elevation: 0,
  },
  actionButtonText: {
    color: '#FFFFFF',
    fontWeight: '900',
    fontSize: 13,
    letterSpacing: 0.5,
  },
  prizePoolDetails: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderColor: '#F1F5F9',
  },
  prizeDetailHeader: {
    marginBottom: 8,
  },
  prizeDetailTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  prizeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 5,
  },
  prizeLabel: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '500',
  },
  prizeValue: {
    fontSize: 12,
    color: '#0F172A',
    fontWeight: '600',
  },
  commissionRow: {
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderColor: '#F1F5F9',
  },
  netWinningsRow: {
    marginTop: 6,
    alignItems: 'center',
  },
  netWinningsLabel: {
    fontSize: 13,
    color: '#10B981',
    fontWeight: '800',
  },
  netWinningsValue: {
    fontSize: 14,
    color: '#10B981',
    fontWeight: '900',
  },
  overlayContainer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 999,
  },
  overlayCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 24,
    width: '85%',
    maxWidth: 340,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.3,
    shadowRadius: 24,
    elevation: 12,
  },
  overlayTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 16,
    marginBottom: 4,
  },
  overlaySubtitle: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '600',
    marginBottom: 8,
  },
  overlayTimer: {
    fontSize: 14,
    fontWeight: '700',
    color: '#D97706',
    backgroundColor: '#FEF3C7',
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: 12,
    marginBottom: 20,
  },
  overlayCancelBtn: {
    backgroundColor: '#EF4444',
    paddingVertical: 12,
    paddingHorizontal: 30,
    borderRadius: 14,
    width: '100%',
    alignItems: 'center',
  },
  overlayCancelText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 13,
  },
});
