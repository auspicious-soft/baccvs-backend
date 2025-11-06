import mongoose, { Schema, Document } from "mongoose";

export interface ICommunityConversation extends Document {
  community: mongoose.Types.ObjectId;
  lastMessage: mongoose.Types.ObjectId;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  isPinned: Map<string, boolean>;
  backgroundSettings: Map<
    string,
    { backgroundImage: string | null; backgroundColor: string |null;staticBackgroundImage:string | null}
  >;
}

const CommunityConversationSchema = new Schema(
  {
    community: {
      type: Schema.Types.ObjectId,
      ref: "Community",
      required: true,
      unique: true,
    },
    lastMessage: {
      type: Schema.Types.ObjectId,
      ref: "Message",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    isPinned: {
      type: Map,
      of: Boolean,
      default: {}, // Map of userId -> isPinned
    },
    backgroundSettings: {
      type: Map,
      of: new Schema(
        {
          backgroundImage: String,
          backgroundColor: String,
          staticBackgroundImage:String
        },
        { _id: false }
      ),
      default: {}, // Map of userId -> background settings
    },
    isMuted: {
      type: Map,
      of: new Schema(
        {
          muted: { type: Boolean, default: false },
          muteExpiresAt: { type: Date, default: null },
          muteType: {
            type: String,
            enum: ["temporary", "permanent", null],
            default: null,
          },
        },
        { _id: false }
      ),
      default: {},
    },
    permissions: {
      onlyAdminsCanPost: { type: Boolean, default: false },
      allowMessageEditing: { type: Boolean, default: true },
      allowMediaSharing: { type: Boolean, default: true },
    },
  },
  {
    timestamps: true,
  }
);

// Create an index on community ID for efficient lookups
CommunityConversationSchema.index({ community: 1 });

export const CommunityConversation = mongoose.model<ICommunityConversation>(
  "CommunityConversation",
  CommunityConversationSchema
);
