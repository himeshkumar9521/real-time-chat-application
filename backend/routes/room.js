const { Router } = require("express");
const { Room } = require("../models/room");

const router = Router();

router.get("/", async (req, res) => {
  try {
    const rooms = await Room.find()
      .select("_id name isGroup createdAt")
      .sort({ createdAt: 1 })
      .lean();
    res.json(rooms);
  } catch (err) {
    res.status(400).json({ message: "server error" });
  }
});

router.post("/", async (req, res) => {
  try {
    const { name } = req.body ?? {};
    if (!name?.trim()) {
      return res.status(404).json({ message: "room name is required" });
    }
    const existing = await Room.findOne({ name: name.trim() });
    if (existing) {
      return res.json(existing);
    }
    const room = await Room.create({ name: name.trim(), isGroup: true });
    res.status(200).json(room);
  } catch (err) {
    console.log(err);
    res.status(500).json({ message: "server error" });
  }
});

module.exports = router;
