import mongoose, { Schema, Document } from "mongoose";

export interface ILikeProduct extends Document {
  title: string;
  credits: number;
  price: number;
  interval: "month" | "year";
  stripeProductId?: string;
  stripePriceId?: string;
  type: "like" | "superlike" | "boost";
}

const LikeProductSchema = new Schema<ILikeProduct>(
  {
    title: { type: String, required: true },
    credits: { type: mongoose.Schema.Types.Mixed, required: true },
    price: { type: Number, required: true }, // in USD
    interval: { type: String, enum: ["month", "year"], default: "month" },
    stripeProductId: { type: String },
    stripePriceId: { type: String },
    type: {
      type: String,
      enum: ["like", "superlike", "boost"],
      required: true,
    },
  },
  { timestamps: true },
);

export const LikeProductsModel = mongoose.model(
  "likeProduct",
  LikeProductSchema,
);
