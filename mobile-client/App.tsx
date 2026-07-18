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
import { WalletProvider, useWallet } from './src/hooks/useWallet';

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
  return (
    <WalletProvider>
      <AppContent />
    </WalletProvider>
  );
}

function AppContent() {
  // 1. Silent Background Over-The-Air Update Engine (OTA)
  useAppAutoUpdate();

  const { fetchWallet } = useWallet();

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

  // 4. Refetch wallet balance when game ends
  useEffect(() => {
    if (winnerInfo && currentUser) {
      fetchWallet(currentUser._id);
    }
  }, [winnerInfo, currentUser, fetchWallet]);

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

  const handleUserUpdate = (updatedUser: any) => {
    setCurrentUser(updatedUser);
    if (Platform.OS === 'web') {
      localStorage.setItem('currentUser', JSON.stringify(updatedUser));
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F3F4F6" />
      
      {/* Screen Router */}
      <View style={styles.screenContainer}>
        {view === 'auth' && (
          <AuthWalletScreen
            currentUser={null}
            onLoginSuccess={handleLoginSuccess}
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
            onGoToWallet={() => {}}
            onGoToLeaderboard={() => setView('leaderboard')}
            onGoToChallenges={() => setView('challenges')}
            onLogout={handleLogout}
            onUserUpdate={handleUserUpdate}
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

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3F4F6', // Premium Light Theme Canvas
  },
  screenContainer: {
    flex: 1,
    width: '100%',
    maxWidth: 600,
    alignSelf: 'center',
  },
});
