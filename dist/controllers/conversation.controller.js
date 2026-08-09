"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMessages = exports.listConversations = exports.getOrCreateConversation = exports.createConversationSchema = void 0;
const zod_1 = require("zod");
const db_service_1 = require("../services/db.service");
const redis_service_1 = require("../services/redis.service");
exports.createConversationSchema = zod_1.z.object({
    body: zod_1.z.object({
        recipientId: zod_1.z.string().uuid(),
    }),
});
const getOrCreateConversation = async (req, res) => {
    try {
        const userId = req.user?.id;
        const { recipientId } = req.body;
        if (!userId) {
            res.status(401).json({ success: false, error: { message: 'Unauthorized' } });
            return;
        }
        if (userId === recipientId) {
            res.status(400).json({ success: false, error: { message: 'Cannot start conversation with yourself' } });
            return;
        }
        // Check if recipient user exists
        const recipientExists = await db_service_1.prisma.user.findUnique({ where: { id: recipientId } });
        if (!recipientExists) {
            res.status(404).json({ success: false, error: { message: 'Recipient not found' } });
            return;
        }
        // Check if 1-to-1 conversation already exists
        const existingConversation = await db_service_1.prisma.conversation.findFirst({
            where: {
                isGroup: false,
                AND: [
                    { members: { some: { userId } } },
                    { members: { some: { userId: recipientId } } },
                ],
            },
            include: {
                members: {
                    include: {
                        user: {
                            select: {
                                id: true,
                                username: true,
                                avatarUrl: true,
                                lastSeen: true,
                            },
                        },
                    },
                },
            },
        });
        if (existingConversation) {
            // Map members to output format
            const formatted = {
                ...existingConversation,
                recipient: existingConversation.members.find(m => m.userId !== userId)?.user,
            };
            res.status(200).json({ success: true, data: formatted });
            return;
        }
        // Create new conversation in a transaction
        const newConv = await db_service_1.prisma.$transaction(async (tx) => {
            const conv = await tx.conversation.create({
                data: {
                    isGroup: false,
                },
            });
            await tx.conversationMember.createMany({
                data: [
                    { conversationId: conv.id, userId },
                    { conversationId: conv.id, userId: recipientId },
                ],
            });
            return conv;
        });
        const conversationDetails = await db_service_1.prisma.conversation.findUnique({
            where: { id: newConv.id },
            include: {
                members: {
                    include: {
                        user: {
                            select: {
                                id: true,
                                username: true,
                                avatarUrl: true,
                                lastSeen: true,
                            },
                        },
                    },
                },
            },
        });
        const formatted = {
            ...conversationDetails,
            recipient: conversationDetails?.members.find(m => m.userId !== userId)?.user,
        };
        res.status(201).json({ success: true, data: formatted });
    }
    catch (error) {
        console.error('getOrCreateConversation error:', error);
        res.status(500).json({ success: false, error: { message: 'Internal server error' } });
    }
};
exports.getOrCreateConversation = getOrCreateConversation;
const listConversations = async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            res.status(401).json({ success: false, error: { message: 'Unauthorized' } });
            return;
        }
        // Fetch conversations of the user
        const userConvs = await db_service_1.prisma.conversation.findMany({
            where: {
                members: { some: { userId } },
            },
            include: {
                members: {
                    include: {
                        user: {
                            select: {
                                id: true,
                                username: true,
                                avatarUrl: true,
                                lastSeen: true,
                            },
                        },
                    },
                },
                messages: {
                    orderBy: { createdAt: 'desc' },
                    take: 1,
                },
            },
            orderBy: { updatedAt: 'desc' },
        });
        const formattedConvs = await Promise.all(userConvs.map(async (conv) => {
            const otherMember = conv.members.find((m) => m.userId !== userId);
            const recipient = otherMember?.user;
            // Fetch unread count for this conversation
            const unreadCount = await db_service_1.prisma.message.count({
                where: {
                    conversationId: conv.id,
                    senderId: { not: userId },
                    status: { not: 'read' },
                },
            });
            // Fetch dynamic online presence from Redis
            let onlineStatus = 'offline';
            if (recipient) {
                onlineStatus = await redis_service_1.redisService.getPresence(recipient.id);
            }
            return {
                id: conv.id,
                isGroup: conv.isGroup,
                createdAt: conv.createdAt,
                updatedAt: conv.updatedAt,
                lastMessage: conv.messages[0] || null,
                unreadCount,
                recipient: recipient
                    ? {
                        ...recipient,
                        onlineStatus,
                    }
                    : null,
            };
        }));
        res.status(200).json({ success: true, data: formattedConvs });
    }
    catch (error) {
        console.error('listConversations error:', error);
        res.status(500).json({ success: false, error: { message: 'Internal server error' } });
    }
};
exports.listConversations = listConversations;
const getMessages = async (req, res) => {
    try {
        const userId = req.user?.id;
        const conversationId = req.params.id;
        const limit = parseInt(req.query.limit) || 50;
        const cursor = req.query.cursor;
        if (!userId) {
            res.status(401).json({ success: false, error: { message: 'Unauthorized' } });
            return;
        }
        // Verify user is a member of the conversation
        const isMember = await db_service_1.prisma.conversationMember.findUnique({
            where: {
                conversationId_userId: {
                    conversationId,
                    userId,
                },
            },
        });
        if (!isMember) {
            res.status(403).json({ success: false, error: { message: 'Access denied' } });
            return;
        }
        // Retrieve messages
        const messages = await db_service_1.prisma.message.findMany({
            where: {
                conversationId,
            },
            take: limit,
            ...(cursor && {
                skip: 1,
                cursor: { id: cursor },
            }),
            orderBy: {
                createdAt: 'desc',
            },
        });
        // Invert to chronological order for client display
        res.status(200).json({ success: true, data: messages.reverse() });
    }
    catch (error) {
        console.error('getMessages error:', error);
        res.status(500).json({ success: false, error: { message: 'Internal server error' } });
    }
};
exports.getMessages = getMessages;
