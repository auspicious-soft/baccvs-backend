import mongoose, { Schema, Document, Types } from "mongoose";

export enum SquadStatus {
  ACTIVE = "active",
  INACTIVE = "inactive",
  FULL = "full"
}

export enum InterestCategory {
  NIGHTLIFE_PARTIES = "Nightlife & Parties",
  LOCAL_HANGOUTS = "Local Hangouts",
  DATING_RELATIONSHIP = "Dating & Relationship",
  BOOK_CLUBS = "Book Clubs",
  GAME_NIGHTS = "Game Nights",
  MOVIE_TV_SHOWS = "Movie & TV Shows",
  FLIRTING = "Flirting",
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
    squadInterest:[{
      type: String,
      enum: Object.values(InterestCategory),
      default: []
    }],
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