import mongoose, { Schema } from "mongoose";

const eventViewerSchema = new Schema(
  {
    event: {
      type: Schema.Types.ObjectId,
      ref: "event",
      required: true,
      index: true,
    },
    user: {
      type: Schema.Types.ObjectId,
      ref: "users",
      required: true,
      index: true,
    },
    viewDate: {
      type: Date,
      required: true,
      index: true,
    },
    viewCount: {
      type: Number,
      default: 1,
    },
    firstViewedAt: {
      type: Date,
      default: Date.now,
    },
    lastViewedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

/**
 * ONE document per (event, user, day)
 */
eventViewerSchema.index(
  { event: 1, user: 1, viewDate: 1 },
  { unique: true }
);

export const EventViewerModel = mongoose.model(
  "eventviewers",
  eventViewerSchema
);
