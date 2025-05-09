import mongoose, { Schema } from "mongoose";
import { FollowRelationshipStatus } from "src/lib/constant";

interface IFollow extends Document {
  follower_id: mongoose.Types.ObjectId;
  following_id: mongoose.Types.ObjectId;
  relationship_status: FollowRelationshipStatus;
  is_approved: boolean;
  unfollowed_at: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const followSchema = new Schema({
  follower_id: { 
    type: Schema.Types.ObjectId, 
    ref: 'users', 
    required: true 
  },
  following_id: { 
    type: Schema.Types.ObjectId, 
    ref: 'users', 
    required: true 
  },
  relationship_status: {
    type: String,
    enum: Object.values(FollowRelationshipStatus),
    default: FollowRelationshipStatus.FOLLOWING
  },
  is_approved: {
    type: Boolean,
    default: false
  },
  unfollowed_at: {
    type: Date,
    default: null,
    // This makes it possible to set null
    required: false
  }
},{
  timestamps: true,
});

followSchema.index({ follower_id: 1, following_id: 1 }, { unique: true });

export const followModel = mongoose.model<IFollow>("follow", followSchema);
