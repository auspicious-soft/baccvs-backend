import mongoose, { Schema } from "mongoose";

const promotionPlanSchema = new Schema({
  title: { type: String, required: true },
  price: { type: Number, required: true },
  durationDays: { type: Number, required: true },
  priceInCents: { type: Number, required: true },
},{
  timestamps: true,
});

export const PromotionPlanModel = mongoose.model(
  "promotionPlan",
  promotionPlanSchema
);
