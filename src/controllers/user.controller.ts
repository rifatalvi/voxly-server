import { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../services/db.service';

export const updateProfileSchema = z.object({
  body: z.object({
    username: z.string().min(3).max(20).regex(/^[a-zA-Z0-9_]+$/).optional(),
    avatarUrl: z.string().url().optional(),
  }),
});

export const getProfile = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ success: false, error: { message: 'Unauthorized' } });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        email: true,
        avatarUrl: true,
        lastSeen: true,
        createdAt: true,
      },
    });

    if (!user) {
      res.status(404).json({ success: false, error: { message: 'User not found' } });
      return;
    }

    res.status(200).json({ success: true, data: user });
  } catch (error) {
    console.error('getProfile error:', error);
    res.status(500).json({ success: false, error: { message: 'Internal server error' } });
  }
};

export const updateProfile = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    const { username, avatarUrl } = req.body;

    if (!userId) {
      res.status(401).json({ success: false, error: { message: 'Unauthorized' } });
      return;
    }

    // Check unique username if provided
    if (username) {
      const existing = await prisma.user.findFirst({
        where: {
          username,
          NOT: { id: userId },
        },
      });
      if (existing) {
        res.status(400).json({ success: false, error: { message: 'Username already taken' } });
        return;
      }
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: {
        ...(username && { username }),
        ...(avatarUrl && { avatarUrl }),
      },
      select: {
        id: true,
        username: true,
        email: true,
        avatarUrl: true,
        lastSeen: true,
      },
    });

    res.status(200).json({ success: true, data: updated });
  } catch (error) {
    console.error('updateProfile error:', error);
    res.status(500).json({ success: false, error: { message: 'Internal server error' } });
  }
};

export const searchUsers = async (req: Request, res: Response): Promise<void> => {
  try {
    const query = req.query.q as string;
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({ success: false, error: { message: 'Unauthorized' } });
      return;
    }

    if (!query) {
      res.status(200).json({ success: true, data: [] });
      return;
    }

    const users = await prisma.user.findMany({
      where: {
        username: {
          contains: query,
          mode: 'insensitive',
        },
        NOT: { id: userId },
      },
      select: {
        id: true,
        username: true,
        avatarUrl: true,
        lastSeen: true,
      },
      take: 20,
    });

    res.status(200).json({ success: true, data: users });
  } catch (error) {
    console.error('searchUsers error:', error);
    res.status(500).json({ success: false, error: { message: 'Internal server error' } });
  }
};
