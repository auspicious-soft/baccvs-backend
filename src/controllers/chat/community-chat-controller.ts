import { Request, Response } from "express";
import {
  getUserCommunityConversationsService,
  getCommunityMessagesService,
  sendCommunityMessageService
} from "../../services/chat/community-chat-service";
import { errorParser } from "src/lib/errors/error-response-handler";
import { httpStatusCode } from "src/lib/constant";

// Get all community conversations for the current user
export const getUserCommunityConversations = async (req: any, res: Response) => {
  try {
    const response = await getUserCommunityConversationsService(req, res);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error) {
    const { code, message } = errorParser(error);
    return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message || "An error occurred" });
  }
};

// Get messages for a specific community
export const getCommunityMessages = async (req: any, res: Response) => {
  try {
    const response = await getCommunityMessagesService(req, res);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error) {
    const { code, message } = errorParser(error);
    return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message || "An error occurred" });
  }
};

// Send a message to a community
export const sendCommunityMessage = async (req: any, res: Response) => {
  try {
    const response = await sendCommunityMessageService(req, res);
    return res.status(httpStatusCode.CREATED).json(response);
  } catch (error) {
    const { code, message } = errorParser(error);
    return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message || "An error occurred" });
  }
};