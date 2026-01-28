import mongoose, { Schema } from "mongoose";
import { InterestCategory } from "src/models/user/user-schema";

const AdminNotificationSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
    },
    message: {
      type: String,
      required: true,
    },
    // Admin who created/scheduled this notification
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "admins",
      required: true,
    },

    // Who should receive this notification
    targetType: {
      type: String,
      enum: ["everyone", "location", "interest", "subscription", "custom"],
      default: "everyone",
    },

    // Filters used when targetType !== 'everyone'
    filters: {
      // Location-based targeting: point + radius in meters
      location: {
        type: {
          type: String,
          enum: ["Point"],
          default: "Point",
        },
        coordinates: {
          type: [Number],
          default: [0, 0],
        },
        // radius in meters
        radiusMeters: {
          type: Number,
          default: 0,
        },
        address: {
          type: String,
          default: null,
        },
      },

      // Interest-based targeting uses the same enum as user interestCategories
      interestCategories: [
        {
          type: String,
          enum: Object.values(InterestCategory),
        },
      ],

      // Subscription-based targeting: plan ids or plan keys
      subscriptionPlans: [
        {
          type: String,
        },
      ],

      // Custom explicit user list (overrides other filters when provided)
      customUserIds: [
        {
          type: Schema.Types.ObjectId,
          ref: "users",
        },
      ],
    },

    // Scheduling options
    schedule: {
      // If true, send immediately (ignores scheduledAt)
      sendNow: {
        type: Boolean,
        default: true,
      },
      // When to send if not sendNow
      scheduledAt: {
        type: Date,
        default: null,
      },
      timezone: {
        type: String,
        default: null,
      },
    },

    // Status of this notification record
    status: {
      type: String,
      enum: ["draft", "scheduled", "processing", "sent", "cancelled"],
      default: "draft",
    },

    // Delivery / engagement metrics
    metrics: {
      openCount: {
        type: Number,
        default: 0,
      },
      clickCount: {
        type: Number,
        default: 0,
      },
      deliveredCount: {
        type: Number,
        default: 0,
      },
      recipientsCount: {
        type: Number,
        default: 0,
      },
    },

    // Optional metadata for reporting / debug
    lastSentAt: {
      type: Date,
      default: null,
    },
    meta: {
      type: Schema.Types.Mixed,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

// 2dsphere index for location-based targeting
AdminNotificationSchema.index({ "filters.location": "2dsphere" });
// Indexes to efficiently query scheduled notifications
AdminNotificationSchema.index({ "schedule.scheduledAt": 1, status: 1 });

export const AdminNotificationModel = mongoose.model(
  "adminNotifications",
  AdminNotificationSchema,
);

export default AdminNotificationModel;
