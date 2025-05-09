import mongoose, { Schema, Document } from "mongoose";
import { nanoid } from "nanoid";



const ReferralCodeSchema = new Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      default: () => nanoid(6),
    },
    codeCreatedBy: {
      type: Schema.Types.ObjectId,
      ref: "users",
      required: true,
    },
    used: {
      type: Boolean,
      default: false,
    },
    referredUser: {
      type: Schema.Types.ObjectId,
      ref: "users",
      default: null,
    },
  },
  { timestamps: true }
);

export const ReferralCodeModel = mongoose.model("ReferralCode", ReferralCodeSchema);