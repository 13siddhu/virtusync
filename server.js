const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Store active rooms and their participants
const rooms = {};

// Socket.IO connection handler
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);
  
  // Create room
  socket.on('create-room', ({ roomId, userName }) => {
    // Store user info with socket id
    socket.userData = { userName, roomId };
    
    // Create room if it doesn't exist
    if (!rooms[roomId]) {
      rooms[roomId] = { users: {} };
    }
    
    // Add user to room
    rooms[roomId].users[socket.id] = { userName };
    
    // Join socket to room
    socket.join(roomId);
    
    // Inform user the room was created/joined
    socket.emit('room-joined', { 
      roomId, 
      users: Object.values(rooms[roomId].users).map(u => u.userName)
    });
    
    // Inform other users in the room about the new user
    socket.to(roomId).emit('user-joined', { 
      userName, 
      userId: socket.id 
    });
    
    console.log(`User ${userName} created/joined room: ${roomId}`);
  });

  // Handle user joining existing room
  socket.on('join-room', ({ roomId, userName }) => {
    // Check if room exists
    if (!rooms[roomId]) {
      socket.emit('error', { message: 'Room does not exist' });
      return;
    }
    
    // Store user info
    socket.userData = { userName, roomId };
    
    // Add user to room
    rooms[roomId].users[socket.id] = { userName };
    
    // Join socket to room
    socket.join(roomId);
    
    // Inform user they joined the room
    socket.emit('room-joined', { 
      roomId, 
      users: Object.values(rooms[roomId].users).map(u => u.userName)
    });
    
    // Inform other users in the room about the new user
    socket.to(roomId).emit('user-joined', { 
      userName, 
      userId: socket.id 
    });
    
    console.log(`User ${userName} joined room: ${roomId}`);
  });

  // Handle messages
  socket.on('send-message', ({ message }) => {
    const { roomId, userName } = socket.userData;
    
    if (roomId && rooms[roomId]) {
      // Broadcast message to all users in the room
      io.to(roomId).emit('new-message', {
        userId: socket.id,
        userName,
        message,
        timestamp: new Date().toISOString()
      });
    }
  });

  // WebRTC signaling: Handle offers
  socket.on('offer', ({ roomId, sdp, to }) => {
    console.log(`Forwarding offer from ${socket.id} to ${to}`);
    io.to(to).emit('offer', {
      from: socket.id,
      sdp
    });
  });

  // WebRTC signaling: Handle answers
  socket.on('answer', ({ roomId, sdp, to }) => {
    console.log(`Forwarding answer from ${socket.id} to ${to}`);
    io.to(to).emit('answer', {
      from: socket.id,
      sdp
    });
  });

  // WebRTC signaling: Handle ICE candidates
  socket.on('ice-candidate', ({ roomId, candidate, to }) => {
    console.log(`Forwarding ICE candidate from ${socket.id} to ${to}`);
    io.to(to).emit('ice-candidate', {
      from: socket.id,
      candidate
    });
  });

  // Handle user disconnection
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    
    // Check if user was in a room
    const { roomId, userName } = socket.userData || {};
    
    if (roomId && rooms[roomId]) {
      // Remove user from room
      delete rooms[roomId].users[socket.id];
      
      // Inform other users about disconnection
      socket.to(roomId).emit('user-left', { userId: socket.id, userName });
      
      // If room is empty, remove it
      if (Object.keys(rooms[roomId].users).length === 0) {
        delete rooms[roomId];
        console.log(`Room ${roomId} was deleted (empty)`);
      }
    }
  });

  // Handle explicit room leaving
  socket.on('leave-room', () => {
    const { roomId, userName } = socket.userData || {};
    
    if (roomId && rooms[roomId]) {
      // Remove user from room
      delete rooms[roomId].users[socket.id];
      
      // Leave socket room
      socket.leave(roomId);
      
      // Inform other users
      socket.to(roomId).emit('user-left', { userId: socket.id, userName });
      
      // Reset user data
      socket.userData = {};
      
      // If room is empty, remove it
      if (Object.keys(rooms[roomId].users).length === 0) {
        delete rooms[roomId];
        console.log(`Room ${roomId} was deleted (empty)`);
      }
      
      socket.emit('room-left');
    }
  });
});

// Define routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});