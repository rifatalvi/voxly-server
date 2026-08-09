import { Server } from 'socket.io';
import { AuthenticatedSocket } from './socket.manager';
import { redisService } from '../services/redis.service';

export const registerPresenceHandlers = (io: Server, socket: AuthenticatedSocket) => {
  socket.on('user:get-presence', async ({ userId }: { userId: string }, callback) => {
    try {
      const presence = await redisService.getPresence(userId);
      callback({ success: true, presence });
    } catch (err) {
      console.error(`Error handling user:get-presence for ${userId}:`, err);
      callback({ success: false, error: 'Failed to fetch presence' });
    }
  });
};
