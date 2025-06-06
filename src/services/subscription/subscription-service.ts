

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

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
  apiVersion: "2025-02-24.acacia",
});



// Create a checkout session for subscription
export const createCheckoutSessionService = async (req: Request, res: Response) => {
  try {
    const { productId } = req.body;
    if (!req.user) {
      return { success: false, message: "User data not found in request" };
    }
    
    const { id: userId, email } = req.user as JwtPayload;
    
    if (!productId) {
      return { success: false, message: "Product ID is required" };
    }
    
    console.log(`Creating checkout for product: ${productId}`);
    const stripeProduct = await stripe.products.retrieve(productId);
    console.log(`Retrieved product: ${stripeProduct.name}`);

    if (!stripeProduct.default_price) {
      return { success: false, message: "No price found for this product" };
    }

    const priceDetails = await stripe.prices.retrieve(
      stripeProduct.default_price as string
    );
    console.log(
      `Retrieved price: ${priceDetails.id}, ${priceDetails.unit_amount} ${priceDetails.currency}`
    );

    // Determine plan type from product metadata
    let planType = DatingSubscriptionPlan.BASIC;
    if (stripeProduct.metadata && stripeProduct.metadata.plan_type) {
      const metadataPlan = stripeProduct.metadata.plan_type.toUpperCase();
      if (Object.values(DatingSubscriptionPlan).includes(metadataPlan as DatingSubscriptionPlan)) {
        planType = metadataPlan as DatingSubscriptionPlan;
      }
    }

    // Find or create Stripe customer
    let customer;
    const existingCustomers = await stripe.customers.list({
      email,
      limit: 1,
    });

    if (existingCustomers.data.length > 0) {
      customer = existingCustomers.data[0];
      console.log(`Using existing customer: ${customer.id}`);
    } else {
      customer = await stripe.customers.create({
        email,
        metadata: {
          userId: userId,
        },
      });
      console.log(`Created new customer: ${customer.id}`);
    }

    // Create a PaymentIntent for mobile clients
    const paymentIntent = await stripe.paymentIntents.create({
      amount: priceDetails.unit_amount ?? 0,
      currency: priceDetails.currency,
      customer: customer.id,
      setup_future_usage: "off_session",
      metadata: {
        userId: userId,
        productId: productId,
        priceId: priceDetails.id,
        planType: planType
      },
      automatic_payment_methods: {
        enabled: true,
      },
    });
    console.log(`Created payment intent: ${paymentIntent.id}`);

    // Get or create subscription record
    let subscription = await DatingSubscription.findOne({ user: userId });
    if (!subscription) {
      subscription = await DatingSubscription.create({
        user: userId,
        plan: DatingSubscriptionPlan.FREE,
        stripeCustomerId: customer.id
      });
    } else if (!subscription.stripeCustomerId) {
      subscription.stripeCustomerId = customer.id;
      await subscription.save();
    }
    console.log(subscription,"subscription in checkout session service")
    // Create a pending transaction record
    await Transaction.create({
      user: userId,
      type: TransactionType.DATING_SUBSCRIPTION,
      amount: priceDetails.unit_amount ? priceDetails.unit_amount / 100 : 0,
      status: TransactionStatus.PENDING,
      reference: {
        model: 'DatingSubscription',
        id: subscription._id
      },
      stripeCustomerId: customer.id,
      stripePaymentIntentId: paymentIntent.id,
      metadata: {
        plan: planType,
        productId: productId,
        priceId: priceDetails.id,
        checkoutCreated: new Date()
      }
    });

    console.log(Transaction,"transaction created at checkout session")

    return {
      success: true,
      message: "PaymentIntent created successfully",
      data: {
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
        customer: customer.id,
        productDetails: {
          id: productId,
          name: stripeProduct.name,
          description: stripeProduct.description,
          currency: priceDetails.currency,
          unitAmount: priceDetails.unit_amount,
          type: priceDetails.type,
          interval: priceDetails.recurring?.interval,
        },
      }
    };
  } catch (error) {
    console.error("Checkout session error:", error);
    return { success: false, message: `Failed to create payment intent: ${(error as Error).message}` };
  }
};


// Handle stripe success
export const stripeSuccessService = async (req: Request, res: Response) => {
  try {
    const { payment_intent } = req.query;
    
    console.log("Success route called with payment_intent:", payment_intent);
    
    if (!payment_intent) {
      console.log("No payment_intent provided in query params");
      return { success: false, message: "Payment Intent ID is required" };
    }
    
    if (!req.user) {
      console.log("No user data found in request");
      return { success: false, message: "User data not found in request" };
    }
    
    const { id: userId } = req.user as JwtPayload;
    console.log(`Processing success for user ${userId} and payment intent ${payment_intent}`);
    
    // Retrieve the payment intent from Stripe
    let paymentIntent;
    try {
      paymentIntent = await stripe.paymentIntents.retrieve(payment_intent as string);
      console.log("Retrieved payment intent:", paymentIntent.id, "Status:", paymentIntent.status);
    } catch (error) {
      console.error("Error retrieving payment intent:", error);
      return { success: false, message: "Invalid payment intent ID" };
    }
    
    // Check if payment intent belongs to user
    if (paymentIntent.metadata?.userId !== userId.toString()) {
      console.log(`Payment intent ${paymentIntent.id} does not belong to user ${userId}`);
      return { success: false, message: "Payment intent does not belong to this user" };
    }
    
    // Get transaction status - DO NOT UPDATE IT
    const transaction = await Transaction.findOne({ stripePaymentIntentId: payment_intent });
    
    // Get subscription details
    const subscription = await DatingSubscription.findOne({ user: userId });
    
    return {
      success: true,
      message: "Payment processed",
      data: {
        paymentIntent: {
          id: paymentIntent.id,
          status: paymentIntent.status,
          amount: paymentIntent.amount / 100,
          currency: paymentIntent.currency
        },
        transaction: transaction ? {
          status: transaction.status,
          createdAt: transaction.createdAt
        } : null,
        subscription: subscription ? {
          plan: subscription.plan,
          isActive: subscription.isActive,
          startDate: subscription.startDate,
          endDate: subscription.endDate
        } : null
      }
    };
  } catch (error) {
    console.error("Error in stripeSuccessService:", error);
    return { success: false, message: `Failed to process success: ${(error as Error).message}` };
  }
};

// Handle payment intent cancellation
export const stripeCancelService = async (req: Request, res: Response) => {
  try {
    const { payment_intent_id } = req.query;
    
    if (!payment_intent_id) {
      return { success: false, message: "Payment Intent ID is required" };
    }
    
    // Update transaction status
    await Transaction.findOneAndUpdate(
      { stripePaymentIntentId: payment_intent_id },
      { 
        status: TransactionStatus.CANCELLED,
        metadata: {
          cancelledAt: new Date(),
          reason: "User cancelled payment"
        }
      }
    );
    
    // Cancel the payment intent in Stripe
    await stripe.paymentIntents.cancel(payment_intent_id as string);
    
    return {
      success: true,
      message: "Payment cancelled"
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
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET as string;
  let event;

  try {
    // Log incoming webhook data for debugging
    console.log("Webhook received:", {
      headers: req.headers["stripe-signature"] ? "Has signature" : "No signature",
      bodyType: typeof req.body
    });

    if (!signature || !endpointSecret) {
      console.error("Missing signature or endpoint secret");
      return { 
        success: false, 
        message: "Stripe signature or endpoint secret missing" 
      };
    }

    // Verify the webhook signature
    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        signature,
        endpointSecret
      );
      console.log("Webhook event constructed:", event.type);
    } catch (err: any) {
      console.error("Webhook signature verification failed:", err.message);
      return { 
        success: false, 
        message: `Webhook Error: ${err.message}` 
      };
    }

    // Log the event type and data for debugging
    console.log(`Processing webhook event: ${event.type}`);
    
    // Handle different event types
  switch (event.type) {
  case "payment_intent.succeeded":
    const paymentIntent = event.data.object as any;
    console.log("Payment intent succeeded:", paymentIntent.id);
    console.log("Metadata:", paymentIntent.metadata);
    console.log("Payment intent:", paymentIntent);
    
    if (!paymentIntent.metadata || !paymentIntent.metadata.userId || !paymentIntent.metadata.productId) {
      console.error("Missing required metadata in payment intent");
      return { success: false, message: "Missing required metadata in payment intent" };
    }

    const { userId, productId, priceId, planType } = paymentIntent.metadata;

    // Find the existing subscription
    const subscription = await DatingSubscription.findOne({ user: userId });
    
    // Get product and price details
    const product = await stripe.products.retrieve(productId);
    const price = priceId
      ? await stripe.prices.retrieve(priceId)
      : product.default_price
      ? await stripe.prices.retrieve(product.default_price as string)
      : null;

    if (!price) {
      console.error("No price found for product", productId);
      return { success: false, message: "No price found for product" };
    }

    // Calculate subscription dates
    const startDate = new Date();
    const endDate = new Date();
    
    if (price.recurring) {
      const { interval, interval_count } = price.recurring;
      if (interval === "day")
        endDate.setDate(endDate.getDate() + (interval_count || 1));
      else if (interval === "week")
        endDate.setDate(endDate.getDate() + (interval_count || 1) * 7);
      else if (interval === "month")
        endDate.setMonth(endDate.getMonth() + (interval_count || 1));
      else if (interval === "year")
        endDate.setFullYear(endDate.getFullYear() + (interval_count || 1));
    } else {
      endDate.setDate(endDate.getDate() + 30);
    }

  const transaction = await Transaction.findOne({ stripePaymentIntentId: paymentIntent.id });
  if (transaction) {
    // Update existing transaction
    transaction.status = TransactionStatus.SUCCESS;
    transaction.metadata = {
      ...transaction.metadata,
      completedAt: new Date()
    };
    await transaction.save();
    console.log(`Updated transaction ${transaction._id} to SUCCESS`);
    } else {
      // Create new transaction
      await createTransaction({
      user: userId,
      type: TransactionType.DATING_SUBSCRIPTION,
      amount: paymentIntent.amount / 100,
      status: TransactionStatus.SUCCESS,
      stripeCustomerId: paymentIntent.customer as string,
      stripePaymentIntentId: paymentIntent.id,
      paymentMethod: "card",
      reference: {
        model: 'DatingSubscription',
        id: subscription ? subscription._id : null // Will be updated after subscription creation
      },
      metadata: {
        plan: planType || product.metadata?.plan_type || DatingSubscriptionPlan.BASIC,
        productId,
        priceId: price.id,
        paidAt: new Date()
      }
    });
    }
    break;
  default:
    console.log(`Unhandled event type: ${event.type}`);
}

    return { success: true, message: "Webhook processed successfully" };
  } catch (error) {
    console.error("Webhook error:", error);
    return { success: false, message: `Failed to process webhook: ${(error as Error).message}` };
  }
};


// Handle payment_intent.succeeded
async function handlePaymentIntentSucceeded(paymentIntent: Stripe.PaymentIntent) {
  console.log("Payment intent succeeded:", paymentIntent.id);
  console.log("Metadata:", paymentIntent.metadata);

  // Make sure we have the required metadata
  if (
    !paymentIntent.metadata ||
    !paymentIntent.metadata.userId ||
    !paymentIntent.metadata.productId
  ) {
    console.error("Missing required metadata in payment intent");
    return;
  }

  const { userId, productId, priceId, planType } = paymentIntent.metadata;

  // Find the existing subscription
  const subscription = await DatingSubscription.findOne({ user: userId });
  
  // Get product and price details
  const product = await stripe.products.retrieve(productId);
  const price = priceId
    ? await stripe.prices.retrieve(priceId)
    : product.default_price
    ? await stripe.prices.retrieve(product.default_price as string)
    : null;

  if (!price) {
    console.error("No price found for product", productId);
    return;
  }

  // Calculate subscription dates
  const startDate = new Date();
  const endDate = new Date();
  
  if (price.recurring) {
    const { interval, interval_count } = price.recurring;
    if (interval === "day")
      endDate.setDate(endDate.getDate() + (interval_count || 1));
    else if (interval === "week")
      endDate.setDate(endDate.getDate() + (interval_count || 1) * 7);
    else if (interval === "month")
      endDate.setMonth(endDate.getMonth() + (interval_count || 1));
    else if (interval === "year")
      endDate.setFullYear(endDate.getFullYear() + (interval_count || 1));
  } else {
    // Default to 30 days for one-time payments
    endDate.setDate(endDate.getDate() + 30);
  }

  // Update or create transaction
  const transaction = await Transaction.findOne({ stripePaymentIntentId: paymentIntent.id });
  
  if (transaction) {
    // Update existing transaction
    transaction.status = TransactionStatus.SUCCESS;
    transaction.metadata = {
      ...transaction.metadata,
      completedAt: new Date()
    };
    await transaction.save();
    console.log(`Updated transaction ${transaction._id} to SUCCESS`);
  } else {
    // Create new transaction
    await createTransaction({
      user: userId,
      type: TransactionType.DATING_SUBSCRIPTION,
      amount: paymentIntent.amount / 100,
      status: TransactionStatus.SUCCESS,
      stripeCustomerId: paymentIntent.customer as string,
      stripePaymentIntentId: paymentIntent.id,
      paymentMethod: "card",
      reference: {
        model: 'DatingSubscription',
        id: subscription ? subscription._id : null // Will be updated after subscription creation
      },
      metadata: {
        plan: planType || product.metadata?.plan_type || DatingSubscriptionPlan.BASIC,
        productId,
        priceId: price.id,
        paidAt: new Date()
      }
    });
  }

  // Update or create subscription
  if (subscription) {
    // Update existing subscription
    subscription.plan = planType as DatingSubscriptionPlan || 
                        product.metadata?.plan_type as DatingSubscriptionPlan || 
                        DatingSubscriptionPlan.BASIC;
    subscription.isActive = true;
    subscription.startDate = startDate;
    subscription.endDate = endDate;
    // subscription.stripeProductId = productId;
    // subscription.stripePriceId = price.id;
    subscription.stripeCustomerId = paymentIntent.customer as string;
    await subscription.save();
    
    console.log(`Updated subscription for user ${userId}`);
  } else {
    // Create new subscription
    const newSubscription = await DatingSubscription.create({
      user: userId,
      plan: planType as DatingSubscriptionPlan || 
            product.metadata?.plan_type as DatingSubscriptionPlan || 
            DatingSubscriptionPlan.BASIC,
      isActive: true,
      startDate,
      endDate,
      stripeProductId: productId,
      stripePriceId: price.id,
      stripeCustomerId: paymentIntent.customer as string,
      paymentMethod: "card",
      features: {}  // Add default features if needed
    });
    
    // If we created a transaction without a subscription reference, update it
    if (!subscription) {
      await Transaction.findOneAndUpdate(
        { stripePaymentIntentId: paymentIntent.id },
        { 
          'reference.id': newSubscription._id 
        }
      );
    }
    
    console.log(`Created new subscription for user ${userId}`);
  }
}

async function handlePaymentIntentCanceled(paymentIntent: Stripe.PaymentIntent) {
  console.log("Payment intent canceled:", paymentIntent.id);
  
  // Update transaction status to CANCELLED
  await Transaction.findOneAndUpdate(
    { stripePaymentIntentId: paymentIntent.id },
    { 
      status: TransactionStatus.CANCELLED,
      metadata: {
        canceledAt: new Date(),
        reason: "Payment intent canceled"
      }
    }
  );
  
  console.log(`Updated transaction for canceled payment ${paymentIntent.id}`);
}
// Handle payment_intent.payment_failed
async function handlePaymentIntentFailed(paymentIntent: Stripe.PaymentIntent) {
  console.log("Payment intent failed:", paymentIntent.id);
  
  // Update transaction status to FAILED
  await Transaction.findOneAndUpdate(
    { stripePaymentIntentId: paymentIntent.id },
    { 
      status: TransactionStatus.FAILED,
      metadata: {
        failedAt: new Date(),
        failureMessage: paymentIntent.last_payment_error?.message || "Payment failed"
      }
    }
  );
  
  console.log(`Updated transaction for failed payment ${paymentIntent.id}`);
}

// Helper function to create a transaction
async function createTransaction(data: any) {
  const transaction = await Transaction.create(data);
  console.log(`Created transaction ${transaction._id}`);
  return transaction;
}
// Cancel subscription
export const cancelSubscriptionService = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return { success: false, message: "User data not found in request" };
    }
    const { id: userId } = req.user as JwtPayload;
    
    const subscription = await DatingSubscription.findOne({ user: userId });
    if (!subscription) {
      return { success: false, message: "No active subscription found" };
    }

    // If using PaymentIntents only (no Stripe Subscriptions)
    subscription.isActive = false;
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
      metadata: {
        plan: subscription.plan,
        cancelRequestedAt: new Date(),
        effectiveUntil: subscription.endDate
      }
    });

    return { success: true, message: "Subscription has been cancelled" };
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



// Create payment intent for mobile
export const createPaymentIntentService = async (req: Request, res: Response) => {
  try {
    // Extract userId from the authenticated user in the request
    if (!req.user) {
      return { success: false, message: "Authentication required. User not found in request." };
    }
    
    const userId = (req.user as JwtPayload).id;
    const { productId } = req.body; // Remove paymentMethodType parameter
    
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
    
    // Create payment intent with only card payment method
    const paymentIntent = await stripe.paymentIntents.create({
      amount: price.unit_amount || 0,
      currency: price.currency,
      customer: stripeCustomerId,
      payment_method_types: ['card'], // Only use card payment method
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

