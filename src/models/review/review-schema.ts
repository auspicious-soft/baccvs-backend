import mongoose, { Schema } from "mongoose";

const reviewSchema = new Schema({
  professionalProfileId:{
    type: Schema.Types.ObjectId,
    ref: "professionalProfiles",
    required: true,
  },
  userId:{
    type: Schema.Types.ObjectId,
    ref: "users", 
    required: true,
  },
  rating:{
    type: Number,
    required: true,
    min: 1, 
    max: 5,
  },
  comment:{
    type: String,
    trim: true,
  },  
})
export const reviewModel = mongoose.model("reviews", reviewSchema);