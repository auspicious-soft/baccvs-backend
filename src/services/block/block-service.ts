import { Request, Response } from "express";
import mongoose from "mongoose";
import { httpStatusCode } from "src/lib/constant";
import { errorResponseHandler } from "src/lib/errors/error-response-handler";
import { BlockModel } from "src/models/block/block-schema";
import { JwtPayload } from "jsonwebtoken";

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

  const existingBlock = await BlockModel.findOne({
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

  const newBlock = new BlockModel({
    blockedBy: currentUserId,
    blockedUser: targetUserId
  });

  await newBlock.save();

  return {
    success: true,
    message: "User blocked successfully"
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

  const existingBlock = await BlockModel.findOne({
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

  await BlockModel.findByIdAndDelete(existingBlock._id);

  return {
    success: true,
    message: "User unblocked successfully"
  };
};

export const getBlockedUsersService = async (req: any, res: Response) => {
  if (!req.user) {
    return errorResponseHandler("Authentication failed", httpStatusCode.UNAUTHORIZED, res);
  }

  const { id: currentUserId } = req.user;

  const blockedUsers = await BlockModel.find({ blockedBy: currentUserId })
    .populate('blockedUser', 'username email profilePicture')
    .sort({ createdAt: -1 });

  return {
    success: true,
    data: blockedUsers
  };
};
