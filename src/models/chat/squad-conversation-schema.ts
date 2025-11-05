import mongoose, { Schema, Document } from "mongoose";

export interface IMuteData {
  muted: boolean;
  muteExpiresAt?: Date | null;
  muteType?: "temporary" | "permanent" | null;
}

export interface IPermissions {
  onlyAdminsCanPost: boolean;
  allowMessageEditing: boolean;
  allowMediaSharing: boolean;
}

export interface ISquadConversation extends Document {
  squad: mongoose.Types.ObjectId;
  lastMessage?: mongoose.Types.ObjectId;
  isActive: boolean;
  isPinned: Map<string, boolean>;
  backgroundSettings: Map<string, { backgroundImage?: string; backgroundColor?: string }>;
  isMuted: Map<string, IMuteData>;
  permissions: IPermissions;
  createdAt: Date;
  updatedAt: Date;
}

const SquadConversationSchema = new Schema(
  {
    squad: {
      type: Schema.Types.ObjectId,
      ref: "Squad",
      required: true,
      unique: true
    },
    lastMessage: {
      type: Schema.Types.ObjectId,
      ref: "Message"
    },
    isActive: {
      type: Boolean,
      default: true
    },
    isPinned: {
      type: Map,
      of: Boolean,
      default: {}
    },
    isMuted: {
      type: Map,
      of: new Schema(
        {
          muted: { type: Boolean, default: false },
          muteExpiresAt: { type: Date, default: null },
          muteType: { type: String, enum: ["temporary", "permanent", null], default: null }
        },
        { _id: false }
      ),
      default: {}
    },
    backgroundSettings: {
      type: Map,
      of: new Schema(
        {
          backgroundImage: String,
          backgroundColor: String
        },
        { _id: false }
      ),
      default: {}
    },
    permissions: {
      onlyAdminsCanPost: { type: Boolean, default: false },
      allowMessageEditing: { type: Boolean, default: true },
      allowMediaSharing: { type: Boolean, default: true }
    }
  },
  { timestamps: true }
);

SquadConversationSchema.index({ squad: 1 });

export const SquadConversation = mongoose.model<ISquadConversation>(
  "SquadConversation",
  SquadConversationSchema
);