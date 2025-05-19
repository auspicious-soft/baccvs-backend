import mongoose, { Schema, Document, Types } from "mongoose";

export enum CommunityStatus {
  ACTIVE = "active",
  INACTIVE = "inactive"
}

export enum CommunityType {
  PUBLIC = "public",
  PRIVATE = "private"
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
    admins: [{
      type: Schema.Types.ObjectId,
      ref: 'users'
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
    media: [{
      type: String
    }],
    status: {
      type: String,
      enum: Object.values(CommunityStatus),
      default: CommunityStatus.ACTIVE
    },
    type: {
      type: String,
      enum: Object.values(CommunityType),
      default: CommunityType.PUBLIC
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