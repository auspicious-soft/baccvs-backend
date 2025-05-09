import mongoose, { Schema } from "mongoose";

const NotificationSchema = new Schema({
  recipient: {
    type: Schema.Types.ObjectId,
    ref: 'users',
    required: true,
    index: true
  },
  sender: {
    type: Schema.Types.ObjectId,
    ref: 'users',
    required: true
  },
  type: {
    type: String,
    enum: [
      'follow',
      'like',
      'comment',
      'mention',
      'event_invite',
      'event_reminder',
      'chat_message',
      'newsletter',
      'system'
    ],
    required: true
  },
  title: {
    type: String,
    required: true
  },
  message: {
    type: String,
    required: true
  },
  read: {
    type: Boolean,
    default: false
  },
  actionLink: {
    type: String
  },
  metadata: {
    type: Schema.Types.Mixed,
    default: {}
  },
  // Reference to related content based on notification type
  reference: {
    model: {
      type: String,
      enum: ['posts', 'comments', 'events', 'chats'],
      required: true
    },
    id: {
      type: Schema.Types.ObjectId,
      required: true
    }
  },
  expiresAt: {
    type: Date,
    default: () => new Date(+new Date() + 30*24*60*60*1000) // 30 days from now
  }
}, {
  timestamps: true
});

// Indexes
NotificationSchema.index({ recipient: 1, createdAt: -1 });
NotificationSchema.index({ recipient: 1, read: 1 });
NotificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // TTL index

// Methods
NotificationSchema.methods.markAsRead = async function() {
  this.read = true;
  await this.save();
};

NotificationSchema.statics.markAllAsRead = async function(userId) {
  return this.updateMany(
    { recipient: userId, read: false },
    { $set: { read: true } }
  );
};

NotificationSchema.statics.getUnreadCount = async function(userId) {
  return this.countDocuments({ recipient: userId, read: false });
};

export const NotificationModel = mongoose.model('Notification', NotificationSchema);