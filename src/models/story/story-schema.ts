import mongoose, { Schema } from 'mongoose';
import { PostVisibility } from 'src/lib/constant';

const StorySchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'users',
      required: true,
    },
    content: {
      type: String,
      trim: true,
    },
    media: {
      type: {
        url: { type: String },
        mediaType: { type: String, enum: ['image', 'video'], default: 'image' },
      },
    },
    taggedUsers: [
      {
        type: Schema.Types.ObjectId,
        ref: 'users',
      },
    ],
    visibility: {
      type: String,
      enum: Object.values(PostVisibility),
      default: PostVisibility.FOLLOWERS,
      required: true,
    },
    viewedBy: [
      {
        type: Schema.Types.ObjectId,
        ref: 'users',
      },
    ],
    expiresAt: {
      type: Date,
      required: true,
      default: function () {
        const now = new Date();
        return new Date(now.setHours(now.getHours() + 24));
      },
    },
  },
  {
    timestamps: true,
  }
);

// Validation to ensure either content or media is present
StorySchema.pre('save', function (next) {
  if (!this.content && !this.media) {
    const error = new Error('Story must have either text content or media');
    return next(error);
  }
 
  next();
});

export const storyModel = mongoose.model('Story', StorySchema);