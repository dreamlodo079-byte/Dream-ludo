import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Share,
  Alert,
} from 'react-native';
import axios from 'axios';

const API_SERVER_URL = process.env.EXPO_PUBLIC_SERVER_URL || 'http://localhost:5000';

interface DashboardScreenProps {
  currentUser: { _id: string; username: string };
  socketId: string | null;
  onMatchFound: (roomId: string) => void;
  onGoToWallet: () => void;
  onGoToLeaderboard: () => void;
  onGoToChallenges: () => void;
}

const ENTRY_FEES = [50, 100, 500, 1000];

export const DashboardScreen: React.FC<DashboardScreenProps> = ({
  currentUser,
  socketId,
  onMatchFound,
  onGoToWallet,
  onGoToLeaderboard,
  onGoToChallenges,
}) => {
  const [selectedTier, setSelectedTier] = useState<number>(50);
  const [isSearching, setIsSearching] = useState(false);
  const [searchTimer, setSearchTimer] = useState(20);
  const [lobbyDetails, setLobbyDetails] = useState<{ roomToken: string; passwordStr: string } | null>(null);

  const handleJoinMatchmaking = async () => {
    if (!socketId) {
      Alert.alert('Connection Error', 'Socket server connection is not ready. Please try again.');
      return;
    }

    setIsSearching(true);
    setSearchTimer(20);

    // Countdown timer simulation for search UI (bot is spawned at exactly 20.00s on the server)
    const countdown = setInterval(() => {
      setSearchTimer((prev) => {
        if (prev <= 1) {
          clearInterval(countdown);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    try {
      const response = await axios.post(`${API_SERVER_URL}/api/payments/matchmaker/join`, {
        userId: currentUser._id,
        username: currentUser.username,
        socketId,
        entryFee: selectedTier,
      });

      if (!response.data.success) {
        clearInterval(countdown);
        setIsSearching(false);
        Alert.alert('Queue Error', response.data.message || 'Failed to join queue.');
      } else {
        // Queue joined successfully, the socket will receive MATCH_START within 20s
        console.log('Joined matchmaking successfully');
      }
    } catch (err: any) {
      clearInterval(countdown);
      setIsSearching(false);
      Alert.alert('Error', err.response?.data?.error || err.message);
    }
  };

  const handleCreatePrivateLobby = () => {
    // Generate secure 6-digit room token and random password string
    const roomToken = Math.floor(100000 + Math.random() * 900000).toString();
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let passwordStr = '';
    for (let i = 0; i < 6; i++) {
      passwordStr += characters.charAt(Math.floor(Math.random() * characters.length));
    }

    setLobbyDetails({ roomToken, passwordStr });
    Alert.alert('Lobby Generated', `Room Code: ${roomToken}\nPassword: ${passwordStr}`);
  };

  const handleShareLobby = async () => {
    if (!lobbyDetails) return;
    try {
      const shareMessage = `🎲 Join my Private Ludo match!\n\nRoom ID: ${lobbyDetails.roomToken}\nPassword: ${lobbyDetails.passwordStr}\nEntry Fee: ${selectedTier} INR\n\nClick link to join directly: https://ludo.platform/join?room=${lobbyDetails.roomToken}&pass=${lobbyDetails.passwordStr}`;
      
      await Share.share({
        message: shareMessage,
      });
    } catch (error: any) {
      Alert.alert('Share Error', error.message);
    }
  };

  const handleCancelSearch = async () => {
    setIsSearching(false);
    // In a production server, we can hit an endpoint to pull the user out of the Redis queue
    console.log('Cancelled search queue');
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>LUDO ARENA</Text>
        <View style={styles.headerRight}>
          <TouchableOpacity style={styles.headerBtn} onPress={onGoToLeaderboard}>
            <Text style={styles.headerBtnText}>🏆</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerBtn} onPress={onGoToChallenges}>
            <Text style={styles.headerBtnText}>🎁</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.walletBtn} onPress={onGoToWallet}>
            <Text style={styles.walletBtnText}>💳 WALLET</Text>
          </TouchableOpacity>
        </View>
      </View>

      <Text style={styles.sectionHeader}>SELECT ENTRY FEE TIER</Text>
      
      <View style={styles.tiersContainer}>
        {ENTRY_FEES.map((fee) => (
          <TouchableOpacity
            key={fee}
            style={[styles.tierCard, selectedTier === fee && styles.selectedTierCard]}
            onPress={() => setSelectedTier(fee)}
            disabled={isSearching}
          >
            <Text style={[styles.tierFeeText, selectedTier === fee && styles.selectedText]}>
              {fee}
            </Text>
            <Text style={[styles.tierUnitText, selectedTier === fee && styles.selectedText]}>
              INR
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {isSearching ? (
        <View style={styles.searchingContainer}>
          <ActivityIndicator size="large" color="#FF4D4D" />
          <Text style={styles.searchingText}>SEARCHING FOR REAL OPPONENTS...</Text>
          <Text style={styles.timerText}>Bot Injection in {searchTimer}s</Text>
          <TouchableOpacity style={styles.cancelBtn} onPress={handleCancelSearch}>
            <Text style={styles.cancelBtnText}>CANCEL</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.actionsContainer}>
          <TouchableOpacity style={styles.primaryActionBtn} onPress={handleJoinMatchmaking}>
            <Text style={styles.primaryActionText}>FIND LIVE MATCH</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.secondaryActionBtn} onPress={handleCreatePrivateLobby}>
            <Text style={styles.secondaryActionText}>CREATE PRIVATE LOBBY</Text>
          </TouchableOpacity>

          {lobbyDetails && (
            <View style={styles.lobbyDetailsCard}>
              <Text style={styles.lobbyHeader}>PRIVATE LOBBY CREATED</Text>
              <Text style={styles.lobbyText}>Room ID: {lobbyDetails.roomToken}</Text>
              <Text style={styles.lobbyText}>Password: {lobbyDetails.passwordStr}</Text>
              
              <TouchableOpacity style={styles.shareBtn} onPress={handleShareLobby}>
                <Text style={styles.shareBtnText}>SHARE VIA WHATSAPP</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F0F12',
    padding: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 40,
  },
  title: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#FFF',
    letterSpacing: 1.5,
  },
  walletBtn: {
    backgroundColor: '#1E1E26',
    borderWidth: 1,
    borderColor: '#303040',
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  walletBtnText: {
    color: '#00E676',
    fontWeight: 'bold',
    fontSize: 13,
  },
  sectionHeader: {
    fontSize: 13,
    color: '#8A8A9E',
    letterSpacing: 1,
    fontWeight: '700',
    marginBottom: 16,
    textAlign: 'center',
  },
  tiersContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 40,
  },
  tierCard: {
    width: '48%',
    backgroundColor: '#16161F',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2D2D3D',
    paddingVertical: 20,
    alignItems: 'center',
    marginBottom: 16,
  },
  selectedTierCard: {
    borderColor: '#FF4D4D',
    backgroundColor: '#FF4D4D15',
  },
  tierFeeText: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFF',
  },
  tierUnitText: {
    fontSize: 12,
    color: '#8C8C9E',
    marginTop: 2,
    fontWeight: '600',
  },
  selectedText: {
    color: '#FF4D4D',
  },
  actionsContainer: {
    marginTop: 10,
  },
  primaryActionBtn: {
    backgroundColor: '#FF4D4D',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: '#FF4D4D',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
  },
  primaryActionText: {
    color: '#FFF',
    fontWeight: 'bold',
    fontSize: 16,
    letterSpacing: 1,
  },
  secondaryActionBtn: {
    backgroundColor: '#1E1E26',
    borderWidth: 1,
    borderColor: '#303040',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginBottom: 20,
  },
  secondaryActionText: {
    color: '#FFF',
    fontWeight: '600',
    fontSize: 15,
  },
  searchingContainer: {
    alignItems: 'center',
    marginTop: 20,
    padding: 24,
    backgroundColor: '#16161F',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#2F2F3E',
  },
  searchingText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: 'bold',
    letterSpacing: 0.5,
    marginTop: 20,
  },
  timerText: {
    color: '#8A8A9E',
    fontSize: 12,
    marginTop: 8,
    marginBottom: 24,
  },
  cancelBtn: {
    backgroundColor: '#303040',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 28,
  },
  cancelBtnText: {
    color: '#FF5252',
    fontWeight: 'bold',
    fontSize: 14,
  },
  lobbyDetailsCard: {
    marginTop: 16,
    backgroundColor: '#1A1A26',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#333346',
  },
  lobbyHeader: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#00E676',
    marginBottom: 10,
    letterSpacing: 1,
  },
  lobbyText: {
    color: '#FFF',
    fontSize: 14,
    marginBottom: 6,
    fontWeight: '500',
  },
  shareBtn: {
    backgroundColor: '#00E676',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    marginTop: 12,
  },
  shareBtnText: {
    color: '#FFF',
    fontWeight: 'bold',
    fontSize: 14,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerBtn: {
    backgroundColor: '#1E1E26',
    borderWidth: 1,
    borderColor: '#303040',
    borderRadius: 20,
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  headerBtnText: {
    fontSize: 16,
  },
});
export default DashboardScreen;
