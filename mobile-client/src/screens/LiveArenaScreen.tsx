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
import Svg, { Circle, Path } from 'react-native-svg';
import axios from 'axios';
import { CustomAlertModal, CustomAlertOptions } from '../components/CustomAlertModal';

import { API_SERVER_URL } from '../utils/config';

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
  { tier: 3, timeout: 13, prize: 5.4 },
  { tier: 5, timeout: 13, prize: 9.0 },
  { tier: 10, timeout: 13, prize: 18 },
  { tier: 25, timeout: 13, prize: 45 },
  { tier: 50, timeout: 13, prize: 90 },
  { tier: 100, timeout: 13, prize: 180 },
  { tier: 250, timeout: 13, prize: 450 },
  { tier: 500, timeout: 13, prize: 900 },
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

  // Inline dropdown alert state
  const [dropdownMsg, setDropdownMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const showDropdownAlert = (text: string, type: 'success' | 'error') => {
    setDropdownMsg({ text, type });
    setTimeout(() => setDropdownMsg(null), 4000);
  };

  // Custom gaming alert modal state
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

          startLocalCountdown(remaining, tierVal);
        }
      } catch (err) {
        console.error('Failed to sync queue search status:', err);
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
    
    // Check local balance
    try {
      const response = await axios.get(`${API_SERVER_URL}/api/payments/wallet/${currentUser._id}`);
      if (response.data.success) {
        const total = response.data.balances.total;
        if (total < item.tier) {
          showDropdownAlert(`Insufficient Balance! Rs. ${item.tier} required. Top up wallet in Profile.`, 'error');
          return;
        }
      }
    } catch (err) {
      console.warn('Failed to verify wallet balance before entering matchmaking queue:', err);
    }

    setSearchingTier(item);
    setIsSearching(true);

    // Scale button down feedback
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
        gameMode: 'REGULAR', // Standard Live Classic Matches
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
                {isExpanded ? 'Hide Prize Scale' : 'Show Prize Scale'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Middle: Waiting / Pulsing status capsule */}
          <View style={styles.middleCapsuleBlock}>
            {isThisSearching && (
              <View style={styles.statusCapsuleWaiting}>
                <Animated.View style={[styles.pulsingDot, { transform: [{ scale: pulseAnim }] }]} />
                <Text style={styles.statusCapsuleText}>
                  {searchTimer}s Left
                </Text>
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
                {isThisSearching ? 'Cancel' : `Rs. ${item.tier}`}
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
              <Text style={styles.prizeValue}>Rs. {item.tier} per player</Text>
            </View>
            <View style={styles.prizeRow}>
              <Text style={styles.prizeLabel}>Match Total:</Text>
              <Text style={styles.prizeValue}>Rs. {item.tier * 2}</Text>
            </View>
            <View style={[styles.prizeRow, styles.commissionRow]}>
              <Text style={styles.prizeLabel}>Platform Fee (10%):</Text>
              <Text style={styles.prizeValue}>- Rs. {(item.tier * 2 * 0.10).toFixed(1)}</Text>
            </View>
            <View style={[styles.prizeRow, styles.netWinningsRow]}>
              <Text style={styles.netWinningsLabel}>Winner Payout:</Text>
              <Text style={styles.netWinningsValue}>WIN Rs. {item.prize}</Text>
            </View>
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Luxury Header bar */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>LIVE BATTLE ARENA</Text>
      </View>

      <CustomToast
        toast={{
          visible: !!dropdownMsg,
          message: dropdownMsg?.text || '',
          type: dropdownMsg?.type || 'info',
        }}
        onDismiss={() => setDropdownMsg(null)}
      />

      {/* Screen Explanatory Tagline */}
      <View style={styles.taglineCard}>
        <Text style={styles.taglineText}>
          ⚡ Choose a cash tier entry fee to match and compete against real players. Winner takes 90% of the combined entry pool instantly!
        </Text>
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
            <Text style={styles.overlaySubtitle}>Entry Tier: Rs. {searchingTier.tier}</Text>
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
    backgroundColor: '#F8FAFC', // Crisp Premium Light Theme background (#F8FAFC)
  },
  header: {
    height: 70,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#334155',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 3,
    marginTop: Platform.OS === 'android' ? 24 : 0,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: 1,
  },
  listContent: {
    padding: 16,
    paddingBottom: 130, // Make it scrollable all the way past floating capsule bar
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
  taglineCard: {
    backgroundColor: '#EEF2FF',
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 4,
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E0E7FF',
  },
  taglineText: {
    fontSize: 12,
    color: '#4F46E5',
    fontWeight: '600',
    lineHeight: 16,
    textAlign: 'center',
  },
  dropdownAlert: {
    marginHorizontal: 16,
    marginTop: 12,
    padding: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  dropdownAlertSuccess: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  dropdownAlertError: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FEE2E2',
  },
  dropdownAlertText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#374151',
    textAlign: 'center',
  },
});
