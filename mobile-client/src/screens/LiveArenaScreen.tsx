import React, { useState, useEffect, useRef } from 'react';
import { useWallet } from '../hooks/useWallet';
import { CustomToast } from '../components/CustomToast';
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
  Alert,
} from 'react-native';
import Svg, { Circle, Path, Polyline } from 'react-native-svg';
import axios from 'axios';
import { CustomAlertModal, CustomAlertOptions } from '../components/CustomAlertModal';

import { API_SERVER_URL } from '../utils/config';

interface LiveArenaScreenProps {
  currentUser: { _id: string; username: string };
  socketId: string | null;
  onBack: () => void;
  socket: any;
  onUserUpdate?: (user: any) => void;
}

interface TierInfo {
  tier: number;
  timeout: number;
  prize: number;
  baseMockPlayers: number;
}

const TIER_CONFIGS: TierInfo[] = [
  { tier: 0, timeout: 15, prize: 0, baseMockPlayers: 42 },
  { tier: 3, timeout: 15, prize: 5, baseMockPlayers: 10 },
  { tier: 5, timeout: 15, prize: 9, baseMockPlayers: 14 },
  { tier: 10, timeout: 15, prize: 18, baseMockPlayers: 18 },
  { tier: 25, timeout: 15, prize: 45, baseMockPlayers: 8 },
  { tier: 50, timeout: 15, prize: 90, baseMockPlayers: 16 },
  { tier: 100, timeout: 15, prize: 180, baseMockPlayers: 12 },
  { tier: 250, timeout: 15, prize: 450, baseMockPlayers: 6 },
  { tier: 500, timeout: 15, prize: 900, baseMockPlayers: 9 },
  { tier: 1000, timeout: 15, prize: 1800, baseMockPlayers: 5 },
  { tier: 2000, timeout: 15, prize: 3600, baseMockPlayers: 4 },
  { tier: 3000, timeout: 15, prize: 5400, baseMockPlayers: 3 },
  { tier: 5000, timeout: 15, prize: 9000, baseMockPlayers: 6 },
  { tier: 10000, timeout: 15, prize: 18000, baseMockPlayers: 4 },
  { tier: 20000, timeout: 15, prize: 36000, baseMockPlayers: 2 },
];

export const LiveArenaScreen: React.FC<LiveArenaScreenProps> = ({
  currentUser,
  socketId,
  onBack,
  socket,
}) => {
  const [lobbyStats, setLobbyStats] = useState<Record<string, { waiting: number; playing: number }>>({});
  const [isSearching, setIsSearching] = useState(false);
  const [searchingTier, setSearchingTier] = useState<TierInfo | null>(null);
  const [searchTimer, setSearchTimer] = useState(0);

  // Live countdown timers for each tier (simulates waiting match windows)
  const [cardTimers, setCardTimers] = useState<Record<number, number>>(() => {
    const initial: Record<number, number> = {};
    TIER_CONFIGS.forEach((item) => {
      initial[item.tier] = Math.floor(Math.random() * 12) + 4; // 4s to 15s
    });
    return initial;
  });

  // Dynamic fluctuating online player counts for each tier (regularly & randomly generated)
  const [dynamicMockPlayers, setDynamicMockPlayers] = useState<Record<number, number>>(() => {
    const initial: Record<number, number> = {};
    TIER_CONFIGS.forEach((item) => {
      initial[item.tier] = item.baseMockPlayers + Math.floor(Math.random() * 7) - 3;
    });
    return initial;
  });

  // Dropdown alert state
  const [dropdownMsg, setDropdownMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const showDropdownAlert = (text: string, type: 'success' | 'error') => {
    setDropdownMsg({ text, type });
    setTimeout(() => setDropdownMsg(null), 4000);
  };

  // Custom alert modal state
  const [customAlert, setCustomAlert] = useState<CustomAlertOptions>({
    visible: false,
    title: '',
    message: '',
    type: 'info',
  });

  const showCustomAlert = (title: string, message: string, type: 'success' | 'error' | 'info' | 'wallet' = 'info') => {
    setCustomAlert({
      visible: true,
      title,
      message,
      type,
    });
  };

  // Animations
  const searchCountdownRef = useRef<NodeJS.Timeout | null>(null);
  const buttonScales = useRef<Record<number, Animated.Value>>({}).current;

  TIER_CONFIGS.forEach((item) => {
    if (!buttonScales[item.tier]) {
      buttonScales[item.tier] = new Animated.Value(1);
    }
  });

  // Ticking countdown effect for card timers (Live Bluff Timers) - Real 1s interval
  useEffect(() => {
    const timerInterval = setInterval(() => {
      setCardTimers((prev) => {
        const updated = { ...prev };
        TIER_CONFIGS.forEach((item) => {
          const current = updated[item.tier] ?? 8;
          if (current <= 1) {
            updated[item.tier] = Math.floor(Math.random() * 14) + 5; // Reset to random 5-18s
          } else {
            updated[item.tier] = current - 1;
          }
        });
        return updated;
      });
    }, 1000);

    // Randomly fluctuate online active player count every 2 seconds
    const playerFluctuationInterval = setInterval(() => {
      setDynamicMockPlayers((prev) => {
        const updated = { ...prev };
        TIER_CONFIGS.forEach((item) => {
          const current = prev[item.tier] || item.baseMockPlayers;
          const delta = Math.floor(Math.random() * 5) - 2; // -2 to +2 change
          const minPlayers = Math.max(5, item.baseMockPlayers - 5);
          const maxPlayers = item.baseMockPlayers + 18;
          updated[item.tier] = Math.min(maxPlayers, Math.max(minPlayers, current + delta));
        });
        return updated;
      });
    }, 2000);

    return () => {
      clearInterval(timerInterval);
      clearInterval(playerFluctuationInterval);
    };
  }, []);

  // Listen to Sockets LOBBY_STATE_DELTA event
  useEffect(() => {
    if (socket) {
      const handleLobbyDelta = (data: { success: boolean; delta: any }) => {
        if (data.success && data.delta) {
          setLobbyStats(data.delta);
        }
      };

      socket.on('LOBBY_STATE_DELTA', handleLobbyDelta);
      socket.emit('REQUEST_LOBBY_STATS');

      return () => {
        socket.off('LOBBY_STATE_DELTA', handleLobbyDelta);
      };
    }
  }, [socket]);

  // Check queue status on mount
  useEffect(() => {
    const checkQueueStatus = async () => {
      try {
        const response = await axios.get(`${API_SERVER_URL}/api/payments/matchmaker/status/${currentUser._id}`);
        if (response.data.success && response.data.status === 'WAITING') {
          const tierVal = response.data.tier;
          const matchedConfig = TIER_CONFIGS.find((c) => c.tier === tierVal) || TIER_CONFIGS[1];
          
          const elapsedSec = Math.floor((Date.now() - response.data.joinedAt) / 1000);
          const remaining = Math.max(0, matchedConfig.timeout - elapsedSec);
          
          setSearchingTier(matchedConfig);
          setIsSearching(true);
          setSearchTimer(remaining);

          startLocalCountdown(remaining, tierVal);
        }
      } catch (err) {
        console.warn('Failed to sync queue search status:', err);
      }
    };
    checkQueueStatus();
  }, [currentUser._id]);

  const startLocalCountdown = (initialTime: number, tierVal: number) => {
    if (searchCountdownRef.current) clearInterval(searchCountdownRef.current);
    
    let current = initialTime;
    setSearchTimer(current);

    const triggerTimeoutActions = () => {
      if (searchCountdownRef.current) {
        clearInterval(searchCountdownRef.current);
      }
      setIsSearching(false);
      setSearchingTier(null);
      axios.post(`${API_SERVER_URL}/api/payments/matchmaker/leave`, {
        userId: currentUser._id,
        entryFee: tierVal,
      }).catch(() => {});
      showCustomAlert(
        'No Opponent Found',
        'No live player was found in this tier right now. Your entry fee has been refunded to your wallet balance. Please try again!',
        'info'
      );
    };

    if (current <= 0) {
      triggerTimeoutActions();
      return;
    }

    searchCountdownRef.current = setInterval(() => {
      current--;
      setSearchTimer(current);
      if (current <= 0) {
        triggerTimeoutActions();
      }
    }, 1000);
  };

  const handleRegisterTier = async (item: TierInfo) => {
    const activeSocketId = socketId || `socket_${currentUser._id}_${Date.now()}`;
    
    if (item.tier > 0) {
      try {
        const response = await axios.get(`${API_SERVER_URL}/api/payments/wallet/${currentUser._id}`);
        if (response.data.success) {
          const total = response.data.balances.total;
          if (total < item.tier) {
            showDropdownAlert(`Insufficient Balance! ₹${item.tier} required. Top up your wallet in Profile.`, 'error');
            return;
          }
        }
      } catch (err) {
        console.warn('Failed to verify wallet balance:', err);
      }
    }

    setSearchingTier(item);
    setIsSearching(true);

    Animated.sequence([
      Animated.timing(buttonScales[item.tier], { toValue: 0.92, duration: 100, useNativeDriver: true }),
      Animated.timing(buttonScales[item.tier], { toValue: 1, duration: 150, useNativeDriver: true }),
    ]).start();

    try {
      const response = await axios.post(`${API_SERVER_URL}/api/payments/matchmaker/join`, {
        userId: currentUser._id,
        username: currentUser.username,
        socketId: activeSocketId,
        entryFee: item.tier,
        mode: 'QUICK',
      });

      if (response.data.success) {
        startLocalCountdown(item.timeout, item.tier);
      } else {
        showDropdownAlert(response.data.message || 'Failed to enter queue.', 'error');
        setIsSearching(false);
        setSearchingTier(null);
      }
    } catch (err: any) {
      showDropdownAlert(err.response?.data?.error || err.message, 'error');
      setIsSearching(false);
      setSearchingTier(null);
    }
  };

  const handleCancelSearch = async () => {
    if (!searchingTier) return;
    try {
      const response = await axios.post(`${API_SERVER_URL}/api/payments/matchmaker/leave`, {
        userId: currentUser._id,
        entryFee: searchingTier.tier,
      });

      if (response.data.success) {
        setIsSearching(false);
        setSearchingTier(null);
        if (searchCountdownRef.current) clearInterval(searchCountdownRef.current);
      } else {
        showDropdownAlert('Failed to leave matchmaking queue.', 'error');
      }
    } catch (err: any) {
      showDropdownAlert(err.response?.data?.error || err.message, 'error');
    }
  };

  const renderTierCard = ({ item }: { item: TierInfo }) => {
    const isThisSearching = isSearching && searchingTier?.tier === item.tier;
    const realStats = lobbyStats[item.tier] || { waiting: 0, playing: 0 };
    const liveBaseCount = dynamicMockPlayers[item.tier] ?? item.baseMockPlayers;
    const mockPlayers = liveBaseCount + (realStats.waiting + realStats.playing);
    const secondsLeft = cardTimers[item.tier] || 8;
    const formattedTimer = `00m ${secondsLeft < 10 ? '0' + secondsLeft : secondsLeft}s`;

    return (
      <View style={[styles.cardContainer, isThisSearching && styles.cardContainerActive]}>
        {/* Top Header Section */}
        <View style={styles.cardHeader}>
          {/* Left: Active Player Count */}
          <View style={styles.cardHeaderLeft}>
            <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <Path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <Circle cx="9" cy="7" r="4" />
              <Path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <Path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </Svg>
            <Text style={styles.mockPlayerCount}>{mockPlayers} +</Text>
          </View>

          {/* Center: 2 PLAYERS • 1 WINNER */}
          <Text style={styles.cardHeaderCenter}>2 PLAYERS • 1 WINNER</Text>

          {/* Right: QUICK 🕒 */}
          <View style={styles.cardHeaderRight}>
            <Text style={styles.quickText}>QUICK</Text>
            <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: 4 }}>
              <Circle cx="12" cy="12" r="10" />
              <Polyline points="12 6 12 12 16 14" />
            </Svg>
          </View>
        </View>

        {/* Bottom Body Section */}
        <View style={styles.cardBody}>
          {/* Left Column: PRIZE POOL */}
          <View style={styles.prizeCol}>
            <Text style={styles.colLabel}>PRIZE POOL</Text>
            <View style={styles.prizePill}>
              <Text style={styles.prizeText}>
                {item.tier === 0 ? 'FREE' : `₹${item.prize.toLocaleString('en-IN')}`}
              </Text>
            </View>
          </View>

          {/* Middle Column: COUNTDOWN TIMER */}
          <View style={styles.timerCol}>
            <View style={styles.timerPill}>
              <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 5 }}>
                <Circle cx="12" cy="12" r="10" />
                <Polyline points="12 6 12 12 16 14" />
              </Svg>
              <Text style={styles.timerText}>
                {isThisSearching ? `${searchTimer}s Left` : formattedTimer}
              </Text>
            </View>
          </View>

          {/* Right Column: ENTRY BUTTON */}
          <View style={styles.entryCol}>
            <Text style={styles.colLabel}>ENTRY</Text>
            <Animated.View style={{ transform: [{ scale: buttonScales[item.tier] || 1 }] }}>
              <TouchableOpacity
                style={[
                  styles.entryButton,
                  isThisSearching ? styles.cancelButton : styles.registerButton,
                  isSearching && !isThisSearching && styles.actionButtonDisabled
                ]}
                onPress={() => (isThisSearching ? handleCancelSearch() : handleRegisterTier(item))}
                disabled={isSearching && !isThisSearching}
                activeOpacity={0.85}
              >
                <Text style={styles.entryButtonText} numberOfLines={1} adjustsFontSizeToFit>
                  {isThisSearching ? 'Cancel' : (item.tier === 0 ? 'Free' : `₹${item.tier.toLocaleString('en-IN')}`)}
                </Text>
              </TouchableOpacity>
            </Animated.View>
          </View>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Header bar */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="#0F172A" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M19 12H5M12 19l-7-7 7-7" />
          </Svg>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>LIVE ARENA BATTLES</Text>
        <View style={{ width: 24 }} />
      </View>

      <CustomToast
        toast={{
          visible: !!dropdownMsg,
          message: dropdownMsg?.text || '',
          type: dropdownMsg?.type || 'info',
        }}
        onDismiss={() => setDropdownMsg(null)}
      />

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
            <Text style={styles.overlaySubtitle}>Entry Tier: ₹{searchingTier.tier}</Text>
            <Text style={styles.overlayTimer}>Estimated wait: {searchTimer}s</Text>
            <TouchableOpacity style={styles.overlayCancelBtn} onPress={handleCancelSearch} activeOpacity={0.85}>
              <Text style={styles.overlayCancelText}>Cancel Search</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Custom Alert Modal */}
      <CustomAlertModal
        alert={customAlert}
        onClose={() => setCustomAlert((prev) => ({ ...prev, visible: false }))}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#EEF2F6',
  },
  header: {
    height: 60,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderColor: '#CBD5E1',
    marginTop: Platform.OS === 'android' ? 24 : 0,
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: 0.5,
  },
  listContent: {
    padding: 14,
    paddingBottom: 100,
  },
  cardContainer: {
    backgroundColor: '#DDE3EA',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    marginBottom: 14,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  cardContainerActive: {
    borderColor: '#2563EB',
    backgroundColor: '#EFF6FF',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#C5D0DC',
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  cardHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  mockPlayerCount: {
    fontSize: 13,
    fontWeight: '900',
    color: '#10B981',
    marginLeft: 6,
  },
  cardHeaderCenter: {
    fontSize: 12,
    fontWeight: '900',
    fontStyle: 'italic',
    color: '#334155',
    letterSpacing: 0.5,
  },
  cardHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  quickText: {
    fontSize: 11,
    fontWeight: '900',
    fontStyle: 'italic',
    color: '#2563EB',
    letterSpacing: 0.5,
  },
  cardBody: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 14,
  },
  colLabel: {
    fontSize: 10,
    fontWeight: '800',
    fontStyle: 'italic',
    color: '#64748B',
    letterSpacing: 0.5,
    marginBottom: 4,
    textAlign: 'center',
  },
  prizeCol: {
    flex: 1,
    alignItems: 'flex-start',
  },
  prizePill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#CBD5E1',
    borderRadius: 14,
    paddingVertical: 8,
    paddingHorizontal: 14,
    minWidth: 80,
  },
  prizeText: {
    fontSize: 15,
    fontWeight: '900',
    color: '#0F172A',
    fontStyle: 'italic',
  },
  timerCol: {
    flex: 1.2,
    alignItems: 'center',
  },
  timerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EDF2F7',
    borderRadius: 18,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  timerText: {
    fontSize: 12,
    fontWeight: '800',
    fontStyle: 'italic',
    color: '#334155',
  },
  entryCol: {
    flex: 1,
    alignItems: 'flex-end',
  },
  entryButton: {
    borderRadius: 20,
    paddingVertical: 9,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 85,
  },
  registerButton: {
    backgroundColor: '#10B981',
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 3,
  },
  cancelButton: {
    backgroundColor: '#EF4444',
  },
  actionButtonDisabled: {
    backgroundColor: '#94A3B8',
    elevation: 0,
  },
  entryButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900',
    fontStyle: 'italic',
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
