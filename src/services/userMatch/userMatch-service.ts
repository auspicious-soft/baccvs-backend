import { Request, Response } from "express";
import mongoose from "mongoose";
import { JwtPayload } from "jsonwebtoken";
import { UserMatch } from "src/models/usermatch/usermatch-schema";
import { httpStatusCode } from "src/lib/constant";
import { errorResponseHandler } from "src/lib/errors/error-response-handler";
import { usersModel } from "src/models/user/user-schema";


// Check and update match status
const checkAndUpdateMatchStatus = async (fromUserId : any, toUserId : any) => {
  // Check if the target user has already liked the current user
  const counterpartLike = await UserMatch.findOne({
    fromUser: toUserId,
    toUser: fromUserId,
    type: "like"
  });

  if (counterpartLike) {
    // It's a match! Update both records
    const now = new Date();
    
    // Update this user's like
    await UserMatch.findOneAndUpdate(
      { fromUser: fromUserId, toUser: toUserId },
      { isMatch: true, matchedAt: now }
    );
    
    // Update the other user's like
    await UserMatch.findOneAndUpdate(
      { fromUser: toUserId, toUser: fromUserId },
      { isMatch: true, matchedAt: now }
    );
    
    return true;
  }
  
  return false;
};

/**
 * Handle user like/superlike/boost
 */
export const userLikeService = async (req : any, res : Response) => {
  // Authentication check
  if (!req.user) {
    return errorResponseHandler("Authentication failed", httpStatusCode.UNAUTHORIZED, res);
  }

  const { id: fromUserId } = req.user;
  const { id: toUserId } = req.params;
  const { subType } = req.body;

  // Validation checks
  if (!toUserId) {
    return errorResponseHandler("Target user ID is required", httpStatusCode.BAD_REQUEST, res);
  }

  if (subType && !["superlike", "boost"].includes(subType)) {
    return errorResponseHandler("Invalid subType. Must be 'superlike' or 'boost'", httpStatusCode.BAD_REQUEST, res);
  }

  if (!mongoose.Types.ObjectId.isValid(toUserId)) {
    return errorResponseHandler("Invalid target user ID", httpStatusCode.BAD_REQUEST, res);
  }

  if (fromUserId === toUserId) {
    return errorResponseHandler("Cannot like yourself", httpStatusCode.BAD_REQUEST, res);
  }

  try {
    // Check if target user exists
    const targetUser = await usersModel.findById(toUserId);
    if (!targetUser) {
      return errorResponseHandler("Target user not found", httpStatusCode.NOT_FOUND, res);
    }

    // Remove existing dislike if present
    const existingDislike = await UserMatch.findOne({
      fromUser: fromUserId,
      toUser: toUserId,
      type: "dislike",
    });
    if (existingDislike) {
      await UserMatch.findByIdAndDelete(existingDislike._id);
    }

    // Check for existing like
    const existingLike = await UserMatch.findOne({
      fromUser: fromUserId,
      toUser: toUserId,
      type: "like",
    });

    // Normalize subType (undefined becomes null for regular likes)
    const finalSubType = subType || null;

    // Determine the field to decrement based on subType
    let field = 'totalLikes'; // Correct field name
    if (finalSubType === "superlike") {
      field = "totalSuperLikes";
    } else if (finalSubType === "boost") {
      field = "totalBoosts";
    }

    if (existingLike) {
      if (existingLike.subType === finalSubType) {
        // Same subType: remove the like (toggle off)
        await UserMatch.findByIdAndDelete(existingLike._id);
        
        // Refund the resource when removing a like
        await usersModel.updateOne(
          { _id: fromUserId },
          { $inc: { [field]: 1 } }
        );
        
        return {
          success: true,
          message: finalSubType ? `${finalSubType} removed` : "Like removed",
          active: false,
        };
      } else {
        // Different subType: update the like and consume the new subType's resource
        // First, check if the user has enough of the required resource
        const user = await usersModel.findById(fromUserId);
        if (!user || (user.toObject() as any)[field] <= 0) {
          return errorResponseHandler(
            `Insufficient ${field.replace("total", "").toLowerCase()}`,
            httpStatusCode.BAD_REQUEST,
            res
          );
        }
        
        // Then decrement the count
        await usersModel.updateOne(
          { _id: fromUserId },
          { $inc: { [field]: -1 } }
        );

        const updatedLike = await UserMatch.findByIdAndUpdate(
          existingLike._id,
          { subType: finalSubType },
          { new: true }
        );

        return {
          success: true,
          message: finalSubType ? `Updated to ${finalSubType}` : "Updated to regular like",
          active: true,
          interaction: updatedLike,
        };
      }
    } else {
      // No existing like: create a new one and consume the resource
      // First, check if the user has enough of the required resource
      const user = await usersModel.findById(fromUserId);
      if (!user || (user.toObject() as any)[field] <= 0) {
        return errorResponseHandler(
          `Insufficient ${field.replace("total", "").toLowerCase()}`,
          httpStatusCode.BAD_REQUEST,
          res
        );
      }
      
      // Then decrement the count
      await usersModel.updateOne(
        { _id: fromUserId },
        { $inc: { [field]: -1 } }
      );

      const newLike = new UserMatch({
        fromUser: fromUserId,
        toUser: toUserId,
        type: "like",
        subType: finalSubType,
      });
      await newLike.save();

      const isMatch = await checkAndUpdateMatchStatus(fromUserId, toUserId);

      return {
        success: true,
        message: finalSubType ? `${finalSubType} created` : "Like created",
        active: true,
        isMatch: isMatch,
        interaction: newLike,
      };
    }
  } catch (error) {
    if ((error as any).code === 11000) {
      return errorResponseHandler("Interaction already exists", httpStatusCode.BAD_REQUEST, res);
    }
    throw error; // Let the global error handler deal with it
  }
};

/**
 * Handle user dislike
 */
export const userDislikeService = async (req: any, res: Response) => {
  if (!req.user) {
    return errorResponseHandler("Authentication failed", httpStatusCode.UNAUTHORIZED, res);
  }

  const { id: fromUserId } = req.user ;
  const { id : toUserId } = req.params;

  // Validate required fields
  if (!toUserId) {
    return errorResponseHandler("Target user ID is required", httpStatusCode.BAD_REQUEST, res);
  }

  // Validate user ID
  if (!mongoose.Types.ObjectId.isValid(toUserId)) {
    return errorResponseHandler("Invalid target user ID", httpStatusCode.BAD_REQUEST, res);
  }

  // Prevent self-disliking
  if (fromUserId === toUserId) {
    return errorResponseHandler("Cannot dislike yourself", httpStatusCode.BAD_REQUEST, res);
  }

  try {
    // Check if target user exists
    const targetUser = await usersModel.findById(toUserId);
    if (!targetUser) {
      return errorResponseHandler("Target user not found", httpStatusCode.NOT_FOUND, res);
    }

    // Check for existing like
    const existingLike = await UserMatch.findOne({
      fromUser: fromUserId,
      toUser: toUserId,
      type: "like"
    });

    if (existingLike) {
      // Remove like first
      await UserMatch.findByIdAndDelete(existingLike._id);
    }

    // Check for existing dislike
    const existingDislike = await UserMatch.findOne({
      fromUser: fromUserId,
      toUser: toUserId,
      type: "dislike"
    });

    if (existingDislike) {
      // Remove dislike (toggle off)
      await UserMatch.findByIdAndDelete(existingDislike._id);
      return {
        success: true,
        message: "Dislike removed",
        active: false
      };
    } else {
      // Create new dislike
      const newDislike = new UserMatch({
        fromUser: fromUserId,
        toUser: toUserId,
        type: "dislike"
      });
      
      await newDislike.save();
      
      return {
        success: true,
        message: "User disliked successfully",
        active: true,
        interaction: newDislike
      };
    }
  } catch (error) {
    if ((error as any).code === 11000) { // Duplicate key error
      return errorResponseHandler("Interaction already exists", httpStatusCode.BAD_REQUEST, res);
    }
    throw error;
  }
};

/**
 * Get user matches
 */
export const getUserMatchesService = async (req: Request, res: Response) => {
  if (!req.user) {
    return errorResponseHandler("Authentication failed", httpStatusCode.UNAUTHORIZED, res);
  }

  const { id: userId } = req.user as JwtPayload;
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 10;
  const skip = (page - 1) * limit;

  try {
    // Get matches (mutual likes where isMatch is true)
    const matches = await UserMatch.find({
      fromUser: userId,
      type: "like",
      isMatch: true
    })
      .populate('toUser', '-password')
      .skip(skip)
      .limit(limit)
      .sort({ matchedAt: -1 });

    const total = await UserMatch.countDocuments({
      fromUser: userId,
      type: "like",
      isMatch: true
    });

    return {
      success: true,
      data: matches,
      pagination: {
        current: page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    };
  } catch (error) {
    throw error;
  }
};

/**
 * Get user feed (excluding disliked users and those who disliked the user)
 */
export const getUserFeedService = async (req: Request, res: Response) => {
  if (!req.user) {
    return errorResponseHandler("Authentication failed", httpStatusCode.UNAUTHORIZED, res);
  }

  const { id: userId } = req.user as JwtPayload;
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 10;
  const skip = (page - 1) * limit;

  try {
    // Get IDs of users this user has disliked
    const dislikedByMe = await UserMatch.find({
      fromUser: userId,
      type: "dislike"
    }).select('toUser');
    const dislikedUserIds = dislikedByMe.map(match => match.toUser);

    // Get IDs of users who have disliked this user
    const dislikedByOthers = await UserMatch.find({
      toUser: userId,
      type: "dislike"
    }).select('fromUser');
    const usersWhoDislikedMe = dislikedByOthers.map(match => match.fromUser);

    // Combine both lists to exclude from feed (plus own ID)
    const excludeUserIds = [...dislikedUserIds, ...usersWhoDislikedMe, userId];

    // Build query to prioritize boosted profiles
    const boostedUsers = await UserMatch.find({
      type: "like",
      subType: "boost",
    }).select('fromUser').distinct('fromUser');

    // Get users for the feed, prioritizing boosted users
    let userQuery = {
      _id: { $nin: excludeUserIds }
    };
    
    // First get boosted users (if any)
    let users: Array<mongoose.Document> = [];
    if (boostedUsers.length > 0) {
      const boostedQuery = {
        ...userQuery,
        _id: { $in: boostedUsers, $nin: excludeUserIds }
      };
      
      const boostedProfiles = await usersModel.find(boostedQuery)
        .select('-password')
        .limit(Math.min(5, limit)) // Limit boosted profiles to 5 or less
        .sort({ createdAt: -1 });
      
      users = [...boostedProfiles as mongoose.Document[]];
    }
    
    // If we need more users to fill the limit
    if (users.length < limit) {
      const remainingLimit = limit - users.length;
      const remainingSkip = Math.max(0, skip - users.length);
      
      // For non-boosted users, exclude both disliked and already fetched boosted ones
      const nonBoostedQuery = {
        ...userQuery,
        _id: { $nin: [...excludeUserIds, ...users.map(u => u._id)] }
      };
      
      const regularProfiles = await usersModel.find(nonBoostedQuery)
        .select('-password')
        .skip(remainingSkip)
        .limit(remainingLimit)
        .sort({ createdAt: -1 });
      
      users = [...users, ...regularProfiles];
    }

    // Calculate total for pagination
    const total = await usersModel.countDocuments({
      _id: { $nin: excludeUserIds }
    });

    return {
      success: true,
      data: users,
      pagination: {
        current: page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    };
  } catch (error) {
    throw error;
  }
};

/**
 * Get statistics about user's likes/dislikes
 */
export const getUserMatchStatsService = async (req: Request, res: Response) => {
  if (!req.user) {
    return errorResponseHandler("Authentication failed", httpStatusCode.UNAUTHORIZED, res);
  }

  const { id: userId } = req.user as JwtPayload;

  try {
    const stats = {
      // Likes I've sent
      likesSent: await UserMatch.countDocuments({
        fromUser: userId,
        type: "like",
        subType: null
      }),
      superlikesSent: await UserMatch.countDocuments({
        fromUser: userId,
        type: "like",
        subType: "superlike"
      }),
      boostsActive: await UserMatch.countDocuments({
        fromUser: userId,
        type: "like",
        subType: "boost",
      }),
      
      // Likes I've received
      likesReceived: await UserMatch.countDocuments({
        toUser: userId,
        type: "like"
      }),
      
      // Matches
      matches: await UserMatch.countDocuments({
        fromUser: userId,
        type: "like",
        isMatch: true
      }),
      
      // Dislike stats
      dislikesSent: await UserMatch.countDocuments({
        fromUser: userId,
        type: "dislike"
      })
    };

    return {
      success: true,
      data: stats
    };
  } catch (error) {
    throw error;
  }
};
