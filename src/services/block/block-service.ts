import { Request, Response } from "express";
import mongoose from "mongoose";
import { httpStatusCode } from "src/lib/constant";
import { errorResponseHandler } from "src/lib/errors/error-response-handler";
import { blockModel } from "src/models/block/block-schema";
import { followModel } from "src/models/follow/follow-schema";

export const blockUserService = async (req: any, res: Response) => {
  if (!req.user) {
    return errorResponseHandler("Authentication failed", httpStatusCode.UNAUTHORIZED, res);
  }

  const { id: currentUserId } = req.user;
  const { targetUserId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(targetUserId)) {
    return errorResponseHandler(
      "Invalid target user ID",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

  if (currentUserId === targetUserId) {
    return errorResponseHandler(
      "You cannot block yourself",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

  const existingBlock = await blockModel.findOne({
    blockedBy: currentUserId,
    blockedUser: targetUserId
  });

  if (existingBlock) {
    return errorResponseHandler(
      "You have already blocked this user",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

  // 🧹 Remove mutual follow relationships
  await followModel.deleteMany({
    $or: [
      { follower_id: currentUserId, following_id: targetUserId },
      { follower_id: targetUserId, following_id: currentUserId }
    ]
  });

  // ✅ Save new block entry
  const newBlock = new blockModel({
    blockedBy: currentUserId,
    blockedUser: targetUserId
  });

  await newBlock.save();

  return {
    success: true,
    message: "User blocked successfully and follow relationships removed"
  };
};

export const unblockUserService = async (req: any, res: Response) => {
  if (!req.user) {
    return errorResponseHandler("Authentication failed", httpStatusCode.UNAUTHORIZED, res);
  }

  const { id: currentUserId } = req.user;
  const { targetUserId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(targetUserId)) {
    return errorResponseHandler(
      "Invalid target user ID",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

  const existingBlock = await blockModel.findOne({
    blockedBy: currentUserId,
    blockedUser: targetUserId
  });

  if (!existingBlock) {
    return errorResponseHandler(
      "You have not blocked this user",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

  await blockModel.findByIdAndDelete(existingBlock._id);

  return {
    success: true,
    message: "User unblocked successfully"
  };
};

export const getBlockedUsersService = async (req: any, res: Response) => {
  if (!req.user) {
    return errorResponseHandler(
      "Authentication failed",
      httpStatusCode.UNAUTHORIZED,
      res
    );
  }

  const { id: currentUserId } = req.user;
  const { search } = req.query; // e.g. /blocked-users?search=john

  // Fetch all blocked users by current user
  let blockedUsers = await blockModel
    .find({ blockedBy: currentUserId })
    .populate("blockedUser", "username email profilePicture")
    .sort({ createdAt: -1 });

  // Optional: filter by username if search query provided
  if (search) {
    const searchRegex = new RegExp(search, "i"); // case-insensitive
    blockedUsers = blockedUsers.filter(
      (item: any) => item.blockedUser && searchRegex.test(item.blockedUser.username)
    );
  }

  return {
    success: true,
    message:"Blocked user fetched successfully",
    data: blockedUsers
  };
};
