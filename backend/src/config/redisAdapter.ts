import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { createDuplicateRedisClient } from './redis';

/**
 * Initializes and mounts the socket.io redis-adapter
 * on the socket server instance.
 */
export async function initializeRedisAdapter(io: Server): Promise<void> {
  try {
    const pubClient = createDuplicateRedisClient();
    const subClient = createDuplicateRedisClient();
    await Promise.all([pubClient.connect(), subClient.connect()]);
    io.adapter(createAdapter(pubClient, subClient));
    console.log('Clustered Socket.io Redis adapter initialized successfully.');
  } catch (err: any) {
    console.log('Redis adapter offline: Running Socket.io in single-node local mode.');
  }
}
