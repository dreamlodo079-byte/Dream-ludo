import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  RefreshControl,
  TextInput,
  Modal,
  Image,
} from 'react-native';
import Svg, { Path, Circle, Rect, Line, Polyline } from 'react-native-svg';
import axios from 'axios';

const API_SERVER_URL = process.env.EXPO_PUBLIC_SERVER_URL || 'http://localhost:5000';

const formatDateTime = (dateStr: string) => {
  if (!dateStr) return 'N/A';
  try {
    const d = new Date(dateStr);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = months[d.getMonth()];
    const date = d.getDate();
    let hours = d.getHours();
    const minutes = d.getMinutes().toString().padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12;
    return `${month} ${date}, ${hours}:${minutes} ${ampm}`;
  } catch {
    return dateStr;
  }
};

interface AdminPanelScreenProps {
  onBack: () => void;
}

type TabType = 'REQUESTS' | 'AUDIT' | 'CONCURRENCY' | 'TOURNAMENT' | 'COMPLIANCE';

export const AdminPanelScreen: React.FC<AdminPanelScreenProps> = ({ onBack }) => {
  const [activeTab, setActiveTab] = useState<TabType>('REQUESTS');
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Tab Requests: Deposit & Withdrawal Requests
  const [requestsList, setRequestsList] = useState<any[]>([]);
  const [requestFilterType, setRequestFilterType] = useState<'ALL' | 'DEPOSIT' | 'WITHDRAWAL'>('WITHDRAWAL');
  const [requestFilterStatus, setRequestFilterStatus] = useState<'PENDING' | 'APPROVED' | 'REJECTED' | 'ALL'>('PENDING');

  // Platform Pay-in UPI & QR Config States
  const [platformUpiInput, setPlatformUpiInput] = useState<string>('dreamludoplatform@bank');
  const [platformQrInput, setPlatformQrInput] = useState<string>('');
  const [isSavingConfig, setIsSavingConfig] = useState<boolean>(false);

  // Input modal states for Approve Payout UTR & Reject Reason
  const [inputModal, setInputModal] = useState<{
    visible: boolean;
    title: string;
    message: string;
    placeholder: string;
    value: string;
    confirmText: string;
    onConfirm: (val: string) => void;
  }>({
    visible: false,
    title: '',
    message: '',
    placeholder: '',
    value: '',
    confirmText: 'Submit',
    onConfirm: () => {},
  });

  // Tab A: Audit Data
  const [auditData, setAuditData] = useState<any>(null);

  // Tab B: Concurrency Data
  const [concurrencyData, setConcurrencyData] = useState<any>(null);

  // Tab C: Tournament Data
  const [tournaments, setTournaments] = useState<any[]>([]);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [kycUsers, setKycUsers] = useState<any[]>([]);
  const [usersList, setUsersList] = useState<any[]>([]);
  const [promoterCount, setPromoterCount] = useState(0);
  // Custom Toast Banner & Confirmation Modal States
  const [toast, setToast] = useState<{
    visible: boolean;
    title: string;
    message: string;
    type: 'success' | 'error' | 'info';
  }>({
    visible: false,
    title: '',
    message: '',
    type: 'info',
  });

  const [confirmModal, setConfirmModal] = useState<{
    visible: boolean;
    icon: string;
    title: string;
    message: string;
    confirmText: string;
    cancelText?: string;
    isDestructive?: boolean;
    onConfirm: () => void;
  }>({
    visible: false,
    icon: '❓',
    title: '',
    message: '',
    confirmText: 'Confirm',
    cancelText: 'Cancel',
    isDestructive: false,
    onConfirm: () => {},
  });

  const showToast = (title: string, message: string = '', type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ visible: true, title, message, type });
    setTimeout(() => {
      setToast((prev) => ({ ...prev, visible: false }));
    }, 4000);
  };

  const showConfirmDialog = (
    icon: string,
    title: string,
    message: string,
    confirmText: string,
    onConfirm: () => void,
    isDestructive = false
  ) => {
    setConfirmModal({
      visible: true,
      icon,
      title,
      message,
      confirmText,
      cancelText: 'Cancel',
      isDestructive,
      onConfirm,
    });
  };

  // Tournament Create / Edit Modal States
  const [isTourModalVisible, setIsTourModalVisible] = useState(false);
  const [editingTourId, setEditingTourId] = useState<string | null>(null);
  const [formTitle, setFormTitle] = useState('');
  const [formPrizePool, setFormPrizePool] = useState('');
  const [formEntryFee, setFormEntryFee] = useState('');
  const [formMaxEntries, setFormMaxEntries] = useState('');
  const [formStartsAt, setFormStartsAt] = useState('');
  const [formStatus, setFormStatus] = useState<'UPCOMING' | 'ACTIVE' | 'CONCLUDED'>('UPCOMING');
  const [isSavingTour, setIsSavingTour] = useState(false);

  const openCreateTourModal = () => {
    setEditingTourId(null);
    setFormTitle('');
    setFormPrizePool('10000');
    setFormEntryFee('10');
    setFormMaxEntries('1000');
    setFormStartsAt(new Date(Date.now() + 3600000).toISOString().slice(0, 16));
    setFormStatus('UPCOMING');
    setIsTourModalVisible(true);
  };

  const openEditTourModal = (tour: any) => {
    setEditingTourId(tour._id);
    setFormTitle(tour.title || '');
    setFormPrizePool(String(tour.totalPrizePool || 0));
    setFormEntryFee(String(tour.entryFee || 0));
    setFormMaxEntries(String(tour.maxEntries || 1000));
    setFormStartsAt(tour.startsAt ? new Date(tour.startsAt).toISOString().slice(0, 16) : new Date().toISOString().slice(0, 16));
    setFormStatus(tour.status || 'UPCOMING');
    setIsTourModalVisible(true);
  };

  const handleSaveTournament = async () => {
    if (!formTitle || !formPrizePool || !formEntryFee || !formMaxEntries) {
      showToast('Validation Error', 'Please fill in Title, Prize Pool, Entry Fee, and Max Slots.', 'error');
      return;
    }

    setIsSavingTour(true);
    try {
      const token = await fetchAuthToken();
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const payload = {
        title: formTitle.trim(),
        totalPrizePool: parseFloat(formPrizePool),
        entryFee: parseFloat(formEntryFee),
        maxEntries: parseInt(formMaxEntries, 10),
        startsAt: formStartsAt ? new Date(formStartsAt).toISOString() : new Date().toISOString(),
        status: formStatus,
      };

      if (editingTourId) {
        // Edit Mode
        const res = await axios.put(`${API_SERVER_URL}/api/admin/tournament/update/${editingTourId}`, payload, { headers });
        if (res.data.success) {
          showToast('Tournament Updated! ✏️', res.data.message, 'success');
          setIsTourModalVisible(false);
          loadDataForTab('TOURNAMENT');
        }
      } else {
        // Create Mode
        const res = await axios.post(`${API_SERVER_URL}/api/admin/tournament/create`, payload, { headers });
        if (res.data.success) {
          showToast('Tournament Created! 🏆', res.data.message, 'success');
          setIsTourModalVisible(false);
          loadDataForTab('TOURNAMENT');
        }
      }
    } catch (err: any) {
      showToast('Save Failed', err.response?.data?.error || err.message, 'error');
    } finally {
      setIsSavingTour(false);
    }
  };

  const handleDeleteTournament = async (tourId: string, tourTitle: string) => {
    showConfirmDialog(
      '🗑️',
      'Delete Tournament',
      `Are you sure you want to permanently delete "${tourTitle}"?`,
      'DELETE TOURNAMENT',
      async () => {
        setActionLoading(`delete_${tourId}`);
        try {
          const token = await fetchAuthToken();
          const headers = token ? { Authorization: `Bearer ${token}` } : {};
          const res = await axios.delete(`${API_SERVER_URL}/api/admin/tournament/delete/${tourId}`, { headers });
          if (res.data.success) {
            setTournaments((prev) => prev.filter((t) => t._id !== tourId));
            showToast('Deleted', res.data.message, 'success');
            loadDataForTab('TOURNAMENT');
          }
        } catch (err: any) {
          showToast('Delete Failed', err.response?.data?.error || err.message, 'error');
        } finally {
          setActionLoading(null);
        }
      },
      true
    );
  };

  // Admin Payout Withdrawal States
  const [adminWithdrawAmount, setAdminWithdrawAmount] = useState('');
  const [adminTargetUpi, setAdminTargetUpi] = useState('');
  const [isWithdrawProcessing, setIsWithdrawProcessing] = useState(false);

  const handleAdminWithdraw = async () => {
    const numericAmt = parseFloat(adminWithdrawAmount);
    if (!numericAmt || numericAmt <= 0) {
      showToast('Invalid Amount', 'Please enter a valid numeric withdrawal amount.', 'error');
      return;
    }

    if (!adminTargetUpi || adminTargetUpi.trim().length === 0) {
      showToast('Invalid UPI ID', 'Please enter a valid target UPI ID / Bank VPA.', 'error');
      return;
    }

    const available = auditData?.availablePlatformRake ?? auditData?.totalRake ?? 0;
    if (numericAmt > available && available > 0) {
      showToast(
        'Insufficient Earnings',
        `Requested ₹${numericAmt} exceeds available platform earnings of ₹${available}.`,
        'error'
      );
      return;
    }

    showConfirmDialog(
      '💸',
      'Confirm Admin Payout',
      `Withdraw ₹${numericAmt} platform earnings to UPI ID: ${adminTargetUpi.trim()}?`,
      'WITHDRAW NOW',
      async () => {
        setIsWithdrawProcessing(true);
        try {
          const token = await fetchAuthToken();
          const headers = token ? { Authorization: `Bearer ${token}` } : {};
          const res = await axios.post(
            `${API_SERVER_URL}/api/admin/withdraw`,
            { amount: numericAmt, upiId: adminTargetUpi.trim() },
            { headers }
          );

          if (res.data.success) {
            showToast('Payout Successful! 💸', res.data.message, 'success');
            setAdminWithdrawAmount('');
            setAdminTargetUpi('');
            loadDataForTab('AUDIT');
          }
        } catch (err: any) {
          showToast('Withdrawal Error', err.response?.data?.error || err.message, 'error');
        } finally {
          setIsWithdrawProcessing(false);
        }
      },
      false
    );
  };

  const handleSavePlatformConfig = async () => {
    const cleanUpi = platformUpiInput.trim();
    if (!cleanUpi) {
      showToast('Invalid UPI ID', 'Please enter a valid Platform Payee UPI ID.', 'error');
      return;
    }

    try {
      setIsSavingConfig(true);
      const token = await fetchAuthToken();
      const headers = token ? { Authorization: `Bearer ${token}` } : {};

      const res = await axios.put(
        `${API_SERVER_URL}/api/v1/admin/config`,
        { platformUpiId: cleanUpi },
        { headers }
      );

      if (res.data.success && res.data.platformUpiId) {
        showToast('Platform Settings Saved', `Live Payee UPI ID updated to ${res.data.platformUpiId}`, 'success');
        setPlatformUpiInput(res.data.platformUpiId);
      }
    } catch (err: any) {
      showToast('Save Failed', err.response?.data?.error || err.message || 'Failed to update platform UPI ID.', 'error');
    } finally {
      setIsSavingConfig(false);
    }
  };

  const fetchAuthToken = async () => {
    try {
      const defaultAuth = axios.defaults.headers.common['Authorization'] as string;
      if (defaultAuth && typeof defaultAuth === 'string' && defaultAuth.startsWith('Bearer ')) {
        return defaultAuth.replace('Bearer ', '').trim();
      }
      const defaultToken = axios.defaults.headers.common['x-auth-token'] as string;
      if (defaultToken && typeof defaultToken === 'string') {
        return defaultToken.trim();
      }
      if (typeof window !== 'undefined' && window.localStorage) {
        return window.localStorage.getItem('@auth_token') || window.localStorage.getItem('authToken');
      }
      return null;
    } catch {
      return null;
    }
  };

  const loadDataForTab = async (tab: TabType) => {
    setLoading(true);
    try {
      const token = await fetchAuthToken();
      const headers = token ? { Authorization: `Bearer ${token}` } : {};

      if (tab === 'REQUESTS') {
        const [reqRes, cfgRes] = await Promise.all([
          axios.get(
            `${API_SERVER_URL}/api/admin/requests?type=${requestFilterType}&status=${requestFilterStatus}`,
            { headers }
          ),
          axios.get(`${API_SERVER_URL}/api/v1/admin/config`, { headers }).catch(() => null),
        ]);

        if (reqRes.data.success) {
          setRequestsList(reqRes.data.requests || []);
        }
        if (cfgRes?.data?.success && cfgRes.data.platformUpiId) {
          setPlatformUpiInput(cfgRes.data.platformUpiId);
        }
      } else if (tab === 'AUDIT') {
        const res = await axios.get(`${API_SERVER_URL}/api/admin/audit`, { headers });
        if (res.data.success) {
          setAuditData(res.data);
        }
      } else if (tab === 'CONCURRENCY') {
        const res = await axios.get(`${API_SERVER_URL}/api/admin/concurrency`, { headers });
        if (res.data.success) {
          setConcurrencyData(res.data.concurrency || res.data);
        }
      } else if (tab === 'TOURNAMENT') {
        const res = await axios.get(`${API_SERVER_URL}/api/admin/tournaments`, { headers });
        if (res.data.success) {
          setTournaments(res.data.tournaments || []);
        }
      } else if (tab === 'COMPLIANCE') {
        const res = await axios.get(`${API_SERVER_URL}/api/admin/users`, { headers });
        if (res.data.success) {
          setUsersList(res.data.users || []);
          setPromoterCount(res.data.promoterCount || 0);
        }
      }
    } catch (err: any) {
      console.error('Error fetching admin data:', err);
      showToast('Telemetry Sync Failed', err.response?.data?.error || err.message, 'error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadDataForTab(activeTab);
  }, [activeTab, requestFilterType, requestFilterStatus]);

  // Request Tab Actions: Approve / Reject Deposit
  const handleApproveDeposit = async (txnId: string, amount: number, username: string) => {
    showConfirmDialog(
      '✅',
      'Approve Deposit Request',
      `Approve deposit of ₹${amount} for user "${username}" and credit to deposit wallet?`,
      'APPROVE & CREDIT',
      async () => {
        setActionLoading(`approve_dep_${txnId}`);
        try {
          const token = await fetchAuthToken();
          const headers = token ? { Authorization: `Bearer ${token}` } : {};
          const res = await axios.post(
            `${API_SERVER_URL}/api/admin/deposit/approve`,
            { transactionId: txnId },
            { headers }
          );
          if (res.data.success) {
            showToast('Deposit Approved! 🎉', res.data.message, 'success');
            loadDataForTab('REQUESTS');
          }
        } catch (err: any) {
          showToast('Approval Failed', err.response?.data?.error || err.message, 'error');
        } finally {
          setActionLoading(null);
        }
      }
    );
  };

  const handleRejectDeposit = (txnId: string, amount: number, username: string) => {
    setInputModal({
      visible: true,
      title: 'Reject Deposit Request ❌',
      message: `Reject deposit of ₹${amount} for "${username}". Please state reason:`,
      placeholder: 'Enter rejection reason (e.g. UTR mismatch)',
      value: 'UTR mismatch or payment not received',
      confirmText: 'REJECT REQUEST',
      onConfirm: async (reasonVal: string) => {
        if (!reasonVal.trim()) {
          showToast('Reason Required', 'Please provide a reason for rejecting the deposit.', 'error');
          return;
        }
        setActionLoading(`reject_dep_${txnId}`);
        try {
          const token = await fetchAuthToken();
          const headers = token ? { Authorization: `Bearer ${token}` } : {};
          const res = await axios.post(
            `${API_SERVER_URL}/api/admin/deposit/reject`,
            { transactionId: txnId, reason: reasonVal.trim() },
            { headers }
          );
          if (res.data.success) {
            showToast('Deposit Rejected ❌', res.data.message, 'info');
            setInputModal((prev) => ({ ...prev, visible: false }));
            loadDataForTab('REQUESTS');
          }
        } catch (err: any) {
          showToast('Rejection Failed', err.response?.data?.error || err.message, 'error');
        } finally {
          setActionLoading(null);
        }
      },
    });
  };

  // Request Tab Actions: Approve / Reject Withdrawal
  const handleApproveWithdrawal = (txnId: string, amount: number, upiId: string, username: string) => {
    setInputModal({
      visible: true,
      title: 'Approve Withdrawal & Enter Payout UTR 💸',
      message: `Transfer ₹${Math.abs(amount)} to "${username}" (UPI: ${upiId || 'N/A'}). Enter 12-digit Bank Payout UTR reference:`,
      placeholder: 'Enter 12-digit Payout UTR',
      value: '',
      confirmText: 'APPROVE & MARK PAID',
      onConfirm: async (utrVal: string) => {
        if (!utrVal.trim() || utrVal.trim().length < 6) {
          showToast('UTR Required', 'Please enter a valid payout UTR reference number.', 'error');
          return;
        }
        setActionLoading(`approve_wd_${txnId}`);
        try {
          const token = await fetchAuthToken();
          const headers = token ? { Authorization: `Bearer ${token}` } : {};
          const res = await axios.post(
            `${API_SERVER_URL}/api/admin/withdraw/approve`,
            { transactionId: txnId, payoutUtr: utrVal.trim() },
            { headers }
          );
          if (res.data.success) {
            showToast('Withdrawal Approved! 💸', res.data.message, 'success');
            setInputModal((prev) => ({ ...prev, visible: false }));
            loadDataForTab('REQUESTS');
          }
        } catch (err: any) {
          showToast('Approval Failed', err.response?.data?.error || err.message, 'error');
        } finally {
          setActionLoading(null);
        }
      },
    });
  };

  const handleRejectWithdrawal = (txnId: string, amount: number, username: string) => {
    setInputModal({
      visible: true,
      title: 'Reject Withdrawal Request ❌',
      message: `Reject withdrawal of ₹${Math.abs(amount)} for "${username}". Locked funds will be refunded to user winnings balance. Enter reason:`,
      placeholder: 'Enter rejection reason',
      value: 'Invalid UPI ID or transfer failed',
      confirmText: 'REJECT & REFUND USER',
      onConfirm: async (reasonVal: string) => {
        if (!reasonVal.trim()) {
          showToast('Reason Required', 'Please provide a reason for rejecting the withdrawal.', 'error');
          return;
        }
        setActionLoading(`reject_wd_${txnId}`);
        try {
          const token = await fetchAuthToken();
          const headers = token ? { Authorization: `Bearer ${token}` } : {};
          const res = await axios.post(
            `${API_SERVER_URL}/api/admin/withdraw/reject`,
            { transactionId: txnId, reason: reasonVal.trim() },
            { headers }
          );
          if (res.data.success) {
            showToast('Withdrawal Rejected & Refunded ↩️', res.data.message, 'info');
            setInputModal((prev) => ({ ...prev, visible: false }));
            loadDataForTab('REQUESTS');
          }
        } catch (err: any) {
          showToast('Rejection Failed', err.response?.data?.error || err.message, 'error');
        } finally {
          setActionLoading(null);
        }
      },
    });
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadDataForTab(activeTab);
  };

  // Tab C Action: Force Trigger Tournament
  const handleTriggerTournament = async (tournamentId: string) => {
    setActionLoading(`trigger_${tournamentId}`);
    try {
      const token = await fetchAuthToken();
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await axios.post(
        `${API_SERVER_URL}/api/admin/tournament/trigger`,
        { tournamentId },
        { headers }
      );
      if (res.data.success) {
        showToast('Bracket Overridden ⚡', res.data.message, 'success');
        loadDataForTab('TOURNAMENT');
      }
    } catch (err: any) {
      showToast('Action Failed', err.response?.data?.error || err.message, 'error');
    } finally {
      setActionLoading(null);
    }
  };

  // Tab C Action: Cancel Tournament
  const handleCancelTournament = async (tournamentId: string) => {
    showConfirmDialog(
      '🚨',
      'Emergency Cancellation',
      'This will cancel the tournament and refund all entry fees to registrants. Continue?',
      'EXECUTE REFUND',
      async () => {
        setActionLoading(`cancel_${tournamentId}`);
        try {
          const token = await fetchAuthToken();
          const headers = token ? { Authorization: `Bearer ${token}` } : {};
          const res = await axios.post(
            `${API_SERVER_URL}/api/admin/tournament/cancel`,
            { tournamentId },
            { headers }
          );
          if (res.data.success) {
            showToast('Tournament Cancelled 🚨', res.data.message, 'info');
            loadDataForTab('TOURNAMENT');
          }
        } catch (err: any) {
          showToast('Action Failed', err.response?.data?.error || err.message, 'error');
        } finally {
          setActionLoading(null);
        }
      },
      true
    );
  };

  // Tab D Action: KYC Gate Action
  const handleKycAction = async (userId: string, status: 'APPROVED' | 'REJECTED') => {
    setActionLoading(`kyc_${userId}`);
    try {
      const token = await fetchAuthToken();
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await axios.post(
        `${API_SERVER_URL}/api/admin/kyc/action`,
        { userId, status },
        { headers }
      );
      if (res.data.success) {
        Alert.alert(
          `KYC ${status === 'APPROVED' ? 'Approved' : 'Rejected'}`,
          res.data.message
        );
        // Filter out from local state
        setKycUsers((prev) => prev.filter((u) => u._id !== userId));
      }
    } catch (err: any) {
      Alert.alert('Action Failed', err.response?.data?.error || err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const handlePromoteUser = async (userId: string) => {
    setActionLoading(`promote_${userId}`);
    try {
      const token = await fetchAuthToken();
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await axios.post(
        `${API_SERVER_URL}/api/admin/promoter/promote`,
        { userId },
        { headers }
      );
      if (res.data.success) {
        showToast('Promoted! 💚', 'User successfully promoted to Promoter status.', 'success');
        loadDataForTab('COMPLIANCE');
      }
    } catch (err: any) {
      showToast('Promotion Failed', err.response?.data?.error || err.message, 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDemoteUser = async (userId: string) => {
    setActionLoading(`demote_${userId}`);
    try {
      const token = await fetchAuthToken();
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await axios.post(
        `${API_SERVER_URL}/api/admin/promoter/demote`,
        { userId },
        { headers }
      );
      if (res.data.success) {
        showToast('Demoted! 💔', 'User successfully demoted to regular status.', 'success');
        loadDataForTab('COMPLIANCE');
      }
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <View style={styles.container}>
      {/* Admin Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Image source={require('../../assets/Dlogo.png')} style={{ width: 28, height: 28, borderRadius: 6, marginRight: 8 }} />
            <Text style={styles.headerTitle}>ADMIN TERMINAL</Text>
          </View>
          <View style={styles.securityBadge}>
            <View style={styles.securityDot} />
            <Text style={styles.securityText}>ADMIN ACCESS</Text>
          </View>
        </View>
      </View>

      {/* Navigation Sub-Tabs Bar (Scrollable Pill Design) */}
      <View style={styles.tabBarWrapper}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabBarScrollContainer}
        >
          <TouchableOpacity
            style={[styles.tabPill, activeTab === 'REQUESTS' && styles.activeTabPill]}
            onPress={() => setActiveTab('REQUESTS')}
            activeOpacity={0.8}
          >
            <Text style={[styles.tabPillText, activeTab === 'REQUESTS' && styles.activeTabPillText]}>
              💳 Pay-In / Pay-Out
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabPill, activeTab === 'AUDIT' && styles.activeTabPill]}
            onPress={() => setActiveTab('AUDIT')}
            activeOpacity={0.8}
          >
            <Text style={[styles.tabPillText, activeTab === 'AUDIT' && styles.activeTabPillText]}>
              📈 Platform Earnings
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabPill, activeTab === 'CONCURRENCY' && styles.activeTabPill]}
            onPress={() => setActiveTab('CONCURRENCY')}
            activeOpacity={0.8}
          >
            <Text style={[styles.tabPillText, activeTab === 'CONCURRENCY' && styles.activeTabPillText]}>
              ⚡ Active Matches
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabPill, activeTab === 'TOURNAMENT' && styles.activeTabPill]}
            onPress={() => setActiveTab('TOURNAMENT')}
            activeOpacity={0.8}
          >
            <Text style={[styles.tabPillText, activeTab === 'TOURNAMENT' && styles.activeTabPillText]}>
              🏆 Tournaments
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabPill, activeTab === 'COMPLIANCE' && styles.activeTabPill]}
            onPress={() => setActiveTab('COMPLIANCE')}
            activeOpacity={0.8}
          >
            <Text style={[styles.tabPillText, activeTab === 'COMPLIANCE' && styles.activeTabPillText]}>
              🛡️ User Management
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      {/* Main View Area */}
      {loading && !refreshing ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4F46E5" />
          <Text style={styles.loadingText}>Fetching Platform Telemetry...</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.bodyScroll}
          contentContainerStyle={styles.bodyContent}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#4F46E5']} />}
        >
          {/* TAB: Manual Pay-In / Pay-Out Requests */}
          {activeTab === 'REQUESTS' && (
            <View>
              {/* Platform Pay-In UPI Config Card */}
              <View style={[styles.sectionCard, { backgroundColor: '#FFFFFF', marginBottom: 14, borderWidth: 1.5, borderColor: '#4F46E5' }]}>
                <View style={styles.cardHeaderRow}>
                  <Text style={[styles.cardHeaderTitle, { color: '#4F46E5' }]}>⚙️ PLATFORM PAY-IN UPI SETTINGS</Text>
                  <Text style={[styles.cardHeaderBadge, { backgroundColor: '#EEF2FF', color: '#4338CA' }]}>
                    LIVE CONFIG
                  </Text>
                </View>
                <Text style={{ fontSize: 11, color: '#64748B', marginTop: 2, marginBottom: 10 }}>
                  Update the official Platform Payee UPI ID used to generate dynamic payment QR codes and collect player deposits.
                </Text>

                <Text style={{ fontSize: 10, fontWeight: '800', color: '#475569', marginBottom: 4 }}>Platform Payee UPI ID (e.g. 6261069826-2.wallet@phonepe)</Text>
                <TextInput
                  style={{ height: 44, backgroundColor: '#F8FAFC', borderWidth: 1.5, borderColor: '#CBD5E1', borderRadius: 10, paddingHorizontal: 12, fontSize: 13, fontWeight: '800', color: '#0F172A', marginBottom: 12 }}
                  value={platformUpiInput}
                  onChangeText={setPlatformUpiInput}
                  placeholder="e.g. 6261069826-2.wallet@phonepe"
                  placeholderTextColor="#94A3B8"
                  autoCapitalize="none"
                />

                <TouchableOpacity
                  style={[{ backgroundColor: '#4F46E5', paddingVertical: 12, borderRadius: 10, alignItems: 'center' }, isSavingConfig && { opacity: 0.6 }]}
                  onPress={handleSavePlatformConfig}
                  disabled={isSavingConfig}
                >
                  {isSavingConfig ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={{ color: '#FFFFFF', fontSize: 11, fontWeight: '900', letterSpacing: 0.5 }}>
                      SAVE PLATFORM UPI ID
                    </Text>
                  )}
                </TouchableOpacity>
              </View>

              <View style={[styles.sectionCard, { backgroundColor: '#F8FAFC' }]}>
                <View style={styles.cardHeaderRow}>
                  <Text style={[styles.cardHeaderTitle, { color: '#4F46E5' }]}>💳 PAY-IN & PAY-OUT REQUEST LEDGER</Text>
                  <Text style={[styles.cardHeaderBadge, { backgroundColor: '#EEF2FF', color: '#4338CA' }]}>
                    {requestsList.length} REQUESTS
                  </Text>
                </View>

                {/* Type Filter Chips */}
                <View style={styles.filterChipRow}>
                  <Text style={styles.filterLabel}>Type:</Text>
                  {(['ALL', 'DEPOSIT', 'WITHDRAWAL'] as const).map((t) => (
                    <TouchableOpacity
                      key={t}
                      style={[styles.filterChip, requestFilterType === t && styles.activeFilterChip]}
                      onPress={() => setRequestFilterType(t)}
                    >
                      <Text style={[styles.filterChipText, requestFilterType === t && styles.activeFilterChipText]}>
                        {t === 'DEPOSIT' ? '💰 Deposits' : t === 'WITHDRAWAL' ? '💸 Withdrawals' : '🌐 All Types'}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Status Filter Chips */}
                <View style={[styles.filterChipRow, { marginTop: 6 }]}>
                  <Text style={styles.filterLabel}>Status:</Text>
                  {(['PENDING', 'APPROVED', 'REJECTED', 'ALL'] as const).map((s) => (
                    <TouchableOpacity
                      key={s}
                      style={[
                        styles.filterChip,
                        requestFilterStatus === s && styles.activeFilterChip,
                        s === 'PENDING' && requestFilterStatus === s && { backgroundColor: '#F59E0B', borderColor: '#F59E0B' },
                      ]}
                      onPress={() => setRequestFilterStatus(s)}
                    >
                      <Text style={[styles.filterChipText, requestFilterStatus === s && styles.activeFilterChipText]}>
                        {s === 'PENDING' ? '⏳ Pending' : s === 'APPROVED' ? '✅ Approved' : s === 'REJECTED' ? '❌ Rejected' : 'All Status'}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Requests List */}
              {requestsList.length === 0 ? (
                <View style={styles.emptyRequestsBox}>
                  <Text style={{ fontSize: 36, marginBottom: 8 }}>📭</Text>
                  <Text style={styles.emptyRequestsTitle}>No Requests Found</Text>
                  <Text style={styles.emptyRequestsSub}>
                    No {requestFilterStatus.toLowerCase()} {requestFilterType.toLowerCase()} requests match your current filters.
                  </Text>
                </View>
              ) : (
                requestsList.map((item) => {
                  const isDeposit = item.type === 'DEPOSIT';
                  const userObj = item.userId || {};
                  const isPending = item.status === 'PENDING';
                  const isApproved = item.status === 'APPROVED' || item.status === 'SUCCESS';
                  const isRejected = item.status === 'REJECTED' || item.status === 'FAILED';

                  return (
                    <View
                      key={item._id}
                      style={[
                        styles.requestCard,
                        isPending && styles.pendingRequestCard,
                        isApproved && styles.approvedRequestCard,
                        isRejected && styles.rejectedRequestCard,
                      ]}
                    >
                      {/* Card Top Row */}
                      <View style={styles.requestCardTop}>
                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Text style={styles.requestTypeIcon}>{isDeposit ? '💰' : '💸'}</Text>
                            <Text style={styles.requestTypeName}>
                              {isDeposit ? 'MANUAL DEPOSIT REQUEST' : 'MANUAL WITHDRAWAL REQUEST'}
                            </Text>
                          </View>
                          <Text style={styles.requestUserText}>
                            User: <Text style={{ fontWeight: '800', color: '#0F172A' }}>{userObj.username || 'Unknown'}</Text> (Phone: {userObj.phone || 'N/A'})
                          </Text>
                          <Text style={styles.requestTimeText}>{formatDateTime(item.createdAt)}</Text>
                        </View>

                        <View style={{ alignItems: 'flex-end' }}>
                          <Text style={[styles.requestAmountText, isDeposit ? { color: '#059669' } : { color: '#D97706' }]}>
                            ₹{Math.abs(item.amount).toFixed(2)}
                          </Text>
                          <View
                            style={[
                              styles.requestStatusBadge,
                              isPending && { backgroundColor: '#FEF3C7' },
                              isApproved && { backgroundColor: '#DCFCE7' },
                              isRejected && { backgroundColor: '#FEE2E2' },
                            ]}
                          >
                            <Text
                              style={[
                                styles.requestStatusBadgeText,
                                isPending && { color: '#B45309' },
                                isApproved && { color: '#15803D' },
                                isRejected && { color: '#B91C1C' },
                              ]}
                            >
                              {item.status}
                            </Text>
                          </View>
                        </View>
                      </View>

                      {/* Detail Info Row */}
                      <View style={styles.requestDetailBox}>
                        {isDeposit ? (
                          <View style={styles.detailRow}>
                            <Text style={styles.detailLabel}>12-Digit Reference UTR:</Text>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                              <Text style={styles.detailValueHighlight}>{item.utr || 'N/A'}</Text>
                              {item.utr && (
                                <TouchableOpacity
                                  style={styles.smallCopyBtn}
                                  onPress={() => showToast('Copied! 📋', item.utr, 'success')}
                                >
                                  <Text style={styles.smallCopyBtnText}>COPY UTR</Text>
                                </TouchableOpacity>
                              )}
                            </View>
                          </View>
                        ) : (
                          <View style={styles.detailRow}>
                            <Text style={styles.detailLabel}>User Destination UPI ID:</Text>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                              <Text style={styles.detailValueHighlight}>{item.paymentAddress || 'N/A'}</Text>
                              {item.paymentAddress && (
                                <TouchableOpacity
                                  style={styles.smallCopyBtn}
                                  onPress={() => showToast('Copied! 📋', item.paymentAddress, 'success')}
                                >
                                  <Text style={styles.smallCopyBtnText}>COPY UPI</Text>
                                </TouchableOpacity>
                              )}
                            </View>
                          </View>
                        )}

                        {/* User Wallet Balances Snapshot */}
                        <View style={styles.userBalanceSnapshot}>
                          <Text style={styles.snapshotText}>
                            Wallet: <Text style={{ fontWeight: '800' }}>₹{((userObj.depositBalance ?? 0) + (userObj.winningsBalance ?? 0)).toFixed(2)}</Text> | Dep: ₹{(userObj.depositBalance ?? 0).toFixed(2)} | Win: ₹{(userObj.winningsBalance ?? 0).toFixed(2)} | Locked: ₹{(userObj.lockedBalance ?? 0).toFixed(2)}
                          </Text>
                        </View>

                        {/* Rejection Reason if any */}
                        {item.rejectionReason && (
                          <View style={styles.rejectionReasonBox}>
                            <Text style={styles.rejectionReasonTitle}>Rejection Reason:</Text>
                            <Text style={styles.rejectionReasonText}>{item.rejectionReason}</Text>
                          </View>
                        )}
                      </View>

                      {/* Action Buttons for Pending Requests */}
                      {isPending && (
                        <View style={styles.requestActionRow}>
                          {isDeposit ? (
                            <>
                              <TouchableOpacity
                                style={[styles.actionBtn, styles.approveBtn]}
                                onPress={() => handleApproveDeposit(item._id, item.amount, userObj.username || 'User')}
                              >
                                <Text style={styles.actionBtnText}>✅ APPROVE & CREDIT ₹{item.amount}</Text>
                              </TouchableOpacity>
                              <TouchableOpacity
                                style={[styles.actionBtn, styles.rejectBtn]}
                                onPress={() => handleRejectDeposit(item._id, item.amount, userObj.username || 'User')}
                              >
                                <Text style={styles.actionBtnText}>❌ REJECT DEPOSIT</Text>
                              </TouchableOpacity>
                            </>
                          ) : (
                            <>
                              <TouchableOpacity
                                style={[styles.actionBtn, styles.approveBtn]}
                                onPress={() =>
                                  handleApproveWithdrawal(item._id, item.amount, item.paymentAddress || '', userObj.username || 'User')
                                }
                              >
                                <Text style={styles.actionBtnText}>💸 APPROVE & PAYOUT UTR</Text>
                              </TouchableOpacity>
                              <TouchableOpacity
                                style={[styles.actionBtn, styles.rejectBtn]}
                                onPress={() => handleRejectWithdrawal(item._id, item.amount, userObj.username || 'User')}
                              >
                                <Text style={styles.actionBtnText}>❌ REJECT & REFUND</Text>
                              </TouchableOpacity>
                            </>
                          )}
                        </View>
                      )}
                    </View>
                  );
                })
              )}
            </View>
          )}

          {/* TAB A: Revenue & Earnings */}
          {activeTab === 'AUDIT' && auditData && (
            <View>
              {/* Platform Earnings Payout Withdrawal Card */}
              <View style={[styles.sectionCard, styles.withdrawalSectionCard]}>
                <View style={styles.cardHeaderRow}>
                  <Text style={[styles.cardHeaderTitle, { color: '#047857' }]}>💰 WITHDRAW PLATFORM EARNINGS</Text>
                  <Text style={[styles.cardHeaderBadge, { backgroundColor: '#D1FAE5', color: '#065F46' }]}>
                    AVAILABLE: ₹{(auditData.availablePlatformRake ?? auditData.totalRake).toLocaleString('en-IN')}
                  </Text>
                </View>

                <View style={styles.statRow}>
                  <Text style={styles.statLabel}>Total Earnings:</Text>
                  <Text style={styles.statValue}>₹{auditData.totalRake.toLocaleString('en-IN')}</Text>
                </View>
                <View style={styles.statRow}>
                  <Text style={styles.statLabel}>Already Withdrawn:</Text>
                  <Text style={styles.statValue}>₹{(auditData.totalWithdrawn || 0).toLocaleString('en-IN')}</Text>
                </View>
                <View style={[styles.statRow, { borderBottomWidth: 0, marginTop: 4 }]}>
                  <Text style={{ fontSize: 12, fontWeight: '800', color: '#047857' }}>Available to Withdraw:</Text>
                  <Text style={{ fontSize: 15, fontWeight: '900', color: '#047857' }}>
                    ₹{(auditData.availablePlatformRake ?? auditData.totalRake).toLocaleString('en-IN')}
                  </Text>
                </View>

                {/* Amount Input with WITHDRAW ALL button */}
                <Text style={styles.inputLabelAdmin}>Withdraw Amount (₹)</Text>
                <View style={styles.inputRowAdmin}>
                  <TextInput
                    style={styles.adminInputFlex}
                    placeholder="Enter Amount (e.g. 500)"
                    placeholderTextColor="#94A3B8"
                    keyboardType="numeric"
                    value={adminWithdrawAmount}
                    onChangeText={setAdminWithdrawAmount}
                  />
                  <TouchableOpacity
                    style={styles.withdrawAllBtn}
                    onPress={() => setAdminWithdrawAmount((auditData.availablePlatformRake ?? auditData.totalRake).toString())}
                  >
                    <Text style={styles.withdrawAllText}>WITHDRAW ALL</Text>
                  </TouchableOpacity>
                </View>

                {/* Target UPI Input */}
                <Text style={styles.inputLabelAdmin}>UPI ID</Text>
                <TextInput
                  style={styles.adminInputFull}
                  placeholder="Enter UPI ID (e.g. admin@upi)"
                  placeholderTextColor="#94A3B8"
                  autoCapitalize="none"
                  value={adminTargetUpi}
                  onChangeText={setAdminTargetUpi}
                />

                {/* Submit Withdrawal Button */}
                <TouchableOpacity
                  style={[styles.actionWithdrawBtn, isWithdrawProcessing && { opacity: 0.6 }]}
                  onPress={handleAdminWithdraw}
                  disabled={isWithdrawProcessing}
                  activeOpacity={0.8}
                >
                  {isWithdrawProcessing ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text style={styles.actionWithdrawText}>💸 WITHDRAW EARNINGS NOW</Text>
                  )}
                </TouchableOpacity>
              </View>

              {/* Total Platform Revenue */}
              <View style={styles.sectionCard}>
                <View style={styles.cardHeaderRow}>
                  <Text style={styles.cardHeaderTitle}>TOTAL PLATFORM REVENUE</Text>
                  <Text style={styles.cardHeaderBadge}>ID: {auditData.platformId.slice(-8)}</Text>
                </View>
                <View style={styles.heroMetricBox}>
                  <Text style={styles.heroMetricLabel}>Total Platform Revenue</Text>
                  <Text style={styles.heroMetricValue}>₹{auditData.totalRake.toLocaleString('en-IN')}</Text>
                </View>

                <Text style={styles.subHeaderTitle}>Revenue by Match Fee</Text>
                <View style={styles.tierGrid}>
                  {[3, 5, 50, 500].map((tier) => {
                    const metric = auditData.tierMetrics[tier] || { rake: 0, count: 0 };
                    return (
                      <View key={tier} style={styles.tierGridItem}>
                        <Text style={styles.tierLabel}>₹{tier} Matches</Text>
                        <Text style={styles.tierRakeText}>₹{metric.rake}</Text>
                        <Text style={styles.tierCountText}>{metric.count} Matches Played</Text>
                      </View>
                    );
                  })}
                </View>
              </View>

              {/* TDS Tax Collected */}
              <View style={styles.sectionCard}>
                <View style={styles.cardHeaderRow}>
                  <Text style={styles.cardHeaderTitle}>TDS TAX COLLECTED (30%)</Text>
                  <Text style={[styles.cardHeaderBadge, { backgroundColor: '#FEF3C7', color: '#B45309' }]}>
                    30% TDS
                  </Text>
                </View>
                <View style={styles.statRow}>
                  <Text style={styles.statLabel}>Total Player Winnings:</Text>
                  <Text style={styles.statValue}>₹{auditData.taxTracker.totalWinnings.toLocaleString('en-IN')}</Text>
                </View>
                <View style={styles.statRow}>
                  <Text style={styles.statLabel}>TDS Tax Rate:</Text>
                  <Text style={styles.statValue}>{auditData.taxTracker.tdsPercentage}%</Text>
                </View>
                <View style={[styles.statRow, styles.highlightRow]}>
                  <Text style={styles.highlightLabel}>Total TDS Collected:</Text>
                  <Text style={styles.highlightValue}>₹{auditData.taxTracker.accumulatedTds.toLocaleString('en-IN')}</Text>
                </View>
              </View>

              {/* Player Wallet Balances */}
              <View style={styles.sectionCard}>
                <View style={styles.cardHeaderRow}>
                  <Text style={styles.cardHeaderTitle}>PLAYER WALLET BALANCES</Text>
                  <Text style={[styles.cardHeaderBadge, { backgroundColor: '#FEE2E2', color: '#B91C1C' }]}>
                    ACTIVE PLAYERS
                  </Text>
                </View>
                <View style={styles.statRow}>
                  <Text style={styles.statLabel}>Total Deposits:</Text>
                  <Text style={styles.statValue}>₹{auditData.systemLiability.depositPool.toLocaleString('en-IN')}</Text>
                </View>
                <View style={styles.statRow}>
                  <Text style={styles.statLabel}>Total Winnings:</Text>
                  <Text style={styles.statValue}>₹{auditData.systemLiability.winningsPool.toLocaleString('en-IN')}</Text>
                </View>
                <View style={styles.statRow}>
                  <Text style={styles.statLabel}>Total Bonus:</Text>
                  <Text style={styles.statValue}>₹{auditData.systemLiability.bonusPool.toLocaleString('en-IN')}</Text>
                </View>
                <View style={[styles.statRow, styles.totalLiabilityRow]}>
                  <Text style={styles.totalLiabilityLabel}>Total Player Funds:</Text>
                  <Text style={styles.totalLiabilityValue}>₹{auditData.systemLiability.totalLiability.toLocaleString('en-IN')}</Text>
                </View>
              </View>
            </View>
          )}

          {/* TAB B: Live Matches & Bots */}
          {activeTab === 'CONCURRENCY' && concurrencyData && (
            <View>
              <View style={styles.sectionCard}>
                <View style={styles.cardHeaderRow}>
                  <Text style={styles.cardHeaderTitle}>LIVE MATCHES & BOTS</Text>
                  <Text style={[styles.cardHeaderBadge, { backgroundColor: '#ECFDF5', color: '#047857' }]}>
                    {concurrencyData.botMatrix.driverStatus}
                  </Text>
                </View>
                <View style={styles.concurrencyGrid}>
                  <View style={styles.concurrencyBox}>
                    <Text style={styles.concurrencyBoxNumber}>{concurrencyData.concurrency.totalRooms}</Text>
                    <Text style={styles.concurrencyBoxLabel}>Total Rooms</Text>
                  </View>
                  <View style={styles.concurrencyBox}>
                    <Text style={[styles.concurrencyBoxNumber, { color: '#F59E0B' }]}>
                      {concurrencyData.concurrency.waitingRooms}
                    </Text>
                    <Text style={styles.concurrencyBoxLabel}>Waiting Rooms</Text>
                  </View>
                  <View style={styles.concurrencyBox}>
                    <Text style={[styles.concurrencyBoxNumber, { color: '#10B981' }]}>
                      {concurrencyData.concurrency.activeRooms}
                    </Text>
                    <Text style={styles.concurrencyBoxLabel}>Active Matches</Text>
                  </View>
                  <View style={styles.concurrencyBox}>
                    <Text style={[styles.concurrencyBoxNumber, { color: '#4F46E5' }]}>
                      {concurrencyData.concurrency.activeBotSessions}
                    </Text>
                    <Text style={styles.concurrencyBoxLabel}>Active Bots</Text>
                  </View>
                </View>
              </View>

              {/* Active Rooms */}
              <View style={styles.sectionCard}>
                <Text style={styles.cardHeaderTitle}>LIVE GAME ROOMS</Text>
                {concurrencyData.rooms.length === 0 ? (
                  <Text style={styles.emptyText}>No live match rooms active right now.</Text>
                ) : (
                  concurrencyData.rooms.map((room: any) => (
                    <View key={room.roomId} style={styles.roomRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.roomIdText}>Room: {room.roomId}</Text>
                        <Text style={styles.roomSubText}>
                          Fee: ₹{room.entryFee} • Players: {room.playersCount}/2
                        </Text>
                      </View>
                      <View style={styles.roomBadgeRow}>
                        {room.hasBot && (
                          <View style={styles.botTag}>
                            <Text style={styles.botTagText}>🤖 Bot</Text>
                          </View>
                        )}
                        <View style={[styles.statusTag, room.status === 'ACTIVE' ? styles.statusActive : styles.statusWaiting]}>
                          <Text style={styles.statusTagText}>{room.status}</Text>
                        </View>
                      </View>
                    </View>
                  ))
                )}
              </View>
            </View>
          )}

          {/* TAB C: Grand Tournament Bracket Overrides & CRUD Management */}
          {activeTab === 'TOURNAMENT' && (
            <View>
              {/* Header Create Action Bar */}
              <TouchableOpacity
                style={styles.createTourBtn}
                onPress={openCreateTourModal}
                activeOpacity={0.8}
              >
                <Text style={styles.createTourBtnText}>➕ CREATE NEW TOURNAMENT</Text>
              </TouchableOpacity>

              {tournaments.length === 0 ? (
                <View style={styles.sectionCard}>
                  <Text style={styles.emptyText}>No active or scheduled tournaments found. Tap above to create one!</Text>
                </View>
              ) : (
                tournaments.map((tour) => {
                  const isTriggering = actionLoading === `trigger_${tour._id}`;
                  const isCancelling = actionLoading === `cancel_${tour._id}`;
                  const isDeleting = actionLoading === `delete_${tour._id}`;
                  const densityPct = Math.round(((tour.registeredUsers?.length || 0) / (tour.maxEntries || 10000)) * 100);

                  return (
                    <View key={tour._id} style={styles.sectionCard}>
                      <View style={styles.cardHeaderRow}>
                        <Text style={styles.cardHeaderTitle}>{tour.title.toUpperCase()}</Text>
                        <Text style={[styles.cardHeaderBadge, tour.status === 'ACTIVE' ? styles.statusActive : styles.statusWaiting]}>
                          {tour.status}
                        </Text>
                      </View>

                      {/* Event Overview */}
                      <View style={styles.slotDensityCard}>
                        <Text style={styles.slotDensityLabel}>Joined Players</Text>
                        <Text style={styles.slotDensityValue}>
                          {tour.registeredUsers?.length || 0} / {tour.maxEntries || 10000} Players ({densityPct}%)
                        </Text>
                        <View style={styles.progressBarBg}>
                          <View style={[styles.progressBarFill, { width: `${Math.min(100, densityPct)}%` }]} />
                        </View>
                      </View>

                      <View style={styles.statRow}>
                        <Text style={styles.statLabel}>Start Time:</Text>
                        <Text style={styles.statValue}>📅 {formatDateTime(tour.startsAt)}</Text>
                      </View>
                      <View style={styles.statRow}>
                        <Text style={styles.statLabel}>Prize Pool:</Text>
                        <Text style={styles.statValue}>₹{tour.totalPrizePool}</Text>
                      </View>
                      <View style={styles.statRow}>
                        <Text style={styles.statLabel}>Entry Fee:</Text>
                        <Text style={styles.statValue}>₹{tour.entryFee}</Text>
                      </View>
                      <View style={styles.statRow}>
                        <Text style={styles.statLabel}>Current Round:</Text>
                        <Text style={styles.statValue}>Round {tour.currentRound || 1}</Text>
                      </View>

                      {/* Admin Actions */}
                      <Text style={styles.subHeaderTitle}>Actions</Text>
                      <View style={styles.actionBtnRow}>
                        <TouchableOpacity
                          style={[styles.overrideBtn, styles.editTourBtn]}
                          onPress={() => openEditTourModal(tour)}
                        >
                          <Text style={styles.overrideBtnText}>✏️ EDIT</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={[styles.overrideBtn, styles.deleteTourBtn]}
                          onPress={() => handleDeleteTournament(tour._id, tour.title)}
                          disabled={isDeleting}
                        >
                          {isDeleting ? (
                            <ActivityIndicator color="#FFF" size="small" />
                          ) : (
                            <Text style={styles.overrideBtnText}>🗑️ DELETE</Text>
                          )}
                        </TouchableOpacity>
                      </View>

                      <View style={[styles.actionBtnRow, { marginTop: 6 }]}>
                        <TouchableOpacity
                          style={[styles.overrideBtn, styles.triggerBtn]}
                          onPress={() => handleTriggerTournament(tour._id)}
                          disabled={isTriggering || isCancelling}
                        >
                          {isTriggering ? (
                            <ActivityIndicator color="#FFF" size="small" />
                          ) : (
                            <Text style={styles.overrideBtnText}>⚡ FORCE START</Text>
                          )}
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={[styles.overrideBtn, styles.cancelBtn]}
                          onPress={() => handleCancelTournament(tour._id)}
                          disabled={isTriggering || isCancelling}
                        >
                          {isCancelling ? (
                            <ActivityIndicator color="#FFF" size="small" />
                          ) : (
                            <Text style={styles.overrideBtnText}>🚨 CANCEL & REFUND</Text>
                          )}
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })
              )}
            </View>
          )}

          {/* TAB D: Compliance / User & Promoter Management */}
          {activeTab === 'COMPLIANCE' && (
            <View>
              {/* Promoter Capacity Counter Card */}
              <View style={styles.sectionCard}>
                <View style={styles.cardHeaderRow}>
                  <Text style={styles.cardHeaderTitle}>🛡️ PROMOTIONAL ACCOUNT MANAGEMENT</Text>
                  <Text style={[
                    styles.cardHeaderBadge,
                    promoterCount >= 3 ? { backgroundColor: '#FEE2E2', color: '#B91C1C' } : { backgroundColor: '#ECFDF5', color: '#047857' }
                  ]}>
                    Active Promoters: {promoterCount} / 3
                  </Text>
                </View>
                <Text style={styles.promoterDescription}>
                  Promoters are special mock accounts designed to test real-money lobby matches dynamically. The platform limits active promoters to exactly 3 accounts.
                </Text>
              </View>

              {/* Users & Promoters Table Card */}
              <View style={styles.sectionCard}>
                <Text style={styles.cardHeaderTitle}>ALL REGISTERED USERS</Text>
                {usersList.length === 0 ? (
                  <Text style={styles.emptyText}>No registered users found.</Text>
                ) : (
                  usersList.map((userItem) => {
                    const isPromoted = userItem.isPromoter === true;
                    const isPromoting = actionLoading === `promote_${userItem._id}`;
                    const isDemoting = actionLoading === `demote_${userItem._id}`;
                    const limitReached = promoterCount >= 3;

                    return (
                      <View key={userItem._id} style={styles.userRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.userUsername}>{userItem.username}</Text>
                          <Text style={styles.userSubText}>
                            Phone: {userItem.phone} • Registered: {formatDateTime(userItem.createdAt)}
                          </Text>
                        </View>

                        <View style={styles.userActions}>
                          {isPromoted ? (
                            <TouchableOpacity
                              style={[styles.userActionBtn, styles.demoteBtn]}
                              onPress={() => handleDemoteUser(userItem._id)}
                              disabled={isDemoting}
                              activeOpacity={0.8}
                            >
                              {isDemoting ? (
                                <ActivityIndicator color="#FFFFFF" size="small" />
                              ) : (
                                <Text style={styles.userActionText}>DEMOTE</Text>
                              )}
                            </TouchableOpacity>
                          ) : (
                            <TouchableOpacity
                              style={[
                                styles.userActionBtn,
                                styles.promoteBtn,
                                (limitReached || isPromoting) && styles.disabledBtn
                              ]}
                              onPress={() => handlePromoteUser(userItem._id)}
                              disabled={limitReached || isPromoting}
                              activeOpacity={0.8}
                            >
                              {isPromoting ? (
                                <ActivityIndicator color="#FFFFFF" size="small" />
                              ) : (
                                <Text style={styles.userActionText}>PROMOTE</Text>
                              )}
                            </TouchableOpacity>
                          )}
                        </View>
                      </View>
                    );
                  })
                )}
              </View>
            </View>
          )}
        </ScrollView>
      )}

      {/* Tournament Create / Edit Modal Overlay */}
      {isTourModalVisible && (
        <Modal visible={true} transparent animationType="slide">
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <View style={styles.modalHeaderRow}>
                <Text style={styles.modalTitle}>
                  {editingTourId ? '✏️ EDIT TOURNAMENT' : '🏆 CREATE TOURNAMENT'}
                </Text>
                <TouchableOpacity onPress={() => setIsTourModalVisible(false)}>
                  <Text style={styles.modalCloseBtn}>✕</Text>
                </TouchableOpacity>
              </View>

              <ScrollView style={{ maxHeight: 400 }} showsVerticalScrollIndicator={false}>
                <Text style={styles.modalLabel}>Tournament Title</Text>
                <TextInput
                  style={styles.modalInput}
                  placeholder="e.g. Dream Blast"
                  placeholderTextColor="#94A3B8"
                  value={formTitle}
                  onChangeText={setFormTitle}
                />

                <Text style={styles.modalLabel}>Total Prize Pool (₹)</Text>
                <TextInput
                  style={styles.modalInput}
                  placeholder="e.g. 70000"
                  placeholderTextColor="#94A3B8"
                  keyboardType="numeric"
                  value={formPrizePool}
                  onChangeText={setFormPrizePool}
                />

                <Text style={styles.modalLabel}>Entry Fee (₹)</Text>
                <TextInput
                  style={styles.modalInput}
                  placeholder="e.g. 10"
                  placeholderTextColor="#94A3B8"
                  keyboardType="numeric"
                  value={formEntryFee}
                  onChangeText={setFormEntryFee}
                />

                <Text style={styles.modalLabel}>Max Slots / Capacity</Text>
                <TextInput
                  style={styles.modalInput}
                  placeholder="e.g. 10000"
                  placeholderTextColor="#94A3B8"
                  keyboardType="numeric"
                  value={formMaxEntries}
                  onChangeText={setFormMaxEntries}
                />

                <Text style={styles.modalLabel}>Start Date & Time (YYYY-MM-DDTHH:mm)</Text>
                <TextInput
                  style={styles.modalInput}
                  placeholder="e.g. 2026-07-19T20:00"
                  placeholderTextColor="#94A3B8"
                  value={formStartsAt}
                  onChangeText={setFormStartsAt}
                />
                <View style={styles.timePresetRow}>
                  <TouchableOpacity
                    style={styles.timePresetBtn}
                    onPress={() => setFormStartsAt(new Date().toISOString().slice(0, 16))}
                  >
                    <Text style={styles.timePresetText}>⚡ NOW</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.timePresetBtn}
                    onPress={() => setFormStartsAt(new Date(Date.now() + 3600000).toISOString().slice(0, 16))}
                  >
                    <Text style={styles.timePresetText}>⏱️ +1 HR</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.timePresetBtn}
                    onPress={() => setFormStartsAt(new Date(Date.now() + 86400000).toISOString().slice(0, 16))}
                  >
                    <Text style={styles.timePresetText}>📅 +1 DAY</Text>
                  </TouchableOpacity>
                </View>

                <Text style={styles.modalLabel}>Tournament Status</Text>
                <View style={styles.statusToggleRow}>
                  {(['UPCOMING', 'ACTIVE', 'CONCLUDED'] as const).map((st) => (
                    <TouchableOpacity
                      key={st}
                      style={[styles.statusToggleBtn, formStatus === st && styles.statusToggleBtnActive]}
                      onPress={() => setFormStatus(st)}
                    >
                      <Text style={[styles.statusToggleText, formStatus === st && styles.statusToggleTextActive]}>
                        {st}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>

              <View style={styles.modalActionRow}>
                <TouchableOpacity
                  style={[styles.modalBtn, styles.modalCancelBtn]}
                  onPress={() => setIsTourModalVisible(false)}
                >
                  <Text style={styles.modalCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalBtn, styles.modalSaveBtn, isSavingTour && { opacity: 0.6 }]}
                  onPress={handleSaveTournament}
                  disabled={isSavingTour}
                >
                  {isSavingTour ? (
                    <ActivityIndicator color="#FFF" size="small" />
                  ) : (
                    <Text style={styles.modalSaveText}>
                      {editingTourId ? 'UPDATE TOURNAMENT' : 'SAVE TOURNAMENT'}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}

      {/* Toast Notification Banner */}
      {toast.visible && (
        <View
          style={[
            styles.toastContainer,
            toast.type === 'success' && styles.toastSuccess,
            toast.type === 'error' && styles.toastError,
            toast.type === 'info' && styles.toastInfo,
          ]}
        >
          <Text style={styles.toastIcon}>
            {toast.type === 'success' ? '✅' : toast.type === 'error' ? '❌' : 'ℹ️'}
          </Text>
          <View style={{ flex: 1 }}>
            <Text
              style={[
                styles.toastTitle,
                toast.type === 'success' && { color: '#065F46' },
                toast.type === 'error' && { color: '#991B1B' },
                toast.type === 'info' && { color: '#3730A3' },
              ]}
            >
              {toast.title}
            </Text>
            {toast.message ? (
              <Text
                style={[
                  styles.toastMessage,
                  toast.type === 'success' && { color: '#047857' },
                  toast.type === 'error' && { color: '#B91C1C' },
                  toast.type === 'info' && { color: '#4338CA' },
                ]}
              >
                {toast.message}
              </Text>
            ) : null}
          </View>
          <TouchableOpacity onPress={() => setToast((prev) => ({ ...prev, visible: false }))}>
            <Text style={{ fontSize: 16, fontWeight: '800', opacity: 0.5, padding: 4 }}>✕</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Custom Confirmation Modal Dialog */}
      {confirmModal.visible && (
        <Modal visible={true} transparent animationType="fade">
          <View style={styles.alertOverlay}>
            <View style={styles.alertCard}>
              <View style={styles.alertIconCircle}>
                <Text style={{ fontSize: 28 }}>{confirmModal.icon}</Text>
              </View>
              <Text style={styles.alertTitle}>{confirmModal.title}</Text>
              <Text style={styles.alertMessage}>{confirmModal.message}</Text>

              <View style={styles.alertActionRow}>
                <TouchableOpacity
                  style={[styles.alertBtn, styles.alertCancelBtn]}
                  onPress={() => setConfirmModal((prev) => ({ ...prev, visible: false }))}
                >
                  <Text style={styles.alertCancelText}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.alertBtn,
                    confirmModal.isDestructive ? styles.alertDestructiveBtn : styles.alertConfirmBtn,
                  ]}
                  onPress={() => {
                    setConfirmModal((prev) => ({ ...prev, visible: false }));
                    confirmModal.onConfirm();
                  }}
                  activeOpacity={0.8}
                >
                  <Text style={styles.alertConfirmText}>{confirmModal.confirmText}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}

      {/* Input Modal for Payout UTR & Rejection Reason */}
      <Modal visible={inputModal.visible} transparent animationType="fade" onRequestClose={() => setInputModal((prev) => ({ ...prev, visible: false }))}>
        <View style={styles.alertOverlay}>
          <View style={styles.inputModalCard}>
            <Text style={styles.inputModalTitle}>{inputModal.title}</Text>
            <Text style={styles.inputModalSub}>{inputModal.message}</Text>
            <TextInput
              style={styles.modalInput}
              placeholder={inputModal.placeholder}
              placeholderTextColor="#94A3B8"
              value={inputModal.value}
              onChangeText={(val) => setInputModal((prev) => ({ ...prev, value: val }))}
              autoFocus
            />
            <View style={styles.modalActionRow}>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalCancelBtn]}
                onPress={() => setInputModal((prev) => ({ ...prev, visible: false }))}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalSaveBtn]}
                onPress={() => inputModal.onConfirm(inputModal.value)}
              >
                <Text style={styles.modalSaveText}>{inputModal.confirmText}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC', // Crisp Light Theme Canvas
  },
  header: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'android' ? 36 : 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderColor: '#E2E8F0',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLeft: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: 0.5,
  },
  securityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  securityDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
    marginRight: 6,
  },
  securityText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#10B981',
    letterSpacing: 0.8,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 24,
    padding: 4,
    marginHorizontal: 16,
    marginVertical: 10,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeTabButton: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#334155',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  tabText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748B',
  },
  activeTabText: {
    color: '#4F46E5',
    fontWeight: '900',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
  },
  bodyScroll: {
    flex: 1,
  },
  bodyContent: {
    padding: 16,
    paddingBottom: 140,
    width: '100%',
    maxWidth: 800,
    alignSelf: 'center',
  },
  sectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#334155',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    flexWrap: 'wrap',
    gap: 6,
  },
  cardHeaderTitle: {
    fontSize: 12,
    fontWeight: '900',
    color: '#1E293B',
    letterSpacing: 0.5,
    flexShrink: 1,
  },
  cardHeaderBadge: {
    fontSize: 10,
    fontWeight: '800',
    backgroundColor: '#EEF2FF',
    color: '#4F46E5',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  heroMetricBox: {
    backgroundColor: '#4F46E5',
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
  },
  heroMetricLabel: {
    fontSize: 11,
    color: '#C7D2FE',
    fontWeight: '600',
  },
  heroMetricValue: {
    fontSize: 24,
    fontWeight: '900',
    color: '#FFFFFF',
    marginTop: 4,
  },
  subHeaderTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#475569',
    marginTop: 8,
    marginBottom: 8,
  },
  tierGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -4,
  },
  tierGridItem: {
    width: '50%',
    padding: 4,
  },
  tierLabel: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
  },
  tierRakeText: {
    fontSize: 15,
    fontWeight: '900',
    color: '#10B981',
    marginTop: 2,
  },
  tierCountText: {
    fontSize: 10,
    color: '#94A3B8',
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderColor: '#F1F5F9',
  },
  statLabel: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
  },
  statValue: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0F172A',
  },
  highlightRow: {
    backgroundColor: '#FEF3C7',
    marginHorizontal: -16,
    paddingHorizontal: 16,
    marginBottom: -16,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
    borderBottomWidth: 0,
    marginTop: 8,
  },
  highlightLabel: {
    fontSize: 12,
    color: '#B45309',
    fontWeight: '800',
  },
  highlightValue: {
    fontSize: 14,
    fontWeight: '900',
    color: '#B45309',
  },
  totalLiabilityRow: {
    backgroundColor: '#FEE2E2',
    marginHorizontal: -16,
    paddingHorizontal: 16,
    marginBottom: -16,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
    borderBottomWidth: 0,
    marginTop: 8,
  },
  totalLiabilityLabel: {
    fontSize: 12,
    color: '#B91C1C',
    fontWeight: '800',
  },
  totalLiabilityValue: {
    fontSize: 14,
    fontWeight: '900',
    color: '#B91C1C',
  },
  concurrencyGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  concurrencyBox: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 10,
    alignItems: 'center',
    marginHorizontal: 3,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  concurrencyBoxNumber: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0F172A',
  },
  concurrencyBoxLabel: {
    fontSize: 9,
    color: '#64748B',
    fontWeight: '700',
    marginTop: 2,
    textAlign: 'center',
  },
  emptyText: {
    fontSize: 12,
    color: '#94A3B8',
    textAlign: 'center',
    paddingVertical: 16,
    fontStyle: 'italic',
  },
  roomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderColor: '#F1F5F9',
  },
  roomIdText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#1E293B',
  },
  roomSubText: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  roomBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  botTag: {
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
    marginRight: 6,
  },
  botTagText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#4F46E5',
  },
  statusTag: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusActive: {
    backgroundColor: '#ECFDF5',
  },
  statusWaiting: {
    backgroundColor: '#FEF3C7',
  },
  statusTagText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#047857',
  },
  slotDensityCard: {
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  slotDensityLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
  },
  slotDensityValue: {
    fontSize: 13,
    fontWeight: '900',
    color: '#0F172A',
    marginTop: 2,
    marginBottom: 6,
  },
  progressBarBg: {
    height: 6,
    backgroundColor: '#CBD5E1',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#4F46E5',
  },
  actionBtnRow: {
    flexDirection: 'row',
    marginTop: 12,
    marginHorizontal: -4,
  },
  overrideBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    marginHorizontal: 4,
  },
  triggerBtn: {
    backgroundColor: '#4F46E5',
  },
  cancelBtn: {
    backgroundColor: '#EF4444',
  },
  approveBtn: {
    backgroundColor: '#10B981',
  },
  rejectBtn: {
    backgroundColor: '#EF4444',
  },
  overrideBtnText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.3,
  },
  kycCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  kycHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  kycUsername: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
  },
  kycPhone: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
  },
  kycDetailsBg: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  kycDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 2,
  },
  kycLabel: {
    fontSize: 11,
    color: '#64748B',
  },
  kycVal: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1E293B',
  },
  kycPanVal: {
    fontSize: 11,
    fontWeight: '900',
    color: '#4F46E5',
    letterSpacing: 1,
  },
  withdrawalSectionCard: {
    borderColor: '#A7F3D0',
    backgroundColor: '#ECFDF5',
  },
  inputLabelAdmin: {
    fontSize: 11,
    fontWeight: '700',
    color: '#047857',
    marginTop: 10,
    marginBottom: 4,
  },
  inputRowAdmin: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  adminInputFlex: {
    flex: 1,
    height: 44,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#6EE7B7',
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 13,
    fontWeight: '700',
    color: '#065F46',
    marginRight: 8,
  },
  adminInputFull: {
    height: 44,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#6EE7B7',
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 13,
    fontWeight: '700',
    color: '#065F46',
    marginBottom: 12,
  },
  withdrawAllBtn: {
    backgroundColor: '#059669',
    paddingHorizontal: 12,
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  withdrawAllText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  actionWithdrawBtn: {
    backgroundColor: '#047857',
    borderRadius: 12,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
    shadowColor: '#047857',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 3,
  },
  actionWithdrawText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.6,
  },
  createTourBtn: {
    backgroundColor: '#4F46E5',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: '#4F46E5',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  createTourBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  editTourBtn: {
    backgroundColor: '#3B82F6',
  },
  deleteTourBtn: {
    backgroundColor: '#EF4444',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 480,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    borderBottomWidth: 1,
    borderColor: '#E2E8F0',
    paddingBottom: 12,
  },
  modalTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#0F172A',
  },
  modalCloseBtn: {
    fontSize: 18,
    fontWeight: '800',
    color: '#64748B',
    padding: 4,
  },
  modalLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
    marginTop: 10,
    marginBottom: 4,
  },
  modalInput: {
    height: 44,
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 13,
    fontWeight: '600',
    color: '#0F172A',
  },
  statusToggleRow: {
    flexDirection: 'row',
    marginTop: 6,
    marginBottom: 12,
  },
  timePresetRow: {
    flexDirection: 'row',
    marginTop: 6,
    marginBottom: 4,
  },
  timePresetBtn: {
    backgroundColor: '#EEF2FF',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginRight: 6,
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  timePresetText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#4F46E5',
  },
  statusToggleBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    marginHorizontal: 3,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  statusToggleBtnActive: {
    backgroundColor: '#4F46E5',
    borderColor: '#4F46E5',
  },
  statusToggleText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#64748B',
  },
  statusToggleTextActive: {
    color: '#FFFFFF',
  },
  modalActionRow: {
    flexDirection: 'row',
    marginTop: 16,
  },
  modalBtn: {
    flex: 1,
    height: 46,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 4,
  },
  modalCancelBtn: {
    backgroundColor: '#F1F5F9',
  },
  modalCancelText: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '800',
  },
  modalSaveBtn: {
    backgroundColor: '#4F46E5',
  },
  modalSaveText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
  },
  toastContainer: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 50 : 20,
    left: 20,
    right: 20,
    zIndex: 9999,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 16,
    borderWidth: 1.5,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  toastSuccess: {
    backgroundColor: '#ECFDF5',
    borderColor: '#6EE7B7',
  },
  toastError: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FCA5A5',
  },
  toastInfo: {
    backgroundColor: '#EEF2FF',
    borderColor: '#A5B4FC',
  },
  toastIcon: {
    fontSize: 20,
    marginRight: 10,
  },
  toastTitle: {
    fontSize: 13,
    fontWeight: '900',
  },
  toastMessage: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },
  alertOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  alertCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  alertIconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  alertTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0F172A',
    textAlign: 'center',
    marginBottom: 8,
  },
  alertMessage: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 20,
  },
  alertActionRow: {
    flexDirection: 'row',
    width: '100%',
  },
  alertBtn: {
    flex: 1,
    height: 46,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 4,
  },
  alertCancelBtn: {
    backgroundColor: '#F1F5F9',
  },
  alertCancelText: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '800',
  },
  alertConfirmBtn: {
    backgroundColor: '#4F46E5',
  },
  alertDestructiveBtn: {
    backgroundColor: '#EF4444',
  },
  alertConfirmText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  promoterDescription: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
    lineHeight: 18,
    marginTop: 8,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderColor: '#F1F5F9',
  },
  userUsername: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
  },
  userSubText: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 2,
    fontWeight: '600',
  },
  userActions: {
    marginLeft: 12,
  },
  userActionBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 80,
  },
  userActionText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  promoteBtn: {
    backgroundColor: '#10B981',
  },
  demoteBtn: {
    backgroundColor: '#EF4444',
  },
  disabledBtn: {
    backgroundColor: '#CBD5E1',
    opacity: 0.6,
  },
  filterChipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
  },
  filterLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#64748B',
    marginRight: 4,
  },
  filterChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  activeFilterChip: {
    backgroundColor: '#4F46E5',
    borderColor: '#4F46E5',
  },
  filterChipText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#475569',
  },
  activeFilterChipText: {
    color: '#FFFFFF',
  },
  emptyRequestsBox: {
    alignItems: 'center',
    paddingVertical: 40,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    marginTop: 10,
  },
  emptyRequestsTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: '#334155',
  },
  emptyRequestsSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
    textAlign: 'center',
    maxWidth: 260,
  },
  requestCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  pendingRequestCard: {
    borderColor: '#F59E0B',
    backgroundColor: '#FFFDF5',
  },
  approvedRequestCard: {
    borderColor: '#10B981',
  },
  rejectedRequestCard: {
    borderColor: '#EF4444',
  },
  requestCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  requestTypeIcon: {
    fontSize: 14,
  },
  requestTypeName: {
    fontSize: 11,
    fontWeight: '900',
    color: '#4F46E5',
    letterSpacing: 0.5,
  },
  requestUserText: {
    fontSize: 12,
    color: '#475569',
    marginTop: 3,
  },
  requestTimeText: {
    fontSize: 9,
    color: '#94A3B8',
    marginTop: 2,
    fontWeight: '600',
  },
  requestAmountText: {
    fontSize: 18,
    fontWeight: '900',
  },
  requestStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginTop: 4,
  },
  requestStatusBadgeText: {
    fontSize: 9,
    fontWeight: '900',
  },
  requestDetailBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 10,
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  detailLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
  },
  detailValueHighlight: {
    fontSize: 12,
    fontWeight: '900',
    color: '#0F172A',
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  smallCopyBtn: {
    backgroundColor: '#4F46E5',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  smallCopyBtnText: {
    color: '#FFFFFF',
    fontSize: 8,
    fontWeight: '900',
  },
  userBalanceSnapshot: {
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderColor: '#E2E8F0',
  },
  snapshotText: {
    fontSize: 9,
    color: '#475569',
  },
  rejectionReasonBox: {
    backgroundColor: '#FEE2E2',
    borderRadius: 8,
    padding: 6,
    marginTop: 6,
  },
  rejectionReasonTitle: {
    fontSize: 9,
    fontWeight: '900',
    color: '#991B1B',
  },
  rejectionReasonText: {
    fontSize: 10,
    color: '#B91C1C',
    fontWeight: '600',
  },
  requestActionRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  actionBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  tabBarWrapper: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderColor: '#E2E8F0',
    paddingVertical: 10,
  },
  tabBarScrollContainer: {
    paddingHorizontal: 14,
    gap: 8,
    alignItems: 'center',
  },
  tabPill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  activeTabPill: {
    backgroundColor: '#4F46E5',
    borderColor: '#4F46E5',
    shadowColor: '#4F46E5',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  tabPillText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#64748B',
  },
  activeTabPillText: {
    color: '#FFFFFF',
  },
  inputModalCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
  },
  inputModalTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: '#0F172A',
  },
  inputModalSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 4,
    marginBottom: 12,
    lineHeight: 15,
  },
});

