import { Request, Response } from "express";
import { JwtPayload } from "jsonwebtoken";
import { httpStatusCode } from "src/lib/constant";
import { errorParser, errorResponseHandler } from "src/lib/errors/error-response-handler";
import { resendAdminNotificationService, sendAdminNotificationService, trackAdminNotificationInteractionService } from "src/services/notification/admin-notification-service";

export const sendAdminNotification = async (
  req: Request,
  res: Response,
) => {
  try {
    const admin = req.admin; 
    if (!admin) errorResponseHandler("Unauthorized", httpStatusCode.UNAUTHORIZED,res);

    const response = await sendAdminNotificationService(req, res);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error) {
    const { code, message } = errorParser(error);
    return res.status(code).json({
      success: false,
      message,
    });
  }
};
export const resendAdminNotification = async (
  req: Request,
  res: Response,
) => {
  try {
    const admin = req.admin; 
    if (!admin) errorResponseHandler("Unauthorized", httpStatusCode.UNAUTHORIZED,res);
    const response = await resendAdminNotificationService(req, res);

    return res.status(httpStatusCode.OK).json(response);
  } catch (error) {
    const { code, message } = errorParser(error);
    return res.status(code).json({
      success: false,
      message,
    });
  }
};
export const trackAdminNotificationInteraction = async (
  req: Request,
  res: Response,
) => {
  try {
    if (!req.user) errorResponseHandler("Unauthorized", httpStatusCode.UNAUTHORIZED,res);
    const userId = req?.user?.id as any;
    if (!userId) errorResponseHandler("Unauthorized", httpStatusCode.UNAUTHORIZED,res);
    const response = await trackAdminNotificationInteractionService(req, res);

    return res.status(httpStatusCode.OK).json(response);
  } catch (error) {
    const { code, message } = errorParser(error);
    return res.status(code).json({
      success: false,
      message,
    });
  }
};