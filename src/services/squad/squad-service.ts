import { Request, Response } from "express";
import mongoose, { Types } from "mongoose";
import { Squad, SquadStatus, InterestCategory } from "src/models/squad/squad-schema";
import { httpStatusCode } from "src/lib/constant";
import { errorResponseHandler } from "src/lib/errors/error-response-handler";
import Joi from "joi";
import { usersModel } from "src/models/user/user-schema";
import { createSquadConversationService } from "../chat/squad-chat-service";
import { Readable } from "stream";
import { uploadStreamToS3Service } from "src/configF/s3";
import busboy from "busboy";
import { customAlphabet } from "nanoid";

// Validation schemas

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
    members: {
      $elemMatch: {
        user: userId,
        role: "admin"
      }
    }
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

  const { id: userId, email } = req.user;

  // Handle multipart/form-data for file uploads
  if (req.headers['content-type']?.includes('multipart/form-data')) {
    return new Promise((resolve, reject) => {
      const busboyParser = busboy({ headers: req.headers });
      let parsedData: any = { media: [], squadInterest: [], membersToAdd: [] };
      let uploadedMedia: string[] = [];
      let fileUploadPromises: Promise<void>[] = [];

      busboyParser.on('field', (fieldname: string, value: string) => {
        console.log(`Busboy - Received field: ${fieldname}=${value}`);
        
        if (['squadInterest', 'membersToAdd'].includes(fieldname)) {
          try {
            parsedData[fieldname] = JSON.parse(value);
          } catch (error) {
            console.log(`Busboy - Failed to parse ${fieldname}:`, error instanceof Error ? error.message : String(error));
            return reject({
              success: false,
              message: `Failed to parse ${fieldname}. Must be a valid JSON array`,
              code: httpStatusCode.BAD_REQUEST,
            });
          }
        } else {
          parsedData[fieldname] = value;
        }
      });

      busboyParser.on('file', (fieldname: string, fileStream: any, fileInfo: any) => {
        console.log(`Busboy - Received file: ${fieldname}`, fileInfo);
        
        if (fieldname !== 'media') {
          console.log(`Skipping file field: ${fieldname}`);
          fileStream.resume(); // Drain the stream
          return;
        }

        const { filename, mimeType } = fileInfo;
        console.log(`Processing file: ${filename}, type: ${mimeType}`);

        // Validate file type (image or video)
        const isImage = mimeType.startsWith('image/');
        const isVideo = mimeType.startsWith('video/');
        if (!isImage && !isVideo) {
          console.log(`Invalid file type: ${mimeType}`);
          fileStream.resume(); // Drain the stream
          return reject({
            success: false,
            message: 'Only image or video files are allowed for squad media',
            code: httpStatusCode.BAD_REQUEST,
          });
        }

        // Create a promise for each file upload
        const fileUploadPromise = new Promise<void>((resolveUpload, rejectUpload) => {
          // Collect file chunks
          const chunks: Buffer[] = [];
          
          fileStream.on('data', (chunk: Buffer) => {
            chunks.push(chunk);
          });

          fileStream.on('end', async () => {
            try {
              console.log(`File stream ended. Total chunks: ${chunks.length}`);
              
              if (chunks.length === 0) {
                return rejectUpload(new Error('No file data received'));
              }

              // Combine all chunks into a single buffer
              const fileBuffer = Buffer.concat(chunks);
              console.log(`File buffer size: ${fileBuffer.length} bytes`);

              // Create readable stream from buffer
              const readableStream = new Readable();
              console.log('readableStream:', readableStream);
              readableStream.push(fileBuffer);
              readableStream.push(null); // End the stream

              // Upload to S3
              const uploadedMediaUrl = await uploadStreamToS3Service(
                readableStream,
                filename,
                mimeType,
                email|| `squad_${customAlphabet('0123456789', 5)()}`
              );
              
              uploadedMedia.push(uploadedMediaUrl);
              console.log(`File uploaded successfully: ${uploadedMediaUrl}`);
              resolveUpload();
            } catch (error) {
              console.error('File processing error:', error);
              rejectUpload(error);
            }
          });

          fileStream.on('error', (error: any) => {
            console.error('File stream error:', error);
            rejectUpload(error);
          });
        });

        fileUploadPromises.push(fileUploadPromise);
      });

      busboyParser.on('finish', async () => {
        console.log('Busboy finished parsing');
        console.log('Parsed data:', parsedData);
        
        try {
          // Wait for all file uploads to complete
          if (fileUploadPromises.length > 0) {
            console.log('Waiting for file uploads to complete...');
            await Promise.all(fileUploadPromises);
          }
          
          console.log('Media uploaded:', uploadedMedia);
          
          // Validate required fields
          const { title, about, squadInterest, membersToAdd } = parsedData;
          if (!title || !about || !squadInterest) {
            return reject({
              success: false,
              message: "Title, about, and squad interests are required",
              code: httpStatusCode.BAD_REQUEST,
            });
          }

          // Set maxMembers to fixed value of 4 on the backend
          const maxMembers = 4;

          // Initialize members array with creator as admin
          const squadMembers = [{ user: userId, role: "admin", joinedAt: new Date() }];

          // Add additional members if provided
          if (membersToAdd && Array.isArray(membersToAdd)) {
            // Check if the total number of members would exceed the limit
            if (1 + membersToAdd.length > maxMembers) {
              return reject({
                success: false,
                message: `Cannot add ${membersToAdd.length} members. Max members is ${maxMembers} including the creator.`,
                code: httpStatusCode.BAD_REQUEST,
              });
            }
            
            // Check for duplicate member IDs
            const uniqueMemberIds = new Set(membersToAdd);
            if (uniqueMemberIds.size !== membersToAdd.length) {
              return reject({
                success: false,
                message: "Duplicate member IDs found",
                code: httpStatusCode.BAD_REQUEST,
              });
            }

            // Check for member exists
            for (const memberId of membersToAdd) {
              const userExists = await usersModel.findById(memberId);
              if (!userExists) {
                return reject({
                  success: false,
                  message: `User with ID ${memberId} does not exist`,
                  code: httpStatusCode.BAD_REQUEST,
                });
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

          // Create new squad with uploaded media URLs
          const squad = new Squad({
            title,
            about,
            creator: userId,
            members: squadMembers,
            maxMembers,
            media: uploadedMedia, // Array of uploaded media URLs
            squadInterest: squadInterest || [],
            status: SquadStatus.ACTIVE,
          });

          await squad.save();

          // Create squad conversation after squad is created
          await createSquadConversationService((squad as any)._id);

          // Populate the member details for the response
          const populatedSquad = await Squad.findById(squad._id)
            .populate("creator", "userName photos")
            .populate("members.user", "userName photos");

          if (!populatedSquad) {
            return reject({
              success: false,
              message: "Failed to retrieve created squad",
              code: httpStatusCode.INTERNAL_SERVER_ERROR,
            });
          }

          resolve({
            success: true,
            message: "Squad created successfully",
            squad: populatedSquad,
          });

        } catch (error) {
          console.error('Squad creation error:', error);
          reject({
            success: false,
            message: error instanceof Error ? error.message : 'Failed to create squad',
            code: httpStatusCode.INTERNAL_SERVER_ERROR,
          });
        }
      });

      busboyParser.on('error', (error: any) => {
        console.error('Busboy error:', error);
        reject({
          success: false,
          message: error.message || 'Error processing file uploads',
          code: httpStatusCode.INTERNAL_SERVER_ERROR,
        });
      });

      req.pipe(busboyParser);
    });
  } else {
    // Handle JSON request (original logic)
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

      // Check for member exists
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

    // Create new squad
    const squad = new Squad({
      title,
      about,
      creator: userId,
      members: squadMembers,
      maxMembers,
      media: media || [], // Use provided media URLs or empty array
      squadInterest: squadInterest || [],
      status: SquadStatus.ACTIVE,
    });

    await squad.save();

    // Create squad conversation after squad is created
    await createSquadConversationService((squad as any)._id);

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
  }
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
    const squad = await Squad.findOne({
      _id: squadId,
      members: {
        $elemMatch: {
          user: userId,
          role: "admin"
        }
      }
    });
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
      (squad as any).members = newMembers;
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
  
    if (!authenticateUser(req, res)) return;

    const { id: userId } = req.user;

    const { id: squadId } = req.params;

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
    const deletedSquad = await Squad.findByIdAndDelete(
      squadId
    );

    if (!deletedSquad) {
      return errorResponseHandler("Squad not found", httpStatusCode.NOT_FOUND, res);
    }

    return {
      success: true,
      message: "Squad deleted successfully",
    };
  
};

/**
 * Get all squads (with pagination and filters)
 */
export const getSquadsService = async (req: any, res: Response) => {
 
    if (!authenticateUser(req, res)) return;

  
    const { page = 1, limit = 10, status, interest } = req.query;
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

    return {
      success: true,
      message: "All Squads retrieved successfully",
      squads,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    };
 
};

/**
 * Get squads for the current user
 */
export const getUserSquadsService = async (req: any, res: Response) => {

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

    return {
      success: true,
      message: "User Squads retrieved successfully",
      squads,
    };
 
};

/**
 * Add member to squad
 */
export const addMemberService = async (req: any, res: Response) => {

    if (!authenticateUser(req, res)) return;

    const { id: userId } = req.user;
    const { id: squadId } = req.params;
    const  memberId  = req.body;

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

    // check if user exists
    console.log("memberId received:", memberId);
    
    // Extract memberId if it's an object
    const memberIdToCheck = typeof memberId === 'object' && memberId.memberId 
        ? memberId.memberId 
        : memberId;
        
    const userExists = await usersModel.findById(memberIdToCheck);
    if (!userExists) {
      return errorResponseHandler("User does not exist", httpStatusCode.BAD_REQUEST, res);
    }

    // Add member
    squad.members.push({
      user: new Types.ObjectId(memberIdToCheck),
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

    return {
      success: true,
      message: "Member added successfully",
      squad: updatedSquad,
    };
};

/**
 * Remove a member from a squad
 */
export const removeMemberService = async (req: any, res: Response) => {
 
    if (!authenticateUser(req, res)) return;

    const { id: userId } = req.user;  

    const { id : squadId } = req.params;
    const { memberId } = req.body;

    // Check if user is admin of the squad
    const squad = await isSquadAdmin(squadId, userId);
    if (!squad) {
      return errorResponseHandler(
        "You don't have permission to remove members from this squad",
        httpStatusCode.FORBIDDEN,
        res
      );
    }

    // Extract memberId if it's an object
    const memberIdToCheck = typeof memberId === 'object' && memberId.memberId 
        ? memberId.memberId 
        : memberId;
    
    console.log("Checking for member:", memberIdToCheck);
    console.log("Squad members:", squad.members.map(m => ({ 
        id: m?.user?.toString(),
        role: m.role 
    })));
    
    // Check if target user is a member
    const memberIndex = squad.members.findIndex(
        (member: any) => member.user.toString() === memberIdToCheck
    );
    
    if (memberIndex === -1) {
      return errorResponseHandler("User is not a member of this squad", httpStatusCode.BAD_REQUEST, res);
    }

    // Check if trying to remove the creator
    if (squad.creator.toString() === memberId) {
      return errorResponseHandler("Cannot remove the creator of the squad", httpStatusCode.BAD_REQUEST, res);
    }
    // check if creator trying to remove themselves
    if (userId === memberId) {
      return errorResponseHandler("Cannot remove yourself from the squad", httpStatusCode.BAD_REQUEST, res);
    }

    // Remove member
    squad.members.splice(memberIndex, 1);
    await squad.save();

    return {
      success: true,
      message: "Member removed successfully",
    };
 
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
  const { id: squadId } = req.params

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

    return {
      success: true,
      message: "You have left the squad successfully",
    };
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
  const { id: squadId } = req.params ;
  const { newOwnerId } = req.body;

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
 * Join a squad
 */
export const joinSquadService = async (req: any, res: Response) => {
  if (!authenticateUser(req, res)) return;

  const { id: userId } = req.user;
  const { id: squadId } = req.params;

  if (!squadId) {
    return errorResponseHandler("Squad ID is required", httpStatusCode.BAD_REQUEST, res);
  }

    // Find the squad
    const squad = await Squad.findById(squadId);

    if (!squad) {
      return errorResponseHandler("Squad not found", httpStatusCode.NOT_FOUND, res);
    }

    // Check if user is already a member
    if (squad.members.some((member: any) => member.user.toString() === userId)) {
      return errorResponseHandler(
        "You are already a member of this squad",
        httpStatusCode.BAD_REQUEST,
        res
      );
    }

    // Check if squad is active
    if (squad.status !== SquadStatus.ACTIVE) {
      return errorResponseHandler(
        "This squad is not accepting new members",
        httpStatusCode.BAD_REQUEST,
        res
      );
    }

    // Check if squad is full
    if (squad.members.length >= squad.maxMembers) {
      return errorResponseHandler("Squad is full", httpStatusCode.BAD_REQUEST, res);
    }

    // Add user to squad members
    squad.members.push({
      user: new mongoose.Types.ObjectId(userId),
      role: "member",
      joinedAt: new Date()
    });

    // If squad is now full, update status
    if (squad.members.length >= squad.maxMembers) {
      squad.status = SquadStatus.FULL;
    }

    await squad.save();

    const updatedSquad = await Squad.findById(squadId)
      .populate("creator", "userName photos")
      .populate("members.user", "userName photos");

    return {
      success: true,
      message: "You have joined the squad successfully",
      squad: updatedSquad
    };
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
      status: { $or: [SquadStatus.ACTIVE, SquadStatus.FULL]}
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


