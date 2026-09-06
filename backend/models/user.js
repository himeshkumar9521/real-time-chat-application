const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema(
    {
        username:{
            type:String,
            trim:true,
            required:true,
        },
        email:{
            type:String,
            unique:true,
            require:true,
            trim:true,
        },
        emailVerified:{
            type:Boolean,
            default:false
        },
        emailVerificationToken:{
            type:String,
            default:null
        },
        emailVerifcationexpire:{
            type:Date,
            default:null
        },
        password:{
            type:String,
            unique:true,
            required:true,
            trim:true
        },
        followers:{
            type:[String],
            default:[]
        },
        followRequest:{
            type:[String],
            defualt:[]
        },
        following:{
            type:[String],
            defualt:[]
        },
        rooms:{
            type:[String],
            default:[]
        },
    },
    {
        timestamps:true
    }
)

const User = mongoose.model("User" , UserSchema);
module.exports = {User};