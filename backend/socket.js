const { connection } = require("mongoose");
const { Room } = require("./models/room");

const roomUsers = new Map();
// function socketHandler(io) {
//   io.on("connection", (socket) => {
//     let currUsername = null;
//     let currRoomId = null;

//     socket.on("room:join", async ({ roomId, Username }) => {
//       if (currUsername && currRoomId) {
//         socket.leave(currRoomId);
//         const set = roomUsers.get(currRoomId);
//         if (set) {
//           set.delete(currUsername);
//         }
//         io.to(currRoomId).emit("room:users", [
//           ...(roomUsers.get(currRoomId) ?? []),
//         ]);
//       }

//       currUsername = Username;
//       currRoomId = String(roomId);
//       socket.join(currRoomId);

//       if (!roomUsers.has(currRoomId)) {
//         roomUsers.set(currRoomId, new Set());
//       }
//       roomUsers.get(currRoomId).add(Username);
//       io.to(currRoomId).emit("room:users", [...roomUsers.get(currRoomId)]);

//       try {
//         const room = await Room.findById(roomId).lean();
//         if (room) {
//           socket.emit(
//             "room:history",
//             room.messages.map((m) => ({
//               id: m._id,
//               roomId: room._id,
//               senderUsername: m.senderUsername,
//               content: m.content,
//               createdAt: m.createdAt,
//             })),
//           );
//         }
//       } catch (err) {
//         console.error("history error:", err);
//       }
//     });
//     socket.on("message:send", async ({ roomId, content, username }) => {
//       const text = content?.trim();

//       // Check the new username variable
//       if (!text || !username)
//         return console.log("❌ Failed: Missing text or username");

//       try {
//         const room = await Room.findByIdAndUpdate(
//           roomId,
//           {
//             $push: {
//               // Use the new username variable here 👇
//               messages: { senderUsername: username, content: text },
//             },
//           },
//           { new: true },
//         );

//         if (!room) return console.log("❌ Failed: Room not found!");

//         const msg = room.messages.at(-1);
//         console.log("✅ Saved to DB. Broadcasting to room:", String(roomId));

//         io.to(String(roomId)).emit("message:new", {
//           id: msg._id,
//           roomId: room._id,
//           senderUsername: username, // And use it here 👇
//           content: text,
//           createdAt: msg.createdAt,
//         });
//       } catch (err) {
//         console.error("❌ Database Error:", err);
//       }
//     });
//     socket.on("typing:start", ({ roomId }) =>
//       socket
//         .to(String(roomId))
//         .emit("typing:update", { username: currUsername, isTyping: true }),
//     );

//     socket.on("typing:stop", ({ roomId }) =>
//       socket
//         .to(String(roomId))
//         .emit("typing:update", { username: currUsername, isTyping: false }),
//     );

//     socket.on("disconnect", () => {
//       if (currRoomId && currUsername) {
//         const set = roomUsers.get(currRoomId);
//         if (set) set.delete(currUsername);
//         io.to(currRoomId).emit("room:users", [
//           ...(roomUsers.get(currRoomId) ?? []),
//         ]);
//       }
//     });
//   });
// }

function getRoomUsers(roomId){
  const users = roomUsers.get(String(roomId)) || new Map();

  const uniqueUsers = [...new Set(users.values())];

  return uniqueUsers;
}

function emitRoomUsers(io,roomId){
  const id = String(roomId);

    io.to(id).emit("room:users" , getRoomUsers(id));
}

function addSocketToRoom(roomId , socketId , username){
  const id = String(roomId);

  if(roomUsers.has(id)){
    roomUsers.get(id , new Map());
  }

  roomUsers.get(id).set(socketId , username);
}



module.exports = { socketHandler };
