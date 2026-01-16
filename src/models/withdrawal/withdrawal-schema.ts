import mongoose, { Schema } from "mongoose";

const WithdrawalSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: "users", required: true },
    stripeAccountId: { type: String },
    amount: { type: Number, required: true },
    currency: { type: String, default: "usd" },
    status: {
      type: String,
      enum: ["pending", "completed", "failed"],
      default: "pending",
    },
    meta: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

export const withdrawalModel = mongoose.model("withdrawals", WithdrawalSchema);
