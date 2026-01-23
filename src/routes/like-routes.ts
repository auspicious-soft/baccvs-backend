import { Router } from "express";
import { checkAuth } from "src/middleware/check-auth";
import {
  toggleLike,
  getLikes,
  getLikesByUser,
  getLikesByTarget
} from "src/controllers/like/like-controller";
import referralClickMiddleware from "src/middleware/referral-click";

const router = Router();

// Like/Unlike a post or comment
router.post("/toggle", checkAuth,referralClickMiddleware, toggleLike);

// Get all likes (with pagination)
router.get("/", getLikes);

// Get likes by current user
router.get("/user", checkAuth,referralClickMiddleware, getLikesByUser);

// Get likes for a specific target (post/comment)
router.get("/:targetType/:targetId", getLikesByTarget);

export { router };