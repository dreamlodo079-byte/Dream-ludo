import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import axios from 'axios';

import { API_SERVER_URL } from '../utils/config';

interface WithdrawMoneyScreenProps {
  currentUser: { _id: string; username: string };
  balances: {
    deposits: number;
    winnings: number;
    bonus: number;
    locked: number;
    total: number;
  };
  onBack?: () => void;
  onSuccess?: () => void;
}

export const WithdrawMoneyScreen: React.FC<WithdrawMoneyScreenProps> = ({
  currentUser,
  balances,
  onBack,
  onSuccess,
}) => {
  const [amount, setAmount] = useState<string>('');
  const [upiId, setUpiId] = useState<string>((currentUser as any)?.upiId || '');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [successBanner, setSuccessBanner] = useState<boolean>(false);

  // Local optimistic balance tracking
  const [localWinnings, setLocalWinnings] = useState<number>(balances.winnings || 0);
  const [localLocked, setLocalLocked] = useState<number>(balances.locked || 0);

  const handleWithdrawSubmit = async () => {
    const numAmount = Number(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid withdrawal amount.');
      return;
    }

    if (numAmount > localWinnings) {
      Alert.alert(
        'Insufficient Winning Balance',
        `You can only withdraw your Winnings Balance (₹${localWinnings.toFixed(2)}). Deposit & bonus cash cannot be withdrawn.`
      );
      return;
    }

    const cleanUpi = upiId.trim();
    if (!cleanUpi || !cleanUpi.includes('@')) {
      Alert.alert('Invalid UPI ID', 'Please enter a valid UPI ID (e.g. name@bank or 9876543210@upi).');
      return;
    }

    try {
      setIsSubmitting(true);
      const res = await axios.post(`${API_SERVER_URL}/api/v1/wallet/withdraw/request`, {
        userId: currentUser._id,
        amount: numAmount,
        upiId: cleanUpi,
      });

      if (res.data.success) {
        // Optimistically update local balances
        setLocalWinnings((prev) => Math.max(0, prev - numAmount));
        setLocalLocked((prev) => prev + numAmount);
        setSuccessBanner(true);
        setAmount('');

        if (onSuccess) onSuccess();
      }
    } catch (err: any) {
      const errorMsg = err.response?.data?.error || err.message || 'Failed to submit withdrawal request.';
      Alert.alert('Withdrawal Error', errorMsg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      {/* Top Bar */}
      <View style={styles.topBar}>
        {onBack && (
          <TouchableOpacity style={styles.backBtn} onPress={onBack}>
            <Text style={styles.backBtnText}>◀ Back</Text>
          </TouchableOpacity>
        )}
        <Text style={styles.headerTitle}>WITHDRAW WINNINGS (MANUAL PAYOUT)</Text>
      </View>

      {/* Confirmation Banner */}
      {successBanner && (
        <View style={styles.banner}>
          <Text style={styles.bannerIcon}>✅</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.bannerTitle}>Withdrawal Request Submitted ✅</Text>
            <Text style={styles.bannerSub}>Funds moved to Locked Balance. Your payout request is under review and will be settled to your UPI ID within 24 hours.</Text>
          </View>
        </View>
      )}

      {/* Wallet Balances Summary Card */}
      <View style={styles.balanceCard}>
        <Text style={styles.balanceCardTitle}>YOUR ACCOUNT BALANCES</Text>
        <View style={styles.balanceGrid}>
          <View style={styles.balanceItem}>
            <Text style={styles.balanceLabel}>Withdrawable Winnings</Text>
            <Text style={styles.balanceWinningsValue}>₹{localWinnings.toFixed(2)}</Text>
          </View>
          <View style={styles.balanceItem}>
            <Text style={styles.balanceLabel}>Pending Locked</Text>
            <Text style={styles.balanceLockedValue}>₹{localLocked.toFixed(2)}</Text>
          </View>
        </View>

        <View style={styles.policyNoticeBox}>
          <Text style={styles.policyNoticeText}>
            ℹ️ <Text style={{ fontWeight: '800' }}>Withdrawal Policy:</Text> Only Winnings Balance can be withdrawn via UPI/IMPS. Deposit cash & bonus rewards are strictly reserved for match entry.
          </Text>
        </View>
      </View>

      {/* Withdrawal Form Card */}
      <View style={styles.card}>
        <Text style={styles.stepHeader}>ENTER WITHDRAWAL DETAILS</Text>
        <Text style={styles.stepSub}>Enter amount and destination UPI ID for instant IMPS transfer</Text>

        <Text style={styles.fieldLabel}>Withdrawal Amount (₹)</Text>
        <View style={styles.inputWrapper}>
          <Text style={styles.currencyPrefix}>₹</Text>
          <TextInput
            style={styles.input}
            keyboardType="numeric"
            value={amount}
            onChangeText={(val) => setAmount(val.replace(/[^0-9]/g, ''))}
            placeholder="Enter Amount to Withdraw"
            placeholderTextColor="#94A3B8"
          />
        </View>

        <Text style={styles.fieldLabel}>Destination UPI ID</Text>
        <View style={styles.inputWrapper}>
          <TextInput
            style={[styles.input, { fontSize: 14 }]}
            keyboardType="email-address"
            autoCapitalize="none"
            value={upiId}
            onChangeText={(val) => setUpiId(val.trim())}
            placeholder="e.g. mobile@upi or name@okaxis"
            placeholderTextColor="#94A3B8"
          />
        </View>

        <TouchableOpacity
          style={[styles.submitBtn, isSubmitting && { opacity: 0.7 }]}
          onPress={handleWithdrawSubmit}
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <Text style={styles.submitBtnText}>REQUEST MANUAL UPI WITHDRAWAL ➔</Text>
          )}
        </TouchableOpacity>
      </View>
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
    paddingBottom: 40,
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
    fontSize: 14,
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: 0.5,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    borderWidth: 1.5,
    borderColor: '#10B981',
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
    color: '#065F46',
  },
  bannerSub: {
    fontSize: 11,
    color: '#047857',
    marginTop: 2,
    lineHeight: 15,
  },
  balanceCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 18,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    marginBottom: 16,
  },
  balanceCardTitle: {
    fontSize: 11,
    fontWeight: '900',
    color: '#4F46E5',
    letterSpacing: 0.8,
    marginBottom: 12,
  },
  balanceGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  balanceItem: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  balanceLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
  },
  balanceWinningsValue: {
    fontSize: 18,
    fontWeight: '900',
    color: '#059669',
    marginTop: 4,
  },
  balanceLockedValue: {
    fontSize: 18,
    fontWeight: '900',
    color: '#D97706',
    marginTop: 4,
  },
  policyNoticeBox: {
    backgroundColor: '#EFF6FF',
    borderRadius: 12,
    padding: 10,
    marginTop: 12,
  },
  policyNoticeText: {
    fontSize: 10,
    color: '#1E3A8A',
    lineHeight: 14,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 18,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    marginBottom: 16,
  },
  stepHeader: {
    fontSize: 12,
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: 0.8,
  },
  stepSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
    marginBottom: 14,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#475569',
    marginBottom: 6,
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
    marginBottom: 14,
  },
  currencyPrefix: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0F172A',
    marginRight: 8,
  },
  input: {
    flex: 1,
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  submitBtn: {
    backgroundColor: '#4F46E5',
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    marginTop: 6,
  },
  submitBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
});
