import request from 'supertest';
import app from '../app';
import { prisma } from '../services/db.service';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

jest.mock('../services/db.service', () => ({
  prisma: {
    user: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    refreshToken: {
      create: jest.fn(),
      deleteMany: jest.fn(),
    },
  },
}));

const JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'voxly_secret_access_token_sign_key_987654321';

describe('Auth Endpoints API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/auth/register', () => {
    it('should register a new user successfully and return user details and token', async () => {
      const mockUser = {
        id: 'user-uuid-12345',
        username: 'testuser',
        email: 'test@example.com',
        avatarUrl: 'http://avatar.url',
        lastSeen: new Date(),
      };

      (prisma.user.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.user.create as jest.Mock).mockResolvedValue(mockUser);
      (prisma.refreshToken.create as jest.Mock).mockResolvedValue({ id: 'token-id' });

      const response = await request(app)
        .post('/api/auth/register')
        .send({
          username: 'testuser',
          email: 'test@example.com',
          password: 'securePassword123',
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.user.username).toBe('testuser');
      expect(response.body.data.user.email).toBe('test@example.com');
      expect(response.body.data.accessToken).toBeDefined();
    });

    it('should fail registration with invalid input schema', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          username: 't', // too short
          email: 'not-an-email',
          password: '123', // too short
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.message).toBe('Validation failed');
    });

    it('should fail registration if username or email is already taken', async () => {
      (prisma.user.findFirst as jest.Mock).mockResolvedValue({ id: 'existing-id' });

      const response = await request(app)
        .post('/api/auth/register')
        .send({
          username: 'testuser',
          email: 'test@example.com',
          password: 'securePassword123',
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.message).toBe('Username or Email is already taken');
    });
  });

  describe('POST /api/auth/login', () => {
    it('should log in an existing user with correct credentials', async () => {
      const hashedPassword = await bcrypt.hash('securePassword123', 10);
      const mockUser = {
        id: 'user-uuid-12345',
        username: 'testuser',
        email: 'test@example.com',
        passwordHash: hashedPassword,
        avatarUrl: 'http://avatar.url',
        lastSeen: new Date(),
      };

      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
      (prisma.refreshToken.create as jest.Mock).mockResolvedValue({ id: 'token-id' });

      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test@example.com',
          password: 'securePassword123',
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.user.email).toBe('test@example.com');
      expect(response.body.data.accessToken).toBeDefined();
    });

    it('should reject login with incorrect credentials', async () => {
      const hashedPassword = await bcrypt.hash('securePassword123', 10);
      const mockUser = {
        id: 'user-uuid-12345',
        username: 'testuser',
        email: 'test@example.com',
        passwordHash: hashedPassword,
      };

      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);

      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test@example.com',
          password: 'wrongPassword',
        });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.error.message).toBe('Invalid credentials');
    });
  });

  describe('GET /api/users/profile', () => {
    it('should return user profile if authenticated', async () => {
      const mockUser = {
        id: 'user-uuid-12345',
        username: 'testuser',
        email: 'test@example.com',
        avatarUrl: 'http://avatar.url',
        lastSeen: new Date(),
        createdAt: new Date(),
      };

      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);

      const token = jwt.sign(
        { id: mockUser.id, username: mockUser.username, email: mockUser.email },
        JWT_ACCESS_SECRET
      );

      const response = await request(app)
        .get('/api/users/profile')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.username).toBe('testuser');
    });

    it('should block profile retrieval if no token is provided', async () => {
      const response = await request(app).get('/api/users/profile');
      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });
  });
});
