import mongoose from "mongoose";

const resaleSchema = new mongoose.Schema({
  originalPurchase: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'purchase',
    required: true
  },
  quantity: {
    type: Number,
    required: true,
    min: 1
  },
  availableQuantity: {
    type: Number,
    required: true,
    min: 0
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
  newPurchase: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'purchase',
    default: null
  }],
  listedDate: {
    type: Date,
    default: Date.now
  },
  soldDate: {
    type: Date
  },
  canceledDate: {
    type: Date
  },
  buyers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'users',
    required: true
  }],
}, {
  timestamps: true
});

export const resellModel =  mongoose.model('resale', resaleSchema);