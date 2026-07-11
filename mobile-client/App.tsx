import React, { useState, useEffect } from 'react';
import { SafeAreaView, StyleSheet, StatusBar, View, Text, TouchableOpacity } from 'react-native';
import { useAppAutoUpdate } from './src/hooks/useAppAutoUpdate';
import { useSocket } from './src/hooks/useSocket';
import { AuthWalletScreen } from './src/screens/AuthWalletScreen';
import { DashboardScreen } from './src/screens/DashboardScreen';
import { GameScreen } from './src/screens/GameScreen';
import { LeaderboardScreen } from './src/screens/LeaderboardScreen';
import { ChallengeScreen } from './src/screens/ChallengeScreen';

interface UserProfile {
  _id: string;
  phone: string;
  username: string;
}

export default function App() {
  // 1. Silent Background Over-The-Air Update Engine (OTA)
  useAppAutoUpdate();

  // 2. Authentication & Screen Views state
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [view, setView] = useState<'auth' | 'dashboard' | 'wallet' | 'game' | 'leaderboard' | 'challenges'>('auth');
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);

  // 3. Socket event observer
  const { isConnected, matchState, socket } = useSocket(currentUser ? currentUser._id : null);

  // Listen to Socket Match State shifts to trigger game screen overlay
  useEffect(() => {
    if (matchState && matchState.roomId && !matchState.isTerminated) {
      setActiveRoomId(matchState.roomId);
      setView('game');
    }
  }, [matchState]);

  const handleLoginSuccess = (user: UserProfile) => {
    setCurrentUser(user);
    setView('dashboard');
  };

  const handleLeaveMatch = () => {
    setActiveRoomId(null);
    setView('dashboard');
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setView('auth');
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0F0F12" />
      
      {/* Navigation header for dashboard/wallet screens */}
      {currentUser && view !== 'game' && view !== 'leaderboard' && view !== 'challenges' && (
        <View style={styles.navBar}>
          <TouchableOpacity 
            onPress={() => setView(view === 'wallet' ? 'dashboard' : 'wallet')}
            style={styles.navBtn}
          >
            <Text style={styles.navBtnText}>
              {view === 'wallet' ? '◀ BACK TO ARENA' : '💳 WALLET DETAILS'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={handleLogout} style={styles.logoutBtn}>
            <Text style={styles.logoutBtnText}>LOGOUT</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Screen Router */}
      <View style={styles.screenContainer}>
        {view === 'auth' && (
          <AuthWalletScreen
            currentUser={null}
            onLoginSuccess={handleLoginSuccess}
          />
        )}

        {view === 'wallet' && currentUser && (
          <AuthWalletScreen
            currentUser={currentUser}
            onLoginSuccess={() => {}}
            onLogout={handleLogout}
          />
        )}

        {view === 'dashboard' && currentUser && (
          <DashboardScreen
            currentUser={currentUser}
            socketId={socket?.id || null}
            onMatchFound={(roomId) => {
              setActiveRoomId(roomId);
              setView('game');
            }}
            onGoToWallet={() => setView('wallet')}
            onGoToLeaderboard={() => setView('leaderboard')}
            onGoToChallenges={() => setView('challenges')}
          />
        )}

        {view === 'game' && currentUser && activeRoomId && (
          <GameScreen
            roomId={activeRoomId}
            currentUser={currentUser}
            onLeaveMatch={handleLeaveMatch}
          />
        )}

        {view === 'leaderboard' && currentUser && (
          <LeaderboardScreen
            onBack={() => setView('dashboard')}
          />
        )}

        {view === 'challenges' && currentUser && (
          <ChallengeScreen
            userId={currentUser._id}
            onBack={() => setView('dashboard')}
          />
        )}
      </View>

      {/* Socket connection alert footer (developer helper) */}
      {currentUser && (
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            Server Status: {isConnected ? '🟢 CONNECTED' : '🔴 DISCONNECTED'}
          </Text>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F0F12',
  },
  screenContainer: {
    flex: 1,
  },
  navBar: {
    height: 56,
    backgroundColor: '#16161F',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderColor: '#252533',
  },
  navBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#20202A',
    borderRadius: 6,
  },
  navBtnText: {
    color: '#00E676',
    fontWeight: 'bold',
    fontSize: 12,
  },
  logoutBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  logoutBtnText: {
    color: '#FF5252',
    fontWeight: 'bold',
    fontSize: 12,
  },
  footer: {
    height: 24,
    backgroundColor: '#16161F',
    alignItems: 'center',
    justifyContent: 'center',
    borderTopWidth: 1,
    borderColor: '#252533',
  },
  footerText: {
    fontSize: 10,
    color: '#8A8A9E',
    fontWeight: 'bold',
  },
});
