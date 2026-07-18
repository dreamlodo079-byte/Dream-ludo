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
  Modal,
  KeyboardAvoidingView,
  Platform,
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
  const [password, setPassword] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [isLoginMode, setIsLoginMode] = useState(true);
  const [otpSent, setOtpSent] = useState(false);
  const [otpTimer, setOtpTimer] = useState(0);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Focus rings tracking
  const [isFocusedPhone, setIsFocusedPhone] = useState(false);
  const [isFocusedUsername, setIsFocusedUsername] = useState(false);
  const [isFocusedPassword, setIsFocusedPassword] = useState(false);
  const [isFocusedOtp, setIsFocusedOtp] = useState(false);
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

  const referralCode = 'SEXUS50SEXUS';
  const referralUrl = `https://sexus.platform/signup?ref=${referralCode}`;

  const [isHistoryExpanded, setIsHistoryExpanded] = useState(false);
  const [activePolicy, setActivePolicy] = useState<string | null>(null);

  const [customAlert, setCustomAlert] = useState<{ visible: boolean; title: string; message: string; type: 'success' | 'error' | 'info' }>({
    visible: false,
    title: '',
    message: '',
    type: 'info',
  });

  const showCustomAlert = (title: string, message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setCustomAlert({ visible: true, title, message, type });
  };

  useEffect(() => {
    if (otpTimer > 0) {
      const timer = setTimeout(() => setOtpTimer(otpTimer - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [otpTimer]);

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

  const handleSendOtp = async () => {
    if (!phone) {
      showCustomAlert('Authentication Error', 'Please enter your phone number.', 'error');
      return;
    }

    const phoneRegex = /^(?:\+91|91)?[6789]\d{9}$/;
    if (!phoneRegex.test(phone.trim())) {
      showCustomAlert('Authentication Error', 'Please enter a valid 10-digit Indian phone number.', 'error');
      return;
    }

    if (!isLoginMode && !username) {
      showCustomAlert('Authentication Error', 'Please enter a username for registration.', 'error');
      return;
    }

    if (!password) {
      showCustomAlert('Authentication Error', 'Please enter a password.', 'error');
      return;
    }

    setIsLoggingIn(true);
    try {
      const response = await axios.post(`${API_SERVER_URL}/api/users/send-otp`, {
        phone,
        username: isLoginMode ? undefined : username,
        password,
        isLogin: isLoginMode,
      });

      if (response.data.success) {
        setOtpSent(true);
        setOtpTimer(30);
        showCustomAlert(
          'Verification Code Sent',
          `OTP has been sent to your phone. (Sandbox Code: ${response.data.otp})`,
          'success'
        );
      }
    } catch (err: any) {
      showCustomAlert('Authentication Error', err.response?.data?.error || err.message, 'error');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (!otpCode || otpCode.length < 6) {
      showCustomAlert('Verification Error', 'Please enter the 6-digit verification code.', 'error');
      return;
    }

    setIsLoggingIn(true);
    try {
      const response = await axios.post(`${API_SERVER_URL}/api/users/verify-otp`, {
        phone,
        username: isLoginMode ? undefined : username,
        password,
        otp: otpCode,
        isLogin: isLoginMode,
      });

      if (response.data.success) {
        axios.defaults.headers.common['x-auth-token'] = response.data.token;
        onLoginSuccess(response.data.user, response.data.token);
      }
    } catch (err: any) {
      showCustomAlert('Verification Error', err.response?.data?.error || err.message, 'error');
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
      showCustomAlert('Quick Login Error', err.response?.data?.error || err.message, 'error');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleDeposit = async () => {
    if (!currentUser) return;
    const amount = Number(depositAmount);
    if (isNaN(amount) || amount <= 0) {
      showCustomAlert('Deposit Error', 'Please enter a valid deposit amount.', 'error');
      return;
    }

    const result = await addCash(currentUser._id, amount);
    if (result.success && result.upiIntent && result.transactionId) {
      setUpiIntentLink(result.upiIntent);
      setActiveTxnId(result.transactionId);
      showCustomAlert('Payment Intent Created', `Redirecting to payment apps for: ${amount} INR`, 'info');
    } else {
      showCustomAlert('Deposit Failed', result.error || 'Server rejected request', 'error');
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

      showCustomAlert('Payment Success', 'Mock payment verified successfully! Balance updated.', 'success');
      setUpiIntentLink(null);
      setActiveTxnId(null);
      setDepositAmount('');
      fetchWallet(currentUser._id);
    } catch (err: any) {
      showCustomAlert('Simulated Webhook Error', err.response?.data?.error || err.message, 'error');
    }
  };

  const handleSubmitKyc = async () => {
    if (!currentUser) return;
    if (!kycName.trim() || !kycDocNum.trim()) {
      showCustomAlert('KYC Error', 'Please enter your full name and document number.', 'error');
      return;
    }

    const normalizedDoc = kycDocNum.trim();
    if (kycType === 'PAN') {
      const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
      if (!panRegex.test(normalizedDoc.toUpperCase())) {
        showCustomAlert('Format Error', 'Invalid PAN number format. Must be like ABCDE1234F.', 'error');
        return;
      }
    } else {
      const cleanAadhaar = normalizedDoc.replace(/\s|-/g, '');
      const aadhaarRegex = /^\d{12}$/;
      if (!aadhaarRegex.test(cleanAadhaar)) {
        showCustomAlert('Format Error', 'Invalid Aadhaar format. Must be exactly 12 digits.', 'error');
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
        showCustomAlert('KYC Verified', 'Your KYC has been successfully verified! You can now withdraw winnings.', 'success');
        if (onUserUpdate) {
          onUserUpdate(response.data.user);
        }
        setKycDocNum('');
        setKycName('');
      }
    } catch (err: any) {
      showCustomAlert('KYC Verification Failed', err.response?.data?.error || err.message, 'error');
    } finally {
      setIsSubmittingKyc(false);
    }
  };

  const handleWithdrawal = async () => {
    if (!currentUser) return;

    if (!currentUser.isKycVerified) {
      showCustomAlert('KYC Required', 'You must complete your KYC verification below before you can withdraw winnings.', 'info');
      return;
    }

    const amount = Number(withdrawAmount);
    if (isNaN(amount) || amount <= 0) {
      showCustomAlert('Withdrawal Error', 'Please enter a valid amount.', 'error');
      return;
    }
    if (!upiId) {
      showCustomAlert('Withdrawal Error', 'Please enter a target UPI ID.', 'error');
      return;
    }

    const result = await withdrawWinnings(currentUser._id, amount, upiId);
    if (result.success) {
      showCustomAlert('Withdrawal Successful', 'IMPS transfer completed. Winnings balance locked and settled.', 'success');
      setWithdrawAmount('');
      setUpiId('');
    } else {
      showCustomAlert('Withdrawal Failed', result.error || 'Server rejected payout', 'error');
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
    showCustomAlert('Referral System', 'Referral Code Copied to Clipboard!', 'success');
  };

  const handleCopyLink = () => {
    Clipboard.setString(referralUrl);
    showCustomAlert('Referral System', 'Invite URL Copied to Clipboard!', 'success');
  };

  const handleWhatsAppShare = async () => {
    try {
      const text = encodeURIComponent(`🎲 Play Sexus and Earn Cash! Join using my referral code: ${referralCode}\nSignup URL: ${referralUrl}`);
      const url = `whatsapp://send?text=${text}`;
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
      } else {
        showCustomAlert('WhatsApp Error', 'WhatsApp app is not installed on this device.', 'error');
      }
    } catch (err: any) {
      showCustomAlert('Error', err.message, 'error');
    }
  };

  if (!currentUser) {
    return (
      <KeyboardAvoidingView 
        style={styles.authContainer} 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView 
          contentContainerStyle={styles.authScrollContent} 
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.authCard}>
            {/* Logo & Brand */}
            <View style={styles.authLogoRow}>
              <View style={styles.authLogoCircle}>
                <Text style={styles.authLogoEmoji}>🎲</Text>
              </View>
            </View>
            <Text style={styles.heading}>SEXUS</Text>
            <Text style={styles.subheading}>Real-Money Mobile Portal</Text>

            {/* Premium Pill Tab Switcher */}
            {!otpSent && (
              <View style={styles.authTabRow}>
                <TouchableOpacity
                  style={[styles.authTab, isLoginMode && styles.authTabActive]}
                  onPress={() => { setIsLoginMode(true); setOtpCode(''); }}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.authTabText, isLoginMode && styles.authTabTextActive]}>LOG IN</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.authTab, !isLoginMode && styles.authTabActive]}
                  onPress={() => { setIsLoginMode(false); setOtpCode(''); }}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.authTabText, !isLoginMode && styles.authTabTextActive]}>SIGN UP</Text>
                </TouchableOpacity>
              </View>
            )}

            {!otpSent ? (
              <View style={{ width: '100%' }}>
                {!isLoginMode && (
                  <View style={[styles.inputWrapper, isFocusedUsername && styles.inputWrapperFocused]}>
                    <Text style={styles.inputIconEmoji}>👤</Text>
                    <TextInput
                      style={styles.inputInner}
                      placeholder="Username / Full Name"
                      placeholderTextColor="#94A3B8"
                      value={username}
                      onChangeText={setUsername}
                      onFocus={() => setIsFocusedUsername(true)}
                      onBlur={() => setIsFocusedUsername(false)}
                      autoCapitalize="words"
                      autoCorrect={false}
                      autoComplete="off"
                      textContentType="none"
                      importantForAutofill="no"
                    />
                  </View>
                )}

                <View style={[styles.inputWrapper, isFocusedPhone && styles.inputWrapperFocused]}>
                  <Text style={styles.inputIconEmoji}>📱</Text>
                  <TextInput
                    style={styles.inputInner}
                    placeholder="Phone Number (+91)"
                    placeholderTextColor="#94A3B8"
                    keyboardType="phone-pad"
                    value={phone}
                    onChangeText={setPhone}
                    onFocus={() => setIsFocusedPhone(true)}
                    onBlur={() => setIsFocusedPhone(false)}
                    autoCorrect={false}
                    autoComplete="off"
                    textContentType="none"
                    importantForAutofill="no"
                  />
                </View>

                <View style={[styles.inputWrapper, isFocusedPassword && styles.inputWrapperFocused]}>
                  <Text style={styles.inputIconEmoji}>🔒</Text>
                  <TextInput
                    style={styles.inputInner}
                    placeholder="Password"
                    placeholderTextColor="#94A3B8"
                    secureTextEntry={!showPassword}
                    value={password}
                    onChangeText={setPassword}
                    onFocus={() => setIsFocusedPassword(true)}
                    onBlur={() => setIsFocusedPassword(false)}
                    autoCorrect={false}
                    autoComplete="off"
                    textContentType="none"
                    importantForAutofill="no"
                  />
                  <TouchableOpacity
                    style={styles.eyeBtn}
                    onPress={() => setShowPassword(!showPassword)}
                    activeOpacity={0.7}
                  >
                    <Text style={{ fontSize: 16 }}>{showPassword ? '🙈' : '👁️'}</Text>
                  </TouchableOpacity>
                </View>

                <TouchableOpacity
                  style={styles.authButton}
                  onPress={handleSendOtp}
                  disabled={isLoggingIn}
                  activeOpacity={0.85}
                >
                  {isLoggingIn ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.authButtonText}>
                      {isLoginMode ? 'SEND OTP & LOGIN' : 'SEND OTP & REGISTER'}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            ) : (
              <View style={{ width: '100%', alignItems: 'center' }}>
                <View style={styles.otpHeaderBox}>
                  <Text style={styles.otpHeaderTitle}>Verify Your Phone</Text>
                  <Text style={styles.otpHeaderSub}>OTP sent to</Text>
                  <Text style={styles.otpHeaderPhone}>{phone}</Text>
                </View>

                <View style={[styles.inputWrapper, isFocusedOtp && styles.inputWrapperFocused, { justifyContent: 'center' }]}>
                  <TextInput
                    style={[styles.inputInner, { textAlign: 'center', letterSpacing: 10, fontSize: 22, fontWeight: '900', color: '#4F46E5' }]}
                    placeholder="— — — — — —"
                    placeholderTextColor="#CBD5E1"
                    keyboardType="number-pad"
                    maxLength={6}
                    value={otpCode}
                    onChangeText={setOtpCode}
                    onFocus={() => setIsFocusedOtp(true)}
                    onBlur={() => setIsFocusedOtp(false)}
                    autoCorrect={false}
                    autoComplete="one-time-code"
                    textContentType="oneTimeCode"
                    importantForAutofill="no"
                  />
                </View>

                <TouchableOpacity
                  style={styles.authButton}
                  onPress={handleVerifyOtp}
                  disabled={isLoggingIn}
                  activeOpacity={0.85}
                >
                  {isLoggingIn ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.authButtonText}>VERIFY & ENTER PLATFORM</Text>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.resendBtn}
                  onPress={handleSendOtp}
                  disabled={otpTimer > 0 || isLoggingIn}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.resendBtnText, otpTimer > 0 && { color: '#94A3B8' }]}>
                    {otpTimer > 0 ? `⏱ Resend OTP in ${otpTimer}s` : '↺ Resend OTP'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.backToAuthBtn}
                  onPress={() => { setOtpSent(false); setOtpCode(''); }}
                  activeOpacity={0.8}
                >
                  <Text style={styles.backToAuthBtnText}>✎ Edit Phone / Details</Text>
                </TouchableOpacity>
              </View>
            )}

            <View style={styles.authDivider}>
              <View style={styles.authDividerLine} />
              <Text style={styles.authDividerText}>or</Text>
              <View style={styles.authDividerLine} />
            </View>

            <TouchableOpacity
              style={styles.devLoginBtn}
              onPress={handleQuickDevLogin}
              disabled={isLoggingIn}
              activeOpacity={0.85}
            >
              <Text style={styles.devLoginBtnText}>⚡ 1-TAP DEMO LOGIN (BYPASS OTP)</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>

        {/* Premium Custom Alert Modal */}
        {customAlert.visible && (
          <Modal visible={true} transparent animationType="fade">
            <View style={styles.alertOverlay}>
              <View style={styles.alertCard}>
                <View style={[
                  styles.alertIconCircle,
                  customAlert.type === 'success' ? styles.alertIcon_success :
                  customAlert.type === 'error' ? styles.alertIcon_error :
                  styles.alertIcon_info
                ]}>
                  <Text style={[styles.alertIconText, { color: customAlert.type === 'success' ? '#10B981' : customAlert.type === 'error' ? '#EF4444' : '#4F46E5' }]}>
                    {customAlert.type === 'success' ? '✓' : customAlert.type === 'error' ? '✕' : 'ℹ'}
                  </Text>
                </View>
                <Text style={styles.alertTitle}>{customAlert.title}</Text>
                <Text style={styles.alertMessage}>{customAlert.message}</Text>
                <TouchableOpacity 
                  style={[
                    styles.alertButton,
                    customAlert.type === 'success' ? styles.alertBtn_success :
                    customAlert.type === 'error' ? styles.alertBtn_error :
                    styles.alertBtn_info
                  ]} 
                  onPress={() => setCustomAlert({ ...customAlert, visible: false })}
                  activeOpacity={0.8}
                >
                  <Text style={styles.alertButtonText}>Got It</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Modal>
        )}
      </KeyboardAvoidingView>
    );
  }

  const renderBalanceCard = () => (
    <View style={styles.balanceCard}>
      <Svg style={StyleSheet.absoluteFillObject} width="100%" height="100%">
        <Defs>
          <LinearGradient id="balanceGrad" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#1E1B4B" />
            <Stop offset="0.5" stopColor="#312E81" />
            <Stop offset="1" stopColor="#1E3A8A" />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#balanceGrad)" rx={24} />
      </Svg>
      
      <View style={styles.balanceCardContent}>
        <Text style={styles.balanceTitle}>MY WALLET BALANCE</Text>
        <Text style={styles.balanceAmount}>₹{balances.total.toFixed(2)}</Text>

        <View style={styles.splitBalances}>
          <View style={styles.splitBox}>
            <Text style={styles.splitLabel}>Added Money</Text>
            <Text style={styles.splitVal}>₹{balances.deposits.toFixed(2)}</Text>
          </View>
          <View style={styles.splitBox}>
            <Text style={styles.splitLabel}>Winnings</Text>
            <Text style={[styles.splitVal, styles.greenText]}>₹{balances.winnings.toFixed(2)}</Text>
          </View>
        </View>
      </View>
    </View>
  );

  const renderAddMoneyCard = () => (
    <View style={styles.premiumAddCard}>
      <Text style={styles.cardHeader}>ADD MONEY TO WALLET</Text>
      <View style={styles.inputContainerWrapper}>
        <Text style={styles.inputCurrencySymbol}>₹</Text>
        <TextInput
          style={[styles.premiumInput, isFocusedDeposit && styles.inputFocused]}
          placeholder="Enter Amount"
          placeholderTextColor="#94A3B8"
          keyboardType="numeric"
          value={depositAmount}
          onChangeText={setDepositAmount}
          onFocus={() => setIsFocusedDeposit(true)}
          onBlur={() => setIsFocusedDeposit(false)}
        />
      </View>
      <TouchableOpacity style={styles.premiumActionBtn} onPress={handleDeposit} disabled={loading} activeOpacity={0.8}>
        <Text style={styles.actionBtnText}>ADD MONEY NOW</Text>
      </TouchableOpacity>

      {upiIntentLink && (
        <View style={styles.intentContainer}>
          <Text style={styles.intentText} numberOfLines={1}>{upiIntentLink}</Text>
          <TouchableOpacity style={styles.verifyBtn} onPress={simulatePaymentWebhook} activeOpacity={0.8}>
            <Text style={styles.actionBtnText}>SIMULATE WEBHOOK SUCCESS</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );

  const renderKycCard = () => {
    if (currentUser.isKycVerified) {
      return (
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
      );
    }

    return (
      <View style={[styles.actionCard, styles.pendingKycCard]}>
        <Text style={styles.cardHeader}>🛡️ ID VERIFICATION REQUIRED</Text>
        <Text style={styles.kycPromptText}>
          Verify your PAN or Aadhaar card details to unlock instant cash withdrawals.
        </Text>

        <View style={styles.kycTabSelector}>
          <TouchableOpacity
            style={[styles.kycTabBtn, kycType === 'PAN' && styles.kycTabBtnActive]}
            onPress={() => setKycType('PAN')}
            activeOpacity={0.7}
          >
            <Text style={[styles.kycTabBtnText, kycType === 'PAN' && styles.kycTabBtnTextActive]}>PAN CARD</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.kycTabBtn, kycType === 'AADHAAR' && styles.kycTabBtnActive]}
            onPress={() => setKycType('AADHAAR')}
            activeOpacity={0.7}
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

        <TouchableOpacity style={styles.kycSubmitBtn} onPress={handleSubmitKyc} disabled={isSubmittingKyc} activeOpacity={0.8}>
          {isSubmittingKyc ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.actionBtnText}>VERIFY ID NOW</Text>
          )}
        </TouchableOpacity>
      </View>
    );
  };

  const renderWithdrawCard = () => {
    const isLocked = !currentUser.isKycVerified;

    return (
      <View style={[styles.premiumWithdrawCard, isLocked && styles.withdrawCardLocked]}>
        <View style={styles.withdrawHeaderRow}>
          <Text style={[styles.cardHeader, { color: isLocked ? '#94A3B8' : '#0F172A' }]}>SEND WINNINGS TO BANK</Text>
          {isLocked && (
            <View style={styles.lockBadge}>
              <Text style={styles.lockBadgeText}>🔒 VERIFY ID TO UNLOCK</Text>
            </View>
          )}
        </View>

        {isLocked ? (
          <View style={styles.lockedContainer}>
            <Text style={styles.lockedText}>
              Winnings withdrawals are locked. Please complete your ID verification to link your bank account.
            </Text>
          </View>
        ) : (
          <View>
            <View style={styles.inputContainerWrapper}>
              <Text style={styles.inputCurrencySymbol}>₹</Text>
              <TextInput
                style={[styles.premiumInput, isFocusedWithdraw && styles.inputFocused]}
                placeholder="Withdraw Amount (INR)"
                placeholderTextColor="#94A3B8"
                keyboardType="numeric"
                value={withdrawAmount}
                onChangeText={setWithdrawAmount}
                onFocus={() => setIsFocusedWithdraw(true)}
                onBlur={() => setIsFocusedWithdraw(false)}
              />
            </View>
            <TextInput
              style={[styles.input, isFocusedUpi && styles.inputFocused, { marginTop: 12 }]}
              placeholder="Enter your UPI ID (e.g. name@upi)"
              placeholderTextColor="#94A3B8"
              value={upiId}
              onChangeText={setUpiId}
              autoCapitalize="none"
              onFocus={() => setIsFocusedUpi(true)}
              onBlur={() => setIsFocusedUpi(false)}
            />
            <TouchableOpacity style={styles.premiumWithdrawBtn} onPress={handleWithdrawal} disabled={loading} activeOpacity={0.8}>
              <Text style={styles.actionBtnText}>WITHDRAW MONEY NOW</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  const renderReferCard = () => (
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

      <TouchableOpacity style={styles.clipboardBox} onPress={handleCopyCode} activeOpacity={0.7}>
        <View style={styles.clipboardLabelCol}>
          <Text style={styles.clipboardLabel}>REFERRAL CODE</Text>
          <Text style={styles.clipboardValue}>{referralCode}</Text>
        </View>
        <View style={styles.copyBadge}>
          <Text style={styles.copyBadgeText}>Copy Code</Text>
        </View>
      </TouchableOpacity>

      <TouchableOpacity style={styles.clipboardBox} onPress={handleCopyLink} activeOpacity={0.7}>
        <View style={styles.clipboardLabelCol}>
          <Text style={styles.clipboardLabel}>INVITE LINK</Text>
          <Text style={styles.clipboardValue} numberOfLines={1}>{referralUrl}</Text>
        </View>
        <View style={styles.copyBadge}>
          <Text style={styles.copyBadgeText}>Copy Link</Text>
        </View>
      </TouchableOpacity>

      <TouchableOpacity style={styles.whatsappBtn} onPress={handleWhatsAppShare} activeOpacity={0.8}>
        <Text style={styles.whatsappBtnText}>Share on WhatsApp</Text>
      </TouchableOpacity>
    </View>
  );

  const renderHistoryCard = () => (
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
              if (txn.type === 'ENTRY_FEE' || txn.type === 'ENTRY_FEE_DEBIT') simpleType = 'Game Played';
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
  );

  const renderComplianceCard = () => (
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
  );

  return (
    <View style={{ flex: 1 }}>
      <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer} showsVerticalScrollIndicator={false}>
        {/* Premium Profile Section */}
        <View style={styles.profileCard}>
          <View style={styles.avatarContainer}>
            <View style={styles.avatar}>
              <Text style={styles.avatarEmoji}>👤</Text>
            </View>
            <TouchableOpacity 
              style={styles.cameraOverlay}
              onPress={() => showCustomAlert('Avatar Editor', 'Profile avatar changes are saved locally.', 'info')}
            >
              <Text style={styles.cameraOverlayText}>📸</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.usernameHeader}>{currentUser.username}</Text>
          <Text style={styles.phoneSub}>{currentUser.phone}</Text>
        </View>

        {/* 2. Wallet Balance Card (Always on Top) */}
        {renderBalanceCard()}

        {/* 3. Add Money to Wallet Card */}
        {renderAddMoneyCard()}

        {/* 4. KYC Card (Shown here ONLY IF NOT verified) */}
        {!currentUser.isKycVerified && renderKycCard()}

        {/* 5. Send Winnings to Bank Card */}
        {renderWithdrawCard()}

        {/* 6. KYC Card (Shown at the bottom ONLY IF verified) */}
        {currentUser.isKycVerified && renderKycCard()}

        {/* 7. Share & Refer Card */}
        {renderReferCard()}

        {/* 8. Transaction History Card */}
        {renderHistoryCard()}

        {/* 9. Help & Legal Policies Card */}
        {renderComplianceCard()}

        {error && <Text style={styles.errorText}>Error: {error}</Text>}
      </ScrollView>

      {/* Premium Custom Alert Modal */}
      {customAlert.visible && (
        <Modal visible={true} transparent animationType="fade">
          <View style={styles.alertOverlay}>
            <View style={styles.alertCard}>
              <View style={[
                styles.alertIconCircle,
                customAlert.type === 'success' ? styles.alertIcon_success :
                customAlert.type === 'error' ? styles.alertIcon_error :
                styles.alertIcon_info
              ]}>
                <Text style={[styles.alertIconText, { color: customAlert.type === 'success' ? '#10B981' : customAlert.type === 'error' ? '#EF4444' : '#4F46E5' }]}>
                  {customAlert.type === 'success' ? '✓' : customAlert.type === 'error' ? '✕' : 'ℹ'}
                </Text>
              </View>
              <Text style={styles.alertTitle}>{customAlert.title}</Text>
              <Text style={styles.alertMessage}>{customAlert.message}</Text>
              <TouchableOpacity 
                style={[
                  styles.alertButton,
                  customAlert.type === 'success' ? styles.alertBtn_success :
                  customAlert.type === 'error' ? styles.alertBtn_error :
                  styles.alertBtn_info
                ]} 
                onPress={() => setCustomAlert({ ...customAlert, visible: false })}
                activeOpacity={0.8}
              >
                <Text style={styles.alertButtonText}>Got It</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}
    </View>
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
    backgroundColor: '#1E1B4B',
  },
  authScrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 30,
  },
  authCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.97)',
    borderRadius: 28,
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 24,
    width: '100%',
    maxWidth: 390,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.25,
    shadowRadius: 40,
    elevation: 16,
    alignItems: 'center',
  },
  authLogoRow: {
    marginBottom: 12,
  },
  authLogoCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#C7D2FE',
  },
  authLogoEmoji: {
    fontSize: 28,
  },
  heading: {
    fontSize: 26,
    fontWeight: '900',
    color: '#1E1B4B',
    letterSpacing: 3,
    marginBottom: 2,
  },
  subheading: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 3,
    marginBottom: 22,
    letterSpacing: 0.5,
  },
  inputWrapper: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    marginBottom: 14,
    height: 52,
    paddingHorizontal: 14,
  },
  inputWrapperFocused: {
    borderColor: '#4F46E5',
    backgroundColor: '#FFFFFF',
  },
  inputIconEmoji: {
    fontSize: 16,
    marginRight: 10,
  },
  inputInner: {
    flex: 1,
    fontSize: 14,
    color: '#0F172A',
    fontWeight: '600',
    padding: 0,
  },
  eyeBtn: {
    padding: 6,
    marginLeft: 6,
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
    borderColor: '#4F46E5',
    backgroundColor: '#FFFFFF',
    shadowColor: '#4F46E5',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  authButton: {
    width: '100%',
    backgroundColor: '#4F46E5',
    borderRadius: 14,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    shadowColor: '#4F46E5',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 5,
  },
  authButtonText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 13,
    letterSpacing: 0.8,
  },
  authDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    marginTop: 18,
    marginBottom: 4,
  },
  authDividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#E2E8F0',
  },
  authDividerText: {
    marginHorizontal: 10,
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: '600',
  },
  devLoginBtn: {
    width: '100%',
    backgroundColor: '#F0FDF4',
    borderRadius: 14,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    borderWidth: 1.5,
    borderColor: '#10B981',
  },
  devLoginBtnText: {
    color: '#059669',
    fontWeight: '800',
    fontSize: 12,
    letterSpacing: 0.5,
  },
  otpHeaderBox: {
    alignItems: 'center',
    marginBottom: 20,
    paddingHorizontal: 10,
  },
  otpHeaderTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#1E1B4B',
    marginBottom: 4,
  },
  otpHeaderSub: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
  },
  otpHeaderPhone: {
    fontSize: 16,
    fontWeight: '800',
    color: '#4F46E5',
    marginTop: 2,
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
    height: 195,
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
  premiumAddCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 12,
    elevation: 2,
  },
  premiumWithdrawCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#D1FAE5',
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 12,
    elevation: 2,
  },
  withdrawCardLocked: {
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
  },
  withdrawHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  lockBadge: {
    backgroundColor: '#FFE4E6',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  lockBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#E11D48',
  },
  lockedContainer: {
    paddingVertical: 12,
  },
  lockedText: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
    lineHeight: 18,
  },
  inputContainerWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  inputCurrencySymbol: {
    fontSize: 16,
    fontWeight: '800',
    color: '#4F46E5',
    marginRight: 6,
  },
  premiumInput: {
    flex: 1,
    height: 44,
    fontSize: 14,
    color: '#0F172A',
    fontWeight: '700',
    padding: 0,
  },
  premiumActionBtn: {
    backgroundColor: '#4F46E5',
    borderRadius: 12,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#4F46E5',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 3,
  },
  premiumWithdrawBtn: {
    backgroundColor: '#10B981',
    borderRadius: 12,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 3,
    marginTop: 12,
  },
  splitBox: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 16,
    paddingVertical: 10,
    alignItems: 'center',
    marginHorizontal: 4,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  alertOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  alertCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    width: '100%',
    maxWidth: 320,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    elevation: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  alertIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  alertIcon_success: {
    backgroundColor: '#D1FAE5',
  },
  alertIcon_error: {
    backgroundColor: '#FEE2E2',
  },
  alertIcon_info: {
    backgroundColor: '#E0E7FF',
  },
  alertIconText: {
    fontSize: 22,
    fontWeight: '800',
  },
  alertTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 8,
    textAlign: 'center',
  },
  alertMessage: {
    fontSize: 13,
    color: '#475569',
    lineHeight: 18,
    textAlign: 'center',
    marginBottom: 20,
    fontWeight: '600',
  },
  alertButton: {
    width: '100%',
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  alertBtn_success: {
    backgroundColor: '#10B981',
  },
  alertBtn_error: {
    backgroundColor: '#EF4444',
  },
  alertBtn_info: {
    backgroundColor: '#4F46E5',
  },
  alertButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  authTabRow: {
    flexDirection: 'row',
    backgroundColor: '#EEF2FF',
    borderRadius: 50,
    padding: 4,
    marginBottom: 22,
    width: '100%',
  },
  authTab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 50,
  },
  authTabActive: {
    backgroundColor: '#4F46E5',
    shadowColor: '#4F46E5',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  authTabText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#6366F1',
    letterSpacing: 0.5,
  },
  authTabTextActive: {
    color: '#FFFFFF',
  },
  otpSentSub: {
    fontSize: 14,
    color: '#475569',
    textAlign: 'center',
    fontWeight: '600',
  },
  resendBtn: {
    marginTop: 15,
    paddingVertical: 8,
  },
  resendBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#4F46E5',
    textAlign: 'center',
  },
  backToAuthBtn: {
    marginTop: 8,
    paddingVertical: 8,
  },
  backToAuthBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
    textAlign: 'center',
    textDecorationLine: 'underline',
  },
});
export default AuthWalletScreen;
