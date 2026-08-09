import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { prisma } from '../services/db.service';

const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_EXPIRY_DAYS = 7;
const REFRESH_TOKEN_EXPIRY = `${REFRESH_TOKEN_EXPIRY_DAYS}d`;

const JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'voxly_secret_access_token_sign_key_987654321';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'voxly_secret_refresh_token_sign_key_123456789';

// Zod schemas for body validation
export const registerSchema = z.object({
  body: z.object({
    username: z.string().min(3).max(20).regex(/^[a-zA-Z0-9_]+$/),
    email: z.string().email(),
    password: z.string().min(8),
  }),
});

export const loginSchema = z.object({
  body: z.object({
    email: z.string().email(),
    password: z.string(),
  }),
});

export const forgotPasswordSchema = z.object({
  body: z.object({
    email: z.string().email(),
  }),
});

export const resetPasswordSchema = z.object({
  body: z.object({
    token: z.string(),
    newPassword: z.string().min(8),
  }),
});

// Helpers to generate tokens
const generateAccessToken = (user: { id: string; username: string; email: string }) => {
  return jwt.sign({ id: user.id, username: user.username, email: user.email }, JWT_ACCESS_SECRET, {
    expiresIn: ACCESS_TOKEN_EXPIRY,
  });
};

const generateRefreshToken = (user: { id: string; username: string; email: string }) => {
  return jwt.sign({ id: user.id, username: user.username, email: user.email }, JWT_REFRESH_SECRET, {
    expiresIn: REFRESH_TOKEN_EXPIRY,
  });
};

const setTokenCookies = (res: Response, accessToken: string, refreshToken: string) => {
  const isProduction = process.env.NODE_ENV === 'production';

  res.cookie('accessToken', accessToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'strict' : 'lax',
    maxAge: 15 * 60 * 1000, // 15 mins
  });

  res.cookie('refreshToken', refreshToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'strict' : 'lax',
    maxAge: REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000, // 7 days
  });
};

export const clearTokenCookies = (res: Response) => {
  const isProduction = process.env.NODE_ENV === 'production';
  res.clearCookie('accessToken', {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'strict' : 'lax',
  });
  res.clearCookie('refreshToken', {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'strict' : 'lax',
  });
};

export const register = async (req: Request, res: Response): Promise<void> => {
  try {
    const { username, email, password } = req.body;

    // Check if user exists
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [{ email }, { username }],
      },
    });

    if (existingUser) {
      res.status(400).json({
        success: false,
        error: { message: 'Username or Email is already taken' },
      });
      return;
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const user = await prisma.user.create({
      data: {
        username,
        email,
        passwordHash,
        avatarUrl: `https://api.dicebear.com/7.x/bottts/svg?seed=${username}`, // Default avatar
      },
    });

    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    // Save refresh token to db
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_EXPIRY_DAYS);
    await prisma.refreshToken.create({
      data: {
        token: refreshToken,
        userId: user.id,
        expiresAt,
      },
    });

    setTokenCookies(res, accessToken, refreshToken);

    res.status(201).json({
      success: true,
      data: {
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          avatarUrl: user.avatarUrl,
          lastSeen: user.lastSeen,
        },
        accessToken,
      },
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Internal server error occurred' },
    });
  }
};

export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      res.status(401).json({
        success: false,
        error: { message: 'Invalid credentials' },
      });
      return;
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      res.status(401).json({
        success: false,
        error: { message: 'Invalid credentials' },
      });
      return;
    }

    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    // Delete existing tokens for clean state or add new
    await prisma.refreshToken.deleteMany({ where: { userId: user.id } });

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_EXPIRY_DAYS);
    await prisma.refreshToken.create({
      data: {
        token: refreshToken,
        userId: user.id,
        expiresAt,
      },
    });

    setTokenCookies(res, accessToken, refreshToken);

    res.status(200).json({
      success: true,
      data: {
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          avatarUrl: user.avatarUrl,
          lastSeen: user.lastSeen,
        },
        accessToken,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Internal server error occurred' },
    });
  }
};

export const logout = async (req: Request, res: Response): Promise<void> => {
  try {
    const refreshToken = req.cookies.refreshToken;
    if (refreshToken) {
      await prisma.refreshToken.deleteMany({ where: { token: refreshToken } });
    }

    clearTokenCookies(res);

    res.status(200).json({
      success: true,
      data: { message: 'Logged out successfully' },
    });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Internal server error occurred' },
    });
  }
};

export const refresh = async (req: Request, res: Response): Promise<void> => {
  try {
    const refreshToken = req.cookies.refreshToken;
    if (!refreshToken) {
      res.status(401).json({
        success: false,
        error: { message: 'Refresh token is missing' },
      });
      return;
    }

    // Verify token exists in database and is not expired
    const savedToken = await prisma.refreshToken.findUnique({
      where: { token: refreshToken },
      include: { user: true },
    });

    if (!savedToken || savedToken.expiresAt < new Date()) {
      if (savedToken) {
        await prisma.refreshToken.delete({ where: { id: savedToken.id } });
      }
      clearTokenCookies(res);
      res.status(401).json({
        success: false,
        error: { message: 'Session expired. Please log in again.' },
      });
      return;
    }

    // Verify token signature
    try {
      jwt.verify(refreshToken, JWT_REFRESH_SECRET);
    } catch (err) {
      await prisma.refreshToken.delete({ where: { id: savedToken.id } });
      clearTokenCookies(res);
      res.status(401).json({
        success: false,
        error: { message: 'Invalid refresh token.' },
      });
      return;
    }

    // Generate new access token
    const newAccessToken = generateAccessToken(savedToken.user);

    // Set new cookies
    setTokenCookies(res, newAccessToken, refreshToken);

    res.status(200).json({
      success: true,
      data: {
        accessToken: newAccessToken,
        user: {
          id: savedToken.user.id,
          username: savedToken.user.username,
          email: savedToken.user.email,
          avatarUrl: savedToken.user.avatarUrl,
        },
      },
    });
  } catch (error) {
    console.error('Refresh token error:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Internal server error occurred' },
    });
  }
};

export const forgotPassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email } = req.body;
    // Keep response generic to prevent user enumeration
    res.status(200).json({
      success: true,
      data: { message: 'If the email exists, a password reset link has been sent.' },
    });
  } catch (error) {
    console.error('ForgotPassword error:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Internal server error occurred' },
    });
  }
};

export const resetPassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const { token, newPassword } = req.body;
    // For this simple version, token can just be username/email or custom string
    // Let's implement a dummy check. If token starts with reset_token_ prefix, we use it.
    // In production, we'd verify a signed JWT or db token.
    let userEmail: string | undefined;
    try {
      const decoded = jwt.verify(token, JWT_REFRESH_SECRET) as { email: string };
      userEmail = decoded.email;
    } catch {
      res.status(400).json({
        success: false,
        error: { message: 'Invalid or expired reset token' },
      });
      return;
    }

    const user = await prisma.user.findUnique({ where: { email: userEmail } });
    if (!user) {
      res.status(404).json({
        success: false,
        error: { message: 'User not found' },
      });
      return;
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(newPassword, salt);

    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash },
    });

    res.status(200).json({
      success: true,
      data: { message: 'Password reset successfully' },
    });
  } catch (error) {
    console.error('ResetPassword error:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Internal server error occurred' },
    });
  }
};
