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
        filename: { type: String },
        size: { type: Number },
        mimeType: { type: String },
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
    storyType: {
      type: String,
      enum: ['text', 'photo'],
      required: true,
    },
    textColor: {
      type: String,
      trim: true,
      // Example validation for hex color codes or color names
      match: /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$|^[a-zA-Z]+$/,
    },
    fontFamily: {
      type: String,
      trim: true,
    },
    textAlignment: {
      type: String,
      enum: ['left', 'center', 'right'],
    },
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

// Validation to ensure either content or media is present for appropriate storyType
StorySchema.pre('save', function (next) {
  if (this.storyType === 'text' && !this.content) {
    return next(new Error('Text content is required for text stories'));
  }
  if (this.storyType === 'photo' && !this.media) {
    return next(new Error('Media is required for photo stories'));
  }
  next();
});

export const storyModel = mongoose.model('Story', StorySchema);