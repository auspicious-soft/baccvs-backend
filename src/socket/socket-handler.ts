import { Server, Socket } from "socket.io";
import { Message } from "../models/chat/message-schema";
import { Conversation } from "../models/chat/conversation-schema";
import { usersModel } from "../models/user/user-schema";

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
        participants: userId,
        isActive: true
      });
      
      conversations.forEach(conversation => {
        socket.join(`conversation:${conversation._id}`);
      });
      
      // Broadcast user online status
      io.emit("user_status_changed", { userId, status: "online" });
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