import { Request, Response } from "express";
import {
  getUserCommunityConversationsService,
  getCommunityMessagesService,
  sendCommunityMessageService
} from "../../services/chat/community-chat-service";

// Get all community conversations for the current user
export const getUserCommunityConversations = async (req: any, res: Response) => {
  const result = await getUserCommunityConversationsService(req, res);
  if (result.success) {
    return res.status(200).json(result);
  }
  // Error is handled by the service
};

// Get messages for a specific community
export const getCommunityMessages = async (req: any, res: Response) => {
  const result = await getCommunityMessagesService(req, res);
  if (result.success) {
    return res.status(200).json(result);
  }
  // Error is handled by the service
};

// Send a message to a community
export const sendCommunityMessage = async (req: any, res: Response) => {
  const result = await sendCommunityMessageService(req, res);
  if (result.success) {
    return res.status(201).json(result);
  }
  // Error is handled by the service
};