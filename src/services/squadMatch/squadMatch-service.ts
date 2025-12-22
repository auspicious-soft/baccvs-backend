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
    return errorResponseHandler(
      "Authentication failed",
      httpStatusCode.UNAUTHORIZED,
      res
    );
  }

  const { id: userId } = req.user;
  const { id: squadId } = req.params;
  const { subType } = req.body;

  if (!squadId) {
    return errorResponseHandler(
      "Squad ID is required",
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

  try {
    const squad = await Squad.findById(squadId).populate(
      "members.user",
      "userName"
    );
    if (!squad) {
      return errorResponseHandler(
        "Squad not found",
        httpStatusCode.NOT_FOUND,
        res
      );
    }

    // Load acting user and ensure they have selected a squad to act from
    const actingUser = await usersModel
      .findById(userId)
      .select("userName selectedSquad totalLikes totalSuperLikes totalBoosts");
    if (!actingUser) {
      return errorResponseHandler(
        "User not found",
        httpStatusCode.NOT_FOUND,
        res
      );
    }

    if (!actingUser.selectedSquad) {
      return errorResponseHandler(
        "You must select a squad to act from",
        httpStatusCode.BAD_REQUEST,
        res
      );
    }

    const fromSquadId = actingUser.selectedSquad.toString();

    // Ensure the acting user is a member of the selected squad
    const fromSquad = await Squad.findById(fromSquadId);
    if (!fromSquad) {
      return errorResponseHandler(
        "Selected squad not found",
        httpStatusCode.BAD_REQUEST,
        res
      );
    }
    const isMemberOfFrom = fromSquad.members.some(
      (member: any) => member.user.toString() === userId
    );
    if (!isMemberOfFrom) {
      return errorResponseHandler(
        "You are not a member of the selected squad",
        httpStatusCode.FORBIDDEN,
        res
      );
    }

    // Prevent liking the same squad
    const isMember = squad.members.some(
      (member: any) => member.user._id.toString() === userId
    );
    if (isMember) {
      return errorResponseHandler(
        "You cannot like a squad you're already a member of",
        httpStatusCode.BAD_REQUEST,
        res
      );
    }

    const existingDislike = await SquadMatch.findOne({
      fromSquad: fromSquadId,
      toSquad: squadId,
      type: "dislike",
    });
    if (existingDislike) {
      await SquadMatch.findByIdAndDelete(existingDislike._id);
    }

    const existingLike = await SquadMatch.findOne({
      fromSquad: fromSquadId,
      toSquad: squadId,
      type: "like",
    });

    const finalSubType = subType || null;
    let field = "totalLikes";
    if (finalSubType === "superlike") {
      field = "totalSuperLikes";
    } else if (finalSubType === "boost") {
      field = "totalBoosts";
    }

    const sender = await usersModel.findById(userId).select("userName");

    if (existingLike) {
      if (existingLike.subType === finalSubType) {
        await SquadMatch.findByIdAndDelete(existingLike._id);
        await usersModel.updateOne({ _id: userId }, { $inc: { [field]: 1 } });
        return {
          success: true,
          message: finalSubType ? `${finalSubType} removed` : "Like removed",
          active: false,
        };
      } else {
        const user = await usersModel.findById(userId);
        if (!user || (user.toObject() as any)[field] <= 0) {
          return errorResponseHandler(
            `Insufficient ${field.replace("total", "").toLowerCase()}`,
            httpStatusCode.BAD_REQUEST,
            res
          );
        }

        await usersModel.updateOne({ _id: userId }, { $inc: { [field]: -1 } });
        const updatedLike = await SquadMatch.findByIdAndUpdate(
          existingLike._id,
          { subType: finalSubType, actionBy: userId },
          { new: true }
        );

        // Notify all squad members (choose notification type based on subType)
        for (const member of squad.members) {
          if (member.user && member.user._id) {
            const notifType =
              finalSubType === "superlike"
                ? NotificationType.SQUAD_SUPERLIKE
                : finalSubType === "boost"
                ? NotificationType.SQUAD_BOOST
                : NotificationType.SQUAD_LIKE;

            await createNotification(
              member.user._id.toString(),
              userId,
              notifType,
              finalSubType
                ? `${
                    sender?.userName || "Someone"
                  } ${finalSubType}d your squad "${squad.title}"!`
                : `${sender?.userName || "Someone"} liked your squad "${
                    squad.title
                  }"!`,
              undefined,
              squadId
            );
          }
        }

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
      const user = actingUser; // already loaded
      if (!user || (user.toObject() as any)[field] <= 0) {
        return errorResponseHandler(
          `Insufficient ${field.replace("total", "").toLowerCase()}`,
          httpStatusCode.BAD_REQUEST,
          res
        );
      }

      await usersModel.updateOne({ _id: userId }, { $inc: { [field]: -1 } });
      const newLike = new SquadMatch({
        fromSquad: fromSquadId,
        toSquad: squadId,
        type: "like",
        subType: finalSubType,
        actionBy: userId,
      });
      await newLike.save();

      // Notify all squad members (choose notification type based on subType)
      for (const member of squad.members) {
        if (member.user && member.user._id) {
          const notifType =
            finalSubType === "superlike"
              ? NotificationType.SQUAD_SUPERLIKE
              : finalSubType === "boost"
              ? NotificationType.SQUAD_BOOST
              : NotificationType.SQUAD_LIKE;

          await createNotification(
            member.user._id.toString(),
            userId,
            notifType,
            finalSubType
              ? `${
                  sender?.userName || "Someone"
                } ${finalSubType}d your squad "${squad.title}"!`
              : `${sender?.userName || "Someone"} liked your squad "${
                  squad.title
                }"!`,
            undefined,
            squadId
          );
        }
      }

      return {
        success: true,
        message: finalSubType
          ? `Squad ${finalSubType}d successfully`
          : "Squad liked successfully",
        active: true,
        interaction: newLike,
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
 * Handle user dislike for a squad
 */
export const userDislikeSquadService = async (req: any, res: Response) => {
  if (!req.user) {
    return errorResponseHandler(
      "Authentication failed",
      httpStatusCode.UNAUTHORIZED,
      res
    );
  }

  const { id: userId } = req.user;
  const { id: squadId } = req.params;

  if (!squadId) {
    return errorResponseHandler(
      "Squad ID is required",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

  try {
    const squad = await Squad.findById(squadId).populate(
      "members.user",
      "userName"
    );
    if (!squad) {
      return errorResponseHandler(
        "Squad not found",
        httpStatusCode.NOT_FOUND,
        res
      );
    }

    // Load acting user and ensure they have selected a squad to act from
    const actingUser = await usersModel
      .findById(userId)
      .select("userName selectedSquad");
    if (!actingUser) {
      return errorResponseHandler(
        "User not found",
        httpStatusCode.NOT_FOUND,
        res
      );
    }

    if (!actingUser.selectedSquad) {
      return errorResponseHandler(
        "You must select a squad to act from",
        httpStatusCode.BAD_REQUEST,
        res
      );
    }

    const fromSquadId = actingUser.selectedSquad.toString();

    const isMember = squad.members.some(
      (member: any) => member.user._id.toString() === userId
    );
    if (isMember) {
      return errorResponseHandler(
        "You cannot dislike a squad you're already a member of",
        httpStatusCode.BAD_REQUEST,
        res
      );
    }

    const existingLike = await SquadMatch.findOne({
      fromSquad: fromSquadId,
      toSquad: squadId,
      type: "like",
    });
    if (existingLike) {
      await SquadMatch.findByIdAndDelete(existingLike._id);
    }

    const existingDislike = await SquadMatch.findOne({
      fromSquad: fromSquadId,
      toSquad: squadId,
      type: "dislike",
    });

    const sender = await usersModel.findById(userId).select("userName");

    if (existingDislike) {
      await SquadMatch.findByIdAndDelete(existingDislike._id);
      return {
        success: true,
        message: "Dislike removed",
        active: false,
      };
    } else {
      const newDislike = new SquadMatch({
        fromSquad: fromSquadId,
        toSquad: squadId,
        type: "dislike",
        actionBy: userId,
      });
      await newDislike.save();

      // Notify all squad members
      for (const member of squad.members) {
        if (member.user && member.user._id) {
          await createNotification(
            member.user._id.toString(),
            userId,
            NotificationType.SQUAD_DISLIKE,
            `${sender?.userName || "Someone"} disliked your squad "${
              squad.title
            }"!`,
            undefined,
            squadId
          );
        }
      }

      return {
        success: true,
        message: "Squad disliked successfully",
        active: true,
        interaction: newDislike,
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
 * Approve a user's request to join a squad (match with them)
 */
export const approveSquadJoinRequestService = async (
  req: any,
  res: Response
) => {
  if (!req.user) {
    return errorResponseHandler(
      "Authentication failed",
      httpStatusCode.UNAUTHORIZED,
      res
    );
  }

  const { id: adminId } = req.user;
  const { squadId, userId } = req.params;

  if (!squadId || !userId) {
    return errorResponseHandler(
      "Squad ID and User ID are required",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

  try {
    // Check if squad exists
    const squad = await Squad.findById(squadId);
    if (!squad) {
      return errorResponseHandler(
        "Squad not found",
        httpStatusCode.NOT_FOUND,
        res
      );
    }

    // Check if user is admin of the squad
    const isAdmin = squad.members.some(
      (member: any) =>
        member.user.toString() === adminId && member.role === "admin"
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
      return errorResponseHandler(
        "User not found",
        httpStatusCode.NOT_FOUND,
        res
      );
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
      return errorResponseHandler(
        "Squad is full",
        httpStatusCode.BAD_REQUEST,
        res
      );
    }

    // Check if user has liked the squad (they may have liked from a squad)
    const userLike = await SquadMatch.findOne({
      actionBy: userId,
      toSquad: squadId,
      type: "like",
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
      joinedAt: new Date(),
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
      squad: updatedSquad,
    };
  } catch (error) {
    throw error;
  }
};

/**
 * Reject a user's request to join a squad
 */
export const rejectSquadJoinRequestService = async (
  req: any,
  res: Response
) => {
  if (!req.user) {
    return errorResponseHandler(
      "Authentication failed",
      httpStatusCode.UNAUTHORIZED,
      res
    );
  }

  const { id: adminId } = req.user;
  const { squadId, userId } = req.params;

  if (!squadId || !userId) {
    return errorResponseHandler(
      "Squad ID and User ID are required",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

  try {
    // Check if squad exists
    const squad = await Squad.findById(squadId);
    if (!squad) {
      return errorResponseHandler(
        "Squad not found",
        httpStatusCode.NOT_FOUND,
        res
      );
    }

    // Check if user is admin of the squad
    const isAdmin = squad.members.some(
      (member: any) =>
        member.user.toString() === adminId && member.role === "admin"
    );

    if (!isAdmin) {
      return errorResponseHandler(
        "You must be an admin of the squad to reject join requests",
        httpStatusCode.FORBIDDEN,
        res
      );
    }

    // Check if user has liked the squad (they may have liked from a squad)
    const userLike = await SquadMatch.findOne({
      actionBy: userId,
      toSquad: squadId,
      type: "like",
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
      message: "Join request rejected successfully",
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
    return errorResponseHandler(
      "Authentication failed",
      httpStatusCode.UNAUTHORIZED,
      res
    );
  }

  const { id: userId } = req.user;
  const { squadId } = req.params;
  const { page = 1, limit = 10 } = req.query;

  if (!squadId) {
    return errorResponseHandler(
      "Squad ID is required",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

  try {
    // Check if squad exists
    const squad = await Squad.findById(squadId);
    if (!squad) {
      return errorResponseHandler(
        "Squad not found",
        httpStatusCode.NOT_FOUND,
        res
      );
    }

    // Check if user is admin of the squad
    const isAdmin = squad.members.some(
      (member: any) =>
        member.user.toString() === userId && member.role === "admin"
    );

    if (!isAdmin) {
      return errorResponseHandler(
        "You must be an admin of the squad to view join requests",
        httpStatusCode.FORBIDDEN,
        res
      );
    }

    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

    // Get all squads/users who have liked the squad but are not matched yet
    const joinRequests = await SquadMatch.find({
      toSquad: squadId,
      type: "like",
      isMatch: false,
    })
      .populate("actionBy", "userName photos")
      .populate("fromSquad", "title creator")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit as string));

    const total = await SquadMatch.countDocuments({
      toSquad: squadId,
      type: "like",
      isMatch: false,
    });

    return {
      success: true,
      joinRequests: joinRequests.map((request) => ({
        requestId: request._id,
        user: request.actionBy,
        fromSquad: request.fromSquad,
        subType: request.subType,
        createdAt: request.createdAt,
      })),
      pagination: {
        total,
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        pages: Math.ceil(total / parseInt(limit as string)),
      },
    };
  } catch (error) {
    throw error;
  }
};

/**
 * Set the squad the user will act from (must be a squad the user is a member of)
 */
export const selectUserSquadService = async (req: any, res: Response) => {
  if (!req.user) {
    return errorResponseHandler(
      "Authentication failed",
      httpStatusCode.UNAUTHORIZED,
      res
    );
  }

  const { id: userId } = req.user;
  const squadId = req.params.squadId;

  if (!squadId) {
    return errorResponseHandler(
      "Squad ID is required",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

  const squad = await Squad.findById(squadId);
  if (!squad) {
    return errorResponseHandler(
      "Squad not found",
      httpStatusCode.NOT_FOUND,
      res
    );
  }

  const isMember = squad.members.some(
    (member: any) => member.user.toString() === userId
  );
  if (!isMember) {
    return errorResponseHandler(
      "You must be a member of the selected squad",
      httpStatusCode.FORBIDDEN,
      res
    );
  }

  await usersModel.updateOne(
    { _id: userId },
    { $set: { selectedSquad: squadId } }
  );

  return {
    success: true,
    message: "Selected squad updated",
    data: squadId,
  };
};
