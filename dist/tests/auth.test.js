"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const supertest_1 = __importDefault(require("supertest"));
const app_1 = __importDefault(require("../app"));
const db_service_1 = require("../services/db.service");
const bcrypt_1 = __importDefault(require("bcrypt"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
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
            db_service_1.prisma.user.findFirst.mockResolvedValue(null);
            db_service_1.prisma.user.create.mockResolvedValue(mockUser);
            db_service_1.prisma.refreshToken.create.mockResolvedValue({ id: 'token-id' });
            const response = await (0, supertest_1.default)(app_1.default)
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
            const response = await (0, supertest_1.default)(app_1.default)
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
            db_service_1.prisma.user.findFirst.mockResolvedValue({ id: 'existing-id' });
            const response = await (0, supertest_1.default)(app_1.default)
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
            const hashedPassword = await bcrypt_1.default.hash('securePassword123', 10);
            const mockUser = {
                id: 'user-uuid-12345',
                username: 'testuser',
                email: 'test@example.com',
                passwordHash: hashedPassword,
                avatarUrl: 'http://avatar.url',
                lastSeen: new Date(),
            };
            db_service_1.prisma.user.findUnique.mockResolvedValue(mockUser);
            db_service_1.prisma.refreshToken.create.mockResolvedValue({ id: 'token-id' });
            const response = await (0, supertest_1.default)(app_1.default)
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
            const hashedPassword = await bcrypt_1.default.hash('securePassword123', 10);
            const mockUser = {
                id: 'user-uuid-12345',
                username: 'testuser',
                email: 'test@example.com',
                passwordHash: hashedPassword,
            };
            db_service_1.prisma.user.findUnique.mockResolvedValue(mockUser);
            const response = await (0, supertest_1.default)(app_1.default)
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
            db_service_1.prisma.user.findUnique.mockResolvedValue(mockUser);
            const token = jsonwebtoken_1.default.sign({ id: mockUser.id, username: mockUser.username, email: mockUser.email }, JWT_ACCESS_SECRET);
            const response = await (0, supertest_1.default)(app_1.default)
                .get('/api/users/profile')
                .set('Authorization', `Bearer ${token}`);
            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.data.username).toBe('testuser');
        });
        it('should block profile retrieval if no token is provided', async () => {
            const response = await (0, supertest_1.default)(app_1.default).get('/api/users/profile');
            expect(response.status).toBe(401);
            expect(response.body.success).toBe(false);
        });
    });
});
