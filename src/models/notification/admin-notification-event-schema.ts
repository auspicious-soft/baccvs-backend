import mongoose, { Schema } from "mongoose";

const AdminNotificationEventSchema = new Schema(
  {
    notificationId: {
      type: Schema.Types.ObjectId,
      ref: "admin_notifications",
      required: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "users",
      required: true,
    },
    openedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true },
);

// One open per user per notification
AdminNotificationEventSchema.index(
  { notificationId: 1, userId: 1 },
  { unique: true },
);

export const AdminNotificationEventModel = mongoose.model(
  "admin_notification_events",
  AdminNotificationEventSchema,
);

export default AdminNotificationEventModel;