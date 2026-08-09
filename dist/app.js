"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const auth_routes_1 = __importDefault(require("./routes/auth.routes"));
const user_routes_1 = __importDefault(require("./routes/user.routes"));
const conversation_routes_1 = __importDefault(require("./routes/conversation.routes"));
const call_routes_1 = __importDefault(require("./routes/call.routes"));
const app = (0, express_1.default)();
// Security and CORS
app.use((0, helmet_1.default)({
    contentSecurityPolicy: process.env.NODE_ENV === 'production' ? undefined : false,
}));
const allowedOrigins = [
    'http://localhost:3000',
    process.env.FRONTEND_URL
].filter(Boolean);
app.use((0, cors_1.default)({
    origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        }
        else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
}));
app.use(express_1.default.json());
app.use((0, cookie_parser_1.default)());
// Routing
app.use('/api/auth', auth_routes_1.default);
app.use('/api/users', user_routes_1.default);
app.use('/api/conversations', conversation_routes_1.default);
app.use('/api/calls', call_routes_1.default);
// Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).json({ success: true, data: { status: 'OK' } });
});
// Centralized error handling middleware
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    const status = err.status || 500;
    const message = err.message || 'Internal server error';
    res.status(status).json({
        success: false,
        error: {
            message,
            ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
        },
    });
});
exports.default = app;
