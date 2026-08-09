"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.resetPassword = exports.forgotPassword = exports.refresh = exports.logout = exports.login = exports.register = exports.clearTokenCookies = exports.resetPasswordSchema = exports.forgotPasswordSchema = exports.loginSchema = exports.registerSchema = void 0;
const bcrypt_1 = __importDefault(require("bcrypt"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const zod_1 = require("zod");
const db_service_1 = require("../services/db.service");
const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_EXPIRY_DAYS = 7;
const REFRESH_TOKEN_EXPIRY = `${REFRESH_TOKEN_EXPIRY_DAYS}d`;
const JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'voxly_secret_access_token_sign_key_987654321';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'voxly_secret_refresh_token_sign_key_123456789';
// Zod schemas for body validation
exports.registerSchema = zod_1.z.object({
    body: zod_1.z.object({
        username: zod_1.z.string().min(3).max(20).regex(/^[a-zA-Z0-9_]+$/),
        email: zod_1.z.string().email(),
        password: zod_1.z.string().min(8),
    }),
});
exports.loginSchema = zod_1.z.object({
    body: zod_1.z.object({
        email: zod_1.z.string().email(),
        password: zod_1.z.string(),
    }),
});
exports.forgotPasswordSchema = zod_1.z.object({
    body: zod_1.z.object({
        email: zod_1.z.string().email(),
    }),
});
exports.resetPasswordSchema = zod_1.z.object({
    body: zod_1.z.object({
        token: zod_1.z.string(),
        newPassword: zod_1.z.string().min(8),
    }),
});
// Helpers to generate tokens
const generateAccessToken = (user) => {
    return jsonwebtoken_1.default.sign({ id: user.id, username: user.username, email: user.email }, JWT_ACCESS_SECRET, {
        expiresIn: ACCESS_TOKEN_EXPIRY,
    });
};
const generateRefreshToken = (user) => {
    return jsonwebtoken_1.default.sign({ id: user.id, username: user.username, email: user.email }, JWT_REFRESH_SECRET, {
        expiresIn: REFRESH_TOKEN_EXPIRY,
    });
};
const setTokenCookies = (res, accessToken, refreshToken) => {
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
const clearTokenCookies = (res) => {
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
exports.clearTokenCookies = clearTokenCookies;
const register = async (req, res) => {
    try {
        const { username, email, password } = req.body;
        // Check if user exists
        const existingUser = await db_service_1.prisma.user.findFirst({
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
        const salt = await bcrypt_1.default.genSalt(10);
        const passwordHash = await bcrypt_1.default.hash(password, salt);
        const user = await db_service_1.prisma.user.create({
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
        await db_service_1.prisma.refreshToken.create({
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
    }
    catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({
            success: false,
            error: { message: 'Internal server error occurred' },
        });
    }
};
exports.register = register;
const login = async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await db_service_1.prisma.user.findUnique({ where: { email } });
        if (!user) {
            res.status(401).json({
                success: false,
                error: { message: 'Invalid credentials' },
            });
            return;
        }
        const isMatch = await bcrypt_1.default.compare(password, user.passwordHash);
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
        await db_service_1.prisma.refreshToken.deleteMany({ where: { userId: user.id } });
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_EXPIRY_DAYS);
        await db_service_1.prisma.refreshToken.create({
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
    }
    catch (error) {
        console.error('Login error:', error);
        res.status(500).json({
            success: false,
            error: { message: 'Internal server error occurred' },
        });
    }
};
exports.login = login;
const logout = async (req, res) => {
    try {
        const refreshToken = req.cookies.refreshToken;
        if (refreshToken) {
            await db_service_1.prisma.refreshToken.deleteMany({ where: { token: refreshToken } });
        }
        (0, exports.clearTokenCookies)(res);
        res.status(200).json({
            success: true,
            data: { message: 'Logged out successfully' },
        });
    }
    catch (error) {
        console.error('Logout error:', error);
        res.status(500).json({
            success: false,
            error: { message: 'Internal server error occurred' },
        });
    }
};
exports.logout = logout;
const refresh = async (req, res) => {
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
        const savedToken = await db_service_1.prisma.refreshToken.findUnique({
            where: { token: refreshToken },
            include: { user: true },
        });
        if (!savedToken || savedToken.expiresAt < new Date()) {
            if (savedToken) {
                await db_service_1.prisma.refreshToken.delete({ where: { id: savedToken.id } });
            }
            (0, exports.clearTokenCookies)(res);
            res.status(401).json({
                success: false,
                error: { message: 'Session expired. Please log in again.' },
            });
            return;
        }
        // Verify token signature
        try {
            jsonwebtoken_1.default.verify(refreshToken, JWT_REFRESH_SECRET);
        }
        catch (err) {
            await db_service_1.prisma.refreshToken.delete({ where: { id: savedToken.id } });
            (0, exports.clearTokenCookies)(res);
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
    }
    catch (error) {
        console.error('Refresh token error:', error);
        res.status(500).json({
            success: false,
            error: { message: 'Internal server error occurred' },
        });
    }
};
exports.refresh = refresh;
const forgotPassword = async (req, res) => {
    try {
        const { email } = req.body;
        // Keep response generic to prevent user enumeration
        res.status(200).json({
            success: true,
            data: { message: 'If the email exists, a password reset link has been sent.' },
        });
    }
    catch (error) {
        console.error('ForgotPassword error:', error);
        res.status(500).json({
            success: false,
            error: { message: 'Internal server error occurred' },
        });
    }
};
exports.forgotPassword = forgotPassword;
const resetPassword = async (req, res) => {
    try {
        const { token, newPassword } = req.body;
        // For this simple version, token can just be username/email or custom string
        // Let's implement a dummy check. If token starts with reset_token_ prefix, we use it.
        // In production, we'd verify a signed JWT or db token.
        let userEmail;
        try {
            const decoded = jsonwebtoken_1.default.verify(token, JWT_REFRESH_SECRET);
            userEmail = decoded.email;
        }
        catch {
            res.status(400).json({
                success: false,
                error: { message: 'Invalid or expired reset token' },
            });
            return;
        }
        const user = await db_service_1.prisma.user.findUnique({ where: { email: userEmail } });
        if (!user) {
            res.status(404).json({
                success: false,
                error: { message: 'User not found' },
            });
            return;
        }
        const salt = await bcrypt_1.default.genSalt(10);
        const passwordHash = await bcrypt_1.default.hash(newPassword, salt);
        await db_service_1.prisma.user.update({
            where: { id: user.id },
            data: { passwordHash },
        });
        res.status(200).json({
            success: true,
            data: { message: 'Password reset successfully' },
        });
    }
    catch (error) {
        console.error('ResetPassword error:', error);
        res.status(500).json({
            success: false,
            error: { message: 'Internal server error occurred' },
        });
    }
};
exports.resetPassword = resetPassword;
