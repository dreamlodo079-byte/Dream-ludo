import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';

interface CommissionCalculatorProps {
  initialFee?: number;
  onFeeChange?: (fee: number, breakdown: { totalPool: number; rakeRate: number; platformFee: number; winnerPayout: number }) => void;
}

export const CommissionCalculator: React.FC<CommissionCalculatorProps> = ({
  initialFee = 50,
  onFeeChange,
}) => {
  const [feeInput, setFeeInput] = useState<string>(initialFee.toString());

  const fee = Math.max(0, Number(feeInput) || 0);

  // Dynamic Tiered Rake Schedule:
  // ₹1 - ₹100     --> 10.0%
  // ₹101 - ₹500   --> 8.5%
  // ₹501 - ₹5000  --> 7.5%
  // ₹5001+        --> 5.0%
  const getRakeRate = (stake: number): number => {
    if (stake <= 0) return 0;
    if (stake <= 100) return 10.0;
    if (stake <= 500) return 8.5;
    if (stake <= 5000) return 7.5;
    return 5.0;
  };

  const rakeRate = getRakeRate(fee);
  const totalPool = Math.round(fee * 2 * 100) / 100;
  const platformFee = Math.round(totalPool * (rakeRate / 100) * 100) / 100;
  const winnerPayout = Math.round((totalPool - platformFee) * 100) / 100;

  useEffect(() => {
    if (onFeeChange) {
      onFeeChange(fee, { totalPool, rakeRate, platformFee, winnerPayout });
    }
  }, [fee, totalPool, rakeRate, platformFee, winnerPayout]);

  const quickTiers = [10, 50, 100, 500, 1000, 5000];

  return (
    <View style={styles.card}>
      <Text style={styles.cardHeader}>⚡ DYNAMIC STAKE & WINNINGS CALCULATOR</Text>
      <Text style={styles.cardSub}>Enter custom stake amount between ₹1 and ₹10,000</Text>

      {/* Stake Input */}
      <View style={styles.inputRow}>
        <Text style={styles.currencyPrefix}>₹</Text>
        <TextInput
          style={styles.input}
          keyboardType="numeric"
          value={feeInput}
          onChangeText={(val) => setFeeInput(val.replace(/[^0-9]/g, ''))}
          placeholder="Enter Stake (₹1 - ₹10,000)"
          placeholderTextColor="#94A3B8"
          maxLength={5}
        />
      </View>

      {/* Quick Select Tiers */}
      <View style={styles.tierChipsRow}>
        {quickTiers.map((t) => (
          <TouchableOpacity
            key={t}
            style={[styles.tierChip, Number(feeInput) === t && styles.tierChipActive]}
            onPress={() => setFeeInput(t.toString())}
            activeOpacity={0.8}
          >
            <Text style={[styles.tierChipText, Number(feeInput) === t && styles.tierChipTextActive]}>
              ₹{t}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Live Calculation Display Table */}
      <View style={styles.breakdownBox}>
        <View style={styles.breakdownRow}>
          <Text style={styles.breakdownLabel}>Single Player Entry:</Text>
          <Text style={styles.breakdownValue}>₹{fee.toLocaleString()}</Text>
        </View>

        <View style={styles.breakdownRow}>
          <Text style={styles.breakdownLabel}>Total Match Pool (2x):</Text>
          <Text style={styles.breakdownValueHighlight}>₹{totalPool.toLocaleString()}</Text>
        </View>

        <View style={styles.breakdownRow}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={styles.breakdownLabel}>Applicable Platform Rake:</Text>
            <View style={styles.rakeTierBadge}>
              <Text style={styles.rakeTierBadgeText}>{rakeRate}% RAKE</Text>
            </View>
          </View>
          <Text style={styles.breakdownRakeValue}>- ₹{platformFee.toFixed(2)}</Text>
        </View>

        <View style={styles.divider} />

        <View style={styles.breakdownRow}>
          <Text style={styles.payoutLabel}>Estimated Net Winnings:</Text>
          <Text style={styles.payoutValue}>₹{winnerPayout.toLocaleString()}</Text>
        </View>
      </View>

      {/* Tier Schedule Explanation */}
      <View style={styles.scheduleInfoBox}>
        <Text style={styles.scheduleInfoTitle}>📊 Tiered Platform Rake Schedule:</Text>
        <Text style={styles.scheduleInfoText}>• ₹1 - ₹100: <Text style={{ fontWeight: '800' }}>10.0%</Text>  |  • ₹101 - ₹500: <Text style={{ fontWeight: '800' }}>8.5%</Text></Text>
        <Text style={styles.scheduleInfoText}>• ₹501 - ₹5,000: <Text style={{ fontWeight: '800' }}>7.5%</Text>  |  • ₹5,001+: <Text style={{ fontWeight: '800' }}>5.0%</Text></Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 18,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    marginVertical: 10,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 3,
  },
  cardHeader: {
    fontSize: 13,
    fontWeight: '900',
    color: '#4F46E5',
    letterSpacing: 0.8,
  },
  cardSub: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
    marginTop: 2,
    marginBottom: 12,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    borderRadius: 14,
    paddingHorizontal: 14,
    height: 48,
    marginBottom: 10,
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
  tierChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 14,
  },
  tierChip: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  tierChipActive: {
    backgroundColor: '#4F46E5',
    borderColor: '#4F46E5',
  },
  tierChipText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#475569',
  },
  tierChipTextActive: {
    color: '#FFFFFF',
  },
  breakdownBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  breakdownLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  breakdownValue: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
  },
  breakdownValueHighlight: {
    fontSize: 13,
    fontWeight: '900',
    color: '#2563EB',
  },
  breakdownRakeValue: {
    fontSize: 12,
    fontWeight: '800',
    color: '#DC2626',
  },
  rakeTierBadge: {
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    marginLeft: 6,
  },
  rakeTierBadgeText: {
    fontSize: 9,
    fontWeight: '900',
    color: '#4F46E5',
  },
  divider: {
    height: 1,
    backgroundColor: '#E2E8F0',
    marginVertical: 6,
  },
  payoutLabel: {
    fontSize: 13,
    fontWeight: '900',
    color: '#059669',
  },
  payoutValue: {
    fontSize: 17,
    fontWeight: '900',
    color: '#059669',
  },
  scheduleInfoBox: {
    backgroundColor: '#EFF6FF',
    borderRadius: 12,
    padding: 10,
    marginTop: 12,
  },
  scheduleInfoTitle: {
    fontSize: 10,
    fontWeight: '900',
    color: '#1E40AF',
    marginBottom: 2,
  },
  scheduleInfoText: {
    fontSize: 10,
    color: '#1E3A8A',
    lineHeight: 14,
  },
});
