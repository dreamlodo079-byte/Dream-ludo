import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  ScrollView,
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

  const fetchChallengeProgress = async () => {
    setLoading(true);
    try {
      const response = await axios.get(`${API_SERVER_URL}/api/challenges/${userId}`);
      if (response.data.success) {
        setProgress(response.data.progress);
      }
    } catch (err: any) {
      console.error('Error fetching challenge progress:', err);
      Alert.alert('Notice', 'Failed to retrieve daily milestone stats.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchChallengeProgress();
  }, [userId]);

  const handleClaimReward = async () => {
    if (!progress || progress.count < progress.target) {
      Alert.alert('Incomplete Milestone', 'Keep playing to complete your daily matches target!');
      return;
    }

    setClaiming(true);
    try {
      const response = await axios.post(`${API_SERVER_URL}/api/challenges/claim`, {
        userId,
      });
      if (response.data.success) {
        Alert.alert('Milestone Claimed!', `Reward of ₹${response.data.reward} added to your balance.`);
        fetchChallengeProgress();
      }
    } catch (err: any) {
      Alert.alert('Claim Failure', err.response?.data?.error || err.message);
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
        <TouchableOpacity style={styles.backBtn} onPress={onBack}>
          <Text style={styles.backBtnText}>◀ BACK</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>MILESTONES</Text>
        <View style={styles.placeholder} />
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#6366F1" />
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
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC', // Clean Ice White
  },
  header: {
    height: 64,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderColor: '#E2E8F0',
    marginTop: 20,
  },
  backBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#F1F5F9',
    borderRadius: 8,
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
    color: '#6366F1',
    marginTop: 15,
    fontWeight: 'bold',
    fontSize: 13,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
  },
  promoCard: {
    backgroundColor: '#EEF2FF',
    borderWidth: 1,
    borderColor: '#E0E7FF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.01,
    shadowRadius: 5,
    elevation: 1,
  },
  promoTitle: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#6366F1',
    marginBottom: 6,
  },
  promoDesc: {
    fontSize: 12,
    color: '#475569',
    lineHeight: 18,
  },
  taskCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#F1F5F9',
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 3,
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
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  rewardText: {
    color: '#6366F1',
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
    backgroundColor: '#E2E8F0',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 20,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#10B981', // Emerald green progress line
    borderRadius: 4,
  },
  completedCard: {
    backgroundColor: '#D1FAE5',
    borderRadius: 10,
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
    backgroundColor: '#10B981', // Emerald Green when active
    borderRadius: 10,
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
    backgroundColor: '#E2E8F0',
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
    borderColor: '#E2E8F0',
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
  },
  refreshBtnText: {
    color: '#475569',
    fontWeight: '700',
    fontSize: 13,
  },
});
export default ChallengeScreen;
