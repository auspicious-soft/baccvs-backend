import mongoose, { Document, Schema } from "mongoose";

export interface IAdmin extends Document {
  firstName: string;
  lastName?: string;
  fullName?: string;
  email: string;
  password?: string;
  image?: string;
  role?: "ADMIN" | "SUPERADMIN" | "EMPLOYEE";
  roleAccess?: Array<
    | "full"
    | "Dashboard"
    | "Users"
    | "Event&Ticketing"
    | "Revenue&Financial"
    | "Referrals"
    | "Marketing&Promotions"
    | "Security&Compliance"
    | "Customer&Support"
    | "Loyalty&Gamification"
    | "Staffs"
    | "Settings"
  >;
  inviteStatus?: "INVITED" | "ACTIVE";
  phoneNumber?: number;
  eventNotification?: boolean;
  signUpNotification?: boolean;
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
      default: "",
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
    },
    phoneNumber: {
      type: Number,
      default:null,
    },
    role: {
      type: String,
      default: "SUPERADMIN",
      enum: ["ADMIN", "SUPERADMIN", "EMPLOYEE", "STAFF"],
    },
    roleAccess: {
      type: [String],
      default: ["full"],
      enum: [
        "full",
        "Dashboard",
        "Users",
        "Event&Ticketing",
        "Revenue&Financial",
        "Referrals",
        "Marketing&Promotions",
        "Security&Compliance",
        "Customer&Support",
        "Loyalty&Gamification",
        "Staffs",
        "Settings",
      ],
    },
    inviteStatus: {
      type: String,
      enum: ["INVITED", "ACTIVE"],
      default: "ACTIVE",
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
    signUpNotification: {
      type: Boolean,
      default: false,
    },
    complaintsNotification: {
      type: Boolean,
      default: false,
    },
    paymentsNotification: {
      type: Boolean,
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
