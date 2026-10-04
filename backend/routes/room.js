const { Router } = require("express");
const { Room } = require("../models/room");

const router = Router();

router.get("/", async (req, res) => {
  try {
    // const rooms = await Room.find()
    //   .select("_id name isGroup createdAt")
    //   .sort({ createdAt: 1 })
    //   .lean();
    // res.json(rooms);
    const username = String(req.query.username || "").trim();
    let rooms;
    if(username){
      rooms = await Room.find({
        $or:[
          {type:"general"},
          {members:username},
        ],
      })
      .select("_id name members createdBy createAt")
      .sort({createdAt:1})
      .lean();
    }else{
      rooms = await Room.find({
        type:"general"
      })
      .select("_id name members createdBy createAt")
      .sort({createdAt:1})
      .lean();
    }

    res.json(rooms);
  } catch (err) {
    console.log(err); 
    res.status(500).json({ message: "server error" });
  }
});

router.post("/general" , async (req,res,next) => {
  try{
    const room = await Room.findOne({type:"general"});

    if(room){
      return res.json(room);
    }

    room = await Room.create({
      name:"General",
      type:"general",
      members:[]
    });

    res.status(200).json(room);
  }catch(err){
    console.log(err);
    res.status(500).json({
      message:"server error"
    });
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
