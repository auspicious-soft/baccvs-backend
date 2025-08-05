import { Response } from "express";
import mongoose from "mongoose";
import { Squad } from "../../models/squad/squad-schema";
import { SquadConversation } from "../../models/chat/squad-conversation-schema";
import { Message, ConversationType, MessageType } from "../../models/chat/message-schema";
import { httpStatusCode } from "../../lib/constant";
import { errorResponseHandler } from "../../lib/errors/error-response-handler";

// Create a squad conversation when a squad is created
export const createSquadConversationService = async (squadId: string) => {
  try {
    const squad = await Squad.findById(squadId);
    if (!squad) {
      throw new Error("Squad not found");
    }

    // Create a new squad conversation
    const squadConversation = new SquadConversation({
      squad: squadId
    });

    await squadConversation.save();

    // Update the squad with the conversation reference
    squad.conversation = squadConversation._id as mongoose.Types.ObjectId;
    await squad.save();

    return squadConversation;
  } catch (error) {
    console.error("Error creating squad conversation:", error);
    throw error;
  }
};

// Get squad conversation messages
export const getSquadMessagesService = async (req: any, res: Response) => {
  const { squadId } = req.params;
  const userId = req.user.id;
  const limit = parseInt(req.query.limit as string) || 50;
  const page = parseInt(req.query.page as string) || 1;
  const skip = (page - 1) * limit;

  try {
    // Check if user is a member of the squad
    const squad = await Squad.findOne({
      _id: squadId,
      "members.user": userId
    });

    if (!squad) {
      return errorResponseHandler(
        "You are not a member of this squad",
        httpStatusCode.FORBIDDEN,
        res
      );
    }

    // Get the squad conversation
    const squadConversation = await SquadConversation.findOne({ squad: squadId });
    
    if (!squadConversation) {
      return {
        success: true,
        messages: [],
        hasMore: false
      };
    }

    // Get messages for this squad conversation
    const messages = await Message.find({
      squadConversation: squadConversation._id,
      isDeleted: false
    })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("sender", "userName photos")
      .lean();

    // Mark messages as read
    const messagesToUpdate = messages
      .filter(msg => 
        msg.sender._id.toString() !== userId && 
        !msg.readBy.some(read => read.user.toString() === userId)
      )
      .map(msg => msg._id);

    if (messagesToUpdate.length > 0) {
      await Message.updateMany(
        { _id: { $in: messagesToUpdate } },
        { $push: { readBy: { user: userId, readAt: new Date() } } }
      );
    }

    // Count total messages to determine if there are more
    const totalMessages = await Message.countDocuments({
      squadConversation: squadConversation._id,
      isDeleted: false
    });

    return {
      success: true,
      messages: messages.reverse(), // Return in chronological order
      hasMore: totalMessages > skip + messages.length
    };
  } catch (error) {
    console.error("Error getting squad messages:", error);
    return errorResponseHandler(
      "Failed to get squad messages",
      httpStatusCode.INTERNAL_SERVER_ERROR,
      res
    );
  }
};

// Send a message to a squad
export const sendSquadMessageService = async (req: any, res: Response) => {
  const senderId = req.user.id;
  const { squadId, text, messageType = MessageType.TEXT, mediaUrl } = req.body;

  // Validate required fields
  if (!squadId) {
    return errorResponseHandler(
      "Squad ID is required",
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
    // Check if user is a member of the squad
    const squad = await Squad.findOne({
      _id: squadId,
      "members.user": senderId
    });

    if (!squad) {
      return errorResponseHandler(
        "You are not a member of this squad",
        httpStatusCode.FORBIDDEN,
        res
      );
    }

    // Get or create squad conversation
    let squadConversation = await SquadConversation.findOne({ squad: squadId });
    
    if (!squadConversation) {
      squadConversation = await createSquadConversationService(squadId);
    }

    // Create message
    const message = new Message({
      sender: senderId,
      squadConversation: squadConversation._id,
      conversationType: ConversationType.SQUAD,
      messageType,
      text: messageType === MessageType.TEXT ? text : undefined,
      mediaUrl: messageType !== MessageType.TEXT ? mediaUrl : undefined,
      readBy: [{ user: senderId, readAt: new Date() }]
    });

    await message.save();

    // Update conversation with last message
    squadConversation.lastMessage = message._id as mongoose.Types.ObjectId;
    await squadConversation.save();

    // Populate message for response
    const populatedMessage = await Message.findById(message._id)
      .populate("sender", "userName photos");

    return {
      success: true,
      message:"message sent successfully",
      data:{ populatedMessage,
      squadConversation: squadConversation._id
    }
  }
  } catch (error) {
    console.error("Error sending squad message:", error);
    return errorResponseHandler(
      "Failed to send message",
      httpStatusCode.INTERNAL_SERVER_ERROR,
      res
    );
  }
};

// Get all squad conversations for a user
export const getUserSquadConversationsService = async (req: any, res: Response) => {
  const userId = req.user.id;

  try {
    // Find all squads the user is a member of
    const userSquads = await Squad.find({
      "members.user": userId
    }).select("_id conversation title media members");

    // Get the conversation IDs
    const squadConversationIds = userSquads
      .filter(squad => squad.conversation)
      .map(squad => squad.conversation);

    // Get the conversations with their last messages
    const squadConversations = await SquadConversation.find({
      _id: { $in: squadConversationIds }
    })
      .populate({
        path: "lastMessage",
        populate: {
          path: "sender",
          select: "userName photos"
        }
      })
      .populate({
        path: "squad",
        select: "title media members",
        populate: {
          path: "members.user",
          select: "userName photos"
        }
      })
      .sort({ updatedAt: -1 });

    // Add user-specific fields
    const enhancedSquadConversations = squadConversations.map(conversation => {
      const conversationObj = conversation.toObject();
      conversationObj.isPinned = conversation.isPinned.get(userId) || false;
      conversationObj.backgroundSettings = conversation.backgroundSettings.get(userId) || {
        backgroundImage: null,
        backgroundColor: null
      };
      return conversationObj;
    });

    return {
      success: true,
      message:"conversation fecthed successfully",
      data: enhancedSquadConversations
    };
  } catch (error) {
    console.error("Error fetching squad conversations:", error);
    return errorResponseHandler(
      "Failed to fetch squad conversations",
      httpStatusCode.INTERNAL_SERVER_ERROR,
      res
    );
  }
};

// Mark squad messages as read
export const markSquadMessagesAsReadService = async (req: any, res: Response) => {
  const userId = req.user.id;
  const { squadId } = req.params;

  try {
    // Check if user is a member of the squad
    const squad = await Squad.findOne({
      _id: squadId,
      "members.user": userId
    });

    if (!squad) {
      return errorResponseHandler(
        "You are not a member of this squad",
        httpStatusCode.FORBIDDEN,
        res
      );
    }

    // Get the squad conversation
    const squadConversation = await SquadConversation.findOne({ squad: squadId });
    
    if (!squadConversation) {
      return {
        success: true,
        message: "No conversation found for this squad"
      };
    }

    // Mark all unread messages as read
    const result = await Message.updateMany(
      {
        squadConversation: squadConversation._id,
        sender: { $ne: userId },
        "readBy.user": { $ne: userId },
        isDeleted: false
      },
      {
        $push: { readBy: { user: userId, readAt: new Date() } }
      }
    );

    return {
      success: true,
      message: `Marked ${result.modifiedCount} messages as read`
    };
  } catch (error) {
    console.error("Error marking squad messages as read:", error);
    return errorResponseHandler(
      "Failed to mark messages as read",
      httpStatusCode.INTERNAL_SERVER_ERROR,
      res
    );
  }
};

