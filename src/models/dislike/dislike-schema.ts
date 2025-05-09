import mongoose, { Schema, Document } from "mongoose";

const DislikeSchema = new Schema(
  {
    dislikeByUser: {
      type: Schema.Types.ObjectId,
      ref: "users",
      required: true,
    },
    dislikeToUser: {
      type: Schema.Types.ObjectId,
      ref: "users",
      required: true,
    },
  },
  { timestamps: true }
);

export const DislikeModel = mongoose.model("Dislike", DislikeSchema);