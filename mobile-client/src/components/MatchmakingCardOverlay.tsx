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

// Helper function to pick random (x, y) coordinates inside radar circle disk (keeping distance 34px to 54px from center core)
const getRandomRadarCoords = (minRadius = 34, maxRadius = 54) => {
  const angle = Math.random() * 2 * Math.PI;
  const r = minRadius + Math.random() * (maxRadius - minRadius);
  return {
    x: Math.round(r * Math.cos(angle)),
    y: Math.round(r * Math.sin(angle)),
  };
};

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

  // Sonar Radar expanding pulse waves (radiating outwards & fading)
  const wave1Scale = useSharedValue(0.15);
  const wave1Opacity = useSharedValue(0.85);
  const wave2Scale = useSharedValue(0.15);
  const wave2Opacity = useSharedValue(0.85);
  const wave3Scale = useSharedValue(0.15);
  const wave3Opacity = useSharedValue(0.85);

  // Dynamic teeming online player dots (opacity, scale, and random (x,y) positions)
  const dot1Opacity = useSharedValue(0);
  const dot1Scale = useSharedValue(0);
  const dot1X = useSharedValue(25);
  const dot1Y = useSharedValue(-25);

  const dot2Opacity = useSharedValue(0);
  const dot2Scale = useSharedValue(0);
  const dot2X = useSharedValue(-28);
  const dot2Y = useSharedValue(24);

  const dot3Opacity = useSharedValue(0);
  const dot3Scale = useSharedValue(0);
  const dot3X = useSharedValue(-26);
  const dot3Y = useSharedValue(-28);

  // Helper to re-randomize dot coordinates between pings
  const relocateDot = useCallback((dotIndex: 1 | 2 | 3) => {
    const coords = getRandomRadarCoords(52);
    if (dotIndex === 1) {
      dot1X.value = coords.x;
      dot1Y.value = coords.y;
    } else if (dotIndex === 2) {
      dot2X.value = coords.x;
      dot2Y.value = coords.y;
    } else if (dotIndex === 3) {
      dot3X.value = coords.x;
      dot3Y.value = coords.y;
    }
  }, []);

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

      // Initialize random spot coordinates
      relocateDot(1);
      relocateDot(2);
      relocateDot(3);

      // Backdrop & Card Slide Up
      backdropOpacity.value = withTiming(1, { duration: 250 });
      cardTranslateY.value = withTiming(0, {
        duration: 350,
        easing: Easing.out(Easing.back(1.1)),
      });
      cardScale.value = withTiming(1, { duration: 350 });

      // Sonar Wave 1 Loop (3200ms slow pulse)
      wave1Scale.value = 0.15;
      wave1Opacity.value = 0.85;
      wave1Scale.value = withRepeat(
        withTiming(1.75, { duration: 3200, easing: Easing.out(Easing.cubic) }),
        -1,
        false
      );
      wave1Opacity.value = withRepeat(
        withTiming(0, { duration: 3200, easing: Easing.out(Easing.quad) }),
        -1,
        false
      );

      // Sonar Wave 2 Loop (1060ms offset)
      wave2Scale.value = 0.15;
      wave2Opacity.value = 0.85;
      wave2Scale.value = withDelay(
        1060,
        withRepeat(
          withTiming(1.75, { duration: 3200, easing: Easing.out(Easing.cubic) }),
          -1,
          false
        )
      );
      wave2Opacity.value = withDelay(
        1060,
        withRepeat(
          withTiming(0, { duration: 3200, easing: Easing.out(Easing.quad) }),
          -1,
          false
        )
      );

      // Sonar Wave 3 Loop (2120ms offset)
      wave3Scale.value = 0.15;
      wave3Opacity.value = 0.85;
      wave3Scale.value = withDelay(
        2120,
        withRepeat(
          withTiming(1.75, { duration: 3200, easing: Easing.out(Easing.cubic) }),
          -1,
          false
        )
      );
      wave3Opacity.value = withDelay(
        2120,
        withRepeat(
          withTiming(0, { duration: 3200, easing: Easing.out(Easing.quad) }),
          -1,
          false
        )
      );

      // Simulated online player pop-in, hold, fade-out & relocate loop (3 spots pinging organically)
      dot1Scale.value = withDelay(
        300,
        withRepeat(
          withSequence(
            withTiming(1, { duration: 650, easing: Easing.out(Easing.back(1.1)) }),
            withTiming(1.15, { duration: 1000 }),
            withTiming(0, { duration: 800, easing: Easing.in(Easing.quad) }),
            withTiming(0, { duration: 800 }, (finished) => {
              if (finished) {
                runOnJS(relocateDot)(1);
              }
            })
          ),
          -1,
          false
        )
      );
      dot1Opacity.value = withDelay(
        300,
        withRepeat(
          withSequence(
            withTiming(1, { duration: 650 }),
            withTiming(0.85, { duration: 1000 }),
            withTiming(0, { duration: 800 }),
            withTiming(0, { duration: 800 })
          ),
          -1,
          false
        )
      );

      dot2Scale.value = withDelay(
        1100,
        withRepeat(
          withSequence(
            withTiming(1, { duration: 650, easing: Easing.out(Easing.back(1.1)) }),
            withTiming(1.15, { duration: 1000 }),
            withTiming(0, { duration: 800, easing: Easing.in(Easing.quad) }),
            withTiming(0, { duration: 800 }, (finished) => {
              if (finished) {
                runOnJS(relocateDot)(2);
              }
            })
          ),
          -1,
          false
        )
      );
      dot2Opacity.value = withDelay(
        1100,
        withRepeat(
          withSequence(
            withTiming(1, { duration: 650 }),
            withTiming(0.85, { duration: 1000 }),
            withTiming(0, { duration: 800 }),
            withTiming(0, { duration: 800 })
          ),
          -1,
          false
        )
      );

      dot3Scale.value = withDelay(
        2000,
        withRepeat(
          withSequence(
            withTiming(1, { duration: 650, easing: Easing.out(Easing.back(1.1)) }),
            withTiming(1.15, { duration: 1000 }),
            withTiming(0, { duration: 800, easing: Easing.in(Easing.quad) }),
            withTiming(0, { duration: 800 }, (finished) => {
              if (finished) {
                runOnJS(relocateDot)(3);
              }
            })
          ),
          -1,
          false
        )
      );
      dot3Opacity.value = withDelay(
        2000,
        withRepeat(
          withSequence(
            withTiming(1, { duration: 650 }),
            withTiming(0.85, { duration: 1000 }),
            withTiming(0, { duration: 800 }),
            withTiming(0, { duration: 800 })
          ),
          -1,
          false
        )
      );

    } else {
      backdropOpacity.value = withTiming(0, { duration: 200 });
      cardTranslateY.value = withTiming(200, { duration: 200 });
      cardScale.value = withTiming(0.9, { duration: 200 });

      // Cancel active loops
      cancelAnimation(wave1Scale);
      cancelAnimation(wave1Opacity);
      cancelAnimation(wave2Scale);
      cancelAnimation(wave2Opacity);
      cancelAnimation(wave3Scale);
      cancelAnimation(wave3Opacity);
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

      // Stop radar wave & simulated dot loops
      cancelAnimation(wave1Scale);
      cancelAnimation(wave1Opacity);
      cancelAnimation(wave2Scale);
      cancelAnimation(wave2Opacity);
      cancelAnimation(wave3Scale);
      cancelAnimation(wave3Opacity);
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

  const animatedWave1Style = useAnimatedStyle(() => ({
    opacity: wave1Opacity.value,
    transform: [{ scale: wave1Scale.value }],
  }));

  const animatedWave2Style = useAnimatedStyle(() => ({
    opacity: wave2Opacity.value,
    transform: [{ scale: wave2Scale.value }],
  }));

  const animatedWave3Style = useAnimatedStyle(() => ({
    opacity: wave3Opacity.value,
    transform: [{ scale: wave3Scale.value }],
  }));

  const animatedDot1Style = useAnimatedStyle(() => ({
    opacity: dot1Opacity.value,
    transform: [
      { translateX: dot1X.value },
      { translateY: dot1Y.value },
      { scale: dot1Scale.value },
    ],
  }));

  const animatedDot2Style = useAnimatedStyle(() => ({
    opacity: dot2Opacity.value,
    transform: [
      { translateX: dot2X.value },
      { translateY: dot2Y.value },
      { scale: dot2Scale.value },
    ],
  }));

  const animatedDot3Style = useAnimatedStyle(() => ({
    opacity: dot3Opacity.value,
    transform: [
      { translateX: dot3X.value },
      { translateY: dot3Y.value },
      { scale: dot3Scale.value },
    ],
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
              {/* Expanding Sonar Pulse Waves */}
              <Animated.View style={[styles.radarWaveRing, animatedWave1Style]} />
              <Animated.View style={[styles.radarWaveRing, animatedWave2Style]} />
              <Animated.View style={[styles.radarWaveRing, animatedWave3Style]} />

              {/* Center Radar Beacon Core */}
              <View style={styles.radarCenterBeacon}>
                <Image source={require('../../assets/logo_ludo.jpeg')} style={{ width: 44, height: 44, borderRadius: 10 }} />
              </View>

              {/* Simulated Teeming Discovered Player Dots (Randomized Coordinates) */}
              <Animated.View style={[styles.onlineDot, animatedDot1Style]}>
                <View style={styles.dotPulseRing} />
              </Animated.View>
              <Animated.View style={[styles.onlineDot, animatedDot2Style]}>
                <View style={styles.dotPulseRing} />
              </Animated.View>
              <Animated.View style={[styles.onlineDot, animatedDot3Style]}>
                <View style={styles.dotPulseRing} />
              </Animated.View>
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
  radarWaveRing: {
    position: 'absolute',
    width: 135,
    height: 135,
    borderRadius: 67.5,
    borderWidth: 2,
    borderColor: 'rgba(99, 102, 241, 0.45)', // Soft indigo wave line
    backgroundColor: 'rgba(99, 102, 241, 0.08)', // Translucent glowing wave fill
  },
  radarGridRingOuter: {
    position: 'absolute',
    width: 130,
    height: 130,
    borderRadius: 65,
    borderWidth: 1,
    borderColor: 'rgba(199, 210, 254, 0.6)',
    borderStyle: 'dashed',
  },
  radarGridRingInner: {
    position: 'absolute',
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 1,
    borderColor: 'rgba(224, 231, 255, 0.8)',
  },
  sweepLineArc: {
    position: 'absolute',
    width: 130,
    height: 130,
    borderRadius: 65,
    borderWidth: 2.5,
    borderColor: 'transparent',
    borderTopColor: '#4F46E5', // Active scanner sweep arc
    borderRightColor: 'rgba(79, 70, 229, 0.3)',
  },
  radarCenterBeacon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(79, 70, 229, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(79, 70, 229, 0.3)',
  },
  radarCenterCore: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#4F46E5',
    shadowColor: '#4F46E5',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 6,
    elevation: 4,
  },

  // Simulated Glowing Online Player Dots (Max 3 spots)
  onlineDot: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#6366F1',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.6,
    shadowRadius: 4,
    elevation: 3,
  },
  dotPulseRing: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.5)',
    position: 'absolute',
  },
  dotPos1: {
    top: 24,
    right: 30,
  },
  dotPos2: {
    bottom: 28,
    left: 24,
  },
  dotPos3: {
    top: 36,
    left: 28,
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
