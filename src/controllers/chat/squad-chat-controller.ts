import { Request, Response } from "express";
import { httpStatusCode } from "../../lib/constant";
import { errorParser } from "../../lib/errors/error-response-handler";
import {
  getSquadMessagesService,
  sendSquadMessageService,
  getUserSquadConversationsService,
  markSquadMessagesAsReadService
} from "../../services/chat/squad-chat-service";

/**
 * Get messages for a squad conversation
 */
export const getSquadMessagesController = async (req: Request, res: Response) => {
  try {
    const response = await getSquadMessagesService(req, res);
    if (response) {
      return res.status(httpStatusCode.OK).json(response);
    }
  } catch (error) {
    const { code, message } = errorParser(error);
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};

/**
 * Send a message to a squad
 */
export const sendSquadMessageController = async (req: Request, res: Response) => {
  try {
    const response = await sendSquadMessageService(req, res);
    if (response) {
      return res.status(httpStatusCode.OK).json(response);
    }
  } catch (error) {
    const { code, message } = errorParser(error);
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};

/**
 * Get all squad conversations for a user
 */
export const getUserSquadConversationsController = async (req: Request, res: Response) => {
  try {
    const response = await getUserSquadConversationsService(req, res);
    if (response) {
      return res.status(httpStatusCode.OK).json(response);
    }
  } catch (error) {
    const { code, message } = errorParser(error);
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};

/**
 * Mark squad messages as read
 */
export const markSquadMessagesAsReadController = async (req: Request, res: Response) => {
  try {
    const response = await markSquadMessagesAsReadService(req, res);
    if (response) {
      return res.status(httpStatusCode.OK).json(response);
    }
  } catch (error) {
    const { code, message } = errorParser(error);
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};