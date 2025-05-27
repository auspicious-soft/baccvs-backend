import { Request, Response } from "express";
import { JwtPayload } from "jsonwebtoken";
import dotenv from "dotenv";
dotenv.config();

// Extend Express Request interface to include userData
declare global {
  namespace Express {
    interface Request {
      userData?: {
        userId: string;
        [key: string]: any;
      };
    }
  }
}
import Stripe from "stripe";
import { DatingSubscription, DatingSubscriptionPlan } from "src/models/subscriptions/dating-subscription-schema";
import { Transaction, TransactionType, TransactionStatus } from "src/models/transaction/transaction-schema";
import { usersModel } from "src/models/user/user-schema";
import { httpStatusCode } from "src/lib/constant";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
  apiVersion: "2025-02-24.acacia",
});

// Map subscription plans to Stripe price IDs
const SUBSCRIPTION_PRICE_IDS: Record<DatingSubscriptionPlan, string | null> = {
  [DatingSubscriptionPlan.FREE]: null,
  [DatingSubscriptionPlan.BASIC]: process.env.STRIPE_DATING_BASIC_PRICE_ID || '',
  [DatingSubscriptionPlan.ELITE]: process.env.STRIPE_DATING_ELITE_PRICE_ID || '',
  [DatingSubscriptionPlan.PRESTIGE]: process.env.STRIPE_DATING_PRESTIGE_PRICE_ID || '',
};

// Create a checkout session for subscription
export const createCheckoutSessionService = async (req: Request, res: Response) => {
  try {
    const { productId } = req.body;
    if (!req.user) {
      return { success: false, message: "User data not found in request" };
    }
    
    const { id: userId } = req.user as JwtPayload;
    
    if (!productId) {
      return { success: false, message: "Product ID is required" };
    }
    
    // Get user
    const user = await usersModel.findById(userId);
    if (!user) {
      return { success: false, message: "User not found" };
    }

    // Get product details from Stripe
    const stripeProduct = await stripe.products.retrieve(productId);
    if (!stripeProduct.default_price) {
      return { success: false, message: "No price found for this product" };
    }

    // Determine plan type from product metadata
    let planType = DatingSubscriptionPlan.BASIC;
    if (stripeProduct.metadata && stripeProduct.metadata.plan_type) {
      const metadataPlan = stripeProduct.metadata.plan_type.toUpperCase();
      if (Object.values(DatingSubscriptionPlan).includes(metadataPlan as DatingSubscriptionPlan)) {
        planType = metadataPlan as DatingSubscriptionPlan;
      }
    }

    // Get or create subscription record
    let subscription = await DatingSubscription.findOne({ user: userId });
    if (!subscription) {
      subscription = await DatingSubscription.create({
        user: userId,
        plan: DatingSubscriptionPlan.FREE
      });
    }

    // Find or create Stripe customer
    let stripeCustomerId = subscription.stripeCustomerId;
    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: user.userName,
        metadata: {
          userId: userId.toString()
        }
      });
      stripeCustomerId = customer.id;
      subscription.stripeCustomerId = stripeCustomerId;
      await subscription.save();
    }

    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      payment_method_types: ["card"], // Removed PayPal
      line_items: [
        {
          price: stripeProduct.default_price as string,
          quantity: 1,
        },
      ],
      mode: "subscription",
      success_url: `${process.env.FRONTEND_URL}/subscription/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL}/subscription/cancel`,
      metadata: {
        userId: userId.toString(),
        productId: productId,
        plan: planType
      }
    });

    // Create a pending transaction record
    await Transaction.create({
      user: userId,
      type: TransactionType.DATING_SUBSCRIPTION,
      amount: 0, // Will be updated when session completes
      status: TransactionStatus.PENDING,
      reference: {
        model: 'DatingSubscription',
        id: subscription._id
      },
      stripeCustomerId: stripeCustomerId,
      stripeSessionId: session.id,
      metadata: {
        plan: planType,
        productId: productId,
        checkoutCreated: new Date()
      }
    });

    return {
      success: true,
      url: session.url,
      sessionId: session.id
    };
  } catch (error) {
    return { success: false, message: `Failed to create checkout session: ${(error as Error).message}` };
  }
};

// Handle stripe success
export const stripeSuccessService = async (req: Request, res: Response) => {
  try {
    const { session_id } = req.query;
    
    if (!session_id) {
      return { success: false, message: "Session ID is required" };
    }
    
    if (!req.user) {
      return { success: false, message: "User data not found in request" };
    }
    
    const { id: userId } = req.user as JwtPayload;
    
    // Retrieve the session from Stripe
    const session = await stripe.checkout.sessions.retrieve(session_id as string, {
      expand: ['subscription']
    });
    
    if (session.metadata?.userId !== userId.toString()) {
      return { success: false, message: "Session does not belong to this user" };
    }
    
    // Get subscription details
    const subscription = await DatingSubscription.findOne({ user: userId });
    if (!subscription) {
      return { success: false, message: "Subscription not found" };
    }
    
    // Update transaction status
    await Transaction.findOneAndUpdate(
      { stripeSessionId: session_id },
      { 
        status: TransactionStatus.SUCCESS,
        stripeSubscriptionId: session.subscription as string,
        metadata: {
          completedAt: new Date()
        }
      }
    );
    
    return {
      success: true,
      message: "Subscription activated successfully",
      data: {
        plan: subscription.plan,
        isActive: subscription.isActive,
        startDate: subscription.startDate,
        endDate: subscription.endDate,
        features: subscription.features
      }
    };
  } catch (error) {
    return { success: false, message: `Failed to process success: ${(error as Error).message}` };
  }
};

// Handle stripe cancel
export const stripeCancelService = async (req: Request, res: Response) => {
  try {
    const { session_id } = req.query;
    
    if (!session_id) {
      return { success: false, message: "Session ID is required" };
    }
    
    // Update transaction status
    await Transaction.findOneAndUpdate(
      { stripeSessionId: session_id },
      { 
        status: TransactionStatus.CANCELLED,
        metadata: {
          cancelledAt: new Date(),
          reason: "User cancelled checkout"
        }
      }
    );
    
    return {
      success: true,
      message: "Checkout cancelled"
    };
  } catch (error) {
    return { success: false, message: `Failed to process cancellation: ${(error as Error).message}` };
  }
};

// Get all Stripe products
export const getStripeProductsService = async (req: Request, res: Response) => {
  try {
    const products = await stripe.products.list({ 
      active: true,
      expand: ['data.default_price']
    });

    // Format the response
    const formattedProducts = products.data.map(product => {
      const defaultPrice = product.default_price as Stripe.Price;
      
      // Parse features from metadata
      let features = {};
      try {
        if (product.metadata.features) {
          features = JSON.parse(product.metadata.features);
        }
      } catch (error) {
        // Use empty features object if parsing fails
      }
      
      return {
        id: product.id,
        name: product.name,
        description: product.description,
        planType: product.metadata.plan_type || null,
        category: product.metadata.category || null,
        price: defaultPrice ? {
          id: defaultPrice.id,
          currency: defaultPrice.currency,
          unitAmount: defaultPrice.unit_amount,
          formattedAmount: `${defaultPrice.currency.toUpperCase()} ${(defaultPrice.unit_amount || 0) / 100}`,
          recurring: defaultPrice.recurring
        } : null,
        features: features,
        images: product.images,
        active: product.active
      };
    });

    return {
      success: true,
      message: "Stripe products fetched successfully",
      data: formattedProducts,
    };
  } catch (error) {
    return { success: false, message: `Failed to fetch products: ${(error as Error).message}` };
  }
};

// Update product price
export const updateProductPriceService = async (req: Request, res: Response) => {
  try {
    const { productId, newPrice } = req.body;

    if (!productId || !newPrice) {
      return { success: false, message: "Product ID and new price are required" };
    }

    // Fetch current product from Stripe
    const product = await stripe.products.retrieve(productId);

    if (!product.default_price || typeof product.default_price !== "string") {
      return { success: false, message: "No valid default price found for the product in Stripe" };
    }

    const existingPrice = await stripe.prices.retrieve(product.default_price);

    // Create a new recurring price with updated amount
    const newStripePrice = await stripe.prices.create({
      currency: existingPrice.currency || "usd",
      unit_amount: Math.round(newPrice * 100), // Ensure cents
      product: productId,
      recurring: existingPrice.recurring
        ? {
            interval: existingPrice.recurring.interval,
            interval_count: existingPrice.recurring.interval_count,
          }
        : {
            interval: "month",
            interval_count: 1,
          },
    });

    // Update the product to set new default price
    const updatedStripeProduct = await stripe.products.update(productId, {
      default_price: newStripePrice.id,
    });

    return {
      success: true,
      message: "Product price updated successfully",
      data: {
        stripeProduct: updatedStripeProduct,
        newStripePrice,
      },
    };
  } catch (error) {
    return { success: false, message: `Failed to update product price: ${(error as Error).message}` };
  }
};

// Handle Stripe webhook events
export const handleStripeWebhookService = async (req: Request, res: Response) => {
  const signature = req.headers["stripe-signature"] as string;
  let event;

  try {
    // Verify the webhook signature
    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        signature,
        process.env.STRIPE_WEBHOOK_SECRET as string
      );
      console.log(`✅ Webhook verified: ${event.type}`);
    } catch (err) {
      console.error(`❌ Webhook verification failed:`, err);
      return { success: false, message: `Webhook verification failed: ${(err as Error).message}` };
    }
    
    // Process the event based on its type
    await processWebhookEvent(event);

    return { success: true, message: "Webhook processed successfully" };
  } catch (error) {
    console.error("Webhook error:", error);
    return { success: false, message: `Failed to process webhook: ${(error as Error).message}` };
  }
};

// Helper function to process webhook events
async function processWebhookEvent(event: Stripe.Event) {
  switch (event.type) {
    case "checkout.session.completed":
      await handleCheckoutSessionCompleted(event.data.object as Stripe.Checkout.Session);
      break;
      
    case "payment_intent.succeeded":
      await handlePaymentIntentSucceeded(event.data.object as Stripe.PaymentIntent);
      break;
      
    case "invoice.paid":
      await handleInvoicePaid(event.data.object as Stripe.Invoice);
      break;
      
    case "invoice.payment_failed":
      await handleInvoicePaymentFailed(event.data.object as Stripe.Invoice);
      break;
      
    case "payment_intent.payment_failed":
      await handlePaymentIntentFailed(event.data.object as Stripe.PaymentIntent);
      break;
      
    case "checkout.session.expired":
      await handleCheckoutSessionExpired(event.data.object as Stripe.Checkout.Session);
      break;
      
    case "customer.subscription.deleted":
      await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
      break;
      
    default:
      console.log(`Unhandled event type: ${event.type}`);
  }
}

// Helper function to update transaction status
async function updateTransaction(query: any, update: any) {
  const transaction = await Transaction.findOne(query);
  
  if (transaction) {
    Object.assign(transaction, update);
    await transaction.save();
    console.log(`Updated transaction ${transaction._id}`);
    return transaction;
  }
  
  return null;
}

// Helper function to create a new transaction
async function createTransaction(data: any) {
  const transaction = await Transaction.create(data);
  console.log(`Created transaction ${transaction._id}`);
  return transaction;
}

// Handle checkout.session.completed event
async function handleCheckoutSessionCompleted(session: Stripe.Checkout.Session) {
  console.log(`Processing checkout.session.completed for ${session.id}`);
  
  // Update transaction record
  await updateTransaction(
    { stripeSessionId: session.id },
    { 
      status: TransactionStatus.SUCCESS,
      stripeSubscriptionId: session.subscription as string,
      metadata: {
        completedAt: new Date(),
        verifiedByWebhook: true
      }
    }
  );
  
  // Process subscription if userId exists
  const userId = session.metadata?.userId;
  if (userId) {
    await handleSuccessfulCheckout(session);
  }
}

// Handle payment_intent.succeeded event
async function handlePaymentIntentSucceeded(paymentIntent: Stripe.PaymentIntent) {
  console.log(`Processing payment_intent.succeeded for ${paymentIntent.id}`);
  
  const userId = paymentIntent.metadata?.userId;
  const productId = paymentIntent.metadata?.productId;
  
  if (!userId || !productId) {
    console.error("Missing userId or productId in payment intent metadata");
    return;
  }
  
  // Update or create transaction
  const transaction = await updateTransaction(
    { stripePaymentIntentId: paymentIntent.id },
    { 
      status: TransactionStatus.SUCCESS,
      metadata: {
        completedAt: new Date(),
        verifiedByWebhook: true
      }
    }
  );
  
  if (!transaction) {
    // Create new transaction if none exists
    await createTransaction({
      user: userId,
      type: TransactionType.DATING_SUBSCRIPTION,
      amount: paymentIntent.amount / 100,
      status: TransactionStatus.SUCCESS,
      stripeCustomerId: paymentIntent.customer as string,
      stripePaymentIntentId: paymentIntent.id,
      metadata: {
        plan: paymentIntent.metadata?.planType,
        productId,
        priceId: paymentIntent.metadata?.priceId,
        paidAt: new Date(),
        verifiedByWebhook: true
      }
    });
  }
  
  // Process subscription update
  const subscription = await DatingSubscription.findOne({ user: userId });
  if (subscription) {
    await updateSubscriptionFromPaymentIntent(subscription, paymentIntent, productId);
  }
}

// Handle invoice.paid event
async function handleInvoicePaid(invoice: Stripe.Invoice) {
  console.log(`Processing invoice.paid for ${invoice.id}`);
  
  if (!invoice.subscription) return;
  
  // Update or create transaction
  const transaction = await updateTransaction(
    { stripeInvoiceId: invoice.id },
    { 
      status: TransactionStatus.SUCCESS,
      amount: invoice.amount_paid / 100,
      metadata: {
        paidAt: new Date(),
        verifiedByWebhook: true
      }
    }
  );
  
  if (!transaction) {
    // Find subscription and create transaction
    const subscription = await DatingSubscription.findOne({ 
      stripeSubscriptionId: invoice.subscription as string 
    });
    
    if (subscription) {
      await createTransaction({
        user: subscription.user,
        type: TransactionType.DATING_SUBSCRIPTION,
        amount: invoice.amount_paid / 100,
        status: TransactionStatus.SUCCESS,
        reference: {
          model: 'DatingSubscription',
          id: subscription._id
        },
        stripeCustomerId: subscription.stripeCustomerId,
        stripeSubscriptionId: invoice.subscription as string,
        stripeInvoiceId: invoice.id,
        stripePaymentIntentId: invoice.payment_intent as string,
        metadata: {
          plan: subscription.plan,
          isRenewal: true,
          paidAt: new Date(),
          verifiedByWebhook: true
        }
      });
    }
  }
  
  // Update subscription
  await handleSuccessfulPayment(invoice);
}

// Handle invoice.payment_failed event
async function handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
  console.log(`Processing invoice.payment_failed for ${invoice.id}`);
  
  const failedMetadata = {
    failedAt: new Date(),
    reason: "Payment failed",
    verifiedByWebhook: true
  };
  
  // Update or create transaction
  const transaction = await updateTransaction(
    { stripeInvoiceId: invoice.id },
    { 
      status: TransactionStatus.FAILED,
      metadata: failedMetadata
    }
  );
  
  if (!transaction && invoice.subscription) {
    const subscription = await DatingSubscription.findOne({ 
      stripeSubscriptionId: invoice.subscription as string 
    });
    
    if (subscription) {
      await createTransaction({
        user: subscription.user,
        type: TransactionType.DATING_SUBSCRIPTION,
        amount: invoice.amount_due / 100,
        status: TransactionStatus.FAILED,
        reference: {
          model: 'DatingSubscription',
          id: subscription._id
        },
        stripeCustomerId: subscription.stripeCustomerId,
        stripeSubscriptionId: invoice.subscription as string,
        stripeInvoiceId: invoice.id,
        metadata: {
          ...failedMetadata,
          plan: subscription.plan,
          isRenewal: true
        }
      });
    }
  }
}

// Handle payment_intent.payment_failed event
async function handlePaymentIntentFailed(paymentIntent: Stripe.PaymentIntent) {
  console.log(`Processing payment_intent.payment_failed for ${paymentIntent.id}`);
  
  const failedMetadata = {
    failedAt: new Date(),
    reason: paymentIntent.last_payment_error?.message || "Payment failed",
    verifiedByWebhook: true
  };
  
  // Update or create transaction
  const transaction = await updateTransaction(
    { stripePaymentIntentId: paymentIntent.id },
    { 
      status: TransactionStatus.FAILED,
      metadata: failedMetadata
    }
  );
  
  if (!transaction && paymentIntent.metadata?.userId) {
    await createTransaction({
      user: paymentIntent.metadata.userId,
      type: TransactionType.DATING_SUBSCRIPTION,
      amount: paymentIntent.amount / 100,
      status: TransactionStatus.FAILED,
      stripePaymentIntentId: paymentIntent.id,
      stripeCustomerId: paymentIntent.customer as string,
      metadata: {
        ...failedMetadata,
        productId: paymentIntent.metadata.productId,
        priceId: paymentIntent.metadata.priceId
      }
    });
  }
}

// Handle checkout.session.expired event
async function handleCheckoutSessionExpired(session: Stripe.Checkout.Session) {
  console.log(`Processing checkout.session.expired for ${session.id}`);
  
  await updateTransaction(
    { stripeSessionId: session.id },
    { 
      status: TransactionStatus.FAILED,
      metadata: {
        expiredAt: new Date(),
        reason: "Checkout session expired",
        verifiedByWebhook: true
      }
    }
  );
}

// Handle customer.subscription.deleted event
async function handleSubscriptionDeleted(stripeSubscription: Stripe.Subscription) {
  console.log(`Processing customer.subscription.deleted for ${stripeSubscription.id}`);
  
  const subscription = await DatingSubscription.findOne({ 
    stripeSubscriptionId: stripeSubscription.id 
  });
  
  if (subscription) {
    // Create transaction record
    await createTransaction({
      user: subscription.user,
      type: TransactionType.DATING_SUBSCRIPTION,
      amount: 0,
      status: TransactionStatus.CANCELLED,
      reference: {
        model: 'DatingSubscription',
        id: subscription._id
      },
      stripeCustomerId: subscription.stripeCustomerId,
      stripeSubscriptionId: stripeSubscription.id,
      metadata: {
        previousPlan: subscription.plan,
        cancelledAt: new Date(),
        verifiedByWebhook: true
      }
    });
    
    // Update subscription
    subscription.isActive = false;
    subscription.autoRenew = false;
    subscription.plan = DatingSubscriptionPlan.FREE;
    subscription.features = {
      dailyLikes: 10,
      superLikesPerDay: 0,
      boostsPerMonth: 0,
      seeWhoLikesYou: false,
      advancedFilters: false
    };
    
    await subscription.save();
    
    // Update user model
    await usersModel.findByIdAndUpdate(subscription.user, {
      $set: {
        subscriptionStatus: DatingSubscriptionPlan.FREE,
        subscriptionActive: false
      }
    });
  }
}

// Helper function to update subscription from payment intent
async function updateSubscriptionFromPaymentIntent(
  subscription: any, 
  paymentIntent: Stripe.PaymentIntent, 
  productId: string
) {
  try {
    // Get product details from Stripe
    const product = await stripe.products.retrieve(productId);
    
    // Get price details
    const priceId = paymentIntent.metadata?.priceId || product.default_price as string;
    const price = await stripe.prices.retrieve(priceId);
    
    // Determine plan type from product metadata
    let planType = DatingSubscriptionPlan.BASIC;
    if (product.metadata?.plan_type) {
      const metadataPlan = product.metadata.plan_type.toUpperCase();
      if (Object.values(DatingSubscriptionPlan).includes(metadataPlan as DatingSubscriptionPlan)) {
        planType = metadataPlan as DatingSubscriptionPlan;
      }
    }
    
    // Extract features from product metadata
    let features = {
      dailyLikes: 10,
      superLikesPerDay: 0,
      boostsPerMonth: 0,
      seeWhoLikesYou: false,
      advancedFilters: false
    };
    
    try {
      if (product.metadata?.features) {
        features = JSON.parse(product.metadata.features);
      }
    } catch (error) {
      // Use default features if parsing fails
    }
    
    // Update subscription
    subscription.plan = planType;
    subscription.isActive = true;
    subscription.startDate = new Date();
    subscription.endDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days from now
    subscription.autoRenew = true;
    subscription.features = features;
    subscription.price = price.unit_amount ? price.unit_amount / 100 : 0;
    
    await subscription.save();
    
    // Update user model
    await usersModel.findByIdAndUpdate(subscription.user, {
      $set: {
        subscriptionStatus: planType,
        subscriptionActive: true
      }
    });
  } catch (error) {
    console.error("Error updating subscription:", error);
  }
}

// Cancel subscription
export const cancelSubscriptionService = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return { success: false, message: "User data not found in request" };
    }
    const { id: userId } = req.user as JwtPayload;
    
    const subscription = await DatingSubscription.findOne({ user: userId });
    if (!subscription || !subscription.stripeSubscriptionId) {
      return { success: false, message: "No active subscription found" };
    }

    await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
      cancel_at_period_end: true
    });

    subscription.autoRenew = false;
    await subscription.save();

    await Transaction.create({
      user: userId,
      type: TransactionType.DATING_SUBSCRIPTION,
      amount: 0, 
      status: TransactionStatus.CANCELLED,
      reference: {
        model: 'DatingSubscription',
        id: subscription._id
      },
      stripeCustomerId: subscription.stripeCustomerId,
      stripeSubscriptionId: subscription.stripeSubscriptionId,
      metadata: {
        plan: subscription.plan,
        cancelRequestedAt: new Date(),
        effectiveUntil: subscription.endDate,
        cancelAtPeriodEnd: true
      }
    });

    return { success: true, message: "Subscription will be cancelled at the end of the billing period" };
  } catch (error) {
    return { success: false, message: "Failed to cancel subscription" };
  }
};

// Get plan ID from product ID
export const getPlanIdFromProductIdService = async (req: Request, res: Response) => {
  try {
    const { productId } = req.params;
    
    if (!productId) {
      return { success: false, message: "Product ID is required" };
    }
    
    // Get product details from Stripe
    const product = await stripe.products.retrieve(productId);
    
    if (!product.default_price) {
      return { success: false, message: "No price found for this product" };
    }
    
    return {
      success: true,
      message: "Price ID retrieved successfully",
      data: {
        priceId: product.default_price,
        productName: product.name,
        productDescription: product.description
      }
    };
  } catch (error) {
    return { success: false, message: `Failed to get price ID: ${(error as Error).message}` };
  }
};

// Get user subscription details
export const getUserSubscriptionService = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return { success: false, message: "User data not found in request" };
    }
    
    const { id: userId } = req.user as JwtPayload;
    
    // Get subscription details
    const subscription = await DatingSubscription.findOne({ user: userId });
    if (!subscription) {
      return { success: false, message: "Subscription not found" };
    }
    
    // Get recent transactions
    const recentTransactions = await Transaction.find({ 
      user: userId,
      type: TransactionType.DATING_SUBSCRIPTION
    })
    .sort({ createdAt: -1 })
    .limit(5);
    
    return {
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
    };
  } catch (error) {
    return { success: false, message: `Failed to get subscription details: ${(error as Error).message}` };
  }
};

// Helper functions for webhook handling
async function handleSuccessfulCheckout(session: Stripe.Checkout.Session) {
  try {    
    if (!session.metadata?.userId || !session.metadata?.productId) {
      return;
    }

    const userId = session.metadata.userId;
    const productId = session.metadata.productId;
    const subscriptionId = session.subscription as string;

    const subscription = await DatingSubscription.findOne({ user: userId });
    if (!subscription) {
      return;
    }

    // Get subscription details from Stripe
    const stripeSubscription = await stripe.subscriptions.retrieve(subscriptionId, {
      expand: ['items.data.price.product']
    });
    
    const currentPeriodEnd = new Date(stripeSubscription.current_period_end * 1000);
    
    // Get the product details from the subscription
    const subscriptionItem = stripeSubscription.items.data[0];
    const price = subscriptionItem.price;
    const product = price.product as Stripe.Product;
    
    // Determine plan type from product metadata
    let planType = DatingSubscriptionPlan.BASIC;
    if (product.metadata && product.metadata.plan_type) {
      const metadataPlan = product.metadata.plan_type.toUpperCase();
      if (Object.values(DatingSubscriptionPlan).includes(metadataPlan as DatingSubscriptionPlan)) {
        planType = metadataPlan as DatingSubscriptionPlan;
      }
    }
    
    // Extract features from product metadata if available
    let features = {
      dailyLikes: 10,
      superLikesPerDay: 0,
      boostsPerMonth: 0,
      seeWhoLikesYou: false,
      advancedFilters: false
    };
    
    try {
      if (product.metadata.features) {
        features = JSON.parse(product.metadata.features);
      }
    } catch (error) {
      // If parsing fails, use default features
    }
    
    // Update subscription with details from Stripe
    subscription.plan = planType;
    subscription.stripeSubscriptionId = subscriptionId;
    subscription.isActive = true;
    subscription.startDate = new Date();
    subscription.endDate = currentPeriodEnd;
    subscription.autoRenew = true;
    subscription.features = features;
    subscription.price = price.unit_amount ? price.unit_amount / 100 : 0;
    
    await subscription.save();
    
    // Update user model with subscription status if needed
    await usersModel.findByIdAndUpdate(userId, {
      $set: {
        subscriptionStatus: planType,
        subscriptionActive: true
      }
    });
  } catch (error) {
    // Error handling
  }
}

async function handleSuccessfulPayment(invoice: Stripe.Invoice) {
  try {
    if (!invoice.subscription) {
      return;
    }

    const subscriptionId = invoice.subscription as string;
    
    const subscription = await DatingSubscription.findOne({ stripeSubscriptionId: subscriptionId });
    if (!subscription) {
      return;
    }

    // Get subscription details from Stripe
    const stripeSubscription = await stripe.subscriptions.retrieve(subscriptionId);
    const currentPeriodEnd = new Date(stripeSubscription.current_period_end * 1000);

    // Update subscription
    subscription.isActive = true;
    subscription.endDate = currentPeriodEnd;
    await subscription.save();
  } catch (error) {
    // Error handling without console logs
  }
}

async function handleSubscriptionUpdated(stripeSubscription: Stripe.Subscription) {
  const subscription = await DatingSubscription.findOne({ stripeSubscriptionId: stripeSubscription.id });
  if (!subscription) return;

  const currentPeriodEnd = new Date(stripeSubscription.current_period_end * 1000);
  subscription.endDate = currentPeriodEnd;
  subscription.isActive = stripeSubscription.status === "active";
  subscription.autoRenew = !stripeSubscription.cancel_at_period_end;

  await subscription.save();
}

async function handleSubscriptionCancelled(stripeSubscription: Stripe.Subscription) {
  try {
    const subscription = await DatingSubscription.findOne({ stripeSubscriptionId: stripeSubscription.id });
    if (!subscription) {
      return;
    }

    // If subscription is cancelled immediately (not at period end)
    if (stripeSubscription.status === "canceled") {
      subscription.isActive = false;
      subscription.autoRenew = false;
      subscription.plan = DatingSubscriptionPlan.FREE;
      subscription.features = {
        dailyLikes: 10,
        superLikesPerDay: 0,
        boostsPerMonth: 0,
        seeWhoLikesYou: false,
        advancedFilters: false
      };
    }

    await subscription.save();
  } catch (error) {
    // Error handling without console logs
  }
}

// Get plan price in cents
async function getPlanPrice(plan: DatingSubscriptionPlan): Promise<number> {
  if (plan === DatingSubscriptionPlan.FREE) {
    return 0;
  }
  
  const priceId = SUBSCRIPTION_PRICE_IDS[plan];
  if (!priceId) {
    return 0;
  }
  
  try {
    const price = await stripe.prices.retrieve(priceId);
    return price.unit_amount || 0;
  } catch (error) {
    // Fallback prices if Stripe API call fails
    switch (plan) {
      case DatingSubscriptionPlan.BASIC:
        return 999;
      case DatingSubscriptionPlan.ELITE:
        return 1999;
      case DatingSubscriptionPlan.PRESTIGE:
        return 2999;
      default:
        return 0;
    }
  }
}

// Synchronous version for when we can't use async
function getPlanPriceSync(plan: DatingSubscriptionPlan): number {
  switch (plan) {
    case DatingSubscriptionPlan.BASIC:
      return 999;
    case DatingSubscriptionPlan.ELITE:
      return 1999;
    case DatingSubscriptionPlan.PRESTIGE:
      return 2999;
    default:
      return 0;
  }
}

async function getInvoicePaymentErrorMessage(invoice: Stripe.Invoice): Promise<string | undefined> {
  if (invoice.payment_intent) {
    try {
      const paymentIntent = await stripe.paymentIntents.retrieve(invoice.payment_intent as string);
      return paymentIntent.last_payment_error?.message;
    } catch (e) {
      // Silent error handling
    }
  }
  return undefined;
}

// Create payment intent for mobile
export const createPaymentIntentService = async (req: Request, res: Response) => {
  try {
    // Extract userId from the authenticated user in the request
    if (!req.user) {
      return { success: false, message: "Authentication required. User not found in request." };
    }
    
    const userId = (req.user as JwtPayload).id;
    const { productId, paymentMethodType } = req.body;
    
    if (!productId) {
      return { success: false, message: "Product ID is required" };
    }
    
    console.log(`Creating payment intent for user ${userId} and product ${productId}`);
    
    // Get product from Stripe
    const stripeProduct = await stripe.products.retrieve(productId);
    if (!stripeProduct.active) {
      return { success: false, message: "Product is not active" };
    }
    
    // Get price from product
    const priceId = stripeProduct.default_price as string;
    if (!priceId) {
      return { success: false, message: "Product has no default price" };
    }
    
    const price = await stripe.prices.retrieve(priceId);
    
    // Get or create customer
    let stripeCustomerId;
    const user = await usersModel.findById(userId);
    
    if (!user) {
      return { success: false, message: "User not found in database" };
    }
    
    // Check if user already has a Stripe customer ID
    const existingStripeCustomerId = user.get('stripeCustomerId');
    if (existingStripeCustomerId) {
      stripeCustomerId = existingStripeCustomerId;
    } else {
      // Create a new customer
      const customer = await stripe.customers.create({
        email: user.email,
        name: user.userName || user.email,
        metadata: {
          userId: userId.toString()
        }
      });
      
      stripeCustomerId = customer.id;
      
      // Update user with Stripe customer ID
      await usersModel.findByIdAndUpdate(userId, {
        stripeCustomerId: customer.id
      });
    }
    
    // Create payment intent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: price.unit_amount || 0,
      currency: price.currency,
      customer: stripeCustomerId,
      payment_method_types: getPaymentMethodTypes(paymentMethodType),
      metadata: {
        userId: userId.toString(),
        productId: productId,
        priceId: priceId,
        planType: stripeProduct.metadata.plan_type || "basic"
      }
    });
    
    return {
      success: true,
      message: "Payment intent created successfully",
      data: {
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
        amount: paymentIntent.amount / 100,
        currency: paymentIntent.currency
      }
    };
  } catch (error) {
    console.error("Error creating payment intent:", error);
    return { success: false, message: `Failed to create payment intent: ${(error as Error).message}` };
  }
};

// Helper function to determine payment method types based on the selected option
function getPaymentMethodTypes(paymentMethodType: string | undefined): string[] {
  switch (paymentMethodType) {
    case 'card':
      return ['card'];
    case 'googlepay':
      return ['card', 'google_pay'];
    case 'applepay':
      return ['card', 'apple_pay'];
    case 'inline':
    default:
      // Return all supported payment methods (excluding PayPal)
      return ['card', 'google_pay', 'apple_pay'];
  }
}







