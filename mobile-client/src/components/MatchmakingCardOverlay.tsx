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
  withDelay,
  Easing,
  cancelAnimation,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface MatchmakingCardOverlayProps {
  /** Controls modal visibility */
  visible: boolean;
  /** Fires when user taps Cancel button */
  onCancel: () => void;
  /** Fires after 1000ms success hold sequence completes */
  onAnimationComplete: () => void;
  /** Opponent profile object when match is secured */
  opponent?: {
    username: string;
    avatarUrl?: string;
  } | null;
  /** Queue ticker duration in seconds (default 13s) */
  durationSeconds?: number;
  /** Optional entry fee for display */
  entryFee?: number;
}

export const MatchmakingCardOverlay: React.FC<MatchmakingCardOverlayProps> = ({
  visible,
  onCancel,
  onAnimationComplete,
  opponent = null,
  durationSeconds = 13,
  entryFee,
}) => {
  const [secondsLeft, setSecondsLeft] = useState<number>(durationSeconds);
  const [isSuccess, setIsSuccess] = useState<boolean>(false);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Reanimated values
  const backdropOpacity = useSharedValue(0);
  const cardScale = useSharedValue(0.9);
  const rotation = useSharedValue(0);
  const successScale = useSharedValue(0);
  const checkmarkScale = useSharedValue(0);

  const clearTimer = useCallback(() => {
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
  }, []);

  // Mount/Unmount setup
  useEffect(() => {
    if (visible) {
      setIsSuccess(false);
      setSecondsLeft(durationSeconds);
      successScale.value = 0;
      checkmarkScale.value = 0;

      // Animate modal backdrop & card scale
      backdropOpacity.value = withTiming(1, { duration: 250 });
      cardScale.value = withTiming(1, {
        duration: 350,
        easing: Easing.out(Easing.back(1.1)),
      });

      // Start inner arc rotation
      rotation.value = withRepeat(
        withTiming(360, { duration: 1000, easing: Easing.linear }),
        -1,
        false
      );
    } else {
      backdropOpacity.value = withTiming(0, { duration: 200 });
      cardScale.value = withTiming(0.9, { duration: 200 });
      cancelAnimation(rotation);
      clearTimer();
    }
  }, [visible, durationSeconds]);

  // Countdown clock
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
          onCancel();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return clearTimer;
  }, [visible, opponent, durationSeconds, onCancel, clearTimer]);

  // Match Secured Success Transition (1000ms Hold)
  useEffect(() => {
    if (opponent) {
      setIsSuccess(true);
      cancelAnimation(rotation);

      successScale.value = withTiming(1, {
        duration: 350,
        easing: Easing.out(Easing.back(1.4)),
      });

      checkmarkScale.value = withDelay(
        150,
        withTiming(1, {
          duration: 300,
          easing: Easing.out(Easing.back(1.8)),
        })
      );

      const timer = setTimeout(() => {
        onAnimationComplete();
      }, 1000);

      return () => clearTimeout(timer);
    }
  }, [opponent]);

  // Animated styles
  const animatedBackdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));

  const animatedCardStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
    transform: [{ scale: cardScale.value }],
  }));

  const animatedArcStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  const animatedSuccessStyle = useAnimatedStyle(() => ({
    transform: [{ scale: successScale.value }],
  }));

  const animatedCheckmarkStyle = useAnimatedStyle(() => ({
    transform: [{ scale: checkmarkScale.value }],
  }));

  if (!visible) return null;

  return (
    <Modal transparent visible={visible} animationType="none" statusBarTranslucent>
      <Animated.View style={[styles.backdrop, animatedBackdropStyle]}>
        <Animated.View style={[styles.card, animatedCardStyle]}>
          
          {/* Optional Entry Fee Tag */}
          {entryFee !== undefined && entryFee > 0 && (
            <View style={styles.feeBadge}>
              <Text style={styles.feeBadgeText}>MATCH ENTRY: ₹{entryFee}</Text>
            </View>
          )}

          {/* Minimalist Concentric Lavender Radar / Success Graphic */}
          <View style={styles.graphicContainer}>
            {isSuccess ? (
              <Animated.View style={[styles.successCircleOuter, animatedSuccessStyle]}>
                <View style={styles.successCircleInner}>
                  <Animated.View style={animatedCheckmarkStyle}>
                    <Ionicons name="checkmark-sharp" size={36} color="#10B981" />
                  </Animated.View>
                </View>
              </Animated.View>
            ) : (
              <View style={styles.outerLavenderRing}>
                <View style={styles.innerLavenderRing}>
                  <Animated.View style={[styles.rotatingArcIndicator, animatedArcStyle]} />
                </View>
              </View>
            )}
          </View>

          {/* Primary Bold Title */}
          <Text style={styles.primaryTitleText}>
            {isSuccess ? 'MATCH SECURED!' : 'LOOKING FOR ACTIVE PLAYERS...'}
          </Text>

          {/* Secondary Subtitle Ticker */}
          <Text style={styles.secondarySubtitleText}>
            {isSuccess
              ? `Entering game room against ${opponent?.username || 'player'}`
              : `Starting match shortly in ${secondsLeft}s`}
          </Text>

          {/* Pill Cancel Button */}
          {!isSuccess && (
            <TouchableOpacity
              onPress={onCancel}
              activeOpacity={0.75}
              style={styles.cancelPillButton}
            >
              <Text style={styles.cancelPillText}>CANCEL</Text>
            </TouchableOpacity>
          )}

        </Animated.View>
      </Animated.View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)', // Semi-transparent overlay backdrop
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    width: SCREEN_WIDTH * 0.85,
    maxWidth: 340,
    backgroundColor: '#FFFFFF', // Clean elevated white container card
    borderRadius: 24,
    paddingTop: 36,
    paddingBottom: 32,
    paddingHorizontal: 24,
    alignItems: 'center',
    // Depth shadow
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 10,
  },
  feeBadge: {
    position: 'absolute',
    top: -12,
    backgroundColor: '#4F46E5',
    paddingHorizontal: 14,
    paddingVertical: 4,
    borderRadius: 12,
  },
  feeBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },

  // Concentric Lavender Vector graphic
  graphicContainer: {
    height: 150,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  outerLavenderRing: {
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 2,
    borderColor: 'rgba(199, 210, 254, 0.7)', // Lavender outer ring stroke (#C7D2FE)
    justifyContent: 'center',
    alignItems: 'center',
  },
  innerLavenderRing: {
    width: 92,
    height: 92,
    borderRadius: 46,
    borderWidth: 2,
    borderColor: 'rgba(224, 231, 255, 0.9)', // Lighter lavender inner ring stroke (#E0E7FF)
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  rotatingArcIndicator: {
    position: 'absolute',
    width: 92,
    height: 92,
    borderRadius: 46,
    borderWidth: 3.5,
    borderColor: 'transparent',
    borderTopColor: '#4F46E5', // Dark indigo rotating arc indicator line
    borderRightColor: 'rgba(79, 70, 229, 0.4)',
  },

  // Success Checkmark Graphic
  successCircleOuter: {
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: '#D1FAE5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  successCircleInner: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 3,
  },

  // Typography
  primaryTitleText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#1E293B', // Dark primary text
    textAlign: 'center',
    letterSpacing: 0.5,
    marginTop: 12,
  },
  secondarySubtitleText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#64748B', // Muted secondary text
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 28,
  },

  // Cancel Button
  cancelPillButton: {
    backgroundColor: '#F1F5F9', // Light pill-shaped background
    paddingVertical: 12,
    paddingHorizontal: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelPillText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#EF4444', // Clean red accent text
    letterSpacing: 1,
  },
});
