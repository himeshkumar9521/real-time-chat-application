const { Router } = require("express");
const crypto = require("crypto");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const { User } = require("../models/user");
const { Room } = require("../models/room");
const { removeUserFromAllRooms } = require("../utils/roomCleanup");

const { registerValidater } = require("../validator/validation-user");
const { validate } = require("../auth-middleware/auth-verified");
const { generateToken } = require("../utils/emailValidation");
const { sendEmailVarification } = require("../utils/email");

const router = Router();

// Usernames: English letters only, 2-30 characters.
const USERNAME_PATTERN = /^[A-Za-z]{2,30}$/;

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  path: "/",
};

// Preserve username capitalization, but compare usernames
// without considering capitalization.
function cleanUsername(value) {
  return String(value ?? "").trim();
}

// Preserve email capitalization.
function cleanEmail(value) {
  return String(value ?? "").trim();
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function usernameRegex(username) {
  return new RegExp(
    `^${escapeRegex(username)}$`,
    "i"
  );
}

// Case-insensitive username lookup.
async function findUserByUsername(username) {
  const cleaned = cleanUsername(username);

  if (!cleaned) return null;

  return User.findOne({
    usernameKey: cleaned.toLowerCase(),
  });
}

// Exact, case-sensitive email lookup.
// Assumes the MongoDB collection uses its default
// case-sensitive collation.
async function findUserByEmail(email) {
  const cleaned = cleanEmail(email);

  if (!cleaned) return null;

  return User.findOne({
    email: cleaned,
  });
}

function removeUsername(values, username) {
  const wanted = cleanUsername(username).toLowerCase();

  return (Array.isArray(values) ? values : []).filter(
    (value) =>
      cleanUsername(value).toLowerCase() !== wanted
  );
}

function replaceUsername(values, oldUsername, newUsername) {
  const oldName = cleanUsername(oldUsername).toLowerCase();

  const result = [];
  const seen = new Set();

  for (const value of Array.isArray(values) ? values : []) {
    const nextValue =
      cleanUsername(value).toLowerCase() === oldName
        ? newUsername
        : value;

    const key = cleanUsername(nextValue).toLowerCase();

    if (key && !seen.has(key)) {
      seen.add(key);
      result.push(nextValue);
    }
  }

  return result;
}

// Authentication middleware.
// Accepts the login cookie or a Bearer token.
function requireAuth(req, res, next) {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    return res.status(500).json({
      message: "JWT_SECRET is not configured",
    });
  }

  const authorization = req.get("authorization") || "";

  const bearerToken = authorization.startsWith("Bearer ")
    ? authorization.slice(7).trim()
    : "";

  const token = bearerToken || req.cookies?.token;

  if (!token) {
    return res.status(401).json({
      message: "Authentication required",
    });
  }

  try {
    const payload = jwt.verify(token, secret);

    const userId =
      payload.userid ||
      payload.userId ||
      payload.sub;

    if (!userId) {
      return res.status(401).json({
        message: "Invalid authentication token",
      });
    }

    req.authUserId = String(userId);

    return next();
  } catch (err) {
    return res.status(401).json({
      message: "Invalid or expired authentication token",
    });
  }
}

async function getAuthenticatedUser(req) {
  return User.findById(req.authUserId);
}

// Update only references that belong to the account being renamed.
// Room names are independent metadata and must never be derived from
// usernames during this operation.
async function updateUsernameReferences(oldUsername, newUsername, req) {
  const pattern = usernameRegex(oldUsername);
  const oldKey = cleanUsername(oldUsername).toLowerCase();
  const affectedRooms = await Room.find({
    $or: [
      { members: pattern },
      { createdBy: pattern },
      { "messages.senderUsername": pattern },
    ],
  });

  const io = req?.app?.get("io");

  for (const room of affectedRooms) {
    let changed = false;
    let membershipChanged = false;

    if (Array.isArray(room.members) && room.members.some(
      (member) => cleanUsername(member).toLowerCase() === oldKey
    )) {
      room.members = replaceUsername(
        room.members,
        oldUsername,
        newUsername
      );
      changed = true;
      membershipChanged = true;
    }

    if (cleanUsername(room.createdBy).toLowerCase() === oldKey) {
      room.createdBy = newUsername;
      changed = true;
    }

    // Update only this user's historical sender labels. Other members'
    // messages remain associated with their original senders.
    for (const message of room.messages || []) {
      if (cleanUsername(message.senderUsername).toLowerCase() === oldKey) {
        message.senderUsername = newUsername;
        changed = true;
      }
    }

    // Private-room lookup keys are based on the two current usernames.
    // Keep the key valid, but deliberately leave room.name unchanged.
    if (membershipChanged && room.type === "private" && room.members.length === 2) {
      room.privateKey = room.members
        .map((member) => cleanUsername(member).toLowerCase())
        .sort()
        .join(":");
    }

    if (!changed) continue;

    await room.save();

    // Refresh the room list for every member currently connected.
    if (io) {
      const roomSummary = {
        _id: String(room._id),
        name: room.name,
        type: room.type,
        members: room.members,
        createdBy: room.createdBy,
        createdAt: room.createdAt,
      };

      for (const member of room.members || []) {
        io.to(`username:${cleanUsername(member).toLowerCase()}`).emit(
          "rooms:updated",
          { room: roomSummary }
        );
      }
    }
  }
}

// ------------------------------------------------------
// REGISTER
// POST /api/user/register
// ------------------------------------------------------

router.post(
  "/register",
  registerValidater,
  validate,
  async (req, res) => {
    try {
      const username = cleanUsername(req.body?.username);
      const email = cleanEmail(req.body?.email);
      const password = String(req.body?.password ?? "");

      if (!username || !email || !password) {
        return res.status(400).json({
          success: false,
          message: "Username, email, and password are required",
        });
      }

      if (!USERNAME_PATTERN.test(username)) {
        return res.status(400).json({
          success: false,
          message:
            "Username must contain only English letters (A-Z, a-z) and be 2-30 characters long",
        });
      }

      // Email lookup is case-sensitive.
      const existingEmailUser = await findUserByEmail(email);

      if (existingEmailUser) {
        if (existingEmailUser.emailVerified) {
          return res.status(409).json({
            success: false,
            message: "An account with this email already exists",
          });
        }

        // Do not change an existing account's password
        // or username through the registration endpoint.
        const {
          token,
          hashedToken,
          expire,
        } = generateToken();

        existingEmailUser.emailVerificationToken = hashedToken;
        existingEmailUser.emailVerifcationexpire = expire;

        await existingEmailUser.save();

        await sendEmailVarification(
          existingEmailUser.email,
          token
        );

        return res.status(200).json({
          success: true,
          message:
            "This email is not verified yet. A new verification link has been sent",
        });
      }

      // Username lookup is case-insensitive.
      const existingUsername =
        await findUserByUsername(username);

      if (existingUsername) {
        return res.status(409).json({
          success: false,
          message: "This username is already taken",
        });
      }

      const {
        token,
        hashedToken,
        expire,
      } = generateToken();

      const hashedPassword = await bcrypt.hash(password, 12);

      const user = await User.create({
        username,
        email,
        password: hashedPassword,
        emailVerified: false,
        emailVerificationToken: hashedToken,
        emailVerifcationexpire: expire,
        rooms: [],
      });

      await sendEmailVarification(user.email, token);

      return res.status(201).json({
        success: true,
        message:
          "Registration successful. Please check your email to verify your account",
      });
    } catch (err) {
      console.error("Registration error:", err);

      if (err.code === 11000) {
        return res.status(409).json({
          success: false,
          message: "Email or username is already in use",
        });
      }

      return res.status(500).json({
        success: false,
        message: "Registration failed. Please try again",
      });
    }
  }
);

// ------------------------------------------------------
// VERIFY EMAIL
// GET /api/user/email-verify?token=...
// ------------------------------------------------------

router.get("/email-verify", async (req, res) => {
  try {
    const token = String(req.query.token ?? "").trim();

    if (!token) {
      return res.status(400).json({
        message: "Verification token is required",
      });
    }

    const hashedToken = crypto
      .createHash("sha256")
      .update(token)
      .digest("hex");

    const user = await User.findOne({
      emailVerificationToken: hashedToken,
    });

    if (!user) {
      return res.status(400).json({
        message: "Invalid verification token",
      });
    }

    const expiresAt = user.emailVerifcationexpire;

    if (!expiresAt || expiresAt < new Date()) {
      return res.status(400).json({
        message: "Verification token has expired",
      });
    }

    user.emailVerified = true;
    user.emailVerifcationexpire = null;
    user.emailVerificationToken = null;

    await user.save();

    return res.status(200).json({
      success: true,
      message: "Email verification successful",
    });
  } catch (err) {
    console.error("Email verification error:", err);

    return res.status(500).json({
      message: "Failed to verify email",
    });
  }
});

// ------------------------------------------------------
// LOGIN
// POST /api/user/log-in
// ------------------------------------------------------

router.post("/log-in", async (req, res) => {
  try {
    const email = cleanEmail(req.body?.email);
    const password = String(req.body?.password ?? "");

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required",
      });
    }

    // Exact, case-sensitive email match.
    const user = await findUserByEmail(email);

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    const passwordMatches = await bcrypt.compare(
      password,
      user.password
    );

    if (!passwordMatches) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    if (!user.emailVerified) {
      const {
        token,
        hashedToken,
        expire,
      } = generateToken();

      user.emailVerifcationexpire = expire;
      user.emailVerificationToken = hashedToken;

      await user.save();

      await sendEmailVarification(user.email, token);

      return res.status(403).json({
        success: false,
        message:
          "Your email is not verified. A new verification link has been sent",
      });
    }

    const secret = process.env.JWT_SECRET;

    if (!secret) {
      console.error("JWT_SECRET is not configured");

      return res.status(500).json({
        success: false,
        message: "Server authentication is not configured",
      });
    }

    const jwtToken = jwt.sign(
      {
        userid: user._id.toString(),
        username: user.username,
      },
      secret,
      {
        expiresIn: "1d",
      }
    );

    res.cookie("token", jwtToken, {
      ...COOKIE_OPTIONS,
      maxAge: 24 * 60 * 60 * 1000,
    });

    return res.status(200).json({
      success: true,
      message: "Login successful",
      // Keep this only if your frontend needs a Bearer token.
      jwtToken,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
      },
    });
  } catch (err) {
    console.error("Login error:", err);

    return res.status(500).json({
      success: false,
      message: "Login failed. Please try again",
    });
  }
});

// ------------------------------------------------------
// CURRENT AUTHENTICATED USER
// GET /api/user/me
// ------------------------------------------------------
router.get("/me", requireAuth, async (req, res) => {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) return res.status(401).json({ message: "Account not found" });
    return res.status(200).json({
      user: { id: user._id, username: user.username, email: user.email },
    });
  } catch (err) {
    console.error("Get current user error:", err);
    return res.status(500).json({ message: "Failed to load account" });
  }
});

// ------------------------------------------------------
// LOGOUT
// ------------------------------------------------------

function logoutHandler(req, res) {
  res.clearCookie("token", COOKIE_OPTIONS);

  return res.status(200).json({
    success: true,
    message: "Logout successful",
  });
}

// GET retained for compatibility with your existing frontend.
// POST is preferred for a state-changing action.
router.get("/logout", logoutHandler);
router.post("/logout", logoutHandler);

// ------------------------------------------------------
// DELETE ACCOUNT
// POST /api/user/deleteUser
// ------------------------------------------------------

router.post("/deleteUser", requireAuth, async (req, res) => {
  try {
    const user = await getAuthenticatedUser(req);

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Account not found",
      });
    }

    const io = req.app.get("io");

    // Delete private chats, leave groups (groups under 3 members are removed)
    // and detach authored messages so the username can't be inherited.
    await removeUserFromAllRooms(io, user.username);

    await User.deleteOne({ _id: user._id });
    if (io) io.in(`username:${user.username.toLowerCase()}`).disconnectSockets(true);

    res.clearCookie("token", COOKIE_OPTIONS);

    return res.status(200).json({
      success: true,
      message: "Account deleted successfully",
    });
  } catch (err) {
    console.error("Delete user error:", err);

    return res.status(500).json({
      success: false,
      message: "Failed to delete account",
    });
  }
});

// ------------------------------------------------------
// CHANGE USERNAME
// POST /api/user/change-username
// ------------------------------------------------------

router.post(
  "/change-username",
  requireAuth,
  async (req, res) => {
    try {
      const newUsername = cleanUsername(
        req.body?.newUsername
      );

      if (!USERNAME_PATTERN.test(newUsername)) {
        return res.status(400).json({
          success: false,
          message:
            "Username must contain only English letters (A-Z, a-z) and be 2-30 characters long",
        });
      }

      const user = await getAuthenticatedUser(req);

      if (!user) {
        return res.status(401).json({
          success: false,
          message: "Account not found",
        });
      }

      const duplicate = await findUserByUsername(newUsername);

      if (
        duplicate &&
        !duplicate._id.equals(user._id)
      ) {
        return res.status(409).json({
          success: false,
          message: "This username is already taken",
        });
      }

      if (newUsername === user.username) {
        return res.status(200).json({
          success: true,
          message: "Username is unchanged",
          username: user.username,
        });
      }

      const oldUsername = user.username;

      // Update existing string-based references before renaming.
      await updateUsernameReferences(
        oldUsername,
        newUsername,
        req
      );

      user.username = newUsername;
      await user.save();

      const io = req.app.get("io");
      if (io && oldUsername.toLowerCase() !== newUsername.toLowerCase()) {
        io.in(`username:${oldUsername.toLowerCase()}`).socketsJoin(
          `username:${newUsername.toLowerCase()}`
        );
        io.in(`username:${oldUsername.toLowerCase()}`).socketsLeave(
          `username:${oldUsername.toLowerCase()}`
        );
      }

      return res.status(200).json({
        success: true,
        message: "Username changed successfully",
        username: user.username,
      });
    } catch (err) {
      console.error("Change username error:", err);

      return res.status(500).json({
        success: false,
        message: "Failed to change username",
      });
    }
  }
);

module.exports = router;