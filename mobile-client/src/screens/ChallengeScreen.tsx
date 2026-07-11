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

  const fetchChallengeProgress = async () => {
    setLoading(true);
    try {
      const response = await axios.get(`${API_SERVER_URL}/api/challenges/${userId}`);
      if (response.data.success) {
        setProgress(response.data.progress);
      }
    } catch (err: any) {
      console.error('Error fetching challenge progress:', err);
      Alert.alert('Error', 'Failed to retrieve daily challenge progress');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchChallengeProgress();
  }, [userId]);

  const percentage = progress ? Math.min(100, (progress.count / progress.target) * 100) : 0;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={onBack}>
          <Text style={styles.backBtnText}>◀ BACK</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>DAILY CHALLENGES</Text>
        <View style={styles.placeholder} />
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#FFD600" />
          <Text style={styles.loadingText}>FETCHING DAILY PROGRESS...</Text>
        </View>
      ) : (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
          <View style={styles.promoCard}>
            <Text style={styles.promoTitle}>🎁 PLAY & WIN EXTRA CASH</Text>
            <Text style={styles.promoDesc}>
              Complete your daily targets below to instantly claim bonus wallet credits straight to your winnings balance.
            </Text>
          </View>

          {progress && (
            <View style={styles.taskCard}>
              <View style={styles.taskHeader}>
                <View style={styles.taskTitleCol}>
                  <Text style={styles.taskTitle}>Ludo Arena Marathon</Text>
                  <Text style={styles.taskSub}>Play match tier games on the platform</Text>
                </View>
                <View style={styles.rewardBadge}>
                  <Text style={styles.rewardText}>+{progress.reward} INR</Text>
                </View>
              </View>

              {/* Progress Count Text */}
              <View style={styles.countContainer}>
                <Text style={styles.countLabel}>Progress</Text>
                <Text style={styles.countProgress}>
                  {progress.count} / {progress.target} games played
                </Text>
              </View>

              {/* Progress Track Bar */}
              <View style={styles.progressBarBg}>
                <View style={[styles.progressBarFill, { width: `${percentage}%` }]} />
              </View>

              {/* Reward status overlay */}
              {progress.isCompleted ? (
                <View style={styles.completedBadge}>
                  <Text style={styles.completedBadgeText}>✓ TARGET COMPLETED & CREDITED</Text>
                </View>
              ) : (
                <Text style={styles.taskTip}>
                  Tip: Both standard matches and bot liquidity matches count towards your progress.
                </Text>
              )}
            </View>
          )}

          <TouchableOpacity style={styles.refreshBtn} onPress={fetchChallengeProgress}>
            <Text style={styles.refreshBtnText}>REFRESH PROGRESS</Text>
          </TouchableOpacity>
        </ScrollView>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F0F12',
  },
  header: {
    height: 56,
    backgroundColor: '#16161F',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderColor: '#252533',
  },
  backBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  backBtnText: {
    color: '#8A8A9E',
    fontWeight: 'bold',
    fontSize: 13,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFF',
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
    color: '#FFD600',
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
    backgroundColor: '#FFD60015',
    borderWidth: 1,
    borderColor: '#FFD60044',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  promoTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#FFD600',
    marginBottom: 6,
  },
  promoDesc: {
    fontSize: 12,
    color: '#A2A2B5',
    lineHeight: 18,
  },
  taskCard: {
    backgroundColor: '#16161F',
    borderWidth: 1,
    borderColor: '#252533',
    borderRadius: 14,
    padding: 20,
    marginBottom: 24,
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
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFF',
  },
  taskSub: {
    fontSize: 11,
    color: '#8A8A9E',
    marginTop: 3,
  },
  rewardBadge: {
    backgroundColor: '#00E6761A',
    borderColor: '#00E67644',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  rewardText: {
    color: '#00E676',
    fontWeight: 'bold',
    fontSize: 12,
  },
  countContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  countLabel: {
    fontSize: 12,
    color: '#8A8A9E',
    fontWeight: '600',
  },
  countProgress: {
    fontSize: 12,
    color: '#FFF',
    fontWeight: 'bold',
  },
  progressBarBg: {
    height: 12,
    backgroundColor: '#2A2A38',
    borderRadius: 6,
    overflow: 'hidden',
    marginBottom: 16,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#00E676',
    borderRadius: 6,
  },
  completedBadge: {
    backgroundColor: '#00E67622',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  completedBadgeText: {
    color: '#00E676',
    fontWeight: 'bold',
    fontSize: 12,
    letterSpacing: 0.5,
  },
  taskTip: {
    color: '#6E6E7E',
    fontSize: 11,
    lineHeight: 16,
    fontStyle: 'italic',
  },
  refreshBtn: {
    backgroundColor: '#1E1E26',
    borderWidth: 1,
    borderColor: '#303040',
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
  },
  refreshBtnText: {
    color: '#FFF',
    fontWeight: 'bold',
    fontSize: 14,
  },
});
export default ChallengeScreen;
