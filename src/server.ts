import 'dotenv/config';
import http from 'http';
import app from './app';
import { connectDb } from './services/db.service';
import { redisService } from './services/redis.service';
import { SocketManager } from './sockets/socket.manager';

const PORT = process.env.PORT || 5000;

async function startServer() {
  try {
    // Check required environment variables
    const requiredEnv = [
      'DATABASE_URL',
      'REDIS_URL',
      'JWT_ACCESS_SECRET',
      'JWT_REFRESH_SECRET',
      'TURN_SECRET',
      'TURN_SERVER_DOMAIN'
    ];
    const missing = requiredEnv.filter(key => !process.env[key]);
    if (missing.length > 0) {
      throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }

    // 1. Connect to PostgreSQL
    await connectDb();

    // 2. Connect to Redis
    await redisService.connect();
    await redisService.clearAllPresence();

    // 3. Create HTTP Server
    const server = http.createServer(app);

    // 4. Initialize SocketManager
    const socketManager = new SocketManager(server);
    app.set('io', socketManager.getIo());

    // 5. Start listening
    server.listen(PORT, () => {
      console.log(`=================================`);
      console.log(`Voxly Backend Server started`);
      console.log(`Port: ${PORT}`);
      console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`=================================`);
    });

  } catch (error) {
    console.error('Error starting server:', error);
    process.exit(1);
  }
}

startServer();
