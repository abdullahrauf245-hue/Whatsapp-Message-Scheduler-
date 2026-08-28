const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const cors = require('cors');
require('dotenv').config();

const { initDb } = require('./src/db/database');
const waClient = require('./src/whatsapp/client');
const schedulerEngine = require('./src/scheduler/engine');
const apiRoutes = require('./src/routes/api');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 3000;

// Express Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Routes
app.use('/api', apiRoutes);

// Socket.io Connection
io.on('connection', (socket) => {
  console.log('⚡ Socket client connected:', socket.id);

  // Send current status immediately on connection
  socket.emit('status_update', waClient.getStatus());

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// Attach Socket.io instance to WhatsApp Client broadcaster
waClient.setSocketIO(io);

// Initialize DB, WhatsApp Client & Scheduler Engine
async function startServer() {
  try {
    await initDb();
    console.log('✅ SQLite Database Tables initialized.');

    server.listen(PORT, () => {
      console.log(`\n==================================================`);
      console.log(`🚀 WhatsApp Scheduler Server active on port: ${PORT}`);
      console.log(`🌐 Open Dashboard: http://localhost:${PORT}`);
      console.log(`==================================================\n`);

      // Initialize WhatsApp Baileys Client
      waClient.initialize();

      // Start Background Scheduler Task Engine
      schedulerEngine.start();
    });
  } catch (err) {
    console.error('❌ Failed to start server:', err);
  }
}

startServer();
