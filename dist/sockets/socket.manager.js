"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SocketManager = void 0;
const socket_io_1 = require("socket.io");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const redis_service_1 = require("../services/redis.service");
const presence_handler_1 = require("./presence.handler");
const chat_handler_1 = require("./chat.handler");
const call_handler_1 = require("./call.handler");
const JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'voxly_secret_access_token_sign_key_987654321';
class SocketManager {
    io;
    constructor(httpServer) {
        this.io = new socket_io_1.Server(httpServer, {
            cors: {
                origin: [
                    'http://localhost:3000',
                    process.env.FRONTEND_URL
                ].filter(Boolean),
                credentials: true,
            },
            pingTimeout: 60000,
            pingInterval: 25000,
        });
        this.initializeMiddleware();
        this.initializeConnection();
    }
    initializeMiddleware() {
        this.io.use((socket, next) => {
            const token = socket.handshake.auth?.token || socket.handshake.query?.token;
            if (!token || typeof token !== 'string') {
                return next(new Error('Authentication error. Token required.'));
            }
            try {
                const decoded = jsonwebtoken_1.default.verify(token, JWT_ACCESS_SECRET);
                socket.user = decoded;
                next();
            }
            catch (err) {
                return next(new Error('Authentication error. Invalid or expired token.'));
            }
        });
    }
    initializeConnection() {
        this.io.on('connection', async (socket) => {
            const user = socket.user;
            if (!user)
                return;
            const userId = user.id;
            const socketId = socket.id;
            console.log(`User connected: ${user.username} (${userId}) - Socket: ${socketId}`);
            // 1. Join user-specific room for targeted messages
            await socket.join(`user:${userId}`);
            // 2. Track socket connection in Redis
            await redis_service_1.redisService.addUserSocket(userId, socketId);
            // 3. Broadcast online status to contacts
            socket.broadcast.emit('user:presence', {
                userId,
                status: 'online',
                lastSeen: new Date().toISOString(),
            });
            // 4. Register handlers
            (0, presence_handler_1.registerPresenceHandlers)(this.io, socket);
            (0, chat_handler_1.registerChatHandlers)(this.io, socket);
            (0, call_handler_1.registerCallHandlers)(this.io, socket);
            // Handle disconnection
            socket.on('disconnect', async () => {
                console.log(`User disconnected: ${user.username} - Socket: ${socketId}`);
                // Remove socket from Redis
                await redis_service_1.redisService.removeUserSocket(userId, socketId);
                // Check if user has other active connections
                const activeSockets = await redis_service_1.redisService.getUserSockets(userId);
                if (activeSockets.length === 0) {
                    const offlineTime = new Date();
                    // Update DB lastSeen
                    try {
                        const { prisma } = require('../services/db.service');
                        await prisma.user.update({
                            where: { id: userId },
                            data: { lastSeen: offlineTime },
                        });
                    }
                    catch (err) {
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
    getIo() {
        return this.io;
    }
}
exports.SocketManager = SocketManager;
