const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema(
  {
    senderUsername: {
      type: String,
      required: true,
      trim: true,
    },
    content: {
      type: String,
      required: true,
      trim: true,
      maxlength: 5000,
    },
  },
  { timestamps: true }
);

const RoomSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 100,
      match: /^[A-Za-z]+$/,
    },
    type: {
      type: String,
      enum: ["general", "group", "private"],
      default: "group",
      required: true,
    },
    members: {
      type: [String],
      default: [],
    },
    privateKey: {
      type: String,
      unique: true,
      sparse: true,
      default: undefined,
    },
    createdBy: {
      type: String,
      default: null,
      trim: true,
    },
    messages: {
      type: [messageSchema],
      default: [],
    },
  },
  { timestamps: true }
);

const Room = mongoose.model("Room", RoomSchema);
module.exports = { Room };
