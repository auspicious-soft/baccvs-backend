import { Router } from "express";
import {
  blockUser,
  unblockUser,
  getBlockedUsers
} from "src/controllers/block/block-controller";

const router = Router();

// Block a user
router.post("/:targetUserId", blockUser);

// Unblock a user
router.post("/user/:targetUserId", unblockUser);

// Get all blocked users
router.get("/", getBlockedUsers);

export { router };