const {body} = require("express-validator");

const registerValidater = [
    body("username")
    .trim()
    .notEmpty()
    .withMessage("username is required")
    .isLength({min:2,max:30})
    .withMessage("username length must between 2 to 30"),

    body("email")
    .trim()
    .notEmpty()
    .withMessage("email is required")
    .isEmail()
    .withMessage("please provide a valid email")
    .normalizeEmail(),

    body("password")
    .notEmpty()
    .withMessage("password is required")
    .isLength({min:8})
    .withMessage("password length should minimum 8")
    .matches(/[A-Z]/)
    .withMessage("password must constain atleast one uppercase letter")
    .matches(/[a-z]/)
    .withMessage("password must constain atleast one lowercase letter")
    .matches(/[0-9]/)
    .withMessage("password must constain atleast one number")
    .matches(/[!@#$%^&*]/)
    .withMessage("password must constain atleast one spacial character"),

    body("confirmPassword")
    .notEmpty()
    .withMessage("confirm password is required")
    .custom((value,{req})=>{
        if(value !== req.body.password){
            throw new Error("passwords not match")
        }

        return true
    }),
];

module.exports = {registerValidater}