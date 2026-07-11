import { createClient } from 'redis';
import dotenv from 'dotenv';

dotenv.config();

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

const redisClient = createClient({
  url: REDIS_URL,
});

redisClient.on('error', (err) => console.error('Redis Client Error', err));
redisClient.on('connect', () => console.log('Redis Client connected successfully'));

export const connectRedis = async (): Promise<void> => {
  if (!redisClient.isOpen) {
    await redisClient.connect();
  }
};

export const getRedisClient = () => {
  return redisClient;
};

/**
 * Cache JSON room state in Redis
 */
export const cacheRoomState = async (roomId: string, state: any): Promise<void> => {
  await redisClient.set(`room:${roomId}`, JSON.stringify(state));
};

/**
 * Fetch cached room state from Redis
 */
export const getRoomState = async (roomId: string): Promise<any | null> => {
  const data = await redisClient.get(`room:${roomId}`);
  return data ? JSON.parse(data) : null;
};

/**
 * Delete cached room state
 */
export const deleteRoomState = async (roomId: string): Promise<void> => {
  await redisClient.del(`room:${roomId}`);
};

/**
 * Creates and returns a duplicate Redis client for PubSub clustering.
 */
export const createDuplicateRedisClient = () => {
  const dupClient = createClient({
    url: REDIS_URL,
  });
  dupClient.on('error', (err) => console.error('Redis Duplicate Client Error', err));
  return dupClient;
};
