import mongoose, { Schema, Document } from "mongoose";

export interface IReferralClick extends Document {
  code?: string;
  referralCode?: mongoose.Types.ObjectId;
  user?: mongoose.Types.ObjectId;
  ip?: string;
  userAgent?: string;
  createdAt?: Date;
}

const ReferralClickSchema: Schema = new Schema(
  {
    code: { type: String },
    referralCode: { type: Schema.Types.ObjectId, ref: "ReferralCode" },
    user: { type: Schema.Types.ObjectId, ref: "users" },
    ip: { type: String },
    userAgent: { type: String },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

export const ReferralClickModel = mongoose.model<IReferralClick>(
  "ReferralClick",
  ReferralClickSchema,
);
