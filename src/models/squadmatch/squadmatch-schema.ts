import mongoose, { Schema } from "mongoose";

const SquadMatchSchema = new Schema(
  {
    // User who performed the action (liking/disliking)
    fromUser: {
      type: Schema.Types.ObjectId,
      ref: 'users',
      required: true
    },
    // Squad that is the target of the action
    toSquad: {
      type: Schema.Types.ObjectId,
      ref: 'Squad',
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
    // Whether there's a mutual match (user liked squad and squad admin approved)
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
SquadMatchSchema.index(
  { fromUser: 1, toSquad: 1 }, 
  { unique: true }
);

// Index for fast lookups by target squad
SquadMatchSchema.index({ toSquad: 1, type: 1 });

// Index for fast lookups by source user
SquadMatchSchema.index({ fromUser: 1, type: 1 });

// Index for fast lookups of matches
SquadMatchSchema.index({ fromUser: 1, isMatch: 1 });
SquadMatchSchema.index({ toSquad: 1, isMatch: 1 });

export const SquadMatch = mongoose.model("SquadMatch", SquadMatchSchema);