import express from "express"
import cors from "cors"
// import cookieParser from "cookie-parser";
import path from "path"
import { fileURLToPath } from 'url'
import connectDB from "./configF/db"
import { comment, event, follow, like, locationRoutes, post, purchase, referal, report, repost, story, user, chatRoutes, blockRoutes } from "./routes"
import { Server } from "socket.io"
import http from "http"
import { setupSocketServer } from "./socket/socket-handler"
import { checkValidAdminRole } from "./utils"
import bodyParser from 'body-parser'
import {  verifyOtpPasswordReset, newPassswordAfterOTPVerified, login, signup, verifyEmail, verifyingEmailOtp, forgotPassword, resetPasswordWithToken, uploadUserPhotos } from "./controllers/user/user";
import { configDotenv } from 'dotenv';
import { checkAuth } from "./middleware/check-auth"
import { socketAuthMiddleware } from "./middleware/socket-auth";

configDotenv()
// Create __dirname equivalent for ES modules
const __filename = fileURLToPath(import.meta.url) // <-- Define __filename
const __dirname = path.dirname(__filename)        // <-- Define __dirname

const PORT = process.env.PORT || 8000
const app = express()
const server = http.createServer(app)
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
})

// Apply socket authentication middleware
io.use(socketAuthMiddleware);

// Setup Socket.IO
setupSocketServer(io);

app.set("trust proxy", true)
app.use(bodyParser.json({
    verify: (req: any, res, buf) => {
      req.rawBody = buf.toString();
    }
  }));
// app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));


app.use(
    cors({
        origin: "*",
        methods: ['GET', 'POST', 'PATCH', 'DELETE', 'PUT'],
        credentials: true,
    })
);


var dir = path.join(__dirname, 'static')
app.use(express.static(dir))

var uploadsDir = path.join(__dirname, 'uploads')
app.use('/uploads', express.static(uploadsDir))

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, 'public')));

// Password reset routes
app.get('/reset-password', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'reset-password.html'));
});

// Also add this to handle both formats
app.get('/reset-password/:token', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'reset-password.html'));
});

connectDB();


app.get("/", (_, res: any) => {
    res.send("Hello world entry point 🚀✅");
});
app.use("/api/referal",referal);
app.use("/api/login", login);
app.use("/api/signup",uploadUserPhotos, signup);
app.use("/api/user",checkAuth, user);
app.use("/api/follow",checkAuth, follow);
app.use("/api/post",checkAuth,post);
app.use("/api/comment",comment);
app.use("/api/event",event);
app.use("/api/like",like)
app.use("/api/report",checkAuth,report)
app.use("/api/repost",checkAuth,repost);
app.use('/api/location',checkAuth, locationRoutes);
app.use("/api/story",checkAuth, story);
app.use("/api/purchase",purchase);
app.post("/api/email-otp", verifyEmail)
app.post("/api/verify-email", verifyingEmailOtp)
app.post("/api/verify-otp", verifyOtpPasswordReset);
app.patch("/api/new-password-otp-verified", newPassswordAfterOTPVerified);
app.use("/api/chat", checkAuth, chatRoutes);
app.use("/api/block", checkAuth, blockRoutes);
app.post("/api/user/reset-password", resetPasswordWithToken);

// First screen - verify password

server.listen(PORT, () => console.log(`Server is listening on port ${PORT}`));
