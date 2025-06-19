import mongoose from "mongoose";

const purchaseSchema = new mongoose.Schema({
  ticket: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ticket',
    required: true
  },
  event: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'event',
    required: true
  },
  buyer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'users',
    required: true
  },
  quantity: {
    type: Number,
    required: true,
    min: 1
  },
  totalPrice: {
    type: Number,
    required: true
  },
  qrCode: {
    type: String,
    required: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  isResale: {
    type: Boolean,
    default: false
  },
  status: {
    type: String,
    enum: ['active', 'used', 'transferred', 'refunded', 'disabled','pending'],
    default: 'active'
  },
  purchaseDate: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

export const purchaseModel =  mongoose.model('purchase', purchaseSchema);