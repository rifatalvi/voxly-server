"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const http_1 = __importDefault(require("http"));
const app_1 = __importDefault(require("./app"));
const db_service_1 = require("./services/db.service");
const redis_service_1 = require("./services/redis.service");
const socket_manager_1 = require("./sockets/socket.manager");
const PORT = process.env.PORT || 5000;
async function startServer() {
    try {
        // 1. Connect to PostgreSQL
        await (0, db_service_1.connectDb)();
        // 2. Connect to Redis
        await redis_service_1.redisService.connect();
        // 3. Create HTTP Server
        const server = http_1.default.createServer(app_1.default);
        // 4. Initialize SocketManager
        const socketManager = new socket_manager_1.SocketManager(server);
        app_1.default.set('io', socketManager.getIo());
        // 5. Start listening
        server.listen(PORT, () => {
            console.log(`=================================`);
            console.log(`Voxly Backend Server started`);
            console.log(`Port: ${PORT}`);
            console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
            console.log(`=================================`);
        });
    }
    catch (error) {
        console.error('Error starting server:', error);
        process.exit(1);
    }
}
startServer();
