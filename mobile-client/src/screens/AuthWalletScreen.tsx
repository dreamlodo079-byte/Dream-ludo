import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import axios from 'axios';
import { useWallet } from '../hooks/useWallet';

const API_SERVER_URL = process.env.EXPO_PUBLIC_SERVER_URL || 'http://localhost:5000';

interface UserProfile {
  _id: string;
  phone: string;
  username: string;
}

interface AuthWalletScreenProps {
  onLoginSuccess: (user: UserProfile) => void;
  currentUser: UserProfile | null;
  onLogout?: () => void;
}

export const AuthWalletScreen: React.FC<AuthWalletScreenProps> = ({
  onLoginSuccess,
  currentUser,
  onLogout,
}) => {
  const { balances, history, loading, error, fetchWallet, addCash, withdrawWinnings } = useWallet();

  // Auth States
  const [phone, setPhone] = useState('');
  const [username, setUsername] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // FinTech Action States
  const [depositAmount, setDepositAmount] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [upiId, setUpiId] = useState('');
  const [upiIntentLink, setUpiIntentLink] = useState<string | null>(null);
  const [activeTxnId, setActiveTxnId] = useState<string | null>(null);

  useEffect(() => {
    if (currentUser) {
      fetchWallet(currentUser._id);
    }
  }, [currentUser, fetchWallet]);

  const handleLogin = async () => {
    if (!phone || !username) {
      Alert.alert('Authentication Error', 'Please specify phone number and username.');
      return;
    }
    setIsLoggingIn(true);
    try {
      const response = await axios.post(`${API_SERVER_URL}/api/users/login`, {
        phone,
        username,
      });
      if (response.data.success) {
        onLoginSuccess(response.data.user);
      }
    } catch (err: any) {
      Alert.alert('Authentication Error', err.response?.data?.error || err.message);
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleDeposit = async () => {
    if (!currentUser) return;
    const amount = Number(depositAmount);
    if (isNaN(amount) || amount <= 0) {
      Alert.alert('Deposit Error', 'Please enter a valid deposit amount.');
      return;
    }

    const result = await addCash(currentUser._id, amount);
    if (result.success && result.upiIntent && result.transactionId) {
      setUpiIntentLink(result.upiIntent);
      setActiveTxnId(result.transactionId);
      Alert.alert('Payment Intent Created', `Redirecting to payment apps for: ${amount} INR`);
    } else {
      Alert.alert('Deposit Failed', result.error || 'Server rejected request');
    }
  };

  // Simulated Webhook trigger to settle payment (extremely useful for test verification!)
  const simulatePaymentWebhook = async () => {
    if (!currentUser || !activeTxnId) return;
    try {
      await axios.post(`${API_SERVER_URL}/api/payments/simulate-success`, {
        userId: currentUser._id,
        transactionId: activeTxnId,
        amount: Number(depositAmount),
      });

      Alert.alert('Payment Success', 'Mock payment verified successfully! Balance updated.');
      setUpiIntentLink(null);
      setActiveTxnId(null);
      setDepositAmount('');
      fetchWallet(currentUser._id);
    } catch (err: any) {
      Alert.alert('Simulated Webhook Error', err.response?.data?.error || err.message);
    }
  };

  const handleWithdrawal = async () => {
    if (!currentUser) return;
    const amount = Number(withdrawAmount);
    if (isNaN(amount) || amount <= 0) {
      Alert.alert('Withdrawal Error', 'Please enter a valid amount.');
      return;
    }
    if (!upiId) {
      Alert.alert('Withdrawal Error', 'Please enter a target UPI ID.');
      return;
    }

    const result = await withdrawWinnings(currentUser._id, amount, upiId);
    if (result.success) {
      Alert.alert('Withdrawal Successful', 'IMPS transfer completed. Winnings balance locked and settled.');
      setWithdrawAmount('');
      setUpiId('');
    } else {
      Alert.alert('Withdrawal Failed', result.error || 'Server rejected payout');
    }
  };

  if (!currentUser) {
    return (
      <View style={styles.authContainer}>
        <View style={styles.authCard}>
          <Text style={styles.heading}>LUDO CHAMPION</Text>
          <Text style={styles.subheading}>Real-Money Mobile Portal</Text>

          <TextInput
            style={styles.input}
            placeholder="Username"
            placeholderTextColor="#888"
            value={username}
            onChangeText={setUsername}
          />
          <TextInput
            style={styles.input}
            placeholder="Phone Number"
            placeholderTextColor="#888"
            keyboardType="phone-pad"
            value={phone}
            onChangeText={setPhone}
          />

          <TouchableOpacity style={styles.authButton} onPress={handleLogin} disabled={isLoggingIn}>
            {isLoggingIn ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.authButtonText}>ENTER PLATFORM</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <Text style={styles.usernameHeader}>Welcome, {currentUser.username}</Text>

      {/* Wallet Balance Card */}
      <View style={styles.balanceCard}>
        <Text style={styles.balanceTitle}>TOTAL ACCUMULATED WALLET</Text>
        <Text style={styles.balanceAmount}>{balances.total.toFixed(2)} INR</Text>

        <View style={styles.splitBalances}>
          <View style={styles.splitNode}>
            <Text style={styles.splitLabel}>Deposits Cash</Text>
            <Text style={styles.splitVal}>{balances.deposits.toFixed(2)} INR</Text>
          </View>
          <View style={[styles.splitNode, styles.borderLeft]}>
            <Text style={styles.splitLabel}>Winnings Cash</Text>
            <Text style={[styles.splitVal, styles.greenText]}>{balances.winnings.toFixed(2)} INR</Text>
          </View>
        </View>
      </View>

      {/* Deposit cash portal */}
      <View style={styles.actionCard}>
        <Text style={styles.cardHeader}>ADD PLAYING FUNDS</Text>
        <TextInput
          style={styles.input}
          placeholder="Enter Deposit Amount (INR)"
          placeholderTextColor="#888"
          keyboardType="numeric"
          value={depositAmount}
          onChangeText={setDepositAmount}
        />
        <TouchableOpacity style={styles.actionBtn} onPress={handleDeposit} disabled={loading}>
          <Text style={styles.actionBtnText}>GENERATE UPI INTENT</Text>
        </TouchableOpacity>

        {upiIntentLink && (
          <View style={styles.intentContainer}>
            <Text style={styles.intentText} numberOfLines={1}>{upiIntentLink}</Text>
            <TouchableOpacity style={styles.verifyBtn} onPress={simulatePaymentWebhook}>
              <Text style={styles.actionBtnText}>SIMULATE WEBHOOK SUCCESS</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Withdrawal Winnings Portal */}
      <View style={styles.actionCard}>
        <Text style={styles.cardHeader}>WITHDRAW WINNINGS INSTANTLY</Text>
        <TextInput
          style={styles.input}
          placeholder="Withdraw Amount (INR)"
          placeholderTextColor="#888"
          keyboardType="numeric"
          value={withdrawAmount}
          onChangeText={setWithdrawAmount}
        />
        <TextInput
          style={styles.input}
          placeholder="Recipient UPI ID (e.g. name@upi)"
          placeholderTextColor="#888"
          value={upiId}
          onChangeText={setUpiId}
          autoCapitalize="none"
        />
        <TouchableOpacity style={[styles.actionBtn, styles.withdrawBtn]} onPress={handleWithdrawal} disabled={loading}>
          <Text style={styles.actionBtnText}>WITHDRAW TO BANK (IMPS)</Text>
        </TouchableOpacity>
      </View>

      {/* Ledger History List */}
      <View style={styles.historyCard}>
        <Text style={styles.cardHeader}>LEDGER JOURNAL LOGS</Text>
        {history.length === 0 ? (
          <Text style={styles.noHistory}>No transaction history found.</Text>
        ) : (
          history.map((txn) => (
            <View key={txn._id} style={styles.txnRow}>
              <View>
                <Text style={styles.txnType}>{txn.type}</Text>
                <Text style={styles.txnDate}>{new Date(txn.createdAt).toLocaleDateString()}</Text>
                <Text style={styles.txnRef} numberOfLines={1}>Ref: {txn.referenceId}</Text>
              </View>
              <View style={styles.txnRight}>
                <Text style={[styles.txnAmount, txn.amount < 0 ? styles.redText : styles.greenText]}>
                  {txn.amount > 0 ? `+${txn.amount}` : txn.amount}
                </Text>
                <Text style={[styles.txnStatus, styles[txn.status.toLowerCase() as keyof typeof styles || 'pending']]}>
                  {txn.status}
                </Text>
              </View>
            </View>
          ))
        )}
      </View>

      {/* Account Settings & Compliance */}
      {currentUser && (
        <View style={styles.complianceCard}>
          <Text style={styles.cardHeader}>ACCOUNT & COMPLIANCE</Text>
          
          <TouchableOpacity style={styles.complianceRow} onPress={() => Alert.alert('Payout Settings', 'Payout configuration settings. Managed via RazorpayX / Cashfree Payout keys.')}>
            <Text style={styles.complianceText}>⚙ Payout Settings</Text>
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.complianceRow} onPress={() => Alert.alert('Responsible Gaming', 'Responsible Gaming Guidelines:\n1. Play in moderation.\n2. Set limits on deposits.\n3. Must be 18+ to play.')}>
            <Text style={styles.complianceText}>🛡 Responsible Gaming</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.complianceRow} onPress={() => Alert.alert('Refund Policy', 'Refund Policy:\n1. Entry fees for started matches are non-refundable.\n2. Failed deposits are credited back within 5 working days.')}>
            <Text style={styles.complianceText}>📄 Refund Policy</Text>
          </TouchableOpacity>

          {onLogout && (
            <TouchableOpacity style={[styles.complianceRow, styles.logoutRow]} onPress={onLogout}>
              <Text style={styles.logoutText}>📴 Logout Account</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {error && <Text style={styles.errorText}>Error: {error}</Text>}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F0F12',
  },
  contentContainer: {
    padding: 20,
    paddingBottom: 40,
  },
  authContainer: {
    flex: 1,
    backgroundColor: '#0E0E11',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  authCard: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#16161E',
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: '#2D2D3A',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
  },
  heading: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FF4D4D',
    textAlign: 'center',
    letterSpacing: 2,
  },
  subheading: {
    fontSize: 14,
    color: '#8A8A9E',
    textAlign: 'center',
    marginBottom: 30,
  },
  input: {
    backgroundColor: '#20202A',
    borderRadius: 8,
    padding: 12,
    color: '#FFF',
    fontSize: 15,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#34344A',
  },
  authButton: {
    backgroundColor: '#FF4D4D',
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
    marginTop: 10,
  },
  authButtonText: {
    color: '#FFF',
    fontWeight: 'bold',
    fontSize: 16,
    letterSpacing: 1,
  },
  usernameHeader: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#FFF',
    marginBottom: 15,
  },
  balanceCard: {
    backgroundColor: '#1B1B25',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#3A3A4E',
    marginBottom: 20,
  },
  balanceTitle: {
    fontSize: 12,
    color: '#A2A2B5',
    letterSpacing: 1,
    fontWeight: '600',
  },
  balanceAmount: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#FFF',
    marginVertical: 10,
  },
  splitBalances: {
    flexDirection: 'row',
    marginTop: 15,
    borderTopWidth: 1,
    borderTopColor: '#303040',
    paddingTop: 15,
  },
  splitNode: {
    flex: 1,
  },
  borderLeft: {
    borderLeftWidth: 1,
    borderLeftColor: '#303040',
    paddingLeft: 20,
  },
  splitLabel: {
    fontSize: 11,
    color: '#8C8C9E',
  },
  splitVal: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFF',
    marginTop: 2,
  },
  greenText: {
    color: '#00E676',
  },
  redText: {
    color: '#FF5252',
  },
  actionCard: {
    backgroundColor: '#16161F',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#2F2F3D',
    marginBottom: 16,
  },
  cardHeader: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFF',
    marginBottom: 12,
    letterSpacing: 0.5,
  },
  actionBtn: {
    backgroundColor: '#2979FF',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
  },
  withdrawBtn: {
    backgroundColor: '#FF6D00',
  },
  actionBtnText: {
    color: '#FFF',
    fontWeight: '700',
    fontSize: 14,
  },
  intentContainer: {
    marginTop: 12,
    padding: 10,
    backgroundColor: '#20202A',
    borderRadius: 8,
  },
  intentText: {
    color: '#8A8A9E',
    fontSize: 11,
    marginBottom: 8,
  },
  verifyBtn: {
    backgroundColor: '#00E676',
    borderRadius: 6,
    padding: 10,
    alignItems: 'center',
  },
  historyCard: {
    backgroundColor: '#16161F',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#2F2F3D',
  },
  noHistory: {
    color: '#6E6E7E',
    textAlign: 'center',
    paddingVertical: 15,
  },
  txnRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#252533',
  },
  txnType: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '600',
  },
  txnDate: {
    color: '#6E6E7E',
    fontSize: 11,
    marginTop: 2,
  },
  txnRef: {
    color: '#555566',
    fontSize: 10,
    marginTop: 2,
    width: 140,
  },
  txnRight: {
    alignItems: 'flex-end',
  },
  txnAmount: {
    fontSize: 14,
    fontWeight: '700',
  },
  txnStatus: {
    fontSize: 10,
    fontWeight: '700',
    marginTop: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden',
  },
  success: {
    backgroundColor: '#00E67633',
    color: '#00E676',
  },
  pending: {
    backgroundColor: '#FFD60033',
    color: '#FFD600',
  },
  failed: {
    backgroundColor: '#FF174433',
    color: '#FF1744',
  },
  errorText: {
    color: '#FF1744',
    textAlign: 'center',
    marginTop: 15,
  },
  complianceCard: {
    backgroundColor: '#16161F',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#2F2F3D',
    marginTop: 16,
    marginBottom: 10,
  },
  complianceRow: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#252533',
  },
  complianceText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '500',
  },
  logoutRow: {
    borderBottomWidth: 0,
    marginTop: 5,
  },
  logoutText: {
    color: '#FF5252',
    fontSize: 14,
    fontWeight: 'bold',
  },
});
export default AuthWalletScreen;
