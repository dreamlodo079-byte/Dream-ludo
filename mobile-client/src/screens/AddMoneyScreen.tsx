import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
} from 'react-native';
import { PaymentCheckoutScreen } from './PaymentCheckoutScreen';

interface AddMoneyScreenProps {
  currentUser: { _id: string; username: string };
  onBack?: () => void;
  onSuccess?: () => void;
}

export const AddMoneyScreen: React.FC<AddMoneyScreenProps> = ({
  currentUser,
  onBack,
  onSuccess,
}) => {
  const [amount, setAmount] = useState<string>('100');
  const [checkoutAmount, setCheckoutAmount] = useState<number | null>(null);

  const quickAmounts = [50, 100, 200, 500, 1000, 2000];

  const handleProceedToCheckout = () => {
    const numAmount = Number(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid deposit amount.');
      return;
    }
    setCheckoutAmount(numAmount);
  };

  if (checkoutAmount !== null) {
    return (
      <PaymentCheckoutScreen
        currentUser={currentUser}
        amount={checkoutAmount}
        onBack={() => setCheckoutAmount(null)}
        onSuccess={() => {
          setCheckoutAmount(null);
          if (onSuccess) onSuccess();
        }}
      />
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      {/* Top Bar */}
      <View style={styles.topBar}>
        {onBack && (
          <TouchableOpacity style={styles.backBtn} onPress={onBack}>
            <Text style={styles.backBtnText}>◀ Back</Text>
          </TouchableOpacity>
        )}
        <Text style={styles.headerTitle}>ADD MONEY TO WALLET</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.stepHeader}>ENTER DEPOSIT AMOUNT (₹)</Text>
        <Text style={styles.stepSub}>Select or type the amount you want to add to your gaming wallet</Text>

        <View style={styles.inputWrapper}>
          <Text style={styles.currencyPrefix}>₹</Text>
          <TextInput
            style={styles.input}
            keyboardType="numeric"
            value={amount}
            onChangeText={(val) => setAmount(val.replace(/[^0-9]/g, ''))}
            placeholder="Enter Amount"
            placeholderTextColor="#94A3B8"
            autoFocus
          />
        </View>

        <View style={styles.quickChipsRow}>
          {quickAmounts.map((q) => (
            <TouchableOpacity
              key={q}
              style={[styles.quickChip, Number(amount) === q && styles.quickChipActive]}
              onPress={() => setAmount(q.toString())}
            >
              <Text style={[styles.quickChipText, Number(amount) === q && styles.quickChipTextActive]}>
                +₹{q}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity style={styles.submitBtn} onPress={handleProceedToCheckout} activeOpacity={0.8}>
          <Text style={styles.submitBtnText}>PROCEED TO REAL-TIME UPI CHECKOUT ➔</Text>
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
    fontSize: 15,
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: 0.5,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  stepHeader: {
    fontSize: 12,
    fontWeight: '900',
    color: '#4F46E5',
    letterSpacing: 0.8,
  },
  stepSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
    marginBottom: 16,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    borderRadius: 14,
    paddingHorizontal: 14,
    height: 52,
    marginBottom: 14,
  },
  currencyPrefix: {
    fontSize: 20,
    fontWeight: '900',
    color: '#0F172A',
    marginRight: 8,
  },
  input: {
    flex: 1,
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
  },
  quickChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 20,
  },
  quickChip: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  quickChipActive: {
    backgroundColor: '#4F46E5',
    borderColor: '#4F46E5',
  },
  quickChipText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#475569',
  },
  quickChipTextActive: {
    color: '#FFFFFF',
  },
  submitBtn: {
    backgroundColor: '#4F46E5',
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
  },
  submitBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
});
