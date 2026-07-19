import { createClient } from 'redis';
import dotenv from 'dotenv';

dotenv.config();

const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

class InMemRedisStore {
  isOpen = true;
  private store = new Map<string, string>();
  private lists = new Map<string, string[]>();

  async connect() { this.isOpen = true; }
  async get(key: string) { return this.store.get(key) || null; }
  async set(key: string, val: string, opts?: any) {
    if (opts?.NX && this.store.has(key)) {
      return null;
    }
    this.store.set(key, val);
    if (opts?.PX) {
      setTimeout(() => this.store.delete(key), opts.PX);
    }
    if (opts?.EX) {
      setTimeout(() => this.store.delete(key), opts.EX * 1000);
    }
    return 'OK';
  }
  async del(key: string) { 
    const deletedStore = this.store.delete(key);
    const deletedList = this.lists.delete(key);
    return (deletedStore || deletedList) ? 1 : 0; 
  }
  async keys(pattern: string) {
    const regexPattern = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
    const matchedKeys: string[] = [];
    for (const key of this.store.keys()) {
      if (regexPattern.test(key)) matchedKeys.push(key);
    }
    for (const key of this.lists.keys()) {
      if (regexPattern.test(key) && !matchedKeys.includes(key)) {
        matchedKeys.push(key);
      }
    }
    return matchedKeys;
  }
  async incr(key: string) {
    return this.incrBy(key, 1);
  }
  async incrBy(key: string, increment: number) {
    const val = Number(this.store.get(key) || 0) + increment;
    this.store.set(key, String(val));
    return val;
  }
  async decr(key: string) {
    return this.incrBy(key, -1);
  }
  async decrBy(key: string, decrement: number) {
    return this.incrBy(key, -decrement);
  }
  async expire(key: string, seconds: number) {
    setTimeout(() => {
      this.store.delete(key);
      this.lists.delete(key);
    }, seconds * 1000);
    return 1;
  }
  async rPush(key: string, val: string) {
    if (!this.lists.has(key)) this.lists.set(key, []);
    this.lists.get(key)!.push(val);
    return this.lists.get(key)!.length;
  }
  async lPop(key: string) {
    const list = this.lists.get(key);
    if (!list || list.length === 0) return null;
    return list.shift() || null;
  }
  async lIndex(key: string, idx: number) {
    const list = this.lists.get(key);
    if (!list || idx < 0 || idx >= list.length) return null;
    return list[idx];
  }
  async lLen(key: string) {
    return this.lists.get(key)?.length || 0;
  }
  async lRange(key: string, start: number, stop: number) {
    const list = this.lists.get(key) || [];
    if (stop === -1) return list.slice(start);
    return list.slice(start, stop + 1);
  }
  async lRem(key: string, _count: number, val: string) {
    const list = this.lists.get(key);
    if (!list) return 0;
    let removed = 0;
    const newList = list.filter((item) => {
      if (item === val) {
        removed++;
        return false;
      }
      return true;
    });
    this.lists.set(key, newList);
    return removed;
  }
}

let activeRedisClient: any = createClient({
  url: REDIS_URL,
});

activeRedisClient.on('error', (_err: any) => {
  // Silent warning for local fallback
});
activeRedisClient.on('connect', () => console.log('Redis Client connected successfully'));

export const connectRedis = async (): Promise<void> => {
  try {
    if (!activeRedisClient.isOpen) {
      await Promise.race([
        activeRedisClient.connect(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Redis timeout')), 1500)),
      ]);
    }
  } catch (err) {
    console.log('Local Redis server offline: Switched to In-Memory Redis Engine.');
    activeRedisClient = new InMemRedisStore();
  }
};

export const getRedisClient = () => {
  return activeRedisClient;
};

/**
 * Cache JSON room state in Redis
 */
export const cacheRoomState = async (roomId: string, state: any): Promise<void> => {
  await activeRedisClient.set(`room:${roomId}`, JSON.stringify(state));
};

/**
 * Fetch cached room state from Redis
 */
export const getRoomState = async (roomId: string): Promise<any | null> => {
  const data = await activeRedisClient.get(`room:${roomId}`);
  return data ? JSON.parse(data) : null;
};

/**
 * Delete cached room state
 */
export const deleteRoomState = async (roomId: string): Promise<void> => {
  await activeRedisClient.del(`room:${roomId}`);
};

/**
 * Creates and returns a duplicate Redis client for PubSub clustering.
 */
export const createDuplicateRedisClient = () => {
  const dupClient = createClient({
    url: REDIS_URL,
  });
  dupClient.on('error', () => {});
  return dupClient;
};
