import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { redisService } from '../services/redis.service';
import { registerPresenceHandlers } from './presence.handler';
import { registerChatHandlers } from './chat.handler';
import { registerCallHandlers } from './call.handler';

const JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET!;

export interface AuthenticatedSocket extends Socket {
  user?: {
    id: string;
    username: string;
    email: string;
  };
}

export class SocketManager {
  private io: Server;

  constructor(httpServer: HttpServer) {
    this.io = new Server(httpServer, {
      cors: {
        origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
          if (process.env.NODE_ENV !== 'production') {
            callback(null, true);
          } else {
            const allowed = [process.env.FRONTEND_URL
            ].filter(Boolean) as string[];
            if (!origin || allowed.includes(origin)) {
              callback(null, true);
            } else {
              callback(new Error('Not allowed by CORS'));
            }
          }
        },
        credentials: true,
      },
      pingTimeout: 60000,
      pingInterval: 25000,
    });

    this.initializeMiddleware();
    this.initializeConnection();
  }

  private initializeMiddleware(): void {
    this.io.use((socket: AuthenticatedSocket, next) => {
      const token = socket.handshake.auth?.token || socket.handshake.query?.token;

      if (!token || typeof token !== 'string') {
        return next(new Error('Authentication error. Token required.'));
      }

      try {
        const decoded = jwt.verify(token, JWT_ACCESS_SECRET) as {
          id: string;
          username: string;
          email: string;
        };
        socket.user = decoded;
        next();
      } catch (err) {
        return next(new Error('Authentication error. Invalid or expired token.'));
      }
    });
  }

  private initializeConnection(): void {
    this.io.on('connection', async (socket: AuthenticatedSocket) => {
      const user = socket.user;
      if (!user) return;

      const userId = user.id;
      const socketId = socket.id;

      console.log(`User connected: ${user.username} (${userId}) - Socket: ${socketId}`);

      // 1. Join user-specific room for targeted messages
      await socket.join(`user:${userId}`);

      // 2. Track socket connection in Redis
      await redisService.addUserSocket(userId, socketId);

      // 3. Broadcast online status to contacts
      socket.broadcast.emit('user:presence', {
        userId,
        status: 'online',
        lastSeen: new Date().toISOString(),
      });

      // 4. Register handlers
      registerPresenceHandlers(this.io, socket);
      registerChatHandlers(this.io, socket);
      registerCallHandlers(this.io, socket);

      // Handle disconnection
      socket.on('disconnect', async () => {
        console.log(`User disconnected: ${user.username} - Socket: ${socketId}`);

        // Remove socket from Redis
        await redisService.removeUserSocket(userId, socketId);

        // Check if user has other active connections
        const activeSockets = await redisService.getUserSockets(userId);
        if (activeSockets.length === 0) {
          const offlineTime = new Date();

          // Update DB lastSeen
          try {
            const { prisma } = require('../services/db.service');
            await prisma.user.update({
              where: { id: userId },
              data: { lastSeen: offlineTime },
            });
          } catch (err) {
            console.error('Error updating lastSeen on disconnect:', err);
          }

          // Broadcast offline presence
          this.io.emit('user:presence', {
            userId,
            status: 'offline',
            lastSeen: offlineTime.toISOString(),
          });
        }
      });
    });
  }

  public getIo(): Server {
    return this.io;
  }
}
