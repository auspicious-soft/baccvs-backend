import { Router } from "express";
import { checkAuth } from "src/middleware/check-auth";
import {
  createOnboardingLink,
  completeOnboarding,
  stripeConnectReturn,
  stripeConnectRefresh,
} from "src/controllers/stripe/stripe-connect-controller";

const router = Router();

// Create Stripe Connect onboarding link
router.post("/onboard", checkAuth, createOnboardingLink);

// Optional endpoint: mark onboarding complete (client can call after onboarding)
router.post("/complete", checkAuth, completeOnboarding);

// Public endpoints used by Stripe account links to redirect back to the app
router.get("/connect/return", stripeConnectReturn);
router.get("/connect/refresh", stripeConnectRefresh);

export { router };
