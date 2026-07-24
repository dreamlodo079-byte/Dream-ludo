import { useEffect, useRef, useState, useCallback } from 'react';
import io, { Socket } from 'socket.io-client';
import SoundManager from '../utils/SoundManager';

const SOCKET_SERVER_URL = process.env.EXPO_PUBLIC_SERVER_URL || 'http://localhost:5000';

export const useSocket = (userId: string | null) => {
  const socketRef = useRef<Socket | null>(null);
  const isInMatchRef = useRef(false);
  const [isConnected, setIsConnected] = useState(false);
  const [matchState, setMatchState] = useState<any>(null);
  const [diceRollInfo, setDiceRollInfo] = useState<any>(null);
  const [tokenMoveInfo, setTokenMoveInfo] = useState<any>(null);
  const [winnerInfo, setWinnerInfo] = useState<any>(null);
  const [alertMessage, setAlertMessage] = useState<string | null>(null);
  const [matchFoundData, setMatchFoundData] = useState<any>(null);
  const [handshakeTimeoutData, setHandshakeTimeoutData] = useState<any>(null);

  useEffect(() => {
    if (!userId) return;

    // Establish Socket connection
    const socket = io(SOCKET_SERVER_URL);
    socketRef.current = socket;

    const handleConnect = () => {
      setIsConnected(true);
      console.log('Connected to game server:', socket.id);
      // Register player user ID to bind reconnections
      socket.emit('REGISTER_USER', { userId });
    };

    if (socket.connected) {
      handleConnect();
    }

    socket.on('connect', handleConnect);

    socket.on('disconnect', () => {
      setIsConnected(false);
      console.log('Disconnected from game server');
    });

    socket.on('MATCH_START', ({ roomId, state }: { roomId: string; state: any }) => {
      console.log('Match started in room:', roomId);
      isInMatchRef.current = true;
      setMatchState(state);
      setWinnerInfo(null);
    });

    socket.on('MATCH_STATE_UPDATE', (state: any) => {
      setMatchState(state);
    });

    socket.on('DICE_ROLLED', (data: any) => {
      setDiceRollInfo(data);
      setMatchState(data.state);
    });

    socket.on('TOKEN_MOVED', (data: any) => {
      setTokenMoveInfo(data);
      setMatchState(data.state);
    });

    socket.on('TURN_SKIPPED', (data: any) => {
      setAlertMessage('Turn skipped due to inactivity.');
      setMatchState(data.state);
      if (data.skippedPlayerId === userId) {
        SoundManager.playLoseHeart();
      }
    });

    socket.on('TIMER_TICK', (data: { turnTimer: number; activePlayerIndex: number; matchTimer?: number; scores?: number[] }) => {
      setMatchState((prev: any) => {
        if (!prev) return prev;
        return {
          ...prev,
          turnTimer: data.turnTimer,
          activePlayerIndex: data.activePlayerIndex,
          matchTimer: data.matchTimer !== undefined ? data.matchTimer : prev.matchTimer,
          scores: data.scores !== undefined ? data.scores : prev.scores,
        };
      });
    });

    socket.on('SYSTEM_ALERT', (data: { message: string }) => {
      setAlertMessage(data.message);
    });

    socket.on('MATCH_TERMINATED', (data: any) => {
      console.log('Match terminated:', data);
      if (isInMatchRef.current) {
        setWinnerInfo(data);
      }
    });

    socket.on('ERROR', (data: { message: string }) => {
      setAlertMessage(`Error: ${data.message}`);
    });

    socket.on('MATCH_FOUND_ACK', (data: any) => {
      console.log('Match found ACK received:', data);
      setMatchFoundData(data);
    });

    socket.on('START_MATCH_GAME', ({ roomId, state }: { roomId: string; state: any }) => {
      console.log('Match start game received:', roomId);
      isInMatchRef.current = true;
      setMatchState(state);
      setWinnerInfo(null);
    });

    socket.on('MATCH_HANDSHAKE_TIMEOUT', (data: any) => {
      console.log('Match handshake timeout:', data);
      setHandshakeTimeoutData(data);
    });

    return () => {
      socket.disconnect();
    };
  }, [userId]);

  const requestRoll = useCallback((roomId: string) => {
    if (socketRef.current) {
      socketRef.current.emit('REQUEST_ROLL', { roomId });
    }
  }, []);

  const requestMove = useCallback((roomId: string, tokenIndex: number) => {
    if (socketRef.current) {
      socketRef.current.emit('REQUEST_MOVE', { roomId, tokenIndex });
    }
  }, []);

  const requestForfeit = useCallback((roomId: string) => {
    if (socketRef.current) {
      socketRef.current.emit('FORFEIT_MATCH', { roomId });
    }
  }, []);

  const clearAlert = useCallback(() => {
    setAlertMessage(null);
  }, []);

  const resetMatchState = useCallback(() => {
    isInMatchRef.current = false;
    setMatchState(null);
    setWinnerInfo(null);
    setDiceRollInfo(null);
    setTokenMoveInfo(null);
    setMatchFoundData(null);
    setHandshakeTimeoutData(null);
  }, []);

  const sendReadyToEnter = useCallback((roomId: string) => {
    if (socketRef.current) {
      socketRef.current.emit('READY_TO_ENTER', { roomId });
    }
  }, []);

  const clearMatchFoundData = useCallback(() => {
    setMatchFoundData(null);
  }, []);

  const clearHandshakeTimeoutData = useCallback(() => {
    setHandshakeTimeoutData(null);
  }, []);

  return {
    socket: socketRef.current,
    isConnected,
    matchState,
    diceRollInfo,
    tokenMoveInfo,
    winnerInfo,
    alertMessage,
    clearAlert,
    requestRoll,
    requestMove,
    requestForfeit,
    resetMatchState,
    matchFoundData,
    handshakeTimeoutData,
    sendReadyToEnter,
    clearMatchFoundData,
    clearHandshakeTimeoutData,
    setWinnerInfo,
  };
};
