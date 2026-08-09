"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateTurnCredentials = exports.getCallHistory = void 0;
const crypto_1 = __importDefault(require("crypto"));
const db_service_1 = require("../services/db.service");
const TURN_SECRET = process.env.TURN_SECRET || 'voxly_shared_secret_lt_creds_token_generation';
const TURN_SERVER_DOMAIN = process.env.TURN_SERVER_DOMAIN || 'localhost';
const getCallHistory = async (req, res) => {
    try {
        const userId = req.user?.id;
        const limit = parseInt(req.query.limit) || 20;
        const page = parseInt(req.query.page) || 1;
        if (!userId) {
            res.status(401).json({ success: false, error: { message: 'Unauthorized' } });
            return;
        }
        const calls = await db_service_1.prisma.call.findMany({
            where: {
                OR: [
                    { callerId: userId },
                    { receiverId: userId },
                ],
            },
            include: {
                caller: {
                    select: {
                        id: true,
                        username: true,
                        avatarUrl: true,
                    },
                },
                receiver: {
                    select: {
                        id: true,
                        username: true,
                        avatarUrl: true,
                    },
                },
            },
            orderBy: {
                createdAt: 'desc',
            },
            take: limit,
            skip: (page - 1) * limit,
        });
        const formattedCalls = calls.map((call) => {
            const isCaller = call.callerId === userId;
            const otherParticipant = isCaller ? call.receiver : call.caller;
            return {
                id: call.id,
                isCaller,
                otherParticipant,
                type: call.type,
                status: call.status,
                startedAt: call.startedAt,
                answeredAt: call.answeredAt,
                endedAt: call.endedAt,
                duration: call.duration,
                createdAt: call.createdAt,
            };
        });
        res.status(200).json({ success: true, data: formattedCalls });
    }
    catch (error) {
        console.error('getCallHistory error:', error);
        res.status(500).json({ success: false, error: { message: 'Internal server error' } });
    }
};
exports.getCallHistory = getCallHistory;
const generateTurnCredentials = async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            res.status(401).json({ success: false, error: { message: 'Unauthorized' } });
            return;
        }
        // TTL for credentials: 24 hours (86400 seconds)
        const ttl = 24 * 60 * 60;
        const timestamp = Math.floor(Date.now() / 1000) + ttl;
        const username = `${timestamp}:${userId}`;
        // Generate HMAC-SHA1 password (base64 encoded) using coturn secret
        const credential = crypto_1.default
            .createHmac('sha1', TURN_SECRET)
            .update(username)
            .digest('base64');
        // Return STUN + TURN configurations
        // The TURN service is configured in docker-compose on ports 3478 (standard) and 5349 (secure)
        const iceServers = [
            {
                urls: 'stun:stun.l.google.com:19302',
            },
            {
                urls: `turn:${TURN_SERVER_DOMAIN}:3478?transport=udp`,
                username,
                credential,
            },
            {
                urls: `turn:${TURN_SERVER_DOMAIN}:3478?transport=tcp`,
                username,
                credential,
            },
            {
                urls: `turn:${TURN_SERVER_DOMAIN}:5349?transport=tcp`, // Secure TLS transport fallback
                username,
                credential,
            },
        ];
        res.status(200).json({
            success: true,
            data: { iceServers },
        });
    }
    catch (error) {
        console.error('generateTurnCredentials error:', error);
        res.status(500).json({ success: false, error: { message: 'Internal server error' } });
    }
};
exports.generateTurnCredentials = generateTurnCredentials;
