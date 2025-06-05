import { Request, Response } from "express";
import { Message, MessageType } from "../../models/chat/message-schema";
import { Conversation } from "../../models/chat/conversation-schema";
import { usersModel } from "../../models/user/user-schema";
import { httpStatusCode } from "../../lib/constant";
import { errorResponseHandler } from "../../lib/errors/error-response-handler";
import mongoose from "mongoose";

// Get all conversations for the current user
export const getUserConversationsService = async (req: any, res: Response) => {
  const userId = req.user.id;

  try {
    const conversations = await Conversation.find({
      participants: userId,
      isActive: true
    })
      .populate({
        path: "participants",
        select: "userName photos"
      })
      .populate({
        path: "lastMessage",
        select: "text messageType createdAt sender readBy"
      })
      .sort({ updatedAt: -1 });

    return {
      success: true,
      conversations
    };
  } catch (error) {
    console.error("Error fetching conversations:", error);
    return errorResponseHandler(
      "Failed to fetch conversations",
      httpStatusCode.INTERNAL_SERVER_ERROR,
      res
    );
  }
};

// Get messages for a specific conversation
export const getConversationMessagesService = async (req: any, res: Response) => {
  const userId = req.user.id;
  const { conversationId } = req.params;
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;

  if (!mongoose.Types.ObjectId.isValid(conversationId)) {
    return errorResponseHandler(
      "Invalid conversation ID",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

  try {
    // Check if conversation exists and user is a participant
    const conversation = await Conversation.findOne({
      _id: conversationId,
      participants: userId,
      isActive: true
    });

    if (!conversation) {
      return errorResponseHandler(
        "Conversation not found or you're not a participant",
        httpStatusCode.NOT_FOUND,
        res
      );
    }

    // Get messages with pagination
    const skip = (page - 1) * limit;
    const messages = await Message.find({
      conversation: conversationId,
      isDeleted: false
    })
      .populate("sender", "userName photos")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    // Mark messages as read
    await Message.updateMany(
      {
        conversation: conversationId,
        sender: { $ne: userId },
        "readBy.user": { $ne: userId }
      },
      {
        $push: {
          readBy: {
            user: userId,
            readAt: new Date()
          }
        }
      }
    );

    return {
      success: true,
      messages: messages.reverse(), // Return in chronological order
      pagination: {
        page,
        limit,
        hasMore: messages.length === limit
      }
    };
  } catch (error) {
    console.error("Error fetching messages:", error);
    return errorResponseHandler(
      "Failed to fetch messages",
      httpStatusCode.INTERNAL_SERVER_ERROR,
      res
    );
  }
};

// Send a message to another user
export const sendMessageService = async (req: any, res: Response) => {
  const senderId = req.user.id;
  const { recipientId, text, messageType = MessageType.TEXT, mediaUrl } = req.body;

  // Validate required fields
  if (!recipientId) {
    return errorResponseHandler(
      "Recipient ID is required",
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

  if (!mongoose.Types.ObjectId.isValid(recipientId)) {
    return errorResponseHandler(
      "Invalid recipient ID",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

  if (senderId === recipientId) {
    return errorResponseHandler(
      "Cannot send message to yourself",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

  try {
    // Check if recipient exists
    const recipient = await usersModel.findById(recipientId);
    if (!recipient) {
      return errorResponseHandler(
        "Recipient not found",
        httpStatusCode.NOT_FOUND,
        res
      );
    }

    // Find or create conversation
    let conversation = await Conversation.findOne({
      participants: { $all: [senderId, recipientId] },
      isActive: true
    });

    if (!conversation) {
      conversation = new Conversation({
        participants: [senderId, recipientId]
      });
      await conversation.save();
    }

    // Create message
    const message = new Message({
      sender: senderId,
      conversation: conversation._id,
      messageType,
      text: messageType === MessageType.TEXT ? text : undefined,
      mediaUrl: messageType !== MessageType.TEXT ? mediaUrl : undefined,
      readBy: [{ user: senderId, readAt: new Date() }]
    });

    await message.save();

    // Update conversation with last message
    conversation.lastMessage = message._id as mongoose.Types.ObjectId;
    await conversation.save();

    // Populate message for response
    const populatedMessage = await Message.findById(message._id)
      .populate("sender", "userName photos");

    // Socket.IO will handle real-time delivery
    // The socket handler will emit this message to connected clients

    return {
      success: true,
      message: populatedMessage,
      conversation: conversation._id
    };
  } catch (error) {
    console.error("Error sending message:", error);
    return errorResponseHandler(
      "Failed to send message",
      httpStatusCode.INTERNAL_SERVER_ERROR,
      res
    );
  }
};

// Mark messages as read
export const markMessagesAsReadService = async (req: any, res: Response) => {
  const userId = req.user.id;
  const { conversationId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(conversationId)) {
    return errorResponseHandler(
      "Invalid conversation ID",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

  try {
    // Check if conversation exists and user is a participant
    const conversation = await Conversation.findOne({
      _id: conversationId,
      participants: userId,
      isActive: true
    });

    if (!conversation) {
      return errorResponseHandler(
        "Conversation not found or you're not a participant",
        httpStatusCode.NOT_FOUND,
        res
      );
    }

    // Update all unread messages
    const result = await Message.updateMany(
      {
        conversation: conversationId,
        sender: { $ne: userId },
        "readBy.user": { $ne: userId }
      },
      {
        $push: {
          readBy: {
            user: userId,
            readAt: new Date()
          }
        }
      }
    );

    return {
      success: true,
      message: "Messages marked as read",
      updatedCount: result.modifiedCount
    };
  } catch (error) {
    console.error("Error marking messages as read:", error);
    return errorResponseHandler(
      "Failed to mark messages as read",
      httpStatusCode.INTERNAL_SERVER_ERROR,
      res
    );
  }
};

