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
      Alert.alert('Error', 'Failed to retrieve global leaderboard statistics');
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
        <Text style={styles.headerTitle}>LEADERBOARD</Text>
        <View style={styles.placeholder} />
      </View>

      {/* Tabs */}
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
          <ActivityIndicator size="large" color="#FFD600" />
          <Text style={styles.loadingText}>CALCULATING TOP EARNERS...</Text>
        </View>
      ) : (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
          {/* Top 3 Podium Graphic */}
          <View style={styles.podiumContainer}>
            {/* 2nd Place */}
            <View style={styles.podiumColumn}>
              {top2 ? (
                <View style={styles.podiumUserCard}>
                  <Text style={styles.podiumUserText} numberOfLines={1}>{top2.username}</Text>
                  <Text style={styles.podiumEarningsText}>{top2.netEarnings.toFixed(0)} INR</Text>
                </View>
              ) : (
                <View style={styles.podiumUserCard} />
              )}
              <View style={[styles.podiumBase, styles.silverBase]}>
                <Text style={styles.podiumRankText}>2</Text>
              </View>
            </View>

            {/* 1st Place */}
            <View style={[styles.podiumColumn, styles.firstPlaceColumn]}>
              {top1 ? (
                <View style={styles.podiumUserCard}>
                  <Text style={styles.crownText}>👑</Text>
                  <Text style={[styles.podiumUserText, styles.goldText]} numberOfLines={1}>{top1.username}</Text>
                  <Text style={styles.podiumEarningsText}>{top1.netEarnings.toFixed(0)} INR</Text>
                </View>
              ) : (
                <View style={styles.podiumUserCard} />
              )}
              <View style={[styles.podiumBase, styles.goldBase]}>
                <Text style={styles.podiumRankText}>1</Text>
              </View>
            </View>

            {/* 3rd Place */}
            <View style={styles.podiumColumn}>
              {top3 ? (
                <View style={styles.podiumUserCard}>
                  <Text style={styles.podiumUserText} numberOfLines={1}>{top3.username}</Text>
                  <Text style={styles.podiumEarningsText}>{top3.netEarnings.toFixed(0)} INR</Text>
                </View>
              ) : (
                <View style={styles.podiumUserCard} />
              )}
              <View style={[styles.podiumBase, styles.bronzeBase]}>
                <Text style={styles.podiumRankText}>3</Text>
              </View>
            </View>
          </View>

          {/* Rank 4 - 50 List */}
          <View style={styles.listContainer}>
            {scrollUsers.length === 0 && users.length <= 3 && (
              <Text style={styles.emptyText}>No users logged in this timeframe.</Text>
            )}
            {scrollUsers.map((user, index) => {
              const rank = index + 4;
              return (
                <View key={user._id} style={styles.rankRow}>
                  <View style={styles.rankLeft}>
                    <Text style={styles.rankNumber}>{rank}</Text>
                    <Text style={styles.rankName} numberOfLines={1}>{user.username}</Text>
                  </View>
                  <Text style={styles.rankEarnings}>{user.netEarnings.toFixed(2)} INR</Text>
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
  tabsContainer: {
    flexDirection: 'row',
    backgroundColor: '#16161F',
    padding: 6,
    borderBottomWidth: 1,
    borderColor: '#252533',
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 8,
  },
  activeTab: {
    backgroundColor: '#2A2A3A',
  },
  tabText: {
    color: '#8A8A9E',
    fontWeight: '700',
    fontSize: 13,
  },
  activeTabText: {
    color: '#FFD600',
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
    paddingBottom: 30,
  },
  podiumContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'flex-end',
    height: 230,
    paddingHorizontal: 16,
    marginTop: 15,
    marginBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#20202C',
    paddingBottom: 25,
  },
  podiumColumn: {
    width: '28%',
    alignItems: 'center',
  },
  firstPlaceColumn: {
    width: '32%',
    marginHorizontal: 10,
  },
  podiumUserCard: {
    alignItems: 'center',
    marginBottom: 8,
    height: 70,
    justifyContent: 'flex-end',
  },
  podiumUserText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
  goldText: {
    color: '#FFD600',
    fontSize: 13,
  },
  podiumEarningsText: {
    color: '#00E676',
    fontSize: 11,
    fontWeight: '700',
    marginTop: 2,
  },
  crownText: {
    fontSize: 20,
    marginBottom: 2,
  },
  podiumBase: {
    width: '100%',
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  goldBase: {
    height: 100,
    backgroundColor: '#FFD60022',
    borderWidth: 2,
    borderColor: '#FFD600',
  },
  silverBase: {
    height: 80,
    backgroundColor: '#B0BEC522',
    borderWidth: 1.5,
    borderColor: '#B0BEC5',
  },
  bronzeBase: {
    height: 60,
    backgroundColor: '#FF8A6522',
    borderWidth: 1.5,
    borderColor: '#FF8A65',
  },
  podiumRankText: {
    color: '#FFF',
    fontSize: 24,
    fontWeight: 'bold',
    opacity: 0.8,
  },
  listContainer: {
    paddingHorizontal: 16,
  },
  emptyText: {
    color: '#6E6E7E',
    textAlign: 'center',
    paddingVertical: 20,
  },
  rankRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#16161F',
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#252533',
  },
  rankLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rankNumber: {
    color: '#8A8A9E',
    fontSize: 14,
    fontWeight: 'bold',
    width: 30,
  },
  rankName: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '600',
  },
  rankEarnings: {
    color: '#00E676',
    fontSize: 14,
    fontWeight: '700',
  },
});
export default LeaderboardScreen;
