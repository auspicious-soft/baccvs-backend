import mongoose, { Schema } from "mongoose";
import {
  EventType,
  EventVisibility,
  MusicType,
  VenueType,
} from "src/lib/constant";

const eventSchema = new Schema(
  {
    creator: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
      required: true,
    },
    title: {
      type: String,
      required: true,
    },
    aboutEvent: {
      type: String,
    },
    date: {
      type: Date,
      required: true,
    },
    startTime: {
      type: String,
      required: true,
    },
    endTime: {
      type: String,
      required: true,
    },
    venue: {
      type: String,
      required: true,
    },
    capacity: {
      type: Number,
      required: true,
    },
    eventPreferences: {
      musicType: [
        {
          type: String,
          enum: Object.values(MusicType),
        },
      ],
      eventType: [
        {
          type: String,
          enum: Object.values(EventType),
        },
      ],
      venueType: [
        {
          type: String,
          enum: Object.values(VenueType),
        },
      ],
    },
    eventVisibility: {
      type: String,
      enum: Object.values(EventVisibility),
      required: true,
    },
    invitedGuests: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "users",
      },
    ],
    ticketing: {
      isFree: {
        type: Boolean,
        required: true,
      },
      enableReselling: {
        type: Boolean,
        default: false,
      },
    },
    media: {
      coverPhoto: {
        type: String, // URL to stored image
        required: true,
      },
      videos: [
        {
          type: String, // URLs to stored videos
        },
      ],
    },
    coHosts: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "users",
      },
    ],
    lineup: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "professionalProfiles",
      },
    ],
    location: {
      type: {
        type: String,
        default: "Point",
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
        required: true,
      },
      address: {
        type: String,
        default: null,
      },
    },
    utcDateTime: {
      type: Date,
      required: true,
      index: true,
    },
    localDateTime: {
      type: Date,
      required: true,
    },
    viewers:[{
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
      select: false,
    }],
    timezone: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

eventSchema.index({ location: "2dsphere" });

export const eventModel = mongoose.model("event", eventSchema);