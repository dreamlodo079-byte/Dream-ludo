import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  Clipboard,
  ActivityIndicator,
  Image,
  Linking,
  Modal,
} from 'react-native';
import Svg, { Rect, Circle, Path } from 'react-native-svg';
import axios from 'axios';

import { API_SERVER_URL } from '../utils/config';

interface PaymentCheckoutScreenProps {
  currentUser: { _id: string; username: string };
  amount: number;
  onBack: () => void;
  onSuccess?: () => void;
}

export const PaymentCheckoutScreen: React.FC<PaymentCheckoutScreenProps> = ({
  currentUser,
  amount,
  onBack,
  onSuccess,
}) => {
  const [utr, setUtr] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  const [pendingBanner, setPendingBanner] = useState<boolean>(false);
  const [platformUpiId, setPlatformUpiId] = useState<string>('6261069826-2.wallet@phonepe');
  const [platformQrUrl, setPlatformQrUrl] = useState<string>('');

  // 5-Minute Countdown Timer (300 seconds)
  const [timeLeft, setTimeLeft] = useState<number>(300);
  const [isExpired, setIsExpired] = useState<boolean>(false);

  // Custom Cancel Confirmation Modal State
  const [showCancelModal, setShowCancelModal] = useState<boolean>(false);

  const numAmount = Math.max(1, amount);
  const dynamicUpiUrl = `upi://pay?pa=${encodeURIComponent(platformUpiId)}&pn=${encodeURIComponent('Dream Ludo')}&am=${numAmount.toFixed(2)}&cu=INR`;

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const res = await axios.get(`${API_SERVER_URL}/api/v1/wallet/config`);
        if (res.data.success) {
          if (res.data.platformUpiId) setPlatformUpiId(res.data.platformUpiId);
          if (res.data.platformQrUrl) setPlatformQrUrl(res.data.platformQrUrl);
        }
      } catch (err) {
        // Fallback to defaults
      }
    };
    fetchConfig();
  }, []);

  // 5-minute timer countdown ticker
  useEffect(() => {
    if (timeLeft <= 0) {
      setIsExpired(true);
      return;
    }
    const timerId = setInterval(() => {
      setTimeLeft((prev) => prev - 1);
    }, 1000);

    return () => clearInterval(timerId);
  }, [timeLeft]);

  const formatTimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleRegenerateQr = () => {
    setTimeLeft(300);
    setIsExpired(false);
  };

  const handleCopyUpi = () => {
    Clipboard.setString(platformUpiId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleCancelCheckout = () => {
    setShowCancelModal(true);
  };

  const handleSubmitDeposit = async () => {
    if (isExpired) {
      Alert.alert('Payment Intent Expired', 'This 5-minute QR code has expired. Please tap "Regenerate QR Code" to generate a fresh request.');
      return;
    }

    const cleanUtr = utr.trim();
    if (!cleanUtr || cleanUtr.length < 6) {
      Alert.alert('Invalid UTR', 'Please enter a valid 12-digit UTR / Bank Reference Number from your payment receipt.');
      return;
    }

    try {
      setIsSubmitting(true);
      const res = await axios.post(`${API_SERVER_URL}/api/v1/wallet/deposit/request`, {
        userId: currentUser._id,
        amount: numAmount,
        utr: cleanUtr,
      });

      if (res.data.success) {
        setPendingBanner(true);
        setUtr('');
        setTimeout(() => {
          if (onSuccess) onSuccess();
        }, 1500);
      }
    } catch (err: any) {
      const errorMsg = err.response?.data?.error || err.message || 'Failed to process deposit.';
      Alert.alert('Deposit Notice', errorMsg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      {/* Top Header */}
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.backBtn} onPress={handleCancelCheckout} activeOpacity={0.8}>
          <Text style={styles.backBtnText}>◀ Back to Wallet</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>UPI CHECKOUT</Text>
      </View>

      {/* Instant Success Banner */}
      {pendingBanner && (
        <View style={[styles.banner, { backgroundColor: '#DCFCE7', borderColor: '#10B981' }]}>
          <Text style={styles.bannerIcon}>🎉</Text>
          <View style={{ flex: 1 }}>
            <Text style={[styles.bannerTitle, { color: '#065F46' }]}>PAYMENT CONFIRMED & CREDITED!</Text>
            <Text style={[styles.bannerSub, { color: '#047857' }]}>
              ₹{numAmount.toFixed(2)} deposit credited to your wallet balance automatically.
            </Text>
          </View>
        </View>
      )}

      {/* 5-Minute Timer Expiry Banner */}
      {isExpired ? (
        <View style={styles.expiredBanner}>
          <Text style={styles.expiredIcon}>🚨</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.expiredTitle}>DYNAMIC QR EXPIRES (5 MIN LIMIT)</Text>
            <Text style={styles.expiredSub}>This 5-minute payment session has expired. Tap below to generate a fresh QR code.</Text>
          </View>
          <TouchableOpacity style={styles.regenerateBtn} onPress={handleRegenerateQr}>
            <Text style={styles.regenerateBtnText}>🔄 REGENERATE</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.timerBadge}>
          <Text style={styles.timerBadgeIcon}>⏳</Text>
          <Text style={styles.timerBadgeText}>
            DYNAMIC QR EXPIRES IN: <Text style={{ fontWeight: '900', color: '#DC2626' }}>{formatTimer(timeLeft)}</Text>
          </Text>
        </View>
      )}

      {/* Main Checkout Card */}
      <View style={styles.card}>
        <View style={styles.cardHeaderRow}>
          <Text style={styles.stepHeader}>AMOUNT TO PAY:</Text>
          <Text style={styles.amountBadge}>₹{numAmount.toFixed(2)}</Text>
        </View>
        <Text style={styles.stepSub}>Scan Dynamic QR or copy UPI ID below to complete your payment</Text>

        {/* Dynamic Amount QR Container */}
        <View style={styles.qrContainer}>
          <Image
            source={{
              uri:
                platformQrUrl && platformQrUrl.trim() !== ''
                  ? platformQrUrl
                  : `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(dynamicUpiUrl)}`,
            }}
            style={styles.uploadedQrImage}
            resizeMode="contain"
          />
          <Text style={styles.qrAmountNotice}>Dynamic Amount QR: ₹{numAmount.toFixed(2)}</Text>
        </View>

        {/* Real Payee UPI ID Box */}
        <View style={styles.upiPillRow}>
          <View style={styles.upiAddressBox}>
            <Text style={styles.upiLabel}>Official Payee UPI ID:</Text>
            <Text style={styles.upiText} numberOfLines={1} selectable>{platformUpiId}</Text>
          </View>
          <TouchableOpacity style={[styles.copyBtn, copied && styles.copyBtnSuccess]} onPress={handleCopyUpi}>
            <Text style={styles.copyBtnText}>{copied ? 'COPIED! ✓' : 'COPY UPI'}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Step 2: 12-Digit UTR Submission Card */}
      <View style={styles.card}>
        <Text style={styles.stepHeader}>STEP 2: SUBMIT 12-DIGIT UTR / REFERENCE NO.</Text>
        <Text style={styles.stepSub}>Enter the 12-digit UTR reference number from your completed UPI payment receipt</Text>

        <Text style={styles.fieldLabel}>12-Digit UTR / Bank Reference Number</Text>
        <View style={styles.inputWrapper}>
          <TextInput
            style={[styles.input, { fontSize: 16 }]}
            keyboardType="default"
            value={utr}
            onChangeText={(val) => setUtr(val.trim())}
            placeholder="e.g. 420192837461"
            placeholderTextColor="#94A3B8"
            maxLength={30}
          />
        </View>

        <TouchableOpacity
          style={[styles.submitBtn, (isSubmitting || isExpired) && { opacity: 0.6 }]}
          onPress={handleSubmitDeposit}
          disabled={isSubmitting || isExpired}
          activeOpacity={0.85}
        >
          {isSubmitting ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <Text style={styles.submitBtnText}>
              {isExpired ? '🚨 PAYMENT EXPIRED (REGENERATE ABOVE)' : 'SUBMIT DEPOSIT FOR VERIFICATION ➔'}
            </Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Custom Premium Cancel Confirmation Modal */}
      {showCancelModal && (
        <Modal visible={true} transparent animationType="fade" onRequestClose={() => setShowCancelModal(false)}>
          <View style={styles.cancelOverlay}>
            <View style={styles.cancelCard}>
              <View style={styles.cancelIconCircle}>
                <Text style={{ fontSize: 28 }}>⚠️</Text>
              </View>
              <Text style={styles.cancelTitle}>Cancel Checkout Session?</Text>
              <Text style={styles.cancelMessage}>
                Are you sure you want to cancel this checkout? Your dynamic QR code for ₹{numAmount.toFixed(2)} will be discarded.
              </Text>

              <View style={styles.cancelBtnRow}>
                <TouchableOpacity
                  style={styles.keepPayingBtn}
                  onPress={() => setShowCancelModal(false)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.keepPayingBtnText}>KEEP PAYING</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.confirmCancelBtn}
                  onPress={() => {
                    setShowCancelModal(false);
                    onBack();
                  }}
                  activeOpacity={0.8}
                >
                  <Text style={styles.confirmCancelBtnText}>CANCEL CHECKOUT</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  content: {
    padding: 16,
    paddingBottom: 140,
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  backBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: '#E2E8F0',
    borderRadius: 10,
    marginRight: 12,
  },
  backBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#334155',
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: 0.5,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    borderWidth: 1.5,
    borderColor: '#F59E0B',
    borderRadius: 16,
    padding: 14,
    marginBottom: 16,
    gap: 12,
  },
  bannerIcon: {
    fontSize: 28,
  },
  bannerTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: '#92400E',
  },
  bannerSub: {
    fontSize: 11,
    color: '#78350F',
    marginTop: 2,
    lineHeight: 15,
  },
  timerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FEF2F2',
    borderWidth: 1.5,
    borderColor: '#FCA5A5',
    borderRadius: 14,
    paddingVertical: 8,
    paddingHorizontal: 14,
    marginBottom: 14,
    gap: 8,
  },
  timerBadgeIcon: {
    fontSize: 14,
  },
  timerBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#991B1B',
    letterSpacing: 0.5,
  },
  expiredBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    borderWidth: 1.5,
    borderColor: '#EF4444',
    borderRadius: 16,
    padding: 14,
    marginBottom: 16,
    gap: 10,
  },
  expiredIcon: {
    fontSize: 24,
  },
  expiredTitle: {
    fontSize: 12,
    fontWeight: '900',
    color: '#991B1B',
  },
  expiredSub: {
    fontSize: 10,
    color: '#B91C1C',
    marginTop: 2,
  },
  regenerateBtn: {
    backgroundColor: '#DC2626',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  regenerateBtnText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '900',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 18,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    marginBottom: 16,
    width: '100%',
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  stepHeader: {
    fontSize: 12,
    fontWeight: '900',
    color: '#4F46E5',
    letterSpacing: 0.8,
  },
  amountBadge: {
    fontSize: 14,
    fontWeight: '900',
    color: '#059669',
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  stepSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
    marginBottom: 14,
  },
  qrContainer: {
    alignItems: 'center',
    alignSelf: 'center',
    padding: 14,
    backgroundColor: '#F1F5F9',
    borderRadius: 16,
    marginBottom: 14,
    width: '100%',
  },
  uploadedQrImage: {
    width: 180,
    height: 180,
    borderRadius: 12,
  },
  qrAmountNotice: {
    fontSize: 11,
    fontWeight: '800',
    color: '#475569',
    marginTop: 8,
  },
  upiPillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    borderRadius: 14,
    padding: 10,
    gap: 8,
  },
  upiAddressBox: {
    flex: 1,
    marginRight: 4,
  },
  upiLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: '#64748B',
    textTransform: 'uppercase',
  },
  upiText: {
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
    fontSize: 11,
    fontWeight: '900',
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#475569',
    marginBottom: 6,
    marginTop: 4,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    borderRadius: 14,
    paddingHorizontal: 14,
    height: 48,
    marginBottom: 12,
  },
  input: {
    flex: 1,
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  submitBtn: {
    backgroundColor: '#059669',
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  submitBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  cancelOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  cancelCard: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
  },
  cancelIconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#FEF3C7',
    borderWidth: 2,
    borderColor: '#F59E0B',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  cancelTitle: {
    fontSize: 17,
    fontWeight: '900',
    color: '#0F172A',
    marginBottom: 8,
    textAlign: 'center',
  },
  cancelMessage: {
    fontSize: 12,
    color: '#475569',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 20,
    fontWeight: '600',
  },
  cancelBtnRow: {
    flexDirection: 'row',
    gap: 10,
    width: '100%',
  },
  keepPayingBtn: {
    flex: 1,
    backgroundColor: '#4F46E5',
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keepPayingBtnText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  confirmCancelBtn: {
    flex: 1,
    backgroundColor: '#FEE2E2',
    borderWidth: 1.5,
    borderColor: '#FCA5A5',
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmCancelBtnText: {
    color: '#991B1B',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
});
