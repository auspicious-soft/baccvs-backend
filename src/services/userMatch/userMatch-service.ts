import { Request, Response } from "express";
import mongoose from "mongoose";
import { JwtPayload } from "jsonwebtoken";
import { UserMatch } from "src/models/usermatch/usermatch-schema";
import { httpStatusCode } from "src/lib/constant";
import { errorResponseHandler } from "src/lib/errors/error-response-handler";
import { usersModel } from "src/models/user/user-schema";
import { createNotification } from "../userNotification/user-Notification-service";
import {
  Notification,
  NotificationType,
} from "src/models/userNotification/user-Notification-schema";
import { Conversation } from "src/models/chat/conversation-schema";

// Check and update match status
const checkAndUpdateMatchStatus: any = async (
  fromUserId: any,
  toUserId: any
) => {
  const counterpartLike = await UserMatch.findOne({
    fromUser: toUserId,
    toUser: fromUserId,
    type: "like",
  });

  if (counterpartLike) {
    const now = new Date();
    await UserMatch.findOneAndUpdate(
      { fromUser: fromUserId, toUser: toUserId },
      { isMatch: true, matchedAt: now }
    );
    await UserMatch.findOneAndUpdate(
      { fromUser: toUserId, toUser: fromUserId },
      { isMatch: true, matchedAt: now }
    );
    return true;
  }
  return false;
};

export const userLikeService = async (req: any, res: Response) => {
  if (!req.user) {
    return errorResponseHandler(
      "Authentication failed",
      httpStatusCode.UNAUTHORIZED,
      res
    );
  }

  const { id: fromUserId } = req.user;
  const { id: toUserId } = req.params;
  const { subType } = req.body;

  if (!toUserId) {
    return errorResponseHandler(
      "Target user ID is required",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

  if (subType && !["superlike", "boost"].includes(subType)) {
    return errorResponseHandler(
      'Invalid subType. Must be "superlike" or "boost"',
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

  if (!mongoose.Types.ObjectId.isValid(toUserId)) {
    return errorResponseHandler(
      "Invalid target user ID",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

  if (fromUserId === toUserId) {
    return errorResponseHandler(
      "Cannot like yourself",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

  try {
    // const fromUserName = await usersModel.findById(fromUserId)
    const targetUser = await usersModel.findById(toUserId);
    if (!targetUser) {
      return errorResponseHandler(
        "Target user not found",
        httpStatusCode.NOT_FOUND,
        res
      );
    }

    const existingDislike = await UserMatch.findOne({
      fromUser: fromUserId,
      toUser: toUserId,
      type: "dislike",
    });
    if (existingDislike) {
      await UserMatch.findByIdAndDelete(existingDislike._id);
    }

    const existingLike = await UserMatch.findOne({
      fromUser: fromUserId,
      toUser: toUserId,
      type: "like",
    });

    const finalSubType = subType || null;
    let field = "totalLikes";
    if (finalSubType === "superlike") {
      field = "totalSuperLikes";
    } else if (finalSubType === "boost") {
      field = "totalBoosts";
    }

    if (existingLike) {
      if (existingLike.subType === finalSubType) {
        await UserMatch.findByIdAndDelete(existingLike._id);
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
        const user = await usersModel.findById(fromUserId);
        if (!user || (user.toObject() as any)[field] <= 0) {
          return errorResponseHandler(
            `Insufficient ${field.replace("total", "").toLowerCase()}`,
            httpStatusCode.BAD_REQUEST,
            res
          );
        }

        await usersModel.updateOne(
          { _id: fromUserId },
          { $inc: { [field]: -1 } }
        );
        const updatedLike = await UserMatch.findByIdAndUpdate(
          existingLike._id,
          { subType: finalSubType },
          { new: true }
        );

        await createNotification(
          toUserId,
          fromUserId,
          NotificationType.USER_LIKE,
          finalSubType
            ? `${user?.userName} ${finalSubType}d you!`
            : `${user?.userName} liked you!`,
          fromUserId
        );

        return {
          success: true,
          message: finalSubType
            ? `Updated to ${finalSubType}`
            : "Updated to regular like",
          active: true,
          interaction: updatedLike,
        };
      }
    } else {
      const user = await usersModel.findById(fromUserId);
      if (!user || (user.toObject() as any)[field] <= 0) {
        return errorResponseHandler(
          `Insufficient ${field.replace("total", "").toLowerCase()}`,
          httpStatusCode.BAD_REQUEST,
          res
        );
      }

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
     const saved = await newLike.save();
      
      const populatedLike = await saved.populate("toUser", "userName photos");

      const isMatch = await checkAndUpdateMatchStatus(fromUserId, toUserId);

      await createNotification(
        toUserId,
        fromUserId,
        NotificationType.USER_LIKE,
        finalSubType
          ? `${user.userName} ${finalSubType}d you!`
          : `${user.userName} liked you!`,
        fromUserId
      );

      return {
        success: true,
        message: finalSubType ? `${finalSubType} created` : "Like created",
        data: { active: true, isMatch, interaction: populatedLike },
      };
    }
  } catch (error) {
    if ((error as any).code === 11000) {
      return errorResponseHandler(
        "Interaction already exists",
        httpStatusCode.BAD_REQUEST,
        res
      );
    }
    throw error;
  }
};

/**
 * Handle user dislike
 */
export const userDislikeService = async (req: any, res: Response) => {
  if (!req.user) {
    return errorResponseHandler(
      "Authentication failed",
      httpStatusCode.UNAUTHORIZED,
      res
    );
  }

  const { id: fromUserId } = req.user;
  const { id: toUserId } = req.params;

  // Validate required fields
  if (!toUserId) {
    return errorResponseHandler(
      "Target user ID is required",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

  // Validate user ID
  if (!mongoose.Types.ObjectId.isValid(toUserId)) {
    return errorResponseHandler(
      "Invalid target user ID",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

  // Prevent self-disliking
  if (fromUserId === toUserId) {
    return errorResponseHandler(
      "Cannot dislike yourself",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

  try {
    // Check if target user exists
    const targetUser = await usersModel.findById(toUserId);
    if (!targetUser) {
      return errorResponseHandler(
        "Target user not found",
        httpStatusCode.NOT_FOUND,
        res
      );
    }

    // Check for existing like
    const existingLike = await UserMatch.findOne({
      fromUser: fromUserId,
      toUser: toUserId,
      type: "like",
    });

    if (existingLike) {
      // Remove like first
      await UserMatch.findByIdAndDelete(existingLike._id);
    }

    // Check for existing dislike
    const existingDislike = await UserMatch.findOne({
      fromUser: fromUserId,
      toUser: toUserId,
      type: "dislike",
    });

    if (existingDislike) {
      // Remove dislike (toggle off)
      await UserMatch.findByIdAndDelete(existingDislike._id);
      return {
        success: true,
        message: "Dislike removed",
        active: false,
      };
    } else {
      // Create new dislike
      const newDislike = new UserMatch({
        fromUser: fromUserId,
        toUser: toUserId,
        type: "dislike",
      });

      await newDislike.save();

      // Create notification for the disliked user
      const sender = await usersModel.findById(fromUserId).select("userName");
      await createNotification(
        toUserId,
        fromUserId,
        NotificationType.USER_DISLIKE,
        `${sender?.userName || "Someone"} disliked you.`,
        fromUserId
      );

      return {
        success: true,
        message: "User disliked successfully",
        data: {
          active: true,
          interaction: newDislike,
        },
      };
    }
  } catch (error) {
    if ((error as any).code === 11000) {
      return errorResponseHandler(
        "Interaction already exists",
        httpStatusCode.BAD_REQUEST,
        res
      );
    }
    throw error;
  }
};

/**
 * Get user matches
 */
export const getUserMatchesService = async (req: Request, res: Response) => {
  if (!req.user) {
    return errorResponseHandler(
      "Authentication failed",
      httpStatusCode.UNAUTHORIZED,
      res
    );
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
      isMatch: true,
    })
      .populate("toUser", "-password")
      .skip(skip)
      .limit(limit)
      .sort({ matchedAt: -1 });

    const total = await UserMatch.countDocuments({
      fromUser: userId,
      type: "like",
      isMatch: true,
    });

    return {
      success: true,
      data: matches,
      pagination: {
        current: page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
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
    return errorResponseHandler(
      "Authentication failed",
      httpStatusCode.UNAUTHORIZED,
      res
    );
  }

  const { id: userId } = req.user as any;
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 10;
  const skip = (page - 1) * limit;

  const {
    minAge,
    maxAge,
    minDistance,
    maxDistance,
    interestedIn,
    musicStyles,
    interestCategories,
    atmosphereVibes,
    eventTypes,
    language,
    drinking,
    smoke,
    marijuana,
    drugs,
  } = req.body;

  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

  const dislikedByMe = await UserMatch.find({
    fromUser: userId,
    type: "dislike",
  }).select("toUser");
  const dislikedUserIds = dislikedByMe.map((match) => match.toUser);

  const dislikedByOthers = await UserMatch.find({
    toUser: userId,
    type: "dislike",
  }).select("fromUser");
  const usersWhoDislikedMe = dislikedByOthers.map((match) => match.fromUser);

  const excludeUserIds = [...dislikedUserIds, ...usersWhoDislikedMe, userId];

  const boostedUsers = await UserMatch.find({ type: "like", subType: "boost" })
    .select("fromUser")
    .distinct("fromUser");

  // 🟡 Exclude users with whom current user already has a conversation
  const conversations = await Conversation.find({
    participants: userId,
  }).select("participants");

  const usersInConversation = conversations
    .map((conv) => conv.participants)
    .flat()
    .filter((p) => p.toString() !== userId.toString());

  excludeUserIds.push(...usersInConversation);

  const userQuery: any = {
    _id: { $nin: excludeUserIds },
  };

  // 🎂 Age range
  if (minAge && maxAge) {
    const today = new Date();
    const minDOB = new Date(
      today.getFullYear() - parseInt(maxAge as string),
      today.getMonth(),
      today.getDate()
    );
    const maxDOB = new Date(
      today.getFullYear() - parseInt(minAge as string),
      today.getMonth(),
      today.getDate()
    );
    userQuery.dob = { $gte: minDOB, $lte: maxDOB };
  }

  const currentUser = await usersModel.findById(userId);
  const currentLocation: any = currentUser?.location;

  const geoQuery: any = {};

  if (currentLocation?.coordinates && maxDistance) {
    geoQuery.location = {
      $nearSphere: {
        $geometry: {
          type: "Point",
          coordinates: currentLocation.coordinates,
        },
        $minDistance: parseInt((minDistance as string) || "0") * 1000,
        $maxDistance: parseInt(maxDistance as string) * 1000,
      },
    };
  }

  // 🧑‍🤝‍🧑 Gender
  if (interestedIn) {
    const genderFilter = Array.isArray(interestedIn)
      ? interestedIn
      : [interestedIn];
    userQuery.gender = { $in: genderFilter };
  }

  if (musicStyles) {
    const music = Array.isArray(musicStyles) ? musicStyles : [musicStyles];
    userQuery.musicStyles = { $in: music };
  }

  if (interestCategories) {
    const interests = Array.isArray(interestCategories)
      ? interestCategories
      : [interestCategories];
    userQuery.interestCategories = { $in: interests };
  }

  if (atmosphereVibes) {
    const vibes = Array.isArray(atmosphereVibes)
      ? atmosphereVibes
      : [atmosphereVibes];
    userQuery.atmosphereVibes = { $in: vibes };
  }

  if (eventTypes) {
    const events = Array.isArray(eventTypes) ? eventTypes : [eventTypes];
    userQuery.eventTypes = { $in: events };
  }

  if (language) {
    const langs = Array.isArray(language) ? language : [language];
    userQuery.language = { $in: langs };
  }

  if (drinking) {
    userQuery.drinking = {
      $in: Array.isArray(drinking) ? drinking : [drinking],
    };
  }
  if (smoke) {
    userQuery.smoke = { $in: Array.isArray(smoke) ? smoke : [smoke] };
  }
  if (marijuana) {
    userQuery.marijuana = {
      $in: Array.isArray(marijuana) ? marijuana : [marijuana],
    };
  }
  if (drugs) {
    userQuery.drugs = { $in: Array.isArray(drugs) ? drugs : [drugs] };
  }

  // ✨ Boosted users first
  let users: Array<mongoose.Document> = [];

  if (boostedUsers.length > 0) {
    const boostedQuery = {
      ...userQuery,
      _id: { $in: boostedUsers, $nin: excludeUserIds },
      ...geoQuery,
    };

    const boostedProfiles = await usersModel
      .find(boostedQuery)
      .select("-password")
      .limit(Math.min(5, limit))
      .sort({ createdAt: -1 });

    users = [...boostedProfiles];
  }

  // 🧍‍♀️ Regular users
  if (users.length < limit) {
    const remainingLimit = limit - users.length;
    const remainingSkip = Math.max(0, skip - users.length);

    const nonBoostedQuery = {
      ...userQuery,
      _id: { $nin: [...excludeUserIds, ...users.map((u) => u._id)] },
      ...geoQuery,
    };

    const regularProfiles = await usersModel
      .find(nonBoostedQuery)
      .select("-password")
      .skip(remainingSkip)
      .limit(remainingLimit)
      .sort({ createdAt: -1 });

    users = [...users, ...regularProfiles];
  }

  // ✅ Don't use $nearSphere in count query
  const countQuery = {
    ...userQuery,
  };

  const likedMeLastWeek = await UserMatch.find({
    toUser: userId,
    type: "like",
    createdAt: { $gte: oneWeekAgo },
  }).select("fromUser");

  // Extract their IDs
  const likedMeIds = likedMeLastWeek.map((match) => match.fromUser.toString());

  // 2️⃣ Users I already liked
  const likedByMe = await UserMatch.find({
    fromUser: userId,
    type: "like",
  }).select("toUser");

  const likedByMeIds = likedByMe.map((match) => match.toUser.toString());

  // 3️⃣ Filter users who liked me but I haven’t liked back
  const pendingLikesIds = likedMeIds.filter((id) => !likedByMeIds.includes(id));

  // 4️⃣ Fetch their profiles
  let pendingLikeUsers: any[] = [];

  if (pendingLikesIds.length > 0) {
    pendingLikeUsers = await usersModel
      .find({
        _id: { $in: pendingLikesIds },
      })
      .select("-password");
  }

  const userUnreadNotification = await Notification.countDocuments({
    recipient: userId,
    isRead: false,
  });

  const total = await usersModel.countDocuments(countQuery);

  return {
    success: true,
    data: {
      users,
      pendingLikeUsers,
      userUnreadNotification,
    },
    pagination: {
      current: page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  };
};

/**
 * Get statistics about user's likes/dislikes
 */
export const getUserMatchStatsService = async (req: Request, res: Response) => {
  if (!req.user) {
    return errorResponseHandler(
      "Authentication failed",
      httpStatusCode.UNAUTHORIZED,
      res
    );
  }

  const { id: userId } = req.user as JwtPayload;

  try {
    const stats = {
      // Likes I've sent
      likesSent: await UserMatch.countDocuments({
        fromUser: userId,
        type: "like",
        subType: null,
      }),
      superlikesSent: await UserMatch.countDocuments({
        fromUser: userId,
        type: "like",
        subType: "superlike",
      }),
      boostsActive: await UserMatch.countDocuments({
        fromUser: userId,
        type: "like",
        subType: "boost",
      }),

      // Likes I've received
      likesReceived: await UserMatch.countDocuments({
        toUser: userId,
        type: "like",
      }),

      // Matches
      matches: await UserMatch.countDocuments({
        fromUser: userId,
        type: "like",
        isMatch: true,
      }),

      // Dislike stats
      dislikesSent: await UserMatch.countDocuments({
        fromUser: userId,
        type: "dislike",
      }),
    };

    return {
      success: true,
      data: stats,
    };
  } catch (error) {
    throw error;
  }
};
