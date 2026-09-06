const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
    host : "smtp.gmail.com",
    port : 587,
    secure : false,

    auth:{
        user:"sutharhimesh880@gmail.com",
        pass : "pyzvwdpgneyipqry",
    }
})

const sendEmailVarification = async (email , token) => {
    const verificationURL = `${process.env.CLIENT_URL}/verify-email?token=${token}`

    await transporter.sendMail({
        from:`"MY CHAT APP" <${process.env.EMAIL_FROM}>`,
        to:email,
        subject:"verify email",
        html:
        `
        <h2>Verify your email</h2>

      <p>
        Thanks for registering.
        Please click the button below to verify your email.
      </p>

      <a
        href="${verificationURL}"
        style="
          display:inline-block;
          padding:12px 20px;
          background:#000;
          color:#fff;
          text-decoration:none;
          border-radius:5px;
        "
      >
        Verify Email
      </a>

      <p>This link will expire in 24 hours.</p>
    `

    });
};

module.exports = {sendEmailVarification}