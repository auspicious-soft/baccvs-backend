import express, { Request, Response } from "express";
import cors from "cors";
// import cookieParser from "cookie-parser";
import path from "path";
import { fileURLToPath } from "url";
import connectDB from "./configF/db";
import {
  comment,
  event,
  follow,
  like,
  locationRoutes,
  post,
  purchase,
  referal,
  report,
  repost,
  story,
  user,
  chatRoutes,
  blockRoutes,
  feedbackRoutes,
  subscription,
  stripeProduct,
  stripeConnect,
  resell,
  admin,
  notification,
  adminAuth,
  adminMain,
} from "./routes";
import { Server } from "socket.io";
import http from "http";
import { setupSocketServer } from "./socket/socket-handler";
import { checkValidAdminRole } from "./utils";
import { initFirebaseAdmin } from "./utils/firebase-admin";
import bodyParser from "body-parser";
import {
  verifyOtpPasswordReset,
  newPassswordAfterOTPVerified,
  login,
  signup,
  verifyEmail,
  verifyingEmailOtp,
  forgotPassword,
  resetPasswordWithToken,
  uploadUserPhotos,
  socialSignUp,
} from "./controllers/user/user";
import { configDotenv } from "dotenv";
import { checkAuth } from "./middleware/check-auth";
import { socketAuthMiddleware } from "./middleware/socket-auth";
import { handleSubscriptionWebhook } from "./controllers/subscription/subscription-controller";
import { handleStripeConnectWebhook } from "./controllers/stripe/stripe-connect-webhook-controller";
import { checkAdminAuth } from "./middleware/admin-check-auth";
import {
  decodeSignedPayload,
  planServices,
  rawBodyMiddleware,
} from "./utils/ios-iap/iosutils";
import * as crypto from "crypto";
import referralClickMiddleware from "./middleware/referral-click";

if (!globalThis.crypto) {
  // @ts-ignore
  globalThis.crypto = crypto.webcrypto;
}

configDotenv();
// Create __dirname equivalent for ES modules
const __filename = fileURLToPath(import.meta.url); // <-- Define __filename
const __dirname = path.dirname(__filename); // <-- Define __dirname

const PORT = process.env.PORT || 8001;
const app = express();
app.set("trust proxy", true);
app.post(
  "/api/subscription/webhook",
  bodyParser.raw({ type: "application/json" }),
  handleSubscriptionWebhook,
);

// Stripe Connect webhook for account updates/payouts
app.post(
  "/api/stripe/connect/webhook",
  bodyParser.raw({ type: "application/json" }),
  handleStripeConnectWebhook,
);

app.post("/in-app-android", rawBodyMiddleware, async (req: any, res: any) => {
  try {
    const bodyBuffer = req.body as Buffer;
    if (bodyBuffer.length === 0) return res.status(400).send("Empty body");

    const bodyStr = bodyBuffer.toString("utf8");
    // console.log("Full body string:", bodyStr);

    let rtdnPayload: any;

    // Parse body as JSON
    let parsedBody: any;
    try {
      parsedBody = JSON.parse(bodyStr);
    } catch (e) {
      // console.error("JSON parse error:", e);
      return res.status(400).send("Invalid JSON");
    }

    // Check if it's Pub/Sub wrapped (has 'message.data' as base64)
    if (parsedBody.message && parsedBody.message.data) {
      // console.log("Pub/Sub wrapped detected");
      const encodedData = parsedBody.message.data;
      const rtdnJson = Buffer.from(encodedData, "base64").toString("utf8");
      rtdnPayload = JSON.parse(rtdnJson);
    } else {
      // Direct RTDN (test or direct delivery)
      // console.log("Direct RTDN detected");
      rtdnPayload = parsedBody; // Direct use karo
    }

    // console.log("Final RTDN payload:", rtdnPayload); // {version: '1.0', packageName: '...', subscriptionNotification: {...}}

    // Verification (purchaseDataSignature pe, if present)
    if (rtdnPayload.subscriptionNotification) {
      const subNotif = rtdnPayload.subscriptionNotification;
      if (subNotif.oneoff) {
        const purchaseData = subNotif.oneoff.purchaseData;
        const signature = subNotif.oneoff.purchaseDataSignature;
        if (purchaseData && signature) {
          const publicKey = `-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA8vVipthABb2jstNhGdbZEFl7DA5zoNpN6zSZzE8yShI0xKbN/sl4GkD7L0XAdahYuwCEZ1YGuWMwisMSN8QoVYOCB7JdoNpc7IPvA8Iaox9RUBmwzB77AX88KQCVSI/hpKJMjOe/SL//Zd2Qvrukll7E/6olYrkQleIhbLhvz+B6mO5MLHAzWUv83GFGoXGoUJAgstl2nmclx4HwucuSflcWxpBEx2oaVjaC3lnPjk1L/w+3UJSHQYlSfyzsb2zOGWGoll6+WmZZ/EigqRxbP41B2QybF+cJkhcbmHsAMA9mVHhJwbJ5m/jh2JbhM51FsfYX2hoZKm/mOMSFm6fYHwIDAQAB\n-----END PUBLIC KEY-----`; // Replace with actual
          const verified = crypto
            .createVerify("SHA1")
            .update(purchaseData)
            .verify(publicKey, signature, "base64");
          // console.log("Signature verified:", verified ? "Yes" : "No");
          if (!verified) return res.status(400).send("Invalid signature");
        }
      }
    }

    // Process karo
    await planServices.handleInAppAndroidWebhook(rtdnPayload, req);
    if (!res.headersSent) res.status(200).send("OK");
  } catch (err) {
    console.error("Error:", err);
    if (!res.headersSent) res.status(200).send("OK");
  }
});

app.post(
  "/in-app-ios",
  rawBodyMiddleware,
  async (req: Request, res: Response) => {
    try {
      const bodyBuffer = req.body as Buffer;
      if (bodyBuffer.length === 0) return res.status(400).send("Empty body");
      const bodyStr = bodyBuffer.toString("utf8");
      let parsedBody: any;
      try {
        parsedBody = JSON.parse(bodyStr);
      } catch (e) {
        return res.status(400).send("Invalid JSON");
      }
      const { signedPayload } = parsedBody;
      if (!signedPayload) {
        console.log("⚠️ No signedPayload in request");
        return res.sendStatus(200);
      }
      const decodedOuter = await decodeSignedPayload(signedPayload);
      await planServices.handleInAppIOSWebhook(decodedOuter, req, res);
      if (!res.headersSent) res.status(200).send("OK");
    } catch (err) {
      console.error("Error:", err);
      if (!res.headersSent) res.status(200).send("OK");
    }
  },
);

app.post(
  "/in-app-ios-production",
  rawBodyMiddleware,
  async (req: Request, res: Response) => {
    try {
      const bodyBuffer = req.body as Buffer;
      if (bodyBuffer.length === 0) return res.status(400).send("Empty body");
      const bodyStr = bodyBuffer.toString("utf8");
      let parsedBody: any;
      try {
        parsedBody = JSON.parse(bodyStr);
      } catch (e) {
        return res.status(400).send("Invalid JSON");
      }
      const { signedPayload } = parsedBody;
      if (!signedPayload) {
        console.log("⚠️ No signedPayload in request");
        return res.sendStatus(200);
      }
      const decodedOuter = await decodeSignedPayload(signedPayload);
      await planServices.handleInAppIOSWebhookProduction(
        decodedOuter,
        req,
        res,
      );
      if (!res.headersSent) res.status(200).send("OK");
    } catch (err) {
      console.error("Error:", err);
      if (!res.headersSent) res.status(200).send("OK");
    }
  },
);

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    credentials: true,
  },
});

// Apply socket authentication middleware
io.use(socketAuthMiddleware);

// Setup Socket.IO
setupSocketServer(io);

app.use(
  bodyParser.json({
    verify: (req: any, res, buf) => {
      req.rawBody = buf.toString();
    },
  }),
);
// app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "PATCH", "DELETE", "PUT"],
    credentials: true,
  }),
);

var dir = path.join(__dirname, "static");
app.use(express.static(dir));

var uploadsDir = path.join(__dirname, "uploads");
app.use("/uploads", express.static(uploadsDir));

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, "public")));

// Password reset routes
app.get("/reset-password", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "reset-password.html"));
});

// Add this route after your other routes
app.get("/bulk-purchase-test", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "bulk-purchase-test.html"));
});
app.get("/privacy-policy", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "privacy-policy.html"));
});
app.get("/terms-and-conditions", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "terms-and-conditions.html"));
});
app.get("/support", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "support.html"));
});

connectDB();

// Initialize Firebase Admin once at startup (if configured)
try {
  initFirebaseAdmin();
} catch (err) {
  console.warn("Firebase Admin init failed during startup:", err);
}
app.get("/", (_, res: any) => {
  res.send("Hello world entry point 🚀✅");
});
app.post("/api/user/reset/password", resetPasswordWithToken);
app.use("/api/referal", referal);
app.use("/api/admin", checkAdminAuth, admin);
app.post("/api/login", login);
app.post("/api/signup", signup);
app.post("/api/social/signup", socialSignUp);
app.use("/api/user", checkAuth, referralClickMiddleware, user);
app.use("/api/follow", checkAuth, referralClickMiddleware, follow);
app.use("/api/post", checkAuth, referralClickMiddleware, post);
app.use("/api/comment", comment);
app.use("/api/event", checkAuth, referralClickMiddleware, event);
app.use("/api/like", like);
app.use("/api/report", checkAuth, referralClickMiddleware, report);
app.use("/api/repost", checkAuth, referralClickMiddleware, repost);
app.use("/api/location", checkAuth, referralClickMiddleware, locationRoutes);
app.use("/api/story", checkAuth, referralClickMiddleware, story);
app.use("/api/resell", checkAuth, referralClickMiddleware, resell);
app.use("/api/purchase", checkAuth, referralClickMiddleware, purchase);
app.use("/api/chat", checkAuth, referralClickMiddleware, chatRoutes);
app.use("/api/block", checkAuth, referralClickMiddleware, blockRoutes);
app.use("/api/feedback", checkAuth, referralClickMiddleware, feedbackRoutes);
app.use("/api/subscription", subscription);
app.use("/api/stripe-product", stripeProduct);
app.use("/api/stripe-connect", stripeConnect);
app.use("/api/notification", checkAuth, referralClickMiddleware, notification);
app.post("/api/email-otp", verifyEmail);
app.post("/api/verify-email", verifyingEmailOtp);
app.post("/api/verify-otp", verifyOtpPasswordReset);
app.patch("/api/new-password-otp-verified", newPassswordAfterOTPVerified);
// First screen - verify password

// Admin Routes

app.use("/api", adminAuth);
app.use("/api/admin", checkAdminAuth, adminMain);

server.listen(PORT, () => console.log(`Server is listening on port ${PORT}`));
