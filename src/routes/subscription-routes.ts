import { Router } from "express";
import { checkAuth } from "src/middleware/check-auth";
import { 
  createSubscriptionCheckout, 
  cancelSubscription,
  stripeSuccess,
  stripeCancel,
  getStripeProducts,
  updateProductPrice,
  getPlanIdFromProductId,
  getUserSubscription,
  createPaymentIntent
} from "src/controllers/subscription/subscription-controller";

const router = Router();

// Create checkout session for subscription
router.post("/checkout", checkAuth, createSubscriptionCheckout);

// Handle successful Stripe checkout
router.get("/success", checkAuth, stripeSuccess);

// Handle cancelled Stripe checkout
router.get("/cancel", checkAuth, stripeCancel);

// Get all Stripe products
router.get("/products", getStripeProducts);

// Get plan ID from product ID
router.get("/product/:productId/plan", getPlanIdFromProductId);

// Update product price (admin only)
router.put("/product/price", checkAuth, updateProductPrice);

router.get("/", checkAuth, getUserSubscription);

// Cancel subscription
router.post("/cancel", checkAuth, cancelSubscription);

// Add this route to your subscription routes
router.post("/payment-intent", checkAuth, createPaymentIntent);



export { router };

