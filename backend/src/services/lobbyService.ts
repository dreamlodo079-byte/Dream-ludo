import { getRedisClient } from '../config/redis';
import { getIO } from './socketManager';

const LOBBY_TIERS = [3, 5, 10, 25, 50, 100, 250, 500];
let lobbyInterval: NodeJS.Timeout | null = null;

export const startLobbyBroadcaster = (): void => {
  if (lobbyInterval) return;

  lobbyInterval = setInterval(async () => {
    const redis = getRedisClient();
    const io = getIO();
    if (!redis || !io) return;

    // Skip Redis queries completely if no sockets are connected
    if (io.engine && io.engine.clientsCount === 0) return;

    try {
      const delta: Record<string, { waiting: number; playing: number }> = {};

      for (const tier of LOBBY_TIERS) {
        // 1. Get waiting count from Redis queue sizes
        const quickQueueKey = `queue:tier_${tier}_mode_QUICK`;
        const regularQueueKey = `queue:tier_${tier}_mode_REGULAR`;

        const waitingQuick = await redis.lLen(quickQueueKey).catch(() => 0);
        const waitingRegular = await redis.lLen(regularQueueKey).catch(() => 0);
        const waiting = waitingQuick + waitingRegular;

        // 2. Get playing count from Redis counters
        const playingStr = await redis.get(`lobby:playing_count:${tier}`).catch(() => null);
        const playing = playingStr ? parseInt(playingStr, 10) : 0;

        delta[tier] = {
          waiting,
          playing: Math.max(0, playing)
        };
      }

      // Broadcast delta changes to all connected sockets
      io.emit('LOBBY_STATE_DELTA', { success: true, delta });
    } catch (err) {
      console.error('Lobby state broadcaster tick error:', err);
    }
  }, 5000); // 5 seconds interval (saves 80% Redis commands)
};

export const incrementPlayingCount = async (tier: number, increment: number): Promise<void> => {
  const redis = getRedisClient();
  if (!redis) return;
  const key = `lobby:playing_count:${tier}`;
  
  try {
    if (typeof redis.incrBy === 'function') {
      await redis.incrBy(key, increment);
    } else {
      const current = parseInt((await redis.get(key)) || '0', 10);
      await redis.set(key, String(current + increment));
    }
  } catch (err) {
    console.error(`Failed to increment playing count for tier ${tier}:`, err);
  }
};

export const decrementPlayingCount = async (tier: number, decrement: number): Promise<void> => {
  await incrementPlayingCount(tier, -decrement);
};
