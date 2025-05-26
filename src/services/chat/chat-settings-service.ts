import { Request, Response } from "express";
import { Conversation } from "../../models/chat/conversation-schema";
import { SquadConversation } from "../../models/chat/squad-conversation-schema";
import { CommunityConversation } from "../../models/chat/community-conversation-schema";
import { httpStatusCode } from "../../lib/constant";
import { errorResponseHandler } from "../../lib/errors/error-response-handler";
import mongoose from "mongoose";

// Toggle pin status for a direct conversation
export const togglePinDirectConversationService = async (req: any, res: Response) => {
  const userId = req.user.id;
  const { conversationId } = req.params;

  try {
    // Check if conversation exists and user is a participant
    const conversation = await Conversation.findOne({
      _id: conversationId,
      participants: userId,
      isActive: true
    });

    if (!conversation) {
      return errorResponseHandler(
        "Conversation not found or you're not a participant",
        httpStatusCode.NOT_FOUND,
        res
      );
    }

    // Toggle pin status for this user
    const isPinned = conversation.isPinned.get(userId) || false;
    conversation.isPinned.set(userId, !isPinned);
    await conversation.save();

    return {
      success: true,
      message: "Pin status updated successfully",
      isPinned: !isPinned
    };
  } catch (error) {
    console.error("Error toggling pin status:", error);
    return errorResponseHandler(
      "Failed to update pin status",
      httpStatusCode.INTERNAL_SERVER_ERROR,
      res
    );
  }
};

// Toggle pin status for a squad conversation
export const togglePinSquadConversationService = async (req: any, res: Response) => {
  const userId = req.user.id;
  const { squadConversationId } = req.params;

  try {
    const squadConversation = await SquadConversation.findById(squadConversationId);
    
    if (!squadConversation) {
      return errorResponseHandler(
        "Squad conversation not found",
        httpStatusCode.NOT_FOUND,
        res
      );
    }

    // Check if user is a member of the squad
    const squad = await mongoose.model('Squad').findOne({
      _id: squadConversation.squad,
      "members.user": userId
    });

    if (!squad) {
      return errorResponseHandler(
        "You are not a member of this squad",
        httpStatusCode.FORBIDDEN,
        res
      );
    }

    // Toggle pin status for this user
    const isPinned = (squadConversation as any).isPinned?.get(userId) || false;
    (squadConversation as any).isPinned?.set(userId, !isPinned);
    await squadConversation.save();

    return {
      success: true,
      isPinned: !isPinned
    };
  } catch (error) {
    console.error("Error toggling squad pin status:", error);
    return errorResponseHandler(
      "Failed to update pin status",
      httpStatusCode.INTERNAL_SERVER_ERROR,
      res
    );
  }
};

// Toggle pin status for a community conversation
export const togglePinCommunityConversationService = async (req: any, res: Response) => {
  const userId = req.user.id;
  const { communityConversationId } = req.params;

  try {
    const communityConversation = await CommunityConversation.findById(communityConversationId);
    
    if (!communityConversation) {
      return errorResponseHandler(
        "Community conversation not found",
        httpStatusCode.NOT_FOUND,
        res
      );
    }

    // Check if user is a member of the community
    const community = await mongoose.model('Community').findOne({
      _id: communityConversation.community,
      "members.user": userId
    });

    if (!community) {
      return errorResponseHandler(
        "You are not a member of this community",
        httpStatusCode.FORBIDDEN,
        res
      );
    }

    // Toggle pin status for this user
    const isPinned = communityConversation.isPinned.get(userId) || false;
    communityConversation.isPinned.set(userId, !isPinned);
    await communityConversation.save();

    return {
      success: true,
      isPinned: !isPinned
    };
  } catch (error) {
    console.error("Error toggling community pin status:", error);
    return errorResponseHandler(
      "Failed to update pin status",
      httpStatusCode.INTERNAL_SERVER_ERROR,
      res
    );
  }
};

// Update background for direct conversation
export const updateDirectConversationBackgroundService = async (req: any, res: Response) => {
  const userId = req.user.id;
  const { conversationId } = req.params;
  const { backgroundImage, backgroundColor } = req.body;

 
    // Check if conversation exists and user is a participant
    const conversation = await Conversation.findOne({
      _id: conversationId,
      participants: userId,
      isActive: true
    });

    if (!conversation) {
      return errorResponseHandler(
        "Conversation not found or you're not a participant",
        httpStatusCode.NOT_FOUND,
        res
      );
    }

    // Update background settings for this user
    conversation.backgroundSettings.set(userId, {
      backgroundImage: backgroundImage || null,
      backgroundColor: backgroundColor || null
    });
    await conversation.save();

    return {
      success: true,
      message: "Background updated successfully",
      backgroundSettings: conversation.backgroundSettings.get(userId)
    }; 
};

// Update background for squad conversation
export const updateSquadConversationBackgroundService = async (req: any, res: Response) => {
  const userId = req.user.id;
  const { squadConversationId } = req.params;
  const { backgroundImage, backgroundColor } = req.body;

  try {
    const squadConversation = await SquadConversation.findById(squadConversationId);
    
    if (!squadConversation) {
      return errorResponseHandler(
        "Squad conversation not found",
        httpStatusCode.NOT_FOUND,
        res
      );
    }

    // Check if user is a member of the squad
    const squad = await mongoose.model('Squad').findOne({
      _id: squadConversation.squad,
      "members.user": userId 
    });

    if (!squad) {
      return errorResponseHandler(
        "You are not a member of this squad",
        httpStatusCode.FORBIDDEN,
        res
      );
    }

    // Update background settings for this user
    (squadConversation as any).backgroundSettings.set(userId, {
      backgroundImage: backgroundImage || null,
      backgroundColor: backgroundColor || null
    });
    await squadConversation.save();

    return {
      success: true,
      message: "Background updated successfully",
      backgroundSettings: (squadConversation as any).backgroundSettings.get(userId)
    };
  } catch (error) {
    console.error("Error updating squad conversation background:", error);
    return errorResponseHandler(
      "Failed to update background",
      httpStatusCode.INTERNAL_SERVER_ERROR,
      res
    );
  }
};

// Update background for community conversation
export const updateCommunityConversationBackgroundService = async (req: any, res: Response) => {
  const userId = req.user.id;
  const { communityConversationId } = req.params;
  const { backgroundImage, backgroundColor } = req.body;

  try {
    const communityConversation = await CommunityConversation.findById(communityConversationId);
    
    if (!communityConversation) {
      return errorResponseHandler(
        "Community conversation not found",
        httpStatusCode.NOT_FOUND,
        res
      );
    }

    // Check if user is a member of the community
    const community = await mongoose.model('Community').findOne({
      _id: communityConversation.community,
      "members.user": userId
    });

    if (!community) {
      return errorResponseHandler(
        "You are not a member of this community",
        httpStatusCode.FORBIDDEN,
        res
      );
    }

    // Update background settings for this user
    communityConversation.backgroundSettings.set(userId, {
      backgroundImage: backgroundImage || null,
      backgroundColor: backgroundColor || null
    });
    await communityConversation.save();

    return {
      success: true,
      backgroundSettings: communityConversation.backgroundSettings.get(userId)
    };
  } catch (error) {
    console.error("Error updating community conversation background:", error);
    return errorResponseHandler(
      "Failed to update background",
      httpStatusCode.INTERNAL_SERVER_ERROR,
      res
    );
  }
};
