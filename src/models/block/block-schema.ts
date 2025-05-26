import mongoose, { Schema } from "mongoose";

const blockSchema = new Schema(
  {
    blockedBy: {
      type: Schema.Types.ObjectId,
      ref: 'users',
      required: true
    },
    blockedUser: {
      type: Schema.Types.ObjectId,
      ref: 'users',
      required: true
    }
  },
  { 
    timestamps: true 
  }
);

// Compound index to prevent duplicate blocks
blockSchema.index({ blockedBy: 1, blockedUser: 1 }, { unique: true });

export const BlockModel = mongoose.model("Block", blockSchema);
