import mongoose, { Schema, Document, Model } from 'mongoose';

// Define interfaces for proper typing
interface IComment extends Document {
  post?: mongoose.Types.ObjectId;
  repost?: mongoose.Types.ObjectId;
  user: mongoose.Types.ObjectId;
  parentComment: mongoose.Types.ObjectId | null;
  type: 'text' | 'audio';
  text?: string;
  audioUrl?: string;
  isDeleted: boolean;
  likes: mongoose.Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
  getReplies(): Promise<IComment[]>;
}

// Interface for the static methods
interface ICommentModel extends Model<IComment> {
  findWithReplies(commentId: string): Promise<{
    comment: IComment | null;
    replies: IComment[];
  }>;
}

const CommentSchema = new Schema(
  {
    // Either post or repost must be provided, but not both
    post: {
      type: Schema.Types.ObjectId,
      ref: 'posts',
      required: function(this: any) {
        return !this.repost;
      }
    },
    repost: {
      type: Schema.Types.ObjectId,
      ref: 'reposts',
      required: function(this: any) {
        return !this.post;
      }
    },
    event: {
      type: Schema.Types.ObjectId,
      ref: 'event',
      required: function(this: any) {
        return !this.post;
      }
    },
    user: {
      type: Schema.Types.ObjectId,
      ref: 'users',
      required: true
    },
    parentComment: {
      type: Schema.Types.ObjectId,
      ref: 'comments',
      default: null
    },
    type: {
      type: String,
      enum: ["text", "audio"],
      required: true
    },
    text: {
      type: String,
      trim: true
    },
    audioUrl: {
      type: String
    },
    isDeleted: {
      type: Boolean,
      default: false
    },
  },
  {
    timestamps: true
  }
);

// Validate that either post or repost is provided, but not both
CommentSchema.pre('validate', function (next) {
  const targets = [this.post, this.repost, this.event].filter(Boolean).length;
  if (targets > 1) {
    return next(new Error('Comment can only be associated with one of post, repost, or event'));
  }
  if (targets === 0) {
    return next(new Error('Comment must be associated with a post, repost, or event'));
  }
  next();
});

CommentSchema.pre('save', function(next) {
  if (this.type === "text" && !this.text) {
    const error = new Error('Text is required for text comments');
    return next(error);
  }
  if (this.type === "audio" && !this.audioUrl) {
    const error = new Error('Audio URL is required for audio comments');
    return next(error);
  }
  next();
});

// Add methods to fetch replies
CommentSchema.methods.getReplies = async function(this: IComment) {
  return await mongoose.model<IComment, ICommentModel>('comments').find({ 
    parentComment: this._id,
    isDeleted: false 
  }).sort({ createdAt: 1 });
};

// Add static methods for common operations
CommentSchema.statics.findWithReplies = async function(commentId: string) {
  const comment = await this.findById(commentId).populate('user', 'username avatar');
  if (comment && !comment.parentComment) {
    const replies = await this.find({ 
      parentComment: comment._id,
      isDeleted: false 
    }).populate('user', 'username avatar').sort({ createdAt: 1 });
    return { comment, replies };
  }
  return { comment, replies: [] };
};

// Add a compound index to ensure a comment is either for a post or a repost
CommentSchema.index({ post: 1, repost: 1, event: 1 }, { sparse: true, unique: false });

export const Comment = mongoose.model<IComment, ICommentModel>('comments', CommentSchema);
