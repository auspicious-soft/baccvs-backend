import mongoose, { Schema } from "mongoose";

const bookProfessionalSchema = new Schema(
  {
    professionalId: {
      type: Schema.Types.ObjectId,
      ref: "professionalProfiles",
      required: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "users",
      required: true,
    },
    professionalPackage: {
      packageId: {
        type: Schema.Types.ObjectId,
        required: true,
      },
      title: {
        type: String,
        required: true,
      },
      price: {
        type: Number,
        required: true,
      },
      duration: {
        type: Number,
        required: true,
      },
    },
    status: {
      type: String,
      enum: ["pending", "confirmed", "cancelled", "completed"],
      default: "pending",
    },
    paymentStatusToProfessional: {
      type: String,
      enum: ["pending", "paid", "failed"],
      default: "pending",
    },
    paymentStatusFromUser: {
      type: String,
      enum: ["pending", "paid", "failed"],
      default: "pending",
    },
    eventId: {
      type: Schema.Types.ObjectId,
      ref: "event",
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

export const BookProfessionalModel = mongoose.model(
  "bookProfessional",
  bookProfessionalSchema
);
