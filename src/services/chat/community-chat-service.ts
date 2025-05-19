import { Response } from "express";
import mongoose from "mongoose";
import { Community } from "../../models/community/community-schema";
import { CommunityConversation } from "../../models/chat/community-conversation-schema";
import { Message, ConversationType, MessageType } from "../../models/chat/message-schema";
import { httpStatusCode } from "../../lib/constant";
import { errorResponseHandler } from "../../lib/errors/error-response-handler";

// Create a community conversation when a community is created
export const createCommunityConversationService = async (communityId: string) => {
  try {
    const community = await Community.findById(communityId);
    if (!community) {
      throw new Error("Community not found");
    }

    // Create a new community conversation
    const communityConversation = new CommunityConversation({
      community: communityId
    });

    await communityConversation.save();

    // Update the community with the conversation reference
    community.conversation = communityConversation._id as mongoose.Types.ObjectId;
    await community.save();

    return communityConversation;
  } catch (error) {
    console.error("Error creating community conversation:", error);
    throw error;
  }
};

// Get all community conversations for the current user
export const getUserCommunityConversationsService = async (req: any, res: Response) => {
  const userId = req.user.id;

  try {
    // Find all communities the user is a member of
    const userCommunities = await Community.find({
      "members.user": userId
    }).select("_id conversation name media members");

    // Get the conversation IDs
    const communityConversationIds = userCommunities
      .filter(community => community.conversation)
      .map(community => community.conversation);

    // Get the conversations with their last messages
    const communityConversations = await CommunityConversation.find({
      _id: { $in: communityConversationIds }
    })
      .populate({
        path: "lastMessage",
        populate: {
          path: "sender",
          select: "userName photos"
        }
      })
      .populate({
        path: "community",
        select: "name media members",
        populate: {
          path: "members.user",
          select: "userName photos"
        }
      })
      .sort({ updatedAt: -1 });

    return {
      success: true,
      communityConversations
    };
  } catch (error) {
    console.error("Error fetching community conversations:", error);
    return errorResponseHandler(
      "Failed to fetch community conversations",
      httpStatusCode.INTERNAL_SERVER_ERROR,
      res
    );
  }
};

// Get messages for a specific community
export const getCommunityMessagesService = async (req: any, res: Response) => {
  const userId = req.user.id;
  const { communityId } = req.params;
  const { page = 1, limit = 20 } = req.query;

  try {
    // Check if user is a member of the community
    const community = await Community.findOne({
      _id: communityId,
      "members.user": userId
    });

    if (!community) {
      return errorResponseHandler(
        "You are not a member of this community",
        httpStatusCode.FORBIDDEN,
        res
      );
    }

    // Get community conversation
    const communityConversation = await CommunityConversation.findOne({
      community: communityId
    });

    if (!communityConversation) {
      return errorResponseHandler(
        "Community conversation not found",
        httpStatusCode.NOT_FOUND,
        res
      );
    }

    // Calculate pagination
    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

    // Get messages
    const messages = await Message.find({
      communityConversation: communityConversation._id,
      conversationType: ConversationType.COMMUNITY
    })
      .populate("sender", "userName photos")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit as string));

    // Mark messages as read by this user
    await Message.updateMany(
      {
        communityConversation: communityConversation._id,
        sender: { $ne: userId },
        "readBy.user": { $ne: userId }
      },
      {
        $push: { readBy: { user: userId, readAt: new Date() } }
      }
    );

    // Get total count for pagination
    const totalMessages = await Message.countDocuments({
      communityConversation: communityConversation._id,
      conversationType: ConversationType.COMMUNITY
    });

    return {
      success: true,
      messages: messages.reverse(), // Reverse to get oldest first
      pagination: {
        total: totalMessages,
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        pages: Math.ceil(totalMessages / parseInt(limit as string))
      },
      communityConversation: communityConversation._id
    };
  } catch (error) {
    console.error("Error fetching community messages:", error);
    return errorResponseHandler(
      "Failed to fetch community messages",
      httpStatusCode.INTERNAL_SERVER_ERROR,
      res
    );
  }
};

// Send a message to a community
export const sendCommunityMessageService = async (req: any, res: Response) => {
  const senderId = req.user.id;
  const { communityId, text, messageType = MessageType.TEXT, mediaUrl } = req.body;

  // Validate required fields
  if (!communityId) {
    return errorResponseHandler(
      "Community ID is required",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

  if (messageType === MessageType.TEXT && !text) {
    return errorResponseHandler(
      "Text is required for text messages",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

  if (messageType !== MessageType.TEXT && !mediaUrl) {
    return errorResponseHandler(
      "Media URL is required for non-text messages",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

  try {
    // Check if user is a member of the community
    const community = await Community.findOne({
      _id: communityId,
      "members.user": senderId
    });

    if (!community) {
      return errorResponseHandler(
        "You are not a member of this community",
        httpStatusCode.FORBIDDEN,
        res
      );
    }

    // Get community conversation
    const communityConversation = await CommunityConversation.findOne({
      community: communityId
    });

    if (!communityConversation) {
      return errorResponseHandler(
        "Community conversation not found",
        httpStatusCode.NOT_FOUND,
        res
      );
    }

    // Create message
    const message = new Message({
      sender: senderId,
      communityConversation: communityConversation._id,
      conversationType: ConversationType.COMMUNITY,
      messageType,
      text: messageType === MessageType.TEXT ? text : undefined,
      mediaUrl: messageType !== MessageType.TEXT ? mediaUrl : undefined,
      readBy: [{ user: senderId, readAt: new Date() }]
    });

    await message.save();

    // Update conversation with last message
    communityConversation.lastMessage = message._id as mongoose.Types.ObjectId;
    await communityConversation.save();

    // Populate message for response
    const populatedMessage = await Message.findById(message._id)
      .populate("sender", "userName photos");

    return {
      success: true,
      message: populatedMessage,
      communityConversation: communityConversation._id
    };
  } catch (error) {
    console.error("Error sending community message:", error);
    return errorResponseHandler(
      "Failed to send message",
      httpStatusCode.INTERNAL_SERVER_ERROR,
      res
    );
  }
};
