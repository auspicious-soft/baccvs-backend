import { Router } from "express";
import { 
  getUserConversations, 
  getConversationMessages, 
  sendMessage, 
  markMessagesAsRead 
} from "../controllers/chat/chat-controller";

const router = Router();

// Get all conversations for the current user
router.get("/conversations", getUserConversations);

// Get messages for a specific conversation
router.get("/conversations/:conversationId/messages", getConversationMessages);

// Send a message to another user
router.post("/send", sendMessage);

// Mark messages as read
router.post("/conversations/:conversationId/read", markMessagesAsRead);

export { router };