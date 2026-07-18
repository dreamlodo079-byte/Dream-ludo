import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  ScrollView,
  Modal,
} from 'react-native';
import axios from 'axios';

const API_SERVER_URL = process.env.EXPO_PUBLIC_SERVER_URL || 'http://localhost:5000';

interface ChallengeProgress {
  count: number;
  target: number;
  reward: number;
  isCompleted: boolean;
}

interface ChallengeScreenProps {
  userId: string;
  onBack: () => void;
}

export const ChallengeScreen: React.FC<ChallengeScreenProps> = ({ userId, onBack }) => {
  const [progress, setProgress] = useState<ChallengeProgress | null>(null);
  const [loading, setLoading] = useState(false);
  const [claiming, setClaiming] = useState(false);

  const [customAlert, setCustomAlert] = useState<{ visible: boolean; title: string; message: string; type: 'success' | 'error' | 'info' }>({
    visible: false,
    title: '',
    message: '',
    type: 'info',
  });

  const showCustomAlert = (title: string, message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setCustomAlert({ visible: true, title, message, type });
  };

  const fetchChallengeProgress = async () => {
    setLoading(true);
    try {
      const response = await axios.get(`${API_SERVER_URL}/api/challenges/${userId}`);
      if (response.data.success) {
        setProgress(response.data.progress);
      }
    } catch (err: any) {
      console.error('Error fetching challenge progress:', err);
      showCustomAlert('Notice', 'Failed to retrieve daily milestone stats.', 'info');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchChallengeProgress();
  }, [userId]);

  const handleClaimReward = async () => {
    if (!progress || progress.count < progress.target) {
      showCustomAlert('Incomplete Milestone', 'Keep playing to complete your daily matches target!', 'info');
      return;
    }

    setClaiming(true);
    try {
      const response = await axios.post(`${API_SERVER_URL}/api/challenges/claim`, {
        userId,
      });
      if (response.data.success) {
        showCustomAlert('Milestone Claimed!', `Reward of ₹${response.data.reward} added to your balance.`, 'success');
        fetchChallengeProgress();
      }
    } catch (err: any) {
      showCustomAlert('Claim Failure', err.response?.data?.error || err.message, 'error');
    } finally {
      setClaiming(false);
    }
  };

  const percentage = progress ? Math.min(100, (progress.count / progress.target) * 100) : 0;
  const isClaimable = progress ? (progress.count >= progress.target && !progress.isCompleted) : false;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>MILESTONES</Text>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4F46E5" />
          <Text style={styles.loadingText}>FETCHING MILESTONES...</Text>
        </View>
      ) : (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {/* Stacked header promo card */}
          <View style={styles.promoCard}>
            <Text style={styles.promoTitle}>🎁 DAILY CHALLENGES: Complete & Earn Rewards</Text>
            <Text style={styles.promoDesc}>
              Participate in standard or turbo matchmaker tiers. Complete objectives below to claim instant cash prizes.
            </Text>
          </View>

          {progress && (
            <View style={styles.taskCard}>
              <View style={styles.taskHeader}>
                <View style={styles.taskTitleCol}>
                  <Text style={styles.taskTitle}>Sexus Arena Marathon</Text>
                  <Text style={styles.taskSub}>Play 10 matches qualifying for ₹10+ entry games</Text>
                </View>
                {/* Cash Badge Reward */}
                <View style={styles.rewardBadge}>
                  <Text style={styles.rewardText}>Reward: ₹{progress.reward}</Text>
                </View>
              </View>

              {/* Progress Count Analytics Row */}
              <View style={styles.countContainer}>
                <Text style={styles.countLabel}>Current Progress</Text>
                <Text style={styles.countProgress}>
                  {progress.count} / {progress.target} matches
                </Text>
              </View>

              {/* Custom sleek progress bar */}
              <View style={styles.progressBarBg}>
                <View style={[styles.progressBarFill, { width: `${percentage}%` }]} />
              </View>

              {/* Action Claim button */}
              {progress.isCompleted ? (
                <View style={styles.completedCard}>
                  <Text style={styles.completedCardText}>✓ REWARD CLAIMED TODAY</Text>
                </View>
              ) : (
                <TouchableOpacity
                  style={[
                    styles.claimBtn,
                    !isClaimable && styles.claimBtnDisabled
                  ]}
                  onPress={handleClaimReward}
                  disabled={!isClaimable || claiming}
                >
                  {claiming ? (
                    <ActivityIndicator color="#FFF" />
                  ) : (
                    <Text style={styles.claimBtnText}>
                      {progress.count >= progress.target ? 'CLAIM REWARD' : 'LOCKED (Complete target)'}
                    </Text>
                  )}
                </TouchableOpacity>
              )}
            </View>
          )}

          <TouchableOpacity style={styles.refreshBtn} onPress={fetchChallengeProgress}>
            <Text style={styles.refreshBtnText}>SYNC MILESTONES</Text>
          </TouchableOpacity>
        </ScrollView>
      )}
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
  header: {
    height: 64,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderColor: '#E5E7EB',
    marginTop: 20,
  },
  backBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
  },
  backBtnText: {
    color: '#0F172A',
    fontWeight: 'bold',
    fontSize: 12,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#0F172A',
    letterSpacing: 1,
  },
  placeholder: {
    width: 60,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#4F46E5',
    marginTop: 15,
    fontWeight: 'bold',
    fontSize: 13,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 110, // Avoid bottom capsule navigation bar overlap
  },
  promoCard: {
    backgroundColor: '#EEF2FF', // Active glow tint
    borderWidth: 1,
    borderColor: '#C7D2FE',
    borderRadius: 24, // Global component radius
    padding: 16,
    marginBottom: 20,
    // Global micro-shadow profile
    shadowColor: '#475569',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.05,
    shadowRadius: 16,
    elevation: 4,
  },
  promoTitle: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#4F46E5',
    marginBottom: 6,
  },
  promoDesc: {
    fontSize: 12,
    color: '#475569',
    lineHeight: 18,
  },
  taskCard: {
    backgroundColor: '#FFFFFF', // Pure White card surfaces
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 24, // Global component radius
    padding: 20,
    marginBottom: 24,
    shadowColor: '#475569',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.05,
    shadowRadius: 16,
    elevation: 4,
  },
  taskHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 20,
  },
  taskTitleCol: {
    flex: 1,
    marginRight: 10,
  },
  taskTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#0F172A',
  },
  taskSub: {
    fontSize: 11,
    color: '#475569',
    marginTop: 3,
    lineHeight: 15,
  },
  rewardBadge: {
    backgroundColor: '#EEF2FF',
    borderColor: '#C7D2FE',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  rewardText: {
    color: '#4F46E5',
    fontWeight: '700',
    fontSize: 11,
  },
  countContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  countLabel: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
  },
  countProgress: {
    fontSize: 12,
    color: '#0F172A',
    fontWeight: '700',
  },
  progressBarBg: {
    height: 8,
    backgroundColor: '#E5E7EB',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 20,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#10B981', // Emerald green
    borderRadius: 4,
  },
  completedCard: {
    backgroundColor: '#D1FAE5',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  completedCardText: {
    color: '#065F46',
    fontWeight: '800',
    fontSize: 12,
    letterSpacing: 0.5,
  },
  claimBtn: {
    backgroundColor: '#10B981', // Emerald Green active
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 5,
    elevation: 2,
  },
  claimBtnDisabled: {
    backgroundColor: '#E5E7EB',
    shadowOpacity: 0,
    elevation: 0,
  },
  claimBtnText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 13,
  },
  refreshBtn: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
  },
  refreshBtnText: {
    color: '#475569',
    fontWeight: '700',
    fontSize: 13,
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
});
export default ChallengeScreen;
