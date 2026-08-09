"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerPresenceHandlers = void 0;
const redis_service_1 = require("../services/redis.service");
const registerPresenceHandlers = (io, socket) => {
    socket.on('user:get-presence', async ({ userId }, callback) => {
        try {
            const presence = await redis_service_1.redisService.getPresence(userId);
            callback({ success: true, presence });
        }
        catch (err) {
            console.error(`Error handling user:get-presence for ${userId}:`, err);
            callback({ success: false, error: 'Failed to fetch presence' });
        }
    });
};
exports.registerPresenceHandlers = registerPresenceHandlers;
