import { Request, Response } from "express";
import { JwtPayload } from "jsonwebtoken";
import { httpStatusCode } from "src/lib/constant";
import { errorResponseHandler } from "src/lib/errors/error-response-handler";
import { NotificationModel } from "src/models/notification/notification-schema";

// Get all notifications for the current user
export const getUserNotificationsService = async (
  userId: string,
  page: number,
  limit: number
) => {
  const skip = (page - 1) * limit;
  if(!userId){
    return errorResponseHandler(
      "User ID is required",
      httpStatusCode.BAD_REQUEST,
      {} as Response
    );
  }

  // Get total count
  const total = await NotificationModel.countDocuments({ recipient: userId });

  // Get paginated notifications
  const notifications = await NotificationModel.find({ recipient: userId })
    .populate("sender", "userName photos")
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

  return {
    success: true,
    message: "Notifications retrieved successfully",
    data: {
      notifications,
    pagination: {
      current: page,
      limit,
      total,
      pages: Math.ceil(total / limit),
      hasNext: page * limit < total,
      hasPrev: page > 1,
    },}
  };
};

// Get unread notifications count
export const getUnreadNotificationsCountService = async (userId: string) => {
  const unreadCount = await NotificationModel.countDocuments({
    recipient: userId,
    read: false,
  });

  return {
    success: true,
    message: "Unread count retrieved successfully",
    data: {
      unreadCount,
    },
  };
};

// Mark notification as read
export const markNotificationAsReadService = async (
  userId: string,
  notificationId: string
) => {
  const notification = await NotificationModel.findById(notificationId);

  if (!notification) {
    const error: any = new Error("Notification not found");
    error.code = httpStatusCode.NOT_FOUND;
    throw error;
  }

  // Check if user is the recipient
  if (notification.recipient.toString() !== userId) {
    const error: any = new Error("Unauthorized to mark this notification");
    error.code = httpStatusCode.FORBIDDEN;
    throw error;
  }

  // Mark as read
  notification.read = true;
  await notification.save();

  return {
    success: true,
    message: "Notification marked as read",
    data: notification,
  };
};

// Mark all notifications as read
export const markAllNotificationsAsReadService = async (userId: string) => {
  const result = await NotificationModel.updateMany(
    { recipient: userId, read: false },
    { $set: { read: true } }
  );

  return {
    success: true,
    message: "All notifications marked as read",
    data: {
      modifiedCount: result.modifiedCount,
    },
  };
};

// Delete notification
export const deleteNotificationService = async (
  userId: string,
  notificationId: string
) => {
  const notification = await NotificationModel.findById(notificationId);

  if (!notification) {
    const error: any = new Error("Notification not found");
    error.code = httpStatusCode.NOT_FOUND;
    throw error;
  }

  // Check if user is the recipient
  if (notification.recipient.toString() !== userId) {
    const error: any = new Error("Unauthorized to delete this notification");
    error.code = httpStatusCode.FORBIDDEN;
    throw error;
  }

  // Delete notification
  await NotificationModel.findByIdAndDelete(notificationId);

  return {
    success: true,
    message: "Notification deleted successfully",
  };
};

// Get notifications by type
export const getNotificationsByTypeService = async (
  userId: string,
  type: string,
  page: number,
  limit: number
) => {
  // Validate notification type
  const validTypes = [
    "follow",
    "like",
    "comment",
    "mention",
    "event_invite",
    "event_reminder",
    "chat_message",
    "newsletter",
    "system",
  ];

  if (!validTypes.includes(type)) {
    const error: any = new Error("Invalid notification type");
    error.code = httpStatusCode.BAD_REQUEST;
    throw error;
  }

  const skip = (page - 1) * limit;

  // Get total count
  const total = await NotificationModel.countDocuments({
    recipient: userId,
    type,
  });

  // Get paginated notifications
  const notifications = await NotificationModel.find({
    recipient: userId,
    type,
  })
    .populate("sender", "userName photos")
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

  return {
    success: true,
    message: `${type} notifications retrieved successfully`,
    data: notifications,
    pagination: {
      current: page,
      limit,
      total,
      pages: Math.ceil(total / limit),
      hasNext: page * limit < total,
      hasPrev: page > 1,
    },
  };
};

// Clear all notifications for user
export const clearAllNotificationsService = async (userId: string) => {
  const result = await NotificationModel.deleteMany({ recipient: userId });

  return {
    success: true,
    message: "All notifications cleared successfully",
    data: {
      deletedCount: result.deletedCount,
    },
  };
};
