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
  Clipboard,
  Share,
  Image,
} from 'react-native';
import Svg, { Rect, Path, Circle } from 'react-native-svg';
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
  const [copied, setCopied] = useState<boolean>(false);

  // 5-Minute Countdown Timer (300s)
  const [timeLeft, setTimeLeft] = useState<number>(300);
  const [isExpired, setIsExpired] = useState<boolean>(false);

  const realUpiId = '6261069826-2.wallet@phonepe';

  useEffect(() => {
    if (!visible) return;
    setTimeLeft(300);
    setIsExpired(false);
  }, [visible]);

  useEffect(() => {
    if (!visible || timeLeft <= 0) {
      if (timeLeft <= 0 && visible) setIsExpired(true);
      return;
    }
    const timer = setInterval(() => {
      setTimeLeft((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [visible, timeLeft]);

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

  const formatTimer = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const handleCopyUpi = () => {
    Clipboard.setString(realUpiId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadQr = async () => {
    try {
      const formattedUpi = upiUri.includes('6261069826-2.wallet@phonepe')
        ? upiUri
        : `upi://pay?pa=${encodeURIComponent(realUpiId)}&pn=${encodeURIComponent('Dream Ludo')}&am=${amount.toFixed(2)}&cu=INR&tn=${encodeURIComponent(orderId)}`;

      const shareText = `Dream Ludo Payment QR Details:\n• Amount: ₹${amount.toFixed(2)}\n• Payee UPI ID: ${realUpiId}\n• Order ID: ${orderId}\n• Payment Deep Link: ${formattedUpi}`;

      await Share.share({
        message: shareText,
        title: 'Save Payment QR Code',
      });
    } catch (e) {
      Alert.alert('Save QR', `Copy UPI ID: ${realUpiId} to pay ₹${amount}`);
    }
  };

  const handleDeepLink = async (appName: string, customScheme?: string) => {
    if (isExpired) {
      Alert.alert('Payment Expired', 'This 5-minute QR code & payment session has expired.');
      return;
    }

    setIsProcessing(true);
    const formattedUpi = upiUri.includes('6261069826-2.wallet@phonepe')
      ? upiUri
      : `upi://pay?pa=${encodeURIComponent(realUpiId)}&pn=${encodeURIComponent('Dream Ludo')}&am=${amount.toFixed(2)}&cu=INR&tn=${encodeURIComponent(orderId)}`;

    let targetUrl = formattedUpi;

    if (customScheme === 'gpay') {
      targetUrl = formattedUpi.replace(/^upi:\/\//, 'gpay://upi/');
    } else if (customScheme === 'phonepe') {
      targetUrl = formattedUpi.replace(/^upi:\/\//, 'phonepe://pay?');
    } else if (customScheme === 'paytm') {
      targetUrl = formattedUpi.replace(/^upi:\/\//, 'paytmmp://pay?');
    }

    try {
      await Linking.openURL(targetUrl);
    } catch (err) {
      try {
        await Linking.openURL(formattedUpi);
      } catch (fallbackErr) {
        Alert.alert('Error', 'Could not open UPI app. Please install a UPI payment app.');
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
                <Text style={styles.headerBadgeText}>🔒 SECURE DYNAMIC UPI PAY-IN</Text>
              </View>
              <Text style={styles.title}>INSTANT ADD CASH</Text>
              <Text style={styles.amountText}>₹{amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</Text>
              <Text style={styles.orderSub}>ORDER ID: {orderId}</Text>
            </View>

            {/* Countdown Badge */}
            {isExpired ? (
              <View style={styles.expiredBox}>
                <Text style={styles.expiredText}>🚨 PAYMENT INTENT EXPIRED (5-MIN TIME LIMIT EXCEEDED)</Text>
              </View>
            ) : (
              <View style={styles.timerBadge}>
                <Text style={styles.timerBadgeText}>
                  ⏳ QR EXPIRES IN: <Text style={{ fontWeight: '900', color: '#DC2626' }}>{formatTimer(timeLeft)}</Text>
                </Text>
              </View>
            )}

            {/* Confirmation State Banner */}
            {paymentConfirmed ? (
              <View style={styles.successBanner}>
                <Text style={styles.successIcon}>🎉</Text>
                <Text style={styles.successTitle}>PAYMENT CONFIRMED!</Text>
                <Text style={styles.successSub}>₹{amount} credited to your wallet balance instantly.</Text>
              </View>
            ) : (
              <>
                {/* Real Scannable Dynamic QR */}
                <View style={styles.qrContainer}>
                  <Image
                    source={{
                      uri: `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(
                        upiUri.includes('6261069826-2.wallet@phonepe')
                          ? upiUri
                          : `upi://pay?pa=${encodeURIComponent(realUpiId)}&pn=${encodeURIComponent('Dream Ludo')}&am=${amount.toFixed(2)}&cu=INR&tn=${encodeURIComponent(orderId)}`
                      )}`,
                    }}
                    style={{ width: 180, height: 180, borderRadius: 12 }}
                    resizeMode="contain"
                  />
                  <Text style={styles.scanLabel}>Dynamic Amount QR: ₹{amount.toFixed(2)}</Text>
                </View>

                {/* Real UPI Address Box */}
                <View style={styles.upiPillBox}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.upiPillLabel}>Real Payee UPI ID:</Text>
                    <Text style={styles.upiPillVal} selectable>{realUpiId}</Text>
                  </View>
                  <TouchableOpacity style={[styles.copyBtn, copied && styles.copyBtnSuccess]} onPress={handleCopyUpi}>
                    <Text style={styles.copyBtnText}>{copied ? 'COPIED! ✓' : 'COPY UPI'}</Text>
                  </TouchableOpacity>
                </View>

                {/* Deep Link Quick App Buttons */}
                <Text style={styles.sectionTitle}>CHOOSE UPI APP TO PAY ₹{amount}:</Text>
                <View style={styles.upiAppsContainer}>
                  <TouchableOpacity
                    style={[styles.upiAppBtn, { backgroundColor: '#107C41' }, isExpired && { opacity: 0.5 }]}
                    onPress={() => handleDeepLink('Google Pay', 'gpay')}
                    disabled={isExpired}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.upiAppBtnText}>🟢 Google Pay</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.upiAppBtn, { backgroundColor: '#5F259F' }, isExpired && { opacity: 0.5 }]}
                    onPress={() => handleDeepLink('PhonePe', 'phonepe')}
                    disabled={isExpired}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.upiAppBtnText}>💜 PhonePe</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.upiAppBtn, { backgroundColor: '#00B9F1' }, isExpired && { opacity: 0.5 }]}
                    onPress={() => handleDeepLink('Paytm', 'paytm')}
                    disabled={isExpired}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.upiAppBtnText}>💙 Paytm UPI</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.upiAppBtn, { backgroundColor: '#4F46E5' }, isExpired && { opacity: 0.5 }]}
                    onPress={() => handleDeepLink('Other UPI')}
                    disabled={isExpired}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.upiAppBtnText}>⚡ Any UPI App</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}

            {/* Status indicator */}
            <View style={styles.listeningBox}>
              <ActivityIndicator size="small" color="#4F46E5" />
              <Text style={styles.listeningText}>
                {isProcessing
                  ? 'Awaiting payment confirmation...'
                  : 'Listening for real-time WebSocket payment confirmation...'}
              </Text>
            </View>

            {/* Cancel button */}
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
    marginBottom: 12,
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
    fontSize: 13,
    fontWeight: '900',
    color: '#64748B',
    letterSpacing: 1,
  },
  amountText: {
    fontSize: 30,
    fontWeight: '900',
    color: '#0F172A',
    marginVertical: 2,
  },
  orderSub: {
    fontSize: 10,
    fontWeight: '700',
    color: '#94A3B8',
  },
  timerBadge: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FCA5A5',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    marginBottom: 14,
  },
  timerBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#991B1B',
  },
  expiredBox: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1.5,
    borderColor: '#EF4444',
    padding: 10,
    borderRadius: 12,
    marginBottom: 14,
  },
  expiredText: {
    fontSize: 11,
    fontWeight: '900',
    color: '#991B1B',
    textAlign: 'center',
  },
  qrContainer: {
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    marginBottom: 12,
    width: '100%',
  },
  scanLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#475569',
    marginTop: 8,
  },
  upiPillBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    borderRadius: 14,
    padding: 10,
    width: '100%',
    marginBottom: 14,
    gap: 8,
  },
  upiPillLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: '#64748B',
  },
  upiPillVal: {
    fontSize: 12,
    fontWeight: '900',
    color: '#0F172A',
    marginTop: 1,
  },
  copyBtn: {
    backgroundColor: '#4F46E5',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  copyBtnSuccess: {
    backgroundColor: '#059669',
  },
  copyBtnText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '900',
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: '900',
    color: '#64748B',
    letterSpacing: 0.5,
    marginBottom: 8,
    alignSelf: 'flex-start',
  },
  upiAppsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    width: '100%',
    marginBottom: 14,
  },
  upiAppBtn: {
    flex: 1,
    minWidth: '45%',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  upiAppBtnText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '900',
  },
  listeningBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    padding: 10,
    borderRadius: 10,
    width: '100%',
    marginBottom: 14,
    gap: 8,
  },
  listeningText: {
    fontSize: 10,
    color: '#475569',
    fontWeight: '600',
    flex: 1,
  },
  closeBtn: {
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  closeBtnText: {
    color: '#EF4444',
    fontSize: 11,
    fontWeight: '900',
  },
  successBanner: {
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    padding: 20,
    borderRadius: 16,
    width: '100%',
    marginBottom: 14,
  },
  successIcon: {
    fontSize: 32,
    marginBottom: 6,
  },
  successTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: '#065F46',
  },
  successSub: {
    fontSize: 11,
    color: '#047857',
    marginTop: 2,
  },
});
