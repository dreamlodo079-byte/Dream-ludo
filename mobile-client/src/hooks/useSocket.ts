import { useEffect, useRef, useState, useCallback } from 'react';
import io, { Socket } from 'socket.io-client';
import SoundManager from '../utils/SoundManager';

import { API_SERVER_URL as SOCKET_SERVER_URL } from '../utils/config';

export const useSocket = (userId: string | null) => {
  const socketRef = useRef<Socket | null>(null);
  const isInMatchRef = useRef(false);
  const [isConnected, setIsConnected] = useState(false);
  const [pingLatency, setPingLatency] = useState<number | null>(null);
  const [matchState, setMatchState] = useState<any>(null);
  const [diceRollInfo, setDiceRollInfo] = useState<any>(null);
  const [tokenMoveInfo, setTokenMoveInfo] = useState<any>(null);
  const [winnerInfo, setWinnerInfo] = useState<any>(null);
  const [alertMessage, setAlertMessage] = useState<string | null>(null);
  const [matchFoundData, setMatchFoundData] = useState<any>(null);
  const [handshakeTimeoutData, setHandshakeTimeoutData] = useState<any>(null);

  useEffect(() => {
    if (!userId) return;

    // Establish Socket connection with WebSocket priority & auto-reconnect
    const socket = io(SOCKET_SERVER_URL, {
      transports: ['websocket'], // Force native WebSockets on Android (bypasses CORS polling issues)
      reconnection: true,
      reconnectionAttempts: 20,
      reconnectionDelay: 1000,
      timeout: 10000,
      autoConnect: true,
    });
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
      setPingLatency(null);
      console.log('Disconnected from game server');
    });

    // Measure live socket ping latency every 3 seconds
    const pingInterval = setInterval(() => {
      if (socketRef.current && socketRef.current.connected) {
        const start = Date.now();
        socketRef.current.emit('PING_LATENCY', () => {
          setPingLatency(Date.now() - start);
        });
      }
    }, 3000);

    return () => {
      clearInterval(pingInterval);
      socket.disconnect();
    };

    const updateMatchStatePreservingTimer = (newState: any) => {
      setMatchState((prev: any) => {
        if (!prev || !newState) return newState;
        const prevTimer = prev.matchTimer;
        const newTimer = newState.matchTimer;
        let effectiveTimer = newTimer;
        if (typeof prevTimer === 'number' && typeof newTimer === 'number' && newTimer > prevTimer) {
          effectiveTimer = prevTimer;
        }
        return {
          ...newState,
          matchTimer: effectiveTimer,
        };
      });
    };

    socket.on('MATCH_START', ({ roomId, state }: { roomId: string; state: any }) => {
      console.log('Match started in room:', roomId);
      isInMatchRef.current = true;
      setMatchState(state);
      setWinnerInfo(null);
      // Immediately send handshake readiness signal so server starts turn countdown timer
      socket.emit('READY_TO_ENTER', { roomId });
    });

    socket.on('MATCH_STATE_UPDATE', (state: any) => {
      updateMatchStatePreservingTimer(state);
    });

    socket.on('DICE_ROLLED', (data: any) => {
      setDiceRollInfo(data);
      updateMatchStatePreservingTimer(data.state);
    });

    socket.on('TOKEN_MOVED', (data: any) => {
      setTokenMoveInfo(data);
      updateMatchStatePreservingTimer(data.state);
    });

    socket.on('TURN_SKIPPED', (data: any) => {
      setAlertMessage('Turn skipped due to inactivity.');
      updateMatchStatePreservingTimer(data.state);
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
    pingLatency,
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
