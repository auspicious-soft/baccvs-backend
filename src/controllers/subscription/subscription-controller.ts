import { Request, Response } from "express";
import { JwtPayload } from "jsonwebtoken";
import { httpStatusCode } from "src/lib/constant";
import { errorParser } from "src/lib/errors/error-response-handler";
import { DatingSubscription } from "src/models/subscriptions/dating-subscription-schema";
import { Transaction, TransactionType } from "src/models/transaction/transaction-schema";
import { 
  createCheckoutSessionService, 
  stripeSuccessService,
  stripeCancelService,
  getStripeProductsService,
  updateProductPriceService,
  handleStripeWebhookService,
  cancelSubscriptionService,
  getPlanIdFromProductIdService,
  createPaymentIntentService
} from "src/services/subscription/subscription-service";

/**
 * Create a checkout session for subscription
 */
export const createSubscriptionCheckout = async (req: Request, res: Response) => {
  try {
    const response = await createCheckoutSessionService(req, res);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error) {
    const { code, message } = errorParser(error);
    return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};

/**
 * Handle successful Stripe checkout
 */
export const stripeSuccess = async (req: Request, res: Response) => {
  try {
    const response = await stripeSuccessService(req, res);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error) {
    const { code, message } = errorParser(error);
    return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};

/**
 * Handle cancelled Stripe checkout
 */
export const stripeCancel = async (req: Request, res: Response) => {
  try {
    const response = await stripeCancelService(req, res);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error) {
    const { code, message } = errorParser(error);
    return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};

/**
 * Get all Stripe products
 */
export const getStripeProducts = async (req: Request, res: Response) => {
  try {
    const response = await getStripeProductsService(req, res);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error) {
    const { code, message } = errorParser(error);
    return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};

/**
 * Update product price
 */
export const updateProductPrice = async (req: Request, res: Response) => {
  try {
    const response = await updateProductPriceService(req, res);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error) {
    const { code, message } = errorParser(error);
    return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};

/**
 * Handle Stripe webhook  
 */
export const handleSubscriptionWebhook = async (req: Request, res: Response) => {
  try {
    // For webhooks, we need to pass the raw body to Stripe
    console.log("Received webhook from Stripe");
    
    // Log headers for debugging
    console.log("Stripe signature:", req.headers["stripe-signature"]);
    
    const response = await handleStripeWebhookService(req, res);
    
    // Return a 200 response to acknowledge receipt of the webhook
    return res.status(httpStatusCode.OK).json(response);
  } catch (error) {
    console.error("Error in webhook handler:", error);
    const { code, message } = errorParser(error);
    return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};

/**
 * Cancel subscription
 */
export const cancelSubscription = async (req: Request, res: Response) => {
  try {
    const response = await cancelSubscriptionService(req, res);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error) {
    const { code, message } = errorParser(error);
    return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};

/**
 * Get plan ID from product ID
 */
export const getPlanIdFromProductId = async (req: Request, res: Response) => {
  try {
    const response = await getPlanIdFromProductIdService(req, res);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error) {
    const { code, message } = errorParser(error);
    return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};

/**
 * Get user subscription details
 */
export const getUserSubscription = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(httpStatusCode.UNAUTHORIZED)
        .json({ success: false, message: "User data not found in request" });
    }
    
    const { id: userId } = req.user as JwtPayload;
    
    // Get subscription details
    const subscription = await DatingSubscription.findOne({ user: userId });
    if (!subscription) {
      return res.status(httpStatusCode.NOT_FOUND)
        .json({ success: false, message: "Subscription not found" });
    }
    
    // Get recent transactions
    const recentTransactions = await Transaction.find({ 
      user: userId,
      type: TransactionType.DATING_SUBSCRIPTION
    })
    .sort({ createdAt: -1 })
    .limit(5);
    
    return res.status(httpStatusCode.OK).json({
      success: true,
      message: "Subscription details retrieved successfully",
      data: {
        subscription: {
          plan: subscription.plan,
          price: subscription.price,
          startDate: subscription.startDate,
          endDate: subscription.endDate,
          isActive: subscription.isActive,
          autoRenew: subscription.autoRenew,
          features: subscription.features
        },
        recentTransactions: recentTransactions.map(t => ({
          id: t._id,
          status: t.status,
          amount: t.amount,
          currency: t.currency,
          createdAt: t.createdAt
        }))
      }
    });
  } catch (error) {
    const { code, message } = errorParser(error);
    return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};

/**
 * Create payment intent for mobile apps
 */
export const createPaymentIntent = async (req: Request, res: Response) => {
  try {
    const response = await createPaymentIntentService(req, res);
    return res.status(response.success ? httpStatusCode.OK : httpStatusCode.BAD_REQUEST).json(response);
  } catch (error) {
    const { code, message } = errorParser(error);
    return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};







