import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import axios from 'axios';

const API_SERVER_URL = process.env.EXPO_PUBLIC_SERVER_URL || 'http://localhost:5000';

interface TransactionItem {
  _id: string;
  type: string;
  amount: number;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUCCESS' | 'FAILED';
  utr?: string;
  paymentAddress?: string;
  rejectionReason?: string;
  referenceId: string;
  createdAt: string;
}

interface TransactionHistoryScreenProps {
  currentUser: { _id: string; username: string };
  onBack?: () => void;
}

export const TransactionHistoryScreen: React.FC<TransactionHistoryScreenProps> = ({
  currentUser,
  onBack,
}) => {
  const [transactions, setTransactions] = useState<TransactionItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  const fetchTransactions = async () => {
    try {
      const res = await axios.get(`${API_SERVER_URL}/api/v1/wallet/transactions/${currentUser._id}`);
      if (res.data.success) {
        setTransactions(res.data.transactions || []);
      }
    } catch (err) {
      console.error('Failed to fetch transaction history:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchTransactions();
  }, [currentUser._id]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    fetchTransactions();
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'APPROVED':
      case 'SUCCESS':
        return { bg: '#DCFCE7', text: '#15803D', label: 'APPROVED ✓' };
      case 'PENDING':
        return { bg: '#FEF3C7', text: '#B45309', label: 'PENDING ⏳' };
      case 'REJECTED':
      case 'FAILED':
        return { bg: '#FEE2E2', text: '#B91C1C', label: 'REJECTED ❌' };
      default:
        return { bg: '#F1F5F9', text: '#475569', label: status };
    }
  };

  const formatTxnType = (type: string, amount: number) => {
    if (type === 'DEPOSIT') return '💰 Wallet Deposit';
    if (type === 'WITHDRAWAL') return '💸 UPI Withdrawal';
    if (type === 'WINNINGS' || type === 'TOURNAMENT_WIN_CREDIT') return '🏆 Match Winnings';
    if (type === 'ENTRY_FEE' || type === 'ENTRY_FEE_DEBIT') return '🎲 Entry Fee Stake';
    if (type === 'ENTRY_FEE_REFUND') return '↩️ Match Cancelled Refund';
    if (type === 'REFERRAL_BONUS_CREDIT') return '🎁 Referral Bonus';
    return type;
  };

  const renderTransactionItem = ({ item }: { item: TransactionItem }) => {
    const badge = getStatusBadge(item.status);
    const isCredit = item.amount > 0;

    return (
      <View style={styles.txnCard}>
        <View style={styles.cardHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.txnType}>{formatTxnType(item.type, item.amount)}</Text>
            <Text style={styles.txnDate}>{new Date(item.createdAt).toLocaleString()}</Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: badge.bg }]}>
            <Text style={[styles.statusBadgeText, { color: badge.text }]}>{badge.label}</Text>
          </View>
        </View>

        <View style={styles.cardBody}>
          <View style={styles.metaRow}>
            {item.utr && (
              <Text style={styles.metaText}>UTR: <Text style={{ fontWeight: '800' }}>{item.utr}</Text></Text>
            )}
            {item.paymentAddress && (
              <Text style={styles.metaText}>UPI: <Text style={{ fontWeight: '800' }}>{item.paymentAddress}</Text></Text>
            )}
            <Text style={styles.metaText}>Ref: {item.referenceId.slice(-10)}</Text>
          </View>

          <Text style={[styles.amountText, isCredit ? styles.creditAmount : styles.debitAmount]}>
            {isCredit ? `+₹${Math.abs(item.amount).toFixed(2)}` : `-₹${Math.abs(item.amount).toFixed(2)}`}
          </Text>
        </View>

        {/* Prominent Rejection Reason Box */}
        {item.status === 'REJECTED' && item.rejectionReason && (
          <View style={styles.rejectionBox}>
            <Text style={styles.rejectionTitle}>⚠️ Rejection Reason:</Text>
            <Text style={styles.rejectionReasonText}>{item.rejectionReason}</Text>
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Top Bar */}
      <View style={styles.topBar}>
        {onBack && (
          <TouchableOpacity style={styles.backBtn} onPress={onBack}>
            <Text style={styles.backBtnText}>◀ Back</Text>
          </TouchableOpacity>
        )}
        <Text style={styles.headerTitle}>TRANSACTION HISTORY</Text>
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#4F46E5" />
          <Text style={styles.loadingText}>Loading transaction ledger...</Text>
        </View>
      ) : (
        <FlatList
          data={transactions}
          keyExtractor={(item) => item._id}
          renderItem={renderTransactionItem}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} colors={['#4F46E5']} />}
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <Text style={styles.emptyIcon}>📜</Text>
              <Text style={styles.emptyTitle}>No Transactions Yet</Text>
              <Text style={styles.emptySub}>Your wallet deposit, withdrawal, and match stake records will appear here.</Text>
            </View>
          }
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderColor: '#E2E8F0',
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
  listContent: {
    padding: 16,
    paddingBottom: 40,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loadingText: {
    marginTop: 10,
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
  },
  txnCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  txnType: {
    fontSize: 13,
    fontWeight: '900',
    color: '#0F172A',
  },
  txnDate: {
    fontSize: 10,
    color: '#64748B',
    marginTop: 2,
    fontWeight: '600',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusBadgeText: {
    fontSize: 9,
    fontWeight: '900',
  },
  cardBody: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  metaRow: {
    gap: 2,
  },
  metaText: {
    fontSize: 10,
    color: '#475569',
  },
  amountText: {
    fontSize: 17,
    fontWeight: '900',
  },
  creditAmount: {
    color: '#059669',
  },
  debitAmount: {
    color: '#DC2626',
  },
  rejectionBox: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 10,
    padding: 10,
    marginTop: 10,
  },
  rejectionTitle: {
    fontSize: 10,
    fontWeight: '900',
    color: '#991B1B',
    marginBottom: 2,
  },
  rejectionReasonText: {
    fontSize: 11,
    color: '#B91C1C',
    fontWeight: '600',
    lineHeight: 15,
  },
  emptyBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyIcon: {
    fontSize: 44,
    marginBottom: 10,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#334155',
  },
  emptySub: {
    fontSize: 11,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 4,
    maxWidth: 260,
  },
});
