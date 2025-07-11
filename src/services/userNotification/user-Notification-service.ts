import { Request, Response } from 'express';
import { usersModel } from 'src/models/user/user-schema';
import { Squad } from 'src/models/squad/squad-schema';
import { httpStatusCode } from 'src/lib/constant';
import { errorResponseHandler } from 'src/lib/errors/error-response-handler';
import mongoose, { Types } from 'mongoose';
import { Notification, NotificationType } from 'src/models/userNotification/user-Notification-schema';
import Joi from 'joi';


const notificationQuerySchema = Joi.object({
  page: Joi.string().pattern(/^[0-9]+$/).default('1'),
  limit: Joi.string().pattern(/^[0-9]+$/).default('10'),
  typeFilter: Joi.string().valid('all', 'user', 'squad').default('all'),
});

// Helper function to validate query parameters
const validateQuery = (query: any) => {
  return notificationQuerySchema.validate(query, { abortEarly: false });
};

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
  const { error, value } = validateQuery(req.query);
  
  if (error) {
    const errorMessage = error.details.map((detail) => detail.message).join(', ');
    return errorResponseHandler(errorMessage, httpStatusCode.BAD_REQUEST, res);
  }

  const { page, limit, typeFilter } = value;
  const skip = (parseInt(page) - 1) * parseInt(limit);

  // Define notification type filter based on typeFilter
  let typeFilterArray: NotificationType[] | undefined;
  if (typeFilter === 'user') {
    typeFilterArray = [NotificationType.USER_LIKE, NotificationType.USER_DISLIKE];
  } else if (typeFilter === 'squad') {
    typeFilterArray = [
      NotificationType.SQUAD_LIKE,
      NotificationType.SQUAD_MEMBER_ADDED,
      NotificationType.SQUAD_MEMBER_REMOVED,
      NotificationType.SQUAD_JOIN,
      NotificationType.SQUAD_LEAVE,
      NotificationType.SQUAD_OWNERSHIP_TRANSFER,
      NotificationType.SQUAD_MATCH,
      NotificationType.SQUAD_UNMATCH,
    ];
  }

  const query: any = { recipient: userId };
  if (typeFilterArray) {
    query.type = { $in: typeFilterArray };
  }

  try {
    const notifications = await Notification.find(query)
      .populate('sender', 'userName photos')
      .populate('relatedUser', 'userName photos')
      .populate('relatedSquad', 'title')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const total = await Notification.countDocuments(query);

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
      error instanceof Error ? error.message : 'Failed to retrieve notifications',
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
 
};