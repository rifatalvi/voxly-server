import { Request, Response } from 'express';
import crypto from 'crypto';
import { prisma } from '../services/db.service';

const TURN_SECRET = process.env.TURN_SECRET!;
const TURN_SERVER_DOMAIN = process.env.TURN_SERVER_DOMAIN!;
const METERED_API_KEY = process.env.METERED_API_KEY;
const METERED_SUBDOMAIN = process.env.METERED_SUBDOMAIN;

// In-memory cache for Metered.ca ICE servers
let cachedMeteredIceServers: any = null;
let meteredCacheExpiry = 0;

export const getCallHistory = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    const limit = parseInt(req.query.limit as string) || 20;
    const page = parseInt(req.query.page as string) || 1;

    if (!userId) {
      res.status(401).json({ success: false, error: { message: 'Unauthorized' } });
      return;
    }

    const calls = await prisma.call.findMany({
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
  } catch (error) {
    console.error('getCallHistory error:', error);
    res.status(500).json({ success: false, error: { message: 'Internal server error' } });
  }
};

export const generateTurnCredentials = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ success: false, error: { message: 'Unauthorized' } });
      return;
    }

    // If Metered.ca is configured, attempt to fetch ICE servers from their API
    if (METERED_API_KEY && METERED_SUBDOMAIN) {
      try {
        const now = Date.now();
        if (cachedMeteredIceServers && now < meteredCacheExpiry) {
          res.status(200).json({
            success: true,
            data: { iceServers: cachedMeteredIceServers },
          });
          return;
        }

        console.log('Fetching fresh TURN credentials from Metered.ca...');
        const response = await (globalThis as any).fetch(
          `https://${METERED_SUBDOMAIN}.metered.live/api/v1/turn/credentials?apiKey=${METERED_API_KEY}`
        );

        if (response.ok) {
          const iceServers = await response.json();
          if (Array.isArray(iceServers)) {
            cachedMeteredIceServers = iceServers;
            meteredCacheExpiry = now + 30 * 60 * 1000; // Cache for 30 minutes

            res.status(200).json({
              success: true,
              data: { iceServers },
            });
            return;
          }
        }
        console.warn('Metered.ca API failed or returned invalid format. Falling back to local coturn...');
      } catch (fetchError) {
        console.error('Error fetching from Metered.ca, falling back to local coturn:', fetchError);
      }
    }

    // TTL for credentials: 24 hours (86400 seconds)
    const ttl = 24 * 60 * 60;
    const timestamp = Math.floor(Date.now() / 1000) + ttl;
    const username = `${timestamp}:${userId}`;

    // Generate HMAC-SHA1 password (base64 encoded) using coturn secret
    const credential = crypto
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
  } catch (error) {
    console.error('generateTurnCredentials error:', error);
    res.status(500).json({ success: false, error: { message: 'Internal server error' } });
  }
};
