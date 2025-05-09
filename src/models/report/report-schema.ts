import mongoose, {Schema} from 'mongoose';

export enum ReportReason {
  INAPPROPRIATE = 'inappropriate',
  SPAM = 'spam',
  HARASSMENT = 'harassment',
  FAKE_PROFILE = 'false_information',
  HATE_SPEECH = 'impersonation',
  OTHER = 'other'
}

export enum ReportStatus {
  PENDING = 'pending',
  REVIEWING = 'reviewing',
  RESOLVED = 'resolved',
  DISMISSED = 'dismissed'
}

const ReportSchema = new Schema(
  {
    reporter: {
      type: Schema.Types.ObjectId,
      ref: 'users',
      required: true
    },
    targetType: {
      type: String,
      enum: ["posts", "comments"],
      required: true
    },
    target: {
      type: Schema.Types.ObjectId,
      required: true,
      refPath: 'targetType'
    },
    reason: {
      type: String,
      enum: Object.values(ReportReason),
      required: true
    },
    details: {
      type: String,
      trim: true
    },
    status: {
      type: String,
      enum: Object.values(ReportStatus),
      default: ReportStatus.PENDING
    },
    adminNotes: {
      type: String,
      trim: true
    },
    resolvedAt: {
      type: Date
    }
  },
  {
    timestamps: true
  }
);

export const reportModel = mongoose.model('Report',ReportSchema)