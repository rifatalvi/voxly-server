const { io } = require('../frontend/node_modules/socket.io-client');
const jwt = require('jsonwebtoken');

const JWT_ACCESS_SECRET = 'voxly_secret_access_token_sign_key_987654321';
const token = jwt.sign(
  { id: 'mock-user-id-123', username: 'testuser', email: 'test@test.com' },
  JWT_ACCESS_SECRET,
  { expiresIn: '15m' }
);

console.log('Connecting with token:', token);
const socket = io('http://localhost:5000', {
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
