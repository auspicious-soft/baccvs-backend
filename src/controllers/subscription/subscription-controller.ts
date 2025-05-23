import { Request, Response } from "express";
import { httpStatusCode } from "src/lib/constant";
import { errorParser } from "src/lib/errors/error-response-handler";
import { 
  createSubscriptionCheckoutService, 
  handleSubscriptionWebhookService,
  getUserSubscriptionService,
  cancelSubscriptionService
} from "src/services/subscription/subscription-service";

// Create a checkout session for subscription
export const createSubscriptionCheckout = async (req: Request, res: Response) => {
  try {
    const response = await createSubscriptionCheckoutService(req, res);
    if (!response.success) {
      return res.status(httpStatusCode.BAD_REQUEST).json(response);
    }
    return res.status(httpStatusCode.OK).json(response);
  } catch (error) {
    const { code, message } = errorParser(error);
    return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ 
      success: false, 
      message: message || "An error occurred during checkout" 
    });
  }
};

// Handle Stripe webhook events
export const handleSubscriptionWebhook = async (req: Request, res: Response) => {
  try {
    const response = await handleSubscriptionWebhookService(req, res);
    if (!response.success) {
      return res.status(httpStatusCode.BAD_REQUEST).json(response);
    }
    return res.status(httpStatusCode.OK).json(response);
  } catch (error) {
    const { code, message } = errorParser(error);
    return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ 
      success: false, 
      message: message || "An error occurred processing webhook" 
    });
  }
};

// Get user subscription details
export const getUserSubscription = async (req: Request, res: Response) => {
  try {
    const response = await getUserSubscriptionService(req, res);
    if (!response.success) {
      return res.status(httpStatusCode.BAD_REQUEST).json(response);
    }
    return res.status(httpStatusCode.OK).json(response);
  } catch (error) {
    const { code, message } = errorParser(error);
    return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ 
      success: false, 
      message: message || "An error occurred retrieving subscription" 
    });
  }
};

// Cancel subscription
export const cancelSubscription = async (req: Request, res: Response) => {
  try {
    const response = await cancelSubscriptionService(req, res);
    if (!response.success) {
      return res.status(httpStatusCode.BAD_REQUEST).json(response);
    }
    return res.status(httpStatusCode.OK).json(response);
  } catch (error) {
    const { code, message } = errorParser(error);
    return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ 
      success: false, 
      message: message || "An error occurred cancelling subscription" 
    });
  }
};

