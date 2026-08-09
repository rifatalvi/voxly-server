"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authenticate = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'voxly_secret_access_token_sign_key_987654321';
const authenticate = (req, res, next) => {
    let token;
    // 1. Check cookies first
    if (req.cookies && req.cookies.accessToken) {
        token = req.cookies.accessToken;
    }
    // 2. Check Authorization header
    else if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
        token = req.headers.authorization.split(' ')[1];
    }
    if (!token) {
        res.status(401).json({
            success: false,
            error: { message: 'Authentication required. No token provided.' }
        });
        return;
    }
    try {
        const decoded = jsonwebtoken_1.default.verify(token, JWT_ACCESS_SECRET);
        req.user = decoded;
        next();
    }
    catch (error) {
        res.status(401).json({
            success: false,
            error: { message: 'Unauthorized. Invalid or expired token.' }
        });
    }
};
exports.authenticate = authenticate;
