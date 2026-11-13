require("dotenv").config();

const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const { createServer } = require("http");
const { Server } = require("socket.io");

const connectDB = require("./config/db.js");
const roomsRouter = require("./routes/room.js");
const userRouter = require("./routes/User.js");
const { socketHandler } = require("./socket.js");
const { repairRooms } = require("./utils/roomCleanup.js");

const app = express();
const httpServer = createServer(app);
const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:5173";

app.use(
  cors({
    origin: CLIENT_URL,
    credentials: true,
  }),
);
app.use(cookieParser());
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false }));

app.use("/api/rooms", roomsRouter);
app.use("/api/user", userRouter);

app.get("/api/health", (_req, res) => res.json({ status: "ok" }));
app.use((_req, res) => res.status(404).json({ error: "Not found" }));

const io = new Server(httpServer, {
  cors: {
    origin: CLIENT_URL,
    methods: ["GET", "POST"],
    credentials: true,
  },
});
app.set("io", io);
socketHandler(io);

const PORT = Number(process.env.PORT || 3000);

connectDB()
  .then(() =>
    repairRooms().catch((err) => console.error("Room repair failed:", err)),
  )
  .then(() => {
    httpServer.listen(PORT, () => {
      console.log(`Server is running on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error("Failed to start server:", err);
    process.exit(1);
  });
