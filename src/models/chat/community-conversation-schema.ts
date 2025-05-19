import mongoose, { Schema, Document } from "mongoose";

export interface ICommunityConversation extends Document {
  community: mongoose.Types.ObjectId;
  lastMessage: mongoose.Types.ObjectId;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
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