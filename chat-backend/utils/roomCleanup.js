const { Room } = require("../models/room");
const { User } = require("../models/user");
const { purgeRoom, purgeUserFromRoom } = require("../socket");

const MIN_GROUP_MEMBERS = 3;

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function summary(room) {
  return {
    _id: String(room._id),
    name: room.name,
    type: room.type,
    members: room.members,
    createdBy: room.createdBy,
    createdAt: room.createdAt,
  };
}

function emitToUsers(io, usernames, event, payload) {
  if (!io) return;
  for (const name of usernames) {
    io.to(`username:${String(name).toLowerCase()}`).emit(event, payload);
  }
}

// Delete a room for everyone and tell every affected client.
async function deleteRoomForAll(io, room, notifyUsernames) {
  const id = String(room._id);
  const targets = notifyUsernames || room.members || [];
  await Room.deleteOne({ _id: room._id });
  if (!io) return;
  emitToUsers(io, targets, "rooms:removed", { roomId: id });
  io.to(id).emit("room:deleted", { roomId: id });
  purgeRoom(io, id);
}

// Remove one user from a group. Groups with fewer than 3 members left are
// deleted for everybody. Returns "deleted" or "left".
async function removeMemberFromGroup(io, room, username) {
  const key = username.toLowerCase();
  const oldMembers = [...room.members];
  const remaining = oldMembers.filter((m) => String(m).toLowerCase() !== key);

  if (remaining.length < MIN_GROUP_MEMBERS) {
    await deleteRoomForAll(io, room, oldMembers);
    return { action: "deleted", room: null };
  }

  room.members = remaining;
  if (String(room.createdBy || "").toLowerCase() === key) {
    room.createdBy = remaining[0];
  }
  await room.save();

  if (io) {
    emitToUsers(io, [username], "rooms:removed", { roomId: String(room._id) });
    await purgeUserFromRoom(io, room._id, username);
    emitToUsers(io, remaining, "rooms:updated", { room: summary(room) });
  }
  return { action: "left", room };
}

// Remove everything a deleted account owns: private chats are deleted and the
// user leaves every group, so a future user re-using the username can never
// inherit this person's conversations.
async function removeUserFromAllRooms(io, username) {
  const rooms = await Room.find({
    type: { $in: ["private", "group"] },
    members: new RegExp(`^${escapeRegex(username)}$`, "i"),
  });
  for (const room of rooms) {
    if (room.type === "private") {
      await deleteRoomForAll(io, room, room.members);
    } else {
      await removeMemberFromGroup(io, room, username);
    }
  }
  // Messages the user wrote in surviving groups must not be attributable to a
  // later account that registers the same name.
  await Room.updateMany(
    { "messages.senderUsername": new RegExp(`^${escapeRegex(username)}$`, "i") },
    { $set: { "messages.$[m].senderUsername": "Deleted user" } },
    { arrayFilters: [{ "m.senderUsername": new RegExp(`^${escapeRegex(username)}$`, "i") }] }
  );
}

// Startup repair for data created by earlier versions.
async function repairRooms() {
  const users = await User.find().select("username usernameKey").lean();
  const byKey = new Map(users.map((u) => [u.usernameKey, u.username]));
  const rooms = await Room.find({ type: { $in: ["private", "group"] } });
  let fixed = 0;
  for (const room of rooms) {
    const seen = new Set();
    const members = [];
    for (const m of room.members) {
      const k = String(m).toLowerCase();
      if (byKey.has(k) && !seen.has(k)) {
        seen.add(k);
        members.push(byKey.get(k));
      }
    }
    const invalid =
      (room.type === "group" && members.length < MIN_GROUP_MEMBERS) ||
      (room.type === "private" && members.length !== 2);
    if (invalid) {
      await Room.deleteOne({ _id: room._id });
      fixed++;
    } else if (members.length !== room.members.length) {
      room.members = members;
      await room.save();
      fixed++;
    }
  }
  if (fixed) console.log(`Room repair: fixed or removed ${fixed} room(s)`);
}

module.exports = {
  MIN_GROUP_MEMBERS,
  summary,
  deleteRoomForAll,
  removeMemberFromGroup,
  removeUserFromAllRooms,
  repairRooms,
};
