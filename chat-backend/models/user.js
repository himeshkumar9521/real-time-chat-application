const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 30,
      match: /^[A-Za-z]{2,30}$/,
    },
    // Canonical value for case-insensitive username lookup.
    usernameKey: {
      type: String,
      required: true,
      unique: true,
    },
    // Email capitalization is preserved; MongoDB's default simple collation
    // keeps the unique index case-sensitive.
    email: {
      type: String,
      required: true,
      trim: true,
      unique: true,
    },
    emailVerified: {
      type: Boolean,
      default: false,
    },
    emailVerificationToken: {
      type: String,
      default: null,
    },
    // Kept with the existing spelling because routes already use this field.
    emailVerifcationexpire: {
      type: Date,
      default: null,
    },
    password: {
      type: String,
      required: true,
      // Do not trim or transform passwords.
    },
    rooms: { type: [String], default: [] },
  },
  { timestamps: true }
);

UserSchema.pre("validate", function () {
  if (this.username != null) {
    this.usernameKey = this.username.trim().toLowerCase();
  }
});

const User = mongoose.model("User", UserSchema);
module.exports = { User };
