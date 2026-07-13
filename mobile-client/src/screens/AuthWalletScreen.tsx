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
  Clipboard,
  Linking,
} from 'react-native';
import Svg, { Rect, Path, G, Defs, LinearGradient, Stop, Circle, Line, Polyline } from 'react-native-svg';
import axios from 'axios';
import { useWallet } from '../hooks/useWallet';

const API_SERVER_URL = process.env.EXPO_PUBLIC_SERVER_URL || 'http://localhost:5000';

interface UserProfile {
  _id: string;
  phone: string;
  username: string;
  isKycVerified?: boolean;
  kycStatus?: 'NONE' | 'PENDING' | 'APPROVED' | 'REJECTED';
  kycType?: 'PAN' | 'AADHAAR' | null;
  kycDocumentNumber?: string | null;
  kycName?: string | null;
}

interface AuthWalletScreenProps {
  onLoginSuccess: (user: UserProfile) => void;
  currentUser: UserProfile | null;
  onLogout?: () => void;
  onUserUpdate?: (user: UserProfile) => void;
}

// Vector Icon Drawings using SVG paths to avoid bitmap dependency issues
const UserIcon = () => (
  <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#6366F1" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <Path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    <Circle cx="12" cy="7" r="4" />
  </Svg>
);

const ShieldIcon = () => (
  <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#6366F1" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <Path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
  </Svg>
);

const BookTextIcon = () => (
  <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#6366F1" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <Path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
    <Path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
  </Svg>
);

const KeyIcon = () => (
  <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#6366F1" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <Path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
  </Svg>
);

const PowerIcon = () => (
  <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <Path d="M18.36 6.64a9 9 0 1 1-12.73 0" />
    <Line x1="12" y1="2" x2="12" y2="12" />
  </Svg>
);

export const AuthWalletScreen: React.FC<AuthWalletScreenProps> = ({
  onLoginSuccess,
  currentUser,
  onLogout,
  onUserUpdate,
}) => {
  const { balances, history, loading, error, fetchWallet, addCash, withdrawWinnings } = useWallet();

  // Auth States
  const [phone, setPhone] = useState('');
  const [username, setUsername] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // Focus tracking for soft input rings
  const [isFocusedPhone, setIsFocusedPhone] = useState(false);
  const [isFocusedUsername, setIsFocusedUsername] = useState(false);
  const [isFocusedDeposit, setIsFocusedDeposit] = useState(false);
  const [isFocusedWithdraw, setIsFocusedWithdraw] = useState(false);
  const [isFocusedUpi, setIsFocusedUpi] = useState(false);
  const [isFocusedKycName, setIsFocusedKycName] = useState(false);
  const [isFocusedKycDoc, setIsFocusedKycDoc] = useState(false);

  // FinTech Action States
  const [depositAmount, setDepositAmount] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [upiId, setUpiId] = useState('');
  const [upiIntentLink, setUpiIntentLink] = useState<string | null>(null);
  const [activeTxnId, setActiveTxnId] = useState<string | null>(null);

  // KYC States
  const [kycType, setKycType] = useState<'PAN' | 'AADHAAR'>('PAN');
  const [kycName, setKycName] = useState('');
  const [kycDocNum, setKycDocNum] = useState('');
  const [isSubmittingKyc, setIsSubmittingKyc] = useState(false);

  const referralCode = 'NEXUS50SEXUS';
  const referralUrl = `https://sexus.platform/signup?ref=${referralCode}`;

  useEffect(() => {
    if (currentUser) {
      fetchWallet(currentUser._id).then((updatedUser) => {
        if (updatedUser && onUserUpdate) {
          if (
            updatedUser.isKycVerified !== currentUser.isKycVerified ||
            updatedUser.kycStatus !== currentUser.kycStatus ||
            updatedUser.kycType !== currentUser.kycType ||
            updatedUser.kycDocumentNumber !== currentUser.kycDocumentNumber ||
            updatedUser.kycName !== currentUser.kycName
          ) {
            onUserUpdate(updatedUser);
          }
        }
      });
    }
  }, [currentUser?._id, fetchWallet]);

  const handleLogin = async () => {
    if (!phone || !username) {
      Alert.alert('Authentication Error', 'Please specify phone number and username.');
      return;
    }

    const phoneRegex = /^(?:\+91|91)?[6789]\d{9}$/;
    if (!phoneRegex.test(phone.trim())) {
      Alert.alert('Authentication Error', 'Invalid Phone Number: Please enter a valid 10-digit Indian phone number.');
      return;
    }

    setIsLoggingIn(true);
    try {
      const response = await axios.post(`${API_SERVER_URL}/api/users/login`, {
        phone,
        username,
      });
      if (response.data.success) {
        axios.defaults.headers.common['x-auth-token'] = response.data.token;
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

  const handleSubmitKyc = async () => {
    if (!currentUser) return;
    if (!kycName.trim() || !kycDocNum.trim()) {
      Alert.alert('KYC Error', 'Please enter your full name and document number.');
      return;
    }

    // Explicit format character entry verification constraints
    const normalizedDoc = kycDocNum.trim();
    if (kycType === 'PAN') {
      const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
      if (!panRegex.test(normalizedDoc.toUpperCase())) {
        Alert.alert('Format Error', 'Invalid PAN number format. Must be like ABCDE1234F.');
        return;
      }
    } else {
      const cleanAadhaar = normalizedDoc.replace(/\s|-/g, '');
      const aadhaarRegex = /^\d{12}$/;
      if (!aadhaarRegex.test(cleanAadhaar)) {
        Alert.alert('Format Error', 'Invalid Aadhaar format. Must be exactly 12 digits.');
        return;
      }
    }

    setIsSubmittingKyc(true);
    try {
      const response = await axios.post(`${API_SERVER_URL}/api/users/kyc`, {
        userId: currentUser._id,
        kycType,
        documentNumber: normalizedDoc,
        name: kycName,
      });

      if (response.data.success && response.data.user) {
        Alert.alert('KYC Verified', 'Your KYC has been successfully verified! You can now withdraw winnings.');
        if (onUserUpdate) {
          onUserUpdate(response.data.user);
        }
        setKycDocNum('');
        setKycName('');
      }
    } catch (err: any) {
      Alert.alert('KYC Verification Failed', err.response?.data?.error || err.message);
    } finally {
      setIsSubmittingKyc(false);
    }
  };

  const handleWithdrawal = async () => {
    if (!currentUser) return;

    if (!currentUser.isKycVerified) {
      Alert.alert('KYC Required', 'You must complete your KYC verification below before you can withdraw winnings.');
      return;
    }

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
      if (result.error === 'KYC_REQUIRED') {
        Alert.alert('KYC Required', 'Your KYC is not verified. Please complete verification below.');
      } else {
        Alert.alert('Withdrawal Failed', result.error || 'Server rejected payout');
      }
    }
  };

  const handleLogout = async () => {
    try {
      await axios.post(`${API_SERVER_URL}/api/users/logout`);
    } catch (err) {
      console.log('Server token blacklisting failed or bypassed:', err);
    }
    delete axios.defaults.headers.common['x-auth-token'];
    if (onLogout) onLogout();
  };

  const handleCopyCode = () => {
    Clipboard.setString(referralCode);
    Alert.alert('Referral System', 'Referral Code Copied to Clipboard!');
  };

  const handleCopyLink = () => {
    Clipboard.setString(referralUrl);
    Alert.alert('Referral System', 'Invite URL Copied to Clipboard!');
  };

  const handleWhatsAppShare = async () => {
    try {
      const text = encodeURIComponent(`🎲 Play Sexus and Earn Cash! Join using my referral code: ${referralCode}\nSignup URL: ${referralUrl}`);
      const url = `whatsapp://send?text=${text}`;
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
      } else {
        Alert.alert('WhatsApp Error', 'WhatsApp app is not installed on this device.');
      }
    } catch (err: any) {
      Alert.alert('Error', err.message);
    }
  };

  if (!currentUser) {
    return (
      <View style={styles.authContainer}>
        <View style={styles.authCard}>
          <Text style={styles.heading}>SEXUS</Text>
          <Text style={styles.subheading}>Real-Money Mobile Portal</Text>

          <TextInput
            style={[styles.input, isFocusedUsername && styles.inputFocused]}
            placeholder="Username"
            placeholderTextColor="#94A3B8"
            value={username}
            onChangeText={setUsername}
            onFocus={() => setIsFocusedUsername(true)}
            onBlur={() => setIsFocusedUsername(false)}
          />
          <TextInput
            style={[styles.input, isFocusedPhone && styles.inputFocused]}
            placeholder="Phone Number"
            placeholderTextColor="#94A3B8"
            keyboardType="phone-pad"
            value={phone}
            onChangeText={setPhone}
            onFocus={() => setIsFocusedPhone(true)}
            onBlur={() => setIsFocusedPhone(false)}
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
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer} showsVerticalScrollIndicator={false}>
      {/* Premium Profile Section */}
      <View style={styles.profileCard}>
        <View style={styles.avatarContainer}>
          <View style={styles.avatar}>
            <Text style={styles.avatarEmoji}>👤</Text>
          </View>
          <TouchableOpacity 
            style={styles.cameraOverlay}
            onPress={() => Alert.alert('Avatar Editor', 'Profile avatar changes are saved locally.')}
          >
            <Text style={styles.cameraOverlayText}>📸</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.usernameHeader}>{currentUser.username}</Text>
        <Text style={styles.phoneSub}>{currentUser.phone}</Text>
      </View>

      {/* Deep Gradient Wallet Summary Card */}
      <View style={styles.balanceCard}>
        <Svg style={StyleSheet.absoluteFillObject} width="100%" height="100%">
          <Defs>
            <LinearGradient id="balanceGrad" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor="#4F46E5" />
              <Stop offset="1" stopColor="#2563EB" />
            </LinearGradient>
          </Defs>
          <Rect width="100%" height="100%" fill="url(#balanceGrad)" rx={16} />
        </Svg>
        
        <View style={styles.balanceCardContent}>
          <Text style={styles.balanceTitle}>TOTAL ACCUMULATED WALLET</Text>
          <Text style={styles.balanceAmount}>₹{balances.total.toFixed(2)}</Text>

          <View style={styles.splitBalances}>
            <View style={styles.splitNode}>
              <Text style={styles.splitLabel}>Deposits Cash</Text>
              <Text style={styles.splitVal}>₹{balances.deposits.toFixed(2)}</Text>
            </View>
            <View style={[styles.splitNode, styles.borderLeft]}>
              <Text style={styles.splitLabel}>Winnings Cash</Text>
              <Text style={[styles.splitVal, styles.greenText]}>₹{balances.winnings.toFixed(2)}</Text>
            </View>
          </View>
        </View>
      </View>

      {/* Deposit cash portal */}
      <View style={styles.actionCard}>
        <Text style={styles.cardHeader}>ADD PLAYING FUNDS</Text>
        <TextInput
          style={[styles.input, isFocusedDeposit && styles.inputFocused]}
          placeholder="Enter Deposit Amount (INR)"
          placeholderTextColor="#94A3B8"
          keyboardType="numeric"
          value={depositAmount}
          onChangeText={setDepositAmount}
          onFocus={() => setIsFocusedDeposit(true)}
          onBlur={() => setIsFocusedDeposit(false)}
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

      {/* Tabbed KYC Compliance Card */}
      {currentUser.isKycVerified ? (
        <View style={[styles.actionCard, styles.verifiedKycCard]}>
          <Text style={styles.cardHeader}>🔒 KYC COMPLIANCE VERIFIED</Text>
          <Text style={styles.verifiedKycText}>
            ✓ Your identity profile is approved and active.
          </Text>
          <View style={styles.kycDetailsRow}>
            <Text style={styles.kycDetailLabel}>Verification Mode</Text>
            <Text style={styles.kycDetailVal}>{currentUser.kycType === 'PAN' ? 'PAN Card' : 'Aadhaar Card'}</Text>
          </View>
          <View style={styles.kycDetailsRow}>
            <Text style={styles.kycDetailLabel}>Document Number</Text>
            <Text style={styles.kycDetailVal}>
              {currentUser.kycType === 'PAN'
                ? `${currentUser.kycDocumentNumber?.slice(0, 5)}XXXXX${currentUser.kycDocumentNumber?.slice(-1)}`
                : `XXXX-XXXX-${currentUser.kycDocumentNumber?.slice(-4)}`}
            </Text>
          </View>
          <View style={styles.kycDetailsRow}>
            <Text style={styles.kycDetailLabel}>Full Legal Name</Text>
            <Text style={styles.kycDetailVal}>{currentUser.kycName}</Text>
          </View>
        </View>
      ) : (
        <View style={[styles.actionCard, styles.pendingKycCard]}>
          <Text style={styles.cardHeader}>🛡️ KYC COMPLIANCE REQUIRED</Text>
          <Text style={styles.kycPromptText}>
            You must verify your PAN or Aadhaar card details to unlock instant cash withdrawals.
          </Text>

          {/* Type Selector Tabs */}
          <View style={styles.kycTabSelector}>
            <TouchableOpacity
              style={[styles.kycTabBtn, kycType === 'PAN' && styles.kycTabBtnActive]}
              onPress={() => setKycType('PAN')}
            >
              <Text style={[styles.kycTabBtnText, kycType === 'PAN' && styles.kycTabBtnTextActive]}>PAN CARD</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.kycTabBtn, kycType === 'AADHAAR' && styles.kycTabBtnActive]}
              onPress={() => setKycType('AADHAAR')}
            >
              <Text style={[styles.kycTabBtnText, kycType === 'AADHAAR' && styles.kycTabBtnTextActive]}>AADHAAR CARD</Text>
            </TouchableOpacity>
          </View>

          <TextInput
            style={[styles.input, isFocusedKycName && styles.inputFocused]}
            placeholder="Full Legal Name"
            placeholderTextColor="#94A3B8"
            value={kycName}
            onChangeText={setKycName}
            autoCapitalize="characters"
            onFocus={() => setIsFocusedKycName(true)}
            onBlur={() => setIsFocusedKycName(false)}
          />

          <TextInput
            style={[styles.input, isFocusedKycDoc && styles.inputFocused]}
            placeholder={kycType === 'PAN' ? 'PAN Number (e.g., ABCDE1234F)' : 'Aadhaar Number (12 digits)'}
            placeholderTextColor="#94A3B8"
            value={kycDocNum}
            onChangeText={setKycDocNum}
            autoCapitalize={kycType === 'PAN' ? 'characters' : 'none'}
            keyboardType={kycType === 'AADHAAR' ? 'numeric' : 'default'}
            onFocus={() => setIsFocusedKycDoc(true)}
            onBlur={() => setIsFocusedKycDoc(false)}
          />

          <TouchableOpacity style={styles.kycSubmitBtn} onPress={handleSubmitKyc} disabled={isSubmittingKyc}>
            {isSubmittingKyc ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.actionBtnText}>SUBMIT & VERIFY KYC</Text>
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* Withdrawal Winnings Portal */}
      {currentUser.isKycVerified && (
        <View style={styles.actionCard}>
          <Text style={styles.cardHeader}>WITHDRAW WINNINGS INSTANTLY</Text>
          <TextInput
            style={[styles.input, isFocusedWithdraw && styles.inputFocused]}
            placeholder="Withdraw Amount (INR)"
            placeholderTextColor="#94A3B8"
            keyboardType="numeric"
            value={withdrawAmount}
            onChangeText={setWithdrawAmount}
            onFocus={() => setIsFocusedWithdraw(true)}
            onBlur={() => setIsFocusedWithdraw(false)}
          />
          <TextInput
            style={[styles.input, isFocusedUpi && styles.inputFocused]}
            placeholder="Recipient UPI ID (e.g. name@upi)"
            placeholderTextColor="#94A3B8"
            value={upiId}
            onChangeText={setUpiId}
            autoCapitalize="none"
            onFocus={() => setIsFocusedUpi(true)}
            onBlur={() => setIsFocusedUpi(false)}
          />
          <TouchableOpacity style={[styles.actionBtn, styles.withdrawBtn]} onPress={handleWithdrawal} disabled={loading}>
            <Text style={styles.actionBtnText}>WITHDRAW TO BANK (IMPS)</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Refer & Share matrix */}
      <View style={styles.actionCard}>
        <Text style={styles.cardHeader}>🎁 REFER & SHARE TO EARN CASH</Text>
        
        {/* Multi-Column Yield Metrics */}
        <View style={styles.referMetricsGrid}>
          <View style={styles.referMetricCol}>
            <Text style={styles.referMetricVal}>12</Text>
            <Text style={styles.referMetricLabel}>Friends Joined</Text>
          </View>
          <View style={styles.metricDivider} />
          <View style={styles.referMetricCol}>
            <Text style={[styles.referMetricVal, styles.greenText]}>₹600</Text>
            <Text style={styles.referMetricLabel}>Total Earned</Text>
          </View>
        </View>

        {/* Alpha-numeric referral code inner container */}
        <TouchableOpacity style={styles.clipboardBox} onPress={handleCopyCode}>
          <View style={styles.clipboardLabelCol}>
            <Text style={styles.clipboardLabel}>REFERRAL CODE</Text>
            <Text style={styles.clipboardValue}>{referralCode}</Text>
          </View>
          <View style={styles.copyBadge}>
            <Text style={styles.copyBadgeText}>Copy Code</Text>
          </View>
        </TouchableOpacity>

        {/* Link deep-link share */}
        <TouchableOpacity style={styles.clipboardBox} onPress={handleCopyLink}>
          <View style={styles.clipboardLabelCol}>
            <Text style={styles.clipboardLabel}>INVITE LINK</Text>
            <Text style={styles.clipboardValue} numberOfLines={1}>{referralUrl}</Text>
          </View>
          <View style={styles.copyBadge}>
            <Text style={styles.copyBadgeText}>Copy Link</Text>
          </View>
        </TouchableOpacity>

        {/* WhatsApp Dispatcher button */}
        <TouchableOpacity style={styles.whatsappBtn} onPress={handleWhatsAppShare}>
          <Text style={styles.whatsappBtnText}>🟢 Share on WhatsApp</Text>
        </TouchableOpacity>
      </View>

      {/* Ledger History List */}
      <View style={styles.historyCard}>
        <Text style={styles.cardHeader}>LEDGER JOURNAL LOGS</Text>
        {history.length === 0 ? (
          /* Illustrative empty ledger placeholder state */
          <View style={styles.emptyLedgerContainer}>
            <Svg width={40} height={40} viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth={1.5}>
              <Path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
              <Polyline points="14 2 14 8 20 8" />
              <Line x1="16" y1="13" x2="8" y2="13" />
              <Line x1="16" y1="17" x2="8" y2="17" />
              <Line x1="10" y1="9" x2="8" y2="9" />
            </Svg>
            <Text style={styles.noHistory}>No transactions logged in this timeframe.</Text>
          </View>
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

      {/* Administrative Compliance rows stack */}
      <View style={styles.complianceCard}>
        <Text style={styles.cardHeader}>ACCOUNT & COMPLIANCE</Text>
        
        <TouchableOpacity style={styles.complianceRow} onPress={() => Alert.alert('Edit Profile', 'Edit user profile configuration parameters.')}>
          <View style={styles.complianceLabelRow}>
            <UserIcon />
            <Text style={styles.complianceText}>Edit Profile</Text>
          </View>
          <Text style={styles.chevron}>▶</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.complianceRow} onPress={() => Alert.alert('Payout Settings', 'Configure IMPS payout settlements settings.')}>
          <View style={styles.complianceLabelRow}>
            <KeyIcon />
            <Text style={styles.complianceText}>Payout Settings</Text>
          </View>
          <Text style={styles.chevron}>▶</Text>
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.complianceRow} onPress={() => Alert.alert('Responsible Gaming', 'Set limits, play in moderation (18+ rules).')}>
          <View style={styles.complianceLabelRow}>
            <ShieldIcon />
            <Text style={styles.complianceText}>Responsible Gaming</Text>
          </View>
          <Text style={styles.chevron}>▶</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.complianceRow} onPress={() => Alert.alert('Privacy Policy', 'Data encrypted securely. Mapped compliance keys.')}>
          <View style={styles.complianceLabelRow}>
            <BookTextIcon />
            <Text style={styles.complianceText}>Privacy Policy</Text>
          </View>
          <Text style={styles.chevron}>▶</Text>
        </TouchableOpacity>

        {onLogout && (
          <TouchableOpacity style={[styles.complianceRow, styles.logoutRow]} onPress={handleLogout}>
            <View style={styles.complianceLabelRow}>
              <PowerIcon />
              <Text style={[styles.complianceText, styles.logoutText]}>Logout Account</Text>
            </View>
            <Text style={[styles.chevron, styles.logoutText]}>▶</Text>
          </TouchableOpacity>
        )}

        <Text style={styles.versionTag}>VERSION 1.0.4 (BETA)</Text>
      </View>

      {error && <Text style={styles.errorText}>Error: {error}</Text>}
    </ScrollView>
  );
};



const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  contentContainer: {
    padding: 20,
    paddingBottom: 40,
  },
  authContainer: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  authCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 380,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 3,
    alignItems: 'center',
  },
  heading: {
    fontSize: 24,
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: 2,
  },
  subheading: {
    fontSize: 12,
    color: '#475569',
    marginTop: 4,
    marginBottom: 24,
  },
  input: {
    width: '100%',
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    color: '#0F172A',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    marginBottom: 16,
  },
  inputFocused: {
    borderColor: '#6366F1', // Soft purple focus active state rings
    backgroundColor: '#FFFFFF',
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  authButton: {
    width: '100%',
    backgroundColor: '#6366F1',
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  authButtonText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 14,
  },
  profileCard: {
    alignItems: 'center',
    paddingVertical: 20,
    marginBottom: 10,
  },
  avatarContainer: {
    position: 'relative',
    marginBottom: 12,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#6366F1',
  },
  avatarEmoji: {
    fontSize: 36,
  },
  cameraOverlay: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  cameraOverlayText: {
    fontSize: 12,
  },
  usernameHeader: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#0F172A',
  },
  phoneSub: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 4,
  },
  balanceCard: {
    position: 'relative',
    borderRadius: 16,
    height: 154,
    marginBottom: 20,
    shadowColor: '#4F46E5',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 4,
    overflow: 'hidden',
  },
  balanceCardContent: {
    padding: 20,
  },
  balanceTitle: {
    color: '#E0E7FF',
    fontSize: 10,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  balanceAmount: {
    color: '#FFFFFF',
    fontSize: 32,
    fontWeight: '900',
    marginTop: 8,
  },
  splitBalances: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.25)', // clean white divider line
    paddingTop: 16,
    marginTop: 16,
  },
  splitNode: {
    flex: 1,
    alignItems: 'center',
  },
  borderLeft: {
    borderLeftWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.25)',
  },
  splitLabel: {
    color: '#E0E7FF',
    fontSize: 11,
    fontWeight: '600',
  },
  splitVal: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
    marginTop: 4,
  },
  greenText: {
    color: '#10B981',
  },
  actionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 3,
  },
  cardHeader: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#475569',
    letterSpacing: 1,
    marginBottom: 14,
    textTransform: 'uppercase',
  },
  actionBtn: {
    backgroundColor: '#2563EB', // vibrant deep brand color
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 5,
    elevation: 2,
  },
  actionBtnText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 13,
  },
  intentContainer: {
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderColor: '#E2E8F0',
  },
  intentText: {
    color: '#64748B',
    fontSize: 11,
    fontFamily: 'monospace',
    marginBottom: 10,
  },
  verifyBtn: {
    backgroundColor: '#10B981',
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
  },
  verifiedKycCard: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
    borderWidth: 1,
  },
  verifiedKycText: {
    color: '#065F46',
    fontWeight: '700',
    fontSize: 13,
    marginBottom: 14,
  },
  kycDetailsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  kycDetailLabel: {
    color: '#047857',
    fontSize: 12,
    fontWeight: '600',
  },
  kycDetailVal: {
    color: '#065F46',
    fontSize: 12,
    fontWeight: 'bold',
  },
  pendingKycCard: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
    borderWidth: 1,
  },
  kycPromptText: {
    color: '#92400E',
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 14,
  },
  kycTabSelector: {
    flexDirection: 'row',
    marginBottom: 16,
    backgroundColor: '#F1F5F9', // sliding tab selectors
    padding: 3,
    borderRadius: 8,
  },
  kycTabBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 6,
  },
  kycTabBtnActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  kycTabBtnText: {
    color: '#64748B',
    fontWeight: '700',
    fontSize: 12,
  },
  kycTabBtnTextActive: {
    color: '#6366F1',
  },
  kycSubmitBtn: {
    backgroundColor: '#6366F1',
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
  },
  withdrawBtn: {
    backgroundColor: '#10B981',
  },
  referMetricsGrid: {
    flexDirection: 'row',
    backgroundColor: '#F8FAFC', // elevated soft lavender-like surfaces
    borderRadius: 14,
    paddingVertical: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 16,
    alignItems: 'center',
  },
  referMetricCol: {
    flex: 1,
    alignItems: 'center',
  },
  metricDivider: {
    width: 1,
    height: 30,
    backgroundColor: '#CBD5E1', // thin gray vertical rule border
  },
  referMetricVal: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#0F172A',
  },
  referMetricLabel: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 3,
    fontWeight: '600',
  },
  clipboardBox: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#EEF2FF', // inner background shade
    borderRadius: 10,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: '#6366F1',
    padding: 12,
    marginBottom: 12,
  },
  clipboardLabelCol: {
    flex: 1,
    marginRight: 10,
  },
  clipboardLabel: {
    fontSize: 9,
    color: '#6366F1',
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  clipboardValue: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#0F172A',
    marginTop: 2,
  },
  copyBadge: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: '#6366F1',
    borderRadius: 8,
  },
  copyBadgeText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 11,
  },
  whatsappBtn: {
    backgroundColor: '#25D366',
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
    marginTop: 6,
  },
  whatsappBtnText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 14,
  },
  historyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  emptyLedgerContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24,
  },
  noHistory: {
    color: '#64748B',
    textAlign: 'center',
    marginTop: 10,
    fontSize: 12,
    fontWeight: '500',
  },
  txnRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderColor: '#F1F5F9',
    paddingVertical: 12,
  },
  txnType: {
    color: '#0F172A',
    fontWeight: 'bold',
    fontSize: 13,
  },
  txnDate: {
    color: '#64748B',
    fontSize: 11,
    marginTop: 2,
  },
  txnRef: {
    color: '#94A3B8',
    fontSize: 10,
    fontFamily: 'monospace',
    marginTop: 2,
    maxWidth: 160,
  },
  txnRight: {
    alignItems: 'flex-end',
  },
  txnAmount: {
    fontWeight: 'bold',
    fontSize: 14,
  },
  redText: {
    color: '#EF4444',
  },
  txnStatus: {
    fontSize: 10,
    fontWeight: 'bold',
    marginTop: 4,
    textTransform: 'uppercase',
  },
  pending: {
    color: '#F59E0B',
  },
  success: {
    color: '#10B981',
  },
  failed: {
    color: '#EF4444',
  },
  complianceCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  complianceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderColor: '#F1F5F9',
  },
  complianceLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  complianceText: {
    fontSize: 13,
    color: '#0F172A',
    fontWeight: '600',
    marginLeft: 10,
  },
  chevron: {
    color: '#94A3B8',
    fontSize: 11,
  },
  logoutRow: {
    borderBottomWidth: 0,
    marginTop: 8,
  },
  logoutText: {
    color: '#EF4444',
  },
  versionTag: {
    textAlign: 'center',
    color: '#94A3B8',
    fontSize: 10,
    marginTop: 16,
    fontWeight: '500',
  },
  errorText: {
    color: '#EF4444',
    textAlign: 'center',
    marginTop: 10,
  },
});
export default AuthWalletScreen;
