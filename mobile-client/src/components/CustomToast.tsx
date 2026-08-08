import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  Easing,
  runOnJS,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export interface ToastOptions {
  visible: boolean;
  message: string;
  type?: 'success' | 'error' | 'info';
  duration?: number;
}

interface CustomToastProps {
  toast: ToastOptions;
  onDismiss: () => void;
}

export const CustomToast: React.FC<CustomToastProps> = ({ toast, onDismiss }) => {
  const translateY = useSharedValue(-100);
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (toast.visible) {
      opacity.value = withTiming(1, { duration: 200 });
      translateY.value = withSpring(0, {
        damping: 15,
        stiffness: 120,
      });

      const timer = setTimeout(() => {
        opacity.value = withTiming(0, { duration: 200 });
        translateY.value = withTiming(-100, { duration: 200 }, (isFinished) => {
          if (isFinished) {
            runOnJS(onDismiss)();
          }
        });
      }, toast.duration || 3000);

      return () => clearTimeout(timer);
    } else {
      opacity.value = withTiming(0, { duration: 150 });
      translateY.value = withTiming(-100, { duration: 150 });
    }
  }, [toast.visible, toast.message]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  if (!toast.visible) return null;

  const type = toast.type || 'info';

  const getIcon = () => {
    switch (type) {
      case 'success':
        return <Ionicons name="checkmark-circle" size={22} color="#10B981" />;
      case 'error':
        return <Ionicons name="alert-circle" size={22} color="#EF4444" />;
      case 'info':
      default:
        return <Ionicons name="information-circle" size={22} color="#F59E0B" />;
    }
  };

  return (
    <Animated.View style={[styles.container, animatedStyle]}>
      <View style={[styles.toastCard, type === 'error' ? styles.borderError : type === 'success' ? styles.borderSuccess : styles.borderInfo]}>
        <View style={styles.iconWrapper}>{getIcon()}</View>
        <Text style={styles.messageText} numberOfLines={2}>
          {toast.message}
        </Text>
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 100, // Positioned cleanly below header bar
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 99999,
    paddingHorizontal: 16,
  },
  toastCard: {
    flexDirection: 'row',
    alignItems: 'center',
    width: SCREEN_WIDTH * 0.90,
    maxWidth: 360,
    backgroundColor: '#1E1B4B', // Rich dark indigo gaming container
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 16,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.45,
    shadowRadius: 20,
    elevation: 12,
    borderWidth: 1.5,
  },
  borderSuccess: {
    borderColor: '#10B981',
    backgroundColor: '#064E3B',
  },
  borderError: {
    borderColor: '#EF4444',
    backgroundColor: '#7F1D1D',
  },
  borderInfo: {
    borderColor: '#F59E0B',
    backgroundColor: '#1E1B4B',
  },
  iconWrapper: {
    marginRight: 12,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  messageText: {
    color: '#FFFFFF', // High-contrast crisp white text
    fontSize: 13.5,
    fontWeight: '800',
    flex: 1,
    lineHeight: 19,
    letterSpacing: 0.3,
  },
});
