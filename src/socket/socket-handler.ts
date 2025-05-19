import { Server, Socket } from "socket.io";
import { ConversationType, Message, MessageType } from "../models/chat/message-schema";
import { Conversation } from "../models/chat/conversation-schema";
import { usersModel } from "../models/user/user-schema";
import { Squad } from "../models/squad/squad-schema";
import { Community } from "../models/community/community-schema";
import { CommunityConversation } from "../models/chat/community-conversation-schema";

interface UserSocket {
  userId: string;
  socketId: string;
}

// Track online users
let onlineUsers: UserSocket[] = [];

export const setupSocketServer = (io: Server) => {
  io.on("connection", (socket: Socket) => {
    console.log("New client connected:", socket.id);

    // Handle user connection
    socket.on("user_connected", async (userId: string) => {
      // Add user to online users
      onlineUsers.push({ userId, socketId: socket.id });
      console.log(`User ${userId} connected with socket ${socket.id}`);
      
      // Join user to their conversation rooms
      const conversations = await Conversation.find({ 
        participants: userId
      });
      
      conversations.forEach(conversation => {
        socket.join(`conversation:${conversation._id}`);
      });
      
      // Broadcast user online status
      io.emit("user_status_changed", { userId, status: "online" });
    });

    // Handle joining squad conversations
    socket.on("join_squad_conversations", async (userId: string) => {
      // Find all squad conversations the user is part of
      const squads = await Squad.find({
        "members.user": userId
      });
      
      // Join socket to each squad conversation room
      squads.forEach(squad => {
        if (squad.conversation) {
          socket.join(`squad:${squad.conversation}`);
        }
      });
    });

    // Handle new message
    socket.on("send_message", async (data: { 
      conversationId: string, 
      message: any,
      sender: string 
    }) => {
      const { conversationId, message, sender } = data;
      
      // Emit to all users in the conversation
      io.to(`conversation:${conversationId}`).emit("receive_message", {
        conversationId,
        message
      });
      
      // Find recipient to send notification
      const conversation = await Conversation.findById(conversationId);
      if (conversation) {
        const recipientId = conversation.participants.find(
          p => p.toString() !== sender
        );
        
        if (recipientId) {
          // Find if recipient is online
          const recipientSocket = onlineUsers.find(u => u.userId === recipientId.toString());
          
          if (recipientSocket) {
            // Send notification to recipient
            io.to(recipientSocket.socketId).emit("new_message_notification", {
              conversationId,
              sender,
              message: message.text || "New message"
            });
          }
        }
      }
    });

    // Handle typing status
    socket.on("typing", (data: { conversationId: string, userId: string, isTyping: boolean }) => {
      const { conversationId, userId, isTyping } = data;
      
      // Broadcast typing status to conversation
      socket.to(`conversation:${conversationId}`).emit("user_typing", {
        conversationId,
        userId,
        isTyping
      });
    });

    // Handle read receipts
    socket.on("mark_read", async (data: { conversationId: string, userId: string }) => {
      const { conversationId, userId } = data;
      
      // Broadcast read status to conversation
      socket.to(`conversation:${conversationId}`).emit("messages_read", {
        conversationId,
        userId
      });
    });

    // Handle squad messages
    socket.on("send_squad_message", async (data: { 
      squadId: string, 
      squadConversationId: string,
      message: any,
      sender: string 
    }) => {
      const { squadId, squadConversationId, message, sender } = data;
      
      // Emit to all users in the squad conversation
      io.to(`squad:${squadConversationId}`).emit("receive_squad_message", {
        squadId,
        squadConversationId,
        message
      });
      
      // Find squad to send notifications to members
      const squad = await Squad.findById(squadId);
      if (squad) {
        // Get all members except sender
        const recipients = squad.members
          .filter(member => member.user && member.user.toString() !== sender)
          .map(member => member.user && member.user.toString());
        
        // Send notifications to online recipients
        recipients.forEach(recipientId => {
          const recipientSocket = onlineUsers.find(u => u.userId === recipientId);
          if (recipientSocket) {
            io.to(recipientSocket.socketId).emit("new_squad_message_notification", {
              squadId,
              squadConversationId,
              sender,
              message: message.text || "New squad message"
            });
          }
        });
      }
    });

    // Handle squad typing status
    socket.on("squad_typing", (data: { squadConversationId: string, userId: string, isTyping: boolean }) => {
      const { squadConversationId, userId, isTyping } = data;
      
      // Broadcast typing status to squad conversation
      socket.to(`squad:${squadConversationId}`).emit("user_squad_typing", {
        squadConversationId,
        userId,
        isTyping
      });
    });

    // Handle squad read receipts
    socket.on("mark_squad_read", async (data: { squadConversationId: string, userId: string }) => {
      const { squadConversationId, userId } = data;
      
      // Update messages in database to mark them as read
      await Message.updateMany(
        {
          squadConversation: squadConversationId,
          sender: { $ne: userId },
          "readBy.user": { $ne: userId }
        },
        {
          $push: { readBy: { user: userId, readAt: new Date() } }
        }
      );
      
      // Broadcast read status to squad conversation
      socket.to(`squad:${squadConversationId}`).emit("squad_messages_read", {
        squadConversationId,
        userId
      });
    });

    // Handle joining community conversations
    socket.on("join_community_conversations", async (userId: string) => {
      try {
        // Find all communities the user is a member of
        const userCommunities = await Community.find({
          "members.user": userId
        }).select("_id conversation");

        // Get the conversation IDs
        const communityConversationIds = userCommunities
          .filter(community => community.conversation)
          .map(community => community.conversation);

        // Join each community conversation room
        for (const conversationId of communityConversationIds) {
          socket.join(`community:${conversationId}`);
        }

        console.log(`User ${userId} joined their community conversations`);
      } catch (error) {
        console.error("Error joining community conversations:", error);
      }
    });

    // Handle community messages
    socket.on("community_message", async (data: {
      communityId: string,
      senderId: string,
      text?: string,
      messageType: string,
      mediaUrl?: string
    }) => {
      try {
        const { communityId, senderId, text, messageType, mediaUrl } = data;

        // Check if user is a member of the community
        const community = await Community.findOne({
          _id: communityId,
          "members.user": senderId
        });

        if (!community) {
          socket.emit("error", { message: "You are not a member of this community" });
          return;
        }

        // Get community conversation
        const communityConversation = await CommunityConversation.findOne({
          community: communityId
        });

        if (!communityConversation) {
          socket.emit("error", { message: "Community conversation not found" });
          return;
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
        communityConversation.lastMessage = message._id as import("mongoose").Types.ObjectId;
        await communityConversation.save();

        // Populate message for response
        const populatedMessage = await Message.findById(message._id)
          .populate("sender", "userName photos");

        // Broadcast to all members in the community conversation
        io.to(`community:${communityConversation._id}`).emit("community_message_received", {
          message: populatedMessage,
          communityConversation: communityConversation._id
        });
      } catch (error) {
        console.error("Error handling community message:", error);
        socket.emit("error", { message: "Failed to send community message" });
      }
    });

    // Handle community read receipts
    socket.on("mark_community_read", async (data: { communityId: string, userId: string }) => {
      const { communityId, userId } = data;
      
      try {
        // Get community conversation
        const communityConversation = await CommunityConversation.findOne({
          community: communityId
        });

        if (!communityConversation) {
          socket.emit("error", { message: "Community conversation not found" });
          return;
        }

        // Update messages in database to mark them as read
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
        
        // Broadcast read status to community conversation
        socket.to(`community:${communityConversation._id}`).emit("community_messages_read", {
          communityId,
          userId
        });
      } catch (error) {
        console.error("Error marking community messages as read:", error);
        socket.emit("error", { message: "Failed to mark messages as read" });
      }
    });

    // Handle disconnect
    socket.on("disconnect", () => {
      console.log("Client disconnected:", socket.id);
      
      // Find user who disconnected
      const userIndex = onlineUsers.findIndex(user => user.socketId === socket.id);
      
      if (userIndex !== -1) {
        const userId = onlineUsers[userIndex].userId;
        
        // Remove user from online users
        onlineUsers = onlineUsers.filter(user => user.socketId !== socket.id);
        
        // Broadcast user offline status
        io.emit("user_status_changed", { userId, status: "offline" });
      }
    });
  });
};




