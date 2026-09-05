const express = require("express");
const cors = require("cors");
const { createServer } = require("http");
const { Server } = require("socket.io");
const connectDB = require("./config/db.js");
const roomsRouter = require("./routes/room.js");
// const userRouter = require("./routes/user.js");
const { socketHandler } = require("./socket.js");
const cookieParser = require('cookie-parser');

const dotenv = require("dotenv");
dotenv.config();
const app = express();
const httpServer = createServer(app);
app.use(cookieParser());
app.use(express.json());
app.use(cors({ origin: "http://localhost:5173" }));
app.use(express.urlencoded());
app.use("/api/rooms", roomsRouter);
// app.use("/api/user" , userRouter);
app.get("/api/health", (_req, res) => res.json({ status: "ok" }));
app.use((_req, res) => res.status(404).json({ error: "Not found" }));

const io = new Server(httpServer, {
  cors: { origin: "http://localhost:5173", methods: ["GET", "POST"] },
});
socketHandler(io);

const PORT = process.env.PORT;

connectDB().then(() => {
  httpServer.listen(PORT, () => {
    console.log(`server is running on http://localhost:${PORT}`);
  });
});
