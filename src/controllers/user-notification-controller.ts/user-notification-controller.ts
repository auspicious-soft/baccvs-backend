import { Request, Response } from "express";
import { httpStatusCode } from "src/lib/constant";
import { errorParser } from "src/lib/errors/error-response-handler";
import { getUserNotificationsService, markNotificationAsReadService } from "src/services/userNotification/user-Notification-service";

export const getUserNotification = async(req:Request,res:Response)=>{
  try {
    const response = await getUserNotificationsService(req, res);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error) {
     const { code, message } = errorParser(error);
        return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
          .json({ success: false, message: message || "An error occurred" });
  }
}
export const markNotificationAsRead = async(req:Request,res:Response)=>{
  try {
    const response = await markNotificationAsReadService(req, res);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error) {
     const { code, message } = errorParser(error);
        return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
          .json({ success: false, message: message || "An error occurred" });
  }
}