import { Server } from 'socket.io';
import { AuthenticatedSocket } from './socket.manager';
import { prisma } from '../services/db.service';
import { redisService } from '../services/redis.service';

const CALL_TIMEOUT_MS = 45000; // 45 seconds timeout

export const registerCallHandlers = (io: Server, socket: AuthenticatedSocket) => {
  const userId = socket.user?.id;
  if (!userId) return;

  // 1. Initiate Call
  socket.on('call:initiate', async (payload: { receiverId: string }, callback) => {
    try {
      const { receiverId } = payload;

      if (userId === receiverId) {
        if (callback) callback({ success: false, error: 'Cannot call yourself' });
        return;
      }

      // Check if receiver is online
      const receiverPresence = await redisService.getPresence(receiverId);
      if (receiverPresence === 'offline') {
        // If receiver is offline, mark call as missed immediately
        const call = await prisma.call.create({
          data: {
            callerId: userId,
            receiverId,
            status: 'missed',
            endedAt: new Date(),
          },
        });
        if (callback) callback({ success: false, error: 'User is offline', callId: call.id });
        return;
      }

      // Create DB Call record
      const call = await prisma.call.create({
        data: {
          callerId: userId,
          receiverId,
          status: 'calling',
        },
        include: {
          caller: {
            select: {
              id: true,
              username: true,
              avatarUrl: true,
            },
          },
        },
      });

      // Cache Call state in Redis
      const callState = {
        id: call.id,
        callerId: userId,
        receiverId,
        status: 'calling',
      };
      await redisService.setCallState(call.id, callState);

      // Notify recipient
      io.to(`user:${receiverId}`).emit('call:incoming', {
        callId: call.id,
        caller: {
          id: call.caller.id,
          username: call.caller.username,
          avatarUrl: call.caller.avatarUrl,
        },
      });

      // Start Call Timeout
      setTimeout(async () => {
        const currentCallState = await redisService.getCallState(call.id);
        if (currentCallState && (currentCallState.status === 'calling' || currentCallState.status === 'ringing')) {
          // Timeout occurred - mark as missed
          await prisma.call.update({
            where: { id: call.id },
            data: {
              status: 'missed',
              endedAt: new Date(),
            },
          });
          await redisService.deleteCallState(call.id);

          // Emit to both caller and receiver
          io.to(`user:${userId}`).emit('call:failed', { callId: call.id, reason: 'No answer (Timeout)' });
          io.to(`user:${receiverId}`).emit('call:cancelled', { callId: call.id });
        }
      }, CALL_TIMEOUT_MS);

      if (callback) callback({ success: true, data: call });
    } catch (err) {
      console.error('Error initiating call:', err);
      if (callback) callback({ success: false, error: 'Internal server error initiating call' });
    }
  });

  // 2. Ringing State
  socket.on('call:ringing', async (payload: { callId: string }) => {
    try {
      const { callId } = payload;
      const callState = await redisService.getCallState(callId);
      if (!callState || callState.receiverId !== userId) return;

      // Update call status
      callState.status = 'ringing';
      await redisService.setCallState(callId, callState);

      await prisma.call.update({
        where: { id: callId },
        data: { status: 'ringing' },
      });

      // Relay to caller
      io.to(`user:${callState.callerId}`).emit('call:ringing', { callId });
    } catch (err) {
      console.error('Error handling call:ringing:', err);
    }
  });

  // 3. Accept Call
  socket.on('call:accept', async (payload: { callId: string }, callback) => {
    try {
      const { callId } = payload;
      const callState = await redisService.getCallState(callId);
      if (!callState || callState.receiverId !== userId) {
        if (callback) callback({ success: false, error: 'Call not found or unauthorized' });
        return;
      }

      callState.status = 'connected';
      await redisService.setCallState(callId, callState);

      const now = new Date();
      const updatedCall = await prisma.call.update({
        where: { id: callId },
        data: {
          status: 'connected',
          answeredAt: now,
        },
      });

      // Relay to caller
      io.to(`user:${callState.callerId}`).emit('call:accepted', { callId });

      if (callback) callback({ success: true, data: updatedCall });
    } catch (err) {
      console.error('Error accepting call:', err);
      if (callback) callback({ success: false, error: 'Failed to accept call' });
    }
  });

  // 4. Reject Call
  socket.on('call:reject', async (payload: { callId: string }) => {
    try {
      const { callId } = payload;
      const callState = await redisService.getCallState(callId);
      if (!callState || callState.receiverId !== userId) return;

      await prisma.call.update({
        where: { id: callId },
        data: {
          status: 'rejected',
          endedAt: new Date(),
        },
      });

      await redisService.deleteCallState(callId);

      // Notify caller
      io.to(`user:${callState.callerId}`).emit('call:rejected', { callId });
    } catch (err) {
      console.error('Error rejecting call:', err);
    }
  });

  // 5. Cancel Call
  socket.on('call:cancel', async (payload: { callId: string }) => {
    try {
      const { callId } = payload;
      const callState = await redisService.getCallState(callId);
      if (!callState || callState.callerId !== userId) return;

      await prisma.call.update({
        where: { id: callId },
        data: {
          status: 'cancelled',
          endedAt: new Date(),
        },
      });

      await redisService.deleteCallState(callId);

      // Notify receiver
      io.to(`user:${callState.receiverId}`).emit('call:cancelled', { callId });
    } catch (err) {
      console.error('Error cancelling call:', err);
    }
  });

  // 6. WebRTC Offer Relay
  socket.on('call:webrtc-offer', async (payload: { callId: string; sdp: any }) => {
    try {
      const { callId, sdp } = payload;
      const callState = await redisService.getCallState(callId);
      if (!callState) return;

      const targetId = callState.callerId === userId ? callState.receiverId : callState.callerId;
      io.to(`user:${targetId}`).emit('call:webrtc-offer', { callId, sdp });
    } catch (err) {
      console.error('Error relaying WebRTC offer:', err);
    }
  });

  // 7. WebRTC Answer Relay
  socket.on('call:webrtc-answer', async (payload: { callId: string; sdp: any }) => {
    try {
      const { callId, sdp } = payload;
      const callState = await redisService.getCallState(callId);
      if (!callState) return;

      const targetId = callState.callerId === userId ? callState.receiverId : callState.callerId;
      io.to(`user:${targetId}`).emit('call:webrtc-answer', { callId, sdp });
    } catch (err) {
      console.error('Error relaying WebRTC answer:', err);
    }
  });

  // 8. ICE Candidate Relay
  socket.on('call:ice-candidate', async (payload: { callId: string; candidate: any }) => {
    try {
      const { callId, candidate } = payload;
      const callState = await redisService.getCallState(callId);
      if (!callState) return;

      const targetId = callState.callerId === userId ? callState.receiverId : callState.callerId;
      io.to(`user:${targetId}`).emit('call:ice-candidate', { callId, candidate });
    } catch (err) {
      console.error('Error relaying ICE candidate:', err);
    }
  });

  // 9. End Call
  socket.on('call:end', async (payload: { callId: string }) => {
    try {
      const { callId } = payload;
      const callState = await redisService.getCallState(callId);
      if (!callState) return;

      // Find the Call in DB to calculate duration
      const call = await prisma.call.findUnique({ where: { id: callId } });
      if (call && call.status === 'connected') {
        const endedAt = new Date();
        const answeredAt = call.answeredAt || call.startedAt;
        const duration = Math.floor((endedAt.getTime() - answeredAt.getTime()) / 1000);

        await prisma.call.update({
          where: { id: callId },
          data: {
            status: 'completed',
            endedAt,
            duration,
          },
        });
      } else if (call && (call.status === 'calling' || call.status === 'ringing')) {
        // If not answered yet, mark as missed or cancelled
        await prisma.call.update({
          where: { id: callId },
          data: {
            status: call.callerId === userId ? 'cancelled' : 'rejected',
            endedAt: new Date(),
          },
        });
      }

      await redisService.deleteCallState(callId);

      const targetId = callState.callerId === userId ? callState.receiverId : callState.callerId;
      
      // Notify both rooms to clean up
      io.to(`user:${callState.callerId}`).emit('call:ended', { callId });
      io.to(`user:${callState.receiverId}`).emit('call:ended', { callId });
    } catch (err) {
      console.error('Error ending call:', err);
    }
  });
};
