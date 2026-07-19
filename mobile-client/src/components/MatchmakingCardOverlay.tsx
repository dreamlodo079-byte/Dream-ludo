import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Modal,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withSequence,
  withDelay,
  Easing,
  interpolate,
  cancelAnimation,
  runOnJS,
  SharedValue,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ─────────────────────────────────────────────
// Strict TypeScript Interface Contracts
// ─────────────────────────────────────────────

interface MatchmakingCardOverlayProps {
  /** Controls modal visibility */
  visible: boolean;
  /** Fires when user taps Cancel; parent must emit leave-queue socket request */
  onCancel: () => void;
  /** Fires after the 1000ms match-found hold completes; parent transitions to game board */
  onAnimationComplete: () => void;
  /** Set to a non-null opponent object when the server confirms MATCH_FOUND_ACK → ACTIVE */
  opponent: {
    username: string;
    avatarUrl?: string;
  } | null;
  /** Queue countdown duration; auto-cancels when it hits zero */
  durationSeconds?: number;
  /** Entry fee display for context (e.g. ₹50) */
  entryFee?: number;
}

export const MatchmakingCardOverlay: React.FC<MatchmakingCardOverlayProps> = ({
  visible,
  onCancel,
  onAnimationComplete,
  opponent,
  durationSeconds = 30,
  entryFee,
}) => {
  // ─── Local State ───────────────────────────
  const [secondsLeft, setSecondsLeft] = useState<number>(durationSeconds);
  const [phase, setPhase] = useState<'SEARCHING' | 'MATCH_FOUND'>('SEARCHING');
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ─── Reanimated Shared Values ──────────────
  const backdropOpacity = useSharedValue(0);
  const cardScale = useSharedValue(0.85);
  const cardOpacity = useSharedValue(0);

  // Radar ring animations (3 concentric pulse rings)
  const ring1Scale = useSharedValue(0.4);
  const ring1Opacity = useSharedValue(0.6);
  const ring2Scale = useSharedValue(0.4);
  const ring2Opacity = useSharedValue(0.6);
  const ring3Scale = useSharedValue(0.4);
  const ring3Opacity = useSharedValue(0.6);

  // Active spinner arc rotation
  const arcRotation = useSharedValue(0);

  // Success state animations
  const successScale = useSharedValue(0);
  const successOpacity = useSharedValue(0);
  const checkmarkScale = useSharedValue(0);

  // Searching icon gentle pulse
  const searchIconPulse = useSharedValue(1);

  // ─── Cleanup helper ────────────────────────
  const clearCountdown = useCallback(() => {
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
  }, []);

  // ─── Mount / Unmount Transitions ───────────
  useEffect(() => {
    if (visible) {
      // Reset states
      setPhase('SEARCHING');
      setSecondsLeft(durationSeconds);
      successScale.value = 0;
      successOpacity.value = 0;
      checkmarkScale.value = 0;

      // Fade in backdrop
      backdropOpacity.value = withTiming(1, { duration: 350 });

      // Spring-in the card
      cardOpacity.value = withTiming(1, { duration: 300 });
      cardScale.value = withTiming(1, {
        duration: 400,
        easing: Easing.out(Easing.back(1.15)),
      });

      // Start radar pulse rings with staggered delays
      const startRadarRing = (
        scaleVal: SharedValue<number>,
        opacityVal: SharedValue<number>,
        delayMs: number
      ) => {
        scaleVal.value = withDelay(
          delayMs,
          withRepeat(
            withTiming(1.6, { duration: 2400, easing: Easing.out(Easing.quad) }),
            -1,
            false
          )
        );
        opacityVal.value = withDelay(
          delayMs,
          withRepeat(
            withTiming(0, { duration: 2400, easing: Easing.out(Easing.quad) }),
            -1,
            false
          )
        );
      };

      startRadarRing(ring1Scale, ring1Opacity, 0);
      startRadarRing(ring2Scale, ring2Opacity, 800);
      startRadarRing(ring3Scale, ring3Opacity, 1600);

      // Start arc rotation
      arcRotation.value = withRepeat(
        withTiming(360, { duration: 1200, easing: Easing.linear }),
        -1,
        false
      );

      // Start search icon pulse
      searchIconPulse.value = withRepeat(
        withSequence(
          withTiming(1.15, { duration: 700, easing: Easing.ease }),
          withTiming(1, { duration: 700, easing: Easing.ease })
        ),
        -1,
        true
      );
    } else {
      // Fade out
      backdropOpacity.value = withTiming(0, { duration: 250 });
      cardOpacity.value = withTiming(0, { duration: 200 });
      cardScale.value = withTiming(0.85, { duration: 200 });
      clearCountdown();

      // Cancel all ring animations
      cancelAnimation(ring1Scale);
      cancelAnimation(ring1Opacity);
      cancelAnimation(ring2Scale);
      cancelAnimation(ring2Opacity);
      cancelAnimation(ring3Scale);
      cancelAnimation(ring3Opacity);
      cancelAnimation(arcRotation);
      cancelAnimation(searchIconPulse);
    }
  }, [visible]);

  // ─── Countdown Timer ───────────────────────
  useEffect(() => {
    if (!visible || opponent) {
      clearCountdown();
      return;
    }

    setSecondsLeft(durationSeconds);

    countdownRef.current = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          clearCountdown();
          onCancel();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return clearCountdown;
  }, [visible, opponent, durationSeconds, onCancel, clearCountdown]);

  // ─── Match Found Transition ────────────────
  useEffect(() => {
    if (!opponent) return;

    setPhase('MATCH_FOUND');

    // Cancel searching animations
    cancelAnimation(ring1Scale);
    cancelAnimation(ring1Opacity);
    cancelAnimation(ring2Scale);
    cancelAnimation(ring2Opacity);
    cancelAnimation(ring3Scale);
    cancelAnimation(ring3Opacity);
    cancelAnimation(arcRotation);
    cancelAnimation(searchIconPulse);

    // Fade out rings
    ring1Opacity.value = withTiming(0, { duration: 200 });
    ring2Opacity.value = withTiming(0, { duration: 200 });
    ring3Opacity.value = withTiming(0, { duration: 200 });

    // Pop-in success circle
    successOpacity.value = withTiming(1, { duration: 300 });
    successScale.value = withTiming(1, {
      duration: 400,
      easing: Easing.out(Easing.back(1.4)),
    });

    // Delayed checkmark bounce
    checkmarkScale.value = withDelay(
      200,
      withTiming(1, {
        duration: 350,
        easing: Easing.out(Easing.back(2)),
      })
    );

    // Hold for 1000ms then fire completion callback
    const holdTimer = setTimeout(() => {
      onAnimationComplete();
    }, 1000);

    return () => clearTimeout(holdTimer);
  }, [opponent]);

  // ─── Animated Styles ───────────────────────
  const animatedBackdrop = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));

  const animatedCard = useAnimatedStyle(() => ({
    opacity: cardOpacity.value,
    transform: [{ scale: cardScale.value }],
  }));

  const animatedRing1 = useAnimatedStyle(() => ({
    opacity: ring1Opacity.value,
    transform: [{ scale: ring1Scale.value }],
  }));

  const animatedRing2 = useAnimatedStyle(() => ({
    opacity: ring2Opacity.value,
    transform: [{ scale: ring2Scale.value }],
  }));

  const animatedRing3 = useAnimatedStyle(() => ({
    opacity: ring3Opacity.value,
    transform: [{ scale: ring3Scale.value }],
  }));

  const animatedArc = useAnimatedStyle(() => ({
    transform: [{ rotate: `${arcRotation.value}deg` }],
  }));

  const animatedSearchIcon = useAnimatedStyle(() => ({
    transform: [{ scale: searchIconPulse.value }],
  }));

  const animatedSuccessCircle = useAnimatedStyle(() => ({
    opacity: successOpacity.value,
    transform: [{ scale: successScale.value }],
  }));

  const animatedCheckmark = useAnimatedStyle(() => ({
    transform: [{ scale: checkmarkScale.value }],
  }));

  // ─── Render Gate ───────────────────────────
  if (!visible) return null;

  const isSearching = phase === 'SEARCHING';

  return (
    <Modal transparent visible={visible} animationType="none" statusBarTranslucent>
      <Animated.View style={[styles.backdrop, animatedBackdrop]}>
        <Animated.View style={[styles.card, animatedCard]}>

          {/* ─── Entry Fee Badge ─── */}
          {entryFee !== undefined && (
            <View style={styles.feeBadge}>
              <Text style={styles.feeBadgeText}>₹{entryFee}</Text>
            </View>
          )}

          {/* ─── Radar / Success Graphic Container ─── */}
          <View style={styles.graphicContainer}>
            {isSearching ? (
              <View style={styles.radarContainer}>
                {/* Pulse Ring 1 */}
                <Animated.View style={[styles.radarRing, styles.radarRing1, animatedRing1]} />
                {/* Pulse Ring 2 */}
                <Animated.View style={[styles.radarRing, styles.radarRing2, animatedRing2]} />
                {/* Pulse Ring 3 */}
                <Animated.View style={[styles.radarRing, styles.radarRing3, animatedRing3]} />

                {/* Spinner Track (static) */}
                <View style={styles.spinnerTrack}>
                  {/* Rotating Arc (active indicator) */}
                  <Animated.View style={[styles.spinnerArc, animatedArc]} />

                  {/* Center Search Icon */}
                  <Animated.View style={[styles.searchIconWrapper, animatedSearchIcon]}>
                    <Ionicons name="search" size={26} color="#6366F1" />
                  </Animated.View>
                </View>
              </View>
            ) : (
              <Animated.View style={[styles.successCircle, animatedSuccessCircle]}>
                <View style={styles.successInner}>
                  <Animated.View style={animatedCheckmark}>
                    <Ionicons name="checkmark-sharp" size={38} color="#10B981" />
                  </Animated.View>
                </View>
              </Animated.View>
            )}
          </View>

          {/* ─── Primary Status Text ─── */}
          <Text style={styles.primaryText}>
            {isSearching ? 'LOOKING FOR ACTIVE PLAYERS...' : 'MATCH SECURED!'}
          </Text>

          {/* ─── Secondary Description ─── */}
          <Text style={styles.secondaryText}>
            {isSearching
              ? `Starting match shortly in ${secondsLeft}s`
              : `Entering game room against ${opponent?.username || 'player'}`}
          </Text>

          {/* ─── Countdown Progress Bar ─── */}
          {isSearching && (
            <View style={styles.progressBarContainer}>
              <View
                style={[
                  styles.progressBarFill,
                  {
                    width: `${Math.max(0, (secondsLeft / durationSeconds) * 100)}%`,
                  },
                ]}
              />
            </View>
          )}

          {/* ─── Cancel Pill Button ─── */}
          {isSearching && (
            <TouchableOpacity
              onPress={onCancel}
              activeOpacity={0.7}
              style={styles.cancelButton}
            >
              <Ionicons name="close-circle-outline" size={16} color="#EF4444" style={styles.cancelIcon} />
              <Text style={styles.cancelText}>CANCEL</Text>
            </TouchableOpacity>
          )}

          {/* ─── Match Found Status Pill ─── */}
          {!isSearching && (
            <View style={styles.matchFoundPill}>
              <Ionicons name="game-controller" size={14} color="#FFFFFF" style={styles.cancelIcon} />
              <Text style={styles.matchFoundPillText}>PREPARING BOARD...</Text>
            </View>
          )}

        </Animated.View>
      </Animated.View>
    </Modal>
  );
};

// ─────────────────────────────────────────────
// Premium Light-Theme Stylesheet
// ─────────────────────────────────────────────

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    width: SCREEN_WIDTH * 0.86,
    maxWidth: 360,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    paddingTop: 36,
    paddingBottom: 28,
    paddingHorizontal: 28,
    alignItems: 'center',
    // Premium depth shadow
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.10,
    shadowRadius: 32,
    elevation: 12,
  },

  // Entry Fee Badge
  feeBadge: {
    position: 'absolute',
    top: -14,
    backgroundColor: '#4F46E5',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
    shadowColor: '#4F46E5',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  feeBadgeText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0.5,
  },

  // Radar/Spinner Graphic Container
  graphicContainer: {
    marginTop: 8,
    marginBottom: 28,
    height: 110,
    width: 110,
    justifyContent: 'center',
    alignItems: 'center',
  },
  radarContainer: {
    width: 110,
    height: 110,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Concentric radar pulse rings
  radarRing: {
    position: 'absolute',
    borderRadius: 999,
    borderWidth: 1.5,
  },
  radarRing1: {
    width: 90,
    height: 90,
    borderColor: '#C7D2FE', // Indigo-200
  },
  radarRing2: {
    width: 90,
    height: 90,
    borderColor: '#A5B4FC', // Indigo-300
  },
  radarRing3: {
    width: 90,
    height: 90,
    borderColor: '#818CF8', // Indigo-400
  },

  // Spinner track circle
  spinnerTrack: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 3.5,
    borderColor: '#EEF2FF', // Indigo-50 soft track
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FAFAFF',
  },

  // Rotating arc indicator overlay
  spinnerArc: {
    position: 'absolute',
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 3.5,
    borderColor: 'transparent',
    borderTopColor: '#6366F1',  // Indigo-500 active line
    borderRightColor: '#818CF8', // Indigo-400 gradient tail
  },

  // Center search icon
  searchIconWrapper: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Success state circles
  successCircle: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: '#D1FAE5', // Emerald-100
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#6EE7B7', // Emerald-300
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 4,
  },
  successInner: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },

  // Typography
  primaryText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#1E293B',
    textAlign: 'center',
    marginBottom: 6,
    letterSpacing: 0.8,
  },
  secondaryText: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 18,
  },

  // Countdown progress bar
  progressBarContainer: {
    width: '100%',
    height: 4,
    backgroundColor: '#F1F5F9',
    borderRadius: 2,
    marginBottom: 20,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#6366F1',
    borderRadius: 2,
  },

  // Cancel pill button
  cancelButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FEF2F2',
    paddingVertical: 11,
    paddingHorizontal: 32,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#FEE2E2',
  },
  cancelIcon: {
    marginRight: 6,
  },
  cancelText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#EF4444',
    letterSpacing: 1.2,
  },

  // Match found status pill
  matchFoundPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#10B981',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 24,
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  matchFoundPillText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 1.2,
  },
});
