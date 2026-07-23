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

export const AVATARS_100 = [
  '👑', '🤴', '👸', '💎', '🏆', '🎩', '🪞', '💍', '⚜️', '🏰', '🧿', '🔮',
  '🥷', '🤖', '👾', '🎭', '💀', '🪖', '🎯', '⚔️', '🛡️', '🪓', '🧙‍♂️', '🧛‍♂️', '🧜‍♂️', '🧞‍♂️', '🛸',
  '🦁', '🐯', '🐺', '🦅', '🦈', '🐻', '🦊', '🐉', '🐊', '🦍', '🦏', '🐂', '🐆', '🐍', '🦂', '🦉', '🦣', '🦕',
  '😎', '🤩', '🤑', '🤠', '🤯', '😈', '🔥', '⚡', '🚀', '💫', '💥', '🧠', '👀', '👽', '🎃',
  '🎮', '🎲', '♟️', '🎱', '🃏', '🥇', '🥈', '🥉', '⚽', '🏀', '🏈', '🥊', '🏎️', '🏍️',
  '🐶', '🐱', '🐼', '🐨', '🐰', '🐹', '🐻‍❄️', '🦝', '🦥', '🦦', '🦨', '🦘', '🦡', '🦩', '🦚', '🦜', '🐢', '🐬', '🐳', '🦔',
  '✨', '🌌', '☄️', '🪐', '☀️', '🚩', '💰', '💵', '🎖️', '🎗️'
];

interface UserProfile {
  _id: string;
  phone: string;
  username: string;
  avatar?: string;
  isKycVerified?: boolean;
  kycStatus?: 'NONE' | 'PENDING' | 'APPROVED' | 'REJECTED';
  kycType?: 'PAN' | 'AADHAAR' | null;
  kycDocumentNumber?: string | null;
  kycName?: string | null;
  referralCode?: string;
  friendsJoined?: number;
  referredBy?: string | null;
}

interface AuthWalletScreenProps {
  onLoginSuccess: (user: UserProfile, token?: string) => void;
  currentUser: UserProfile | null;
  onLogout?: () => void;
  onUserUpdate?: (user: UserProfile) => void;
  onNavigateAdmin?: () => void;
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
  onNavigateAdmin,
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
  const [referredByCode, setReferredByCode] = useState('');
  const [isFocusedRefCode, setIsFocusedRefCode] = useState(false);
  const [isRefClaimed, setIsRefClaimed] = useState(false);
  // Forgot Password States
  const [isForgotPasswordMode, setIsForgotPasswordMode] = useState(false);
  const [forgotStep, setForgotStep] = useState<'SEND_OTP' | 'RESET_PASSWORD'>('SEND_OTP');
  const [forgotOtp, setForgotOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [isSubmittingForgot, setIsSubmittingForgot] = useState(false);
  const [isFocusedForgotOtp, setIsFocusedForgotOtp] = useState(false);
  const [isFocusedNewPass, setIsFocusedNewPass] = useState(false);

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

  const rawReferralCode = currentUser?.referralCode || 'DREAM50LUDO';
  const referralCode = rawReferralCode.replace(/^SEXUS/i, 'DREAM');
  const friendsJoined = currentUser?.friendsJoined || 0;
  const totalCashEarned = friendsJoined * 10;
  const referralUrl = `https://dreamludo.com/signup?ref=${referralCode}`;

  const [isHistoryExpanded, setIsHistoryExpanded] = useState(false);
  const [activePolicy, setActivePolicy] = useState<string | null>(null);

  const [showAvatarPicker, setShowAvatarPicker] = useState(false);
  const [selectedAvatar, setSelectedAvatar] = useState(currentUser?.avatar || '👑');
  const [isUpdatingAvatar, setIsUpdatingAvatar] = useState(false);

  const handleSaveAvatar = async (newAvatar: string) => {
    setSelectedAvatar(newAvatar);
    if (!currentUser) return;
    setIsUpdatingAvatar(true);
    try {
      const response = await axios.post(`${API_SERVER_URL}/api/users/update-avatar`, {
        userId: currentUser._id,
        avatar: newAvatar,
      });
      if (response.data.success) {
        if (onUserUpdate) {
          onUserUpdate({ ...currentUser, avatar: newAvatar });
        }
        showCustomAlert('Avatar Updated! ✨', 'Your profile avatar has been updated across all game screens.', 'success');
        setShowAvatarPicker(false);
      }
    } catch (err: any) {
      showCustomAlert('Avatar Error', err.response?.data?.error || err.message || 'Failed to update avatar.', 'error');
    } finally {
      setIsUpdatingAvatar(false);
    }
  };

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

  const [agreedTerms, setAgreedTerms] = useState(true);

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

    if (!isLoginMode && !agreedTerms) {
      showCustomAlert('Terms Agreement Required', 'Please accept the Terms of Service & Privacy Policy to register.', 'error');
      return;
    }

    setIsLoggingIn(true);
    try {
      const response = await axios.post(`${API_SERVER_URL}/api/users/send-otp`, {
        phone,
        username: isLoginMode ? undefined : username,
        password,
        isLogin: isLoginMode,
        referredByCode: !isLoginMode ? (referredByCode.trim().toUpperCase() || undefined) : undefined,
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
        referredByCode: !isLoginMode ? (referredByCode.trim().toUpperCase() || undefined) : undefined,
      });

      if (response.data.success) {
        axios.defaults.headers.common['x-auth-token'] = response.data.token;
        axios.defaults.headers.common['Authorization'] = `Bearer ${response.data.token}`;
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
          axios.defaults.headers.common['Authorization'] = `Bearer ${response.data.token}`;
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

    const amount = Number(withdrawAmount);
    if (isNaN(amount) || amount <= 0) {
      showCustomAlert('Withdrawal Error', 'Please enter a valid amount.', 'error');
      return;
    }
    if (!upiId) {
      showCustomAlert('Withdrawal Error', 'Please enter a target UPI ID.', 'error');
      return;
    }

    const withdrawableBalance = Math.round((balances.winnings || 0) * 100) / 100;
    if (amount > withdrawableBalance) {
      showCustomAlert(
        'Withdrawal Error',
        `Only Winnings Balance can be withdrawn. Available winnings: ₹${withdrawableBalance.toFixed(2)}. Bonus cash (₹10 sign-up bonus & ₹50 referral bonus) and deposit cash cannot be withdrawn and are strictly for playing matches.`,
        'error'
      );
      return;
    }

    const result = await withdrawWinnings(currentUser._id, amount, upiId);
    if (result.success) {
      showCustomAlert('Withdrawal Successful', 'IMPS transfer completed. Balance locked and settled.', 'success');
      setWithdrawAmount('');
      setUpiId('');
    } else {
      showCustomAlert('Withdrawal Failed', result.error || 'Server rejected payout', 'error');
    }
  };

  const handleOpenWhatsAppSupport = async () => {
    const phone = '919343544331';
    const text = encodeURIComponent('Hello Dream Ludo Support, I need assistance with my account.');
    const whatsappUrl = `whatsapp://send?phone=${phone}&text=${text}`;
    const webUrl = `https://wa.me/${phone}?text=${text}`;
    try {
      const supported = await Linking.canOpenURL(whatsappUrl);
      if (supported) {
        await Linking.openURL(whatsappUrl);
      } else {
        await Linking.openURL(webUrl);
      }
    } catch (err) {
      Linking.openURL(webUrl);
    }
  };

  const handleSendForgotOtp = async () => {
    if (!phone || phone.trim().length < 10) {
      showCustomAlert('Forgot Password', 'Please enter your registered 10-digit mobile number.', 'error');
      return;
    }
    setIsSubmittingForgot(true);
    try {
      const response = await axios.post(`${API_SERVER_URL}/api/users/forgot-password/send-otp`, {
        phone: phone.trim(),
      });
      if (response.data.success) {
        setForgotStep('RESET_PASSWORD');
        showCustomAlert(
          'OTP Sent 📩',
          `Verification OTP sent to +91 ${phone.trim().slice(-10)}.${response.data.otp ? '\nTest OTP: ' + response.data.otp : ''}`,
          'success'
        );
      }
    } catch (err: any) {
      showCustomAlert('Forgot Password', err.response?.data?.error || err.message || 'Failed to send OTP.', 'error');
    } finally {
      setIsSubmittingForgot(false);
    }
  };

  const handleResetPassword = async () => {
    if (!phone || phone.trim().length < 10) {
      showCustomAlert('Reset Password', 'Please enter your registered 10-digit mobile number.', 'error');
      return;
    }
    if (!forgotOtp || forgotOtp.trim().length < 4) {
      showCustomAlert('Reset Password', 'Please enter the 6-digit OTP received via SMS.', 'error');
      return;
    }
    if (!newPassword || newPassword.trim().length < 4) {
      showCustomAlert('Reset Password', 'New password must be at least 4 characters long.', 'error');
      return;
    }

    setIsSubmittingForgot(true);
    try {
      const response = await axios.post(`${API_SERVER_URL}/api/users/forgot-password/reset`, {
        phone: phone.trim(),
        otp: forgotOtp.trim(),
        newPassword: newPassword.trim(),
      });
      if (response.data.success) {
        setPassword(newPassword.trim());
        setIsForgotPasswordMode(false);
        setForgotStep('SEND_OTP');
        setForgotOtp('');
        setNewPassword('');
        setIsLoginMode(true);
        showCustomAlert('Success! 🎉', 'Password reset successfully! Log in with your new password.', 'success');
      }
    } catch (err: any) {
      showCustomAlert('Reset Error', err.response?.data?.error || err.message || 'Failed to reset password.', 'error');
    } finally {
      setIsSubmittingForgot(false);
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
      const text = encodeURIComponent(`🎲 Play Dream Ludo and Earn Cash! Join using my referral code: ${referralCode}\nSignup URL: ${referralUrl}`);
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
            <Text style={styles.heading}>DREAM LUDO</Text>

            {/* Premium Pill Tab Switcher */}
            {!otpSent && !isForgotPasswordMode && (
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

            {isForgotPasswordMode ? (
              <View style={{ width: '100%' }}>
                <View style={{ backgroundColor: '#EEF2FF', padding: 14, borderRadius: 12, marginBottom: 16, borderLeftWidth: 4, borderLeftColor: '#4F46E5' }}>
                  <Text style={{ fontSize: 16, fontWeight: '800', color: '#1E1B4B' }}>
                    {forgotStep === 'SEND_OTP' ? '🔑 RESET YOUR PASSWORD' : '🔐 CREATE NEW PASSWORD'}
                  </Text>
                  <Text style={{ fontSize: 12, color: '#4338CA', marginTop: 4, lineHeight: 16 }}>
                    {forgotStep === 'SEND_OTP'
                      ? 'Enter your registered 10-digit mobile number. We will send a 6-digit OTP to verify your identity.'
                      : `Enter the 6-digit OTP sent to +91 ${phone.slice(-10)} and choose a new password.`}
                  </Text>
                </View>

                {forgotStep === 'SEND_OTP' ? (
                  <View>
                    <View style={[styles.inputWrapper, isFocusedPhone && styles.inputWrapperFocused]}>
                      <Text style={styles.inputIconEmoji}>📱</Text>
                      <TextInput
                        style={styles.inputInner}
                        placeholder="Registered Phone (+91)"
                        placeholderTextColor="#94A3B8"
                        keyboardType="phone-pad"
                        value={phone}
                        onChangeText={(text) => setPhone(text.replace(/[^0-9]/g, ''))}
                        onFocus={() => setIsFocusedPhone(true)}
                        onBlur={() => setIsFocusedPhone(false)}
                        autoCorrect={false}
                      />
                    </View>
                    <TouchableOpacity
                      style={styles.authButton}
                      onPress={handleSendForgotOtp}
                      disabled={isSubmittingForgot}
                      activeOpacity={0.85}
                    >
                      {isSubmittingForgot ? (
                        <ActivityIndicator color="#fff" />
                      ) : (
                        <Text style={styles.authButtonText}>SEND RESET OTP</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View>
                    <View style={[styles.inputWrapper, isFocusedForgotOtp && styles.inputWrapperFocused]}>
                      <Text style={styles.inputIconEmoji}>🔑</Text>
                      <TextInput
                        style={styles.inputInner}
                        placeholder="6-Digit OTP"
                        placeholderTextColor="#94A3B8"
                        keyboardType="number-pad"
                        maxLength={6}
                        value={forgotOtp}
                        onChangeText={setForgotOtp}
                        onFocus={() => setIsFocusedForgotOtp(true)}
                        onBlur={() => setIsFocusedForgotOtp(false)}
                      />
                    </View>
                    <View style={[styles.inputWrapper, isFocusedNewPass && styles.inputWrapperFocused]}>
                      <Text style={styles.inputIconEmoji}>🔒</Text>
                      <TextInput
                        style={styles.inputInner}
                        placeholder="New Password"
                        placeholderTextColor="#94A3B8"
                        secureTextEntry={!showNewPassword}
                        value={newPassword}
                        onChangeText={setNewPassword}
                        onFocus={() => setIsFocusedNewPass(true)}
                        onBlur={() => setIsFocusedNewPass(false)}
                        autoCorrect={false}
                      />
                      <TouchableOpacity
                        style={styles.eyeBtn}
                        onPress={() => setShowNewPassword(!showNewPassword)}
                        activeOpacity={0.7}
                      >
                        <Text style={{ fontSize: 16 }}>{showNewPassword ? '🙈' : '👁️'}</Text>
                      </TouchableOpacity>
                    </View>
                    <TouchableOpacity
                      style={styles.authButton}
                      onPress={handleResetPassword}
                      disabled={isSubmittingForgot}
                      activeOpacity={0.85}
                    >
                      {isSubmittingForgot ? (
                        <ActivityIndicator color="#fff" />
                      ) : (
                        <Text style={styles.authButtonText}>RESET PASSWORD NOW</Text>
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={{ alignSelf: 'center', marginTop: 10 }}
                      onPress={handleSendForgotOtp}
                      disabled={isSubmittingForgot}
                    >
                      <Text style={{ fontSize: 13, color: '#4F46E5', fontWeight: '700' }}>Resend OTP</Text>
                    </TouchableOpacity>
                  </View>
                )}

                <TouchableOpacity
                  style={{ alignSelf: 'center', marginTop: 16, paddingVertical: 10, paddingHorizontal: 20 }}
                  onPress={() => {
                    setIsForgotPasswordMode(false);
                    setForgotStep('SEND_OTP');
                    setIsLoginMode(true);
                  }}
                  activeOpacity={0.7}
                  hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
                >
                  <Text style={{ fontSize: 14, color: '#4F46E5', fontWeight: '800' }}>← Back to Login</Text>
                </TouchableOpacity>
              </View>
            ) : !otpSent ? (
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
                    onChangeText={(text) => setPhone(text.replace(/[^0-9]/g, ''))}
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

                {isLoginMode && (
                  <TouchableOpacity
                    style={{ alignSelf: 'flex-end', marginTop: 2, marginBottom: 12 }}
                    onPress={() => {
                      setIsForgotPasswordMode(true);
                      setForgotStep('SEND_OTP');
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={{ fontSize: 13, color: '#4F46E5', fontWeight: '700' }}>Forgot Password?</Text>
                  </TouchableOpacity>
                )}

                {!isLoginMode && (
                  <View style={{ marginBottom: 12 }}>
                    <View style={[
                      styles.referralCapsuleWrapper,
                      isFocusedRefCode && styles.referralCapsuleFocused,
                      isRefClaimed && styles.referralCapsuleClaimed
                    ]}>
                      <Text style={{ fontSize: 16, marginRight: 8 }}>🎁</Text>
                      <TextInput
                        style={styles.referralCapsuleInput}
                        placeholder="Referral Code (Optional)"
                        placeholderTextColor="#94A3B8"
                        value={referredByCode}
                        onChangeText={(txt) => {
                          setReferredByCode(txt.toUpperCase());
                          setIsRefClaimed(false);
                        }}
                        onFocus={() => setIsFocusedRefCode(true)}
                        onBlur={() => setIsFocusedRefCode(false)}
                        autoCapitalize="characters"
                        autoCorrect={false}
                      />
                      <TouchableOpacity
                        style={[styles.claimBonusBtn, isRefClaimed && styles.claimBonusBtnClaimed]}
                        onPress={() => {
                          if (!referredByCode.trim()) {
                            showCustomAlert('Referral Code', 'Please enter a referral code first.', 'info');
                            return;
                          }
                          setIsRefClaimed(true);
                          showCustomAlert(
                            'Referral Code Applied! 🎁',
                            `Code "${referredByCode.trim().toUpperCase()}" verified! You will receive ₹10 extra bonus cash upon completing signup.`,
                            'success'
                          );
                        }}
                        activeOpacity={0.8}
                      >
                        <Text style={styles.claimBonusText}>{isRefClaimed ? '✓ CLAIMED' : 'CLAIM'}</Text>
                      </TouchableOpacity>
                    </View>
                    <Text style={styles.referralHintSub}>
                      {isRefClaimed
                        ? '✨ Referral bonus unlocked! Complete signup to receive ₹10 bonus cash.'
                        : '💡 Have a friend\'s code? Type it & tap CLAIM for ₹10 bonus cash!'}
                    </Text>

                    {/* Interactive Terms & Policy Agreement Checkbox */}
                    <TouchableOpacity
                      style={styles.authCheckboxRow}
                      onPress={() => setAgreedTerms(!agreedTerms)}
                      activeOpacity={0.8}
                    >
                      <View style={[styles.authCheckboxBox, agreedTerms && styles.authCheckboxBoxChecked]}>
                        {agreedTerms && <Text style={styles.authCheckmarkIcon}>✓</Text>}
                      </View>
                      <Text style={styles.authCheckboxLabel}>
                        I agree to the <Text style={styles.authPolicyLink} onPress={() => showCustomAlert('Terms & Privacy Policy', 'By signing up on Dream Ludo, you agree to our Terms of Service, Privacy Policy, and Refund Policy.', 'info')}>Terms of Service & Privacy Policy</Text> of Dream Ludo.
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}

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
                    autoComplete="sms-otp"
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
    return null;
  };

  const renderWithdrawCard = () => {
    const withdrawableBalance = Math.round((balances.winnings || 0) * 100) / 100;

    return (
      <View style={styles.premiumWithdrawCard}>
        <View style={styles.withdrawHeaderRow}>
          <Text style={[styles.cardHeader, { color: '#0F172A' }]}>WITHDRAW MONEY TO BANK</Text>
        </View>

        <View>
          <View style={{ backgroundColor: '#F8FAFC', padding: 10, borderRadius: 8, marginBottom: 12, borderWidth: 1, borderColor: '#E2E8F0' }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: '#1E293B' }}>
              Available Winnings to Withdraw: <Text style={{ color: '#16A34A', fontSize: 14 }}>₹{withdrawableBalance.toFixed(2)}</Text>
            </Text>
            <Text style={{ fontSize: 11, color: '#64748B', marginTop: 4, lineHeight: 15 }}>
              💡 Note: Only Winnings Balance can be withdrawn. Deposit cash & Bonus cash (₹10 Sign-Up & ₹50 Referral Bonus) cannot be withdrawn and are used to play matches.
            </Text>
          </View>
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
      </View>
    );
  };

  const renderReferCard = () => (
    <View style={styles.actionCard}>
      <Text style={styles.cardHeader}>🎁 SHARE & REFER TO EARN</Text>
      
      <View style={styles.referMetricsGrid}>
        <View style={styles.referMetricCol}>
          <Text style={styles.referMetricVal}>{friendsJoined}</Text>
          <Text style={styles.referMetricLabel}>Friends Joined</Text>
        </View>
        <View style={styles.metricDivider} />
        <View style={styles.referMetricCol}>
          <Text style={[styles.referMetricVal, styles.greenText]}>₹{totalCashEarned}</Text>
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
        <View style={styles.supportDetailCard}>
          <View style={styles.supportHeaderRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={{ fontSize: 22, marginRight: 8 }}>🎧</Text>
              <Text style={styles.supportTitle}>Customer Support</Text>
            </View>
            <View style={styles.supportOnlineBadge}>
              <View style={styles.greenDot} />
              <Text style={styles.supportOnlineText}>24/7 LIVE</Text>
            </View>
          </View>

          {/* WhatsApp Direct Action Card */}
          <TouchableOpacity 
            style={styles.whatsappCardBtn} 
            onPress={handleOpenWhatsAppSupport} 
            activeOpacity={0.85}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={styles.whatsappIconCircle}>
                <Text style={{ fontSize: 24 }}>💬</Text>
              </View>
              <View style={{ marginLeft: 12, flex: 1 }}>
                <Text style={styles.whatsappCardTitle}>Chat on WhatsApp</Text>
                <Text style={styles.whatsappCardNumber}>+91 9343544331</Text>
              </View>
              <Text style={styles.whatsappArrow}>➔</Text>
            </View>
          </TouchableOpacity>

          {/* Email Support Action Card */}
          <TouchableOpacity 
            style={styles.emailCardBtn}
            onPress={() => Linking.openURL('mailto:dreamlodo079@gmail.com')} 
            activeOpacity={0.8}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={styles.emailIconCircle}>
                <Text style={{ fontSize: 20 }}>✉️</Text>
              </View>
              <View style={{ marginLeft: 12, flex: 1 }}>
                <Text style={styles.emailCardLabel}>Email Support Desk</Text>
                <Text style={styles.emailCardValue}>dreamlodo079@gmail.com</Text>
              </View>
              <Text style={styles.emailCardLink}>SEND ➔</Text>
            </View>
          </TouchableOpacity>

          {/* Response Time & Guarantee Pill */}
          <View style={styles.responseTimeBanner}>
            <Text style={{ fontSize: 14, marginRight: 6 }}>⏱️</Text>
            <Text style={styles.responseTimeText}>
              Typical Response Time: <Text style={{ fontWeight: '900', color: '#059669' }}>Under 10 minutes</Text> (24/7 Dedicated Support).
            </Text>
          </View>
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
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <Text style={styles.policyDetailTitle}>Terms of Service</Text>
            <Text style={{ fontSize: 11, fontWeight: '700', color: '#4F46E5', backgroundColor: '#EEF2FF', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 }}>📜 Scroll to read all 13 points</Text>
          </View>
          <ScrollView nestedScrollEnabled={true} style={{ maxHeight: 450, paddingRight: 6 }} showsVerticalScrollIndicator={true}>
            <Text style={{ fontSize: 11, color: '#94A3B8', marginBottom: 10 }}>Last Updated: May 2025</Text>

            <Text style={{ fontSize: 13, fontWeight: '800', color: '#0F172A', marginTop: 6 }}>1. Acceptance of Terms</Text>
            <Text style={{ fontSize: 12, color: '#475569', marginTop: 4, lineHeight: 17 }}>
              By downloading, installing, or using Dream Ludo ("App", "Platform", "Service"), you agree to be bound by these Terms of Service. If you do not agree to these terms, do not use the App. These Terms constitute a legally binding agreement between you and Dream Ludo.
            </Text>

            <Text style={{ fontSize: 13, fontWeight: '800', color: '#0F172A', marginTop: 10 }}>2. Eligibility</Text>
            <Text style={{ fontSize: 12, color: '#475569', marginTop: 4, lineHeight: 17 }}>
              You must be at least 18 years of age to use this platform. By registering, you confirm that:
              {'\n'}• You are 18 years or older
              {'\n'}• You are a resident of India in a state where skill-based gaming is legally permitted
              {'\n'}• You are not a resident of Assam, Odisha, Telangana, Andhra Pradesh, Nagaland, Sikkim, or any other state where online gaming for money is prohibited
              {'\n'}• You are playing voluntarily and using your own funds
              {'\n'}• You have not been previously banned from our platform
            </Text>

            <Text style={{ fontSize: 13, fontWeight: '800', color: '#0F172A', marginTop: 10 }}>3. Nature of Games</Text>
            <Text style={{ fontSize: 12, color: '#475569', marginTop: 4, lineHeight: 17 }}>
              Dream Ludo is a skill-based gaming platform. Ludo involves elements of strategy, decision-making, and skill. The outcome is not purely based on chance. Real money can be won or lost. This is NOT gambling — it is a game of skill, recognized under Indian law. However, results are not guaranteed, and you may lose your deposited funds.
            </Text>

            <Text style={{ fontSize: 13, fontWeight: '800', color: '#0F172A', marginTop: 10 }}>4. Account Registration</Text>
            <Text style={{ fontSize: 12, color: '#475569', marginTop: 4, lineHeight: 17 }}>
              • You must register with a valid Indian mobile number
              {'\n'}• One account per person — multiple accounts are strictly prohibited
              {'\n'}• You are responsible for maintaining the security of your account
              {'\n'}• Provide accurate and truthful information during registration
            </Text>

            <Text style={{ fontSize: 13, fontWeight: '800', color: '#0F172A', marginTop: 10 }}>5. Deposits and Withdrawals</Text>
            <Text style={{ fontSize: 12, color: '#475569', marginTop: 4, lineHeight: 17 }}>
              • Minimum deposit: ₹10 | Minimum withdrawal: ₹100
              {'\n'}• Deposits are made via PhonePe/UPI payment gateway
              {'\n'}• Withdrawals are processed to your registered UPI ID or bank account
              {'\n'}• Only "Winning Balance" and "Deposit Balance" are withdrawable — "Bonus Balance" cannot be directly withdrawn
              {'\n'}• Withdrawals are subject to TDS (Tax Deducted at Source) @ 30% as per Section 194BA of the Income Tax Act, 1961
              {'\n'}• Withdrawal processing time: 10–60 minutes during business hours
              {'\n'}• We reserve the right to hold withdrawals for fraud verification
            </Text>

            <Text style={{ fontSize: 13, fontWeight: '800', color: '#0F172A', marginTop: 10 }}>6. Tax Deducted at Source (TDS)</Text>
            <Text style={{ fontSize: 12, color: '#475569', marginTop: 4, lineHeight: 17 }}>
              As per the Income Tax Act (Section 194BA, effective April 1, 2023), 30% TDS is deducted on net winnings from online gaming at the time of each withdrawal.
              {'\n'}• TDS @ 30% is automatically deducted from every withdrawal
              {'\n'}• Example: If you withdraw ₹1,000, TDS of ₹300 is deducted, and ₹700 is credited to your account
              {'\n'}• TDS certificates (Form 16A) will be available upon request
              {'\n'}• Users are responsible for filing their own income tax returns
            </Text>

            <Text style={{ fontSize: 13, fontWeight: '800', color: '#0F172A', marginTop: 10 }}>7. Fair Play and Prohibited Conduct</Text>
            <Text style={{ fontSize: 12, color: '#475569', marginTop: 4, lineHeight: 17 }}>
              The following are strictly prohibited:
              {'\n'}• Using bots, scripts, or automated tools
              {'\n'}• Collusion with other players
              {'\n'}• Creating multiple accounts
              {'\n'}• Exploiting bugs or glitches
              {'\n'}• Fraudulent payment activity
              {'\n'}• Any form of cheating or unfair play
              {'\n'}Violation of these rules will result in immediate account suspension and forfeiture of all balances.
            </Text>

            <Text style={{ fontSize: 13, fontWeight: '800', color: '#0F172A', marginTop: 10 }}>8. Responsible Gaming</Text>
            <Text style={{ fontSize: 12, color: '#475569', marginTop: 4, lineHeight: 17 }}>
              We are committed to responsible gaming. You can set deposit limits, loss limits, and self-exclusion periods from the Responsible Gaming section in your account settings. If you feel you have a gambling problem, please contact a helpline or self-exclude immediately.
            </Text>

            <Text style={{ fontSize: 13, fontWeight: '800', color: '#0F172A', marginTop: 10 }}>9. Intellectual Property</Text>
            <Text style={{ fontSize: 12, color: '#475569', marginTop: 4, lineHeight: 17 }}>
              All content, design, graphics, logos, and software on the Dream Ludo platform are the exclusive property of Dream Ludo. Unauthorized reproduction, distribution, or modification is prohibited.
            </Text>

            <Text style={{ fontSize: 13, fontWeight: '800', color: '#0F172A', marginTop: 10 }}>10. Limitation of Liability</Text>
            <Text style={{ fontSize: 12, color: '#475569', marginTop: 4, lineHeight: 17 }}>
              Dream Ludo shall not be liable for any indirect, incidental, or consequential damages. Our maximum liability to you shall not exceed the balance in your account at the time of the dispute. We are not responsible for losses due to network issues, server downtime, or third-party payment failures.
            </Text>

            <Text style={{ fontSize: 13, fontWeight: '800', color: '#0F172A', marginTop: 10 }}>11. Termination</Text>
            <Text style={{ fontSize: 12, color: '#475569', marginTop: 4, lineHeight: 17 }}>
              We reserve the right to suspend or terminate any account at any time for violation of these terms, fraudulent activity, or at our discretion. Upon termination, remaining balance may be refunded at our discretion after due diligence.
            </Text>

            <Text style={{ fontSize: 13, fontWeight: '800', color: '#0F172A', marginTop: 10 }}>12. Governing Law</Text>
            <Text style={{ fontSize: 12, color: '#475569', marginTop: 4, lineHeight: 17 }}>
              These Terms are governed by the laws of India. Any disputes shall be subject to the exclusive jurisdiction of courts in Hyderabad, Telangana.
            </Text>

            <Text style={{ fontSize: 13, fontWeight: '800', color: '#0F172A', marginTop: 10 }}>13. Contact Us</Text>
            <Text style={{ fontSize: 12, color: '#475569', marginTop: 4, lineHeight: 17, marginBottom: 12 }}>
              For any questions about these Terms, contact us:
              {'\n'}• Support: Available through in-app Support Chat / WhatsApp (+91 9343544331)
              {'\n'}• Email: dreamlodo079@gmail.com
            </Text>
          </ScrollView>
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
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <Text style={styles.policyDetailTitle}>Privacy Policy</Text>
            <Text style={{ fontSize: 11, fontWeight: '700', color: '#4F46E5', backgroundColor: '#EEF2FF', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 }}>📜 Scroll to read all 11 points</Text>
          </View>
          <ScrollView nestedScrollEnabled={true} style={{ maxHeight: 450, paddingRight: 6 }} showsVerticalScrollIndicator={true}>
            <Text style={{ fontSize: 11, color: '#94A3B8', marginBottom: 10 }}>Last Updated: May 2025</Text>

            <Text style={{ fontSize: 13, fontWeight: '800', color: '#0F172A', marginTop: 6 }}>1. Introduction</Text>
            <Text style={{ fontSize: 12, color: '#475569', marginTop: 4, lineHeight: 17 }}>
              Dream Ludo ("we", "us", "our") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, store, and share your personal information when you use our application and services. By using our platform, you agree to the terms of this policy.
            </Text>

            <Text style={{ fontSize: 13, fontWeight: '800', color: '#0F172A', marginTop: 10 }}>2. Information We Collect</Text>
            <Text style={{ fontSize: 12, color: '#475569', marginTop: 4, lineHeight: 17 }}>
              We collect the following information:
              {'\n\n'}<Text style={{ fontWeight: '700' }}>Personal Information:</Text>
              {'\n'}• Mobile phone number (for registration and OTP verification)
              {'\n'}• Name (provided during profile setup)
              {'\n'}• Profile avatar / photo (optional)
              {'\n\n'}<Text style={{ fontWeight: '700' }}>Financial Information:</Text>
              {'\n'}• UPI ID or bank account details (for withdrawals)
              {'\n'}• Transaction history
              {'\n\n'}<Text style={{ fontWeight: '700' }}>Technical Information:</Text>
              {'\n'}• Device information (model, OS version)
              {'\n'}• IP address and location (for fraud prevention)
              {'\n'}• App usage patterns and game history
            </Text>

            <Text style={{ fontSize: 13, fontWeight: '800', color: '#0F172A', marginTop: 10 }}>3. How We Use Your Information</Text>
            <Text style={{ fontSize: 12, color: '#475569', marginTop: 4, lineHeight: 17 }}>
              We use your information to:
              {'\n'}• Create and manage your account
              {'\n'}• Process deposits and withdrawals
              {'\n'}• Send OTP verification via SMS
              {'\n'}• Detect and prevent fraud and abuse
              {'\n'}• Comply with legal and regulatory requirements (including TDS reporting)
              {'\n'}• Send important account notifications
              {'\n'}• Improve our services and user experience
              {'\n'}• Resolve disputes and provide customer support
            </Text>

            <Text style={{ fontSize: 13, fontWeight: '800', color: '#0F172A', marginTop: 10 }}>4. Data Sharing</Text>
            <Text style={{ fontSize: 12, color: '#475569', marginTop: 4, lineHeight: 17 }}>
              We do not sell your personal data to third parties. We may share your information with:
              {'\n'}• Payment processors (PhonePe) for transaction processing
              {'\n'}• SMS service providers (SMS India Hub) for OTP delivery
              {'\n'}• Government authorities when required by law (e.g., TDS reporting to Income Tax Department)
              {'\n'}• Legal authorities in response to court orders or legal processes
            </Text>

            <Text style={{ fontSize: 13, fontWeight: '800', color: '#0F172A', marginTop: 10 }}>5. Data Security</Text>
            <Text style={{ fontSize: 12, color: '#475569', marginTop: 4, lineHeight: 17 }}>
              We implement industry-standard security measures to protect your data:
              {'\n'}• All data transmitted using HTTPS/TLS encryption
              {'\n'}• Passwords stored using secure hashing (bcrypt)
              {'\n'}• Session tokens with expiry and rotation
              {'\n'}• Rate limiting to prevent brute force attacks
              {'\n'}• Regular security audits
            </Text>

            <Text style={{ fontSize: 13, fontWeight: '800', color: '#0F172A', marginTop: 10 }}>6. Data Retention</Text>
            <Text style={{ fontSize: 12, color: '#475569', marginTop: 4, lineHeight: 17 }}>
              • Account data: Retained for the duration of your account plus 7 years after closure (for legal compliance)
              {'\n'}• Transaction records: Retained for 7 years for tax compliance
              {'\n'}• Chat/support messages: Retained for 1 year
            </Text>

            <Text style={{ fontSize: 13, fontWeight: '800', color: '#0F172A', marginTop: 10 }}>7. Your Rights</Text>
            <Text style={{ fontSize: 12, color: '#475569', marginTop: 4, lineHeight: 17 }}>
              You have the right to:
              {'\n'}• Access your personal data
              {'\n'}• Correct inaccurate data
              {'\n'}• Request account deletion (subject to legal retention requirements)
              {'\n'}• Withdraw consent for marketing communications
              {'\n'}• Receive your data in a portable format
              {'\n\n'}To exercise these rights, contact us via in-app Support Chat or WhatsApp (+91 9343544331).
            </Text>

            <Text style={{ fontSize: 13, fontWeight: '800', color: '#0F172A', marginTop: 10 }}>8. Cookies and Tracking</Text>
            <Text style={{ fontSize: 12, color: '#475569', marginTop: 4, lineHeight: 17 }}>
              We use session storage and local storage on your device to:
              {'\n'}• Maintain your login session
              {'\n'}• Remember your preferences
              {'\n'}• Improve app performance
              {'\n\n'}We do not use third-party advertising cookies.
            </Text>

            <Text style={{ fontSize: 13, fontWeight: '800', color: '#0F172A', marginTop: 10 }}>9. Children's Privacy</Text>
            <Text style={{ fontSize: 12, color: '#475569', marginTop: 4, lineHeight: 17 }}>
              Our services are strictly for users aged 18 and above. We do not knowingly collect data from minors. If we discover that a user is under 18, we will immediately terminate their account and delete their data.
            </Text>

            <Text style={{ fontSize: 13, fontWeight: '800', color: '#0F172A', marginTop: 10 }}>10. Changes to This Policy</Text>
            <Text style={{ fontSize: 12, color: '#475569', marginTop: 4, lineHeight: 17 }}>
              We may update this Privacy Policy from time to time. We will notify you of significant changes through the app. Continued use of the app after changes constitutes acceptance of the updated policy.
            </Text>

            <Text style={{ fontSize: 13, fontWeight: '800', color: '#0F172A', marginTop: 10 }}>11. Contact Us</Text>
            <Text style={{ fontSize: 12, color: '#475569', marginTop: 4, lineHeight: 17, marginBottom: 12 }}>
              For privacy-related inquiries:
              {'\n'}• Support: Available through in-app Support Chat / WhatsApp (+91 9343544331)
              {'\n'}• Email: dreamlodo079@gmail.com
              {'\n'}• Website: dreamludo.com
            </Text>
          </ScrollView>
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
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <Text style={styles.policyDetailTitle}>Refund Policy</Text>
            <Text style={{ fontSize: 11, fontWeight: '700', color: '#4F46E5', backgroundColor: '#EEF2FF', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 }}>📜 Scroll to read all 7 points</Text>
          </View>
          <ScrollView nestedScrollEnabled={true} style={{ maxHeight: 450, paddingRight: 6 }} showsVerticalScrollIndicator={true}>
            <Text style={{ fontSize: 11, color: '#94A3B8', marginBottom: 10 }}>Last Updated: May 2025</Text>

            <Text style={{ fontSize: 13, fontWeight: '800', color: '#0F172A', marginTop: 6 }}>💳 1. Deposit Refunds</Text>
            <Text style={{ fontSize: 12, color: '#475569', marginTop: 4, lineHeight: 17 }}>
              Deposits made to Dream Ludo are generally non-refundable once credited to your account. However, refunds will be processed in the following cases:
              {'\n'}• Amount deducted but not credited to your account within 24 hours
              {'\n'}• Duplicate transaction (same amount deducted twice)
              {'\n'}• Technical error on our payment gateway's end
              {'\n\n'}To claim a deposit refund, raise a support ticket within 7 days with:
              {'\n'}• Transaction ID / UTR number
              {'\n'}• Screenshot of bank deduction
              {'\n'}• Date and amount
            </Text>

            <Text style={{ fontSize: 13, fontWeight: '800', color: '#0F172A', marginTop: 10 }}>🎲 2. Entry Fee Refunds</Text>
            <Text style={{ fontSize: 12, color: '#475569', marginTop: 4, lineHeight: 17 }}>
              Entry fees for games may be refunded in the following cases:
              {'\n'}• Game cancelled due to technical failure before the game begins
              {'\n'}• Opponent does not join within the waiting time
              {'\n'}• Server error that prevents the game from starting properly
              {'\n\n'}<Text style={{ fontWeight: '700', color: '#DC2626' }}>Entry fees are NOT refunded if:</Text>
              {'\n'}• You forfeit or leave a game voluntarily
              {'\n'}• You lose a fairly completed game
              {'\n'}• You violate fair play rules
            </Text>

            <Text style={{ fontSize: 13, fontWeight: '800', color: '#0F172A', marginTop: 10 }}>🏦 3. Withdrawal Refunds</Text>
            <Text style={{ fontSize: 12, color: '#475569', marginTop: 4, lineHeight: 17 }}>
              Withdrawal requests cannot be cancelled once submitted. If a withdrawal fails (payment rejected, wrong UPI ID, etc.):
              {'\n'}• The amount will be credited back to your Winning Balance within 1–24 hours
              {'\n'}• You can re-submit the withdrawal with correct details
              {'\n'}• TDS already deducted on a failed withdrawal will be refunded along with the principal amount
            </Text>

            <Text style={{ fontSize: 13, fontWeight: '800', color: '#0F172A', marginTop: 10 }}>📜 4. TDS Refund</Text>
            <Text style={{ fontSize: 12, color: '#475569', marginTop: 4, lineHeight: 17 }}>
              TDS (Tax Deducted at Source) deducted on withdrawals is deposited with the Government of India and CANNOT be refunded by Dream Ludo. You may claim TDS credit while filing your Income Tax Return (ITR). Form 16A / TDS certificate will be provided upon request.
            </Text>

            <Text style={{ fontSize: 13, fontWeight: '800', color: '#0F172A', marginTop: 10 }}>🔒 5. Account Closure Refunds</Text>
            <Text style={{ fontSize: 12, color: '#475569', marginTop: 4, lineHeight: 17 }}>
              If you choose to close your account:
              {'\n'}• Remaining Winning Balance will be refunded after verification and fraud checks
              {'\n'}• Deposit Balance will be refunded within 7–14 business days
              {'\n'}• Bonus/referral credits are non-refundable and will be forfeited
              {'\n'}• Accounts under investigation or ban will not receive refunds
            </Text>

            <Text style={{ fontSize: 13, fontWeight: '800', color: '#0F172A', marginTop: 10 }}>📩 6. How to Request a Refund</Text>
            <Text style={{ fontSize: 12, color: '#475569', marginTop: 4, lineHeight: 17 }}>
              1. Open the app and go to Account → Support Chat / WhatsApp
              {'\n'}2. Describe your issue with transaction details
              {'\n'}3. Our team will respond within 24–48 hours
              {'\n'}4. Valid refunds are processed within 5–7 business days
              {'\n\n'}Refunds are credited to the original payment source (UPI/bank account used for deposit) or to your Dream Ludo wallet balance.
            </Text>

            <Text style={{ fontSize: 13, fontWeight: '800', color: '#0F172A', marginTop: 10 }}>📞 7. Contact Us</Text>
            <Text style={{ fontSize: 12, color: '#475569', marginTop: 4, lineHeight: 17, marginBottom: 12 }}>
              For refund-related queries:
              {'\n'}• Support: Available through in-app Support Chat / WhatsApp (+91 9343544331)
              {'\n'}• Email: dreamlodo079@gmail.com
              {'\n'}• Website: dreamludo.com
            </Text>
          </ScrollView>
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
          <TouchableOpacity 
            style={styles.avatarContainer}
            onPress={() => setShowAvatarPicker(true)}
            activeOpacity={0.85}
          >
            <View style={[styles.avatar, { backgroundColor: '#EEF2FF', borderColor: '#4F46E5', borderWidth: 3, borderRadius: 44, width: 88, height: 88, alignItems: 'center', justifyContent: 'center' }]}>
              <Text style={{ fontSize: 48 }}>{currentUser?.avatar || selectedAvatar || '👑'}</Text>
            </View>
            <View style={{ position: 'absolute', bottom: -2, right: -2, backgroundColor: '#4F46E5', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14, borderWidth: 2, borderColor: '#FFFFFF' }}>
              <Text style={{ fontSize: 11, fontWeight: '900', color: '#FFFFFF' }}>🎨 EDIT</Text>
            </View>
          </TouchableOpacity>
          <Text style={styles.usernameHeader}>{currentUser.username}</Text>
          <Text style={styles.phoneSub}>{currentUser.phone}</Text>
          <TouchableOpacity 
            style={{ marginTop: 10, backgroundColor: '#EEF2FF', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: '#C7D2FE' }}
            onPress={() => setShowAvatarPicker(true)}
            activeOpacity={0.8}
          >
            <Text style={{ fontSize: 12, fontWeight: '800', color: '#4F46E5' }}>🎨 Pick From 100+ Avatars</Text>
          </TouchableOpacity>
        </View>

        {/* Hidden Super-Admin Telemetry Dashboard Mounting Switch */}
        {(currentUser.phone === '7389927777' || currentUser.phone.endsWith('7389927777')) && (
          <TouchableOpacity
            style={styles.adminCardRow}
            onPress={() => {
              if (onNavigateAdmin) onNavigateAdmin();
            }}
            activeOpacity={0.8}
          >
            <View style={styles.adminCardLeft}>
              <Text style={styles.adminCardIcon}>🎛️</Text>
              <View>
                <Text style={styles.adminCardTitle}>Admin Telemetry Dashboard</Text>
                <Text style={styles.adminCardSub}>Super-Admin Operational & Revenue Controls</Text>
              </View>
            </View>
            <Text style={styles.adminCardArrow}>➔</Text>
          </TouchableOpacity>
        )}

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

      {/* 100+ Avatar Picker Modal */}
      {showAvatarPicker && (
        <Modal visible={true} transparent animationType="slide" onRequestClose={() => setShowAvatarPicker(false)}>
          <View style={styles.alertOverlay}>
            <View style={[styles.alertCard, { maxWidth: 360, width: '92%', maxHeight: 540, padding: 20 }]}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginBottom: 14 }}>
                <View>
                  <Text style={{ fontSize: 18, fontWeight: '900', color: '#0F172A' }}>🎨 Choose Profile Avatar</Text>
                  <Text style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>Tap any avatar from 100+ collection to select</Text>
                </View>
                <TouchableOpacity onPress={() => setShowAvatarPicker(false)} style={{ padding: 6, backgroundColor: '#F1F5F9', borderRadius: 16 }}>
                  <Text style={{ fontSize: 16, fontWeight: '800', color: '#64748B' }}>✕</Text>
                </TouchableOpacity>
              </View>

              <ScrollView style={{ width: '100%', maxHeight: 390 }} showsVerticalScrollIndicator={false}>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 10, paddingVertical: 8 }}>
                  {AVATARS_100.map((emoji, index) => {
                    const isSelected = (currentUser?.avatar || selectedAvatar) === emoji;
                    return (
                      <TouchableOpacity
                        key={index}
                        style={{
                          width: 52,
                          height: 52,
                          borderRadius: 26,
                          backgroundColor: isSelected ? '#EEF2FF' : '#F8FAFC',
                          borderWidth: isSelected ? 3 : 1,
                          borderColor: isSelected ? '#4F46E5' : '#E2E8F0',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                        onPress={() => handleSaveAvatar(emoji)}
                        activeOpacity={0.7}
                      >
                        <Text style={{ fontSize: 28 }}>{emoji}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </ScrollView>

              <TouchableOpacity
                style={{ marginTop: 14, backgroundColor: '#F1F5F9', paddingVertical: 12, borderRadius: 12, alignItems: 'center', width: '100%' }}
                onPress={() => setShowAvatarPicker(false)}
              >
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#475569' }}>Close</Text>
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
  supportDetailCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 18,
    marginTop: 8,
    marginBottom: 12,
    borderWidth: 1.5,
    borderColor: '#E0E7FF',
    shadowColor: '#4F46E5',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
  },
  supportHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  supportTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: 0.3,
  },
  supportOnlineBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  greenDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#10B981',
    marginRight: 6,
  },
  supportOnlineText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#047857',
    letterSpacing: 0.5,
  },
  whatsappCardBtn: {
    backgroundColor: '#25D366',
    borderRadius: 18,
    padding: 14,
    marginBottom: 10,
    shadowColor: '#25D366',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 5,
  },
  whatsappIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  whatsappCardTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  whatsappCardNumber: {
    fontSize: 12,
    fontWeight: '700',
    color: 'rgba(255, 255, 255, 0.95)',
    marginTop: 1,
  },
  whatsappArrow: {
    fontSize: 18,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  emailCardBtn: {
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 12,
  },
  emailIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emailCardLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
  },
  emailCardValue: {
    fontSize: 12,
    fontWeight: '800',
    color: '#4F46E5',
    marginTop: 1,
  },
  emailCardLink: {
    fontSize: 11,
    fontWeight: '900',
    color: '#4F46E5',
  },
  responseTimeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    padding: 10,
    borderRadius: 14,
  },
  responseTimeText: {
    fontSize: 11,
    color: '#475569',
    fontWeight: '600',
    flex: 1,
    lineHeight: 16,
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
  adminCardRow: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1.5,
    borderColor: '#4F46E5',
    shadowColor: '#4F46E5',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 4,
  },
  adminCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  adminCardIcon: {
    fontSize: 22,
    marginRight: 12,
  },
  adminCardTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: '#0F172A',
  },
  adminCardSub: {
    fontSize: 11,
    color: '#4F46E5',
    fontWeight: '600',
    marginTop: 2,
  },
  adminCardArrow: {
    fontSize: 16,
    fontWeight: '900',
    color: '#4F46E5',
  },
  referralCapsuleWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EEF2FF',
    borderWidth: 1.5,
    borderColor: '#C7D2FE',
    borderRadius: 24,
    paddingHorizontal: 14,
    height: 48,
    marginTop: 8,
  },
  referralCapsuleFocused: {
    borderColor: '#4F46E5',
    backgroundColor: '#FFFFFF',
  },
  referralCapsuleClaimed: {
    borderColor: '#10B981',
    backgroundColor: '#ECFDF5',
  },
  referralCapsuleInput: {
    flex: 1,
    height: '100%',
    fontSize: 13,
    fontWeight: '700',
    color: '#1E293B',
    letterSpacing: 0.5,
  },
  claimBonusBtn: {
    backgroundColor: '#4F46E5',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  claimBonusBtnClaimed: {
    backgroundColor: '#10B981',
  },
  claimBonusText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  referralHintSub: {
    fontSize: 10,
    fontWeight: '700',
    color: '#6366F1',
    marginTop: 4,
    marginLeft: 12,
  },
  authCheckboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    marginBottom: 4,
    paddingHorizontal: 4,
  },
  authCheckboxBox: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: '#94A3B8',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  authCheckboxBoxChecked: {
    backgroundColor: '#4F46E5',
    borderColor: '#4F46E5',
  },
  authCheckmarkIcon: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
  },
  authCheckboxLabel: {
    fontSize: 11,
    color: '#475569',
    fontWeight: '600',
    flex: 1,
    lineHeight: 16,
  },
  authPolicyLink: {
    color: '#4F46E5',
    fontWeight: '800',
    textDecorationLine: 'underline',
  },
});
export default AuthWalletScreen;
