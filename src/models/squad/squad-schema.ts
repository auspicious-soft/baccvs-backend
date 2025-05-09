import mongoose, { Schema, Document, Types } from "mongoose";

export enum SquadVisibility {
  PUBLIC = "public",
  PRIVATE = "private",
  FRIENDS_ONLY = "friends_only"
}

export enum SquadStatus {
  ACTIVE = "active",
  INACTIVE = "inactive",
  FULL = "full"
}

const SquadSchema = new Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true
    },
    creator: {
      type: Schema.Types.ObjectId,
      ref: 'users',
      required: true
    },
    about: {
      type: String,
      trim: true
    },
    members: [{
      user: {
        type: Schema.Types.ObjectId,
        ref: 'users'
      },
      role: {
        type: String,
        enum: ["admin", "member"],
        default: "member"
      },
      joinedAt: {
        type: Date,
        default: Date.now
      }
    }],
    maxMembers: {
      type: Number,
      default: 4,
      min: 2,
      max: 4
    },
    status: {
      type: String,
      enum: Object.values(SquadStatus),
      default: SquadStatus.ACTIVE
    },
    media: [{
      type: String
    }],
    invitationCode: {
      type: String,
      unique: true
    },
    matchedSquads: [{
      squad: {
        type: Schema.Types.ObjectId,
        ref: 'Squad'
      },
      matchedAt: {
        type: Date,
        default: Date.now
      }
    }]
  },
  {
    timestamps: true
  }
);

// Indexes
SquadSchema.index({ location: '2dsphere' });
SquadSchema.index({ creator: 1 });
SquadSchema.index({ "members.user": 1 });
SquadSchema.index({ invitationCode: 1 });

// Auto-generate invitation code
SquadSchema.pre('save', function(next) {
  if (this.isNew && !this.invitationCode) {
    // Generate a random 6-character alphanumeric code
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    this.invitationCode = code;
  }
  next();
});

// Update status based on member count
SquadSchema.pre('save', function(next) {
  if (this.members.length >= this.maxMembers) {
    this.status = SquadStatus.FULL;
  } else if (this.status === SquadStatus.FULL && this.members.length < this.maxMembers) {
    this.status = SquadStatus.ACTIVE;
  }
  next();
});

export const Squad = mongoose.model("Squad", SquadSchema);