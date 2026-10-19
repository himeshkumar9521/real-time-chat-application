const jwt = require("jsonwebtoken");
const { User } = require("../models/user");

function readCookie(cookieHeader, name) {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    const key = part.slice(0, separator).trim();
    if (key === name) return decodeURIComponent(part.slice(separator + 1).trim());
  }
  return null;
}

async function requireAuth(req, res, next) {
  try {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      return res.status(500).json({ message: "JWT_SECRET is not configured" });
    }

    const authorization = req.get("authorization") || "";
    const bearer = authorization.startsWith("Bearer ")
      ? authorization.slice(7).trim()
      : "";
    const token = req.cookies?.token || bearer;

    if (!token) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const payload = jwt.verify(token, secret);
    const userId = payload.userid || payload.userId || payload.sub;
    if (!userId) {
      return res.status(401).json({ message: "Invalid authentication token" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(401).json({ message: "Account not found" });
    }
    if (!user.emailVerified) {
      return res.status(403).json({ message: "Please verify your email first" });
    }

    req.authUser = user;
    req.authUserId = String(user._id);
    return next();
  } catch (err) {
    if (["JsonWebTokenError", "TokenExpiredError", "CastError"].includes(err.name)) {
      return res.status(401).json({ message: "Invalid or expired authentication token" });
    }
    console.error("Authentication error:", err);
    return res.status(500).json({ message: "Authentication failed" });
  }
}

module.exports = { requireAuth };
