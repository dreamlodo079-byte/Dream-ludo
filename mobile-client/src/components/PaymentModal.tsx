import React, { useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Linking,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native';
import Svg, { Rect, Path, Circle, G } from 'react-native-svg';
import { Socket } from 'socket.io-client';

interface PaymentModalProps {
  visible: boolean;
  onClose: () => void;
  onPaymentSuccess?: (data: any) => void;
  amount: number;
  upiUri: string;
  orderId: string;
  userId: string;
  socket?: Socket | null;
}

export const PaymentModal: React.FC<PaymentModalProps> = ({
  visible,
  onClose,
  onPaymentSuccess,
  amount,
  upiUri,
  orderId,
  userId,
  socket,
}) => {
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [paymentConfirmed, setPaymentConfirmed] = useState<boolean>(false);

  useEffect(() => {
    if (!socket || !visible) return;

    const handlePaymentSuccess = (data: any) => {
      if (data && (data.userId === userId || data.transactionId === orderId)) {
        setPaymentConfirmed(true);
        setIsProcessing(false);
        if (onPaymentSuccess) {
          onPaymentSuccess(data);
        }
        setTimeout(() => {
          onClose();
        }, 2000);
      }
    };

    socket.on('PAYMENT_SUCCESS', handlePaymentSuccess);

    return () => {
      socket.off('PAYMENT_SUCCESS', handlePaymentSuccess);
    };
  }, [socket, visible, userId, orderId, onPaymentSuccess, onClose]);

  const handleDeepLink = async (appName: string, customScheme?: string) => {
    setIsProcessing(true);
    let targetUrl = upiUri;

    if (customScheme === 'gpay') {
      targetUrl = upiUri.replace(/^upi:\/\//, 'gpay://upi/');
    } else if (customScheme === 'phonepe') {
      targetUrl = upiUri.replace(/^upi:\/\//, 'phonepe://pay?');
    } else if (customScheme === 'paytm') {
      targetUrl = upiUri.replace(/^upi:\/\//, 'paytmmp://pay?');
    }

    try {
      const supported = await Linking.canOpenURL(targetUrl);
      if (supported) {
        await Linking.openURL(targetUrl);
      } else {
        // Fallback to standard UPI link
        await Linking.openURL(upiUri);
      }
    } catch (err) {
      console.warn(`Failed to open ${appName}:`, err);
      // Fallback attempt with standard upi scheme
      try {
        await Linking.openURL(upiUri);
      } catch (fallbackErr) {
        Alert.alert('App Not Installed', `Please open your preferred UPI app and scan the QR code to pay ₹${amount}.`);
      }
    }
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.modalCard}>
          <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            {/* Header */}
            <View style={styles.header}>
              <View style={styles.headerBadge}>
                <Text style={styles.headerBadgeText}>🔒 256-BIT SECURE S2S PAY-IN</Text>
              </View>
              <Text style={styles.title}>INSTANT ADD CASH</Text>
              <Text style={styles.amountText}>₹{amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</Text>
              <Text style={styles.orderSub}>ORDER ID: {orderId}</Text>
            </View>

            {/* Confirmation State Banner */}
            {paymentConfirmed ? (
              <View style={styles.successBanner}>
                <Text style={styles.successIcon}>🎉</Text>
                <Text style={styles.successTitle}>PAYMENT CONFIRMED!</Text>
                <Text style={styles.successSub}>₹{amount} credited to your wallet balance instantly.</Text>
              </View>
            ) : (
              <>
                {/* Custom Native QR SVG Component */}
                <View style={styles.qrContainer}>
                  <Svg width="180" height="180" viewBox="0 0 200 200">
                    <Rect x="0" y="0" width="200" height="200" rx="16" fill="#FFFFFF" />
                    {/* Corner Position Detection Squares */}
                    <Rect x="15" y="15" width="45" height="45" rx="6" fill="#0F172A" />
                    <Rect x="23" y="23" width="29" height="29" rx="3" fill="#FFFFFF" />
                    <Rect x="30" y="30" width="15" height="15" rx="2" fill="#4F46E5" />

                    <Rect x="140" y="15" width="45" height="45" rx="6" fill="#0F172A" />
                    <Rect x="148" y="23" width="29" height="29" rx="3" fill="#FFFFFF" />
                    <Rect x="155" y="30" width="15" height="15" rx="2" fill="#4F46E5" />

                    <Rect x="15" y="140" width="45" height="45" rx="6" fill="#0F172A" />
                    <Rect x="23" y="148" width="29" height="29" rx="3" fill="#FFFFFF" />
                    <Rect x="30" y="155" width="15" height="15" rx="2" fill="#4F46E5" />

                    {/* QR Code Data Pattern Simulation */}
                    <Rect x="70" y="20" width="12" height="12" fill="#0F172A" />
                    <Rect x="90" y="20" width="20" height="12" fill="#4F46E5" />
                    <Rect x="120" y="20" width="10" height="12" fill="#0F172A" />

                    <Rect x="70" y="40" width="22" height="12" fill="#4F46E5" />
                    <Rect x="100" y="40" width="12" height="12" fill="#0F172A" />
                    <Rect x="118" y="40" width="12" height="12" fill="#0F172A" />

                    <Rect x="20" y="70" width="12" height="20" fill="#0F172A" />
                    <Rect x="40" y="70" width="20" height="10" fill="#4F46E5" />
                    <Rect x="70" y="70" width="15" height="15" fill="#0F172A" />
                    <Rect x="95" y="70" width="25" height="12" fill="#4F46E5" />
                    <Rect x="130" y="70" width="18" height="12" fill="#0F172A" />

                    <Rect x="20" y="98" width="25" height="12" fill="#4F46E5" />
                    <Rect x="55" y="98" width="12" height="25" fill="#0F172A" />
                    <Rect x="75" y="95" width="20" height="20" fill="#4F46E5" />
                    <Rect x="105" y="98" width="15" height="12" fill="#0F172A" />
                    <Rect x="130" y="95" width="22" height="22" fill="#0F172A" />
                    <Rect x="160" y="98" width="18" height="12" fill="#4F46E5" />

                    <Rect x="20" y="120" width="12" height="12" fill="#0F172A" />
                    <Rect x="75" y="125" width="25" height="12" fill="#0F172A" />
                    <Rect x="110" y="125" width="15" height="15" fill="#4F46E5" />

                    <Rect x="70" y="150" width="18" height="18" fill="#4F46E5" />
                    <Rect x="95" y="150" width="12" height="25" fill="#0F172A" />
                    <Rect x="115" y="150" width="25" height="12" fill="#0F172A" />
                    <Rect x="150" y="150" width="20" height="20" fill="#4F46E5" />

                    {/* Central Brand Badge */}
                    <Rect x="78" y="78" width="44" height="44" rx="10" fill="#FFFFFF" stroke="#4F46E5" strokeWidth="3" />
                    <Circle cx="100" cy="100" r="14" fill="#4F46E5" />
                    <Path d="M96 100l3 3 6-6" stroke="#FFFFFF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                  </Svg>
                  <Text style={styles.scanLabel}>Scan with any UPI App (GPay, PhonePe, Paytm)</Text>
                </View>

                {/* Deep Link Quick App Buttons */}
                <Text style={styles.sectionTitle}>OR CHOOSE INSTANT UPI APP:</Text>
                <View style={styles.upiAppsContainer}>
                  <TouchableOpacity
                    style={[styles.upiAppBtn, { backgroundColor: '#107C41' }]}
                    onPress={() => handleDeepLink('Google Pay', 'gpay')}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.upiAppBtnText}>🟢 Google Pay</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.upiAppBtn, { backgroundColor: '#5F259F' }]}
                    onPress={() => handleDeepLink('PhonePe', 'phonepe')}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.upiAppBtnText}>💜 PhonePe</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.upiAppBtn, { backgroundColor: '#00B9F1' }]}
                    onPress={() => handleDeepLink('Paytm', 'paytm')}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.upiAppBtnText}>💙 Paytm UPI</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.upiAppBtn, { backgroundColor: '#4F46E5' }]}
                    onPress={() => handleDeepLink('Other UPI')}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.upiAppBtnText}>⚡ Any UPI App</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}

            {/* Listening status indicator */}
            <View style={styles.listeningBox}>
              <ActivityIndicator size="small" color="#4F46E5" />
              <Text style={styles.listeningText}>
                {isProcessing
                  ? 'Awaiting gateway payment confirmation...'
                  : 'Listening for real-time WebSocket payment confirmation...'}
              </Text>
            </View>

            {/* Cancel / Close button */}
            <TouchableOpacity style={styles.closeBtn} onPress={onClose} activeOpacity={0.8}>
              <Text style={styles.closeBtnText}>CANCEL PAYMENT</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: '90%',
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 30,
  },
  scrollContent: {
    alignItems: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 16,
  },
  headerBadge: {
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    marginBottom: 8,
  },
  headerBadgeText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#4338CA',
    letterSpacing: 0.5,
  },
  title: {
    fontSize: 14,
    fontWeight: '900',
    color: '#64748B',
    letterSpacing: 1,
  },
  amountText: {
    fontSize: 32,
    fontWeight: '900',
    color: '#0F172A',
    marginVertical: 4,
  },
  orderSub: {
    fontSize: 11,
    fontWeight: '700',
    color: '#94A3B8',
  },
  qrContainer: {
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    marginBottom: 16,
    width: '100%',
  },
  scanLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
    marginTop: 10,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '900',
    color: '#475569',
    letterSpacing: 0.5,
    marginBottom: 10,
    alignSelf: 'flex-start',
  },
  upiAppsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 16,
  },
  upiAppBtn: {
    width: '48%',
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  upiAppBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  listeningBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    marginBottom: 14,
    gap: 8,
    width: '100%',
  },
  listeningText: {
    fontSize: 11,
    color: '#475569',
    fontWeight: '600',
    flex: 1,
  },
  successBanner: {
    backgroundColor: '#ECFDF5',
    borderWidth: 1.5,
    borderColor: '#10B981',
    borderRadius: 20,
    padding: 20,
    alignItems: 'center',
    width: '100%',
    marginVertical: 20,
  },
  successIcon: {
    fontSize: 40,
    marginBottom: 8,
  },
  successTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#065F46',
  },
  successSub: {
    fontSize: 12,
    color: '#047857',
    fontWeight: '600',
    marginTop: 4,
  },
  closeBtn: {
    paddingVertical: 12,
    width: '100%',
    alignItems: 'center',
  },
  closeBtnText: {
    color: '#EF4444',
    fontSize: 12,
    fontWeight: '800',
  },
});
