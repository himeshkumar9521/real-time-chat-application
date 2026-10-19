const { Router } = require("express");
const crypto = require("crypto");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const { User } = require("../models/user");
const { Room } = require("../models/room");

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
    username: usernameRegex(cleaned),
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

function hasUsername(values, username) {
  const wanted = cleanUsername(username).toLowerCase();

  return Array.isArray(values) &&
    values.some(
      (value) =>
        cleanUsername(value).toLowerCase() === wanted
    );
}

function addUsername(values, username) {
  const result = Array.isArray(values) ? [...values] : [];

  if (username && !hasUsername(result, username)) {
    result.push(username);
  }

  return result;
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

  const token = req.cookies?.token || bearerToken;

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

// Update username references in the existing string-based
// relationship arrays and room memberships.
async function updateUsernameReferences(
  oldUsername,
  newUsername
) {
  const pattern = usernameRegex(oldUsername);

  const relatedUsers = await User.find({
    $or: [
      { followers: pattern },
      { following: pattern },
      { followRequest: pattern },
    ],
  });

  for (const relatedUser of relatedUsers) {
    relatedUser.followers = replaceUsername(
      relatedUser.followers,
      oldUsername,
      newUsername
    );

    relatedUser.following = replaceUsername(
      relatedUser.following,
      oldUsername,
      newUsername
    );

    relatedUser.followRequest = replaceUsername(
      relatedUser.followRequest,
      oldUsername,
      newUsername
    );

    await relatedUser.save();
  }

  const affectedRooms = await Room.find({
    members: pattern,
  });

  for (const room of affectedRooms) {
    room.members = replaceUsername(
      room.members,
      oldUsername,
      newUsername
    );

    // Keep private room identifiers consistent with the
    // lowercase canonical key used by the room routes.
    if (
      room.type === "private" &&
      room.members.length === 2
    ) {
      room.privateKey = room.members
        .map((member) => member.toLowerCase())
        .sort()
        .join(":");

      const members = [...room.members].sort((a, b) =>
        a.toLowerCase().localeCompare(b.toLowerCase())
      );

      room.name = `${members[0]} & ${members[1]}`;
    }

    await room.save();
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
        followers: [],
        followRequest: [],
        following: [],
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

    const pattern = usernameRegex(user.username);

    const relatedUsers = await User.find({
      _id: { $ne: user._id },
      $or: [
        { followers: pattern },
        { following: pattern },
        { followRequest: pattern },
      ],
    });

    for (const relatedUser of relatedUsers) {
      relatedUser.followers = removeUsername(
        relatedUser.followers,
        user.username
      );

      relatedUser.following = removeUsername(
        relatedUser.following,
        user.username
      );

      relatedUser.followRequest = removeUsername(
        relatedUser.followRequest,
        user.username
      );

      await relatedUser.save();
    }

    // Remove the user from group memberships.
    const groupRooms = await Room.find({
      type: "group",
      members: pattern,
    });

    for (const room of groupRooms) {
      room.members = removeUsername(
        room.members,
        user.username
      );

      await room.save();
    }

    await User.deleteOne({ _id: user._id });

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
        newUsername
      );

      user.username = newUsername;
      await user.save();

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

// ------------------------------------------------------
// SEND FOLLOW REQUEST
// POST /api/user/follow-request
// ------------------------------------------------------

router.post(
  "/follow-request",
  requireAuth,
  async (req, res) => {
    try {
      const targetUsername = cleanUsername(
        req.body?.toFollow
      );

      if (!targetUsername) {
        return res.status(400).json({
          success: false,
          message: "Username to follow is required",
        });
      }

      const requester = await getAuthenticatedUser(req);
      const target = await findUserByUsername(targetUsername);

      if (!requester) {
        return res.status(401).json({
          success: false,
          message: "Account not found",
        });
      }

      if (!target) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      if (requester._id.equals(target._id)) {
        return res.status(400).json({
          success: false,
          message: "You cannot follow yourself",
        });
      }

      if (hasUsername(requester.following, target.username)) {
        return res.status(409).json({
          success: false,
          message: "You are already following this user",
        });
      }

      if (hasUsername(target.followRequest, requester.username)) {
        return res.status(409).json({
          success: false,
          message: "Follow request already sent",
        });
      }

      target.followRequest = addUsername(
        target.followRequest,
        requester.username
      );

      await target.save();

      return res.status(200).json({
        success: true,
        message: "Follow request sent",
      });
    } catch (err) {
      console.error("Follow request error:", err);

      return res.status(500).json({
        success: false,
        message: "Failed to send follow request",
      });
    }
  }
);

// ------------------------------------------------------
// ACCEPT FOLLOW REQUEST
// POST /api/user/follow-request-accept
// ------------------------------------------------------

router.post(
  "/follow-request-accept",
  requireAuth,
  async (req, res) => {
    try {
      const requesterUsername = cleanUsername(
        req.body?.ByFollow ?? req.body?.person
      );

      if (!requesterUsername) {
        return res.status(400).json({
          success: false,
          message: "Requesting username is required",
        });
      }

      const recipient = await getAuthenticatedUser(req);
      const requester = await findUserByUsername(
        requesterUsername
      );

      if (!recipient) {
        return res.status(401).json({
          success: false,
          message: "Account not found",
        });
      }

      if (!requester) {
        return res.status(404).json({
          success: false,
          message: "Requesting user not found",
        });
      }

      if (!hasUsername(
        recipient.followRequest,
        requester.username
      )) {
        return res.status(404).json({
          success: false,
          message: "Follow request not found",
        });
      }

      recipient.followRequest = removeUsername(
        recipient.followRequest,
        requester.username
      );

      recipient.followers = addUsername(
        recipient.followers,
        requester.username
      );

      requester.following = addUsername(
        requester.following,
        recipient.username
      );

      await Promise.all([
        recipient.save(),
        requester.save(),
      ]);

      return res.status(200).json({
        success: true,
        message: "Follow request accepted",
      });
    } catch (err) {
      console.error("Accept follow request error:", err);

      return res.status(500).json({
        success: false,
        message: "Failed to accept follow request",
      });
    }
  }
);

// ------------------------------------------------------
// REJECT FOLLOW REQUEST
// POST /api/user/follow-request-reject
// ------------------------------------------------------

router.post(
  "/follow-request-reject",
  requireAuth,
  async (req, res) => {
    try {
      const requesterUsername = cleanUsername(
        req.body?.person ?? req.body?.ByFollow
      );

      if (!requesterUsername) {
        return res.status(400).json({
          success: false,
          message: "Requesting username is required",
        });
      }

      const recipient = await getAuthenticatedUser(req);

      if (!recipient) {
        return res.status(401).json({
          success: false,
          message: "Account not found",
        });
      }

      if (!hasUsername(
        recipient.followRequest,
        requesterUsername
      )) {
        return res.status(404).json({
          success: false,
          message: "Follow request not found",
        });
      }

      recipient.followRequest = removeUsername(
        recipient.followRequest,
        requesterUsername
      );

      await recipient.save();

      return res.status(200).json({
        success: true,
        message: "Follow request rejected",
      });
    } catch (err) {
      console.error("Reject follow request error:", err);

      return res.status(500).json({
        success: false,
        message: "Failed to reject follow request",
      });
    }
  }
);

// ------------------------------------------------------
// UNFOLLOW
// POST /api/user/unfollow
// ------------------------------------------------------

router.post("/unfollow", requireAuth, async (req, res) => {
  try {
    const targetUsername = cleanUsername(
      req.body?.person ?? req.body?.toUnfollow
    );

    if (!targetUsername) {
      return res.status(400).json({
        success: false,
        message: "Username to unfollow is required",
      });
    }

    const requester = await getAuthenticatedUser(req);
    const target = await findUserByUsername(targetUsername);

    if (!requester) {
      return res.status(401).json({
        success: false,
        message: "Account not found",
      });
    }

    if (!target) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    requester.following = removeUsername(
      requester.following,
      target.username
    );

    target.followers = removeUsername(
      target.followers,
      requester.username
    );

    await Promise.all([
      requester.save(),
      target.save(),
    ]);

    return res.status(200).json({
      success: true,
      message: "Unfollowed successfully",
    });
  } catch (err) {
    console.error("Unfollow error:", err);

    return res.status(500).json({
      success: false,
      message: "Failed to unfollow user",
    });
  }
});

// ------------------------------------------------------
// REMOVE FOLLOWER
// POST /api/user/unfollowing
// ------------------------------------------------------

router.post(
  "/unfollowing",
  requireAuth,
  async (req, res) => {
    try {
      const followerUsername = cleanUsername(
        req.body?.person ?? req.body?.follower
      );

      if (!followerUsername) {
        return res.status(400).json({
          success: false,
          message: "Follower username is required",
        });
      }

      const recipient = await getAuthenticatedUser(req);
      const follower = await findUserByUsername(
        followerUsername
      );

      if (!recipient) {
        return res.status(401).json({
          success: false,
          message: "Account not found",
        });
      }

      if (!follower) {
        return res.status(404).json({
          success: false,
          message: "Follower not found",
        });
      }

      recipient.followers = removeUsername(
        recipient.followers,
        follower.username
      );

      follower.following = removeUsername(
        follower.following,
        recipient.username
      );

      await Promise.all([
        recipient.save(),
        follower.save(),
      ]);

      return res.status(200).json({
        success: true,
        message: "Follower removed successfully",
      });
    } catch (err) {
      console.error("Remove follower error:", err);

      return res.status(500).json({
        success: false,
        message: "Failed to remove follower",
      });
    }
  }
);

module.exports = router;