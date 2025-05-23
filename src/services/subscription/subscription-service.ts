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
// const SUBSCRIPTION_PRICE_IDS: Record<DatingSubscriptionPlan, string | null | undefined> = {
//   [DatingSubscriptionPlan.FREE]: null,
//   [DatingSubscriptionPlan.BASIC]: process.env.STRIPE_DATING_BASIC_PRICE_ID,
//   [DatingSubscriptionPlan.PREMIUM]: process.env.STRIPE_DATING_PREMIUM_PRICE_ID,
//   [DatingSubscriptionPlan.VIP]: process.env.STRIPE_DATING_VIP_PRICE_ID,
// };

// Create a subscription checkout session
export const createSubscriptionCheckoutService = async (req: Request, res: Response) => {
  try {
    const { plan } = req.body;
    if (!req.user) {
      return { success: false, message: "User data not found in request" };
    }
    
    // Extract userId from the JWT payload
    const { id: userId } = req.user as JwtPayload;
    
    console.log(`Creating checkout for User: ${userId}, Plan: ${plan}`);
    
    // Convert plan to uppercase to match enum
    const normalizedPlan = plan.toUpperCase();
    
    if (!Object.values(DatingSubscriptionPlan).includes(normalizedPlan as DatingSubscriptionPlan)) {
      console.error(`Invalid plan: ${plan}, normalized: ${normalizedPlan}`);
      return { success: false, message: "Invalid subscription plan" };
    }

    if (normalizedPlan === DatingSubscriptionPlan.FREE) {
      return { success: false, message: "Cannot create checkout for free plan" };
    }

    const typedPlan = normalizedPlan as DatingSubscriptionPlan;
    
    // Get user
    const user = await usersModel.findById(userId);
    if (!user) {
      return { success: false, message: "User not found" };
    }

    // Get or create subscription record
    let subscription = await DatingSubscription.findOne({ user: userId });
    if (!subscription) {
      subscription = await DatingSubscription.create({
        user: userId,
        plan: DatingSubscriptionPlan.FREE
      });
    }

    // Create or get Stripe customer
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

    // Create checkout session with inline price data
    const session = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `${typedPlan} Dating Subscription`,
              description: `Access to ${typedPlan} dating features`,
            },
            unit_amount: getPlanPrice(typedPlan),
            recurring: {
              interval: 'month',
            },  
          },
          quantity: 1,
        },
      ],
      mode: "subscription",
      success_url: `${process.env.FRONTEND_URL}/subscription/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL}/subscription/cancel`,
      metadata: {
        userId: userId.toString(),
        plan: plan
      }
    });

    // Create a pending transaction record
    await Transaction.create({
      user: userId,
      type: TransactionType.DATING_SUBSCRIPTION,
      amount: getPlanPrice(typedPlan) / 100, // Convert from cents to dollars
      status: TransactionStatus.PENDING,
      reference: {
        model: 'DatingSubscription',
        id: subscription._id
      },
      stripeCustomerId: stripeCustomerId,
      stripeSessionId: session.id,
      metadata: {
        plan: typedPlan,
        checkoutCreated: new Date()
      }
    });

    return {
      success: true,
      url: session.url,
      sessionId: session.id
    };
  } catch (error) {
    console.error("Subscription checkout error:", error);
    return { success: false, message: `Failed to create checkout session: ${(error as Error).message}` };
  }
};

// Handle subscription webhook events
export const handleSubscriptionWebhookService = async (req: Request, res: Response) => {
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
    } catch (err) {
      return { success: false, message: `Webhook signature verification failed: ${(err as Error).message}` };
    }
    
    // Handle the event
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        
        await Transaction.findOneAndUpdate(
          { stripeSessionId: session.id },
          { 
            status: TransactionStatus.SUCCESS,
            stripeSubscriptionId: session.subscription as string,
            metadata: {
              ...session.metadata,
              completedAt: new Date()
            }
          }
        );
        
        await handleSuccessfulCheckout(session);
        break;
      }
      case "checkout.session.expired": {
        const session = event.data.object as Stripe.Checkout.Session;
        
        await Transaction.findOneAndUpdate(
          { stripeSessionId: session.id },
          { 
            status: TransactionStatus.FAILED,
            metadata: {
              ...session.metadata,
              expiredAt: new Date(),
              reason: "Checkout session expired"
            }
          }
        );
        break;
      }
      case "invoice.paid": {
        const invoice = event.data.object as Stripe.Invoice;
        
        if (invoice.subscription) {
          const subscription = await DatingSubscription.findOne({ 
            stripeSubscriptionId: invoice.subscription as string 
          });
          
          if (subscription) {
            await Transaction.create({
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
                paidAt: new Date()
              }
            });
          }
        }
        
        await handleSuccessfulPayment(invoice);
        break;
      }
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        
        if (invoice.subscription) {
          const subscription = await DatingSubscription.findOne({ 
            stripeSubscriptionId: invoice.subscription as string 
          });
          
          if (subscription) {
            await Transaction.create({
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
                plan: subscription.plan,
                isRenewal: true,
                failedAt: new Date(),
                reason: await getInvoicePaymentErrorMessage(invoice) || "Payment failed"
              }
            });
          }
        }
        break;
      }
      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionUpdated(subscription);
        break;
      }
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const datingSubscription = await DatingSubscription.findOne({ 
          stripeSubscriptionId: subscription.id 
        });
        
        if (datingSubscription) {
          await Transaction.create({
            user: datingSubscription.user,
            type: TransactionType.DATING_SUBSCRIPTION,
            amount: 0,
            status: TransactionStatus.CANCELLED,
            reference: {
              model: 'DatingSubscription',
              id: datingSubscription._id
            },
            stripeCustomerId: datingSubscription.stripeCustomerId,
            stripeSubscriptionId: subscription.id,
            metadata: {
              previousPlan: datingSubscription.plan,
              cancelledAt: new Date()
            }
          });
        }
        
        await handleSubscriptionCancelled(subscription);
        break;
      }
      default:
        // No action needed for unhandled event types
    }

    return { success: true, message: "Webhook processed successfully" };
  } catch (err: any) {
    return { success: false, message: `Webhook Error: ${err.message}` };
  }
};

// Get user subscription details
export const getUserSubscriptionService = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return { success: false, message: "User data not found in request" };
    }
    const { id: userId } = req.user as JwtPayload;
    
    const subscription = await DatingSubscription.findOne({ user: userId });
    if (!subscription) {
      return { success: false, message: "Subscription not found" };
    }

    return {
      success: true,
      subscription: {
        plan: subscription.plan,
        isActive: subscription.isActive,
        startDate: subscription.startDate,
        endDate: subscription.endDate,
        features: subscription.features,
        autoRenew: subscription.autoRenew
      }
    };
  } catch (error) {
    console.error("Get subscription error:", error);
    return { success: false, message: "Failed to get subscription details" };
  }
};

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
    console.error("Cancel subscription error:", error);
    return { success: false, message: "Failed to cancel subscription" };
  }
};

// Helper functions for webhook handling
async function handleSuccessfulCheckout(session: Stripe.Checkout.Session) {
  try {    
    if (!session.metadata?.userId || !session.metadata?.plan) {
      return;
    }

    const userId = session.metadata.userId;
    const plan = session.metadata.plan as DatingSubscriptionPlan;
    const subscriptionId = session.subscription as string;

    const subscription = await DatingSubscription.findOne({ user: userId });
    if (!subscription) {
      return;
    }

    const stripeSubscription = await stripe.subscriptions.retrieve(subscriptionId);
    const currentPeriodEnd = new Date(stripeSubscription.current_period_end * 1000);
    subscription.plan = plan;
    subscription.stripeSubscriptionId = subscriptionId;
    subscription.isActive = true;
    subscription.startDate = new Date();
    subscription.endDate = currentPeriodEnd;
    subscription.autoRenew = true;
    
    if (plan === DatingSubscriptionPlan.BASIC) {
      subscription.features = {
        dailyLikes: 30,
        superLikesPerDay: 1,
        boostsPerMonth: 0,
        seeWhoLikesYou: false,
        advancedFilters: false
      };
      subscription.price = 9.99;
    } else if (plan === DatingSubscriptionPlan.PREMIUM) {
      subscription.features = {
        dailyLikes: 100,
        superLikesPerDay: 5,
        boostsPerMonth: 1,
        seeWhoLikesYou: true,
        advancedFilters: false
      };
      subscription.price = 19.99;
    } else if (plan === DatingSubscriptionPlan.VIP) {
      subscription.features = {
        dailyLikes: 200,
        superLikesPerDay: 10,
        boostsPerMonth: 3,
        seeWhoLikesYou: true,
        advancedFilters: true
      };
      subscription.price = 29.99;
    }

    await subscription.save();
  } catch (error) {
    // Error handling without console logs
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

// Helper function to get plan prices in cents
function getPlanPrice(plan: DatingSubscriptionPlan): number {
  switch(plan) {
    case DatingSubscriptionPlan.BASIC:
      return 999; // $9.99
    case DatingSubscriptionPlan.PREMIUM:
      return 1999; // $19.99
    case DatingSubscriptionPlan.VIP:
      return 2999; // $29.99
    default:
      return 999;
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













