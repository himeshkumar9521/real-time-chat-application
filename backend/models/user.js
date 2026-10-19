const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema(
    {
        username:{
            type:String,
            trim:true,
            required:true,
            minlength:2,
            maxlength:30,
            match: /^[A-Za-z]{2,30}$/,
        },
        usernameKey:{
            type:String,
            required:true,
            unique:true,
            immutable:true
        },
        email:{
            type:String,
            unique:true,
            required:true,
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
            required:true,
        },
        followers:{
            type:[String],
            default:[]
        },
        followRequest:{
            type:[String],
            default:[]
        },
        following:{
            type:[String],
            default:[]
        },
        rooms:{
            type:[String],
            default:[]
        },
    },
    {
        timestamps:true
    }
);

UserSchema.pre('validate' , function(next){
    if(this.username != null){
        this.usernameKey = this.username.trim().toLowerCase();
    }

    next();
});

const User = mongoose.model("User" , UserSchema);
module.exports = {User};