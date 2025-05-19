import { Request, Response } from "express";
import { Community, CommunityStatus, CommunityType } from "../../models/community/community-schema";
import { CommunityConversation } from "../../models/chat/community-conversation-schema";
import { httpStatusCode } from "../../lib/constant";
import { errorResponseHandler } from "../../lib/errors/error-response-handler";
import mongoose from "mongoose";
import { createCommunityConversationService } from "../chat/community-chat-service";

// Create a new community
export const createCommunityService = async (req: any, res: Response) => {
  const userId = req.user.id;
  const { name, description, type = CommunityType.PUBLIC, media } = req.body;

  if (!name) {
    return errorResponseHandler(
      "Community name is required",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

  try {
    // Create initial members array with creator as admin
    const communityMembers = [
      {
        user: userId,
        role: "admin",
        joinedAt: new Date()
      }
    ];

    // Create new community
    const community = new Community({
      name,
      description,
      creator: userId,
      admins: [userId],
      members: communityMembers,
      media: media || [],
      type,
      status: CommunityStatus.ACTIVE,
    });

    await community.save();

    // Create community conversation using the dedicated service
    if (!community._id) {
      throw new Error("Community not created");
    }
    const communityConversation = await createCommunityConversationService(community._id.toString());

    // Populate the member details for the response
    const populatedCommunity = await Community.findById(community._id)
      .populate("creator", "userName photos")
      .populate("admins", "userName photos")
      .populate("members.user", "userName photos");

    if (!populatedCommunity) {
      return errorResponseHandler(
        "Failed to retrieve created community",
        httpStatusCode.INTERNAL_SERVER_ERROR,
        res
      );
    }

    return {
      success: true,
      message: "Community created successfully",
      community: populatedCommunity,
    };
  } catch (error) {
    console.error("Error creating community:", error);
    return errorResponseHandler(
      "Failed to create community",
      httpStatusCode.INTERNAL_SERVER_ERROR,
      res
    );
  }
};

// Get all communities (with optional filters)
export const getCommunitiesService = async (req: any, res: Response) => {
  const { search, type } = req.query;
  
  try {
    let query: any = { status: CommunityStatus.ACTIVE };
    
    // Add search filter if provided
    if (search) {
      query.$text = { $search: search };
    }
    
    // Add type filter if provided
    if (type && Object.values(CommunityType).includes(type)) {
      query.type = type;
    }
    
    const communities = await Community.find(query)
      .populate("creator", "userName photos")
      .populate("members.user", "userName photos")
      .sort({ createdAt: -1 });
      
    return {
      success: true,
      communities
    };
  } catch (error) {
    console.error("Error fetching communities:", error);
    return errorResponseHandler(
      "Failed to fetch communities",
      httpStatusCode.INTERNAL_SERVER_ERROR,
      res
    );
  }
};

// Get communities the user is a member of
export const getUserCommunitiesService = async (req: any, res: Response) => {
  const userId = req.user.id;
  
  try {
    const communities = await Community.find({
      "members.user": userId,
      status: CommunityStatus.ACTIVE
    })
      .populate("creator", "userName photos")
      .populate("members.user", "userName photos")
      .sort({ updatedAt: -1 });
      
    return {
      success: true,
      communities
    };
  } catch (error) {
    console.error("Error fetching user communities:", error);
    return errorResponseHandler(
      "Failed to fetch user communities",
      httpStatusCode.INTERNAL_SERVER_ERROR,
      res
    );
  }
};

// Get a specific community by ID
export const getCommunityByIdService = async (req: any, res: Response) => {
  const { id } = req.params;
  
  try {
    const community = await Community.findOne({
      _id: id,
      status: CommunityStatus.ACTIVE
    })
      .populate("creator", "userName photos")
      .populate("admins", "userName photos")
      .populate("members.user", "userName photos");
      
    if (!community) {
      return errorResponseHandler(
        "Community not found",
        httpStatusCode.NOT_FOUND,
        res
      );
    }
    
    return {
      success: true,
      community
    };
  } catch (error) {
    console.error("Error fetching community:", error);
    return errorResponseHandler(
      "Failed to fetch community",
      httpStatusCode.INTERNAL_SERVER_ERROR,
      res
    );
  }
};

// Join a community
export const joinCommunityService = async (req: any, res: Response) => {
  const userId = req.user.id;
  const { id } = req.params;
  
  try {
    const community = await Community.findById(id);
    
    if (!community) {
      return errorResponseHandler(
        "Community not found",
        httpStatusCode.NOT_FOUND,
        res
      );
    }
    
    // Check if user is already a member
    const isMember = community.members.some(
      member => member.user.toString() === userId
    );
    
    if (isMember) {
      return errorResponseHandler(
        "You are already a member of this community",
        httpStatusCode.BAD_REQUEST,
        res
      );
    }
    
    // For private communities, we would implement approval logic here
    // For now, users can join public communities directly
    if (community.type === CommunityType.PRIVATE) {
      // Implement request to join logic here
      return errorResponseHandler(
        "This is a private community. Request to join feature coming soon.",
        httpStatusCode.BAD_REQUEST,
        res
      );
    }
    
    // Add user to members
    community.members.push({
      user: userId,
      role: "member",
      joinedAt: new Date()
    });
    
    await community.save();
    
    const updatedCommunity = await Community.findById(id)
      .populate("creator", "userName photos")
      .populate("members.user", "userName photos");
      
    return {
      success: true,
      message: "Successfully joined community",
      community: updatedCommunity
    };
  } catch (error) {
    console.error("Error joining community:", error);
    return errorResponseHandler(
      "Failed to join community",
      httpStatusCode.INTERNAL_SERVER_ERROR,
      res
    );
  }
};

// Leave a community
export const leaveCommunityService = async (req: any, res: Response) => {
  const userId = req.user.id;
  const { id } = req.params;
  
  try {
    const community = await Community.findById(id);
    
    if (!community) {
      return errorResponseHandler(
        "Community not found",
        httpStatusCode.NOT_FOUND,
        res
      );
    }
    
    // Check if user is a member
    const memberIndex = community.members.findIndex(
      member => member.user.toString() === userId
    );
    
    if (memberIndex === -1) {
      return errorResponseHandler(
        "You are not a member of this community",
        httpStatusCode.BAD_REQUEST,
        res
      );
    }
    
    // Check if user is the creator
    if (community.creator.toString() === userId) {
      return errorResponseHandler(
        "Community creator cannot leave. Transfer ownership first or delete the community.",
        httpStatusCode.BAD_REQUEST,
        res
      );
    }
    
    // Remove user from members
    community.members.splice(memberIndex, 1);
    
    // Remove from admins if they are an admin
    const adminIndex = community.admins.findIndex(
      admin => admin.toString() === userId
    );
    
    if (adminIndex !== -1) {
      community.admins.splice(adminIndex, 1);
    }
    
    await community.save();
    
    return {
      success: true,
      message: "Successfully left community"
    };
  } catch (error) {
    console.error("Error leaving community:", error);
    return errorResponseHandler(
      "Failed to leave community",
      httpStatusCode.INTERNAL_SERVER_ERROR,
      res
    );
  }
};
