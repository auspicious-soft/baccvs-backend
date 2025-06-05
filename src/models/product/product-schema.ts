import mongoose, { Schema } from "mongoose";

// Define the price schema as a nested schema
const PriceSchema = new Schema({
  priceId: {
    type: String,
    required: true,
    unique: true
  },
  currency: {
    type: String,
    required: true,
    default: "usd"
  },
  unitAmount: {
    type: Number,
    required: true
  },
  formattedAmount: {
    type: String
  },
  recurring: {
    interval: {
      type: String,
      enum: ["day", "week", "month", "year"],
      default: "month"
    },
    intervalCount: {
      type: Number,
      default: 1
    }
  },
  active: {
    type: Boolean,
    default: true
  },
  createdAt: {
    type: Date
  },
  updatedAt: {
    type: Date
  }
}, { _id: false });

// Define the product schema
const ProductSchema = new Schema(
  {
    productId: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    name: {
      type: String,
      required: true
    },
    description: {
      type: String
    },
    planType: {
      type: String,
      required: true,
      index: true
    },
    category: {
      type: String,
      default: "subscription",
      index: true
    },
    defaultPrice: {
      type: PriceSchema,
      required: true
    },
    allPrices: [PriceSchema],
    features: {
      type: Schema.Types.Mixed,
      default: {}
    },
    images: [String],
    active: {
      type: Boolean,
      default: true,
      index: true
    },
    stripeCreatedAt: {
      type: Date
    },
    stripeUpdatedAt: {
      type: Date
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {}
    }
  },
  {
    timestamps: true
  }
);

// Create indexes for efficient queries
ProductSchema.index({ name: 1 });
ProductSchema.index({ "defaultPrice.unitAmount": 1 });
ProductSchema.index({ createdAt: -1 });

export const Product = mongoose.model("Product", ProductSchema);