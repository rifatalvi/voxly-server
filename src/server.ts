import 'dotenv/config';
import http from 'http';
import app from './app';
import { connectDb } from './services/db.service';
import { redisService } from './services/redis.service';
import { SocketManager } from './sockets/socket.manager';

const PORT = process.env.PORT || 5000;

async function startServer() {
  try {
    // 1. Connect to PostgreSQL
    await connectDb();

    // 2. Connect to Redis
    await redisService.connect();

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
