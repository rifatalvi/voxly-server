import { Server } from 'socket.io';
import { AuthenticatedSocket } from './socket.manager';
import { prisma } from '../services/db.service';

export const registerChatHandlers = (io: Server, socket: AuthenticatedSocket) => {
  const userId = socket.user?.id;
  if (!userId) return;

  // Helpers to get conversation partner
  const getRecipientId = async (conversationId: string): Promise<string | null> => {
    try {
      const member = await prisma.conversationMember.findFirst({
        where: {
          conversationId,
          NOT: { userId },
        },
      });
      return member ? member.userId : null;
    } catch {
      return null;
    }
  };

  // 1. Send Message
  socket.on('message:send', async (payload: { conversationId: string; content: string }, callback) => {
    try {
      const { conversationId, content } = payload;
      if (!content || content.trim() === '') {
        if (callback) callback({ success: false, error: 'Message content cannot be empty' });
        return;
      }

      // Check membership
      const member = await prisma.conversationMember.findUnique({
        where: {
          conversationId_userId: {
            conversationId,
            userId,
          },
        },
      });

      if (!member) {
        if (callback) callback({ success: false, error: 'Not a member of this conversation' });
        return;
      }

      const recipientId = await getRecipientId(conversationId);
      if (!recipientId) {
        if (callback) callback({ success: false, error: 'Recipient not found' });
        return;
      }

      // Create message in database
      const message = await prisma.message.create({
        data: {
          conversationId,
          senderId: userId,
          content,
          status: 'sent',
        },
      });

      // Update conversation timestamp
      await prisma.conversation.update({
        where: { id: conversationId },
        data: { updatedAt: new Date() },
      });

      // Broadcast message to recipient room
      io.to(`user:${recipientId}`).emit('message:receive', message);

      if (callback) callback({ success: true, data: message });
    } catch (err) {
      console.error('Error handling message:send:', err);
      if (callback) callback({ success: false, error: 'Failed to send message' });
    }
  });

  // 2. Read Receipt
  socket.on('message:read', async (payload: { conversationId: string }, callback) => {
    try {
      const { conversationId } = payload;

      const recipientId = await getRecipientId(conversationId);
      if (!recipientId) return;

      // Update messages from the other user in this conversation to read
      await prisma.message.updateMany({
        where: {
          conversationId,
          senderId: recipientId,
          status: 'sent',
        },
        data: {
          status: 'read',
          readAt: new Date(),
        },
      });

      // Notify recipient that their messages are read
      io.to(`user:${recipientId}`).emit('message:read', {
        conversationId,
        readBy: userId,
      });

      if (callback) callback({ success: true });
    } catch (err) {
      console.error('Error handling message:read:', err);
      if (callback) callback({ success: false, error: 'Failed to update read status' });
    }
  });

  // 3. Delete Message
  socket.on('message:delete', async (payload: { messageId: string }, callback) => {
    try {
      const { messageId } = payload;

      const message = await prisma.message.findUnique({
        where: { id: messageId },
      });

      if (!message || message.senderId !== userId) {
        if (callback) callback({ success: false, error: 'Unauthorized or message not found' });
        return;
      }

      // Perform deletion (or soft delete by updating deletedAt)
      await prisma.message.update({
        where: { id: messageId },
        data: {
          deletedAt: new Date(),
          content: 'This message was deleted',
        },
      });

      const recipientId = await getRecipientId(message.conversationId);
      if (recipientId) {
        // Notify recipient about message deletion
        io.to(`user:${recipientId}`).emit('message:deleted', {
          messageId,
          conversationId: message.conversationId,
        });
      }

      if (callback) callback({ success: true });
    } catch (err) {
      console.error('Error handling message:delete:', err);
      if (callback) callback({ success: false, error: 'Failed to delete message' });
    }
  });

  // 4. Typing Start
  socket.on('typing:start', async (payload: { conversationId: string }) => {
    try {
      const { conversationId } = payload;
      const recipientId = await getRecipientId(conversationId);
      if (recipientId) {
        io.to(`user:${recipientId}`).emit('typing:start', { conversationId, userId });
      }
    } catch (err) {
      console.error('Error in typing:start:', err);
    }
  });

  // 5. Typing Stop
  socket.on('typing:stop', async (payload: { conversationId: string }) => {
    try {
      const { conversationId } = payload;
      const recipientId = await getRecipientId(conversationId);
      if (recipientId) {
        io.to(`user:${recipientId}`).emit('typing:stop', { conversationId, userId });
      }
    } catch (err) {
      console.error('Error in typing:stop:', err);
    }
  });
};
