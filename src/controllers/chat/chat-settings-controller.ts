import { Request, Response } from "express";
import { httpStatusCode } from "../../lib/constant";
import { errorParser } from "../../lib/errors/error-response-handler";
import {
  togglePinDirectConversationService,
  togglePinSquadConversationService,
  togglePinCommunityConversationService,
  updateDirectConversationBackgroundService,
  updateSquadConversationBackgroundService,
  updateCommunityConversationBackgroundService
} from "../../services/chat/chat-settings-service";

// Pin/Unpin direct conversation
export const togglePinDirectConversation = async (req: Request, res: Response) => {
  try {
    const response = await togglePinDirectConversationService(req, res);
    if (!response.success) return; // Error already handled by service
    return res.status(httpStatusCode.OK).json(response);
  } catch (error) {
    const { code, message } = errorParser(error);
    return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};

// Pin/Unpin squad conversation
export const togglePinSquadConversation = async (req: Request, res: Response) => {
  try {
    const response = await togglePinSquadConversationService(req, res);
    if (!response.success) return; // Error already handled by service
    return res.status(httpStatusCode.OK).json(response);
  } catch (error) {
    const { code, message } = errorParser(error);
    return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};

// Pin/Unpin community conversation
export const togglePinCommunityConversation = async (req: Request, res: Response) => {
  try {
    const response = await togglePinCommunityConversationService(req, res);
    if (!response.success) return; // Error already handled by service
    return res.status(httpStatusCode.OK).json(response);
  } catch (error) {
    const { code, message } = errorParser(error);
    return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};

// Update direct conversation background
export const updateDirectConversationBackground = async (req: Request, res: Response) => {
  try {
    const response = await updateDirectConversationBackgroundService(req, res);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error) {
    const { code, message } = errorParser(error);
    return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};

// Update squad conversation background
export const updateSquadConversationBackground = async (req: Request, res: Response) => {
  try {
    const response = await updateSquadConversationBackgroundService(req, res);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error) {
    const { code, message } = errorParser(error);
    return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};

// Update community conversation background
export const updateCommunityConversationBackground = async (req: Request, res: Response) => {
  try {
    const response = await updateCommunityConversationBackgroundService(req, res);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error) {
    const { code, message } = errorParser(error);
    return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};