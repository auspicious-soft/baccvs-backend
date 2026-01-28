import { Response } from "express";
import { httpStatusCode } from "src/lib/constant";
import { errorResponseHandler } from "src/lib/errors/error-response-handler";
import AdminNotificationEventModel from "src/models/notification/admin-notification-event-schema";
import AdminNotificationModel from "src/models/notification/admin-notification-schema";
import { SubscriptionModel } from "src/models/subscriptions/dating-subscription-schema";
import { usersModel } from "src/models/user/user-schema";
import { sendBulkPushNotification } from "src/utils/firebase-admin";

export const resolveAdminNotificationRecipients = async (
  targetType: string,
  filters: any,
): Promise<string[]> => {
  switch (targetType) {
    case "everyone": {
      const users = await usersModel.find({}, { _id: 1 }).lean();
      return users.map((u) => u._id.toString());
    }

    case "custom": {
      return (filters?.customUserIds || []).map((id: any) => id.toString());
    }
    case "interest": {
      if (!filters?.interestCategories?.length) return [];

      const users = await usersModel
        .find({
          interestCategories: { $in: filters.interestCategories },
        })
        .select("_id")
        .lean();

      return users.map((u) => u._id.toString());
    }
    case "subscription": {
      if (!filters?.subscriptionPlans?.length) return [];

      /**
       * Step 1: Find active subscriptions matching planIds
       */
      const subscriptions = await SubscriptionModel.find({
        planId: { $in: filters.subscriptionPlans },
        status: { $in: ["active", "trialing"] },
      })
        .select("userId")
        .lean();

      /**
       * Step 2: Extract unique userIds
       */
      const userIds = [
        ...new Set(subscriptions.map((s) => s.userId.toString())),
      ];

      return userIds;
    }

    case "location": {
      if (
        !filters?.location ||
        !filters.location.coordinates ||
        !filters.location.radiusMeters
      ) {
        return [];
      }

      const users = await usersModel.find({
        location: {
          $nearSphere: {
            $geometry: {
              type: "Point",
              coordinates: filters.location.coordinates,
            },
            $maxDistance: filters.location.radiusMeters,
          },
        },
      });

      return users.map((u) => u._id.toString());
    }
    default:
      return [];
  }
};

export const sendAdminNotificationService = async (req: any, res: Response) => {
  const { title, message, targetType, filters, schedule } = req.body;
  const { id: adminId } = req.admin;

  if (!title || !message) {
    return errorResponseHandler(
      "Title and message are required",
      httpStatusCode.BAD_REQUEST,
      res,
    );
  }

  // 1. Resolve recipients
  const recipients = await resolveAdminNotificationRecipients(
    targetType,
    filters,
  );

  if (!recipients.length) {
    return errorResponseHandler(
      "No recipients found",
      httpStatusCode.BAD_REQUEST,
      res,
    );
  }

  // 2. Create notification
  const notification = await AdminNotificationModel.create({
    title,
    message,
    createdBy: adminId,
    targetType,
    filters,
    schedule,
    status: schedule?.sendNow ? "sent" : "scheduled",
    metrics: {
      recipientsCount: recipients.length, // SET ONCE
      deliveredCount: 0,
      openCount: 0,
      clickCount: 0,
    },
    lastSentAt: null,
  });

  // 3. Send immediately
  if (schedule?.sendNow) {
    const pushResult = await sendBulkPushNotification({
      userIds: recipients,
      title,
      message,
      data: {
        notificationId: notification._id.toString(),
        type: "admin",
      },
    });

    await AdminNotificationModel.findByIdAndUpdate(notification._id, {
      $set: {
        lastSentAt: new Date(),
      },
      $inc: {
        "metrics.deliveredCount": pushResult.successCount,
      },
    });
  }

  return {
    success: true,
    message: "Admin notification processed successfully",
    data: notification,
  };
};

export const resendAdminNotificationService = async (
  req: any,
  res: Response,
) => {
  const { notificationId } = req.params;

  const notification = await AdminNotificationModel.findById(notificationId);

  if (!notification || notification.status !== "sent") {
    return errorResponseHandler(
      "Notification not eligible for resend",
      httpStatusCode.BAD_REQUEST,
      res,
    );
  }

  const recipients = await resolveAdminNotificationRecipients(
    notification.targetType,
    notification.filters,
  );

  if (!recipients.length) {
    return errorResponseHandler(
      "No recipients found",
      httpStatusCode.BAD_REQUEST,
      res,
    );
  }

  const pushResult = await sendBulkPushNotification({
    userIds: recipients,
    title: notification.title,
    message: notification.message,
    data: {
      notificationId: notification._id.toString(),
      type: "admin",
    },
  });

  await AdminNotificationModel.findByIdAndUpdate(notificationId, {
    $inc: {
      "metrics.deliveredCount": pushResult.successCount,
    },
    lastSentAt: new Date(),
  });

  return {
    success: true,
    message: "Notification resent successfully",
  };
};

export const trackAdminNotificationInteractionService = async (
  req: any,
  res: Response,
) => {
  const { notificationId } = req.body;
  const { id: userId } = req.user;

  if (!notificationId) {
    return errorResponseHandler(
      "notificationId is required",
      httpStatusCode.BAD_REQUEST,
      res,
    );
  }

  try {
    // Create per-user open record (idempotent)
    await AdminNotificationEventModel.create({
      notificationId,
      userId,
    });

    // Increment both counts once
    await AdminNotificationModel.findByIdAndUpdate(notificationId, {
      $inc: {
        "metrics.openCount": 1,
        "metrics.clickCount": 1,
      },
    });
  } catch (err: any) {
    // Duplicate open → ignore silently
    if (err.code !== 11000) {
      throw err;
    }
  }

  return {
    success: true,
    message: "Notification interaction tracked",
  };
};
