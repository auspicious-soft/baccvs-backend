import { Request, Response } from "express";
import { 
  getUserConversationsService, 
  getConversationMessagesService, 
  sendMessageService, 
  markMessagesAsReadService, 
  deleteChatService
} from "../../services/chat/chat-service";
import { httpStatusCode } from "../../lib/constant";
import { errorParser } from "src/lib/errors/error-response-handler";

// Get all conversations for the current user
export const getUserConversations = async (req: Request, res: Response) => {
  try {
    const result = await getUserConversationsService(req, res);
    if (!result.success) return; // Error already handled by service
    return res.status(httpStatusCode.OK).json(result);
  } catch (error) {
    console.error("Error in getUserConversations controller:", error);
    return res.status(httpStatusCode.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "An unexpected error occurred"
    });
  }
};

// Get messages for a specific conversation
export const getConversationMessages = async (req: Request, res: Response) => {
  try {
    const result = await getConversationMessagesService(req, res);
    if (!result.success) return; // Error already handled by service
    return res.status(httpStatusCode.OK).json(result);
  } catch (error) {
    console.error("Error in getConversationMessages controller:", error);
    return res.status(httpStatusCode.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "An unexpected error occurred"
    });
  }
};

// Send a message to another user
export const sendMessage = async (req: Request, res: Response) => {
  try {
    const result = await sendMessageService(req, res);
    return res.status(httpStatusCode.CREATED).json(result);
  } catch (error) {
    console.error("Error in sendMessage controller:", error);
    return res.status(httpStatusCode.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "An unexpected error occurred"
    });
  }
};

// Mark messages as read
export const markMessagesAsRead = async (req: Request, res: Response) => {
  try {
    const result = await markMessagesAsReadService(req, res);
    if (!result.success) return; // Error already handled by service
    return res.status(httpStatusCode.OK).json(result);
  } catch (error) {
    console.error("Error in markMessagesAsRead controller:", error);
    return res.status(httpStatusCode.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "An unexpected error occurred"
    });
  }
};
export const deleteChat = async (req: Request, res: Response) => {
  try {
    const result = await deleteChatService(req, res);
    return res.status(httpStatusCode.OK).json(result);
  } catch (error) {
    const { code, message } = errorParser(error);
       return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
         .json({ success: false, message: message || "An error occurred" });
  }
};