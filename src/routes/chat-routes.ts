import { Router } from "express";
import { checkAuth } from "../middleware/check-auth";
import {
  togglePinDirectConversation,
  togglePinSquadConversation,
  togglePinCommunityConversation,
  updateDirectConversationBackground,
  updateSquadConversationBackground,
  updateCommunityConversationBackground
} from "../controllers/chat/chat-settings-controller";

const router = Router();



// Community conversation routes

export { router };
