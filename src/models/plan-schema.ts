import mongoose, { Schema, Document } from "mongoose";

// Supported languages
interface TranslatedText {
  en?: string;
  nl?: string;
  fr?: string;
  es?: string;
}

// Benefit structure based on the subscription tiers
interface BenefitObject {
  // Profile features
  seeWhoLikedProfile: boolean;
  
  // Super Likes
  superLikesPerDay: number;
  
  // Swipes
  unlimitedSwipes: boolean;
  
  // Visibility & Priority
  priorityVisibilityInMatches: boolean;
  
  // Messaging
  unlimitedMessagingWithMatches: boolean;
  
  // Profile boost
  profileBoostPerWeek?: number;
  
  // Events
  exclusiveAccessToEvents?: boolean;
  
  // Professional features
  directContactByOrganizers?: boolean;
  
  // Super Likes & Boosts
  unlimitedSuperLikesAndBoosts?: boolean;
  
  // Direct messaging
  directMessageWithoutMatching?: boolean;
  
  // VIP features
  vipInvitesToEvents?: boolean;
}

const BenefitObjectSchema = {
  seeWhoLikedProfile: { type: Boolean, default: false },
  superLikesPerDay: { type: Number, default: 0 },
  unlimitedSwipes: { type: Boolean, default: false },
  priorityVisibilityInMatches: { type: Boolean, default: false },
  unlimitedMessagingWithMatches: { type: Boolean, default: false },
  profileBoostPerWeek: { type: Number, default: 0 },
  exclusiveAccessToEvents: { type: Boolean, default: false },
  directContactByOrganizers: { type: Boolean, default: false },
  unlimitedSuperLikesAndBoosts: { type: Boolean, default: false },
  directMessageWithoutMatching: { type: Boolean, default: false },
  vipInvitesToEvents: { type: Boolean, default: false },
};

export interface IPlan extends Document {
  // Plan identification
  key: string; // 'basic', 'elite', 'prestige'
  name: TranslatedText;
  description: TranslatedText;
  // Features list (translated)
  features: TranslatedText[];
  // Platform-specific product IDs
  androidProductId: string;
  iosProductId: string; 
  unitAmounts: {
    usd: number; // Price in cents
  };
  // Display price (for UI)
  displayPrice: {
    usd: string; // e.g., "$8.99/month"
  };
  // Benefits
  benefits: BenefitObject;
  // Status
  isActive: boolean;
  isFeatured: boolean;
  sortOrder: number;
  // Metadata
  createdAt: Date;
  updatedAt: Date;
}

const PlanSchema = new Schema<IPlan>(
  {
    key: { 
      type: String, 
      required: true, 
      unique: true,
      enum: ['basic', 'elite', 'prestige'],
      index: true
    },
    name: { 
      type: Object, 
      required: true,
      default: {}
    },
    description: { 
      type: Object, 
      required: true,
      default: {}
    },
    features: [
      {
        en: { type: String },
      },
    ],
    // Platform product IDs
    androidProductId: { 
      type: String, 
      required: true,
      index: true
    },
    iosProductId: { 
      type: String, 
      required: true,
      index: true
    },  
    unitAmounts: {
      usd: { 
        type: Number, 
        required: true,
        min: 0
      },
    },   
    // Display prices with currency symbols
    displayPrice: {
      usd: { type: String, required: true },
    },   
    // Full subscription benefits
    benefits: { 
      type: BenefitObjectSchema, 
      required: true,
      default: {}
    },   
    // Status flags
    isActive: {
      type: Boolean,
      default: true,
      index: true
    },
    isFeatured: {
      type: Boolean,
      default: false
    },
    sortOrder: {
      type: Number,
      default: 0
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for efficient queries
PlanSchema.index({ isActive: 1, sortOrder: 1 });
PlanSchema.index({ key: 1, isActive: 1 });

export const PlanModel = mongoose.model<IPlan>("Plan", PlanSchema);
