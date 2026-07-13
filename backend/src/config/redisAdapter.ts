import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { createDuplicateRedisClient } from './redis';

/**
 * Initializes and mounts the socket.io redis-adapter
 * on the socket server instance.
 */
export async function initializeRedisAdapter(io: Server): Promise<void> {
  const pubClient = createDuplicateRedisClient();
  const subClient = createDuplicateRedisClient();

  try {
    await Promise.all([pubClient.connect(), subClient.connect()]);
    io.adapter(createAdapter(pubClient, subClient));
    console.log('Clustered Socket.io Redis adapter initialized successfully.');
  } catch (err) {
    console.error('Failed to initialize Socket.io Redis adapter:', err);
    throw err;
  }
}
