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
  onLoginSuccess: (user: UserProfile, token?: string) => void;
  currentUser: UserProfile | null;
  onLogout?: () => void;
  onUserUpdate?: (user: UserProfile) => void;
}

// Custom Premium Vector Icons
const ShieldCheckIcon = () => (
  <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#4F46E5" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <Path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    <Path d="m9 11 2 2 4-4" />
  </Svg>
);

const ShieldIcon = () => (
  <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#4F46E5" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <Path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
  </Svg>
);

const HelpIcon = () => (
  <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#4F46E5" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <Circle cx="12" cy="12" r="10" />
    <Path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3M12 17h.01" />
  </Svg>
);

const BookTextIcon = () => (
  <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#4F46E5" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <Path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
    <Path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
  </Svg>
);

const FileTextIcon = () => (
  <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#4F46E5" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <Path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <Polyline points="14 2 14 8 20 8" />
    <Path d="M16 13H8M16 17H8M10 9H8" />
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

  // Focus rings tracking
  const [isFocusedPhone, setIsFocusedPhone] = useState(false);
  const [isFocusedUsername, setIsFocusedUsername] = useState(false);
  const [isFocusedDeposit, setIsFocusedDeposit] = useState(false);
  const [isFocusedWithdraw, setIsFocusedWithdraw] = useState(false);
  const [isFocusedUpi, setIsFocusedUpi] = useState(false);
  const [isFocusedKycName, setIsFocusedKycName] = useState(false);
  const [isFocusedKycDoc, setIsFocusedKycDoc] = useState(false);

  // Deposit/Withdrawal States
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

  const [isHistoryExpanded, setIsHistoryExpanded] = useState(false);
  const [activePolicy, setActivePolicy] = useState<string | null>(null);

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
        onLoginSuccess(response.data.user, response.data.token);
      }
    } catch (err: any) {
      Alert.alert('Authentication Error', err.response?.data?.error || err.message);
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleQuickDevLogin = async () => {
    setIsLoggingIn(true);
    try {
      const response = await axios.post(`${API_SERVER_URL}/api/users/login`, {
        phone: '9876543210',
        username: 'QuickTester',
      });
      if (response.data.success && response.data.user) {
        if (response.data.token) {
          axios.defaults.headers.common['x-auth-token'] = response.data.token;
        }
        
        try {
          const balRes = await axios.get(`${API_SERVER_URL}/api/payout/balance/${response.data.user._id}`);
          if (balRes.data.success && balRes.data.balances.total < 100) {
            await axios.post(`${API_SERVER_URL}/api/payments/simulate-success`, {
              userId: response.data.user._id,
              transactionId: `dev_init_${Date.now()}`,
              amount: 1000,
            });
          }
        } catch (_) {
          await axios.post(`${API_SERVER_URL}/api/payments/simulate-success`, {
            userId: response.data.user._id,
            transactionId: `dev_init_${Date.now()}`,
            amount: 1000,
          });
        }

        onLoginSuccess(response.data.user, response.data.token);
      }
    } catch (err: any) {
      Alert.alert('Quick Login Error', err.response?.data?.error || err.message);
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
      Alert.alert('Withdrawal Failed', result.error || 'Server rejected payout');
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

          <TouchableOpacity 
            style={[styles.authButton, { backgroundColor: '#10B981', marginTop: 12 }]} 
            onPress={handleQuickDevLogin} 
            disabled={isLoggingIn}
          >
            <Text style={styles.authButtonText}>⚡ 1-TAP QUICK DEMO (AUTO LOGIN & FUND)</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const renderBalanceCard = () => (
    <View style={styles.balanceCard}>
      <Svg style={StyleSheet.absoluteFillObject} width="100%" height="100%">
        <Defs>
          <LinearGradient id="balanceGrad" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#312E81" />
            <Stop offset="1" stopColor="#1E3A8A" />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#balanceGrad)" rx={24} />
      </Svg>
      
      <View style={styles.balanceCardContent}>
        <Text style={styles.balanceTitle}>MY WALLET BALANCE</Text>
        <Text style={styles.balanceAmount}>₹{balances.total.toFixed(2)}</Text>

        <View style={styles.splitBalances}>
          <View style={styles.splitNode}>
            <Text style={styles.splitLabel}>Added Money</Text>
            <Text style={styles.splitVal}>₹{balances.deposits.toFixed(2)}</Text>
          </View>
          <View style={[styles.splitNode, styles.borderLeft]}>
            <Text style={styles.splitLabel}>Winnings</Text>
            <Text style={[styles.splitVal, styles.greenText]}>₹{balances.winnings.toFixed(2)}</Text>
          </View>
        </View>
      </View>
    </View>
  );

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

      {/* 1. Wallet Balance Card (Shown on Top ONLY IF KYC is not verified) */}
      {!currentUser.isKycVerified && renderBalanceCard()}

      {/* Deposit cash portal */}
      <View style={styles.actionCard}>
        <Text style={styles.cardHeader}>ADD MONEY TO WALLET</Text>
        <TextInput
          style={[styles.input, isFocusedDeposit && styles.inputFocused]}
          placeholder="Enter Amount (INR)"
          placeholderTextColor="#94A3B8"
          keyboardType="numeric"
          value={depositAmount}
          onChangeText={setDepositAmount}
          onFocus={() => setIsFocusedDeposit(true)}
          onBlur={() => setIsFocusedDeposit(false)}
        />
        <TouchableOpacity style={styles.actionBtn} onPress={handleDeposit} disabled={loading}>
          <Text style={styles.actionBtnText}>ADD MONEY NOW</Text>
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
          <Text style={styles.cardHeader}>🔒 ACCOUNT VERIFIED</Text>
          <Text style={styles.verifiedKycText}>✓ Your identity is verified successfully.</Text>
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
          <Text style={styles.cardHeader}>🛡️ ID VERIFICATION REQUIRED</Text>
          <Text style={styles.kycPromptText}>
            Verify your PAN or Aadhaar card details to unlock instant cash withdrawals.
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
              <Text style={styles.actionBtnText}>VERIFY ID NOW</Text>
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* Withdrawal Winnings Portal */}
      {currentUser.isKycVerified && (
        <View style={styles.actionCard}>
          <Text style={styles.cardHeader}>SEND WINNINGS TO BANK</Text>
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
            placeholder="Enter your UPI ID (e.g. name@upi)"
            placeholderTextColor="#94A3B8"
            value={upiId}
            onChangeText={setUpiId}
            autoCapitalize="none"
            onFocus={() => setIsFocusedUpi(true)}
            onBlur={() => setIsFocusedUpi(false)}
          />
          <TouchableOpacity style={[styles.actionBtn, styles.withdrawBtn]} onPress={handleWithdrawal} disabled={loading}>
            <Text style={styles.actionBtnText}>WITHDRAW MONEY NOW</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* 2. Wallet Balance Card (Shown at the bottom ONLY IF KYC is completed) */}
      {currentUser.isKycVerified && renderBalanceCard()}

      {/* Refer & Share matrix */}
      <View style={styles.actionCard}>
        <Text style={styles.cardHeader}>🎁 SHARE & REFER TO EARN</Text>
        
        <View style={styles.referMetricsGrid}>
          <View style={styles.referMetricCol}>
            <Text style={styles.referMetricVal}>12</Text>
            <Text style={styles.referMetricLabel}>Friends Joined</Text>
          </View>
          <View style={styles.metricDivider} />
          <View style={styles.referMetricCol}>
            <Text style={[styles.referMetricVal, styles.greenText]}>₹600</Text>
            <Text style={styles.referMetricLabel}>Total Cash Earned</Text>
          </View>
        </View>

        <TouchableOpacity style={styles.clipboardBox} onPress={handleCopyCode}>
          <View style={styles.clipboardLabelCol}>
            <Text style={styles.clipboardLabel}>REFERRAL CODE</Text>
            <Text style={styles.clipboardValue}>{referralCode}</Text>
          </View>
          <View style={styles.copyBadge}>
            <Text style={styles.copyBadgeText}>Copy Code</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity style={styles.clipboardBox} onPress={handleCopyLink}>
          <View style={styles.clipboardLabelCol}>
            <Text style={styles.clipboardLabel}>INVITE LINK</Text>
            <Text style={styles.clipboardValue} numberOfLines={1}>{referralUrl}</Text>
          </View>
          <View style={styles.copyBadge}>
            <Text style={styles.copyBadgeText}>Copy Link</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity style={styles.whatsappBtn} onPress={handleWhatsAppShare}>
          <Text style={styles.whatsappBtnText}>Share on WhatsApp</Text>
        </TouchableOpacity>
      </View>

      {/* Expandable Transaction History List */}
      <View style={styles.historyCard}>
        <TouchableOpacity 
          style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 }}
          onPress={() => setIsHistoryExpanded(!isHistoryExpanded)}
          activeOpacity={0.7}
        >
          <Text style={styles.cardHeader}>TRANSACTION HISTORY</Text>
          <Text style={{ fontSize: 13, fontWeight: 'bold', color: '#4F46E5' }}>
            {isHistoryExpanded ? '▲ Hide' : '▼ View History'}
          </Text>
        </TouchableOpacity>

        {isHistoryExpanded && (
          <View style={{ marginTop: 12 }}>
            {history.length === 0 ? (
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
              history.map((txn) => {
                let simpleType: string = txn.type;
                if (txn.type === 'ENTRY_FEE') simpleType = 'Game Played';
                else if (txn.type === 'PLATFORM_COMMISSION') simpleType = 'Platform Charge';
                else if (txn.type === 'WINNINGS') simpleType = 'Game Won';
                else if (txn.type === 'DEPOSIT') simpleType = 'Added Cash';
                else if (txn.type === 'WITHDRAWAL') simpleType = 'Sent to Bank';

                let simpleStatus: string = txn.status;
                if (txn.status === 'SUCCESS') simpleStatus = 'Successful';
                else if (txn.status === 'PENDING') simpleStatus = 'Pending';
                else if (txn.status === 'FAILED') simpleStatus = 'Failed';

                return (
                  <View key={txn._id} style={styles.txnRow}>
                    <View>
                      <Text style={styles.txnType}>{simpleType}</Text>
                      <Text style={styles.txnDate}>{new Date(txn.createdAt).toLocaleDateString()}</Text>
                      <Text style={styles.txnRef} numberOfLines={1}>Ref: {txn.referenceId}</Text>
                    </View>
                    <View style={styles.txnRight}>
                      <Text style={[styles.txnAmount, txn.amount < 0 ? styles.redText : styles.greenText]}>
                        {txn.amount > 0 ? `+${txn.amount}` : txn.amount}
                      </Text>
                      <Text style={[styles.txnStatus, styles[txn.status.toLowerCase() as keyof typeof styles || 'pending']]}>
                        {simpleStatus}
                      </Text>
                    </View>
                  </View>
                );
              })
            )}
          </View>
        )}
      </View>

      {/* Administrative Compliance rows stack */}
      <View style={styles.complianceCard}>
        <Text style={styles.cardHeader}>HELP & LEGAL POLICIES</Text>
        
        <TouchableOpacity 
          style={styles.complianceRow} 
          onPress={() => setActivePolicy(activePolicy === 'responsible' ? null : 'responsible')}
          activeOpacity={0.7}
        >
          <View style={styles.complianceLabelRow}>
            <ShieldIcon />
            <Text style={styles.complianceText}>Responsible Gaming</Text>
          </View>
        </TouchableOpacity>
        {activePolicy === 'responsible' && (
          <View style={styles.policyDetailCard}>
            <Text style={styles.policyDetailTitle}>Responsible Gaming Rules</Text>
            <Text style={styles.policyDetailText}>🔞 Play in moderation: Set daily time and deposit limits to keep play fun.</Text>
            <Text style={styles.policyDetailText}>🛑 This is a real-money game. Play responsibly and only with money you can afford to lose.</Text>
            <Text style={styles.policyDetailText}>📞 Need help? Access our self-exclusion tools or support services instantly.</Text>
          </View>
        )}

        <TouchableOpacity 
          style={styles.complianceRow} 
          onPress={() => setActivePolicy(activePolicy === 'support' ? null : 'support')}
          activeOpacity={0.7}
        >
          <View style={styles.complianceLabelRow}>
            <HelpIcon />
            <Text style={styles.complianceText}>Help & Support</Text>
          </View>
        </TouchableOpacity>
        {activePolicy === 'support' && (
          <View style={styles.policyDetailCard}>
            <Text style={styles.policyDetailTitle}>Customer Support</Text>
            <Text style={styles.policyDetailText}>✉️ Email Support: support@sexusplatform.com</Text>
            <Text style={styles.policyDetailText}>💬 Live Chat: Connect with our support team 24/7 on WhatsApp or in-app chat.</Text>
            <Text style={styles.policyDetailText}>⏱️ Typical Response Time: Under 10 minutes.</Text>
          </View>
        )}

        <TouchableOpacity 
          style={styles.complianceRow} 
          onPress={() => setActivePolicy(activePolicy === 'terms' ? null : 'terms')}
          activeOpacity={0.7}
        >
          <View style={styles.complianceLabelRow}>
            <BookTextIcon />
            <Text style={styles.complianceText}>Terms of Service</Text>
          </View>
        </TouchableOpacity>
        {activePolicy === 'terms' && (
          <View style={styles.policyDetailCard}>
            <Text style={styles.policyDetailTitle}>Terms of Service Summary</Text>
            <Text style={styles.policyDetailText}>⚖️ Eligibility: Users must be 18 years or older to register and play cash games.</Text>
            <Text style={styles.policyDetailText}>🚫 Fair Play Policy: Use of duplicate accounts, scripts, or cheating tools will result in permanent ban and forfeiture of funds.</Text>
            <Text style={styles.policyDetailText}>🏦 Account Balance: All deposit and winning balances are held securely.</Text>
          </View>
        )}
        
        <TouchableOpacity 
          style={styles.complianceRow} 
          onPress={() => setActivePolicy(activePolicy === 'privacy' ? null : 'privacy')}
          activeOpacity={0.7}
        >
          <View style={styles.complianceLabelRow}>
            <ShieldCheckIcon />
            <Text style={styles.complianceText}>Privacy Policy</Text>
          </View>
        </TouchableOpacity>
        {activePolicy === 'privacy' && (
          <View style={styles.policyDetailCard}>
            <Text style={styles.policyDetailTitle}>Data & Privacy Control</Text>
            <Text style={styles.policyDetailText}>🔒 Secure Encryption: All personal details, KYC document files, and transaction records are fully encrypted.</Text>
            <Text style={styles.policyDetailText}>🚫 No Third-Party Sharing: Your data is confidential and never sold to third parties.</Text>
            <Text style={styles.policyDetailText}>🛡️ Mapped Compliance Keys: Built to fully satisfy RBI guidelines and local data protection regulations.</Text>
          </View>
        )}

        <TouchableOpacity 
          style={styles.complianceRow} 
          onPress={() => setActivePolicy(activePolicy === 'refund' ? null : 'refund')}
          activeOpacity={0.7}
        >
          <View style={styles.complianceLabelRow}>
            <FileTextIcon />
            <Text style={styles.complianceText}>Refund Policies</Text>
          </View>
        </TouchableOpacity>
        {activePolicy === 'refund' && (
          <View style={styles.policyDetailCard}>
            <Text style={styles.policyDetailTitle}>Refund & Settlement Terms</Text>
            <Text style={styles.policyDetailText}>🎲 Game Cancellations: If a game gets canceled due to server or technical errors, your entry fee will be refunded to your wallet instantly.</Text>
            <Text style={styles.policyDetailText}>🚫 Player Disconnections: If you leave the match or disconnect during gameplay, your entry fee is forfeited.</Text>
            <Text style={styles.policyDetailText}>⏱️ Withdrawal Settlements: Approved cash withdrawals settle in your bank account in 2 to 24 hours.</Text>
          </View>
        )}

        {onLogout && (
          <TouchableOpacity style={[styles.complianceRow, styles.logoutRow]} onPress={handleLogout} activeOpacity={0.7}>
            <View style={styles.complianceLabelRow}>
              <PowerIcon />
              <Text style={[styles.complianceText, styles.logoutText]}>Logout Account</Text>
            </View>
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
    backgroundColor: '#F3F4F6', // Premium Canvas Backdrop
  },
  contentContainer: {
    padding: 20,
    paddingBottom: 110, // Account for Bottom Floating Capsule Footer bar spacing
  },
  authContainer: {
    flex: 1,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  authCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24, // Global component radius
    padding: 24,
    width: '100%',
    maxWidth: 380,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#475569',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.05,
    shadowRadius: 16,
    elevation: 4,
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
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    padding: 12,
    fontSize: 14,
    color: '#0F172A',
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    marginBottom: 16,
  },
  inputFocused: {
    borderColor: '#4F46E5', // Brand active focus active state rings
    backgroundColor: '#FFFFFF',
    shadowColor: '#4F46E5',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  authButton: {
    width: '100%',
    backgroundColor: '#4F46E5', // Brand indigo active button
    borderRadius: 24, // Global component radius
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
    borderWidth: 2.5,
    borderColor: '#4F46E5',
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
    borderColor: '#E5E7EB',
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
    borderRadius: 24, // Global component radius
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
    borderColor: 'rgba(255, 255, 255, 0.25)',
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
    borderRadius: 24, // Global component radius
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#475569',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.05,
    shadowRadius: 16,
    elevation: 4,
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
    backgroundColor: '#4F46E5', // Slate Indigo Accent
    borderRadius: 24, // Global component radius
    padding: 14,
    alignItems: 'center',
    shadowColor: '#4F46E5',
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
    borderColor: '#E5E7EB',
  },
  intentText: {
    color: '#64748B',
    fontSize: 11,
    fontFamily: 'monospace',
    marginBottom: 10,
  },
  verifyBtn: {
    backgroundColor: '#10B981',
    borderRadius: 24,
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
    backgroundColor: '#E5E7EB',
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
    color: '#4F46E5',
  },
  kycSubmitBtn: {
    backgroundColor: '#4F46E5',
    borderRadius: 24,
    padding: 14,
    alignItems: 'center',
  },
  withdrawBtn: {
    backgroundColor: '#10B981',
  },
  referMetricsGrid: {
    flexDirection: 'row',
    backgroundColor: '#F3F4F6',
    borderRadius: 24,
    paddingVertical: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
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
    backgroundColor: '#D1D5DB',
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
    backgroundColor: '#EEF2FF',
    borderRadius: 12,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: '#4F46E5',
    padding: 12,
    marginBottom: 12,
  },
  clipboardLabelCol: {
    flex: 1,
    marginRight: 10,
  },
  clipboardLabel: {
    fontSize: 9,
    color: '#4F46E5',
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
    backgroundColor: '#4F46E5',
    borderRadius: 12,
  },
  copyBadgeText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 11,
  },
  whatsappBtn: {
    backgroundColor: '#25D366',
    borderRadius: 24,
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
    borderRadius: 24,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#475569',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.05,
    shadowRadius: 16,
    elevation: 4,
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
    borderColor: '#E5E7EB',
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
    borderRadius: 24,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#475569',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.05,
    shadowRadius: 16,
    elevation: 4,
  },
  complianceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderColor: '#E5E7EB',
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
  policyDetailCard: {
    backgroundColor: '#EEF2FF',
    borderRadius: 16,
    padding: 14,
    marginTop: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E0E7FF',
  },
  policyDetailTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#312E81',
    marginBottom: 8,
  },
  policyDetailText: {
    fontSize: 11,
    color: '#475569',
    fontWeight: '600',
    lineHeight: 16,
    marginBottom: 6,
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
