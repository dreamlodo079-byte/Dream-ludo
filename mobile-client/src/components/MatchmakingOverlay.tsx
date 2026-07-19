import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity, Dimensions } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  Easing,
  withSequence,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';

const { width, height } = Dimensions.get('window');

interface MatchmakingOverlayProps {
  visible: boolean;
  currentUser: {
    username: string;
    avatarUrl?: string;
  };
  opponent: {
    username: string;
    avatarUrl?: string;
  } | null;
  onCancel: () => void;
  onAnimationComplete: () => void;
  durationSeconds?: number;
}

export const MatchmakingOverlay: React.FC<MatchmakingOverlayProps> = ({
  visible,
  currentUser,
  opponent,
  onCancel,
  onAnimationComplete,
  durationSeconds = 30,
}) => {
  const [secondsLeft, setSecondsLeft] = useState(durationSeconds);

  // Reanimated shared values
  const overlayOpacity = useSharedValue(0);
  const searchOpacity = useSharedValue(1);
  const searchScale = useSharedValue(1);
  const opponentOpacity = useSharedValue(0);
  const opponentScale = useSharedValue(0);
  const rotation = useSharedValue(0);
  const pulseScale = useSharedValue(1);

  // Infinite rotate animation for the searching dashed ring
  useEffect(() => {
    rotation.value = withRepeat(
      withTiming(360, {
        duration: 4000,
        easing: Easing.linear,
      }),
      -1,
      false
    );
  }, []);

  // Soft pulse for the "VS" text and center node
  useEffect(() => {
    pulseScale.value = withRepeat(
      withSequence(
        withTiming(1.05, { duration: 800, easing: Easing.ease }),
        withTiming(1.0, { duration: 800, easing: Easing.ease })
      ),
      -1,
      true
    );
  }, []);

  // Handle overlay mount/unmount fade
  useEffect(() => {
    if (visible) {
      overlayOpacity.value = withTiming(1, { duration: 400 });
      setSecondsLeft(durationSeconds);
    } else {
      overlayOpacity.value = withTiming(0, { duration: 300 });
    }
  }, [visible, durationSeconds]);

  // Handle ticking countdown timer
  useEffect(() => {
    if (!visible || opponent) return;

    if (secondsLeft <= 0) {
      onCancel();
      return;
    }

    const interval = setInterval(() => {
      setSecondsLeft((prev) => prev - 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [secondsLeft, visible, opponent, onCancel]);

  // Handle opponent found transitions and hold state (1500ms Gate)
  useEffect(() => {
    if (opponent) {
      // 1. Fade out the searching placeholder
      searchOpacity.value = withTiming(0, { duration: 300 });
      searchScale.value = withTiming(0.8, { duration: 300 });

      // 2. Scale & fade in the loaded opponent avatar
      opponentOpacity.value = withTiming(1, { duration: 500 });
      opponentScale.value = withTiming(1, {
        duration: 500,
        easing: Easing.out(Easing.back(1.5)),
      });

      // 3. Keep showing the locked VS screen state for 1500ms before transition complete
      const transitionTimer = setTimeout(() => {
        onAnimationComplete();
      }, 1500);

      return () => clearTimeout(transitionTimer);
    } else {
      // Reset values if searching is active/reset
      searchOpacity.value = 1;
      searchScale.value = 1;
      opponentOpacity.value = 0;
      opponentScale.value = 0;
    }
  }, [opponent, onAnimationComplete]);

  // Animated styles mapping
  const animatedOverlayStyle = useAnimatedStyle(() => {
    return {
      opacity: overlayOpacity.value,
    };
  });

  const animatedRingStyle = useAnimatedStyle(() => {
    return {
      transform: [{ rotate: `${rotation.value}deg` }],
    };
  });

  const animatedVSStyle = useAnimatedStyle(() => {
    return {
      transform: [{ scale: pulseScale.value }],
    };
  });

  const animatedSearchStyle = useAnimatedStyle(() => {
    return {
      opacity: searchOpacity.value,
      transform: [{ scale: searchScale.value }],
    };
  });

  const animatedOpponentStyle = useAnimatedStyle(() => {
    return {
      opacity: opponentOpacity.value,
      transform: [{ scale: opponentScale.value }],
    };
  });

  if (!visible) return null;

  // Initials generator helper for fallback avatar representation
  const getInitials = (name: string) => {
    if (!name) return 'OP';
    return name.slice(0, 2).toUpperCase();
  };

  return (
    <Animated.View style={[styles.overlay, animatedOverlayStyle]}>
      {/* Visual background pattern circles */}
      <View style={styles.bgBlobLeft} />
      <View style={styles.bgBlobRight} />

      <View style={styles.contentContainer}>
        {/* VS Layout Grid Area */}
        <View style={styles.versusContainer}>
          {/* Active Local Player Node */}
          <View style={styles.avatarWrapper}>
            <View style={[styles.avatarRing, styles.activeUserRing]}>
              {currentUser.avatarUrl ? (
                <Image source={{ uri: currentUser.avatarUrl }} style={styles.avatarImage} />
              ) : (
                <View style={[styles.avatarFallback, styles.activeFallback]}>
                  <Text style={styles.fallbackText}>{getInitials(currentUser.username)}</Text>
                </View>
              )}
            </View>
            <View style={[styles.badge, styles.activeBadge]}>
              <Text style={styles.badgeText}>YOU</Text>
            </View>
            <Text style={styles.usernameText} numberOfLines={1}>
              {currentUser.username}
            </Text>
          </View>

          {/* VS Center Marker */}
          <Animated.View style={[styles.vsMarkerContainer, animatedVSStyle]}>
            <View style={styles.vsLine} />
            <View style={styles.vsCircle}>
              <Text style={styles.vsText}>VS</Text>
            </View>
            <View style={styles.vsLine} />
          </Animated.View>

          {/* Opponent Player Node */}
          <View style={styles.avatarWrapper}>
            {/* Case A: Searching state active (opponent is null) */}
            <Animated.View style={[styles.absoluteSearchContainer, animatedSearchStyle]}>
              <Animated.View style={[styles.searchingRing, animatedRingStyle]} />
              <View style={styles.silhouetteContainer}>
                <Ionicons name="person" size={40} color="#94A3B8" />
              </View>
              <View style={[styles.badge, styles.searchingBadge]}>
                <Text style={styles.searchingBadgeText}>SEARCHING...</Text>
              </View>
              <Text style={styles.searchingLabelText}>Opponent</Text>
            </Animated.View>

            {/* Case B: Opponent found and locked (opponent is loaded) */}
            <Animated.View style={[styles.opponentActiveContainer, animatedOpponentStyle]}>
              <View style={[styles.avatarRing, styles.foundUserRing]}>
                {opponent?.avatarUrl ? (
                  <Image source={{ uri: opponent.avatarUrl }} style={styles.avatarImage} />
                ) : (
                  <View style={[styles.avatarFallback, styles.foundFallback]}>
                    <Text style={styles.fallbackText}>{getInitials(opponent?.username || '')}</Text>
                  </View>
                )}
              </View>
              <View style={[styles.badge, styles.foundBadge]}>
                <Text style={styles.badgeText}>FOUND</Text>
              </View>
              <Text style={styles.usernameText} numberOfLines={1}>
                {opponent?.username}
              </Text>
            </Animated.View>
          </View>
        </View>

        {/* Dynamic Status / Countdown clock Section */}
        <View style={styles.statusContainer}>
          <Text style={styles.statusTitle}>
            {opponent ? 'OPPONENT SECURED!' : 'SEARCHING FOR OPPONENTS...'}
          </Text>

          {/* Premium Countdown Clock */}
          {!opponent && (
            <View style={styles.timerPill}>
              <Ionicons name="time" size={16} color="#FFFFFF" style={styles.timerIcon} />
              <Text style={styles.timerText}>{secondsLeft}s</Text>
            </View>
          )}

          {opponent && (
            <View style={[styles.timerPill, styles.matchFoundPill]}>
              <Ionicons name="checkmark-circle" size={16} color="#FFFFFF" style={styles.timerIcon} />
              <Text style={styles.timerText}>Starting Match</Text>
            </View>
          )}

          <Text style={styles.microCancelText}>
            {opponent ? 'PREPARING ACTIVE GAME CANVAS...' : 'AUTO-CANCEL IF NO OPPONENT FOUND'}
          </Text>
        </View>

        {/* Cancel Button Option */}
        {!opponent && (
          <TouchableOpacity style={styles.cancelBtn} onPress={onCancel} activeOpacity={0.7}>
            <Ionicons name="close-circle" size={18} color="#64748B" />
            <Text style={styles.cancelBtnText}>Cancel Search</Text>
          </TouchableOpacity>
        )}
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#F8FAFC',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
  },
  contentContainer: {
    width: '100%',
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  bgBlobLeft: {
    position: 'absolute',
    left: -100,
    top: height * 0.15,
    width: 250,
    height: 250,
    borderRadius: 125,
    backgroundColor: '#EFF6FF',
    opacity: 0.8,
    zIndex: -1,
  },
  bgBlobRight: {
    position: 'absolute',
    right: -100,
    bottom: height * 0.2,
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: '#ECFDF5',
    opacity: 0.8,
    zIndex: -1,
  },
  versusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    maxWidth: 360,
    height: 180,
    marginBottom: 48,
  },
  avatarWrapper: {
    width: 110,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  avatarRing: {
    width: 90,
    height: 90,
    borderRadius: 45,
    padding: 3,
    backgroundColor: '#FFFFFF',
    shadowColor: '#64748B',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 6,
  },
  activeUserRing: {
    borderWidth: 2,
    borderColor: '#3B82F6', // Blue Accent
  },
  foundUserRing: {
    borderWidth: 2,
    borderColor: '#10B981', // Emerald success ring
  },
  avatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: 42,
  },
  avatarFallback: {
    width: '100%',
    height: '100%',
    borderRadius: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeFallback: {
    backgroundColor: '#DBEAFE',
  },
  foundFallback: {
    backgroundColor: '#D1FAE5',
  },
  fallbackText: {
    fontSize: 24,
    fontWeight: '800',
    color: '#1E293B',
  },
  badge: {
    position: 'absolute',
    bottom: 34,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 3,
  },
  activeBadge: {
    backgroundColor: '#1E293B', // Dark slate badge
  },
  foundBadge: {
    backgroundColor: '#10B981', // Emerald badge
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  usernameText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 12,
    width: '100%',
    textAlign: 'center',
  },
  // Center VS Marker
  vsMarkerContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  vsLine: {
    width: 2,
    height: 35,
    backgroundColor: '#E2E8F0',
  },
  vsCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F1F5F9',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 8,
    shadowColor: '#64748B',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  vsText: {
    fontSize: 15,
    fontWeight: '900',
    color: '#1E293B',
  },
  // Searching placeholder states
  absoluteSearchContainer: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    height: '100%',
  },
  searchingRing: {
    position: 'absolute',
    top: 15,
    width: 90,
    height: 90,
    borderRadius: 45,
    borderWidth: 2,
    borderColor: '#94A3B8',
    borderStyle: 'dashed',
  },
  silhouetteContainer: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  searchingBadge: {
    backgroundColor: '#E2E8F0',
    borderColor: '#FFFFFF',
  },
  searchingBadgeText: {
    color: '#475569',
    fontSize: 7.5,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  searchingLabelText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#94A3B8',
    marginTop: 12,
  },
  opponentActiveContainer: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    height: '100%',
  },
  // Status and countdown timer section
  statusContainer: {
    alignItems: 'center',
    marginBottom: 40,
  },
  statusTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#475569',
    letterSpacing: 1.5,
    marginBottom: 16,
    textAlign: 'center',
  },
  timerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B', // Slate dark background
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 24,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  matchFoundPill: {
    backgroundColor: '#10B981', // green pill on opponent found
  },
  timerIcon: {
    marginRight: 6,
  },
  timerText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  microCancelText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
    letterSpacing: 1.0,
    marginTop: 14,
  },
  // Cancel matchmaking button styling
  cancelBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 20,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  cancelBtnText: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '700',
    marginLeft: 6,
  },
});
