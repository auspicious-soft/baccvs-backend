import mongoose from "mongoose";

const ticketSchema = new mongoose.Schema({
  event: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'event',
    required: true
  },
  name: {
    type: String,
    required: true
  },
  quantity: {
    type: Number,
    required: true
  },
  available: {
    type: Number,
    required: true
  },
  price: { 
    type: Number,
    default: 0
  },
  benefits: [{
    type: String
  }],
  isResellable: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

export const ticketModel =   mongoose.model('ticket', ticketSchema);