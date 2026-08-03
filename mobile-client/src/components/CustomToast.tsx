import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  Easing,
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
        translateY.value = withTiming(-100, { duration: 200 }, () => {
          onDismiss();
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
        return <Ionicons name="information-circle" size={22} color="#6366F1" />;
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
    top: 65,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 99999,
    paddingHorizontal: 20,
  },
  toastCard: {
    flexDirection: 'row',
    alignItems: 'center',
    width: SCREEN_WIDTH * 0.88,
    maxWidth: 360,
    backgroundColor: '#0F172A', // Dark slate floating card
    borderRadius: 20,
    paddingVertical: 12,
    paddingHorizontal: 16,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 10,
    borderWidth: 1,
  },
  borderSuccess: {
    borderColor: 'rgba(16, 185, 129, 0.4)',
  },
  borderError: {
    borderColor: 'rgba(239, 68, 68, 0.4)',
  },
  borderInfo: {
    borderColor: 'rgba(99, 102, 241, 0.4)',
  },
  iconWrapper: {
    marginRight: 10,
  },
  messageText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
    flex: 1,
    lineHeight: 18,
  },
});
