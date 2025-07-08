import { Request, Response } from 'express';
import { usersModel } from 'src/models/user/user-schema';
import { Squad } from 'src/models/squad/squad-schema';
import { httpStatusCode } from 'src/lib/constant';
import { errorResponseHandler } from 'src/lib/errors/error-response-handler';
import mongoose, { Types } from 'mongoose';
import { Notification, NotificationType } from 'src/models/userNotification/user-Notification-schema';

// Helper function to create a notification
export const createNotification = async (
  recipientId: string,
  senderId: string,
  type: NotificationType,
  message: string,
  relatedUserId?: string,
  relatedSquadId?: string
) => {
  try {
    const notification = new Notification({
      recipient: new Types.ObjectId(recipientId),
      sender: new Types.ObjectId(senderId),
      type,
      message,
      relatedUser: relatedUserId ? new Types.ObjectId(relatedUserId) : undefined,
      relatedSquad: relatedSquadId ? new Types.ObjectId(relatedSquadId) : undefined,
    });
    await notification.save();
    return notification;
  } catch (error) {
    console.error('Error creating notification:', error);
    throw error;
  }
};

// Get notifications for a user with pagination
export const getUserNotificationsService = async (req: any, res: Response) => {
  if (!req.user) {
    return errorResponseHandler('Authentication failed', httpStatusCode.UNAUTHORIZED, res);
  }

  const { id: userId } = req.user;
  const { page = '1', limit = '10' } = req.query;

  const skip = (parseInt(page) - 1) * parseInt(limit);

  try {
    const notifications = await Notification.find({ recipient: userId })
      .populate('sender', 'userName photos')
      .populate('relatedUser', 'userName photos')
      .populate('relatedSquad', 'title')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const total = await Notification.countDocuments({ recipient: userId });

    return {
      success: true,
      message: 'Notifications retrieved successfully',
      data: notifications,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit)),
      },
    };
  } catch (error) {
    return errorResponseHandler(
      'Failed to retrieve notifications',
      httpStatusCode.INTERNAL_SERVER_ERROR,
      res
    );
  }
};

// Mark a notification as read
export const markNotificationAsReadService = async (req: any, res: Response) => {
  if (!req.user) {
    return errorResponseHandler('Authentication failed', httpStatusCode.UNAUTHORIZED, res);
  }

  const { id: userId } = req.user;
  const { notificationId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(notificationId)) {
    return errorResponseHandler('Invalid notification ID', httpStatusCode.BAD_REQUEST, res);
  }

  try {
    const notification = await Notification.findOne({
      _id: notificationId,
      recipient: userId,
    });

    if (!notification) {
      return errorResponseHandler(
        'Notification not found or you are not the recipient',
        httpStatusCode.NOT_FOUND,
        res
      );
    }

    notification.isRead = true;
    await notification.save();

    return {
      success: true,
      message: 'Notification marked as read',
      data: notification,
    };
  } catch (error) {
    return errorResponseHandler(
      'Failed to mark notification as read',
      httpStatusCode.INTERNAL_SERVER_ERROR,
      res
    );
  }
};