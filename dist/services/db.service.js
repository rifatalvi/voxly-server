"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.prisma = void 0;
exports.connectDb = connectDb;
const client_1 = require("@prisma/client");
exports.prisma = new client_1.PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'info', 'warn', 'error'] : ['error'],
});
async function connectDb() {
    try {
        await exports.prisma.$connect();
        console.log('PostgreSQL Database connected successfully via Prisma');
    }
    catch (error) {
        console.error('Failed to connect to PostgreSQL database:', error);
        process.exit(1);
    }
}
