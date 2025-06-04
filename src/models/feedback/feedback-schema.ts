import mongoose from "mongoose";

const feedbackSchema = new mongoose.Schema({
  userId:{
    type:mongoose.Schema.Types.ObjectId,
    ref:"users",
  },
  subject:{
    type: String,
    enum:["issue","suggestion","experience","other"],
    required: true,
  },
  description: {
    type: String,
    required: true,
  }, 
  status: {
    type: String,
    enum: ["pending", "in progress", "resolved"],
    default: "pending",
  },
},{
  timestamps: true,
})

export const FeedbackModel = mongoose.model("Feedback", feedbackSchema);
