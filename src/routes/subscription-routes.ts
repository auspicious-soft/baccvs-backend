import { Router } from "express";
import { checkAuth } from "src/middleware/check-auth";
import { 
  createSubscriptionCheckout, 
  handleSubscriptionWebhook,
  getUserSubscription,
  cancelSubscription
} from "src/controllers/subscription/subscription-controller";

const router = Router();

// Create checkout session for subscription
router.post("/checkout", checkAuth, createSubscriptionCheckout);

// Get user subscription details
router.get("/", checkAuth, getUserSubscription);

// Cancel subscription
router.post("/cancel", checkAuth, cancelSubscription);

// Stripe webhook handler - no auth check as it's called by Stripe
// router.post("/webhook", handleSubscriptionWebhook);



export { router };
