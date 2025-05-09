import { Router } from "express";
import { createReferralCode } from "src/controllers/referal/referal";
import { validateReferralCode } from "src/controllers/user/user";

const router = Router();

router.post("/",createReferralCode)
router.post("/validate",validateReferralCode)

export { router }