import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import axios from 'axios';

const API_SERVER_URL = process.env.EXPO_PUBLIC_SERVER_URL || 'http://localhost:5000';

interface LeaderboardUser {
  _id: string;
  username: string;
  phone: string;
  netEarnings: number;
}

interface LeaderboardScreenProps {
  onBack: () => void;
}

const TIMEFRAMES = [
  { key: 'all-time', label: 'All Time' },
  { key: 'this-month', label: 'This Month' },
  { key: 'this-week', label: 'This Week' },
];

export const LeaderboardScreen: React.FC<LeaderboardScreenProps> = ({ onBack }) => {
  const [activeTab, setActiveTab] = useState('all-time');
  const [users, setUsers] = useState<LeaderboardUser[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchLeaderboard = async (timeframe: string) => {
    setLoading(true);
    try {
      const response = await axios.get(`${API_SERVER_URL}/api/leaderboard`, {
        params: { timeframe },
      });
      if (response.data.success) {
        setUsers(response.data.leaderboard);
      }
    } catch (err: any) {
      console.error('Error fetching leaderboard:', err);
      Alert.alert('Notice', 'Failed to retrieve rankings data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLeaderboard(activeTab);
  }, [activeTab]);

  // Extract Top 3 and Rank 4-50 users
  const top1 = users[0] || null;
  const top2 = users[1] || null;
  const top3 = users[2] || null;
  const scrollUsers = users.slice(3);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={onBack}>
          <Text style={styles.backBtnText}>◀ BACK</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>ARENA RANKINGS</Text>
        <View style={styles.placeholder} />
      </View>

      {/* Segmented Timeframe Chips Toolbar */}
      <View style={styles.tabsContainer}>
        {TIMEFRAMES.map((tab) => (
          <TouchableOpacity
            key={tab.key}
            style={[styles.tab, activeTab === tab.key && styles.activeTab]}
            onPress={() => setActiveTab(tab.key)}
          >
            <Text style={[styles.tabText, activeTab === tab.key && styles.activeTabText]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#6366F1" />
          <Text style={styles.loadingText}>CALCULATING TOP CHAMPIONS...</Text>
        </View>
      ) : (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {/* Top 3 Podium Graphic Card */}
          <View style={styles.podiumWrapper}>
            <View style={styles.podiumContainer}>
              {/* 2nd Place */}
              <View style={styles.podiumColumn}>
                <View style={styles.avatarPlaceholder}>
                  <Text style={styles.avatarText}>🥈</Text>
                </View>
                {top2 ? (
                  <View style={styles.podiumUserCard}>
                    <Text style={styles.podiumUserText} numberOfLines={1}>{top2.username}</Text>
                    <Text style={styles.podiumEarningsText}>₹{top2.netEarnings.toFixed(0)}</Text>
                  </View>
                ) : (
                  <View style={styles.podiumUserCard}>
                    <Text style={styles.podiumUserText}>---</Text>
                  </View>
                )}
                <View style={[styles.podiumBase, styles.silverBase]}>
                  <Text style={styles.podiumRankText}>2</Text>
                </View>
              </View>

              {/* 1st Place */}
              <View style={[styles.podiumColumn, styles.firstPlaceColumn]}>
                <Text style={styles.crownText}>👑</Text>
                <View style={[styles.avatarPlaceholder, styles.goldAvatar]}>
                  <Text style={styles.avatarText}>🥇</Text>
                </View>
                {top1 ? (
                  <View style={styles.podiumUserCard}>
                    <Text style={[styles.podiumUserText, styles.goldText]} numberOfLines={1}>{top1.username}</Text>
                    <Text style={styles.podiumEarningsText}>₹{top1.netEarnings.toFixed(0)}</Text>
                  </View>
                ) : (
                  <View style={styles.podiumUserCard}>
                    <Text style={styles.podiumUserText}>---</Text>
                  </View>
                )}
                <View style={[styles.podiumBase, styles.goldBase]}>
                  <Text style={styles.podiumRankText}>1</Text>
                </View>
              </View>

              {/* 3rd Place */}
              <View style={styles.podiumColumn}>
                <View style={styles.avatarPlaceholder}>
                  <Text style={styles.avatarText}>🥉</Text>
                </View>
                {top3 ? (
                  <View style={styles.podiumUserCard}>
                    <Text style={styles.podiumUserText} numberOfLines={1}>{top3.username}</Text>
                    <Text style={styles.podiumEarningsText}>₹{top3.netEarnings.toFixed(0)}</Text>
                  </View>
                ) : (
                  <View style={styles.podiumUserCard}>
                    <Text style={styles.podiumUserText}>---</Text>
                  </View>
                )}
                <View style={[styles.podiumBase, styles.bronzeBase]}>
                  <Text style={styles.podiumRankText}>3</Text>
                </View>
              </View>
            </View>
          </View>

          {/* Ranks 4 - 50 List */}
          <View style={styles.listContainer}>
            {scrollUsers.length === 0 && users.length <= 3 && (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyText}>No rank entries available for this time frame.</Text>
              </View>
            )}
            {scrollUsers.map((user, index) => {
              const rank = index + 4;
              return (
                <View key={user._id} style={styles.rankRow}>
                  <View style={styles.rankLeft}>
                    <View style={styles.rankBadge}>
                      <Text style={styles.rankNumber}>{rank}</Text>
                    </View>
                    <View style={styles.profileCol}>
                      <Text style={styles.rankName} numberOfLines={1}>{user.username}</Text>
                      <View style={styles.statusRow}>
                        <View style={styles.pulseDot} />
                        <Text style={styles.statusText}>LIVE</Text>
                      </View>
                    </View>
                  </View>
                  <Text style={styles.rankEarnings}>₹{user.netEarnings.toFixed(2)}</Text>
                </View>
              );
            })}
          </View>
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
  tabsContainer: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    padding: 8,
    borderBottomWidth: 1,
    borderColor: '#E2E8F0',
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: 20,
    marginHorizontal: 4,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  activeTab: {
    backgroundColor: '#EEF2FF',
    borderColor: '#6366F1',
  },
  tabText: {
    color: '#475569',
    fontWeight: '600',
    fontSize: 12,
  },
  activeTabText: {
    color: '#6366F1',
    fontWeight: '700',
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
    paddingBottom: 30,
  },
  podiumWrapper: {
    margin: 20,
    backgroundColor: '#EEF2FF', // Visual light-indigo background section
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E0E7FF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.03,
    shadowRadius: 10,
    elevation: 2,
  },
  podiumContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'flex-end',
    height: 190,
  },
  podiumColumn: {
    width: '30%',
    alignItems: 'center',
  },
  firstPlaceColumn: {
    width: '34%',
    marginHorizontal: 4,
  },
  avatarPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
  },
  goldAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    borderColor: '#F59E0B',
    backgroundColor: '#FEF3C7',
  },
  avatarText: {
    fontSize: 18,
  },
  podiumUserCard: {
    alignItems: 'center',
    marginBottom: 6,
    height: 40,
    justifyContent: 'center',
  },
  podiumUserText: {
    color: '#0F172A',
    fontSize: 11,
    fontWeight: '700',
  },
  goldText: {
    color: '#B45309',
    fontSize: 12,
  },
  podiumEarningsText: {
    color: '#10B981', // Emerald green
    fontSize: 10,
    fontWeight: '700',
    marginTop: 1,
  },
  crownText: {
    fontSize: 18,
    marginBottom: -4,
  },
  podiumBase: {
    width: '100%',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  goldBase: {
    height: 80,
    backgroundColor: '#FFFBEB',
    borderWidth: 2,
    borderColor: '#F59E0B',
  },
  silverBase: {
    height: 60,
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#94A3B8',
  },
  bronzeBase: {
    height: 45,
    backgroundColor: '#FFF8F6',
    borderWidth: 1.5,
    borderColor: '#F97316',
  },
  podiumRankText: {
    color: '#475569',
    fontSize: 20,
    fontWeight: 'bold',
  },
  listContainer: {
    paddingHorizontal: 20,
  },
  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  emptyText: {
    color: '#64748B',
    textAlign: 'center',
  },
  rankRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.02,
    shadowRadius: 5,
    elevation: 1,
  },
  rankLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rankBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  rankNumber: {
    color: '#475569',
    fontSize: 12,
    fontWeight: '700',
  },
  profileCol: {
    justifyContent: 'center',
  },
  rankName: {
    color: '#0F172A',
    fontSize: 13,
    fontWeight: '700',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  pulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
    marginRight: 4,
  },
  statusText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#10B981',
  },
  rankEarnings: {
    color: '#10B981',
    fontSize: 13,
    fontWeight: '800',
  },
});
export default LeaderboardScreen;
