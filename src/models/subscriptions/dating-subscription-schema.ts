import mongoose, { Schema } from "mongoose";

export enum DatingSubscriptionPlan {
  FREE = "FREE",
  BASIC = "BASIC",
  ELITE = "ELITE",
  PRESTIGE = "PRESTIGE"
}

const DatingSubscriptionSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'users',
      required: true,
      unique: true
    },
    plan: {
      type: String,
      enum: Object.values(DatingSubscriptionPlan),
      default: DatingSubscriptionPlan.FREE
    },
    price: {
      type: Number,
      default: 0
    },
    startDate: {
      type: Date,
      default: null
    },
    endDate: {
      type: Date,
      default: null
    },
    isActive: {
      type: Boolean,
      default: false
    },
    autoRenew: {
      type: Boolean,
      default: false
    },
    // We'll keep these IDs for reference but move payment details to Transaction model
    stripeCustomerId: {
      type: String,
      default: null
    },
    stripeSubscriptionId: {
      type: String,
      default: null
    },
    features: {
      dailyLikes: {
        type: Number,
        default: 10
      },
      superLikesPerDay: {
        type: Number,
        default: 0
      },
      boostsPerMonth: {
        type: Number,
        default: 0
      },
      seeWhoLikesYou: {
        type: Boolean,
        default: false
      },
      advancedFilters: {
        type: Boolean,
        default: false
      }
    }
  },
  {
    timestamps: true
  }
);

// Create indexes for efficient queries
DatingSubscriptionSchema.index({ user: 1 });
DatingSubscriptionSchema.index({ plan: 1 });
DatingSubscriptionSchema.index({ isActive: 1 });
DatingSubscriptionSchema.index({ stripeCustomerId: 1 });
DatingSubscriptionSchema.index({ stripeSubscriptionId: 1 });

export const DatingSubscription = mongoose.model("DatingSubscription", DatingSubscriptionSchema);



