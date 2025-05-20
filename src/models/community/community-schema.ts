import mongoose, { Schema, Document, Types } from "mongoose";

export enum CommunityStatus {
  ACTIVE = "active",
  INACTIVE = "inactive"
}

export enum CommunityType {
  PUBLIC = "public",
  PRIVATE = "private"
}
export enum InterestCategory {
  NIGHTLIFE_PARTIES = "Nightlife & Parties",
  LOCAL_HANGOUTS = "Local Hangouts",
  DATING_RELATIONSHIP = "Dating & Relationship",
  BOOK_CLUBS = "Book Clubs",
  GAME_NIGHTS = "Game Nights",
  MOVIE_TV_SHOWS = "Movie & TV Shows",
  FLIRTING = "Flirting",
}

export interface ICommunity extends Document {
  name: string;
  description: string;
  creator: mongoose.Types.ObjectId;
  admins: mongoose.Types.ObjectId[];
  members: {
    user: mongoose.Types.ObjectId;
    role: string;
    joinedAt: Date;
  }[];
  media: string[];
  status: CommunityStatus;
  type: CommunityType;
  conversation: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const CommunitySchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true
    },
    description: {
      type: String,
      trim: true
    },
    creator: {
      type: Schema.Types.ObjectId,
      ref: 'users',
      required: true
    },
     squadInterest:[{
          type: String,
          enum: Object.values(InterestCategory),
          default: []
        }],
    members: [{
      user: {
        type: Schema.Types.ObjectId,
        ref: 'users'
      },
      role: {
        type: String,
        enum: ["admin", "moderator", "member"],
        default: "member"
      },
      joinedAt: {
        type: Date,
        default: Date.now
      }
    }],
    status: {
      type: String,
      enum: Object.values(CommunityStatus),
      default: CommunityStatus.ACTIVE
    },
    conversation: {
      type: Schema.Types.ObjectId,
      ref: 'CommunityConversation'
    }
  },
  {
    timestamps: true
  }
);

// Create indexes for efficient queries
CommunitySchema.index({ creator: 1 });
CommunitySchema.index({ "members.user": 1 });
CommunitySchema.index({ name: "text", description: "text" });

export const Community = mongoose.model<ICommunity>("Community", CommunitySchema);