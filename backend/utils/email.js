const nodemailer = require("nodemailer");

const smtpPort = Number(process.env.SMTP_PORT || 587);

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: smtpPort,
  secure: smtpPort === 465,
  auth: {
    user: process.env.EMAIL_FROM,
    pass: process.env.SMTP_PASSWORD,
  },
});

const sendEmailVarification = async (email, token) => {
  if (
    !process.env.SMTP_HOST ||
    !process.env.EMAIL_FROM ||
    !process.env.SMTP_PASSWORD ||
    !process.env.CLIENT_URL
  ) {
    throw new Error("Email configuration is incomplete. Check your environment variables.");
  }

  const clientUrl = process.env.CLIENT_URL.replace(/\/+$/, "");
  const verificationURL = `${clientUrl}/verify-email?token=${encodeURIComponent(token)}`;

  const info = await transporter.sendMail({
  from: `"MY CHAT APP" <${process.env.EMAIL_FROM}>`,
  to: email,
  subject: "Verify your email address",
  text: `Thanks for registering.

Verify your email using this link:
${verificationURL}

This link expires in 24 hours.`,
  html: `
    <h2>Verify your email</h2>
    <p>Thanks for registering. Click below to verify your email.</p>
    <a href="${verificationURL}">Verify Email</a>
    <p>This link will expire in 24 hours.</p>
  `,
});

console.log("Verification email send result:", {
  messageId: info.messageId,
  accepted: info.accepted,
  rejected: info.rejected,
  response: info.response,
});

return info;
};

module.exports = { sendEmailVarification };
