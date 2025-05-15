import mongoose, { Schema, Document } from "mongoose";

export enum MessageType {
  TEXT = "text",
  IMAGE = "image",
  AUDIO = "audio",
  VIDEO = "video"
}

interface ReadReceipt {
  user: mongoose.Types.ObjectId;
  readAt: Date;
}

export interface IMessage extends Document {
  sender: mongoose.Types.ObjectId;
  conversation: mongoose.Types.ObjectId;
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
      required: true
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

export const Message = mongoose.model<IMessage>("Message", MessageSchema);


