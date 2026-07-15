import React, { useState, useEffect } from 'react';
import { SafeAreaView, StyleSheet, StatusBar, View, Text, TouchableOpacity, Platform } from 'react-native';
import axios from 'axios';
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
  isKycVerified?: boolean;
  kycStatus?: 'NONE' | 'PENDING' | 'APPROVED' | 'REJECTED';
  kycType?: 'PAN' | 'AADHAAR' | null;
  kycDocumentNumber?: string | null;
  kycName?: string | null;
}

export default function App() {
  // 1. Silent Background Over-The-Air Update Engine (OTA)
  useAppAutoUpdate();

  // 2. Authentication & Screen Views state
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [view, setView] = useState<'auth' | 'dashboard' | 'wallet' | 'game' | 'leaderboard' | 'challenges'>('auth');
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);

  // 3. Socket event observer
  const {
    isConnected,
    matchState,
    winnerInfo,
    alertMessage,
    clearAlert,
    requestRoll,
    requestMove,
    requestForfeit,
    resetMatchState,
    socket,
  } = useSocket(currentUser ? currentUser._id : null);

  // Load session from localStorage on startup
  useEffect(() => {
    if (Platform.OS === 'web') {
      const savedUser = localStorage.getItem('currentUser');
      const savedView = localStorage.getItem('view');
      const savedToken = localStorage.getItem('authToken');
      if (savedUser) {
        setCurrentUser(JSON.parse(savedUser));
        if (savedToken) {
          axios.defaults.headers.common['x-auth-token'] = savedToken;
        }
        setView(savedView === 'game' ? 'dashboard' : (savedView as any) || 'dashboard');
      }
    }
  }, []);

  // Sync view to localStorage on view changes
  useEffect(() => {
    if (Platform.OS === 'web' && currentUser) {
      localStorage.setItem('view', view);
    }
  }, [view, currentUser]);

  // Listen to Socket Match State shifts to trigger game screen overlay
  useEffect(() => {
    if (matchState && matchState.roomId && !matchState.isTerminated) {
      setActiveRoomId(matchState.roomId);
      setView('game');
    }
  }, [matchState]);

  const handleLoginSuccess = (user: UserProfile, token?: string) => {
    setCurrentUser(user);
    setView('dashboard');
    if (Platform.OS === 'web') {
      localStorage.setItem('currentUser', JSON.stringify(user));
      if (token) {
        localStorage.setItem('authToken', token);
        axios.defaults.headers.common['x-auth-token'] = token;
      }
    }
  };

  const handleLeaveMatch = () => {
    resetMatchState();
    setActiveRoomId(null);
    setView('dashboard');
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setView('auth');
    if (Platform.OS === 'web') {
      localStorage.removeItem('currentUser');
      localStorage.removeItem('authToken');
      localStorage.removeItem('view');
    }
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
            onUserUpdate={(updatedUser) => setCurrentUser(updatedUser)}
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
            onLogout={handleLogout}
          />
        )}

        {view === 'game' && currentUser && activeRoomId && (
          <GameScreen
            roomId={activeRoomId}
            currentUser={currentUser}
            onLeaveMatch={handleLeaveMatch}
            matchState={matchState}
            winnerInfo={winnerInfo}
            alertMessage={alertMessage}
            clearAlert={clearAlert}
            requestRoll={requestRoll}
            requestMove={requestMove}
            requestForfeit={requestForfeit}
            isConnected={isConnected}
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
