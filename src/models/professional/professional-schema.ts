import mongoose, { Schema, Document, Types } from "mongoose";
import { EventType, MusicType, VenueType } from "src/lib/constant";

// Define enums for different types
export const ProfileType = {
  DJ: "DJ",
  PROMOTER: "Promoter",
  NIGHTCLUB: "Nightclub",
};

// Package Schema (as a subdocument)
const PackageSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    pricePerHour: {
      type: Number,
      required: true,
      min: 0,
    },
    details: {
      type: String,
      required: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

// Professional Profile Schema
const ProfessionalProfileSchema = new mongoose.Schema(
  {
    user: {
      type: Types.ObjectId,
      ref: "users",
      required: true,
    },
    role: {
      type: String,
      enum: Object.values(ProfileType),
      required: true,
    },
    stageName: {
      type: String,
      trim: true,
    },
    about: {
      type: String,
    },
    contactPhoneNumber: {
      type: String,
      trim: true,
    },
    siretNumber: {
      type: String,
      trim: true,
    },
    location: {
      type: {
        type: String,
        default: "Point",
      },
      coordinates: {
        type: [Number],
        default: [0, 0],
      },
      address:{
        type: String,
        required: true,
      }
    },
    photoUrl: [{
      type: String,
      default: [],
    }],
    videosUrl: [
      {
        type: String,
        default: [],
      },
    ],
    packages: [PackageSchema],
    preferences: {
      musicTypes: [
        {
          type: String,
          enum: Object.values(MusicType),
        },
      ],
      eventTypes: [
        {
          type: String,
          enum: Object.values(EventType),
        },
      ],
      venueTypes: [
        {
          type: String,
          enum: Object.values(VenueType),
        },
      ],
    },
    // availability: {
    //   weekdays: {
    //     type: Boolean,
    //     default: true
    //   },
    //   weekends: {
    //     type: Boolean,
    //     default: true
    //   },
    //   customDates: [{
    //     date: Date,
    //     available: Boolean
    //   }]
    // },
    rating: {
      average: {
        type: Number,
        default: 0,
        min: 0,
        max: 5,
      },
      count: {
        type: Number,
        default: 0,
      },
    },
    isVerified: {
      type: Boolean,
      default: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

// Create indexes
ProfessionalProfileSchema.index({ location: "2dsphere" });
ProfessionalProfileSchema.index({ user: 1, profileType: 1 }, { unique: true });

// Create the model
export const ProfessionalProfileModel = mongoose.model("professionalProfiles",ProfessionalProfileSchema);
