const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema(
  {
    senderUsername: {
      type: String,
      required: true,
    },
    content: {
      type: String,
      required: true,
      trim: true,
    },
  },
  { timestamps: true },
);

const RoomSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    isGroup: {
      type: Boolean,
      default: true,
    },
    messages: [messageSchema],
  },
  { timestamps: true },
);

const Room = mongoose.model("Room", RoomSchema);

module.exports = { Room };
