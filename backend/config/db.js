const mongoose = require("mongoose");

module.exports = async function connectDB() {
  try {
    const MONGO_URL = process.env.MONGO_URL;
    await mongoose.connect(MONGO_URL, { dbName: "ChatApp" });
  } catch (err) {
    console.log(err);
    process.exit(1);
  }
};
