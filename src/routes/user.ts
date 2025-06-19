import { Router } from "express";
import {   getDashboardStats, getUserInfo, editUserInfo, verifyCurrentPassword, submitNewEmail, submitNewPhone, verifyAndCompleteEmailChange, verifyAndCompletePhoneChange, forgotPassword, resetPasswordWithToken, notificationSetting, toggleTwoFactorAuthentication, getReferalCode, changePassword, getAllFollowedUsers, togglePrivacyPreference, getUserNotificationPreferences, getUserPrivacyPreference } from "../controllers/user/user";
import { createProfessionalProfile, deleteProfessionalProfile, getProfessionalProfileById, getUserAllprofessionalProfiles, updateProfessionalProfile } from "src/controllers/professional/professional-controller";
import { createPromotion, getAllPromotions, getPromotionById, getUserPromotions, togglePromotionStatus } from "src/controllers/promotion/promotion-controller";
import { getUserFeedController, getUserMatchesController, getUserMatchStatsController, userDislikeController, userLikeController } from "src/controllers/userMatch/userMatch-controller";
import { addMember, changeMemberRole, createSquad, deleteSquad, getSquadById, getSquads, getUserSquads, joinSquad, leaveSquad, removeMember, transferOwnership, updateSquad } from "src/controllers/squad/squad-controller";
import { userDislikeSquadController, userLikeSquadController } from "src/controllers/squadMatch/squadMatch-controller";
import { getConversationMessages, getUserConversations, markMessagesAsRead, sendMessage } from "src/controllers/chat/chat-controller";
import { getSquadMessagesController, sendSquadMessageController, getUserSquadConversationsController, markSquadMessagesAsReadController } from "src/controllers/chat/squad-chat-controller";
import { createCommunity, getCommunities, getUserCommunities, getCommunityById, joinCommunity, leaveCommunity, addcommunityMember, removeCommunityMember, changeCommunityMemberRole } from "src/controllers/community/community-controller";
import { getUserCommunityConversations, getCommunityMessages, sendCommunityMessage } from "src/controllers/chat/community-chat-controller";
import { togglePinCommunityConversation, togglePinDirectConversation, togglePinSquadConversation, updateCommunityConversationBackground, updateDirectConversationBackground, updateSquadConversationBackground } from "src/controllers/chat/chat-settings-controller";

const router = Router();

router.post("/verify-password",  verifyCurrentPassword);
router.post("/change-email/submit",submitNewEmail);
router.post("/change-phone/submit",submitNewPhone);
router.post("/change-email/verify",verifyAndCompleteEmailChange);
router.post("/change-phone/verify",verifyAndCompletePhoneChange);
router.post("/forgot-password", forgotPassword)
// router.post("/reset-password", resetPasswordWithToken)
router.post("/create/professionalId",createProfessionalProfile)
router.post("/create/promotion",createPromotion)
router.post("/change-password", changePassword)
router.route("/:id").get( getUserInfo).patch( editUserInfo)
router.get("/dashboard/data",  getDashboardStats)
router.get("/all/professional/profile",getUserAllprofessionalProfiles )
router.get("/professional/profile/:id",getProfessionalProfileById)
router.get("/get/all/promotion",getAllPromotions)
router.get("/get/promotion/:id",getPromotionById)
router.get("/get/promotion/user/:id",getUserPromotions)
router.get("/get/referal/code",getReferalCode)
router.get("/get/user/notification/preference",getUserNotificationPreferences)
router.get("/get/user/privacy/preference",getUserPrivacyPreference)
router.put("/update/professional/profile/:id",updateProfessionalProfile)
router.patch("/toggle/notification",notificationSetting)
router.patch("/toggle/promotion/:id",togglePromotionStatus)
router.patch("/toggle/twofactor",toggleTwoFactorAuthentication)
router.patch("/toggle/privacy",togglePrivacyPreference)
router.delete("/delete/professional/profile/:id",deleteProfessionalProfile)

// create api to get all user 
router.get("/get/all/followedUser", getAllFollowedUsers)

// Dating App api
router.post("/like-user/:id", userLikeController);
router.post("/dislike-user/:id", userDislikeController);
router.get("/matches/user", getUserMatchesController);
router.get("/feed/user", getUserFeedController);
router.get("/match-stats", getUserMatchStatsController);

// Squad Match api
router.post("/like-squad/:id", userLikeSquadController);
router.post("/dislike-squad/:id", userDislikeSquadController);

// Squad api
router.post("/create/squad", createSquad);
router.get("/get/squad/:id", getSquadById);
router.patch("/update/squad/:id", updateSquad);
router.delete("/delete/squad/:id", deleteSquad);
router.get("/get/squads", getSquads);
router.get("/get/user/squads", getUserSquads);
router.patch("/add/member/:id", addMember);
router.patch("/remove/member/:id", removeMember);
router.patch("/change/:squadId/members/:memberId/role", changeMemberRole);
router.patch("/leave/squad/:id", leaveSquad);
router.patch("/transfer/ownership/:id", transferOwnership);
router.patch("/join/squad/:id", joinSquad);

// chat individual
// Get all conversations for the current user
router.get("/conversations/user", getUserConversations);
// Get messages for a specific conversation
router.get("/conversations/:conversationId/messages", getConversationMessages);
// Send a message to another user
router.post("/conversation/send", sendMessage);
// Mark messages as read
router.post("/conversations/:conversationId/read", markMessagesAsRead);
// Direct conversation routes
router.post("/conversations/:conversationId/pin",  togglePinDirectConversation);
router.post("/conversations/:conversationId/background",  updateDirectConversationBackground);

// Squad chat routes
// Get all squad conversations for the current user
router.get("/squad/conversations", getUserSquadConversationsController);
// Get messages for a specific squad conversation
router.get("/squad/:squadId/messages", getSquadMessagesController);
// Send a message to a squad
router.post("/squad/send-message", sendSquadMessageController);
// Mark squad messages as read
router.post("/squad/:squadId/read", markSquadMessagesAsReadController);
// Squad conversation routes
router.post("/squad-conversations/:squadConversationId/pin", togglePinSquadConversation);
router.post("/squad-conversations/:squadConversationId/background",updateSquadConversationBackground);

// Community routes
// Community management
router.post("/create/community", createCommunity);
router.get("/get/communities", getCommunities);
router.get("/get/user/communities", getUserCommunities);
router.get("/get/community/:id", getCommunityById);
router.patch("/join/community/:id", joinCommunity);
router.patch("/leave/community/:id", leaveCommunity);
router.patch("/add/community/member/:id", addcommunityMember);
router.patch("/remove/community/member/:id", removeCommunityMember);
router.patch("/change/community/:communityId/members/:memberId/role", changeCommunityMemberRole);

// Community chat routes
// Get all community conversations for the current user
router.get("/community/conversations", getUserCommunityConversations);
// Get messages for a specific community
router.get("/community/:communityId/messages", getCommunityMessages);
// Send a message to a community
router.post("/community/send-message", sendCommunityMessage);
router.post("/community-conversations/:communityConversationId/pin",togglePinCommunityConversation);
router.post("/community-conversations/:communityConversationId/background",updateCommunityConversationBackground);


export { router }
