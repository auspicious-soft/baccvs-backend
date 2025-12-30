import mongoose, {Schema } from 'mongoose';
import { PostVisibility } from 'src/lib/constant';

const PostSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'users',
      required: true
    },
    content: {
      type: String,
      trim: true
    },
    photos: [{
      type: String,
      default: []
    }],
    taggedUsers: [{
      type: Schema.Types.ObjectId,
      ref: 'users'
    }],
    visibility: {
      type: String,
      enum: Object.values(PostVisibility),
      default: PostVisibility.FOLLOWERS
    },
    isAutoPost: {
      type: Boolean,
      default: false
    }
  },
  {
    timestamps: true
  }
);

export const postModels = mongoose.model("posts",PostSchema)