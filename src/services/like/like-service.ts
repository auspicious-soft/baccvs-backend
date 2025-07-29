import { Request, Response } from "express";
import mongoose from "mongoose";
import { LikeModel } from "src/models/like/like-schema";
import { httpStatusCode } from "src/lib/constant";
import { errorResponseHandler } from "src/lib/errors/error-response-handler";
import { JwtPayload } from "jsonwebtoken";
import { postModels } from "src/models/post/post-schema";
import { Comment } from "src/models/comment/comment-schema";
import { RepostModel } from "src/models/repost/repost-schema";
import { eventModel } from "src/models/event/event-schema";
// Import your Event model here
// import { EventModel } from "src/models/event/event-schema";

// Toggle like (create/delete)
export const toggleLikeService = async (req: Request, res: Response) => {
  if (!req.user) {
    return errorResponseHandler("Authentication failed", httpStatusCode.UNAUTHORIZED, res);
  }

  const { id: userId } = req.user as JwtPayload;
  const { targetType, targetId } = req.body;

  // Validate required fields
  if (!targetType || !targetId) {
    return errorResponseHandler("Target type and ID are required", httpStatusCode.BAD_REQUEST, res);
  }

  // Validate targetType - now includes "event"
  if (!["posts", "comments", "reposts", "event"].includes(targetType)) {
    return errorResponseHandler("Invalid target type", httpStatusCode.BAD_REQUEST, res);
  }

  // Validate targetId
  if (!mongoose.Types.ObjectId.isValid(targetId)) {
    return errorResponseHandler("Invalid target ID", httpStatusCode.BAD_REQUEST, res);
  }

  try {
    // Check if target exists based on type
    let targetExists: boolean = false;
    
    if (targetType === "posts") {
      const post = await postModels.findOne({ _id: targetId }).exec();
      targetExists = !!post;
    } else if (targetType === "comments") {
      const comment = await Comment.findOne({ _id: targetId }).exec();
      targetExists = !!comment;
    } else if (targetType === "reposts") {
      const repost = await RepostModel.findOne({ _id: targetId }).exec();
      targetExists = !!repost;
    } else if (targetType === "event") {
      const event = await eventModel.findOne({ _id: targetId }).exec();
      targetExists = !!event;
      // targetExists = true;
    }

    if (!targetExists) {
      return errorResponseHandler(
        `${targetType.charAt(0).toUpperCase() + targetType.slice(1)} not found`,
        httpStatusCode.NOT_FOUND,
        res
      );
    }

    // Check if like exists
    const existingLike = await LikeModel.findOne({
      user: userId,
      targetType,
      target: targetId
    });

    if (existingLike) {
      // Unlike - remove the existing like
      await LikeModel.findByIdAndDelete(existingLike._id);
      return {
        success: true,
        message: `${getTargetDisplayName(targetType)} unliked successfully`,
        liked: false
      };
    } else {
      // Like - create new like
      const newLike = new LikeModel({
        user: userId,
        targetType,
        target: targetId
      });
      await newLike.save();
      return {
        success: true,
        message: `${getTargetDisplayName(targetType)} liked successfully`,
        liked: true
      };
    }
  } catch (error) {
    if ((error as any).code === 11000) { // Duplicate key error
      return errorResponseHandler("Already liked", httpStatusCode.BAD_REQUEST, res);
    }
    throw error;
  }
};

// Helper function to get display name for different target types
const getTargetDisplayName = (targetType: string): string => {
  switch (targetType) {
    case "posts":
      return "Post";
    case "comments":
      return "Comment";
    case "reposts":
      return "Repost";
    case "event":
      return "Event";
    default:
      return targetType;
  }
};

// Get all likes with pagination
export const getLikesService = async (req: Request, res: Response) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 10;
  const skip = (page - 1) * limit;

  const likes = await LikeModel.find()
    .populate('user', '-password')
    .skip(skip)
    .limit(limit)
    .sort({ createdAt: -1 });

  const total = await LikeModel.countDocuments();

  return {
    success: true,
    data: likes,
    pagination: {
      current: page,
      limit,
      total,
      pages: Math.ceil(total / limit)
    }
  };
};

// Get likes by user
export const getLikesByUserService = async (req: Request, res: Response) => {
  if (!req.user) {
    return errorResponseHandler("Authentication failed", httpStatusCode.UNAUTHORIZED, res);
  }

  const { id: userId } = req.user as JwtPayload;
  const { targetType } = req.query;

  const query: any = { user: userId };
  if (targetType) {
    // Updated to include "event"
    if (!["posts", "comments", "reposts", "event"].includes(targetType as string)) {
      return errorResponseHandler("Invalid target type", httpStatusCode.BAD_REQUEST, res);
    }
    query.targetType = targetType;
  }

  const likes = await LikeModel.find(query)
    .populate({
      path: 'target',
      populate: {
        path: 'user',
        select: '-password'
      }
    })
    .sort({ createdAt: -1 });

  return {
    success: true,
    data: likes
  };
};

// Get likes for a specific target (post/comment/repost/event)
export const getLikesByTargetService = async (req: Request, res: Response) => {
  const { targetType, targetId } = req.params;

  // Validate targetType - now includes "event"
  if (!["posts", "comments", "reposts", "event"].includes(targetType)) {
    return errorResponseHandler("Invalid target type", httpStatusCode.BAD_REQUEST, res);
  }

  // Validate targetId
  if (!mongoose.Types.ObjectId.isValid(targetId)) {
    return errorResponseHandler("Invalid target ID", httpStatusCode.BAD_REQUEST, res);
  }

  const likes = await LikeModel.find({ targetType, target: targetId })
    .populate('user', '-password')
    .populate('target')
    .sort({ createdAt: -1 });

  return {
    success: true,
    data: likes,
    count: likes.length
  };
};