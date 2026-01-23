import { Schema, Document, model, Types } from "mongoose";

export interface ITransaction extends Document {
  //stripe
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  invoiceId: string;
  billingReason: string;
  errorMessage?: string;
  paymentMethodDetails: {
    brand: string;
    last4: string;
    expMonth: number;
    expYear: number;
    type: string;
  };
  metadata?: Record<string, any>;
  //stripe

  userId: Types.ObjectId;
  planId: Types.ObjectId | string;
  paymentIntentId?: string;
  orderId: string;
  status: "succeeded" | "failed" | "pending";
  amount: number;
  currency: string;
  paidAt: Date;
  environment: "Production" | "Sandbox" | "Xcode";
}

const transactionSchema = new Schema<ITransaction>(
  {
    //stripe
    stripeCustomerId: { type: String },
    stripeSubscriptionId: { type: String },
    invoiceId: { type: String },
    paymentMethodDetails: {
      brand: { type: String },
      last4: { type: String },
      expMonth: { type: Number },
      expYear: { type: Number },
      type: { type: String }, // e.g. "card"
    },
    billingReason: { type: String }, // e.g. "subscription_create", "subscription_cycle"
    errorMessage: { type: String, default: null },
    metadata: { type: Schema.Types.Mixed }, // optional custom info
    //stripe

    userId: { type: Schema.Types.ObjectId, ref: "user" },
    planId: { type: Schema.Types.ObjectId, ref: "plan" },
    status: {
      type: String,
      enum: ["succeeded", "failed", "pending"],
    },
    orderId: { type: String },
    amount: { type: Number },
    currency: { type: String },
    paidAt: { type: Date },
    environment: {
      type: String,
      enum: ["Production", "Sandbox", "Xcode"],
      default: "Production",
    },
  },
  { timestamps: true }
);

export const TransactionModel = model<ITransaction>(
  "subscriptionTransaction",
  transactionSchema
);
