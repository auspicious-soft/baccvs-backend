import { Router } from "express";
import { AcceptInvitation, getAdminData, GetAllStaffMembers, GetSingleStaffMember, inviteStaff, removeUnRemoveStaff, RequestPasswordReset, ResendChangeOTP , SubmitChangeRequest, updateAdminData, updateStaffMemberData, VerifyAdminPassword, VerifyChangeOTP } from "src/controllers/admin/admin-settings-controller";
import { deleteMultipleUsers, GetAllUsers, getEventByIdAdmin, getEventStats, getSingleUserDetails, refundEventAdmin, updateUsersBanStatus } from "src/controllers/admin/admin-user-controller";
import { checkSettingsAuth } from "src/middleware/admin-settings-auth";


const router = Router();


router.post("/settings/verify-password",VerifyAdminPassword);
router.post("/settings/change-initiate",checkSettingsAuth ,SubmitChangeRequest);
router.post("/settings/resend-otp", checkSettingsAuth, ResendChangeOTP );
router.post("/settings/verify-otp", checkSettingsAuth, VerifyChangeOTP);
router.post("/settings/admin-request-link", RequestPasswordReset);
router.patch("/settings/update-profile", updateAdminData);
router.post("/settings/invite-staff", inviteStaff);
router.get("/staff", GetAllStaffMembers);
router.get("/staff-member/:id", GetSingleStaffMember);
router.put("/staff-role-access", updateStaffMemberData);
router.post("/remove-staff", removeUnRemoveStaff);
router.get("/admin-data", getAdminData);
router.get("/all-users",GetAllUsers);
router.post("/user/ban-status",updateUsersBanStatus);
router.post("/delete-users",deleteMultipleUsers);
router.get("/get-user",getSingleUserDetails);

// Event And Ticketing Admin Routes
router.get("/event-and-ticketing/stats", getEventStats);
router.get("/event-and-ticketing/event/:eventId", getEventByIdAdmin);
router.post("/event-and-ticketing/refund", refundEventAdmin);


export { router };
