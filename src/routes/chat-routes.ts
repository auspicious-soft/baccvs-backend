import { Router } from "express";
import { 
  getUserConversations, 
  getConversationMessages, 
  sendMessage, 
  markMessagesAsRead 
} from "../controllers/chat/chat-controller";

const router = Router();


export { router };