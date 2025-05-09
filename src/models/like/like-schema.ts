import mongoose, { Schema } from "mongoose";

const LikeSchema = new Schema(
  {
    user: {
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
    }
  },
  { 
    timestamps: true 
  }
);

// Compound index to prevent duplicate likes
LikeSchema.index({ user: 1, targetType: 1, target: 1 }, { unique: true });

export const LikeModel = mongoose.model("Like", LikeSchema);
