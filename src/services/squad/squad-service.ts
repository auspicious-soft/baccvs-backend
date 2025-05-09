import { Request, Response } from "express";
import mongoose from "mongoose";
import { Squad, SquadStatus } from "src/models/squad/squad-schema";
import { httpStatusCode } from "src/lib/constant";
import { errorResponseHandler } from "src/lib/errors/error-response-handler";
import { usersModel } from "src/models/user/user-schema";

/**
 * Create a new squad
 */
export const createSquadService = async (req: any, res: Response) => {
  if (!req.user) {
    return errorResponseHandler("Authentication failed", httpStatusCode.UNAUTHORIZED, res);
  }

  const { id: userId } = req.user;
  const { title, about, maxMembers, media } = req.body;

  try {
    // Check if user already has an active squad as creator
    const existingSquad = await Squad.findOne({
      creator: userId,
      status: { $ne: SquadStatus.INACTIVE }
    });

    if (existingSquad) {
      return errorResponseHandler(
        "You already have an active squad. Please delete or leave it before creating a new one.",
        httpStatusCode.BAD_REQUEST,
        res
      );
    }

    // Create new squad
    const squad = new Squad({
      title,
      about,
      creator: userId,
      members: [{ user: userId, role: "admin", joinedAt: new Date() }],
      maxMembers: maxMembers || 4,
      media: media || []
    });

    await squad.save();

    return {
      success: true,
      message: "Squad created successfully",
      squad
    };
  } catch (error) {
    throw error;
  }
};

/**
 * Get a squad by ID
 */
export const getSquadByIdService = async (req: any, res: Response) => {
  if (!req.user) {
    return errorResponseHandler("Authentication failed", httpStatusCode.UNAUTHORIZED, res);
  }

  const { id: userId } = req.user;
  const { squadId } = req.params;

  if (!squadId) {
    return errorResponseHandler("Squad ID is required", httpStatusCode.BAD_REQUEST, res);
  }

  try {
    const squad = await Squad.findById(squadId)
      .populate("creator", "userName photos")
      .populate("members.user", "userName photos")
      .populate("matchedSquads.squad");

    if (!squad) {
      return errorResponseHandler("Squad not found", httpStatusCode.NOT_FOUND, res);
    }

    return {
      success: true,
      squad
    };
  } catch (error) {
    throw error;
  }
};

/**
 * Update a squad
 */
export const updateSquadService = async (req: any, res: Response) => {
  if (!req.user) {
    return errorResponseHandler("Authentication failed", httpStatusCode.UNAUTHORIZED, res);
  }

  const { id: userId } = req.user;
  const { squadId } = req.params;
  const { title, about, maxMembers } = req.body;

  if (!squadId) {
    return errorResponseHandler("Squad ID is required", httpStatusCode.BAD_REQUEST, res);
  }

  try {
    // Check if user is admin of the squad
    const squad = await Squad.findOne({
      _id: squadId,
      "members.user": userId,
      "members.role": "admin"
    });

    if (!squad) {
      return errorResponseHandler(
        "You don't have permission to update this squad",
        httpStatusCode.FORBIDDEN,
        res
      );
    }

    // Validate maxMembers
    if (maxMembers && maxMembers < squad.members.length) {
      return errorResponseHandler(
        "Max members cannot be less than current member count",
        httpStatusCode.BAD_REQUEST,
        res
      );
    }

    // Update squad
    const updatedSquad = await Squad.findByIdAndUpdate(
      squadId,
      {
        $set: {
          title: title || squad.title,
          about: about || squad.about,
          maxMembers: maxMembers || squad.maxMembers
        }
      },
      { new: true }
    )
      .populate("creator", "userName photos")
      .populate("members.user", "userName photos");

    return {
      success: true,
      message: "Squad updated successfully",
      squad: updatedSquad
    };
  } catch (error) {
    throw error;
  }
};

/**
 * Delete a squad
 */
export const deleteSquadService = async (req: any, res: Response) => {
  if (!req.user) {
    return errorResponseHandler("Authentication failed", httpStatusCode.UNAUTHORIZED, res);
  }

  const { id: userId } = req.user;
  const { squadId } = req.params;

  if (!squadId) {
    return errorResponseHandler("Squad ID is required", httpStatusCode.BAD_REQUEST, res);
  }

  try {
    // Check if user is admin of the squad
    const squad = await Squad.findOne({
      _id: squadId,
      "members.user": userId,
      "members.role": "admin"
    });

    if (!squad) {
      return errorResponseHandler(
        "You don't have permission to delete this squad",
        httpStatusCode.FORBIDDEN,
        res
      );
    }

    // Set squad status to inactive instead of deleting
    await Squad.findByIdAndUpdate(squadId, {
      $set: { status: SquadStatus.INACTIVE }
    });

    return {
      success: true,
      message: "Squad deleted successfully"
    };
  } catch (error) {
    throw error;
  }
};

/**
 * Join a squad using invitation code
 */
export const joinSquadService = async (req: any, res: Response) => {
  if (!req.user) {
    return errorResponseHandler("Authentication failed", httpStatusCode.UNAUTHORIZED, res);
  }

  const { id: userId } = req.user;
  const { invitationCode } = req.body;

  if (!invitationCode) {
    return errorResponseHandler("Invitation code is required", httpStatusCode.BAD_REQUEST, res);
  }

  try {
    // Find the squad with the given invitation code
    const squad = await Squad.findOne({ 
      invitationCode,
      status: { $ne: SquadStatus.INACTIVE }
    });

    if (!squad) {
      return errorResponseHandler("Invalid invitation code", httpStatusCode.NOT_FOUND, res);
    }

    // Check if squad is full
    if (squad.members.length >= squad.maxMembers) {
      return errorResponseHandler("Squad is full", httpStatusCode.BAD_REQUEST, res);
    }

    // Check if user is already a member
    if (squad.members.some(member => member?.user?.toString() === userId)) {
      return errorResponseHandler("You are already a member of this squad", httpStatusCode.BAD_REQUEST, res);
    }

    // Add user to squad
    squad.members.push({
      user: userId,
      role: "member",
      joinedAt: new Date()
    });

    await squad.save();

    const populatedSquad = await Squad.findById(squad._id)
      .populate("creator", "userName photos")
      .populate("members.user", "userName photos");

    return {
      success: true,
      message: "Successfully joined the squad",
      squad: populatedSquad
    };
  } catch (error) {
    throw error;
  }
};

/**
 * Leave a squad
 */
export const leaveSquadService = async (req: any, res: Response) => {
  if (!req.user) {
    return errorResponseHandler("Authentication failed", httpStatusCode.UNAUTHORIZED, res);
  }

  const { id: userId } = req.user;
  const { squadId } = req.params;

  if (!squadId) {
    return errorResponseHandler("Squad ID is required", httpStatusCode.BAD_REQUEST, res);
  }

  try {
    // Find the squad
    const squad = await Squad.findById(squadId);

    if (!squad) {
      return errorResponseHandler("Squad not found", httpStatusCode.NOT_FOUND, res);
    }

    // Check if user is a member
    const memberIndex = squad.members.findIndex(
      member => member?.user?.toString() === userId
    );

    if (memberIndex === -1) {
      return errorResponseHandler("You are not a member of this squad", httpStatusCode.BAD_REQUEST, res);
    }

    // Check if user is the creator/admin
    const isCreator = squad.creator.toString() === userId;
    const isAdmin = squad.members[memberIndex].role === "admin";

    if (isCreator) {
      // If creator leaves, transfer ownership to another admin or the oldest member
      const otherAdmins = squad.members.filter(
        member => member?.user?.toString() !== userId && member.role === "admin"
      );

      if (otherAdmins.length > 0) {
        // Transfer to another admin
        if (otherAdmins[0]?.user) {
          squad.creator = otherAdmins[0].user;
        } else {
          throw new Error("No valid admin found to transfer ownership.");
        }
      } else if (squad.members.length > 1) {
        // Transfer to oldest member
        const oldestMember = [...squad.members]
          .filter(member => member?.user?.toString() !== userId)
          .sort((a, b) => a.joinedAt.getTime() - b.joinedAt.getTime())[0];

        if (oldestMember.user) {
          squad.creator = oldestMember.user;
        } else {
          throw new Error("No valid user found to transfer ownership.");
        }
        
        // Promote to admin
        const oldestMemberIndex = squad.members.findIndex(
          member => member?.user?.toString() === oldestMember?.user?.toString()
        );
        
        if (oldestMemberIndex !== -1) {
          squad.members[oldestMemberIndex].role = "admin";
        }
      } else {
        // Last member, set squad to inactive
        squad.status = SquadStatus.INACTIVE;
      }
    }

    // Remove user from members
    if (squad.status !== SquadStatus.INACTIVE) {
      squad.members.splice(memberIndex, 1);
    }

    await squad.save();

    return {
      success: true,
      message: "Successfully left the squad"
    };
  } catch (error) {
    throw error;
  }
};

/**
 * Get squad members
 */
export const getSquadMembersService = async (req: any, res: Response) => {
  if (!req.user) {
    return errorResponseHandler("Authentication failed", httpStatusCode.UNAUTHORIZED, res);
  }

  const { squadId } = req.params;

  if (!squadId) {
    return errorResponseHandler("Squad ID is required", httpStatusCode.BAD_REQUEST, res);
  }

  try {
    const squad = await Squad.findById(squadId)
      .populate("members.user", "userName photos about");

    if (!squad) {
      return errorResponseHandler("Squad not found", httpStatusCode.NOT_FOUND, res);
    }

    return {
      success: true,
      members: squad.members
    };
  } catch (error) {
    throw error;
  }
};

/**
 * Invite a member to a squad
 */
export const inviteMemberService = async (req: any, res: Response) => {
  if (!req.user) {
    return errorResponseHandler("Authentication failed", httpStatusCode.UNAUTHORIZED, res);
  }

  const { id: userId } = req.user;
  const { squadId } = req.params;
  const { targetUserId } = req.body;

  if (!squadId || !targetUserId) {
    return errorResponseHandler("Squad ID and target user ID are required", httpStatusCode.BAD_REQUEST, res);
  }

  try {
    // Check if user is a member of the squad
    const squad = await Squad.findOne({
      _id: squadId,
      "members.user": userId
    });

    if (!squad) {
      return errorResponseHandler("You are not a member of this squad", httpStatusCode.FORBIDDEN, res);
    }

    // Check if squad is full
    if (squad.members.length >= squad.maxMembers) {
      return errorResponseHandler("Squad is full", httpStatusCode.BAD_REQUEST, res);
    }

    // Check if target user exists
    const targetUser = await usersModel.findById(targetUserId);
    if (!targetUser) {
      return errorResponseHandler("Target user not found", httpStatusCode.NOT_FOUND, res);
    }

    // Check if target user is already a member
    if (squad.members.some(member => member?.user?.toString() === targetUserId)) {
      return errorResponseHandler("User is already a member of this squad", httpStatusCode.BAD_REQUEST, res);
    }

    // Add user to squad
    squad.members.push({
      user: targetUserId,
      role: "member",
      joinedAt: new Date()
    });

    await squad.save();

    // TODO: Send notification to target user

    return {
      success: true,
      message: "User invited to the squad successfully",
      invitationCode: squad.invitationCode
    };
  } catch (error) {
    throw error;
  }
};

/**
 * Remove a member from a squad
 */
export const removeMemberService = async (req: any, res: Response) => {
  if (!req.user) {
    return errorResponseHandler("Authentication failed", httpStatusCode.UNAUTHORIZED, res);
  }

  const { id: userId } = req.user;
  const { squadId, memberId } = req.params;

  if (!squadId || !memberId) {
    return errorResponseHandler("Squad ID and member ID are required", httpStatusCode.BAD_REQUEST, res);
  }

  try {
    // Check if user is admin of the squad
    const squad = await Squad.findOne({
      _id: squadId,
      "members.user": userId,
      "members.role": "admin"
    });

    if (!squad) {
      return errorResponseHandler(
        "You don't have permission to remove members from this squad",
        httpStatusCode.FORBIDDEN,
        res
      );
    }

    // Check if target user is a member
    const memberIndex = squad.members.findIndex(
      member => member?.user?.toString() === memberId
    );

    if (memberIndex === -1) {
      return errorResponseHandler("User is not a member of this squad", httpStatusCode.BAD_REQUEST, res);
    }

    // Check if trying to remove the creator
    if (squad.creator.toString() === memberId) {
      return errorResponseHandler(
        "Cannot remove the creator of the squad",
        httpStatusCode.BAD_REQUEST,
        res
      );
    }

    // Remove member
    squad.members.splice(memberIndex, 1);
    await squad.save();

    return {
      success: true,
      message: "Member removed successfully"
    };
  } catch (error) {
    throw error;
  }
};

/**
 * Get all squads (with pagination and filters)
 */
export const getSquadsService = async (req: any, res: Response) => {
  if (!req.user) {
    return errorResponseHandler("Authentication failed", httpStatusCode.UNAUTHORIZED, res);
  }

  const { page = 1, limit = 10, status } = req.query;
  const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

  try {
    const query: any = { status: { $ne: SquadStatus.INACTIVE } };
    
    if (status) {
      query.status = status;
    }

    const squads = await Squad.find(query)
      .populate("creator", "userName photos")
      .populate("members.user", "userName photos")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit as string));

    const total = await Squad.countDocuments(query);

    return {
      success: true,
      squads,
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

/**
 * Get squads for the current user
 */
export const getUserSquadsService = async (req: any, res: Response) => {
  if (!req.user) {
    return errorResponseHandler("Authentication failed", httpStatusCode.UNAUTHORIZED, res);
  }

  const { id: userId } = req.user;

  try {
    const squads = await Squad.find({
      "members.user": userId,
      status: { $ne: SquadStatus.INACTIVE }
    })
      .populate("creator", "userName photos")
      .populate("members.user", "userName photos")
      .sort({ createdAt: -1 });

    return {
      success: true,
      squads
    };
  } catch (error) {
    throw error;
  }
};

/**
 * Update squad media (add/remove photos)
 */
export const updateSquadMediaService = async (req: any, res: Response) => {
  if (!req.user) {
    return errorResponseHandler("Authentication failed", httpStatusCode.UNAUTHORIZED, res);
  }

  const { id: userId } = req.user;
  const { squadId } = req.params;
  const { media, action } = req.body;

  if (!squadId) {
    return errorResponseHandler("Squad ID is required", httpStatusCode.BAD_REQUEST, res);
  }

  if (!media || !Array.isArray(media)) {
    return errorResponseHandler("Media array is required", httpStatusCode.BAD_REQUEST, res);
  }

  try {
    // Check if user is admin of the squad
    const squad = await Squad.findOne({
      _id: squadId,
      "members.user": userId,
      "members.role": "admin"
    });

    if (!squad) {
      return errorResponseHandler(
        "You don't have permission to update this squad's media",
        httpStatusCode.FORBIDDEN,
        res
      );
    }

    let updatedSquad;

    if (action === "remove") {
      // Remove specified media
      updatedSquad = await Squad.findByIdAndUpdate(
        squadId,
        {
          $pull: { media: { $in: media } }
        },
        { new: true }
      );
    } else {
      // Add new media
      updatedSquad = await Squad.findByIdAndUpdate(
        squadId,
        {
          $addToSet: { media: { $each: media } }
        },
        { new: true }
      );
    }

    return {
      success: true,
      message: "Squad media updated successfully",
      squad: updatedSquad
    };
  } catch (error) {
    throw error;
  }
};

/**
 * Get squads by location (for discovery)
 */
export const getSquadsByLocationService = async (req: any, res: Response) => {
  // if (!req.user) {
  //   return errorResponseHandler("Authentication failed", httpStatusCode.UNAUTHORIZED, res);
  // }

  // const { longitude, latitude, maxDistance = 50000, page = 1, limit = 10 } = req.query;
  // const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

  // if (!longitude || !latitude) {
  //   return errorResponseHandler("Longitude and latitude are required", httpStatusCode.BAD_REQUEST, res);
  // }

  // try {
  //   const squads = await Squad.find({
  //     status: { $ne: SquadStatus.INACTIVE },
  //     location: {
  //       $near: {
  //         $geometry: {
  //           type: "Point",
  //           coordinates: [parseFloat(longitude as string), parseFloat(latitude as string)]
  //         },
  //         $maxDistance: parseInt(maxDistance as string)
  //       }
  //     }
  //   })
  //     .populate("creator", "userName photos")
  //     .populate("members.user", "userName photos")
  //     .skip(skip)
  //     .limit(parseInt(limit as string));

  //   return {
  //     success: true,
  //     squads
  //   };
  // } catch (error) {
  //   throw error;
  // }
};

/**
 * Like a squad (for squad matching)
 */
export const likeSquadService = async (req: any, res: Response) => {
  if (!req.user) {
    return errorResponseHandler("Authentication failed", httpStatusCode.UNAUTHORIZED, res);
  }

  const { id: userId } = req.user;
  const { squadId, targetSquadId } = req.params;

  if (!squadId || !targetSquadId) {
    return errorResponseHandler("Squad ID and target squad ID are required", httpStatusCode.BAD_REQUEST, res);
  }

  try {
    // Check if user is a member of the squad
    const userSquad = await Squad.findOne({
      _id: squadId,
      "members.user": userId,
      status: { $ne: SquadStatus.INACTIVE }
    });

    if (!userSquad) {
      return errorResponseHandler("You are not a member of this squad", httpStatusCode.FORBIDDEN, res);
    }

    // Check if target squad exists and is active
    const targetSquad = await Squad.findOne({
      _id: targetSquadId,
      status: { $ne: SquadStatus.INACTIVE }
    });

    if (!targetSquad) {
      return errorResponseHandler("Target squad not found or inactive", httpStatusCode.NOT_FOUND, res);
    }

    // Check if already matched
    const alreadyMatched = userSquad.matchedSquads.some(
      match => match?.squad?.toString() === targetSquadId
    );

    if (alreadyMatched) {
      return errorResponseHandler("Squads are already matched", httpStatusCode.BAD_REQUEST, res);
    }

    // Check if target squad has liked user's squad
    const targetHasLiked = targetSquad.matchedSquads.some(
      match => match?.squad?.toString() === squadId
    );

    // Add target squad to user squad's matches
    userSquad.matchedSquads.push({
      squad: targetSquadId,
      matchedAt: new Date()
    });

    await userSquad.save();

    // If mutual like, add user squad to target squad's matches
    if (targetHasLiked) {
      // It's a match!
      return {
        success: true,
        message: "It's a match! Both squads have liked each other.",
        isMatch: true
      };
    }

    return {
      success: true,
      message: "Squad liked successfully",
      isMatch: false
    };
  } catch (error) {
    throw error;
  }
};

/**
 * Get squad matches
 */
export const getSquadMatchesService = async (req: any, res: Response) => {
  if (!req.user) {
    return errorResponseHandler("Authentication failed", httpStatusCode.UNAUTHORIZED, res);
  }

  const { id: userId } = req.user;
  const { squadId } = req.params;

  if (!squadId) {
    return errorResponseHandler("Squad ID is required", httpStatusCode.BAD_REQUEST, res);
  }

  try {
    // Check if user is a member of the squad
    const squad = await Squad.findOne({
      _id: squadId,
      "members.user": userId,
      status: { $ne: SquadStatus.INACTIVE }
    });

    if (!squad) {
      return errorResponseHandler("You are not a member of this squad", httpStatusCode.FORBIDDEN, res);
    }

    // Get all matched squads
    const matchedSquads = await Squad.find({
      _id: { $in: squad.matchedSquads.map(match => match.squad) },
      status: { $ne: SquadStatus.INACTIVE }
    })
      .populate("creator", "userName photos")
      .populate("members.user", "userName photos");

    return {
      success: true,
      matches: matchedSquads.map(matchedSquad => {
        const matchInfo = squad.matchedSquads.find(
          match => match?.squad?.toString() === matchedSquad._id.toString()
        );
        
        return {
          squad: matchedSquad,
          matchedAt: matchInfo?.matchedAt
        };
      })
    };
  } catch (error) {
    throw error;
  }
};

/**
 * Get recommended squads for matching
 */
export const getRecommendedSquadsService = async (req: any, res: Response) => {
  if (!req.user) {
    return errorResponseHandler("Authentication failed", httpStatusCode.UNAUTHORIZED, res);
  }

  const { id: userId } = req.user;
  const { squadId } = req.params;
  const { page = 1, limit = 10 } = req.query;
  const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

  if (!squadId) {
    return errorResponseHandler("Squad ID is required", httpStatusCode.BAD_REQUEST, res);
  }

  try {
    // Check if user is a member of the squad
    const userSquad = await Squad.findOne({
      _id: squadId,
      "members.user": userId,
      status: { $ne: SquadStatus.INACTIVE }
    });

    if (!userSquad) {
      return errorResponseHandler("You are not a member of this squad", httpStatusCode.FORBIDDEN, res);
    }

    // Get IDs of squads that are already matched or the user's own squad
    const excludedSquadIds = [
      squadId,
      ...userSquad.matchedSquads.map(match => match?.squad?.toString())
    ];

    // Find squads that are not already matched and not the user's squad
    const recommendedSquads = await Squad.find({
      _id: { $nin: excludedSquadIds },
      status: { $ne: SquadStatus.INACTIVE }
    })
      .populate("creator", "userName photos")
      .populate("members.user", "userName photos")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit as string));

    const total = await Squad.countDocuments({
      _id: { $nin: excludedSquadIds },
      status: { $ne: SquadStatus.INACTIVE }
    });

    return {
      success: true,
      squads: recommendedSquads,
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

/**
 * Unmatch a squad
 */
export const unmatchSquadService = async (req: any, res: Response) => {
  if (!req.user) {
    return errorResponseHandler("Authentication failed", httpStatusCode.UNAUTHORIZED, res);
  }

  const { id: userId } = req.user;
  const { squadId, targetSquadId } = req.params;

  if (!squadId || !targetSquadId) {
    return errorResponseHandler("Squad ID and target squad ID are required", httpStatusCode.BAD_REQUEST, res);
  }

  try {
    // Check if user is an admin of the squad
    const userSquad = await Squad.findOne({
      _id: squadId,
      "members.user": userId,
      "members.role": "admin",
      status: { $ne: SquadStatus.INACTIVE }
    });

    if (!userSquad) {
      return errorResponseHandler(
        "You don't have permission to unmatch this squad",
        httpStatusCode.FORBIDDEN,
        res
      );
    }

    // Check if squads are matched
    const isMatched = userSquad.matchedSquads.some(
      match => match?.squad?.toString() === targetSquadId
    );

    if (!isMatched) {
      return errorResponseHandler(
        "Squads are not matched",
        httpStatusCode.BAD_REQUEST,
        res
      );
    }

    // Remove match from user's squad
    await Squad.updateOne(
      { _id: squadId },
      { $pull: { matchedSquads: { squad: targetSquadId } } }
    );

    // Remove match from target squad
    await Squad.updateOne(
      { _id: targetSquadId },
      { $pull: { matchedSquads: { squad: squadId } } }
    );

    return {
      success: true,
      message: "Squad unmatched successfully"
    };
  } catch (error) {
    throw error;
  }
};

/**
 * Get squad invitation code
 */
export const getSquadInvitationCodeService = async (req: any, res: Response) => {
  if (!req.user) {
    return errorResponseHandler("Authentication failed", httpStatusCode.UNAUTHORIZED, res);
  }

  const { id: userId } = req.user;
  const { squadId } = req.params;

  if (!squadId) {
    return errorResponseHandler("Squad ID is required", httpStatusCode.BAD_REQUEST, res);
  }

  try {
    // Check if user is a member of the squad
    const squad = await Squad.findOne({
      _id: squadId,
      "members.user": userId,
      status: { $ne: SquadStatus.INACTIVE }
    });

    if (!squad) {
      return errorResponseHandler(
        "You are not a member of this squad",
        httpStatusCode.FORBIDDEN,
        res
      );
    }

    return {
      success: true,
      invitationCode: squad.invitationCode
    };
  } catch (error) {
    throw error;
  }
};

/**
 * Regenerate squad invitation code
 */
export const regenerateInvitationCodeService = async (req: any, res: Response) => {
  if (!req.user) {
    return errorResponseHandler("Authentication failed", httpStatusCode.UNAUTHORIZED, res);
  }

  const { id: userId } = req.user;
  const { squadId } = req.params;

  if (!squadId) {
    return errorResponseHandler("Squad ID is required", httpStatusCode.BAD_REQUEST, res);
  }

  try {
    // Check if user is admin of the squad
    const squad = await Squad.findOne({
      _id: squadId,
      "members.user": userId,
      "members.role": "admin",
      status: { $ne: SquadStatus.INACTIVE }
    });

    if (!squad) {
      return errorResponseHandler(
        "You don't have permission to regenerate the invitation code",
        httpStatusCode.FORBIDDEN,
        res
      );
    }

    // Generate a new invitation code
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += characters.charAt(Math.floor(Math.random() * characters.length));
    }

    // Update the squad with the new code
    const updatedSquad = await Squad.findByIdAndUpdate(
      squadId,
      { $set: { invitationCode: code } },
      { new: true }
    );

    return {
      success: true,
      message: "Invitation code regenerated successfully",
      invitationCode: updatedSquad?.invitationCode
    };
  } catch (error) {
    throw error;
  }
};
