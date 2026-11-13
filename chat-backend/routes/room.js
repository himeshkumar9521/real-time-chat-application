const { Router } = require("express");
const { Room } = require("../models/room");
const { User } = require("../models/user");
const { requireAuth } = require("../auth-middleware/require-auth");
const {
  MIN_GROUP_MEMBERS,
  deleteRoomForAll,
  removeMemberFromGroup,
} = require("../utils/roomCleanup");

const router = Router();
const USERNAME_PATTERN = /^[A-Za-z]{2,30}$/;
const ROOM_NAME_PATTERN = /^[A-Za-z]{1,100}$/;

function clean(value) {
  return String(value ?? "").trim();
}

function roomSummary(room) {
  return {
    _id: String(room._id),
    name: room.name,
    type: room.type,
    members: room.members,
    createdBy: room.createdBy,
    createdAt: room.createdAt,
  };
}

function notifyRoomMembers(req, members, room) {
  const io = req.app.get("io");
  if (!io) return;
  const summary = roomSummary(room);
  for (const username of members) {
    const key = String(username).toLowerCase();
    io.to(`username:${key}`).emit("rooms:updated", { room: summary });
  }
}

// GET /api/rooms — return General plus rooms belonging to the logged-in user.
router.get("/", requireAuth, async (req, res) => {
  try {
    const username = req.authUser.username;
    const escapedUsername = username.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const memberMatch = new RegExp(`^${escapedUsername}$`, "i");
    const rooms = await Room.find({
      $or: [{ type: "general" }, { members: memberMatch }],
    })
      .select("_id name type members createdBy createdAt")
      .sort({ createdAt: 1 })
      .lean();
    return res.status(200).json(rooms);
  } catch (err) {
    console.error("Get rooms error:", err);
    return res.status(500).json({ message: "Failed to fetch rooms" });
  }
});

// POST /api/rooms/general — idempotently get or create the General room.
router.post("/general", requireAuth, async (_req, res) => {
  try {
    let room = await Room.findOne({ type: "general" });
    if (room) return res.status(200).json(roomSummary(room));

    try {
      room = await Room.create({
        name: "General",
        type: "general",
        members: [],
        createdBy: null,
      });
      return res.status(201).json(roomSummary(room));
    } catch (err) {
      // Handle concurrent requests creating General at the same time.
      room = await Room.findOne({ type: "general" });
      if (room) return res.status(200).json(roomSummary(room));
      throw err;
    }
  } catch (err) {
    console.error("Create General room error:", err);
    return res.status(500).json({ message: "Failed to create General room" });
  }
});

// POST /api/rooms/private — create or return a private room for two users.
router.post("/private", requireAuth, async (req, res) => {
  try {
    const currentUser = req.authUser;
    const suppliedUser1 = clean(req.body?.user1);
    const targetUsername = clean(req.body?.user2);

    // user1 is optional for compatibility, but cannot impersonate another user.
    if (
      suppliedUser1 &&
      suppliedUser1.toLowerCase() !== currentUser.username.toLowerCase()
    ) {
      return res.status(403).json({ message: "You cannot create a private room as another user" });
    }
    if (!USERNAME_PATTERN.test(targetUsername)) {
      return res.status(400).json({ message: "A valid second username is required" });
    }

    const targetUser = await User.findOne({ usernameKey: targetUsername.toLowerCase() });
    if (!targetUser) return res.status(404).json({ message: "Second user not found" });
    if (currentUser._id.equals(targetUser._id)) {
      return res.status(400).json({ message: "You cannot create a private room with yourself" });
    }

    const members = [currentUser.username, targetUser.username].sort((a, b) =>
      a.toLowerCase().localeCompare(b.toLowerCase())
    );
    const privateKey = members.map((name) => name.toLowerCase()).sort().join(":");

    let room = await Room.findOne({ privateKey });
    if (room) return res.status(200).json({ room: roomSummary(room) });

    try {
      // The concatenated label contains only letters, matching the room-name rule.
      room = await Room.create({
        name: members.join(""),
        type: "private",
        members,
        privateKey,
        createdBy: currentUser.username,
      });
      notifyRoomMembers(req, members, room);
      return res.status(201).json({ room: roomSummary(room) });
    } catch (err) {
      if (err.code === 11000) {
        room = await Room.findOne({ privateKey });
        if (room) return res.status(200).json({ room: roomSummary(room) });
      }
      throw err;
    }
  } catch (err) {
    console.error("Create private room error:", err);
    return res.status(500).json({ message: "Failed to create private room" });
  }
});

// POST /api/rooms/group — creator comes from the authenticated account.
router.post("/group", requireAuth, async (req, res) => {
  try {
    const name = clean(req.body?.name);
    const creator = req.authUser;

    if (!ROOM_NAME_PATTERN.test(name)) {
      return res.status(400).json({
        message: "Room name must contain only English letters (A-Z, a-z), with no spaces or symbols",
      });
    }

    if (name.toLowerCase() === "general") {
      return res.status(400).json({ message: "This room name is reserved" });
    }

    const duplicateRoom = await Room.findOne({
      type: "group",
      name: { $regex: `^${name}$`, $options: "i" },
    });
    if (duplicateRoom) {
      return res.status(409).json({ message: "Room name is already in use" });
    }

    const requestedMembers = Array.isArray(req.body?.members)
      ? req.body.members.map(clean).filter(Boolean)
      : [];

    for (const username of requestedMembers) {
      if (!USERNAME_PATTERN.test(username)) {
        return res.status(400).json({
          message: "Every member username must contain only English letters and be 2-30 characters long",
        });
      }
    }

    const memberKeys = new Set(requestedMembers.map((username) => username.toLowerCase()));
    memberKeys.add(creator.username.toLowerCase());

    const users = await User.find({ usernameKey: { $in: [...memberKeys] } })
      .select("username usernameKey")
      .lean();

    if (users.length !== memberKeys.size) {
      return res.status(404).json({ message: "One or more group members do not exist" });
    }

    const members = users.map((user) => user.username);
    if (members.length < MIN_GROUP_MEMBERS) {
      return res.status(400).json({
        message: "A group room must contain at least 3 members. Use a private conversation for two people.",
      });
    }

    const room = await Room.create({
      name,
      type: "group",
      members,
      createdBy: creator.username,
    });
    notifyRoomMembers(req, members, room);
    return res.status(201).json(roomSummary(room));
  } catch (err) {
    console.error("Create group room error:", err);
    if (err.code === 11000) {
      return res.status(409).json({ message: "Room name is already in use" });
    }
    return res.status(500).json({ message: "Failed to create group room" });
  }
});


// DELETE /api/rooms/:roomId
// Private chats are deleted for both members. In a group, the requester leaves;
// if fewer than 3 members would remain, the whole group is deleted.
router.delete("/:roomId", requireAuth, async (req, res) => {
  try {
    const io = req.app.get("io");
    const room = await Room.findById(req.params.roomId);
    if (!room) return res.status(404).json({ message: "Room not found" });

    const username = req.authUser.username;
    const isMember = (room.members || []).some(
      (member) => String(member).toLowerCase() === username.toLowerCase()
    );

    if (room.type === "general") {
      return res.status(403).json({ message: "The General room cannot be deleted" });
    }
    if (!isMember) {
      return res.status(403).json({ message: "You are not a member of this room" });
    }

    if (room.type === "private") {
      await deleteRoomForAll(io, room, room.members);
      return res.status(200).json({
        success: true,
        action: "deleted",
        message: "Private conversation deleted for all members",
      });
    }

    const result = await removeMemberFromGroup(io, room, username);
    if (result.action === "deleted") {
      return res.status(200).json({
        success: true,
        action: "deleted",
        message: `The group was deleted because it would have fewer than ${MIN_GROUP_MEMBERS} members`,
      });
    }
    return res.status(200).json({
      success: true,
      action: "left",
      room: roomSummary(result.room),
      message: "You left the group",
    });
  } catch (err) {
    console.error("Delete or leave room error:", err);
    if (err.name === "CastError") {
      return res.status(400).json({ message: "Invalid room ID" });
    }
    return res.status(500).json({ message: "Failed to delete or leave room" });
  }
});

module.exports = router;
