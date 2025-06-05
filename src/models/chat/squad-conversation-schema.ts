import mongoose, { Schema, Document } from "mongoose";

export interface ISquadConversation extends Document {
  squad: mongoose.Types.ObjectId;
  messages: mongoose.Types.ObjectId[];
  lastMessage: mongoose.Types.ObjectId;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const SquadConversationSchema = new Schema(
  {
    squad: {
      type: Schema.Types.ObjectId,
      ref: "Squad",
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

// Create an index on squad ID for efficient lookups
SquadConversationSchema.index({ squad: 1 });

export const SquadConversation = mongoose.model<ISquadConversation>(
  "SquadConversation", 
  SquadConversationSchema
);
