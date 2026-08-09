import { createClient, RedisClientType } from 'redis';

class RedisService {
  private client: RedisClientType | null = null;
  private isConnected = false;

  constructor() {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    this.client = createClient({ url: redisUrl });

    this.client.on('error', (err) => {
      console.error('Redis error:', err);
      this.isConnected = false;
    });

    this.client.on('connect', () => {
      console.log('Redis connected successfully');
      this.isConnected = true;
    });
  }

  async connect(): Promise<void> {
    if (this.client && !this.isConnected) {
      await this.client.connect();
    }
  }

  async getPresence(userId: string): Promise<string> {
    if (!this.isConnected || !this.client) return 'offline';
    try {
      const presence = await this.client.get(`user:presence:${userId}`);
      return presence || 'offline';
    } catch (err) {
      console.error(`Error getting presence for user ${userId}:`, err);
      return 'offline';
    }
  }

  async setPresence(userId: string, status: 'online' | 'offline'): Promise<void> {
    if (!this.isConnected || !this.client) return;
    try {
      await this.client.set(`user:presence:${userId}`, status);
    } catch (err) {
      console.error(`Error setting presence for user ${userId}:`, err);
    }
  }

  async addUserSocket(userId: string, socketId: string): Promise<void> {
    if (!this.isConnected || !this.client) return;
    try {
      await this.client.sAdd(`user:sockets:${userId}`, socketId);
      await this.setPresence(userId, 'online');
    } catch (err) {
      console.error(`Error adding socket ${socketId} for user ${userId}:`, err);
    }
  }

  async removeUserSocket(userId: string, socketId: string): Promise<void> {
    if (!this.isConnected || !this.client) return;
    try {
      await this.client.sRem(`user:sockets:${userId}`, socketId);
      const remainingSockets = await this.client.sCard(`user:sockets:${userId}`);
      if (remainingSockets === 0) {
        await this.setPresence(userId, 'offline');
      }
    } catch (err) {
      console.error(`Error removing socket ${socketId} for user ${userId}:`, err);
    }
  }

  async getUserSockets(userId: string): Promise<string[]> {
    if (!this.isConnected || !this.client) return [];
    try {
      return await this.client.sMembers(`user:sockets:${userId}`);
    } catch (err) {
      console.error(`Error getting sockets for user ${userId}:`, err);
      return [];
    }
  }

  async clearUserSockets(userId: string): Promise<void> {
    if (!this.isConnected || !this.client) return;
    try {
      await this.client.del(`user:sockets:${userId}`);
      await this.setPresence(userId, 'offline');
    } catch (err) {
      console.error(`Error clearing sockets for user ${userId}:`, err);
    }
  }

  async setCallState(callId: string, state: any): Promise<void> {
    if (!this.isConnected || !this.client) return;
    try {
      await this.client.setEx(`call:state:${callId}`, 3600, JSON.stringify(state)); // expires in 1 hour
    } catch (err) {
      console.error(`Error caching call state for call ${callId}:`, err);
    }
  }

  async getCallState(callId: string): Promise<any | null> {
    if (!this.isConnected || !this.client) return null;
    try {
      const data = await this.client.get(`call:state:${callId}`);
      return data ? JSON.parse(data) : null;
    } catch (err) {
      console.error(`Error getting cached call state for call ${callId}:`, err);
      return null;
    }
  }

  async deleteCallState(callId: string): Promise<void> {
    if (!this.isConnected || !this.client) return;
    try {
      await this.client.del(`call:state:${callId}`);
    } catch (err) {
      console.error(`Error deleting cached call state for call ${callId}:`, err);
    }
  }
}

export const redisService = new RedisService();
