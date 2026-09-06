const {Router} = require('express');
const { User } = require('../models/user');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const { registerValidater } = require('../validator/validation-user');
const { validate } = require('../auth-middleware/auth-verified');
const { generateToken } = require('../utils/emailValidation');
const { sendEmailVarification } = require('../utils/email');
const jwt = require("jsonwebtoken");
const router = Router();

router.post("/register" ,registerValidater,validate, async (req,res,next) => {
    try{
    const {username , email , password} = req.body;
    const existingUser = await User.findOne({email});
    if(existingUser){
        res.status(409).json({
            message:"User is already exist"
        })  
        const {token,hashedToken , expire} = generateToken();
    
        existingUser.username = username;
        existingUser.password = await bcrypt.hash(password,12);
        existingUser.emailVerificationToken = hashedToken;
        existingUser.emailVerifcationexpire = expire;
    
        await existingUser.save();
    
        await sendEmailVarification(email,token);
    
        return res.status(200).json({
            message:"email is already exist but not verified.So new verification link has been send"
        });
    }

    const {token,hashedToken,expire} = generateToken();

    const hashpassword = await bcrypt.hash(password,12);

    await User.create({
        username:username,
        email:email,
        password:hashpassword,
        emailVerified:false,
        emailVerificationToken:hashedToken,
        emailVerifcationexpire:expire
    })

    await sendEmailVarification(email,token);

    return res.status(200).json({
        success:true,
        message:"Registration successful.please check the email verify"
    });

}catch(err){

    res.json({message:err.message});
}
});

router.get("/email-verify" , async (req,res,next) => {
    try{
        const {token} = req.query;

        if(!token){
            return res.status(404).json({
                message:"token is required"
            })
        }
        const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

        const user = await User.findOne({emailVerificationToken:hashedToken});

        if(!user){
            return res.status(400).json({
                message:"invalid token"
            });
        }

        if(!user.emailVerifcationexpire || user.emailVerifcationexpire< new Date()){
            return res.status(400).json({
                message:"verification token expired"
            });
        }

        user.emailVerified = true;
        user.emailVerifcationexpire = null;
        user.emailVerificationToken = null;

        await user.save();


        return res.status(200).json({
            success:true,
            message:"verification successfully done"
        })
    }
    catch(err){
        res.status(422).json({
            message:"failed to verify",
            err
        });
    }
});

router.post("/log-in" , async (req,res,next) => {
    try{
        const {email,password} = req.body;

        const user = await User.findOne({email:email});
        if(!user){
            return res.status(404).json({
                success:false,
                message:"User not exist"
            });
        }
        const isMatch = await bcrypt.compare(password,user.password);
        if(!isMatch){
            return res.status(422).json({
                success:false,
                message:"incorrect password",
            })
        }

        if(user.emailVerified === false){

            const {token,hashtoken , expire} = generateToken();

            user.emailVerifcationexpire = expire;
            user.emailVerificationToken = hashtoken;

            await user.save();

            await sendEmailVarification(token , email);
            return res.status(422).json({
                success:false,
                message:"user email is not verified.verification link has been send"
            })
        }

        const payload = {
            userid : user._id,
            username : user.username
        }

        const jwtToken = jwt.sign(
            payload,
            process.env.JWT_SECRET,
            {
            expiresIn:"1d"
            }
        );

        res.cookie("token" , jwtToken , {
            httpOnly:true,
            secure:"p" === "p",
            sameSite:"lax",
            maxAge:24*60*60*1000
        });

        res.status(200).json({
            success:true,
            message:"login successfully",
            jwtToken
        });

    }
    catch(err){
        res.status(409).json({
            success:false,
            message:"failed to login",
            err
        });
    }
});

router.get("/logout" ,  (req,res,next) => {
    try{
    res.clearCookie("token" , {
        httpOnly:true,
        secure:"production" === "production",
        sameSite:"lax"
    });

    res.status(200).json({
        success:true,
        message:"logout successfully"
    });
    }
    catch(err){
        res.status(422).json({
            success:false,
            message:"falied to logout".
            err
        });
    }   
});


router.post("/deleteUser" , async (req,res,next) => {
    try{
        const {email} = req.body;

        const user = await User.findOne({email:email});
        
        if(!user){
            return res.status(409).json({
                success:false,
                message:"user is not exist",
            });
        }

        await User.deleteOne({email:email});

        res.clearCookie("token" , {
            httpOnly:true,
            secure:"production" === "production",
            sameSite:"lax"
        });

        res.status(200).json({
            success:true,
            message:"user Deleted successfully"
        });
        
    }catch(err){
        res.status(404).json({
            success:false,
            message:"failed to delete user",
            err
        });
    }
});

router.post("/change-username" , async (req,res,next) => {
    const {newUsername , email} = req.body;

    const user = await User.findOne({email:email});

    if(!user){
        return res.status(404).json({
            success:false,
            message:"user not exist"
        });
    }

    await User.updateOne({
        username:newUsername
    });

    res.status(200).json({
        success:true,
        message:"username name is change successfully"
    });
});

router.post("/follow-request" , async (req,res,next) => {
    try{

    const {toFollow , ByFollow} = req.body;

    const user1 = await User.find({toFollow});
    const user2 = await User.findOne({ByFollow});

    if(!user1 || !user2){
        return res.status(422).json({
            success:false,
            message:"user not  existed"
        });
    }

    const ifFollow = user1.followRequest.includes(ByFollow);
    if(ifFollow){
            res.status(409).json({
                success:false,
                message:"already in request list"
            });
    }

    user1.followRequest.push(ByFollow);
    await user1.save();

    res.status(200).json({
        success:true,
        message:"requestd is successfully added"
    });
}catch(err){
       res.status(404).json({
            success:false,
            message:"failed request"
       }); 
}

});

router.post("follow-request-accept" , async (req,res,next) => {
    try{
        const {toFollow , ByFollow} = req.body;

    const user1 = await User.find({toFollow});
    const user2 = await User.findOne({ByFollow});

    if(!user1 || !user2){
        return res.status(422).json({
            success:false,
            message:"user not  existed"
        });
    }

    const ifFollow = user1.followers.includes(ByFollow);
    if(ifFollow){
            res.status(409).json({
                success:false,
                message:"already follower"
            });
    }

    user1.followRequest = user1.followRequest.filter(users => {users !== ByFollow});
    await user1.save();

    user1.followers.push(ByFollow);
    await user1.save();

    res.status(200).json({
        success:true,
        message:"requestd is successfully added"
    });
    }catch(err){
        res.status(422).json({
            success:false,
            message:"failed to accept the follow-request"
        });
    }
});

module.exports = router;
