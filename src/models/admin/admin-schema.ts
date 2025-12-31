import mongoose, { Document, Schema } from "mongoose";

export interface IAdmin extends Document {
  firstName: string;
  lastName: string;
  fullName?: string;
  email: string;
  password?: string;
  image?: string;
  role?: "ADMIN" | "SUPERADMIN" | "EMPLOYEE";
  roleAccess?:
    | "full"
    | "users"
    | "event-tickets"
    | "revenue-financial"
    | "referrals"
    | "marketing-promptions"
    | "security-compliance"
    | "customer-support"
    | "loyalty-gamification";
  phoneNumber: number;
  eventNotification?: boolean;
  signUpNptification?: boolean;
  complaintsNotification?: boolean;
  paymentsNotification?: boolean;
  twoFA?: "SMS" | "EMAIL" | null;
  authType?: "EMAIL";
  isDeleted?: boolean;
  isBlocked?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

const adminSchema = new Schema<IAdmin>(
  {
    firstName: {
      type: String,
      required: true,
      trim: true,
    },
    lastName: {
      type: String,
      required: true,
      trim: true,
    },
    fullName: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
    },
    password: {
      type: String,
      required: true,
    },
    phoneNumber: {
      type: Number,
      required: true,
      unique: true,
    },
    role: {
      type: String,
      default: "SUPERADMIN",
      enum: ["ADMIN", "SUPERADMIN", "EMPLOYEE", "STAFF"],
    },
    roleAccess: {
      type: String,
      default: "full",
      enum: [
        "full",
        "users",
        "event-tickets",
        "revenue-financial",
        "referrals",
        "marketing-promptions",
        "security-compliance",
        "customer-support",
        "loyalty-gamification",
      ],
    },
    image: {
      type: String,
      default: "",
    },
    twoFA: {
      type: String,
      default: null,
      enum: ["SMS", "EMAIL", null],
    },
    authType: {
      type: String,
      default: "EMAIL",
    },
    eventNotification: {
      type: Boolean,
      default: false,
    },
    signUpNptification: {
      type: String,
      default: false,
    },
    complaintsNotification: {
      type: String,
      default: false,
    },
    paymentsNotification: {
      type: String,
      default: false,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
    isBlocked: {
      type: Boolean,
      default: false,
    },
  },

  { timestamps: true }
);

export const AdminModel = mongoose.model<IAdmin>("admin", adminSchema);
