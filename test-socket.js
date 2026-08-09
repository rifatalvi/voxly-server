require('dotenv').config();
const { io } = require('../frontend/node_modules/socket.io-client');
const jwt = require('jsonwebtoken');

const JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET;
const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL;

const token = jwt.sign(
  { id: 'mock-user-id-123', username: 'testuser', email: 'test@test.com' },
  JWT_ACCESS_SECRET,
  { expiresIn: '15m' }
);

console.log('Connecting with token to:', socketUrl);
const socket = io(socketUrl, {
  auth: { token },
  transports: ['websocket']
});

socket.on('connect', () => {
  console.log('Successfully connected to socket server!');
  socket.disconnect();
  process.exit(0);
});

socket.on('connect_error', (err) => {
  console.error('Connection error:', err.message);
  console.error(err);
  process.exit(1);
});

setTimeout(() => {
  console.log('Connection timed out');
  process.exit(1);
}, 5000);
