/**
 * Voice Priority App Server
 * Multi-protocol video streaming chat application supporting WebRTC, HLS, and MSE
 */

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

// Initialize Express app and Socket.IO server
const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve static files from public directory
app.use(express.static("public"));

// Store active rooms and their users
const rooms = new Map(); // Map<roomId, Set<username>>

// Handle Socket.IO connections
io.on("connection", (socket) => {
  console.log("user connected", socket.id);

  // Handle user joining a room
  socket.on("join-room", ({ room, name }) => {
    socket.join(room);
    socket.room = room;
    socket.username = name;
    
    // Create room if it doesn't exist
    if (!rooms.has(room)) {
      rooms.set(room, new Set());
    }
    rooms.get(room).add(name);
    
    const users = Array.from(rooms.get(room));
    socket.emit("joined-room", { room, user: name, users });
    socket.to(room).emit("user-joined", { user: name, users, userId: socket.id });
  });

  // Handle chat messages
  socket.on("message", ({ room, user, message }) => {
    io.to(room).emit("message", { user, message });
  });

  // Handle basic screen sharing (canvas-based)
  socket.on("start-screen-share", ({ room, user }) => {
    socket.to(room).emit("screen-share-started", { user });
  });

  socket.on("stop-screen-share", ({ room, user }) => {
    socket.to(room).emit("screen-share-stopped", { user });
  });

  socket.on("screen-frame", ({ room, frame }) => {
    socket.to(room).emit("screen-frame", { frame });
  });

  // Handle MSE video chunks
  socket.on("video-chunk", ({ room, chunk }) => {
    socket.to(room).emit("video-chunk", { chunk });
  });

  // Handle HLS streaming requests
  socket.on("request-hls-stream", ({ room, user }) => {
    const streamUrl = `/hls/${room}/playlist.m3u8`;
    socket.to(room).emit("hls-stream-started", { user, streamUrl });
  });

  socket.on("stop-hls-stream", ({ room, user }) => {
    socket.to(room).emit("hls-stream-stopped", { user });
  });

  // New: Get room users for WebRTC
  socket.on("get-room-users", ({ room }) => {
    if (rooms.has(room)) {
      const roomSockets = Array.from(io.sockets.adapter.rooms.get(room) || []);
      socket.emit("room-users", { users: roomSockets });
    }
  });

  // Handle WebRTC signaling
  socket.on("webrtc-share-started", ({ room, user }) => {
    socket.to(room).emit("webrtc-share-started", { user, userId: socket.id });
  });

  socket.on("webrtc-share-stopped", ({ room, user }) => {
    socket.to(room).emit("webrtc-share-stopped", { user, userId: socket.id });
  });

  // WebRTC peer-to-peer signaling
  socket.on("webrtc-offer", ({ to, offer }) => {
    io.to(to).emit("webrtc-offer", { from: socket.id, offer });
  });

  socket.on("webrtc-answer", ({ to, answer }) => {
    io.to(to).emit("webrtc-answer", { from: socket.id, answer });
  });

  socket.on("webrtc-ice-candidate", ({ to, candidate }) => {
    io.to(to).emit("webrtc-ice-candidate", { from: socket.id, candidate });
  });

  // Handle user disconnection
  socket.on("disconnect", () => {
    if (socket.room && socket.username) {
      const roomUsers = rooms.get(socket.room);
      if (roomUsers) {
        roomUsers.delete(socket.username);
        const users = Array.from(roomUsers);
        // Clean up empty rooms
        if (roomUsers.size === 0) {
          rooms.delete(socket.room);
        } else {
          socket.to(socket.room).emit("user-left", { user: socket.username, users, userId: socket.id });
        }
      }
    }
    console.log("user disconnected", socket.id);
  });
});


// Start server
const PORT = 3000;
server.listen(PORT, () => console.log(`Server on http://localhost:${PORT}/protocol-selector.html`));