const { connection } = require("mongoose");
const { Room } = require("./models/room");

const roomUsers = new Map();

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


function removeSocketFromRoom(roomId , socketId){
  const id = String(roomId);

  const users = roomUsers.get(id);

  if(!users){
    return;
  }

  users.delete(socketId);

  if(users.size === 0){
    roomUsers.delete(id);
  }
}

function isRoomMember(room , username){
  if(room.type === "general"){
    return true;
  }

  return room.members?.some(
    (member) => {
      member.toLowerCase() === username.toLowerCase();
    }
  );
}

function socketHandler(io){
  io.on("connection" ,(socket) => {
    let currUsername = null;
    let currRoomId = null;

    // JOIN ROOM

    socket.on("room:join" , async({roomId , Username}) => {
      try{
        const username = String(Username || "").trim();

        if(!roomId || !username){
          socket.emit("room:error" , {
            message:"roomId and username are required"
          });

          return;
        }

        const room = await Room.findById(roomId).lean();

        if(!room){
          socket.emit("room:erorr" , {
            message:"Room not found"
          });
        }

        if(!isRoomMember(room , username)){
          socket.emit("room:error" , {
            message:"you are not a member of this room"
          });

          return;
        }

        if(currRoomId){
          socket.leave(currRoomId);

          removeSocketFromRoom(currRoomId , socket.id);

          emitRoomUsers(io , currRoomId);
        }
        currRoomId = String(roomId);
        currUsername = username;

        socket.join(currRoomId);

        addSocketToRoom(
          currRoomId,
          socket.id,
          currusername
        );

        emitRoomUsers(io , currRoomId);

        socket.emit("room:history" , (room.messages || []).map((m) => ({
          id:m.id,
          roomId:room._id,
          senderUsername : m.senderUsername,
          content:m.content,
          createdAt: m.createdAt
        })));


        socket.emit("room::info" , {
          id:room.id,
          name:room.name,
          type:room.type,
          members:room.members || [],
          createdAt : room.createdAt || null
        });

      }catch(err){
        console.error("room:join error:" , err);

        socket.emit("room:error",{
          message:"Failed to join room"
        });
      }
    });

    //send message

    socket.on("message:send" , async({roomId , content}) =>{
      try{
        const text = String(content || "").trim();
        const targetRoomId = String(roomId || "");

        if(!text){
          socket.emit("message:error",{
            message:"message cannot be empty"
          });

          return;
        }

        if(!currUsername){
          socket.emit("message:error" , {
            message:"you are not authenticated"
          });

          return;
        }


        if(!currRoomId || currRoomId !== targetRoomId){
          socket.emit("message:error" , {
            message:"you are not connected to the room"
          });

          return;
        }

        const room = await Room.findById(targetRoomId);

        if(!room){
          socket.emit("message:error" , {
            message:"Room not found"
          });

          return;
        }

        if(!isRoomMember(targetRoomId , currUsername)){
          socket.emit("message:error" , {
            message:"you are not a member of this room"
          });

          return;
        }


        room.messages.push({
          senderUsername:currUsername,
          content:text,
        });


        await room.save();

        const msg = room.messages.at(-1);

        io.to(targetRoomId).emit("message:new" , {
          id:msg._id,
          roomId:room._id,
          senderUsername:msg.senderUsername,
          content:msg.content,
          createdAt:msg.createdAt
        });

        console.log(`${username} send message to ${room.name}`);
  
      }catch(err){
        console.error("message:send error:" , err);

        socket.emit("message:error" , {
          message:"Failed to send message"
        });
      }
    });


    socket.on("typing:start" , () =>{
      if(!currRoomId || !currUsername){
        return;
      }

      socket.to(currRoomId).emit("typing:update",{
        username:currUsername,
        isTyping:true,
      });
    });

    socket.on("typing:stop" , () => {
      if(!currRoomId || !currUsername){
        return;
      }

      socket.to(currRoomId).emit("typing:update",{
        username:currUsername,
        isTyping:false
      });
    });

    socket.on("room:leave" , () =>{
      if(!currRoomId){
        return;
      }

      const oldRoomId = currRoomId;

      socket.leave(oldRoomId);

      removeSocketFromRoom(oldRoomId,socket.id);

      emitRoomUsers(io , oldRoomId);

      currRoomId = null;

    });


    //Disconnect

    socket.on("disconnect" , () => {
      if(currRoomId){
        const oldRoomId = currRoomId;

        removeSocketFromRoom(oldRoomId , socket.id);
        emitRoomUsers(io,oldRoomId);

      }

      console.log(`socket disconnected ${socket.id}`);
    });
  });
}

module.exports = { socketHandler };
