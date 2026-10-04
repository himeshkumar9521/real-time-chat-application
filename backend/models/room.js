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
  {_id:true}
);

const RoomSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    type:{
      type:String,
      enum:["general" , "group" , "private"],
      default:"group",
    },
    members:{
      type:[String],
      default:[],
    },
    privateKey:{
      type:String,
      unique:true,
      sparse:true,
    },
    // isGroup: {
    //   type: Boolean,
    //   default: true,
    // },
    createdBy:{
      type:String,
      default:null,
    },
    messages: {
      type:[messageSchema],
      default:[]
    },
  },
  { timestamps: true },
);

const Room = mongoose.model("Room", RoomSchema);

module.exports = { Room };
