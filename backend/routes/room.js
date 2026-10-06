const { Router } = require("express");
const { Room } = require("../models/room");

const router = Router();

router.get("/", async (req, res) => {
  try {
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

router.post("/private" , async (req,res,next) => {
  try{
      const user1 = String(req.body?.user1 || "").trim();
      const user2 = String(req.body?.user2 || "").trim();

      if(!user1 || !user2){
        return res.status(400).json({
          message:"both user required"
        });
      }

      if(user1.toLowerCase() === user2.toLowerCase()){
        return res.status(400).json({
          message:"both users must be different"
        });
      }

      const users = [user1,user2];
      users.sort();

      const privateKey = users.join(":");

      let room = await Room.findOne({privateKey});

      if(room){
        return res.json({room});
      }

      const roomName = String(req.body?.name || "").trim();
      const exist = await Room.findOne({name:roomName});
      if(exist){
        return res.status(400).json({
          message:"room name is already used"
        });
      }
      room = await Room.create({
        name:roomName,
        type:"private",
        members:users,
        privateKey,
        createdBy:user1
      });

      res.status(200).json(room);
  }catch(err){
    console.log(err);
    res.status(500).json({
      message:"server error"
    });
  }
});


router.post("/group" , async (req,res,next) => {
  try{
    const name = String(req.body?.name || "").trim();
    const creator = String(req.body?.createdBy || "").trim();

    const members = Array.isArray(req.body?.members)?req.body.members:[];

    members = members.map((a) =>{
      String(a).trim()
    }).filter(Boolean);


    members = [...new Set(members)];

    if(!name){
      return res.status(404).json({
        message:"group name is required"
      });
    }
    
      if(exist){
        return res.status(400).json({
          message:"room name is already used"
        });
      }
    if(!creator){
      return res.status(404).json({
        message:"creator is reuired"
      });
    }

    if(!members.includes(creator)){
      members.push(creator);
    }

    if(members.length() <2){
        return res.status(400).json({
          message:"group chat should contain at least 2 members"
        });
    }

    room = await Room.create({
        name,
        type:"group",
        members,
        creator
    });

    res.status(201).json(room);
  }catch(err){
    console.log(err);
    res.status(400).json({
      message:"server error"
    });
  }
});

module.exports = router;
