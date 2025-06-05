import mongoose, { Schema, Document } from "mongoose";

export interface ICommunityConversation extends Document {
  community: mongoose.Types.ObjectId;
  lastMessage: mongoose.Types.ObjectId;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  isPinned: Map<string, boolean>;
  backgroundSettings: Map<string, { backgroundImage: string; backgroundColor: string }>;
}

const CommunityConversationSchema = new Schema(
  {
    community: {
      type: Schema.Types.ObjectId,
      ref: "Community",
      required: true,
      unique: true
    },
    lastMessage: {
      type: Schema.Types.ObjectId,
      ref: "Message"
    },
    isActive: {
      type: Boolean,
      default: true
    },
    isPinned: {
      type: Map,
      of: Boolean,
      default: {} // Map of userId -> isPinned
    },
    backgroundSettings: {
      type: Map,
      of: new Schema({
        backgroundImage: String,
        backgroundColor: String
      }, { _id: false }),
      default: {} // Map of userId -> background settings
    }
  },
  {
    timestamps: true
  }
);

// Create an index on community ID for efficient lookups
CommunityConversationSchema.index({ community: 1 });

export const CommunityConversation = mongoose.model<ICommunityConversation>(
  "CommunityConversation", 
  CommunityConversationSchema
);

