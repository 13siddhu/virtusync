const express = require('express');
const http = require('http');
const path = require('path');
const socketIO = require('socket.io');

// Initialize express app and server
const app = express();
const server = http.createServer(app);
const io = socketIO(server);

// Set static folder
app.use(express.static(path.join(__dirname, 'public')));

// Rooms storage
const rooms = {};

// Socket.io connection handler
io.on('connection', (socket) => {
  console.log('New client connected:', socket.id);
  
  // Handle user joining a room
  socket.on('join', (data) => {
    const { room, userName, isCreator } = data;
    console.log(`User ${userName} joining room ${room}`);
    
    // Join the socket.io room
    socket.join(room);
    
    // Keep track of rooms and users
    if (!rooms[room]) {
      rooms[room] = { users: {} };
    }
    
    // Add user to room
    rooms[room].users[socket.id] = { userName, isCreator };
    
    // Notify others in room
    socket.to(room).emit('user-joined', { 
      id: socket.id,
      userName,
      isCreator
    });
    
    // Log room status
    console.log(`Room ${room} now has ${Object.keys(rooms[room].users).length} users`);
  });
  
  // Handle WebRTC signaling
  socket.on('offer', (data) => {
    socket.to(data.room).emit('offer', {
      offer: data.offer,
      room: data.room
    });
  });
  
  socket.on('answer', (data) => {
    socket.to(data.room).emit('answer', {
      answer: data.answer,
      room: data.room
    });
  });
  
  socket.on('ice-candidate', (data) => {
    socket.to(data.room).emit('ice-candidate', {
      candidate: data.candidate,
      room: data.room
    });
  });
  
  // Handle user leaving a room
  socket.on('leave-room', (data) => {
    handleDisconnect(socket, data.room);
  });
  
  // Handle socket disconnection
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    
    // Find which rooms this socket was in
    for (const roomId in rooms) {
      if (rooms[roomId].users && rooms[roomId].users[socket.id]) {
        handleDisconnect(socket, roomId);
      }
    }
  });
  
  // Helper function to handle disconnection
  function handleDisconnect(socket, room) {
    if (rooms[room] && rooms[room].users && rooms[room].users[socket.id]) {
      console.log(`User ${socket.id} leaving room ${room}`);
      
      // Remove user from room
      delete rooms[room].users[socket.id];
      
      // Notify others
      socket.to(room).emit('user-disconnected', { id: socket.id });
      
      // Leave the socket.io room
      socket.leave(room);
      
      // Clean up empty rooms
      if (Object.keys(rooms[room].users).length === 0) {
        console.log(`Room ${room} is now empty, cleaning up`);
        delete rooms[room];
      } else {
        console.log(`Room ${room} now has ${Object.keys(rooms[room].users).length} users`);
      }
    }
  }
});

// Set up server port
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});