import { Request, Response } from "express";
import { JwtPayload } from "jsonwebtoken";
import { httpStatusCode } from "src/lib/constant";
import { errorParser } from "src/lib/errors/error-response-handler";
import {
  getUserNotificationsService,
  getUnreadNotificationsCountService,
  markNotificationAsReadService,
  markAllNotificationsAsReadService,
  deleteNotificationService,
  getNotificationsByTypeService,
  clearAllNotificationsService,
} from "src/services/notification/notification-service";

/**
 * Get all notifications for the current user with pagination
 * GET /api/notification
 * Query params: page, limit
 */
export const getUserNotifications = async (
  req: Request,
  res: Response
) => {
  try {
    const { id: userId } = req.user as JwtPayload;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;

    const response = await getUserNotificationsService(userId, page, limit);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error) {
    const { code, message } = errorParser(error);
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};

/**
 * Get unread notifications count
 * GET /api/notification/unread-count
 */
export const getUnreadNotificationsCount = async (
  req: Request,
  res: Response
) => {
  try {
    const { id: userId } = req.user as JwtPayload;

    const response = await getUnreadNotificationsCountService(userId);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error) {
    const { code, message } = errorParser(error);
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};

/**
 * Mark a single notification as read
 * PUT /api/notification/:notificationId/read
 */
export const markNotificationAsRead = async (
  req: Request,
  res: Response
) => {
  try {
    const { id: userId } = req.user as JwtPayload;
    const { notificationId } = req.params;

    const response = await markNotificationAsReadService(
      userId,
      notificationId
    );
    return res.status(httpStatusCode.OK).json(response);
  } catch (error) {
    const { code, message } = errorParser(error);
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};

/**
 * Mark all notifications as read
 * PUT /api/notification/mark-all/read
 */
export const markAllNotificationsAsRead = async (
  req: Request,
  res: Response
)=> {
  try {
    const { id: userId } = req.user as JwtPayload;

    const response = await markAllNotificationsAsReadService(userId);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error) {
    const { code, message } = errorParser(error);
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};

/**
 * Delete a notification
 * DELETE /api/notification/:notificationId
 */
export const deleteNotification = async (
  req: Request,
  res: Response
) => {
  try {
    const { id: userId } = req.user as JwtPayload;
    const { notificationId } = req.params;

    const response = await deleteNotificationService(userId, notificationId);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error) {
    const { code, message } = errorParser(error);
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};

/**
 * Get notifications filtered by type
 * GET /api/notification/type/:type
 * Query params: page, limit
 */
export const getNotificationsByType = async (
  req: Request,
  res: Response
) => {
  try {
    const { id: userId } = req.user as JwtPayload;
    const { type } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;

    const response = await getNotificationsByTypeService(
      userId,
      type,
      page,
      limit
    );
    return res.status(httpStatusCode.OK).json(response);
  } catch (error) {
    const { code, message } = errorParser(error);
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};

/**
 * Clear all notifications for the user
 * DELETE /api/notification/clear-all
 */
export const clearAllNotifications = async (
  req: Request,
  res: Response
)=> {
  try {
    const { id: userId } = req.user as JwtPayload;

    const response = await clearAllNotificationsService(userId);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error) {
    const { code, message } = errorParser(error);
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};
