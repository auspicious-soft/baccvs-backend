import { Schema, model, Document, Types } from 'mongoose';

export enum NotificationType {
  USER_LIKE = 'USER_LIKE',
  USER_DISLIKE = 'USER_DISLIKE',
  SQUAD_LIKE = 'SQUAD_LIKE',
  SQUAD_MEMBER_ADDED = 'SQUAD_MEMBER_ADDED',
  SQUAD_MEMBER_REMOVED = 'SQUAD_MEMBER_REMOVED',
  SQUAD_JOIN = 'SQUAD_JOIN',
  SQUAD_LEAVE = 'SQUAD_LEAVE',
  SQUAD_OWNERSHIP_TRANSFER = 'SQUAD_OWNERSHIP_TRANSFER',
  SQUAD_MATCH = 'SQUAD_MATCH',
  SQUAD_UNMATCH = 'SQUAD_UNMATCH',
}

export interface INotification extends Document {
  recipient: Types.ObjectId;
  sender: Types.ObjectId;
  type: NotificationType;
  message: string;
  isRead: boolean;
  relatedUser?: Types.ObjectId;
  relatedSquad?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const notificationSchema = new Schema<INotification>(
  {
    recipient: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    sender: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    type: {
      type: String,
      enum: Object.values(NotificationType),
      required: true,
    },
    message: {
      type: String,
      required: true,
    },
    isRead: {
      type: Boolean,
      default: false,
    },
    relatedUser: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    relatedSquad: {
      type: Schema.Types.ObjectId,
      ref: 'Squad',
    },
  },
  {
    timestamps: true,
  }
);

export const Notification = model<INotification>('Notification', notificationSchema);