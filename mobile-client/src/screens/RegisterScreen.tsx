import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Modal,
} from 'react-native';
import axios from 'axios';

const API_SERVER_URL = process.env.EXPO_PUBLIC_SERVER_URL || 'http://localhost:5000';

interface RegisterScreenProps {
  onSuccess: (user: any, token: string) => void;
  onSwitchToLogin: () => void;
}

export const RegisterScreen: React.FC<RegisterScreenProps> = ({
  onSuccess,
  onSwitchToLogin,
}) => {
  const [phone, setPhone] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [referredByCode, setReferredByCode] = useState('');
  const [agreedTerms, setAgreedTerms] = useState(false);
  const [showPolicyModal, setShowPolicyModal] = useState(false);
  const [loading, setLoading] = useState(false);

  const [isFocusedPhone, setIsFocusedPhone] = useState(false);
  const [isFocusedUser, setIsFocusedUser] = useState(false);
  const [isFocusedPass, setIsFocusedPass] = useState(false);
  const [isFocusedRef, setIsFocusedRef] = useState(false);

  const handleRegister = async () => {
    if (!phone || !username || !password) {
      Alert.alert('Validation Error', 'Please enter your phone number, username, and password.');
      return;
    }

    if (phone.trim().length < 10) {
      Alert.alert('Validation Error', 'Please enter a valid 10-digit mobile number.');
      return;
    }

    if (!agreedTerms) {
      Alert.alert('Terms Agreement Required', 'Please accept the Terms of Service & Privacy Policy to create your account.');
      return;
    }

    setLoading(true);
    try {
      const response = await axios.post(`${API_SERVER_URL}/api/users/login`, {
        phone: phone.trim(),
        username: username.trim(),
        password,
        referredByCode: referredByCode.trim().toUpperCase() || undefined,
      });

      if (response.data.success) {
        if (response.data.token) {
          axios.defaults.headers.common['x-auth-token'] = response.data.token;
          axios.defaults.headers.common['Authorization'] = `Bearer ${response.data.token}`;
        }
        Alert.alert('Welcome to Dream Ludo!', 'Account created successfully with ₹10 Welcome Bonus.');
        onSuccess(response.data.user, response.data.token);
      } else {
        Alert.alert('Registration Failed', response.data.error || 'Failed to create account.');
      }
    } catch (err: any) {
      console.error('Registration API Error:', err);
      Alert.alert('Registration Error', err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Luxury Header Branding */}
        <View style={styles.brandingHeader}>
          <Text style={styles.logoTitle}>DREAM LUDO</Text>
          <Text style={styles.logoSubtitle}>Create Account & Claim ₹10 Instant Welcome Bonus</Text>
        </View>

        {/* Account Form Card */}
        <View style={styles.formCard}>
          <Text style={styles.formTitle}>REGISTER NEW ACCOUNT</Text>

          {/* Mobile Phone Input */}
          <Text style={styles.inputLabel}>Mobile Phone Number</Text>
          <View style={[styles.inputBox, isFocusedPhone && styles.inputBoxFocused]}>
            <Text style={styles.prefixText}>+91</Text>
            <TextInput
              style={styles.input}
              placeholder="10-Digit Mobile Number"
              placeholderTextColor="#94A3B8"
              keyboardType="number-pad"
              maxLength={10}
              value={phone}
              onChangeText={setPhone}
              onFocus={() => setIsFocusedPhone(true)}
              onBlur={() => setIsFocusedPhone(false)}
            />
          </View>

          {/* Username Input */}
          <Text style={styles.inputLabel}>Choose Username</Text>
          <View style={[styles.inputBox, isFocusedUser && styles.inputBoxFocused]}>
            <TextInput
              style={styles.input}
              placeholder="e.g. ProLudoKing"
              placeholderTextColor="#94A3B8"
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              onFocus={() => setIsFocusedUser(true)}
              onBlur={() => setIsFocusedUser(false)}
            />
          </View>

          {/* Password Input */}
          <Text style={styles.inputLabel}>Password</Text>
          <View style={[styles.inputBox, isFocusedPass && styles.inputBoxFocused]}>
            <TextInput
              style={styles.input}
              placeholder="Create Secure Password"
              placeholderTextColor="#94A3B8"
              secureTextEntry
              value={password}
              onChangeText={setPassword}
              onFocus={() => setIsFocusedPass(true)}
              onBlur={() => setIsFocusedPass(false)}
            />
          </View>

          {/* Referral Code Text Input Layer */}
          <Text style={styles.inputLabel}>Enter Referral Code (Optional)</Text>
          <View style={[styles.inputBox, styles.referralInputBox, isFocusedRef && styles.inputBoxFocused]}>
            <Text style={styles.referralPrefixIcon}>🎁</Text>
            <TextInput
              style={[styles.input, styles.referralInput]}
              placeholder="e.g. DREAM50LUDO"
              placeholderTextColor="#94A3B8"
              autoCapitalize="characters"
              value={referredByCode}
              onChangeText={setReferredByCode}
              onFocus={() => setIsFocusedRef(true)}
              onBlur={() => setIsFocusedRef(false)}
            />
          </View>
          <Text style={styles.referralHint}>
            💡 Have a friend's referral code? Enter it to get ₹10 bonus & credit them ₹10 bonus cash!
          </Text>

          {/* Interactive Terms & Policy Agreement Checkbox */}
          <TouchableOpacity
            style={styles.checkboxRow}
            onPress={() => setAgreedTerms(!agreedTerms)}
            activeOpacity={0.8}
          >
            <View style={[styles.checkboxBox, agreedTerms && styles.checkboxBoxChecked]}>
              {agreedTerms && <Text style={styles.checkmarkIcon}>✓</Text>}
            </View>
            <Text style={styles.checkboxLabel}>
              I agree to the <Text style={styles.policyLink} onPress={() => setShowPolicyModal(true)}>Terms of Service & Privacy Policy</Text> of Dream Ludo.
            </Text>
          </TouchableOpacity>

          {/* Action Submit Button */}
          <TouchableOpacity
            style={[styles.submitBtn, (loading || !agreedTerms) && styles.disabledBtn]}
            onPress={handleRegister}
            disabled={loading || !agreedTerms}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.submitBtnText}>
                {agreedTerms ? 'CREATE ACCOUNT NOW' : '🔒 TICK BOX TO UNLOCK REGISTER'}
              </Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity style={styles.switchBtn} onPress={onSwitchToLogin} activeOpacity={0.7}>
            <Text style={styles.switchBtnText}>Already have an account? <Text style={styles.highlightText}>Log In</Text></Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Terms & Privacy Policy Full Content Modal */}
      {showPolicyModal && (
        <Modal
          visible={true}
          animationType="slide"
          transparent={true}
          onRequestClose={() => setShowPolicyModal(false)}
        >
          <View style={{ flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.75)', justifyContent: 'flex-end' }}>
            <View style={{ backgroundColor: '#FFFFFF', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, maxHeight: '88%' }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 12, borderBottomWidth: 1, borderColor: '#F1F5F9' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Text style={{ fontSize: 24, marginRight: 8 }}>📜</Text>
                  <Text style={{ fontSize: 18, fontWeight: '900', color: '#0F172A' }}>Terms of Service & Privacy Policy</Text>
                </View>
                <TouchableOpacity 
                  style={{ backgroundColor: '#F1F5F9', width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' }} 
                  onPress={() => setShowPolicyModal(false)}
                >
                  <Text style={{ fontSize: 16, fontWeight: '800', color: '#64748B' }}>✕</Text>
                </TouchableOpacity>
              </View>

              <ScrollView style={{ paddingVertical: 12 }} showsVerticalScrollIndicator={true}>
                <Text style={{ fontSize: 11, color: '#94A3B8', marginBottom: 10 }}>Last Updated: May 2025</Text>
                
                <Text style={{ fontSize: 14, fontWeight: '800', color: '#0F172A', marginTop: 6 }}>1. Acceptance & Skill-Based Gaming</Text>
                <Text style={{ fontSize: 12, color: '#475569', marginTop: 4, lineHeight: 18 }}>
                  By registering on Dream Ludo, you confirm that you are at least 18 years of age and reside in an Indian state where skill gaming is legal (excluding Assam, Odisha, Telangana, Andhra Pradesh, Nagaland, and Sikkim).
                </Text>

                <Text style={{ fontSize: 14, fontWeight: '800', color: '#0F172A', marginTop: 12 }}>2. Wallet & Cash Distribution</Text>
                <Text style={{ fontSize: 12, color: '#475569', marginTop: 4, lineHeight: 18 }}>
                  • Only Winnings Balance is eligible for instant IMPS bank withdrawal.
                  {'\n'}• Deposit & Bonus balances (₹10 welcome bonus & ₹10 referral reward) are non-withdrawable.
                  {'\n'}• 10% platform commission is charged on game prize pools.
                </Text>

                <Text style={{ fontSize: 14, fontWeight: '800', color: '#0F172A', marginTop: 12 }}>3. Fair Play & Security</Text>
                <Text style={{ fontSize: 12, color: '#475569', marginTop: 4, lineHeight: 18 }}>
                  Zero tolerance for bots, multi-accounting, or cheating. Violations lead to account termination.
                </Text>
              </ScrollView>

              <TouchableOpacity 
                style={{ backgroundColor: '#4F46E5', borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 12 }} 
                onPress={() => {
                  setAgreedTerms(true);
                  setShowPolicyModal(false);
                }}
              >
                <Text style={{ fontSize: 13, fontWeight: '900', color: '#FFFFFF', letterSpacing: 0.8 }}>AGREE & UNLOCK REGISTER</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC', // Crisp Light Theme Canvas
  },
  scrollContent: {
    padding: 20,
    paddingTop: Platform.OS === 'android' ? 50 : 30,
  },
  brandingHeader: {
    alignItems: 'center',
    marginBottom: 24,
  },
  logoTitle: {
    fontSize: 28,
    fontWeight: '900',
    color: '#4F46E5',
    letterSpacing: 2,
  },
  logoSubtitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
    marginTop: 4,
    textAlign: 'center',
  },
  formCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#334155',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },
  formTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: '#0F172A',
    marginBottom: 16,
    letterSpacing: 0.5,
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 6,
    marginTop: 10,
  },
  inputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 48,
  },
  inputBoxFocused: {
    borderColor: '#4F46E5',
    backgroundColor: '#FFFFFF',
  },
  prefixText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#475569',
    marginRight: 8,
  },
  input: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: '#0F172A',
  },
  referralInputBox: {
    backgroundColor: '#EEF2FF',
    borderColor: '#C7D2FE',
  },
  referralPrefixIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  referralInput: {
    fontWeight: '800',
    color: '#4F46E5',
    letterSpacing: 1,
  },
  referralHint: {
    fontSize: 10,
    fontWeight: '600',
    color: '#6366F1',
    marginTop: 6,
    lineHeight: 14,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 14,
    marginBottom: 4,
    paddingHorizontal: 2,
  },
  checkboxBox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#94A3B8',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  checkboxBoxChecked: {
    backgroundColor: '#4F46E5',
    borderColor: '#4F46E5',
  },
  checkmarkIcon: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '900',
  },
  checkboxLabel: {
    fontSize: 12,
    color: '#475569',
    fontWeight: '600',
    flex: 1,
    lineHeight: 17,
  },
  policyLink: {
    color: '#4F46E5',
    fontWeight: '800',
    textDecorationLine: 'underline',
  },
  submitBtn: {
    backgroundColor: '#4F46E5',
    borderRadius: 12,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
    shadowColor: '#4F46E5',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  disabledBtn: {
    opacity: 0.6,
  },
  submitBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  switchBtn: {
    marginTop: 16,
    alignItems: 'center',
  },
  switchBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  highlightText: {
    color: '#4F46E5',
    fontWeight: '800',
  },
});

export default RegisterScreen;
