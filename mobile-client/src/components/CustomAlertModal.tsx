import React, { useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Dimensions,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export interface CustomAlertOptions {
  visible: boolean;
  title: string;
  message: string;
  type?: 'success' | 'error' | 'info' | 'wallet';
  confirmText?: string;
  cancelText?: string;
  onConfirm?: () => void;
  onCancel?: () => void;
}

interface CustomAlertModalProps {
  alert: CustomAlertOptions;
  onClose: () => void;
}

export const CustomAlertModal: React.FC<CustomAlertModalProps> = ({
  alert,
  onClose,
}) => {
  const backdropOpacity = useSharedValue(0);
  const cardScale = useSharedValue(0.85);

  useEffect(() => {
    if (alert.visible) {
      backdropOpacity.value = withTiming(1, { duration: 250 });
      cardScale.value = withTiming(1, {
        duration: 350,
        easing: Easing.out(Easing.back(1.2)),
      });
    } else {
      backdropOpacity.value = withTiming(0, { duration: 200 });
      cardScale.value = withTiming(0.85, { duration: 200 });
    }
  }, [alert.visible]);

  const animatedBackdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));

  const animatedCardStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
    transform: [{ scale: cardScale.value }],
  }));

  if (!alert.visible) return null;

  const type = alert.type || 'info';
  const hasCancel = Boolean(alert.cancelText || alert.onCancel);

  // Icon configurations
  const renderIcon = () => {
    switch (type) {
      case 'wallet':
        return (
          <View style={[styles.iconCircle, styles.iconCircle_wallet]}>
            <Ionicons name="wallet-outline" size={28} color="#EF4444" />
          </View>
        );
      case 'success':
        return (
          <View style={[styles.iconCircle, styles.iconCircle_success]}>
            <Ionicons name="checkmark-circle-outline" size={30} color="#10B981" />
          </View>
        );
      case 'error':
        return (
          <View style={[styles.iconCircle, styles.iconCircle_error]}>
            <Ionicons name="alert-circle-outline" size={30} color="#EF4444" />
          </View>
        );
      case 'info':
      default:
        return (
          <View style={[styles.iconCircle, styles.iconCircle_info]}>
            <Ionicons name="information-circle-outline" size={30} color="#4F46E5" />
          </View>
        );
    }
  };

  const handleConfirm = () => {
    onClose();
    if (alert.onConfirm) {
      alert.onConfirm();
    }
  };

  const handleCancel = () => {
    onClose();
    if (alert.onCancel) {
      alert.onCancel();
    }
  };

  return (
    <Modal transparent visible={alert.visible} animationType="none" statusBarTranslucent>
      <Animated.View style={[styles.backdrop, animatedBackdropStyle]}>
        <Animated.View style={[styles.card, animatedCardStyle]}>
          
          {/* Top Icon Badge */}
          {renderIcon()}

          {/* Title */}
          <Text style={styles.titleText}>{alert.title}</Text>

          {/* Message Body */}
          <Text style={styles.messageText}>{alert.message}</Text>

          {/* Action Buttons */}
          <View style={styles.buttonRow}>
            {hasCancel && (
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={handleCancel}
                activeOpacity={0.75}
              >
                <Text style={styles.cancelBtnText} numberOfLines={1} adjustsFontSizeToFit>
                  {alert.cancelText || 'CANCEL'}
                </Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={[
                styles.confirmBtn,
                type === 'wallet' && styles.confirmBtn_wallet,
                type === 'error' && styles.confirmBtn_error,
                type === 'success' && styles.confirmBtn_success,
                hasCancel && { marginLeft: 10 },
              ]}
              onPress={handleConfirm}
              activeOpacity={0.8}
            >
              <Text style={styles.confirmBtnText} numberOfLines={1} adjustsFontSizeToFit>
                {alert.confirmText || (hasCancel ? 'ADD CASH' : 'GOT IT')}
              </Text>
            </TouchableOpacity>
          </View>

        </Animated.View>
      </Animated.View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)', // Semi-transparent dark slate
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  card: {
    width: SCREEN_WIDTH * 0.86,
    maxWidth: 340,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    paddingTop: 28,
    paddingBottom: 24,
    paddingHorizontal: 24,
    alignItems: 'center',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.14,
    shadowRadius: 28,
    elevation: 10,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },

  iconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  iconCircle_wallet: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1.5,
    borderColor: '#FEE2E2',
  },
  iconCircle_success: {
    backgroundColor: '#D1FAE5',
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
  },
  iconCircle_error: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1.5,
    borderColor: '#FEE2E2',
  },
  iconCircle_info: {
    backgroundColor: '#EEF2FF',
    borderWidth: 1.5,
    borderColor: '#E0E7FF',
  },

  titleText: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0F172A', // Slate dark primary text
    textAlign: 'center',
    marginBottom: 8,
    letterSpacing: 0.3,
  },
  messageText: {
    fontSize: 13.5,
    fontWeight: '500',
    color: '#475569', // Muted description
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },

  buttonRow: {
    flexDirection: 'row',
    width: '100%',
    justifyContent: 'center',
  },
  cancelBtn: {
    flex: 1,
    backgroundColor: '#F1F5F9',
    paddingVertical: 12,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  cancelBtnText: {
    color: '#64748B',
    fontSize: 12.5,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  confirmBtn: {
    flex: 1,
    backgroundColor: '#4F46E5', // Indigo default
    paddingVertical: 12,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#4F46E5',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 3,
  },
  confirmBtn_wallet: {
    backgroundColor: '#4F46E5',
  },
  confirmBtn_error: {
    backgroundColor: '#EF4444',
    shadowColor: '#EF4444',
  },
  confirmBtn_success: {
    backgroundColor: '#10B981',
    shadowColor: '#10B981',
  },
  confirmBtnText: {
    color: '#FFFFFF',
    fontSize: 12.5,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
});
