import { Request, Response } from "express";
import mongoose, { Types } from "mongoose";
import { Squad, SquadStatus, InterestCategory } from "src/models/squad/squad-schema";
import { httpStatusCode } from "src/lib/constant";
import { errorResponseHandler } from "src/lib/errors/error-response-handler";
import Joi from "joi";
import { usersModel } from "src/models/user/user-schema";

// Validation schemas
// const createSquadSchema = Joi.object({
//   title: Joi.string().trim().min(3).max(100).required()
//     .messages({
//       'string.base': 'Title must be a string',
//       'string.empty': 'Title is required',
//       'string.min': 'Title must be at least 3 characters long',
//       'string.max': 'Title cannot exceed 100 characters',
//       'any.required': 'Title is required'
//     }),
//   about: Joi.string().trim().max(500).required()
//     .messages({
//       'string.base': 'About must be a string',
//       'string.empty': 'About is required',
//       'string.max': 'About cannot exceed 500 characters',
//       'any.required': 'About is required'
//     }),
//   // Change the media validation to accept strings
//   media: Joi.array().items(
//     Joi.string().uri()
//   ).default([]),
//   squadInterest: Joi.array().items(
//     Joi.string().valid(...Object.values(InterestCategory))
//   ).min(1).required()
//     .messages({
//       'array.base': 'Squad interests must be an array',
//       'array.min': 'At least one interest must be selected',
//       'any.required': 'Squad interests are required',
//       'any.only': 'Invalid interest category'
//     }),
//   membersToAdd: Joi.array().items(
//     Joi.string().pattern(/^[0-9a-fA-F]{24}$/).message('Invalid user ID format')
//   ).default([])
// });

// const updateSquadSchema = Joi.object({
//   title: Joi.string().trim().min(3).max(100)
//     .messages({
//       'string.base': 'Title must be a string',
//       'string.min': 'Title must be at least 3 characters long',
//       'string.max': 'Title cannot exceed 100 characters'
//     }),
//   about: Joi.string().trim().max(500)
//     .messages({
//       'string.base': 'About must be a string',
//       'string.max': 'About cannot exceed 500 characters'
//     }),
//   // Changed to accept strings instead of objects
//   media: Joi.array().items(
//     Joi.string().uri()
//   ),
//   squadInterest: Joi.array().items(
//     Joi.string().valid(...Object.values(InterestCategory))
//   ).min(1)
//     .messages({
//       'array.base': 'Squad interests must be an array',
//       'array.min': 'At least one interest must be selected',
//       'any.only': 'Invalid interest category'
//     })
// });

const memberIdSchema = Joi.object({
  memberId: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).required()
    .messages({
      'string.base': 'Member ID must be a string',
      'string.empty': 'Member ID is required',
      'string.pattern.base': 'Invalid member ID format',
      'any.required': 'Member ID is required'
    })
});

const squadIdSchema = Joi.object({
  squadId: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).required()
    .messages({
      'string.base': 'Squad ID must be a string',
      'string.empty': 'Squad ID is required',
      'string.pattern.base': 'Invalid squad ID format',
      'any.required': 'Squad ID is required'
    })
});

const targetSquadSchema = Joi.object({
  targetSquadId: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).required()
    .messages({
      'string.base': 'Target Squad ID must be a string',
      'string.empty': 'Target Squad ID is required',
      'string.pattern.base': 'Invalid target squad ID format',
      'any.required': 'Target Squad ID is required'
    })
});

const roleSchema = Joi.object({
  role: Joi.string().valid('admin', 'member').required()
    .messages({
      'string.base': 'Role must be a string',
      'string.empty': 'Role is required',
      'any.only': 'Role must be either "admin" or "member"',
      'any.required': 'Role is required'
    })
});

const newOwnerSchema = Joi.object({
  newOwnerId: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).required()
    .messages({
      'string.base': 'New owner ID must be a string',
      'string.empty': 'New owner ID is required',
      'string.pattern.base': 'Invalid new owner ID format',
      'any.required': 'New owner ID is required'
    })
});

const squadInterestSchema = Joi.object({
  squadInterest: Joi.array().items(
    Joi.string().valid(...Object.values(InterestCategory))
  ).min(1).required()
    .messages({
      'array.base': 'Squad interests must be an array',
      'array.min': 'At least one interest must be selected',
      'any.required': 'Squad interests are required',
      'any.only': 'Invalid interest category'
    })
});

const paginationSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(10),
  status: Joi.string().valid(...Object.values(SquadStatus)).optional(),
  interest: Joi.string().valid(...Object.values(InterestCategory)).optional()
});

// Helper function to validate request data
const validateRequest = (schema: Joi.ObjectSchema, data: any): { error?: string; value: any } => {
  const { error, value } = schema.validate(data, { abortEarly: false });
  
  if (error) {
    const errorMessage = error.details
      .map((detail : any) => detail.message)
      .join(', ');
    return { error: errorMessage, value: data };
  }
  
  return { value };
};

// Helper function to authenticate user
const authenticateUser = (req: any, res: Response): boolean => {
  if (!req.user) {
    errorResponseHandler("Authentication failed", httpStatusCode.UNAUTHORIZED, res);
    return false;
  }
  return true;
};

// Helper function to check if user is admin of squad
const isSquadAdmin = async (squadId: string, userId: string) => {
  return await Squad.findOne({
    _id: squadId,
    "members.user": userId,
    "members.role": "admin",
  });
};

// Helper function to check if user is member of squad
const isSquadMember = async (squadId: string, userId: string) => {
  return await Squad.findOne({
    _id: squadId,
    "members.user": userId,
  });
};

/**
 * Create a new squad
 */
export const createSquadService = async (req: any, res: Response) => {
  
  if (!authenticateUser(req, res)) return;

  const { id: userId } = req.user;

  
  const { title, about, media, squadInterest, membersToAdd } = req.body;
  if (!title || !about || !squadInterest) {
    return errorResponseHandler(
      "Title, about, and squad interests are required",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }
  
  
  // Set maxMembers to fixed value of 4 on the backend
  const maxMembers = 4;

  // Initialize members array with creator as admin
  const squadMembers = [{ user: userId, role: "admin", joinedAt: new Date() }];

  
  // Add additional members if provided
  if (membersToAdd && Array.isArray(membersToAdd)) {
    // Check if the total number of members would exceed the limit
    if (1 + membersToAdd.length > maxMembers) {
      return errorResponseHandler(
        `Cannot add ${membersToAdd.length} members. Max members is ${maxMembers} including the creator.`,
        httpStatusCode.BAD_REQUEST,
        res
      );
    }
    
    // Check for duplicate member IDs
    const uniqueMemberIds = new Set(membersToAdd);
    if (uniqueMemberIds.size !== membersToAdd.length) {
      return errorResponseHandler(
        "Duplicate member IDs found",
        httpStatusCode.BAD_REQUEST,
        res
      );
    }
    // check for member exists
    for (const memberId of membersToAdd) {
      const userExists = await usersModel.findById(memberId);
      if (!userExists) {
        return errorResponseHandler(
          `User with ID ${memberId} does not exist`,
          httpStatusCode.BAD_REQUEST,
          res
        );
      }
    }

    // Add each provided member ID (excluding the creator if they're in the list)
    for (const memberId of membersToAdd) {
      // Skip if it's the creator (already added)
      if (memberId === userId) continue;
      
      // Add as a regular member
      squadMembers.push({
        user: new mongoose.Types.ObjectId(memberId),
        role: "member",
        joinedAt: new Date()
      });
    }
  }

  // Create new squad - use formattedMedia instead of media
  const squad = new Squad({
    title,
    about,
    creator: userId,
    members: squadMembers,
    maxMembers,
    media: media || [], // Use the converted media objects
    squadInterest: squadInterest || [],
    status: SquadStatus.ACTIVE,
  });

  await squad.save();

  // Populate the member details for the response
  const populatedSquad = await Squad.findById(squad._id)
    .populate("creator", "userName photos")
    .populate("members.user", "userName photos");

  if (!populatedSquad) {
    return errorResponseHandler(
      "Failed to retrieve created squad",
      httpStatusCode.INTERNAL_SERVER_ERROR,
      res
    );
  }

  return {
    success: true,
    message: "Squad created successfully",
    squad: populatedSquad,
  };

};

/**
 * Get a squad by ID
 */
export const getSquadByIdService = async (req: any, res: Response) => {
    if (!authenticateUser(req, res)) return;

    const squadId  = req.params.id;

    const squad = await Squad.findById(squadId)
      .populate("creator")
      .populate("members.user")
      .populate("matchedSquads.squad");

    if (!squad) {
      return errorResponseHandler("Squad not found", httpStatusCode.NOT_FOUND, res);
    }

     return {
      success: true,
      message: "Squad retrieved successfully",
      squad,
    };
};

export const updateSquadService = async (req: any, res: Response) => {
    if (!authenticateUser(req, res)) return;

    const { id: userId } = req.user;
   
    const squadId = req.params.id;
    const updateData = {...req.body};
    const { membersToAdd } = req.body;
    
    // Remove membersToAdd from updateData since we'll handle it separately
    delete updateData.membersToAdd;

    // Check if at least one field is being updated
    if (Object.keys(updateData).length === 0 && !membersToAdd) {
      return errorResponseHandler(
        "At least one field must be provided for update",
        httpStatusCode.BAD_REQUEST,
        res
      );
    }

    // Check if user is admin of the squad
    const squad = await isSquadAdmin(squadId, userId);
    if (!squad) {
      return errorResponseHandler(
        "You don't have permission to update this squad",
        httpStatusCode.FORBIDDEN,
        res
      );
    }

    // Handle replacing members if provided
    if (membersToAdd && Array.isArray(membersToAdd)) {
      // Check if the total number of members would exceed the limit
      // +1 for the creator who must remain in the squad
      if (membersToAdd.length + 1 > squad.maxMembers) {
        return errorResponseHandler(
          `Cannot have ${membersToAdd.length + 1} members. Max members is ${squad.maxMembers}.`,
          httpStatusCode.BAD_REQUEST,
          res
        );
      }
      
      // Check for duplicate member IDs
      const uniqueMemberIds = new Set(membersToAdd);
      if (uniqueMemberIds.size !== membersToAdd.length) {
        return errorResponseHandler(
          "Duplicate member IDs found",
          httpStatusCode.BAD_REQUEST,
          res
        );
      }

      // Check if members exist
      for (const memberId of membersToAdd) {
        const userExists = await usersModel.findById(memberId);
        if (!userExists) {
          return errorResponseHandler(
            `User with ID ${memberId} does not exist`,
            httpStatusCode.BAD_REQUEST,
            res
          );
        }
      }

      // Get the creator's member object to preserve
      const creatorMember = squad.members.find((member: any) => 
        member.user.toString() === squad.creator.toString()
      );
      
      if (!creatorMember) {
        return errorResponseHandler(
          "Creator not found in squad members",
          httpStatusCode.INTERNAL_SERVER_ERROR,
          res
        );
      }

      // Create new members array with creator and new members
      const newMembers = [creatorMember];
      
      // Add each provided member ID (excluding the creator if they're in the list)
      for (const memberId of membersToAdd) {
        // Skip if it's the creator (already added)
        if (memberId === squad.creator.toString()) continue;
        
        // Add as a regular member
        newMembers.push(squad.members.create({
          user: new mongoose.Types.ObjectId(memberId),
          role: "member",
          joinedAt: new Date()
        }));
      }
      
      // Replace the members array
      squad.members = newMembers;
      await squad.save();
    }

    // Update other squad fields
    const updatedSquad = await Squad.findByIdAndUpdate(
      squadId,
      { $set: updateData },
      { new: true, runValidators: true }
    )
      .populate("creator", "userName photos")
      .populate("members.user", "userName photos")
      .populate("matchedSquads.squad");

    if (!updatedSquad) {
      return errorResponseHandler("Squad not found", httpStatusCode.NOT_FOUND, res);
    }

    return {
      success: true,
      message: "Squad updated successfully",
      squad: updatedSquad
    };
};

/**
 * Delete a squad (set to inactive)
 */
export const deleteSquadService = async (req: any, res: Response) => {
  try {
    if (!authenticateUser(req, res)) return;

    const { id: userId } = req.user;
    
    // Validate params
    const { error, value } = validateRequest(squadIdSchema, req.params);
    if (error) {
      return errorResponseHandler(error, httpStatusCode.BAD_REQUEST, res);
    }

    const { squadId } = value;

    // Check if user is admin of the squad
    const squad = await isSquadAdmin(squadId, userId);
    if (!squad) {
      return errorResponseHandler(
        "You don't have permission to delete this squad",
        httpStatusCode.FORBIDDEN,
        res
      );
    }

    // Set squad status to inactive
    const deletedSquad = await Squad.findByIdAndUpdate(
      squadId,
      { $set: { status: SquadStatus.INACTIVE } },
      { new: true }
    );

    if (!deletedSquad) {
      return errorResponseHandler("Squad not found", httpStatusCode.NOT_FOUND, res);
    }

    res.status(httpStatusCode.OK).json({
      success: true,
      message: "Squad deleted successfully",
    });
  } catch (error) {
    console.error("Delete squad error:", error);
    return errorResponseHandler("Failed to delete squad", httpStatusCode.INTERNAL_SERVER_ERROR, res);
  }
};

/**
 * Get all squads (with pagination and filters)
 */
export const getSquadsService = async (req: any, res: Response) => {
  try {
    if (!authenticateUser(req, res)) return;

    // Validate query params
    const { error, value } = validateRequest(paginationSchema, req.query);
    if (error) {
      return errorResponseHandler(error, httpStatusCode.BAD_REQUEST, res);
    }

    const { page = 1, limit = 10, status, interest } = value;
    const skip = (page - 1) * limit;

    const query: any = {
      status: { $ne: SquadStatus.INACTIVE },
    };

    if (status) {
      query.status = status;
    }

    if (interest) {
      query.squadInterest = { $in: [interest] };
    }

    const squads = await Squad.find(query)
      .populate("creator", "userName photos")
      .populate("members.user", "userName photos")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Squad.countDocuments(query);

    res.status(httpStatusCode.OK).json({
      success: true,
      squads,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Get squads error:", error);
    return errorResponseHandler("Failed to fetch squads", httpStatusCode.INTERNAL_SERVER_ERROR, res);
  }
};

/**
 * Get squads for the current user
 */
export const getUserSquadsService = async (req: any, res: Response) => {
  try {
    if (!authenticateUser(req, res)) return;

    const { id: userId } = req.user;

    const squads = await Squad.find({
      "members.user": userId,
      status: { $ne: SquadStatus.INACTIVE },
    })
      .populate("creator", "userName photos")
      .populate("members.user", "userName photos")
      .populate("matchedSquads.squad")
      .sort({ createdAt: -1 });

    res.status(httpStatusCode.OK).json({
      success: true,
      squads,
    });
  } catch (error) {
    console.error("Get user squads error:", error);
    return errorResponseHandler("Failed to fetch user squads", httpStatusCode.INTERNAL_SERVER_ERROR, res);
  }
};

/**
 * Add member to squad
 */
export const addMemberService = async (req: any, res: Response) => {
  try {
    if (!authenticateUser(req, res)) return;

    const { id: userId } = req.user;
    
    // Validate params
    const paramsResult = validateRequest(squadIdSchema, req.params);
    if (paramsResult.error) {
      return errorResponseHandler(paramsResult.error, httpStatusCode.BAD_REQUEST, res);
    }

    // Validate body
    const bodyResult = validateRequest(memberIdSchema, req.body);
    if (bodyResult.error) {
      return errorResponseHandler(bodyResult.error, httpStatusCode.BAD_REQUEST, res);
    }

    const { squadId } = paramsResult.value;
    const { memberId } = bodyResult.value;

    // Check if user is admin of the squad
    const squad = await isSquadAdmin(squadId, userId);
    if (!squad) {
      return errorResponseHandler(
        "You don't have permission to add members to this squad",
        httpStatusCode.FORBIDDEN,
        res
      );
    }

    // Check if squad is full
    if (squad.members.length >= squad.maxMembers) {
      return errorResponseHandler("Squad is full", httpStatusCode.BAD_REQUEST, res);
    }

    // Check if user is already a member
    if (squad.members.some((member : any) => member?.user?.toString() === memberId)) {
      return errorResponseHandler("User is already a member of this squad", httpStatusCode.BAD_REQUEST, res);
    }

    // Check if user is trying to add themselves
    if (memberId === userId) {
      return errorResponseHandler("You cannot add yourself as a member", httpStatusCode.BAD_REQUEST, res);
    }

    // Add member
    squad.members.push({
      user: new Types.ObjectId(memberId),
      role: "member",
      joinedAt: new Date(),
    });

    await squad.save();

    const updatedSquad = await Squad.findById(squadId)
      .populate("creator", "userName photos")
      .populate("members.user", "userName photos");

    if (!updatedSquad) {
      return errorResponseHandler("Failed to retrieve updated squad", httpStatusCode.INTERNAL_SERVER_ERROR, res);
    }

    res.status(httpStatusCode.OK).json({
      success: true,
      message: "Member added successfully",
      squad: updatedSquad,
    });
  } catch (error) {
    console.error("Add member error:", error);
    return errorResponseHandler("Failed to add member", httpStatusCode.INTERNAL_SERVER_ERROR, res);
  }
};

/**
 * Remove a member from a squad
 */
export const removeMemberService = async (req: any, res: Response) => {
  try {
    if (!authenticateUser(req, res)) return;

    const { id: userId } = req.user;
    
    // Validate squadId and memberId
    const { error, value } = validateRequest(
      Joi.object({
        squadId: squadIdSchema.extract('squadId'),
        memberId: memberIdSchema.extract('memberId')
      }),
      req.params
    );
    
    if (error) {
      return errorResponseHandler(error, httpStatusCode.BAD_REQUEST, res);
    }

    const { squadId, memberId } = value;

    // Check if user is admin of the squad
    const squad = await isSquadAdmin(squadId, userId);
    if (!squad) {
      return errorResponseHandler(
        "You don't have permission to remove members from this squad",
        httpStatusCode.FORBIDDEN,
        res
      );
    }

    // Check if target user is a member
    const memberIndex = squad.members.findIndex((member : any) => member?.user?.toString() === memberId);
    if (memberIndex === -1) {
      return errorResponseHandler("User is not a member of this squad", httpStatusCode.BAD_REQUEST, res);
    }

    // Check if trying to remove the creator
    if (squad.creator.toString() === memberId) {
      return errorResponseHandler("Cannot remove the creator of the squad", httpStatusCode.BAD_REQUEST, res);
    }

    // Remove member
    squad.members.splice(memberIndex, 1);
    await squad.save();

    res.status(httpStatusCode.OK).json({
      success: true,
      message: "Member removed successfully",
    });
  } catch (error) {
    console.error("Remove member error:", error);
    return errorResponseHandler("Failed to remove member", httpStatusCode.INTERNAL_SERVER_ERROR, res);
  }
};

/**
 * Match with another squad
 */
export const matchSquadService = async (req: any, res: Response) => {
  try {
    if (!authenticateUser(req, res)) return;

    const { id: userId } = req.user;
    
    // Validate params
    const paramsResult = validateRequest(squadIdSchema, req.params);
    if (paramsResult.error) {
      return errorResponseHandler(paramsResult.error, httpStatusCode.BAD_REQUEST, res);
    }

    // Validate body
    const bodyResult = validateRequest(targetSquadSchema, req.body);
    if (bodyResult.error) {
      return errorResponseHandler(bodyResult.error, httpStatusCode.BAD_REQUEST, res);
    }

    const { squadId } = paramsResult.value;
    const { targetSquadId } = bodyResult.value;

    // Validate squadId and targetSquadId are different
    if (squadId === targetSquadId) {
      return errorResponseHandler(
        "Squad cannot match with itself",
        httpStatusCode.BAD_REQUEST,
        res
      );
    }

    // Check if user is admin of the squad
    const sourceSquad = await isSquadAdmin(squadId, userId);
    if (!sourceSquad) {
      return errorResponseHandler(
        "You don't have permission to match this squad",
        httpStatusCode.FORBIDDEN,
        res
      );
    }

    // Check if target squad exists and is active
    const targetSquad = await Squad.findOne({ 
      _id: targetSquadId,
      status: SquadStatus.ACTIVE
    });
    
    if (!targetSquad) {
      return errorResponseHandler("Target squad not found or inactive", httpStatusCode.NOT_FOUND, res);
    }

    // Check if already matched
    const alreadyMatched = sourceSquad.matchedSquads.some(
      (match : any) => match?.squad?.toString() === targetSquadId
    );
    
    if (alreadyMatched) {
      return errorResponseHandler("Squads are already matched", httpStatusCode.BAD_REQUEST, res);
    }

    // Add match to source squad
    sourceSquad.matchedSquads.push({
      squad: new Types.ObjectId(targetSquadId),
      matchedAt: new Date(),
    });
    await sourceSquad.save();

    // Add match to target squad (mutual matching)
    if (!targetSquad.matchedSquads.some((match) => match?.squad?.toString() === squadId)) {
      targetSquad.matchedSquads.push({
        squad: new Types.ObjectId(squadId),
        matchedAt: new Date(),
      });
      await targetSquad.save();
    }

    res.status(httpStatusCode.OK).json({
      success: true,
      message: "Squads matched successfully",
    });
  } catch (error) {
    console.error("Match squad error:", error);
    return errorResponseHandler("Failed to match squads", httpStatusCode.INTERNAL_SERVER_ERROR, res);
  }
};

/**
 * Unmatch from another squad
 */
export const unmatchSquadService = async (req: any, res: Response) => {
  try {
    if (!authenticateUser(req, res)) return;

    const { id: userId } = req.user;
    
    // Validate squadId and targetSquadId
    const { error, value } = validateRequest(
      Joi.object({
        squadId: squadIdSchema.extract('squadId'),
        targetSquadId: targetSquadSchema.extract('targetSquadId')
      }),
      req.params
    );
    
    if (error) {
      return errorResponseHandler(error, httpStatusCode.BAD_REQUEST, res);
    }

    const { squadId, targetSquadId } = value;

    // Check if user is admin of the squad
    const sourceSquad = await isSquadAdmin(squadId, userId);
    if (!sourceSquad) {
      return errorResponseHandler(
        "You don't have permission to unmatch this squad",
        httpStatusCode.FORBIDDEN,
        res
      );
    }

    // Remove match from source squad
    const matchIndex = sourceSquad.matchedSquads.findIndex(
      (match : any) => match?.squad?.toString() === targetSquadId
    );

    if (matchIndex === -1) {
      return errorResponseHandler("Squads are not matched", httpStatusCode.BAD_REQUEST, res);
    }

    sourceSquad.matchedSquads.splice(matchIndex, 1);
    await sourceSquad.save();

    // Remove match from target squad (mutual unmatching)
    const targetSquad = await Squad.findById(targetSquadId);
    if (targetSquad) {
      const targetMatchIndex = targetSquad.matchedSquads.findIndex(
        (match) => match?.squad?.toString() === squadId
      );
      if (targetMatchIndex !== -1) {
        targetSquad.matchedSquads.splice(targetMatchIndex, 1);
        await targetSquad.save();
      }
    }

    res.status(httpStatusCode.OK).json({
      success: true,
      message: "Squads unmatched successfully",
    });
  } catch (error) {
    console.error("Unmatch squad error:", error);
    return errorResponseHandler("Failed to unmatch squads", httpStatusCode.INTERNAL_SERVER_ERROR, res);
  }
};

/**
 * Get matched squads
 */
export const getMatchedSquadsService = async (req: any, res: Response) => {
  try {
    if (!authenticateUser(req, res)) return;

    const { id: userId } = req.user;
    
    // Validate params
    const { error, value } = validateRequest(squadIdSchema, req.params);
    if (error) {
      return errorResponseHandler(error, httpStatusCode.BAD_REQUEST, res);
    }

    const { squadId } = value;

    // Check if user is a member of the squad
    const squad = await isSquadMember(squadId, userId);
    if (!squad) {
      return errorResponseHandler(
        "You don't have permission to view this squad's matches",
        httpStatusCode.FORBIDDEN,
        res
      );
    }

    // Get matched squads with details
    const populatedSquad = await Squad.findById(squadId).populate({
      path: "matchedSquads.squad",
      populate: {
        path: "members.user",
        select: "userName photos",
      },
    });

    if (!populatedSquad) {
      return errorResponseHandler("Squad not found", httpStatusCode.NOT_FOUND, res);
    }

    res.status(httpStatusCode.OK).json({
      success: true,
      matches: populatedSquad.matchedSquads,
    });
  } catch (error) {
    console.error("Get matched squads error:", error);
    return errorResponseHandler("Failed to fetch matched squads", httpStatusCode.INTERNAL_SERVER_ERROR, res);
  }
};

/**
 * Find potential squad matches by interests
 */
export const findPotentialMatchesService = async (req: any, res: Response) => {
  if (!req.user) {
    return errorResponseHandler("Authentication failed", httpStatusCode.UNAUTHORIZED, res);
  }

  const { id: userId } = req.user;
  const { squadId } = req.params as { squadId: string };
  const { page = "1", limit = "10" } = req.query as { page?: string; limit?: string };
  const skip = (parseInt(page) - 1) * parseInt(limit);

  if (!squadId) {
    return errorResponseHandler("Squad ID is required", httpStatusCode.BAD_REQUEST, res);
  }

  try {
    // Check if user is a member of the squad
    const squad = await Squad.findOne({
      _id: squadId,
      "members.user": userId,
    });

    if (!squad) {
      return errorResponseHandler(
        "You don't have permission to find matches for this squad",
        httpStatusCode.FORBIDDEN,
        res
      );
    }

    // Get already matched squad IDs to exclude them
    const matchedSquadIds = squad.matchedSquads.map((match) => match.squad);

    // Find squads with similar interests
    const query = {
      _id: { $ne: squadId, $nin: matchedSquadIds },
      status: SquadStatus.ACTIVE,
      squadInterest: { $in: squad.squadInterest },
    };

    const potentialMatches = await Squad.find(query)
      .populate("creator", "userName photos")
      .populate("members.user", "userName photos")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Squad.countDocuments(query);

    res.status(httpStatusCode.OK).json({
      success: true,
      potentialMatches,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    return errorResponseHandler("Failed to find potential matches", httpStatusCode.INTERNAL_SERVER_ERROR, res);
  }
};

/**
 * Change member role (promote to admin or demote to member)
 */
export const changeMemberRoleService = async (req: any, res: Response) => {
  if (!req.user) {
    return errorResponseHandler("Authentication failed", httpStatusCode.UNAUTHORIZED, res);
  }

  const { id: userId } = req.user;
  const { squadId, memberId } = req.params as { squadId: string; memberId: string };
  const { role } = req.body as { role: "admin" | "member" };

  if (!squadId || !memberId || !role) {
    return errorResponseHandler("Squad ID, member ID, and role are required", httpStatusCode.BAD_REQUEST, res);
  }

  if (!["admin", "member"].includes(role)) {
    return errorResponseHandler("Role must be either 'admin' or 'member'", httpStatusCode.BAD_REQUEST, res);
  }

  try {
    // Check if user is admin of the squad
    const squad = await Squad.findOne({
      _id: squadId,
      "members.user": userId,
      "members.role": "admin",
    });

    if (!squad) {
      return errorResponseHandler(
        "You don't have permission to change member roles in this squad",
        httpStatusCode.FORBIDDEN,
        res
      );
    }

    // Check if target user is a member
    const memberIndex = squad.members.findIndex((member) => member?.user?.toString() === memberId);

    if (memberIndex === -1) {
      return errorResponseHandler("User is not a member of this squad", httpStatusCode.BAD_REQUEST, res);
    }

    // Check if trying to demote the creator
    if (squad.creator.toString() === memberId && role === "member") {
      return errorResponseHandler("Cannot demote the creator of the squad", httpStatusCode.BAD_REQUEST, res);
    }

    // Update member role
    squad.members[memberIndex].role = role;
    await squad.save();

    const updatedSquad = await Squad.findById(squadId)
      .populate("creator", "userName photos")
      .populate("members.user", "userName photos");

    res.status(httpStatusCode.OK).json({
      success: true,
      message: `Member role updated to ${role} successfully`,
      squad: updatedSquad,
    });
  } catch (error) {
    return errorResponseHandler("Failed to change member role", httpStatusCode.INTERNAL_SERVER_ERROR, res);
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
  const { squadId } = req.params as { squadId: string };

  if (!squadId) {
    return errorResponseHandler("Squad ID is required", httpStatusCode.BAD_REQUEST, res);
  }

  try {
    const squad = await Squad.findById(squadId);

    if (!squad) {
      return errorResponseHandler("Squad not found", httpStatusCode.NOT_FOUND, res);
    }

    // Check if user is a member
    const memberIndex = squad.members.findIndex((member) => member?.user?.toString() === userId);

    if (memberIndex === -1) {
      return errorResponseHandler("You are not a member of this squad", httpStatusCode.BAD_REQUEST, res);
    }

    // Check if user is the creator
    if (squad.creator.toString() === userId) {
      return errorResponseHandler(
        "As the creator, you cannot leave the squad. You must delete it or transfer ownership first.",
        httpStatusCode.BAD_REQUEST,
        res
      );
    }

    // Remove user from members
    squad.members.splice(memberIndex, 1);
    await squad.save();

    res.status(httpStatusCode.OK).json({
      success: true,
      message: "You have left the squad successfully",
    });
  } catch (error) {
    return errorResponseHandler("Failed to leave squad", httpStatusCode.INTERNAL_SERVER_ERROR, res);
  }
};

/**
 * Transfer squad ownership to another member
 */
export const transferOwnershipService = async (req: any, res: Response) => {
  if (!req.user) {
    return errorResponseHandler("Authentication failed", httpStatusCode.UNAUTHORIZED, res);
  }

  const { id: userId } = req.user;
  const { squadId } = req.params as { squadId: string };
  const { newOwnerId } = req.body as { newOwnerId: string };

  if (!squadId || !newOwnerId) {
    return errorResponseHandler("Squad ID and new owner ID are required", httpStatusCode.BAD_REQUEST, res);
  }

  try {
    // Check if user is creator of the squad
    const squad = await Squad.findOne({
      _id: squadId,
      creator: userId,
    });

    if (!squad) {
      return errorResponseHandler(
        "You don't have permission to transfer ownership of this squad",
        httpStatusCode.FORBIDDEN,
        res
      );
    }

    // Check if new owner is a member
    const newOwnerIndex = squad.members.findIndex((member) => member?.user?.toString() === newOwnerId);

    if (newOwnerIndex === -1) {
      return errorResponseHandler("New owner is not a member of this squad", httpStatusCode.BAD_REQUEST, res);
    }

    // Update creator and member roles
    squad.creator = new Types.ObjectId(newOwnerId);

    // Find current owner in members and set role to member
    const currentOwnerIndex = squad.members.findIndex((member) => member?.user?.toString() === userId);
    if (currentOwnerIndex !== -1) {
      squad.members[currentOwnerIndex].role = "member";
    }

    // Set new owner's role to admin
    squad.members[newOwnerIndex].role = "admin";

    await squad.save();

    const updatedSquad = await Squad.findById(squadId)
      .populate("creator", "userName photos")
      .populate("members.user", "userName photos");

    res.status(httpStatusCode.OK).json({
      success: true,
      message: "Squad ownership transferred successfully",
      squad: updatedSquad,
    });
  } catch (error) {
    return errorResponseHandler("Failed to transfer ownership", httpStatusCode.INTERNAL_SERVER_ERROR, res);
  }
};

/**
 * Update squad interests
 */
export const updateSquadInterestsService = async (req: any, res: Response) => {
  if (!req.user) {
    return errorResponseHandler("Authentication failed", httpStatusCode.UNAUTHORIZED, res);
  }

  const { id: userId } = req.user;
  const { squadId } = req.params as { squadId: string };
  const { squadInterest } = req.body as { squadInterest: string[] };

  if (!squadId || !squadInterest || !Array.isArray(squadInterest)) {
    return errorResponseHandler(
      "Squad ID and squad interests array are required",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

  try {
    // Check if user is admin of the squad
    const squad = await Squad.findOne({
      _id: squadId,
      "members.user": userId,
      "members.role": "admin",
    });

    if (!squad) {
      return errorResponseHandler(
        "You don't have permission to update this squad's interests",
        httpStatusCode.FORBIDDEN,
        res
      );
    }

    // Validate interests
    const validInterests = Object.values(InterestCategory);
    const invalidInterests = squadInterest.filter((interest) => !validInterests.includes(interest as InterestCategory));
    if (invalidInterests.length > 0) {
      return errorResponseHandler(
        `Invalid interests: ${invalidInterests.join(", ")}`,
        httpStatusCode.BAD_REQUEST,
        res
      );
    }

    // Update squad interests
    const updatedSquad = await Squad.findByIdAndUpdate(
      squadId,
      { $set: { squadInterest } },
      { new: true }
    )
      .populate("creator", "userName photos")
      .populate("members.user", "userName photos");

    res.status(httpStatusCode.OK).json({
      success: true,
      message: "Squad interests updated successfully",
      squad: updatedSquad,
    });
  } catch (error) {
    return errorResponseHandler("Failed to update squad interests", httpStatusCode.INTERNAL_SERVER_ERROR, res);
  }
};

