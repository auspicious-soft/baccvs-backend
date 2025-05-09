import mongoose from "mongoose";

const resaleSchema = new mongoose.Schema({
  originalPurchase: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'purchase',
    required: true
  },
  seller: {
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
  quantity: {
    type: Number,
    required: true,
    min: 1
  },
  price: {
    type: Number,
    required: true
  },
  status: {
    type: String,
    enum: ['available', 'sold', 'canceled'],
    default: 'available'
  },
  newPurchase: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'purchase',
    default: null
  },
  listedDate: {
    type: Date,
    default: Date.now
  },
  soldDate: {
    type: Date
  }
}, {
  timestamps: true
});

export const resellModel =  mongoose.model('resale', resaleSchema);