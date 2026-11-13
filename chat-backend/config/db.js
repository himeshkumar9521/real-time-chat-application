const mongoose = require("mongoose");

module.exports = async function connectDB() {
  const mongoUrl = process.env.MONGO_URL;
  if (!mongoUrl) {
    throw new Error("MONGO_URL is not configured in the environment");
  }

  try {
    await mongoose.connect(mongoUrl, { dbName: "ChatApp" });
    console.log("MongoDB connected");
  } catch (err) {
    console.error("MongoDB connection failed:", err);
    throw err;
  }
};
