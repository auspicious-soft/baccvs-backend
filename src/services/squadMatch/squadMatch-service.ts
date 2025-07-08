import { Response } from "express";
import mongoose from "mongoose";
import { httpStatusCode } from "src/lib/constant";
import { errorResponseHandler } from "src/lib/errors/error-response-handler";
import { SquadMatch } from "src/models/squadmatch/squadmatch-schema";
import { Squad, SquadStatus } from "src/models/squad/squad-schema";
import { usersModel } from "src/models/user/user-schema";
import { createNotification } from "../userNotification/user-Notification-service";
import { NotificationType } from "src/models/userNotification/user-Notification-schema";

/**
 * Handle user like for a squad
 */
export const userLikeSquadService = async (req: any, res: Response) => {
  if (!req.user) {
    return errorResponseHandler('Authentication failed', httpStatusCode.UNAUTHORIZED, res);
  }

  const { id: userId } = req.user;
  const { id: squadId } = req.params;
  const { subType } = req.body;

  if (!squadId) {
    return errorResponseHandler('Squad ID is required', httpStatusCode.BAD_REQUEST, res);
  }

  if (subType && !['superlike', 'boost'].includes(subType)) {
    return errorResponseHandler('Invalid subType. Must be "superlike" or "boost"', httpStatusCode.BAD_REQUEST, res);
  }

  try {
    const squad = await Squad.findById(squadId);
    if (!squad) {
      return errorResponseHandler('Squad not found', httpStatusCode.NOT_FOUND, res);
    }

    const isMember = squad.members.some((member: any) => member.user.toString() === userId);
    if (isMember) {
      return errorResponseHandler(
        "You cannot like a squad you're already a member of",
        httpStatusCode.BAD_REQUEST,
        res
      );
    }

    const existingDislike = await SquadMatch.findOne({
      fromUser: userId,
      toSquad: squadId,
      type: 'dislike',
    });
    if (existingDislike) {
      await SquadMatch.findByIdAndDelete(existingDislike._id);
    }

    const existingLike = await SquadMatch.findOne({
      fromUser: userId,
      toSquad: squadId,
      type: 'like',
    });

    const finalSubType = subType || null;
    let field = 'totalLikes';
    if (finalSubType === 'superlike') {
      field = 'totalSuperLikes';
    } else if (finalSubType === 'boost') {
      field = 'totalBoosts';
    }

    if (existingLike) {
      if (existingLike.subType === finalSubType) {
        await SquadMatch.findByIdAndDelete(existingLike._id);
        await usersModel.updateOne({ _id: userId }, { $inc: { [field]: 1 } });
        return {
          success: true,
          message: finalSubType ? `${finalSubType} removed` : 'Like removed',
          active: false,
        };
      } else {
        const user = await usersModel.findById(userId);
        if (!user || (user.toObject() as any)[field] <= 0) {
          return errorResponseHandler(
            `Insufficient ${field.replace('total', '').toLowerCase()}`,
            httpStatusCode.BAD_REQUEST,
            res
          );
        }

        await usersModel.updateOne({ _id: userId }, { $inc: { [field]: -1 } });
        const updatedLike = await SquadMatch.findByIdAndUpdate(
          existingLike._id,
          { subType: finalSubType },
          { new: true }
        );

        const sender = await usersModel.findById(userId).select('userName');
        await createNotification(
          squad.creator.toString(),
          userId,
          NotificationType.SQUAD_LIKE,
          finalSubType
            ? `${sender?.userName || 'Someone'} ${finalSubType}d your squad "${squad.title}"!`
            : `${sender?.userName || 'Someone'} liked your squad "${squad.title}"!`,
          undefined,
          squadId
        );

        return {
          success: true,
          message: finalSubType ? `Updated to ${finalSubType}` : 'Updated to regular like',
          active: true,
          interaction: updatedLike,
        };
      }
    } else {
      const user = await usersModel.findById(userId);
      if (!user || (user.toObject() as any)[field] <= 0) {
        return errorResponseHandler(
          `Insufficient ${field.replace('total', '').toLowerCase()}`,
          httpStatusCode.BAD_REQUEST,
          res
        );
      }

      await usersModel.updateOne({ _id: userId }, { $inc: { [field]: -1 } });
      const newLike = new SquadMatch({
        fromUser: userId,
        toSquad: squadId,
        type: 'like',
        subType: finalSubType,
      });
      await newLike.save();

      const sender = await usersModel.findById(userId).select('userName');
      await createNotification(
        squad.creator.toString(),
        userId,
        NotificationType.SQUAD_LIKE,
        finalSubType
          ? `${sender?.userName || 'Someone'} ${finalSubType}d your squad "${squad.title}"!`
          : `${sender?.userName || 'Someone'} liked your squad "${squad.title}"!`,
        undefined,
        squadId
      );

      return {
        success: true,
        message: finalSubType ? `Squad ${finalSubType}d successfully` : 'Squad liked successfully',
        active: true,
        interaction: newLike,
      };
    }
  } catch (error) {
    if ((error as any).code === 11000) {
      return errorResponseHandler('Interaction already exists', httpStatusCode.BAD_REQUEST, res);
    }
    throw error;
  }
};

/**
 * Handle user dislike for a squad
 */
export const userDislikeSquadService = async (req: any, res: Response) => {
  if (!req.user) {
    return errorResponseHandler("Authentication failed", httpStatusCode.UNAUTHORIZED, res);
  }

  const { id: userId } = req.user;
  const { id: squadId } = req.params;

  // Validation checks
  if (!squadId) {
    return errorResponseHandler("Squad ID is required", httpStatusCode.BAD_REQUEST, res);
  }

  try {
    // Check if squad exists
    const squad = await Squad.findById(squadId);
    if (!squad) {
      return errorResponseHandler("Squad not found", httpStatusCode.NOT_FOUND, res);
    }

    // Check if user is already a member of the squad
    const isMember = squad.members.some(
      (member: any) => member.user.toString() === userId
    );

    if (isMember) {
      return errorResponseHandler(
        "You cannot dislike a squad you're already a member of",
        httpStatusCode.BAD_REQUEST,
        res
      );
    }

    // Remove existing like if present
    const existingLike = await SquadMatch.findOne({
      fromUser: userId,
      toSquad: squadId,
      type: "like",
    });
    if (existingLike) {
      await SquadMatch.findByIdAndDelete(existingLike._id);
    }

    // Check for existing dislike
    const existingDislike = await SquadMatch.findOne({
      fromUser: userId,
      toSquad: squadId,
      type: "dislike",
    });

    if (existingDislike) {
      // Remove the dislike (toggle off)
      await SquadMatch.findByIdAndDelete(existingDislike._id);
      
      return {
        success: true,
        message: "Dislike removed",
        active: false,
      };
    } else {
      // Create new dislike
      const newDislike = new SquadMatch({
        fromUser: userId,
        toSquad: squadId,
        type: "dislike"
      });
      
      await newDislike.save();
      
      return {
        success: true,
        message: "Squad disliked successfully",
        active: true,
        interaction: newDislike,
      };
    }
  } catch (error) {
    if ((error as any).code === 11000) {
      return errorResponseHandler("Interaction already exists", httpStatusCode.BAD_REQUEST, res);
    }
    throw error;
  }
};

/**
 * Approve a user's request to join a squad (match with them)
 */
export const approveSquadJoinRequestService = async (req: any, res: Response) => {
  if (!req.user) {
    return errorResponseHandler("Authentication failed", httpStatusCode.UNAUTHORIZED, res);
  }

  const { id: adminId } = req.user;
  const { squadId, userId } = req.params;

  if (!squadId || !userId) {
    return errorResponseHandler("Squad ID and User ID are required", httpStatusCode.BAD_REQUEST, res);
  }

  try {
    // Check if squad exists
    const squad = await Squad.findById(squadId);
    if (!squad) {
      return errorResponseHandler("Squad not found", httpStatusCode.NOT_FOUND, res);
    }

    // Check if user is admin of the squad
    const isAdmin = squad.members.some(
      (member: any) => member.user.toString() === adminId && member.role === "admin"
    );

    if (!isAdmin) {
      return errorResponseHandler(
        "You must be an admin of the squad to approve join requests",
        httpStatusCode.FORBIDDEN,
        res
      );
    }

    // Check if user exists
    const user = await usersModel.findById(userId);
    if (!user) {
      return errorResponseHandler("User not found", httpStatusCode.NOT_FOUND, res);
    }

    // Check if user is already a member
    const isMember = squad.members.some(
      (member: any) => member.user.toString() === userId
    );

    if (isMember) {
      return errorResponseHandler(
        "User is already a member of this squad",
        httpStatusCode.BAD_REQUEST,
        res
      );
    }

    // Check if squad is full
    if (squad.members.length >= squad.maxMembers) {
      return errorResponseHandler("Squad is full", httpStatusCode.BAD_REQUEST, res);
    }

    // Check if user has liked the squad
    const userLike = await SquadMatch.findOne({
      fromUser: userId,
      toSquad: squadId,
      type: "like"
    });

    if (!userLike) {
      return errorResponseHandler(
        "User has not requested to join this squad",
        httpStatusCode.BAD_REQUEST,
        res
      );
    }

    // Update the match status
    userLike.isMatch = true;
    userLike.matchedAt = new Date();
    await userLike.save();

    // Add user to squad members
    squad.members.push({
      user: new mongoose.Types.ObjectId(userId),
      role: "member",
      joinedAt: new Date()
    });

    // If squad is now full, update status
    if (squad.members.length >= squad.maxMembers) {
      squad.status = SquadStatus.FULL; // Ensure SquadStatus is imported correctly
    }

    await squad.save();

    const updatedSquad = await Squad.findById(squadId)
      .populate("creator", "userName photos")
      .populate("members.user", "userName photos");

    return {
      success: true,
      message: "User added to squad successfully",
      squad: updatedSquad
    };
  } catch (error) {
    throw error;
  }
};

/**
 * Reject a user's request to join a squad
 */
export const rejectSquadJoinRequestService = async (req: any, res: Response) => {
  if (!req.user) {
    return errorResponseHandler("Authentication failed", httpStatusCode.UNAUTHORIZED, res);
  }

  const { id: adminId } = req.user;
  const { squadId, userId } = req.params;

  if (!squadId || !userId) {
    return errorResponseHandler("Squad ID and User ID are required", httpStatusCode.BAD_REQUEST, res);
  }

  try {
    // Check if squad exists
    const squad = await Squad.findById(squadId);
    if (!squad) {
      return errorResponseHandler("Squad not found", httpStatusCode.NOT_FOUND, res);
    }

    // Check if user is admin of the squad
    const isAdmin = squad.members.some(
      (member: any) => member.user.toString() === adminId && member.role === "admin"
    );

    if (!isAdmin) {
      return errorResponseHandler(
        "You must be an admin of the squad to reject join requests",
        httpStatusCode.FORBIDDEN,
        res
      );
    }

    // Check if user has liked the squad
    const userLike = await SquadMatch.findOne({
      fromUser: userId,
      toSquad: squadId,
      type: "like"
    });

    if (!userLike) {
      return errorResponseHandler(
        "User has not requested to join this squad",
        httpStatusCode.BAD_REQUEST,
        res
      );
    }

    // Delete the like (reject the request)
    await SquadMatch.findByIdAndDelete(userLike._id);

    return {
      success: true,
      message: "Join request rejected successfully"
    };
  } catch (error) {
    throw error;
  }
};

/**
 * Get all users who have liked a squad (join requests)
 */
export const getSquadJoinRequestsService = async (req: any, res: Response) => {
  if (!req.user) {
    return errorResponseHandler("Authentication failed", httpStatusCode.UNAUTHORIZED, res);
  }

  const { id: userId } = req.user;
  const { squadId } = req.params;
  const { page = 1, limit = 10 } = req.query;

  if (!squadId) {
    return errorResponseHandler("Squad ID is required", httpStatusCode.BAD_REQUEST, res);
  }

  try {
    // Check if squad exists
    const squad = await Squad.findById(squadId);
    if (!squad) {
      return errorResponseHandler("Squad not found", httpStatusCode.NOT_FOUND, res);
    }

    // Check if user is admin of the squad
    const isAdmin = squad.members.some(
      (member: any) => member.user.toString() === userId && member.role === "admin"
    );

    if (!isAdmin) {
      return errorResponseHandler(
        "You must be an admin of the squad to view join requests",
        httpStatusCode.FORBIDDEN,
        res
      );
    }

    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

    // Get all users who have liked the squad but are not matched yet
    const joinRequests = await SquadMatch.find({
      toSquad: squadId,
      type: "like",
      isMatch: false
    })
    .populate("fromUser", "userName photos")
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parseInt(limit as string));

    const total = await SquadMatch.countDocuments({
      toSquad: squadId,
      type: "like",
      isMatch: false
    });

    return {
      success: true,
      joinRequests: joinRequests.map(request => ({
        requestId: request._id,
        user: request.fromUser,
        subType: request.subType,
        createdAt: request.createdAt
      })),
      pagination: {
        total,
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        pages: Math.ceil(total / parseInt(limit as string))
      }
    };
  } catch (error) {
    throw error;
  }
};
