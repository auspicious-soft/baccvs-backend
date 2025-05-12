import { Router } from "express";
import {   getDashboardStats, getUserInfo, editUserInfo, verifyCurrentPassword, submitNewEmail, submitNewPhone, verifyAndCompleteEmailChange, verifyAndCompletePhoneChange, forgotPassword, resetPasswordWithToken, notificationSetting, toggleTwoFactorAuthentication, getReferalCode, changePassword } from "../controllers/user/user";
import { createProfessionalProfile, deleteProfessionalProfile, getProfessionalProfileById, getUserAllprofessionalProfiles, updateProfessionalProfile } from "src/controllers/professional/professional-controller";
import { createPromotion, getAllPromotions, getPromotionById, getUserPromotions, togglePromotionStatus } from "src/controllers/promotion/promotion-controller";
import { getUserFeedController, getUserMatchesController, getUserMatchStatsController, userDislikeController, userLikeController } from "src/controllers/userMatch/userMatch-controller";
import { addMember, changeMemberRole, createSquad, deleteSquad, getSquadById, getSquads, getUserSquads, leaveSquad, removeMember, transferOwnership, updateSquad } from "src/controllers/squad/squad-controller";


const router = Router();

router.post("/verify-password",  verifyCurrentPassword);
router.post("/change-email/submit",  submitNewEmail);
router.post("/change-phone/submit",  submitNewPhone);
router.post("/change-email/verify",  verifyAndCompleteEmailChange);
router.post("/change-phone/verify",  verifyAndCompletePhoneChange);
router.post("/forgot-password", forgotPassword)
router.post("/reset-password", resetPasswordWithToken)
router.post("/create/professionalId",createProfessionalProfile)
router.post("/create/promotion",createPromotion)
router.post("/change-password", changePassword)
router.route("/:id").get( getUserInfo).patch( editUserInfo)
router.get("/dashboard",  getDashboardStats)
router.get("/all/professional/profile",getUserAllprofessionalProfiles )
router.get("/professional/profile/:id",getProfessionalProfileById)
router.get("/get/all/promotion",getAllPromotions)
router.get("/get/promotion/:id",getPromotionById)
router.get("/get/promotion/user/:id",getUserPromotions)
router.get("/get/referal/code",getReferalCode)
router.put("/update/professional/profile/:id",updateProfessionalProfile)
router.patch("/toggle/notification",notificationSetting)
router.patch("/toggle/promotion/:id",togglePromotionStatus)
router.patch("/toggle/twofactor",toggleTwoFactorAuthentication)
router.delete("/delete/professional/profile/:id",deleteProfessionalProfile)


// Dating App api
router.post("/like-user/:id", userLikeController);
router.post("/dislike-user/:id", userDislikeController);
router.get("/matches/user", getUserMatchesController);
router.get("/feed/user", getUserFeedController);
router.get("/match-stats", getUserMatchStatsController);


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

export { router }