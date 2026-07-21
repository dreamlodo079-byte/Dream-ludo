import React, { useState, useEffect, useCallback } from 'react';
import { SafeAreaView, StyleSheet, StatusBar, View, Text, TouchableOpacity, Platform } from 'react-native';
import axios from 'axios';
import { useOTAUpdates } from './src/hooks/useOTAUpdates';
import { useSocket } from './src/hooks/useSocket';
import { AuthWalletScreen } from './src/screens/AuthWalletScreen';
import { DashboardScreen } from './src/screens/DashboardScreen';
import { GameScreen } from './src/screens/GameScreen';
import { LeaderboardScreen } from './src/screens/LeaderboardScreen';
import { ChallengeScreen } from './src/screens/ChallengeScreen';
import { WalletProvider, useWallet } from './src/hooks/useWallet';
import { MatchmakingCardOverlay } from './src/components/MatchmakingCardOverlay';
import { CustomToast, ToastOptions } from './src/components/CustomToast';
import { CustomAlertModal, CustomAlertOptions } from './src/components/CustomAlertModal';

const API_SERVER_URL = process.env.EXPO_PUBLIC_SERVER_URL || 'http://localhost:5000';

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
  useOTAUpdates();

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
    matchFoundData,
    handshakeTimeoutData,
    sendReadyToEnter,
    clearMatchFoundData,
    clearHandshakeTimeoutData,
    setWinnerInfo,
  } = useSocket(currentUser ? currentUser._id : null);

  const [showOverlay, setShowOverlay] = useState(false);
  const [matchedOpponent, setMatchedOpponent] = useState<any>(null);
  const [toast, setToast] = useState<ToastOptions>({ visible: false, message: '', type: 'info' });

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

  // Listen for MATCH_FOUND_ACK from socket
  useEffect(() => {
    if (matchFoundData) {
      setShowOverlay(true);
      sendReadyToEnter(matchFoundData.roomId);
    }
  }, [matchFoundData, sendReadyToEnter]);

  // Listen for MATCH_HANDSHAKE_TIMEOUT from socket
  useEffect(() => {
    if (handshakeTimeoutData) {
      setShowOverlay(false);
      setMatchedOpponent(null);
      clearMatchFoundData();
      setToast({
        visible: true,
        message: handshakeTimeoutData.reason || 'Matchmaking handshake timed out.',
        type: 'error',
      });
      clearHandshakeTimeoutData();
    }
  }, [handshakeTimeoutData, clearMatchFoundData, clearHandshakeTimeoutData]);

  // Listen to active MatchState status transitions
  useEffect(() => {
    if (matchState && matchState.roomId) {
      if (matchState.isTerminated) {
        if (view !== 'game') {
          setShowOverlay(false);
          setMatchedOpponent(null);
          clearMatchFoundData();
          resetMatchState();
        }
        return;
      }

      if (matchState.status === 'ACTIVE') {
        if (showOverlay) {
          // Handshake succeeded! Reveal opponent details inside overlay first
          const opp = matchState.players.find((p: any) => p.id !== currentUser?._id);
          setMatchedOpponent(opp || { username: 'Opponent' });
        } else {
          // For reconnections or private games without public matchmaker gate
          setActiveRoomId(matchState.roomId);
          setView('game');
        }
      }
    }
  }, [matchState, showOverlay, currentUser, view]);

  const handleOverlayComplete = useCallback(() => {
    setShowOverlay(false);
    setMatchedOpponent(null);
    clearMatchFoundData();
    if (matchState) {
      setActiveRoomId(matchState.roomId);
      setView('game');
    }
  }, [matchState, clearMatchFoundData]);

  const handleOverlayCancel = useCallback(async () => {
    setShowOverlay(false);
    setMatchedOpponent(null);
    const tempRoom = matchFoundData;
    clearMatchFoundData();
    if (tempRoom && currentUser) {
      try {
        await axios.post(`${API_SERVER_URL}/api/payments/matchmaker/leave`, {
          userId: currentUser._id,
          entryFee: tempRoom.entryFee,
        });
      } catch (err) {
        console.warn('Failed to cancel matchmaking from overlay:', err);
      }
    }
  }, [matchFoundData, currentUser, clearMatchFoundData]);

  // 4. Refetch wallet balance when game ends
  useEffect(() => {
    if (winnerInfo && currentUser) {
      fetchWallet(currentUser._id);
    }
  }, [winnerInfo, currentUser, fetchWallet]);

  const handleLoginSuccess = (user: UserProfile, token?: string) => {
    setCurrentUser(user);
    setView('dashboard');
    if (token) {
      axios.defaults.headers.common['x-auth-token'] = token;
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    }
    if (Platform.OS === 'web') {
      localStorage.setItem('currentUser', JSON.stringify(user));
      if (token) {
        localStorage.setItem('authToken', token);
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
            socket={socket}
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
            setWinnerInfo={setWinnerInfo}
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

      {/* Matchmaking Handshake Card Overlay */}
      <MatchmakingCardOverlay
        visible={showOverlay}
        opponent={matchedOpponent}
        onCancel={handleOverlayCancel}
        onAnimationComplete={handleOverlayComplete}
        durationSeconds={30}
        entryFee={matchFoundData?.entryFee}
      />
      {/* Top Floating Toast Notification */}
      <CustomToast
        toast={toast}
        onDismiss={() => setToast((prev) => ({ ...prev, visible: false }))}
      />
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
