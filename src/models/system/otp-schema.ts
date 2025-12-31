import mongoose, { Document, Schema } from "mongoose";

export interface IOtp extends Document {
  email?: string;
  phone?: string;
  code: string;
  type: "EMAIL" | "PHONE";
  userType: "USER" | "ADMIN"
  purpose?: string
  expiresAt: Date;
  createdAt: Date;
}

const otpSchema = new Schema<IOtp>(
  {
    email: {
      type: String,
      required: function () {
        return this.type === "EMAIL";
      },
    },
    phone: {
      type: String,
      required: function () {
        return this.type === "PHONE";
      },
    },
    code: {
      type: String,
      required: true,
    },
    purpose: {
      type: String,
      enum:["SIGNUP", "FORGOT_PASSWORD","RESEND", "VERIFY_PHONE", "VERIFY_EMAIL"],
      default:"SIGNUP"
    },
    userType:{
      type: String,
      enum: ["USER", "ADMIN"],
      default: "USER"
    },
    type: {
      type: String,
      enum: ["EMAIL", "PHONE"],
      required: true,
    },
    expiresAt: {
      type: Date,
      required: true,
      default: () => new Date(Date.now() + 20 * 60 * 1000), // 2 minutes from now
    },
  },
  {
    timestamps: true,
  }
);

otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const OtpModel = mongoose.model<IOtp>("otp", otpSchema);
