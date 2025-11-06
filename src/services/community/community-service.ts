import { Request, Response } from "express";
import {
  Community,
  CommunityStatus,
  CommunityType,
  InterestCategory,
} from "../../models/community/community-schema";
import { httpStatusCode } from "../../lib/constant";
import { errorResponseHandler } from "../../lib/errors/error-response-handler";
import { createCommunityConversationService } from "../chat/community-chat-service";
import mongoose from "mongoose";
import { usersModel } from "../../models/user/user-schema";

// Create a new community
export const createCommunityService = async (req: any, res: Response) => {
  const userId = req.user.id;
  const {
    name,
    description,
    squadInterest = [],
    members = [], // Array of user IDs to add as members
  } = req.body;

  if (!name) {
    return errorResponseHandler(
      "Community name is required",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

  // Validate interest categories
  for (const interest of squadInterest) {
    if (!Object.values(InterestCategory).includes(interest)) {
      return errorResponseHandler(
        `Invalid interest category: ${interest}`,
        httpStatusCode.BAD_REQUEST,
        res
      );
    }
  }
  // check for duplicate members
  const uniqueMembers = new Set(members);
  if (uniqueMembers.size !== members.length) {
    return errorResponseHandler(
      "Duplicate member IDs found",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }
  // check for dublicate userId
  if (members.includes(userId)) {
    return errorResponseHandler(
      "You cannot add yourself as a member",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

  // Create initial members array with creator as admin
  const communityMembers = [
    {
      user: userId,
      role: "admin",
      joinedAt: new Date(),
    },
  ];

  // Validate and add additional members
  if (members.length > 0) {
    // Check if all user IDs exist
    const userIds = members.filter((id: string) => id !== userId); // Remove creator if included
    const existingUsers = await usersModel
      .find({ _id: { $in: userIds } })
      .select("_id");

    if (existingUsers.length !== userIds.length) {
      return errorResponseHandler(
        "One or more user IDs are invalid",
        httpStatusCode.BAD_REQUEST,
        res
      );
    }

    // Add members to the array
    for (const memberId of userIds) {
      communityMembers.push({
        user: memberId,
        role: "member",
        joinedAt: new Date(),
      });
    }
  }

  // Create new community
  const community = new Community({
    name,
    description,
    creator: userId,
    members: communityMembers,
    squadInterest,
    type: CommunityType.PUBLIC,
    status: CommunityStatus.ACTIVE,
  });

  await community.save();

  // Create community conversation using the dedicated service
  if (!community._id) {
    throw new Error("Community not created");
  }
  const communityConversation = await createCommunityConversationService(
    community._id.toString()
  );

  // Update community with conversation ID
  community.conversation = new mongoose.Types.ObjectId(
    communityConversation._id as string
  );
  await community.save();

  // Populate the member details for the response
  const populatedCommunity = await Community.findById(community._id)
    .populate("creator", "userName photos")
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
    data: populatedCommunity,
  };
};

// Get all communities with optional filters
export const getCommunitiesService = async (req: Request, res: Response) => {
  const { search, type, status, interest, limit = 10, page = 1 } = req.query;

  const query: any = {};

  // Apply filters if provided
  if (search) {
    query.$text = { $search: search as string };
  }

  if (type) {
    query.type = type;
  }

  if (status) {
    query.status = status;
  }

  if (interest) {
    query.squadInterest = interest;
  }

  // Calculate pagination
  const skip = (Number(page) - 1) * Number(limit);

  // Get communities with pagination
  const communities = await Community.find(query)
    .populate("creator", "userName photos")
    .populate("members.user", "userName photos")
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(Number(limit));

  // Get total count for pagination
  const totalCount = await Community.countDocuments(query);

  return {
    success: true,
    data: {
      communities,
      pagination: {
        total: totalCount,
        page: Number(page),
        limit: Number(limit),
        pages: Math.ceil(totalCount / Number(limit)),
      },
    },
  };
};

export const updateCommunityService = async (req: any, res: Response) => {
  const userId = req.user.id;
  const { communityId } = req.params;
  const { name, description, squadInterest = [], members = [] } = req.body;

  // Validate community ID
  if (!mongoose.Types.ObjectId.isValid(communityId)) {
    return errorResponseHandler(
      "Invalid community ID",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

  // Fetch community
  const community: any = await Community.findById(communityId);
  if (!community) {
    return errorResponseHandler(
      "Community not found",
      httpStatusCode.NOT_FOUND,
      res
    );
  }

  // Check if user is admin
  const isAdmin = community.members.some(
    (m: any) => m.user.toString() === userId && m.role === "admin"
  );
  if (!isAdmin) {
    return errorResponseHandler(
      "Only community admins can update the community",
      httpStatusCode.FORBIDDEN,
      res
    );
  }

  // Validate interest categories if provided
  if (squadInterest.length > 0) {
    for (const interest of squadInterest) {
      if (!Object.values(InterestCategory).includes(interest)) {
        return errorResponseHandler(
          `Invalid interest category: ${interest}`,
          httpStatusCode.BAD_REQUEST,
          res
        );
      }
    }
    community.squadInterest = squadInterest;
  }

  // Update name or description if provided
  if (name) community.name = name;
  if (description) community.description = description;

  // Handle member updates if provided
  if (members.length > 0) {
    const uniqueMembers = new Set(members);
    if (uniqueMembers.size !== members.length) {
      return errorResponseHandler(
        "Duplicate member IDs found",
        httpStatusCode.BAD_REQUEST,
        res
      );
    }

    if (members.includes(userId)) {
      return errorResponseHandler(
        "You cannot add yourself as a member (you are already admin)",
        httpStatusCode.BAD_REQUEST,
        res
      );
    }

    // Check valid users
    const existingUsers = await usersModel
      .find({
        _id: { $in: members },
      })
      .select("_id");

    if (existingUsers.length !== members.length) {
      return errorResponseHandler(
        "One or more user IDs are invalid",
        httpStatusCode.BAD_REQUEST,
        res
      );
    }

    // Add new members (ignore existing ones)
    const existingMemberIds = community.members.map((m: any) =>
      m.user.toString()
    );
    const newMembers = members.filter(
      (id: string) => !existingMemberIds.includes(id)
    );

    for (const newMemberId of newMembers) {
      community.members.push({
        user: newMemberId,
        role: "member",
        joinedAt: new Date(),
      });
    }
  }

  // Save updates
  await community.save();

  // Populate updated community for response
  const updatedCommunity = await Community.findById(community._id)
    .populate("creator", "userName photos")
    .populate("members.user", "userName photos");

  if (!updatedCommunity) {
    return errorResponseHandler(
      "Failed to fetch updated community",
      httpStatusCode.INTERNAL_SERVER_ERROR,
      res
    );
  }

  return {
    success: true,
    message: "Community updated successfully",
    data: updatedCommunity,
  };
};

// Get communities the user is a member of
export const getUserCommunitiesService = async (req: any, res: Response) => {
  const userId = req.user.id;

  const communities = await Community.find({
    "members.user": userId,
  })
    .populate("creator", "userName photos")
    .populate("members.user", "userName photos")
    .sort({ createdAt: -1 });

  return {
    success: true,
    mesage: "Data fetched successfully",
    data: communities,
  };
};

// Get a specific community by ID
export const getCommunityByIdService = async (req: Request, res: Response) => {
  const { id } = req.params;

  const community = await Community.findById(id)
    .populate("creator", "userName photos")
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
    message: "message fetched successfully",
    data: community,
  };
};

// Join a community
export const joinCommunityService = async (req: any, res: Response) => {
  const userId = req.user.id;
  const { id } = req.params;

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
    (member) => member.user.toString() === userId
  );

  if (isMember) {
    return errorResponseHandler(
      "You are already a member of this community",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

  // For private communities, we would implement approval logic here
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
    user: new mongoose.Types.ObjectId(userId),
    role: "member",
    joinedAt: new Date(),
  });

  await community.save();

  const updatedCommunity = await Community.findById(id)
    .populate("creator", "userName photos")
    .populate("members.user", "userName photos");

  return {
    success: true,
    message: "Successfully joined community",
    data: updatedCommunity,
  };
};

// Leave a community
export const leaveCommunityService = async (req: any, res: Response) => {
  const userId = req.user.id;
  const { id } = req.params;

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
    (member) => member.user.toString() === userId
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
      "As the creator, you cannot leave the community. Transfer ownership first or delete the community.",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

  // Remove user from members
  community.members.splice(memberIndex, 1);

  await community.save();

  const updatedCommunity = await Community.findById(id)
    .populate("creator", "userName photos")
    .populate("members.user", "userName photos");

  return {
    success: true,
    message: "Successfully left community",
    data: updatedCommunity,
  };
};

// Add a member to a community (admin only)
export const addMemberService = async (req: any, res: Response) => {
  const adminId = req.user.id;
  const { id } = req.params;
  const { userId, role = "member" } = req.body;

  if (!userId) {
    return errorResponseHandler(
      "User ID is required",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

  const community = await Community.findById(id);

  if (!community) {
    return errorResponseHandler(
      "Community not found",
      httpStatusCode.NOT_FOUND,
      res
    );
  }

  // Check if requester is an admin
  const isAdmin = community.members.some(
    (member) => member.user.toString() === adminId && member.role === "admin"
  );

  if (!isAdmin) {
    return errorResponseHandler(
      "Only admins can add members",
      httpStatusCode.FORBIDDEN,
      res
    );
  }

  // Check if user is already a member
  const isMember = community.members.some(
    (member) => member.user.toString() === userId
  );

  if (isMember) {
    return errorResponseHandler(
      "User is already a member of this community",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

  // Validate role
  if (!["admin", "moderator", "member"].includes(role)) {
    return errorResponseHandler(
      "Invalid role. Must be admin, moderator, or member",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

  // Add user to members
  community.members.push({
    user: new mongoose.Types.ObjectId(userId),
    role,
    joinedAt: new Date(),
  });

  await community.save();

  const updatedCommunity = await Community.findById(id)
    .populate("creator", "userName photos")
    .populate("members.user", "userName photos");

  return {
    success: true,
    message: "Successfully added member to community",
    data: updatedCommunity,
  };
};

// Remove a member from a community (admin only)
export const removeMemberService = async (req: any, res: Response) => {
  const adminId = req.user.id;
  const { id } = req.params;
  const { userId } = req.body;

  if (!userId) {
    return errorResponseHandler(
      "User ID is required",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

  const community = await Community.findById(id);

  if (!community) {
    return errorResponseHandler(
      "Community not found",
      httpStatusCode.NOT_FOUND,
      res
    );
  }

  // Check if requester is an admin
  const isAdmin = community.members.some(
    (member) => member.user.toString() === adminId && member.role === "admin"
  );

  if (!isAdmin) {
    return errorResponseHandler(
      "Only admins can remove members",
      httpStatusCode.FORBIDDEN,
      res
    );
  }

  // Check if user is the creator
  if (community.creator.toString() === userId) {
    return errorResponseHandler(
      "Cannot remove the creator of the community",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

  // Check if user is a member
  const memberIndex = community.members.findIndex(
    (member) => member.user.toString() === userId
  );

  if (memberIndex === -1) {
    return errorResponseHandler(
      "User is not a member of this community",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

  // Remove user from members
  community.members.splice(memberIndex, 1);

  await community.save();

  const updatedCommunity = await Community.findById(id)
    .populate("creator", "userName photos")
    .populate("members.user", "userName photos");

  return {
    success: true,
    message: "Successfully removed member from community",
    data: updatedCommunity,
  };
};

// Change a member's role in a community (admin only)
export const changeMemberRoleService = async (req: any, res: Response) => {
  const adminId = req.user.id;
  const { communityId, memberId } = req.params;
  const { role } = req.body;

  if (!role) {
    return errorResponseHandler(
      "Role is required",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

  // Validate role
  if (!["admin", "moderator", "member"].includes(role)) {
    return errorResponseHandler(
      "Invalid role. Must be admin, moderator, or member",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

  const community = await Community.findById(communityId);

  if (!community) {
    return errorResponseHandler(
      "Community not found",
      httpStatusCode.NOT_FOUND,
      res
    );
  }

  // Check if requester is an admin
  const isAdmin = community.members.some(
    (member) => member.user.toString() === adminId && member.role === "admin"
  );

  if (!isAdmin) {
    return errorResponseHandler(
      "Only admins can change member roles",
      httpStatusCode.FORBIDDEN,
      res
    );
  }

  // Check if target user is the creator
  if (community.creator.toString() === memberId) {
    return errorResponseHandler(
      "Cannot change the role of the community creator",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

  // Find the member
  const memberIndex = community.members.findIndex(
    (member) => member.user.toString() === memberId
  );

  if (memberIndex === -1) {
    return errorResponseHandler(
      "User is not a member of this community",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

  // Update the member's role
  community.members[memberIndex].role = role;

  await community.save();

  const updatedCommunity = await Community.findById(communityId)
    .populate("creator", "userName photos")
    .populate("members.user", "userName photos");

  return {
    success: true,
    message: "Successfully updated member role",
    data: updatedCommunity,
  };
};

// Transfer ownership of a community (creator only)
export const transferOwnershipService = async (req: any, res: Response) => {
  const creatorId = req.user.id;
  const { id } = req.params;
  const { newOwnerId } = req.body;

  if (!newOwnerId) {
    return errorResponseHandler(
      "New owner ID is required",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

  const community = await Community.findById(id);

  if (!community) {
    return errorResponseHandler(
      "Community not found",
      httpStatusCode.NOT_FOUND,
      res
    );
  }

  // Check if requester is the creator
  if (community.creator.toString() !== creatorId) {
    return errorResponseHandler(
      "Only the creator can transfer ownership",
      httpStatusCode.FORBIDDEN,
      res
    );
  }

  // Check if new owner is a member
  const newOwnerIndex = community.members.findIndex(
    (member) => member.user.toString() === newOwnerId
  );

  if (newOwnerIndex === -1) {
    return errorResponseHandler(
      "New owner must be a member of the community",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

  // Update creator
  community.creator = new mongoose.Types.ObjectId(newOwnerId);

  // Update member roles
  community.members[newOwnerIndex].role = "admin";

  // Find current creator in members and change role to admin (not creator anymore)
  const oldCreatorIndex = community.members.findIndex(
    (member) => member.user.toString() === creatorId
  );

  if (oldCreatorIndex !== -1) {
    community.members[oldCreatorIndex].role = "admin";
  }

  await community.save();

  const updatedCommunity = await Community.findById(id)
    .populate("creator", "userName photos")
    .populate("members.user", "userName photos");

  return {
    success: true,
    message: "Successfully transferred community ownership",
    data: updatedCommunity,
  };
};
