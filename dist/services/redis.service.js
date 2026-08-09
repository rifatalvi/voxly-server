"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.redisService = void 0;
const redis_1 = require("redis");
class RedisService {
    client = null;
    isConnected = false;
    constructor() {
        const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
        this.client = (0, redis_1.createClient)({ url: redisUrl });
        this.client.on('error', (err) => {
            console.error('Redis error:', err);
            this.isConnected = false;
        });
        this.client.on('connect', () => {
            console.log('Redis connected successfully');
            this.isConnected = true;
        });
    }
    async connect() {
        if (this.client && !this.isConnected) {
            await this.client.connect();
        }
    }
    async getPresence(userId) {
        if (!this.isConnected || !this.client)
            return 'offline';
        try {
            const presence = await this.client.get(`user:presence:${userId}`);
            return presence || 'offline';
        }
        catch (err) {
            console.error(`Error getting presence for user ${userId}:`, err);
            return 'offline';
        }
    }
    async setPresence(userId, status) {
        if (!this.isConnected || !this.client)
            return;
        try {
            await this.client.set(`user:presence:${userId}`, status);
        }
        catch (err) {
            console.error(`Error setting presence for user ${userId}:`, err);
        }
    }
    async addUserSocket(userId, socketId) {
        if (!this.isConnected || !this.client)
            return;
        try {
            await this.client.sAdd(`user:sockets:${userId}`, socketId);
            await this.setPresence(userId, 'online');
        }
        catch (err) {
            console.error(`Error adding socket ${socketId} for user ${userId}:`, err);
        }
    }
    async removeUserSocket(userId, socketId) {
        if (!this.isConnected || !this.client)
            return;
        try {
            await this.client.sRem(`user:sockets:${userId}`, socketId);
            const remainingSockets = await this.client.sCard(`user:sockets:${userId}`);
            if (remainingSockets === 0) {
                await this.setPresence(userId, 'offline');
            }
        }
        catch (err) {
            console.error(`Error removing socket ${socketId} for user ${userId}:`, err);
        }
    }
    async getUserSockets(userId) {
        if (!this.isConnected || !this.client)
            return [];
        try {
            return await this.client.sMembers(`user:sockets:${userId}`);
        }
        catch (err) {
            console.error(`Error getting sockets for user ${userId}:`, err);
            return [];
        }
    }
    async clearUserSockets(userId) {
        if (!this.isConnected || !this.client)
            return;
        try {
            await this.client.del(`user:sockets:${userId}`);
            await this.setPresence(userId, 'offline');
        }
        catch (err) {
            console.error(`Error clearing sockets for user ${userId}:`, err);
        }
    }
    async setCallState(callId, state) {
        if (!this.isConnected || !this.client)
            return;
        try {
            await this.client.setEx(`call:state:${callId}`, 3600, JSON.stringify(state)); // expires in 1 hour
        }
        catch (err) {
            console.error(`Error caching call state for call ${callId}:`, err);
        }
    }
    async getCallState(callId) {
        if (!this.isConnected || !this.client)
            return null;
        try {
            const data = await this.client.get(`call:state:${callId}`);
            return data ? JSON.parse(data) : null;
        }
        catch (err) {
            console.error(`Error getting cached call state for call ${callId}:`, err);
            return null;
        }
    }
    async deleteCallState(callId) {
        if (!this.isConnected || !this.client)
            return;
        try {
            await this.client.del(`call:state:${callId}`);
        }
        catch (err) {
            console.error(`Error deleting cached call state for call ${callId}:`, err);
        }
    }
}
exports.redisService = new RedisService();
