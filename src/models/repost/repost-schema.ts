import mongoose, { Schema } from "mongoose";
import { PostVisibility } from "src/lib/constant";
const RepostSchema = new Schema(
  {
    user: { 
      type: Schema.Types.ObjectId,
       ref: "users",
        required: true 
      },
    originalPost: {
      type: Schema.Types.ObjectId,
      ref: "posts",
      required: true,
    },
    type: {
      type: String,
      enum: ["direct", "quote"], // direct = simple repost, quote = repost with comment      required: true
    },
    content: {
      type: String,
      trim: true,
      // Required only for quote reposts      validate: {
      validator: function (this: any, v: string) {
        return this.type !== "quote" || (v && v.length > 0);
      },
      message: "Content is required for quote reposts",
    },
  },
  { timestamps: true }
);
// Compound index to prevent duplicate reposts
RepostSchema.index({ user: 1, originalPost: 1 }, { unique: true });

export const RepostModel = mongoose.model("reposts", RepostSchema);
