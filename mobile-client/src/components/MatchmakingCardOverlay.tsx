import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions, Modal } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  Easing,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';

const { width } = Dimensions.get('window');

interface MatchmakingCardOverlayProps {
  visible: boolean;
  onCancel: () => void;
  onAnimationComplete: () => void;
  opponent: {
    username: string;
    avatarUrl?: string;
  } | null;
  durationSeconds?: number;
}

export const MatchmakingCardOverlay: React.FC<MatchmakingCardOverlayProps> = ({
  visible,
  onCancel,
  onAnimationComplete,
  opponent,
  durationSeconds = 13, // Standard 13-second tier matchmaking time
}) => {
  const [secondsLeft, setSecondsLeft] = useState(durationSeconds);
  const [isSuccess, setIsSuccess] = useState(false);

  const opacity = useSharedValue(0);
  const cardScale = useSharedValue(0.9);
  const rotation = useSharedValue(0);

  // Spinner rotation animation
  useEffect(() => {
    if (visible && !isSuccess) {
      rotation.value = withRepeat(
        withTiming(360, {
          duration: 1000,
          easing: Easing.linear,
        }),
        -1,
        false
      );
    }
  }, [visible, isSuccess]);

  // Handle countdown dynamically
  useEffect(() => {
    if (!visible || opponent) return;

    setSecondsLeft(durationSeconds);
    const interval = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          onCancel();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [visible, opponent, durationSeconds, onCancel]);

  // Handle overlay mount and fade transitions
  useEffect(() => {
    if (visible) {
      opacity.value = withTiming(1, { duration: 300 });
      cardScale.value = withTiming(1, { duration: 300, easing: Easing.out(Easing.back(1.2)) });
    } else {
      opacity.value = withTiming(0, { duration: 250 });
      cardScale.value = withTiming(0.9, { duration: 250 });
      setIsSuccess(false);
    }
  }, [visible]);

  // Match Found sequence: hold state for 1000ms frame before transitioning
  useEffect(() => {
    if (opponent) {
      setIsSuccess(true);
      const timer = setTimeout(() => {
        onAnimationComplete();
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [opponent]);

  const animatedBackdropStyle = useAnimatedStyle(() => {
    return {
      opacity: opacity.value,
    };
  });

  const animatedCardStyle = useAnimatedStyle(() => {
    return {
      opacity: opacity.value,
      transform: [{ scale: cardScale.value }],
    };
  });

  const animatedSpinnerStyle = useAnimatedStyle(() => {
    return {
      transform: [{ rotate: `${rotation.value}deg` }],
    };
  });

  if (!visible) return null;

  return (
    <Modal transparent visible={visible} animationType="none">
      <Animated.View style={[styles.backdrop, animatedBackdropStyle]}>
        <Animated.View style={[styles.card, animatedCardStyle]}>
          
          {/* Animated Spinner/Radar or Success Checkmark */}
          <View style={styles.graphicContainer}>
            {isSuccess ? (
              <View style={styles.successOuterCircle}>
                <View style={styles.successInnerCircle}>
                  <Ionicons name="checkmark-sharp" size={36} color="#10B981" />
                </View>
              </View>
            ) : (
              <View style={styles.spinnerTrack}>
                <Animated.View style={[styles.spinnerArc, animatedSpinnerStyle]} />
                <Ionicons name="search" size={24} color="#6366F1" style={styles.searchIcon} />
              </View>
            )}
          </View>

          {/* Typography Title */}
          <Text style={styles.primaryText}>
            {isSuccess ? 'MATCH SECURED!' : 'LOOKING FOR ACTIVE PLAYERS...'}
          </Text>

          {/* Countdown & Match Ticker */}
          <Text style={styles.secondaryText}>
            {isSuccess
              ? `Entering game room against ${opponent?.username || 'player'}`
              : `Starting match shortly in ${secondsLeft}s`}
          </Text>

          {/* Cancel Anchor Button */}
          {!isSuccess && (
            <TouchableOpacity
              onPress={onCancel}
              activeOpacity={0.7}
              style={styles.cancelButton}
            >
              <Text style={styles.cancelText}>CANCEL</Text>
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
    backgroundColor: 'rgba(15, 23, 42, 0.45)', // Premium dark slate semi-transparent overlay
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    width: width * 0.85,
    maxWidth: 340,
    backgroundColor: '#FFFFFF', // Elevated white container card
    borderRadius: 24,
    paddingVertical: 32,
    paddingHorizontal: 24,
    alignItems: 'center',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
    elevation: 8,
  },
  graphicContainer: {
    marginBottom: 24,
    height: 90,
    justifyContent: 'center',
    alignItems: 'center',
  },
  spinnerTrack: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 4,
    borderColor: '#EEF2FF', // Soft lavender/indigo stroke track
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  spinnerArc: {
    position: 'absolute',
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 4,
    borderColor: 'transparent',
    borderTopColor: '#6366F1', // indigo rotating loader line
  },
  searchIcon: {
    position: 'absolute',
  },
  successOuterCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#D1FAE5', // Success soft green background
    justifyContent: 'center',
    alignItems: 'center',
  },
  successInnerCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  primaryText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1E293B', // Premium dark primary text
    textAlign: 'center',
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  secondaryText: {
    fontSize: 14,
    color: '#64748B', // Muted secondary text
    textAlign: 'center',
    marginBottom: 28,
  },
  cancelButton: {
    backgroundColor: '#FEF2F2', // Pill button with soft red tint
    paddingVertical: 12,
    paddingHorizontal: 36,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#FEE2E2',
  },
  cancelText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#EF4444', // Cancel accent red
    letterSpacing: 1,
  },
});
