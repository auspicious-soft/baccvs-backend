import { Router } from "express";
import { ResendChangeOTP , SubmitChangeRequest, VerifyAdminPassword, VerifyChangeOTP } from "src/controllers/admin/admin-settings-controller";
import { checkSettingsAuth } from "src/middleware/admin-settings-auth";


const router = Router();


router.post("/settings/verify-password",VerifyAdminPassword);
router.post("/settings/change-initiate",checkSettingsAuth ,SubmitChangeRequest);
router.post("/settings/resend-otp", checkSettingsAuth, ResendChangeOTP );
router.post("/settings/verify-otp", checkSettingsAuth, VerifyChangeOTP);


export { router };
