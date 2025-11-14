import mongoose from "mongoose";

const transferSchema = new mongoose.Schema({
  originalPurchase: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'purchase',
    required: true
  },
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'users',
    required: true
  },
  receiver: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'users',
    required: true
  },
  event: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'event',
    required: true
  },
  ticket: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ticket',
    required: true
  },
  transferType: {
    type: String,
    enum: ['all', 'quantity'],
    default: 'all'
  },
  quantity: {
    type: Number,
    required: true,
    min: 1
  },
  newPurchase: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'purchase',
    default: null
  },
  status: {
    type: String,
    enum: ['pending', 'accepted', 'rejected', 'completed'],
    default: 'pending'
  },
  transferredDate: {
    type: Date,
    default: Date.now
  },
  completedDate: {
    type: Date
  }
}, {
  timestamps: true
});

export const transferModel = mongoose.model('transfer', transferSchema);