import { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../services/db.service';
import { redisService } from '../services/redis.service';

export const createConversationSchema = z.object({
  body: z.object({
    recipientId: z.string().uuid(),
  }),
});

export const getOrCreateConversation = async (req: Request, res: Response): Promise<void> => {
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
    const recipientExists = await prisma.user.findUnique({ where: { id: recipientId } });
    if (!recipientExists) {
      res.status(404).json({ success: false, error: { message: 'Recipient not found' } });
      return;
    }

    // Check if 1-to-1 conversation already exists
    const existingConversation = await prisma.conversation.findFirst({
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
    const newConv = await prisma.$transaction(async (tx) => {
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

    const conversationDetails = await prisma.conversation.findUnique({
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
  } catch (error) {
    console.error('getOrCreateConversation error:', error);
    res.status(500).json({ success: false, error: { message: 'Internal server error' } });
  }
};

export const listConversations = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ success: false, error: { message: 'Unauthorized' } });
      return;
    }

    // Fetch conversations of the user
    const userConvs = await prisma.conversation.findMany({
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

    const formattedConvs = await Promise.all(
      userConvs.map(async (conv) => {
        const otherMember = conv.members.find((m) => m.userId !== userId);
        const recipient = otherMember?.user;

        // Fetch unread count for this conversation
        const unreadCount = await prisma.message.count({
          where: {
            conversationId: conv.id,
            senderId: { not: userId },
            status: { not: 'read' },
          },
        });

        // Fetch dynamic online presence from Redis
        let onlineStatus = 'offline';
        if (recipient) {
          onlineStatus = await redisService.getPresence(recipient.id);
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
      })
    );

    res.status(200).json({ success: true, data: formattedConvs });
  } catch (error) {
    console.error('listConversations error:', error);
    res.status(500).json({ success: false, error: { message: 'Internal server error' } });
  }
};

export const getMessages = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    const conversationId = req.params.id;
    const limit = parseInt(req.query.limit as string) || 50;
    const cursor = req.query.cursor as string;

    if (!userId) {
      res.status(401).json({ success: false, error: { message: 'Unauthorized' } });
      return;
    }

    // Verify user is a member of the conversation
    const isMember = await prisma.conversationMember.findUnique({
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
    const messages = await prisma.message.findMany({
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
  } catch (error) {
    console.error('getMessages error:', error);
    res.status(500).json({ success: false, error: { message: 'Internal server error' } });
  }
};
