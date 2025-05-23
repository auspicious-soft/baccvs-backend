import mongoose, { Schema } from "mongoose";

export enum TransactionType {
  DATING_SUBSCRIPTION = "DATING_SUBSCRIPTION",
  EVENT_TICKET = "EVENT_TICKET",
  TICKET_RESALE = "TICKET_RESALE",
  EVENT_PROMOTION = "EVENT_PROMOTION",
  BOOST_PURCHASE = "BOOST_PURCHASE",
  SUPERLIKE_PURCHASE = "SUPERLIKE_PURCHASE"
}

export enum TransactionStatus {
  PENDING = "PENDING",
  SUCCESS = "SUCCESS",
  FAILED = "FAILED",
  REFUNDED = "REFUNDED",
  CANCELLED = "CANCELLED"
}

const TransactionSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'users',
      required: true,
      index: true
    },
    type: {
      type: String,
      enum: Object.values(TransactionType),
      required: true,
      index: true
    },
    amount: {
      type: Number,
      required: true
    },
    currency: {
      type: String,
      default: "USD"
    },
    status: {
      type: String,
      enum: Object.values(TransactionStatus),
      default: TransactionStatus.PENDING,
      index: true
    },
    // Reference to the related entity based on transaction type
    reference: {
      model: {
        type: String,
        enum: ['DatingSubscription', 'purchase', 'resale', 'promotion'],
        required: true
      },
      id: {
        type: Schema.Types.ObjectId,
        required: true
      }
    },
    // Stripe-specific fields
    stripePaymentIntentId: {
      type: String,
      sparse: true,
      index: true
    },
    stripeCustomerId: {
      type: String,
      sparse: true,
      index: true
    },
    stripeSubscriptionId: {
      type: String,
      sparse: true,
      index: true
    },
    stripeInvoiceId: {
      type: String,
      sparse: true
    },
    stripeSessionId: {
      type: String,
      sparse: true
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {}
    }
  },
  {
    timestamps: true
  }
);

// Create indexes for efficient queries
TransactionSchema.index({ createdAt: -1 });
TransactionSchema.index({ user: 1, type: 1 });
TransactionSchema.index({ user: 1, createdAt: -1 });

export const Transaction = mongoose.model("Transaction", TransactionSchema);