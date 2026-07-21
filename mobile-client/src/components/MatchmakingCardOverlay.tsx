import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Modal,
  Image,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withSequence,
  withDelay,
  Easing,
  cancelAnimation,
  interpolate,
  Extrapolation,
  runOnJS,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ─────────────────────────────────────────────
// Strict TypeScript Component Props Interface
// ─────────────────────────────────────────────

export interface MatchmakingCardOverlayProps {
  /** Controls modal visibility */
  visible: boolean;
  /** Fires when user taps Cancel button or countdown expires */
  onCancel: () => void;
  /** Fires after 1200ms success hold sequence completes */
  onAnimationComplete: () => void;
  /** Logged-in user profile details */
  currentUser?: {
    username: string;
    avatarUrl?: string;
  };
  /** Opponent profile object when match is secured */
  opponent?: {
    username: string;
    avatarUrl?: string;
  } | null;
  /** Queue ticker duration in seconds (default 13s) */
  durationSeconds?: number;
  /** Entry fee amount for top badge display */
  entryFee?: number;
}

export const MatchmakingCardOverlay: React.FC<MatchmakingCardOverlayProps> = ({
  visible,
  onCancel,
  onAnimationComplete,
  currentUser = { username: 'You' },
  opponent = null,
  durationSeconds = 13,
  entryFee,
}) => {
  // ─── Local State ───────────────────────────
  const [secondsLeft, setSecondsLeft] = useState<number>(durationSeconds);
  const [isSuccess, setIsSuccess] = useState<boolean>(false);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ─── Reanimated Shared Values ──────────────
  const backdropOpacity = useSharedValue(0);
  const cardTranslateY = useSharedValue(200);
  const cardScale = useSharedValue(0.9);

  // Radar continuous 360-degree rotation (1500ms per revolution)
  const radarRotation = useSharedValue(0);

  // Dynamic simulated player dots (pop-in and orbit)
  const dot1Opacity = useSharedValue(0);
  const dot1Scale = useSharedValue(0);
  const dot2Opacity = useSharedValue(0);
  const dot2Scale = useSharedValue(0);
  const dot3Opacity = useSharedValue(0);
  const dot3Scale = useSharedValue(0);

  // VS Matchup layout transition progress (0 = Radar Searching, 1 = VS Locked)
  const vsProgress = useSharedValue(0);

  // Helper function to clear countdown interval safely
  const clearTimer = useCallback(() => {
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
  }, []);

  // ─── 1. Mount / Unmount Animation Setup ────
  useEffect(() => {
    if (visible) {
      setIsSuccess(false);
      setSecondsLeft(durationSeconds);
      vsProgress.value = 0;

      // Backdrop & Card Slide Up
      backdropOpacity.value = withTiming(1, { duration: 250 });
      cardTranslateY.value = withTiming(0, {
        duration: 350,
        easing: Easing.out(Easing.back(1.1)),
      });
      cardScale.value = withTiming(1, { duration: 350 });

      // Start continuous radar sweep rotation (1500ms loop)
      radarRotation.value = 0;
      radarRotation.value = withRepeat(
        withTiming(360, { duration: 1500, easing: Easing.linear }),
        -1,
        false
      );

      // Start simulated online player pop-in dot loop
      dot1Scale.value = withDelay(
        800,
        withRepeat(
          withSequence(
            withTiming(1, { duration: 400 }),
            withTiming(1.2, { duration: 600 }),
            withTiming(0, { duration: 400 })
          ),
          -1,
          true
        )
      );
      dot1Opacity.value = withDelay(
        800,
        withRepeat(
          withSequence(
            withTiming(1, { duration: 400 }),
            withTiming(0.8, { duration: 600 }),
            withTiming(0, { duration: 400 })
          ),
          -1,
          true
        )
      );

      dot2Scale.value = withDelay(1800,
        withRepeat(
          withSequence(
            withTiming(1, { duration: 400 }),
            withTiming(1.2, { duration: 600 }),
            withTiming(0, { duration: 400 })
          ),
          -1,
          true
        )
      );
      dot2Opacity.value = withDelay(1800,
        withRepeat(
          withSequence(
            withTiming(1, { duration: 400 }),
            withTiming(0.8, { duration: 600 }),
            withTiming(0, { duration: 400 })
          ),
          -1,
          true
        )
      );

      dot3Scale.value = withDelay(2800,
        withRepeat(
          withSequence(
            withTiming(1, { duration: 400 }),
            withTiming(1.2, { duration: 600 }),
            withTiming(0, { duration: 400 })
          ),
          -1,
          true
        )
      );
      dot3Opacity.value = withDelay(2800,
        withRepeat(
          withSequence(
            withTiming(1, { duration: 400 }),
            withTiming(0.8, { duration: 600 }),
            withTiming(0, { duration: 400 })
          ),
          -1,
          true
        )
      );

    } else {
      backdropOpacity.value = withTiming(0, { duration: 200 });
      cardTranslateY.value = withTiming(200, { duration: 200 });
      cardScale.value = withTiming(0.9, { duration: 200 });

      // Cancel active loops
      cancelAnimation(radarRotation);
      cancelAnimation(dot1Scale);
      cancelAnimation(dot1Opacity);
      cancelAnimation(dot2Scale);
      cancelAnimation(dot2Opacity);
      cancelAnimation(dot3Scale);
      cancelAnimation(dot3Opacity);
      clearTimer();
    }
  }, [visible, durationSeconds]);

  // ─── 2. Functional Ticker & Grace Period Auto-Cancel Logic 
  useEffect(() => {
    if (!visible || opponent) {
      clearTimer();
      return;
    }

    setSecondsLeft(durationSeconds);

    countdownRef.current = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          clearTimer();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return clearTimer;
  }, [visible, opponent, durationSeconds, clearTimer]);

  useEffect(() => {
    if (secondsLeft <= 0 && visible && !opponent && !isSuccess) {
      // 2-second grace period to allow the server-side matchmaking loop to inject a bot
      const graceTimeout = setTimeout(() => {
        if (!opponent && !isSuccess && visible) {
          handleCancelTap();
        }
      }, 2000);
      return () => clearTimeout(graceTimeout);
    }
  }, [secondsLeft, visible, opponent, isSuccess]);

  // ─── 3. Match Secured Split-Snap VS Reveal ─
  const onAnimCompleteRef = useRef(onAnimationComplete);
  useEffect(() => {
    onAnimCompleteRef.current = onAnimationComplete;
  }, [onAnimationComplete]);

  useEffect(() => {
    if (opponent) {
      setIsSuccess(true);

      // Stop radar rotation & simulated dot loops
      cancelAnimation(radarRotation);
      cancelAnimation(dot1Scale);
      cancelAnimation(dot2Scale);
      cancelAnimation(dot3Scale);

      // Snap transition from Radar to VS Matchup view (400ms spring-back)
      vsProgress.value = withTiming(1, {
        duration: 450,
        easing: Easing.out(Easing.back(1.2)),
      });

      // Hold visual for 1200ms before unmounting to launch GameScreen
      const holdTimer = setTimeout(() => {
        onAnimCompleteRef.current();
      }, 1200);

      return () => clearTimeout(holdTimer);
    }
  }, [opponent]);

  // Handle Cancel Button Tap with Slide-Down Exit
  const handleCancelTap = () => {
    clearTimer();
    cardTranslateY.value = withTiming(250, { duration: 200 }, (finished) => {
      if (finished && typeof onCancel === 'function') {
        runOnJS(onCancel)();
      }
    });
    // Fire JS callback immediately to unmount/leave queue if needed
    if (typeof onCancel === 'function') {
      onCancel();
    }
  };

  // Helper for Initials
  const getInitials = (name: string) => {
    if (!name) return 'P1';
    return name.slice(0, 2).toUpperCase();
  };

  // ─── Reanimated Animated Styles ───────────
  const animatedBackdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));

  const animatedCardStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
    transform: [
      { translateY: cardTranslateY.value },
      { scale: cardScale.value },
    ],
  }));

  const animatedSweepStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${radarRotation.value}deg` }],
  }));

  const animatedDot1Style = useAnimatedStyle(() => ({
    opacity: dot1Opacity.value,
    transform: [{ scale: dot1Scale.value }],
  }));

  const animatedDot2Style = useAnimatedStyle(() => ({
    opacity: dot2Opacity.value,
    transform: [{ scale: dot2Scale.value }],
  }));

  const animatedDot3Style = useAnimatedStyle(() => ({
    opacity: dot3Opacity.value,
    transform: [{ scale: dot3Scale.value }],
  }));

  // Morph styles between Radar (0) and VS Layout (1)
  const radarContainerStyle = useAnimatedStyle(() => ({
    opacity: interpolate(vsProgress.value, [0, 0.5], [1, 0], Extrapolation.CLAMP),
    transform: [{ scale: interpolate(vsProgress.value, [0, 1], [1, 0.6], Extrapolation.CLAMP) }],
    display: vsProgress.value >= 0.9 ? 'none' : 'flex',
  }));

  const vsContainerStyle = useAnimatedStyle(() => ({
    opacity: interpolate(vsProgress.value, [0.3, 1], [0, 1], Extrapolation.CLAMP),
    transform: [{ scale: interpolate(vsProgress.value, [0, 1], [0.7, 1], Extrapolation.CLAMP) }],
    display: vsProgress.value < 0.1 ? 'none' : 'flex',
  }));

  if (!visible) return null;

  return (
    <Modal transparent visible={visible} animationType="none" statusBarTranslucent>
      <Animated.View style={[styles.backdrop, animatedBackdropStyle]}>
        <Animated.View style={[styles.card, animatedCardStyle]}>
          
          {/* Top Entry Fee Badge */}
          {entryFee !== undefined && entryFee > 0 && (
            <View style={styles.feeBadge}>
              <Text style={styles.feeBadgeText}>MATCH ENTRY: ₹{entryFee}</Text>
            </View>
          )}

          {/* Graphic Area Container */}
          <View style={styles.graphicContainer}>

            {/* A. Radar Search Matrix (Phase 1: Searching) */}
            <Animated.View style={[styles.radarMatrixWrapper, radarContainerStyle]}>
              {/* Outer Thin Lavender Track */}
              <View style={styles.radarOuterTrack}>
                {/* Simulated Online Player Dot 1 */}
                <Animated.View style={[styles.onlineDot, styles.dotPos1, animatedDot1Style]} />
                {/* Simulated Online Player Dot 2 */}
                <Animated.View style={[styles.onlineDot, styles.dotPos2, animatedDot2Style]} />

                {/* Inner Thin Lavender Track */}
                <View style={styles.radarInnerTrack}>
                  {/* Simulated Online Player Dot 3 */}
                  <Animated.View style={[styles.onlineDot, styles.dotPos3, animatedDot3Style]} />

                  {/* 360-Degree Rotating Gradient Radar Sweep Arc */}
                  <Animated.View style={[styles.sweepLineArc, animatedSweepStyle]} />
                </View>
              </View>
            </Animated.View>

            {/* B. Side-by-Side VS Matchup Layout (Phase 2: Match Secured) */}
            <Animated.View style={[styles.vsMatchupWrapper, vsContainerStyle]}>
              {/* Current User Node */}
              <View style={styles.playerNode}>
                <View style={[styles.avatarBorder, styles.userBorder]}>
                  {currentUser?.avatarUrl ? (
                    <Image source={{ uri: currentUser.avatarUrl }} style={styles.avatarImg} />
                  ) : (
                    <View style={[styles.avatarFallback, styles.userFallback]}>
                      <Text style={styles.fallbackText}>{getInitials(currentUser?.username || 'You')}</Text>
                    </View>
                  )}
                </View>
                <View style={styles.userBadgePill}>
                  <Text style={styles.userBadgeText}>YOU</Text>
                </View>
                <Text style={styles.playerNameText} numberOfLines={1}>
                  {currentUser?.username || 'You'}
                </Text>
              </View>

              {/* Center Golden VS Badge */}
              <View style={styles.vsBadgeCircle}>
                <Text style={styles.vsBadgeText}>VS</Text>
              </View>

              {/* Locked Opponent Node */}
              <View style={styles.playerNode}>
                <View style={[styles.avatarBorder, styles.opponentBorder]}>
                  {opponent?.avatarUrl ? (
                    <Image source={{ uri: opponent.avatarUrl }} style={styles.avatarImg} />
                  ) : (
                    <View style={[styles.avatarFallback, styles.opponentFallback]}>
                      <Text style={styles.fallbackText}>{getInitials(opponent?.username || 'OP')}</Text>
                    </View>
                  )}
                </View>
                <View style={styles.opponentBadgePill}>
                  <Text style={styles.opponentBadgeText}>FOUND</Text>
                </View>
                <Text style={styles.playerNameText} numberOfLines={1}>
                  {opponent?.username || 'Opponent'}
                </Text>
              </View>
            </Animated.View>

          </View>

          {/* Primary Status Typography */}
          <Text style={[styles.primaryTitleText, isSuccess && styles.successTitleText]}>
            {isSuccess ? 'MATCH FIXED! ALLOCATING ARENA...' : 'LOOKING FOR ACTIVE PLAYERS...'}
          </Text>

          {/* Subtitle Ticker String */}
          <Text style={styles.secondarySubtitleText}>
            {isSuccess
              ? `Entering game room against ${opponent?.username || 'player'}`
              : `Starting match shortly in ${secondsLeft}s`}
          </Text>

          {/* Crimson Pill Cancel Button */}
          {!isSuccess && (
            <TouchableOpacity
              onPress={handleCancelTap}
              activeOpacity={0.75}
              style={styles.cancelPillButton}
            >
              <Text style={styles.cancelPillText}>CANCEL</Text>
            </TouchableOpacity>
          )}

          {/* Success Allocation Pill */}
          {isSuccess && (
            <View style={styles.matchFixedPill}>
              <Ionicons name="flash" size={14} color="#FFFFFF" style={{ marginRight: 6 }} />
              <Text style={styles.matchFixedPillText}>LAUNCHING BOARD...</Text>
            </View>
          )}

        </Animated.View>
      </Animated.View>
    </Modal>
  );
};

// ─────────────────────────────────────────────
// High-Fidelity Light-Theme Stylesheet
// ─────────────────────────────────────────────

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)', // Semi-transparent dark slate backdrop
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    width: SCREEN_WIDTH * 0.86,
    maxWidth: 350,
    backgroundColor: '#FFFFFF', // Elevated white card panel
    borderRadius: 24,
    paddingTop: 36,
    paddingBottom: 28,
    paddingHorizontal: 20,
    alignItems: 'center',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.12,
    shadowRadius: 28,
    elevation: 10,
  },

  feeBadge: {
    position: 'absolute',
    top: -14,
    backgroundColor: '#4F46E5', // Indigo top badge
    paddingHorizontal: 16,
    paddingVertical: 5,
    borderRadius: 14,
    shadowColor: '#4F46E5',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 4,
  },
  feeBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.5,
  },

  graphicContainer: {
    height: 155,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },

  // ─── Radar Searching Matrix Layout ───────
  radarMatrixWrapper: {
    width: 150,
    height: 150,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'absolute',
  },
  radarOuterTrack: {
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 2,
    borderColor: 'rgba(199, 210, 254, 0.75)', // Soft lavender track (#C7D2FE)
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  radarInnerTrack: {
    width: 94,
    height: 94,
    borderRadius: 47,
    borderWidth: 2,
    borderColor: 'rgba(224, 231, 255, 0.9)', // Lighter inner track (#E0E7FF)
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  sweepLineArc: {
    position: 'absolute',
    width: 94,
    height: 94,
    borderRadius: 47,
    borderWidth: 3.5,
    borderColor: 'transparent',
    borderTopColor: '#4F46E5', // Active gradient sweep arc line
    borderRightColor: 'rgba(79, 70, 229, 0.4)',
  },

  // Simulated Glowing Online Player Dots
  onlineDot: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#6366F1',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.6,
    shadowRadius: 4,
    elevation: 3,
  },
  dotPos1: {
    top: 6,
    right: 22,
  },
  dotPos2: {
    bottom: 18,
    left: 10,
  },
  dotPos3: {
    top: 10,
    left: 12,
  },

  // ─── Side-by-Side VS Matchup Layout ───────
  vsMatchupWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    paddingHorizontal: 10,
    position: 'absolute',
  },
  playerNode: {
    alignItems: 'center',
    width: 95,
  },
  avatarBorder: {
    width: 76,
    height: 76,
    borderRadius: 38,
    padding: 3,
    backgroundColor: '#FFFFFF',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  userBorder: {
    borderWidth: 2.5,
    borderColor: '#3B82F6', // Blue border for current user
  },
  opponentBorder: {
    borderWidth: 2.5,
    borderColor: '#10B981', // Emerald green border for found opponent
  },
  avatarImg: {
    width: '100%',
    height: '100%',
    borderRadius: 35,
  },
  avatarFallback: {
    width: '100%',
    height: '100%',
    borderRadius: 35,
    justifyContent: 'center',
    alignItems: 'center',
  },
  userFallback: {
    backgroundColor: '#DBEAFE',
  },
  opponentFallback: {
    backgroundColor: '#D1FAE5',
  },
  fallbackText: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1E293B',
  },
  userBadgePill: {
    position: 'absolute',
    bottom: 22,
    backgroundColor: '#1E293B',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FFFFFF',
  },
  userBadgeText: {
    color: '#FFFFFF',
    fontSize: 8,
    fontWeight: '900',
  },
  opponentBadgePill: {
    position: 'absolute',
    bottom: 22,
    backgroundColor: '#10B981',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FFFFFF',
  },
  opponentBadgeText: {
    color: '#FFFFFF',
    fontSize: 8,
    fontWeight: '900',
  },
  playerNameText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#1E293B',
    marginTop: 10,
    textAlign: 'center',
    width: '100%',
  },

  // Golden Center VS Badge
  vsBadgeCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#FEF3C7', // Gold background
    borderWidth: 2,
    borderColor: '#F59E0B',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#F59E0B',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 3,
  },
  vsBadgeText: {
    fontSize: 14,
    fontWeight: '900',
    color: '#B45309', // Deep gold text
    letterSpacing: 0.5,
  },

  // Typography
  primaryTitleText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#1E293B',
    textAlign: 'center',
    letterSpacing: 0.5,
    marginTop: 8,
  },
  successTitleText: {
    color: '#10B981', // Emerald green text on match fixed
  },
  secondarySubtitleText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#64748B',
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 24,
  },

  // Crimson Pill Cancel Button
  cancelPillButton: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FEE2E2',
    borderWidth: 1,
    paddingVertical: 11,
    paddingHorizontal: 36,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelPillText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#EF4444',
    letterSpacing: 1.2,
  },

  // Match Fixed Allocation Banner Pill
  matchFixedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#10B981',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 20,
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 4,
  },
  matchFixedPillText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1,
  },
});
