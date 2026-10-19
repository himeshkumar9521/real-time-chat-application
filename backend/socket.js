const jwt = require("jsonwebtoken");
const { User } = require("./models/user");
const { Room } = require("./models/room");

const roomUsers = new Map();

function readCookie(cookieHeader, name) {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    if (part.slice(0, separator).trim() === name) {
      return decodeURIComponent(part.slice(separator + 1).trim());
    }
  }
  return null;
}

function getRoomUsers(roomId) {
  const users = roomUsers.get(String(roomId)) || new Map();
  return [...new Set(users.values())];
}

function emitRoomUsers(io, roomId) {
  const id = String(roomId);
  io.to(id).emit("room:users", getRoomUsers(id));
}

function addSocketToRoom(roomId, socketId, username) {
  const id = String(roomId);
  if (!roomUsers.has(id)) roomUsers.set(id, new Map());
  roomUsers.get(id).set(socketId, username);
}

function removeSocketFromRoom(roomId, socketId) {
  const id = String(roomId);
  const users = roomUsers.get(id);
  if (!users) return;
  users.delete(socketId);
  if (users.size === 0) roomUsers.delete(id);
}

function isRoomMember(room, username) {
  if (!room || !username) return false;
  if (room.type === "general") return true;
  return Array.isArray(room.members) &&
    room.members.some((member) => member.toLowerCase() === username.toLowerCase());
}

function socketHandler(io) {
  // Authenticate sockets; never trust a client-supplied username.
  io.use(async (socket, next) => {
    try {
      const secret = process.env.JWT_SECRET;
      if (!secret) return next(new Error("Server authentication is not configured"));

      const authorization = socket.handshake.headers.authorization || "";
      const bearer = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
      const token = socket.handshake.auth?.token ||
        readCookie(socket.handshake.headers.cookie, "token") ||
        bearer;

      if (!token) return next(new Error("Authentication required"));

      const payload = jwt.verify(token, secret);
      const userId = payload.userid || payload.userId || payload.sub;
      if (!userId) return next(new Error("Invalid authentication token"));

      const user = await User.findById(userId);
      if (!user || !user.emailVerified) {
        return next(new Error("A verified account is required"));
      }

      socket.data.userId = String(user._id);
      socket.data.username = user.username;
      return next();
    } catch (_err) {
      return next(new Error("Invalid or expired authentication token"));
    }
  });

  io.on("connection", (socket) => {
    const currUsername = socket.data.username;
    let currRoomId = null;

    socket.on("room:join", async (payload = {}) => {
      try {
        const roomId = String(payload.roomId || "").trim();
        if (!roomId) {
          socket.emit("room:error", { message: "roomId is required" });
          return;
        }

        const room = await Room.findById(roomId).lean();
        if (!room) {
          socket.emit("room:error", { message: "Room not found" });
          return;
        }

        if (!isRoomMember(room, currUsername)) {
          socket.emit("room:error", { message: "You are not a member of this room" });
          return;
        }

        if (currRoomId) {
          const oldRoomId = currRoomId;
          socket.leave(oldRoomId);
          removeSocketFromRoom(oldRoomId, socket.id);
          emitRoomUsers(io, oldRoomId);
        }

        currRoomId = String(room._id);
        socket.join(currRoomId);
        addSocketToRoom(currRoomId, socket.id, currUsername);
        emitRoomUsers(io, currRoomId);

        socket.emit("room:history", (room.messages || []).map((message) => ({
          id: String(message._id),
          roomId: String(room._id),
          senderUsername: message.senderUsername,
          content: message.content,
          createdAt: message.createdAt,
        })));

        const info = {
          id: String(room._id),
          name: room.name,
          type: room.type,
          members: room.members || [],
          createdAt: room.createdAt || null,
        };
        socket.emit("room:info", info);
        // Keep the former event name for older clients.
        socket.emit("room::info", info);
      } catch (err) {
        console.error("room:join error:", err);
        socket.emit("room:error", { message: "Failed to join room" });
      }
    });

    socket.on("message:send", async (payload = {}) => {
      try {
        const text = String(payload.content ?? "").trim();
        const targetRoomId = String(payload.roomId || "");

        if (!text) {
          socket.emit("message:error", { message: "Message cannot be empty" });
          return;
        }
        if (text.length > 5000) {
          socket.emit("message:error", { message: "Message cannot exceed 5000 characters" });
          return;
        }
        if (!currRoomId || currRoomId !== targetRoomId) {
          socket.emit("message:error", { message: "You are not connected to this room" });
          return;
        }

        const room = await Room.findById(targetRoomId);
        if (!room) {
          socket.emit("message:error", { message: "Room not found" });
          return;
        }
        if (!isRoomMember(room, currUsername)) {
          socket.emit("message:error", { message: "You are not a member of this room" });
          return;
        }

        room.messages.push({ senderUsername: currUsername, content: text });
        await room.save();
        const message = room.messages[room.messages.length - 1];

        io.to(targetRoomId).emit("message:new", {
          id: String(message._id),
          roomId: String(room._id),
          senderUsername: message.senderUsername,
          content: message.content,
          createdAt: message.createdAt,
        });
        console.log(`${currUsername} sent a message to ${room.name}`);
      } catch (err) {
        console.error("message:send error:", err);
        socket.emit("message:error", { message: "Failed to send message" });
      }
    });

    socket.on("typing:start", () => {
      if (currRoomId) {
        socket.to(currRoomId).emit("typing:update", {
          username: currUsername,
          isTyping: true,
        });
      }
    });

    socket.on("typing:stop", () => {
      if (currRoomId) {
        socket.to(currRoomId).emit("typing:update", {
          username: currUsername,
          isTyping: false,
        });
      }
    });

    socket.on("room:leave", () => {
      if (!currRoomId) return;
      const oldRoomId = currRoomId;
      socket.leave(oldRoomId);
      removeSocketFromRoom(oldRoomId, socket.id);
      emitRoomUsers(io, oldRoomId);
      currRoomId = null;
    });

    socket.on("disconnect", () => {
      if (currRoomId) {
        const oldRoomId = currRoomId;
        removeSocketFromRoom(oldRoomId, socket.id);
        emitRoomUsers(io, oldRoomId);
      }
      console.log(`socket disconnected ${socket.id}`);
    });
  });
}

module.exports = { socketHandler };
