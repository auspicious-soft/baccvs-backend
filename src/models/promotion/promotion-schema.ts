import mongoose, { Schema } from "mongoose";
import { MusicType, VenueType } from "src/lib/constant";

const promotionSchema = new Schema({
  user: {
    type: Schema.Types.ObjectId,
    ref: 'professionalProfiles',
    required: true,
  },
  customNotification:{
    type: String,
    required: true,
  },
  date:{
    type: Date,
    required: true,
  },
  time:{
    type: String,
    required: true,
  },
  priorityPlacement:{
    type: String,
    enum: ["topBanner", "Event"],
    required: true,
  },
  price:{
    type: Number,
    required: true,
  },
  genderToReach:{
    type: String,
    enum: ["male", "female","everyone"],
    required: true,
  },
  ageRange: {
    min: {
      type: Number,
      required: true,
      min: 18,
      default: 18
    },
    max: {
      type: Number,
      required: true,
      max: 65,
      default: 65
    }
  },
  preferences: {
    musicTypes: [
      {
        type: String,
        enum: Object.values(MusicType),
      },
    ],
    venueTypes: [
      {
        type: String,
        enum: Object.values(VenueType),
      },
    ],
  },
  preferredEventTime:[{
    type: String,
    enum: ["Weekends", "During the week", "Afternoon", "Night"],
    required: true,
  }],
  Subscription:{
    type: String,
    enum: ["Basic", "Elite", "Prestige"],
    required: true,
  },
  status:{
    type: String,
    enum: ["active", "inactive"],
    default: "active",
  },
  customTags:[{
    type: String,
  }]
})

export const promotionModel = mongoose.model('promotion', promotionSchema)