import { Request, Response } from "express";
import { ConversationType, Message, MessageType } from "../../models/chat/message-schema";
import { Conversation } from "../../models/chat/conversation-schema";
import { usersModel } from "../../models/user/user-schema";
import { FollowRelationshipStatus, httpStatusCode } from "../../lib/constant";
import { errorResponseHandler } from "../../lib/errors/error-response-handler";
import mongoose from "mongoose";
import { followModel } from "src/models/follow/follow-schema";
import { blockModel } from "src/models/block/block-schema";

// Get all conversations for the current user
export const getUserConversationsService = async (req: any, res: Response) => {
  const userId = req.user.id;

  const conversations = await Conversation.find({
    participants: userId,
    isActive: true,
  })
    .populate({
      path: "participants",
      select: "userName photos",
    })
    .populate({
      path: "lastMessage",
      select: "text messageType createdAt sender readBy",
    })
    .sort({ updatedAt: -1 });

  const enhancedConversations = await Promise.all(
    conversations.map(async (conversation) => {
      const conversationObj = conversation.toObject() as any;

      // Filter out the current user from participants array
      conversationObj.participants = conversationObj.participants.filter(
        (participant: any) => participant._id.toString() !== userId.toString()
      );

      // Add user-specific pin status
      conversationObj.isPinned = conversation.isPinned?.get(userId) || false;

      // Add user-specific background settings
      conversationObj.backgroundSettings = conversation.backgroundSettings?.get(
        userId
      ) || {
        backgroundImage: null,
        backgroundColor: null,
      };

      // Count unread messages for current user in this conversation
      const unreadCount = await Message.countDocuments({
        conversation: conversation._id,
        sender: { $ne: userId },
        isDeleted: false,
        "readBy.user": { $ne: userId },
      });

      conversationObj.unreadCount = unreadCount;

      return conversationObj;
    })
  );

  return {
    success: true,
    message: "Conversations retrieved successfully",
    data: enhancedConversations,
  };
};

// Get messages for a specific conversation
export const getConversationMessagesService = async (
  req: any,
  res: Response
) => {
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

  // Check if conversation exists and user is a participant
  const conversation = await Conversation.findOne({
    _id: conversationId,
    participants: userId,
    isActive: true,
  }).populate("participants", "userName photos");

  if (!conversation) {
    return errorResponseHandler(
      "Conversation not found or you're not a participant",
      httpStatusCode.NOT_FOUND,
      res
    );
  }
  // Filter out the current user from participants
  const conversationObj = conversation.toObject();
  conversationObj.participants = conversationObj.participants.filter(
    (participant: any) => participant._id.toString() !== userId.toString()
  );

  // Get messages with pagination
  const skip = (page - 1) * limit;
  const messages = await Message.find({
    conversation: conversationId,
    deletedFor: { $ne: userId }
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
      "readBy.user": { $ne: userId },
    },
    {
      $push: {
        readBy: {
          user: userId,
          readAt: new Date(),
        },
      },
    }
  );

  return {
    success: true,
    message: "conversation fetched successfully",
    data: {
      messages: messages.reverse(), // Return in chronological order
      conversation: conversationObj,
      page,
      hasMore: messages.length === limit,
      limit,
    },
  };
};

// Send a message to another user
export const sendMessageService = async (req: any, res: Response) => {
  const senderId = req.user.id;
  const {
    recipientId,
    text,
    messageType = MessageType.TEXT,
    mediaUrl,
  } = req.body;

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

  const isBlocked = await blockModel.findOne({
    $or: [
      { blockedBy: senderId, blockedUser: recipientId }, // sender blocked recipient
      { blockedBy: recipientId, blockedUser: senderId }, // recipient blocked sender
    ],
  });

  if (isBlocked) {
    return errorResponseHandler(
      "Message cannot be sent — one of the users has blocked the other.",
      httpStatusCode.FORBIDDEN,
      res
    );
  }

  // const [senderFollowsRecipient, recipientFollowsSender] = await Promise.all([
  //   followModel.findOne({
  //     follower_id: senderId,
  //     following_id: recipientId,
  //     relationship_status:FollowRelationshipStatus.FOLLOWING
  //   }),
  //   followModel.findOne({
  //     follower_id: recipientId,
  //     following_id: senderId,
  //     relationship_status:FollowRelationshipStatus.FOLLOWING
  //   }),
  // ]);

  // if (!senderFollowsRecipient || !recipientFollowsSender) {
  //   return errorResponseHandler(
  //     "You can only message users who follow you back.",
  //     httpStatusCode.FORBIDDEN,
  //     res
  //   );
  // }

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
    isActive: true,
  });

  if (!conversation) {
    conversation = new Conversation({
      participants: [senderId, recipientId],
    });
    await conversation.save();
  }

  // Create message
  const message = new Message({
    sender: senderId,
    conversation: conversation._id,
    conversationType: ConversationType.DIRECT,
    messageType,
    text: messageType === MessageType.TEXT ? text : undefined,
    mediaUrl: messageType !== MessageType.TEXT ? mediaUrl : undefined,
    readBy: [{ user: senderId, readAt: new Date() }],
    deletedFor: [],
  });

  await message.save();

  // Update conversation with last message
  conversation.lastMessage = message._id as mongoose.Types.ObjectId;
  await conversation.save();

  // Populate message for response
  const populatedMessage = await Message.findById(message._id).populate(
    "sender",
    "userName photos"
  );

  // Socket.IO will handle real-time delivery
  // The socket handler will emit this message to connected clients

  return {
    success: true,
    message: "message send successfully",
    data: {
      populatedMessage,
      conversationId: conversation._id,
    },
  };
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
      isActive: true,
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
        "readBy.user": { $ne: userId },
      },
      {
        $push: {
          readBy: {
            user: userId,
            readAt: new Date(),
          },
        },
      }
    );

    return {
      success: true,
      message: "Messages marked as read",
      data: result.modifiedCount,
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
export const deleteChatService = async (req: any, res: Response) => {
  const userId = req.user.id;
  const { recipientId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(recipientId)) {
    return errorResponseHandler("Invalid recipient ID", httpStatusCode.BAD_REQUEST, res);
  }

  // 🟩 1. Find the direct conversation between the two users
  const conversation = await Conversation.findOne({
    participants: { $all: [userId, recipientId] },
    isActive: true,
  });

  if (!conversation) {
    return errorResponseHandler("Conversation not found", httpStatusCode.NOT_FOUND, res);
  }

  // 🟩 2. Mark all messages in this conversation as deleted for the current user
  await Message.updateMany(
    {
      conversation: conversation._id,
      conversationType: ConversationType.DIRECT,
      deletedFor: { $ne: userId }, // avoid re-adding
    },
    { $addToSet: { deletedFor: userId } } // add userId if not already in array
  );

   // 🟩 3. Find and hard-delete messages where both users have deleted
  const participants = conversation.participants.map((id) => id.toString());

  await Message.deleteMany({
    conversation: conversation._id,
    conversationType: ConversationType.DIRECT,
    deletedFor: { $all: participants }, // both users deleted it
  });

  return {
    success: true,
    message: "Chat deleted successfully for you.",
  };
};
export const deleteMessageService = async (req: any, res: Response) => {
  const userId = req.user.id;
  const { messageId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(messageId)) {
    return errorResponseHandler("Invalid message ID", httpStatusCode.BAD_REQUEST, res);
  }

  const message = await Message.findById(messageId);

  if (!message) {
    return errorResponseHandler("Message not found", httpStatusCode.NOT_FOUND, res);
  }

  // Only for direct chats
  if (message.conversationType !== ConversationType.DIRECT) {
    return errorResponseHandler("Delete-for-me is only allowed in direct messages", httpStatusCode.BAD_REQUEST, res);
  }

  // Add user to deletedFor if not already there
  if (!message?.deletedFor?.includes(userId)) {
    message?.deletedFor?.push(userId);
    await message.save();
  }

  return {
    success: true,
    message: "Message deleted for you successfully",
  };
};
