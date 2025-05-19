import mongoose, { Schema, Document } from "mongoose";

export enum MessageType {
  TEXT = "text",
  IMAGE = "image",
  AUDIO = "audio",
  VIDEO = "video"
}

export enum ConversationType {
  DIRECT = "direct",
  SQUAD = "squad",
  COMMUNITY = "community"
}

interface ReadReceipt {
  user: mongoose.Types.ObjectId;
  readAt: Date;
}

export interface IMessage extends Document {
  sender: mongoose.Types.ObjectId;
  conversation?: mongoose.Types.ObjectId;
  squadConversation?: mongoose.Types.ObjectId;
  communityConversation?: mongoose.Types.ObjectId;
  conversationType: ConversationType;
  text: string;
  messageType: MessageType;
  mediaUrl?: string;
  readBy: ReadReceipt[];
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const MessageSchema = new Schema(
  {
    sender: {
      type: Schema.Types.ObjectId,
      ref: "users",
      required: true
    },
    conversation: {
      type: Schema.Types.ObjectId,
      ref: "Conversation",
      required: function(this: any) {
        return this.conversationType === ConversationType.DIRECT;
      }
    },
    squadConversation: {
      type: Schema.Types.ObjectId,
      ref: "SquadConversation",
      required: function(this: any) {
        return this.conversationType === ConversationType.SQUAD;
      }
    },
    communityConversation: {
      type: Schema.Types.ObjectId,
      ref: "CommunityConversation",
      required: function(this: any) {
        return this.conversationType === ConversationType.COMMUNITY;
      }
    },
    conversationType: {
      type: String,
      enum: Object.values(ConversationType),
      default: ConversationType.DIRECT
    },
    text: {
      type: String,
      required: function(this: any) {
        return this.messageType === MessageType.TEXT;
      }
    },
    messageType: {
      type: String,
      enum: Object.values(MessageType),
      default: MessageType.TEXT
    },
    mediaUrl: {
      type: String,
      required: function(this: any) {
        return this.messageType !== MessageType.TEXT;
      }
    },
    readBy: [
      {
        user: {
          type: Schema.Types.ObjectId,
          ref: "users"
        },
        readAt: {
          type: Date,
          default: Date.now
        }
      }
    ],
    isDeleted: {
      type: Boolean,
      default: false
    }
  },
  {
    timestamps: true
  }
);

// Add indexes for efficient queries
MessageSchema.index({ conversation: 1, createdAt: -1 });
MessageSchema.index({ squadConversation: 1, createdAt: -1 });
MessageSchema.index({ sender: 1 });
MessageSchema.index({ communityConversation: 1, createdAt: -1 });

export const Message = mongoose.model<IMessage>("Message", MessageSchema);





