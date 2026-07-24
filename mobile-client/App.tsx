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
import { saveUserSession, loadUserSession, saveCurrentView, clearUserSession } from './src/utils/storage';

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
  avatar?: string;
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

  // Load persistent user session on startup across iOS, Android, and Web
  useEffect(() => {
    const initSession = async () => {
      const { user, token, lastView } = await loadUserSession();
      if (user) {
        setCurrentUser(user);
        setView(lastView === 'game' ? 'dashboard' : (lastView as any) || 'dashboard');

        // Refresh profile silently in background
        try {
          const res = await axios.get(`${API_SERVER_URL}/api/users/profile/${user._id}`);
          if (res.data?.user) {
            setCurrentUser(res.data.user);
            await saveUserSession(res.data.user, token || undefined);
          }
        } catch (e) {
          // Keep saved user
        }
      }
    };
    initSession();
  }, []);

  // Sync view changes to persistent storage
  useEffect(() => {
    if (currentUser) {
      saveCurrentView(view);
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

      // If this user has forfeited (hasLeft), treat as terminated locally
      const myPlayer = matchState.players?.find((p: any) => p.id === currentUser?._id);
      if (myPlayer?.hasLeft) {
        if (view !== 'game') {
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

  const handleLoginSuccess = async (user: UserProfile, token?: string) => {
    setCurrentUser(user);
    setView('dashboard');
    await saveUserSession(user, token);
  };

  const handleLeaveMatch = () => {
    resetMatchState();
    setActiveRoomId(null);
    setView('dashboard');
  };

  const handleLogout = async () => {
    setCurrentUser(null);
    setView('auth');
    await clearUserSession();
  };

  const handleUserUpdate = async (updatedUser: any) => {
    setCurrentUser(updatedUser);
    await saveUserSession(updatedUser);
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
            onMatchFound={(roomId: string) => {
              setActiveRoomId(roomId);
              setView('game');
            }}
            onGoToWallet={() => setView('wallet')}
            onGoToLeaderboard={() => setView('leaderboard')}
            onGoToChallenges={() => setView('challenges')}
            onLogout={handleLogout}
            onUserUpdate={handleUserUpdate}
          />
        )}

        {view === 'wallet' && currentUser && (
          <AuthWalletScreen
            currentUser={currentUser}
            onLoginSuccess={handleLoginSuccess}
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

      {/* Bottom Global Navigation Bar */}
      {currentUser && (view === 'dashboard' || view === 'wallet' || view === 'leaderboard' || view === 'challenges') && (
        <View style={styles.navBarWrapper}>
          <View style={styles.navBarCapsule}>
            <TouchableOpacity 
              style={[styles.navTab, view === 'dashboard' && styles.navTabActive]} 
              onPress={() => setView('dashboard')}
              activeOpacity={0.8}
            >
              <Text style={styles.navIcon}>🏠</Text>
              <Text style={[styles.navText, view === 'dashboard' && styles.navTextActive]}>HOME</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.navTab, view === 'challenges' && styles.navTabActive]} 
              onPress={() => setView('challenges')}
              activeOpacity={0.8}
            >
              <Text style={styles.navIcon}>🎯</Text>
              <Text style={[styles.navText, view === 'challenges' && styles.navTextActive]}>TASKS</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.navTab, view === 'leaderboard' && styles.navTabActive]} 
              onPress={() => setView('leaderboard')}
              activeOpacity={0.8}
            >
              <Text style={styles.navIcon}>🏆</Text>
              <Text style={[styles.navText, view === 'leaderboard' && styles.navTextActive]}>RANKS</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.navTab, view === 'wallet' && styles.navTabActive]} 
              onPress={() => setView('wallet')}
              activeOpacity={0.8}
            >
              <Text style={styles.navIcon}>👤</Text>
              <Text style={[styles.navText, view === 'wallet' && styles.navTextActive]}>PROFILE</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
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
  navBarWrapper: {
    position: 'absolute',
    bottom: 20,
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navBarCapsule: {
    flexDirection: 'row',
    backgroundColor: '#0F172A',
    borderRadius: 30,
    paddingHorizontal: 12,
    paddingVertical: 8,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
    elevation: 10,
    gap: 8,
    maxWidth: 400,
    width: '90%',
  },
  navTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 22,
    gap: 6,
  },
  navTabActive: {
    backgroundColor: '#4F46E5',
  },
  navIcon: {
    fontSize: 16,
  },
  navText: {
    color: '#94A3B8',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  navTextActive: {
    color: '#FFFFFF',
  },
});
