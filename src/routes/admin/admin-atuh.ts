import { Router } from "express";
import { ForgetPassword, LoginAdmin, RegisterAdmin, ResendOtp, ResetPassword, VerifyResetPasswordOtp } from "src/controllers/admin-auth/admin-auth-controller";


const router = Router();


router.post("/register",RegisterAdmin);
router.post("/admin-login",LoginAdmin);
router.post("/admin-forget-password",ForgetPassword);
router.post("/admin-verify-otp",VerifyResetPasswordOtp);
router.post("/admin-resend-otp",ResendOtp);
router.post("/admin-reset-password",ResetPassword);

export { router };
