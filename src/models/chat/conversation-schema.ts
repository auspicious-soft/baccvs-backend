import mongoose, { Schema, Document } from "mongoose";

export interface IConversation extends Document {
  participants: mongoose.Types.ObjectId[];
  lastMessage: mongoose.Types.ObjectId;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const ConversationSchema = new Schema(
  {
    participants: [
      {
        type: Schema.Types.ObjectId,
        ref: "users",
        required: true
      }
    ],
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

// Ensure participants array has exactly 2 users for direct messages
ConversationSchema.pre("save", function(next) {
  if (this.participants.length !== 2) {
    const error = new Error("A conversation must have exactly 2 participants");
    return next(error);
  }
  next();
});

// Create a compound index on participants to efficiently find conversations
ConversationSchema.index({ participants: 1 });

export const Conversation = mongoose.model<IConversation>("Conversation", ConversationSchema);