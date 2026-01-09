import mongoose, { Schema, Document, Types } from "mongoose";
import { nanoid } from "nanoid";

export enum InterestCategory {
  NIGHTLIFE_PARTIES = "Nightlife & Parties",
  LOCAL_HANGOUTS = "Local Hangouts",
  DATING_RELATIONSHIP = "Dating & Relationship",
  BOOK_CLUBS = "Book Clubs",
  EVENT_HANGOUTS = "Event Hangouts",
  SPORTS_NIGHTS = "Sports Nights",
  MOVIE_TV_SHOWS = "Movie & TV Shows",
  FLIRTING = "Flirting",
}

export enum MusicStyle {
  HOUSE = "House",
  EDM = "EDM",
  UK_GARAGE = "UK Garage",
  TECHNO = "Techno",
  FUNKY = "Funky",
  TECH_HOUSE = "Tech House",
  INDIE = "Indie",
  DEEP_HOUSE = "Deep House",
  POP = "Pop",
  AFRO_HOUSE = "Afro-House",
  PROGRESSIVE_HOUSE = "Progressive House",
  MELODIC_HOUSE = "Melodic House",
  MELODIC_TECH = "Melodic Tech",
}

export enum AtmosphereVibe {
  LUXURY_EXCLUSIVE = "Luxury & Exclusive",
  CHILL_RELAXED = "Chill & Relaxed",
  ENERGETIC_FESTIVE = "Energetic & Festive",
  UNDERGROUND = "Underground",
  ELEGANT_SELECTIVE = "Elegant & Selective",
  SURPRISE_MYSTERY = "Surprise & Mystery",
  EXTRAVAGANT_COSTUME = "Extravagant & Costume Party",
}

export enum EventType {
  PREGAME = "Pregame",
  AFTERPARTY = "Afterparty",
  PARTY = "Party",
  CONCERT = "Concert",
  FESTIVAL = "Festival",
  RAVES = "Raves",
  VIP_EVENTS = "VIP Events",
  THEMED_NIGHT = "Themed night",
  NETWORKING = "Networking",
}

const UserSchema = new mongoose.Schema(
  {
    identifier: {
      type: String,
      // required: true,
      unique: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    phoneNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    countryCode: {
      type: String,
      default: "+62",
    },
    password: {
      type: String,
      // required: true,
      minlength: 8,
    },
    userName: {
      type: String,
      required: true,
      // unique: true,
      trim: true,
    },
    dob: {
      type: Date,
      // required: true
    },
    gender: {
      type: String,
      enum: ["male", "female", "other"],
      // required: true
    },
    interestedIn: {
      type: String,
      enum: ["male", "female", "everyone"],
      // required: true
    },
    photos: [
      {
        type: String,
        default: [],
      },
    ],
    selectedSquad: {
      type: Types.ObjectId,
      ref: "Squad",
      default: null,
    },
    token: {
      type: String,
    },
    isEmailVerified: {
      type: Boolean,
      default: false,
    },
    authType: {
      type: String,
      enum: ["Email", "Twitter", "Facebook", "Apple", "Google"],
      default: "Email",
    },
    referredBy: {
      type: Types.ObjectId,
      ref: "ReferralCode",
    },
    fcmToken: {
      type: String,
      default: null,
    },
    tempEmail: {
      type: String,
      default: null,
    },
    tempPhoneNumber: {
      type: String,
      default: null,
    },
    accountType: {
      type: String,
      enum: ["public", "matches", "follower"],
      default: "public",
    },
    location: {
      type: {
        type: String,
        default: "Point",
      },
      coordinates: {
        type: [Number, Number],
        default: [0, 0],
      },
      address: {
        type: String,
        default: null,
      },
    },
    zodiacSign: {
      type: String,
      default: null,
    },
    language: [
      {
        type: String,
        default: null,
      },
    ],
    pushNotification: {
      type: Boolean,
      default: true,
    },
    newsLetterNotification: {
      type: Boolean,
      default: true,
    },
    eventsNotification: {
      type: Boolean,
      default: true,
    },
    chatNotification: {
      type: Boolean,
      default: true,
    },
    twoFactorAuthentication: {
      type: Boolean,
      default: false,
    },
    about: {
      type: String,
      default: null,
    },
    drinking: {
      type: String,
      enum: ["Yes", "No", "prefer not to say"],
      default: null,
    },
    smoke: {
      type: String,
      enum: ["Yes", "No", "prefer not to say"],
      default: null,
    },
    marijuana: {
      type: String,
      enum: ["Yes", "No", "prefer not to say"],
      default: null,
    },
    drugs: {
      type: String,
      enum: ["Yes", "No", "prefer not to say"],
      default: null,
    },
    stripeCustomerId: {
      type: String,
      default: null,
    },
    stripeAccountId: {
      type: String,
      default: null,
    },
    stripeAccountData: {
      type: Schema.Types.Mixed,
      default: null,
    },
    onboardingComplete: {
      type: Boolean,
      default: false,
    },
    interestCategories: [
      {
        type: String,
        enum: Object.values(InterestCategory),
        default: [],
      },
    ],
    musicStyles: [
      {
        type: String,
        enum: Object.values(MusicStyle),
        default: [],
      },
    ],
    atmosphereVibes: [
      {
        type: String,
        enum: Object.values(AtmosphereVibe),
        default: [],
      },
    ],
    eventTypes: [
      {
        type: String,
        enum: Object.values(EventType),
        default: [],
      },
    ],
    height: {
      type: String,
      default: null,
    },
    work: {
      type: String,
      default: null,
    },
    totalLikes: {
      type: Number,
      default: 0,
    },
    unlimitedLikes: {
      type: Boolean,
      default: false,
    },
    unlimitedLikesExpiry: {
      type: Date,
      default: null,
    },
    totalSuperLikes: {
      type: Number,
      default: 0,
    },
    totalBoosts: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      enum: ["active", "deleted"],
      default: "active",
    },
  },
  {
    timestamps: true,
  }
);

UserSchema.index({ location: "2dsphere" });

export const usersModel = mongoose.model("users", UserSchema);
