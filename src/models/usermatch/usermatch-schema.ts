import mongoose, { Schema } from "mongoose";

const UserMatchSchema = new Schema(
  {
    // User who performed the action (liking/disliking)
    fromUser: {
      type: Schema.Types.ObjectId,
      ref: 'users',
      required: true
    },
    // User who is the target of the action
    toUser: {
      type: Schema.Types.ObjectId,
      ref: 'users',
      required: true
    },
    // Type of interaction: 'like' or 'dislike'
    type: {
      type: String,
      enum: ["like", "dislike"],
      required: true
    },
    // Subtype of like: null (regular), 'superlike', or 'boost'
    subType: {
      type: String,
      enum: [null, "superlike", "boost"],
      default: null
    },
    // Whether there's a mutual match (both users liked each other)
    isMatch: {
      type: Boolean,
      default: false
    },
    // When the match was created (if applicable)
    matchedAt: {
      type: Date,
      default: null
    }
  },
  { 
    timestamps: true 
  }
);

// Compound index to prevent duplicate interactions of same type
UserMatchSchema.index(
  { fromUser: 1, toUser: 1 }, 
  { unique: true }
);

// Index for fast lookups by target user
UserMatchSchema.index({ toUser: 1, type: 1 });

// Index for fast lookups by source user
UserMatchSchema.index({ fromUser: 1, type: 1 });

// Index for fast lookups of matches
UserMatchSchema.index({ fromUser: 1, isMatch: 1 });
UserMatchSchema.index({ toUser: 1, isMatch: 1 });

// Index for expired items
UserMatchSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const UserMatch = mongoose.model("UserMatch", UserMatchSchema);