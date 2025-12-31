import mongoose, { Schema, Document } from "mongoose";

export interface IAdminChangeRequest extends Document {
  adminId: mongoose.Types.ObjectId;

  type: "EMAIL" | "PHONE";
  purpose: "CHANGE_EMAIL" | "CHANGE_PHONE";

  oldValue: string;
  newValue: string;

  isVerified: boolean;
  expiresAt: Date;

  createdAt: Date;
  updatedAt: Date;
}

const adminChangeRequestSchema = new Schema<IAdminChangeRequest>(
  {
    adminId: {
      type: Schema.Types.ObjectId,
      ref: "admin",
      required: true,
      index: true,
    },

    type: {
      type: String,
      enum: ["EMAIL", "PHONE"],
      required: true,
    },

    purpose: {
      type: String,
      enum: ["CHANGE_EMAIL", "CHANGE_PHONE"],
      required: true,
    },

    oldValue: {
      type: String,
      required: true,
    },

    newValue: {
      type: String,
      required: true,
    },

    isVerified: {
      type: Boolean,
      default: false,
    },

    expiresAt: {
      type: Date,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

adminChangeRequestSchema.index(
  { expiresAt: 1 },
  { expireAfterSeconds: 0 }
);

adminChangeRequestSchema.index(
  { adminId: 1, isVerified: 1 },
  { unique: true, partialFilterExpression: { isVerified: false } }
);

export const AdminChangeRequestModel = mongoose.model<IAdminChangeRequest>(
  "admin_change_request",
  adminChangeRequestSchema
);
