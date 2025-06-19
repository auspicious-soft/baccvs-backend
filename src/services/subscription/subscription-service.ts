

import { Request, Response } from "express";
import { JwtPayload } from "jsonwebtoken";
import dotenv from "dotenv";
import QRCode from "qrcode"; 
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
import { purchaseModel } from "src/models/purchase/purchase-schema";
import { eventModel } from "src/models/event/event-schema";
import { ticketModel } from "src/models/ticket/ticket-schema";
import mongoose from "mongoose";
import { errorResponseHandler } from "src/lib/errors/error-response-handler";
import { resellModel } from "src/models/resell/resell-schema";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
  apiVersion: "2025-02-24.acacia",
});

// Create a checkout session for subscription
export const createCheckoutSessionService = async (req: Request, res: Response) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { paymentType, productId, ticketId, eventId, quantity, amount, resaleId } = req.body;

    if (!req.user) {
      throw new Error("User data not found in request");
    }

    const { id: userId, email } = req.user as JwtPayload;

    // Get or create Stripe customer
    let stripeCustomerId;
    const user = await usersModel.findById(userId).session(session);
    if (!user) {
      throw new Error("User not found in database");
    }

    if (user.stripeCustomerId) {
      stripeCustomerId = user.stripeCustomerId;
      console.log(`Using existing customer: ${stripeCustomerId}`);
    } else {
      const customer = await stripe.customers.create({
        email,
        name: user.userName || email,
        metadata: { userId },
      });
      stripeCustomerId = customer.id;
      await usersModel.findByIdAndUpdate(userId, { stripeCustomerId }, { session });
      console.log(`Created new customer: ${stripeCustomerId}`);
    }

    let paymentIntent;
    let transactionData: any = {
      user: userId,
      stripeCustomerId,
      status: TransactionStatus.PENDING,
      currency: "usd",
    };

    if (paymentType === "SUBSCRIPTION") {
      // ... existing subscription code remains the same ...
      if (!productId) {
        throw new Error("Product ID is required for subscription");
      }

      console.log(`Creating checkout for product: ${productId}`);
      const stripeProduct = await stripe.products.retrieve(productId);
      if (!stripeProduct.active) {
        throw new Error("Product is not active");
      }

      if (!stripeProduct.default_price) {
        throw new Error("No price found for this product");
      }

      const priceDetails = await stripe.prices.retrieve(stripeProduct.default_price as string);
      if (priceDetails.currency.toLowerCase() !== "usd") {
        throw new Error("Only USD currency is supported");
      }

      console.log(`Retrieved price: ${priceDetails.id}, ${priceDetails.unit_amount} USD`);

      let planType = DatingSubscriptionPlan.BASIC;
      if (stripeProduct.metadata?.plan_type) {
        const metadataPlan = stripeProduct.metadata.plan_type.toUpperCase();
        if (Object.values(DatingSubscriptionPlan).includes(metadataPlan as DatingSubscriptionPlan)) {
          planType = metadataPlan as DatingSubscriptionPlan;
        }
      }

      // Get or create subscription record
      let subscription = await DatingSubscription.findOne({ user: userId }).session(session);
      if (!subscription) {
        const createdSubscriptions = await DatingSubscription.create([{
          user: userId,
          plan: DatingSubscriptionPlan.FREE,
          stripeCustomerId,
          isActive: false,
        }], { session });
        subscription = createdSubscriptions[0];
      } else if (!subscription.stripeCustomerId) {
        subscription.stripeCustomerId = stripeCustomerId;
        await subscription.save({ session });
      }

      // Create PaymentIntent for subscription
      paymentIntent = await stripe.paymentIntents.create({
        amount: priceDetails.unit_amount ?? 0,
        currency: "usd",
        customer: stripeCustomerId,
        setup_future_usage: "off_session",
        metadata: {
          userId,
          productId,
          priceId: priceDetails.id,
          planType,
        },
      });

      transactionData = {
        ...transactionData,
        type: TransactionType.DATING_SUBSCRIPTION,
        amount: priceDetails.unit_amount ? priceDetails.unit_amount / 100 : 0,
        reference: { model: "DatingSubscription", id: subscription._id },
        stripePaymentIntentId: paymentIntent.id,
        metadata: {
          plan: planType,
          productId,
          priceId: priceDetails.id,
          checkoutCreated: new Date(),
        },
      };

      await Transaction.create([transactionData], { session });
      console.log(`Created transaction for subscription payment intent: ${paymentIntent.id}`);

      await session.commitTransaction();

      return {
        success: true,
        message: "PaymentIntent created successfully",
        data: {
          clientSecret: paymentIntent.client_secret,
          paymentIntentId: paymentIntent.id,
          customer: stripeCustomerId,
          productDetails: {
            id: productId,
            name: stripeProduct.name,
            description: stripeProduct.description,
            currency: "usd",
            unitAmount: priceDetails.unit_amount,
            type: priceDetails.type,
            interval: priceDetails.recurring?.interval,
          },
        },
      };
    } else if (paymentType === "BULK_PURCHASE") {
      // ... existing bulk purchase code remains the same ...
      if (!ticketId || !eventId || !quantity || !amount) {
        throw new Error("Ticket ID, event ID, quantity, and amount are required for bulk purchase");
      }

      // Validate ticket and event
      const ticket = await ticketModel.findById(ticketId).session(session);
      const event = await eventModel.findById(eventId).session(session);

      if (!ticket) {
        return errorResponseHandler("Invalid ticket ID", 400, res);
      }
      if (!event) {
        return errorResponseHandler("Invalid event ID", 400, res);
      }
      if (ticket.event.toString() !== eventId) {
        return errorResponseHandler("Ticket does not belong to the specified event", 400, res);
      }
      if (ticket.available < Number(quantity)) {
        return errorResponseHandler(`Only ${ticket.available} tickets available for this event`, 400, res);
      }
      if (ticket.price !== amount) {
        return errorResponseHandler("Ticket price does not match the provided amount", 400, res);
      }
      if (event.capacity < quantity) {
        return errorResponseHandler(`Event capacity is only ${event.capacity} tickets`, 400, res);
      }
      
      if (amount <= 0 || quantity <= 0) {
        return errorResponseHandler("Amount and quantity must be greater than zero", 400, res);
      }
      
      const totalAmount = amount * 100 * quantity;

      console.log(`Creating bulk purchase for ${quantity} tickets, total: ${totalAmount} USD`);

      // Create PaymentIntent for bulk purchase
      paymentIntent = await stripe.paymentIntents.create({
        amount: totalAmount,
        currency: "usd",
        customer: stripeCustomerId,
        metadata: {
          userId,
          ticketId,
          eventId,
          quantity,
          type: "BULK_PURCHASE",
        },
      });

      // Create purchase record
      const purchaseDocs = await purchaseModel.create([{
        ticket: ticketId,
        event: eventId,
        buyer: userId,
        quantity,
        totalPrice: totalAmount / 100,
        qrCode: "PENDING", // Updated in webhook
        isActive: true,
        isResale: ticket.isResellable,
        status: "pending", // Updated in webhook
      }], { session });
      const purchase = purchaseDocs[0];

      transactionData = {
        ...transactionData,
        type: TransactionType.EVENT_TICKET,
        amount: totalAmount / 100,
        reference: { model: "purchase", id: purchase._id },
        stripePaymentIntentId: paymentIntent.id,
        metadata: {
          ticketId,
          eventId,
          quantity,
          checkoutCreated: new Date(),
        },
      };

      await Transaction.create([transactionData], { session });
      console.log(`Created transaction for bulk purchase payment intent: ${paymentIntent.id}`);

      await session.commitTransaction();

      return {
        success: true,
        message: "PaymentIntent created successfully for bulk purchase",
        data: {
          clientSecret: paymentIntent.client_secret,
          paymentIntentId: paymentIntent.id,
          customer: stripeCustomerId,
          purchaseDetails: {
            ticketId,
            eventId,
            quantity,
            totalAmount,
            currency: "usd",
            ticketName: ticket.name,
            eventTitle: event.title,
          },
        },
      };
    } else if (paymentType === "RESALE_PURCHASE") {
      // NEW: Handle resale ticket purchase
      if (!resaleId || !quantity || !amount) {
        throw new Error("Resale ID, quantity, and amount are required for resale purchase");
      }

      // Validate resale listing
      const resaleListing = await resellModel.findById(resaleId)
        .populate('originalPurchase')
        .session(session);

      if (!resaleListing) {
        return errorResponseHandler("Invalid resale listing ID", 400, res);
      }

      if (resaleListing.status !== 'available') {
        return errorResponseHandler("Resale listing is not available or been sold or cancelled", 400, res);
      }

      if (resaleListing.availableQuantity < Number(quantity)) {
        return errorResponseHandler(`Only ${resaleListing.availableQuantity} tickets available for resale`, 400, res);
      }

      if (resaleListing.price !== amount) {
        return errorResponseHandler("Resale price does not match the provided amount", 400, res);
      }

      // Check if buyer is not the original seller
      const originalPurchase = resaleListing.originalPurchase as any;
      if (originalPurchase.buyer.toString() === userId) {
        return errorResponseHandler("You cannot buy your own resale listing", 400, res);
      }

      if (amount <= 0 || quantity <= 0) {
        return errorResponseHandler("Amount and quantity must be greater than zero", 400, res);
      }

      // Convert amount from dollars to cents
      const totalAmount = amount * 100 * quantity;

      console.log(`Creating resale purchase for ${quantity} tickets, total: ${totalAmount} USD`);

      // Get ticket and event details for metadata
      const ticket = await ticketModel.findById(originalPurchase.ticket).session(session);
      const event = await eventModel.findById(originalPurchase.event).session(session);

      if (!ticket || !event) {
        return errorResponseHandler("Associated ticket or event not found", 400, res);
      }

      // Create PaymentIntent for resale purchase
      paymentIntent = await stripe.paymentIntents.create({
        amount: totalAmount,
        currency: "usd",
        customer: stripeCustomerId,
        metadata: {
          userId,
          resaleId,
          ticketId: originalPurchase.ticket.toString(),
          eventId: originalPurchase.event.toString(),
          quantity,
          type: "RESALE_PURCHASE",
          originalSeller: originalPurchase.buyer.toString(),
        },
      });

      // Create new purchase record for resale buyer
      const purchaseDocs = await purchaseModel.create([{
        ticket: originalPurchase.ticket,
        event: originalPurchase.event,
        buyer: userId,
        quantity,
        totalPrice: totalAmount / 100,
        qrCode: "PENDING", // Updated in webhook
        isActive: true,
        isResale: false, // Resale tickets cannot be resold again
        status: "pending", // Updated in webhook
      }], { session });
      const purchase = purchaseDocs[0];

      transactionData = {
        ...transactionData,
        type: TransactionType.TICKET_RESALE,
        amount: totalAmount / 100,
        reference: { model: "purchase", id: purchase._id },
        stripePaymentIntentId: paymentIntent.id,
        metadata: {
          resaleId,
          ticketId: originalPurchase.ticket.toString(),
          eventId: originalPurchase.event.toString(),
          quantity,
          originalSeller: originalPurchase.buyer.toString(),
          checkoutCreated: new Date(),
        },
      };

      await Transaction.create([transactionData], { session });
      console.log(`Created transaction for resale purchase payment intent: ${paymentIntent.id}`);

      await session.commitTransaction();

      return {
        success: true,
        message: "PaymentIntent created successfully for resale purchase",
        data: {
          clientSecret: paymentIntent.client_secret,
          paymentIntentId: paymentIntent.id,
          customer: stripeCustomerId,
          purchaseDetails: {
            resaleId,
            ticketId: originalPurchase.ticket.toString(),
            eventId: originalPurchase.event.toString(),
            quantity,
            totalAmount,
            currency: "usd",
            ticketName: ticket.name,
            eventTitle: event.title,
            resalePrice: amount,
          },
        },
      };
    } else {
      throw new Error("Invalid payment type");
    }
  } catch (error) {
    await session.abortTransaction();
    console.error("Checkout session error:", error);
    return { success: false, message: `Failed to create payment intent: ${(error as Error).message}` };
  } finally {
    session.endSession();
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

  let event: Stripe.Event;
  try {
    if (!signature || !endpointSecret) {
      console.error("Missing signature or endpoint secret");
      return { success: false, message: "Stripe signature or endpoint secret missing" };
    }

    console.log("Webhook received:", {
      headers: signature ? "Has signature" : "No signature",
      bodyType: typeof req.body,
    });

    event = stripe.webhooks.constructEvent(req.body, signature, endpointSecret);
    console.log(`Webhook event constructed: ${event.type}`);
  } catch (err: any) {
    console.error("Webhook signature verification failed:", err.message);
    return res.status(400).json({ success: false, message: `Webhook Error: ${err.message}` });
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    switch (event.type) {
      case "payment_intent.succeeded": {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        console.log("Payment intent succeeded:", paymentIntent.id);

        if (paymentIntent.currency.toLowerCase() !== "usd") {
          throw new Error(`Non-USD currency detected: ${paymentIntent.currency}`);
        }

        if (!paymentIntent.metadata?.userId) {
          throw new Error("Missing userId in payment intent metadata");
        }

        const transaction = await Transaction.findOne({ stripePaymentIntentId: paymentIntent.id }).session(session);
        if (!transaction) {
          throw new Error("Transaction not found for payment intent: " + paymentIntent.id);
        }

        transaction.status = TransactionStatus.SUCCESS;
        transaction.metadata = { ...transaction.metadata, completedAt: new Date() };
        await transaction.save({ session });

        if (transaction.type === TransactionType.DATING_SUBSCRIPTION) {
          // ... existing subscription handling code remains the same ...
          const { productId, priceId, planType } = paymentIntent.metadata;
          if (!productId || !priceId) {
            throw new Error("Missing productId or priceId in payment intent metadata");
          }

          const product = await stripe.products.retrieve(productId);
          const price = await stripe.prices.retrieve(priceId);
          const subscription = await DatingSubscription.findOne({ user: paymentIntent.metadata.userId }).session(session);

          const startDate = new Date();
          const endDate = new Date();
          if (price.recurring) {
            const { interval, interval_count = 1 } = price.recurring;
            if (interval === "day") endDate.setDate(endDate.getDate() + interval_count);
            else if (interval === "week") endDate.setDate(endDate.getDate() + interval_count * 7);
            else if (interval === "month") endDate.setMonth(endDate.getMonth() + interval_count);
            else if (interval === "year") endDate.setFullYear(endDate.getFullYear() + interval_count);
          } else {
            endDate.setDate(endDate.getDate() + 30);
          }

          if (subscription) {
            subscription.plan = planType as DatingSubscriptionPlan || product.metadata?.plan_type || DatingSubscriptionPlan.BASIC;
            subscription.isActive = true;
            subscription.startDate = startDate;
            subscription.endDate = endDate;
            subscription.stripeCustomerId = paymentIntent.customer as string;
            subscription.stripeProductId = productId;
            subscription.stripePriceId = priceId;
            subscription.price = price.unit_amount ? price.unit_amount / 100 : 0;
            subscription.features = {
              ...product.metadata.features ? JSON.parse(product.metadata.features) : {},
            };
            await subscription.save({ session });
            console.log(`Updated subscription for user ${paymentIntent.metadata.userId}`);
          } else {
            const createdSubscriptions = await DatingSubscription.create([{
              user: paymentIntent.metadata.userId,
              plan: planType as DatingSubscriptionPlan || product.metadata?.plan_type || DatingSubscriptionPlan.BASIC,
              isActive: true,
              startDate,
              endDate,
              stripeCustomerId: paymentIntent.customer as string,
              stripeProductId: productId,
              stripePriceId: priceId,
              price: price.unit_amount ? price.unit_amount / 100 : 0,
              paymentMethod: "card",
              features: {
                ...product.metadata.features ? JSON.parse(product.metadata.features) : {},               
              },
            }], { session });
            const newSubscription = createdSubscriptions[0];
            await Transaction.findOneAndUpdate(
              { stripePaymentIntentId: paymentIntent.id },
              { "reference.id": newSubscription._id },
              { session }
            );
            console.log(`Created new subscription for user ${paymentIntent.metadata.userId}`);
          }
        } else if (transaction.type === TransactionType.EVENT_TICKET) {
          // ... existing event ticket handling code remains the same ...
          const { ticketId, eventId, quantity } = paymentIntent.metadata;
          if (!ticketId || !eventId || !quantity) {
            return errorResponseHandler("Missing ticketId, eventId or quantity in payment intent metadata", 400, res);
          }

          if (!transaction.reference || !transaction.reference.id) {
            return errorResponseHandler("Transaction reference or reference id is missing for transaction: " + transaction._id, 400, res);
          }
          const purchase = await purchaseModel.findOne({ _id: transaction.reference.id }).session(session);
          if (!purchase) {
            return errorResponseHandler("Purchase not found for transaction: " + transaction._id, 404, res);
          }

          const ticket = await ticketModel.findById(ticketId).session(session);
          const event = await eventModel.findById(eventId).session(session);
          if (!ticket || !event) {
            return errorResponseHandler("Ticket or event not found", 404, res);
          }

          // Update ticket availability
          ticket.available -= parseInt(quantity);
          if (ticket.available < 0) {
            return errorResponseHandler("Insufficient ticket availability", 400, res);
          }
          await ticket.save({ session });
          await event.save({ session });

          // Generate QR code
          const qrCode = await QRCode.toString(`purchase:${purchase._id}`, { type: "svg" });
          purchase.qrCode = qrCode;
          purchase.status = "active";
          await purchase.save({ session });
          console.log(`Updated purchase ${purchase._id} with QR code for user ${paymentIntent.metadata.userId}`);
        } else if (transaction.type === TransactionType.TICKET_RESALE) {
          // NEW: Handle resale ticket purchase success
          const { resaleId, quantity, originalSeller } = paymentIntent.metadata;
          if (!resaleId || !quantity) {
            return errorResponseHandler("Missing resaleId or quantity in payment intent metadata", 400, res);
          }

          if (!transaction.reference || !transaction.reference.id) {
            return errorResponseHandler("Transaction reference or reference id is missing for transaction: " + transaction._id, 400, res);
          }

          // Get the new purchase record
          const purchase = await purchaseModel.findById(transaction.reference.id).session(session);
          if (!purchase) {
            return errorResponseHandler("Purchase not found for transaction: " + transaction._id, 404, res);
          }

          // Get the resale listing
          const resaleListing = await resellModel.findById(resaleId).session(session);
          if (!resaleListing) {
            return errorResponseHandler("Resale listing not found", 404, res);
          }

          // Update resale listing
          const purchasedQuantity = parseInt(quantity);
          resaleListing.availableQuantity -= purchasedQuantity;
           // FIX 1: Initialize arrays if they don't exist
    if (!resaleListing.buyers) {
      resaleListing.buyers = [];
    }
    if (!resaleListing.newPurchase) {
      resaleListing.newPurchase = [];
    }
    
    // FIX 2: Safely push to arrays
    resaleListing.buyers.push(new mongoose.Types.ObjectId(paymentIntent.metadata.userId));
    resaleListing.newPurchase.push(purchase._id);


          // If all tickets are sold, mark as sold
          if (resaleListing.availableQuantity <= 0) {
            resaleListing.status = 'sold';
            resaleListing.soldDate = new Date();
          }

          await resaleListing.save({ session });

          // Update original seller's purchase quantity
          const originalPurchase = await purchaseModel.findById(resaleListing.originalPurchase).session(session);
          if (originalPurchase) {
            originalPurchase.quantity -= purchasedQuantity;
            await originalPurchase.save({ session });
          }

          // Generate QR code for buyer
          const qrCode = await QRCode.toString(`purchase:${purchase._id}`, { type: "svg" });
          purchase.qrCode = qrCode;
          purchase.status = "active";
          await purchase.save({ session });

          console.log(`Completed resale purchase ${purchase._id} for user ${paymentIntent.metadata.userId}`);
          console.log(`Updated resale listing ${resaleId} - remaining quantity: ${resaleListing.availableQuantity}`);
        }

        console.log(`Updated transaction ${transaction._id} to SUCCESS`);
        break;
      }

      case "payment_intent.payment_failed": {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        console.log("Payment intent failed:", paymentIntent.id);

        if (paymentIntent.currency.toLowerCase() !== "usd") {
          console.warn(`Non-USD currency detected: ${paymentIntent.currency}`);
        }

        const transaction = await Transaction.findOne({ stripePaymentIntentId: paymentIntent.id }).session(session);
        if (!transaction) {
          return errorResponseHandler("Transaction not found for payment intent: " + paymentIntent.id, 404, res);
        }

        transaction.status = TransactionStatus.FAILED;
        transaction.metadata = {
          ...transaction.metadata,
          failedAt: new Date(),
          failureMessage: paymentIntent.last_payment_error?.message || "Payment failed",
        };
        await transaction.save({ session });
        console.log(`Updated transaction ${transaction._id} to FAILED`);
        
        if(!transaction.reference || !transaction.reference.id) {
          return errorResponseHandler("Transaction reference or reference id is missing for transaction: " + transaction._id, 400, res);
        }

        if (transaction.type === TransactionType.EVENT_TICKET || transaction.type === TransactionType.TICKET_RESALE) {
          const purchase = await purchaseModel.findOne({ _id: transaction.reference.id }).session(session);
          if (purchase) {
            purchase.status = "disabled";
            await purchase.save({ session });
            console.log(`Disabled purchase ${purchase._id} due to failed payment`);
          }
        }

        break;
      }

      case "payment_intent.canceled": {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        console.log("Payment intent canceled:", paymentIntent.id);

        if (paymentIntent.currency.toLowerCase() !== "usd") {
          console.warn(`Non-USD currency detected: ${paymentIntent.currency}`);
        }

        const transaction = await Transaction.findOne({ stripePaymentIntentId: paymentIntent.id }).session(session);
        if (!transaction) {
          return errorResponseHandler("Transaction not found for payment intent: " + paymentIntent.id, 404, res);
        }

        transaction.status = TransactionStatus.CANCELLED;
        transaction.metadata = {
          ...transaction.metadata,
          canceledAt: new Date(),
          reason: "Payment intent canceled",
        };
        await transaction.save({ session });
        console.log(`Updated transaction ${transaction._id} to CANCELLED`);

        if(!transaction.reference || !transaction.reference.id) {
          return errorResponseHandler("Transaction reference or reference id is missing for transaction: " + transaction._id, 400, res);
        }

        if (transaction.type === TransactionType.EVENT_TICKET || transaction.type === TransactionType.TICKET_RESALE) {
          const purchase = await purchaseModel.findOne({ _id: transaction.reference.id }).session(session);
          if (purchase) {
            purchase.status = "disabled";
            await purchase.save({ session });
            console.log(`Disabled purchase ${purchase._id} due to canceled payment`);
          }
        }

        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    await session.commitTransaction();
    return { success: true, message: "Webhook processed successfully" };
  } catch (error) {
    await session.abortTransaction();
    console.error("Webhook error:", error);
    return res.status(500).json({ success: false, message: `Failed to process webhook: ${(error as Error).message}` });
  } finally {
    session.endSession();
  }
};


// // Handle payment_intent.succeeded
// async function handlePaymentIntentSucceeded(paymentIntent: Stripe.PaymentIntent) {
//   console.log("Payment intent succeeded:", paymentIntent.id);
//   console.log("Metadata:", paymentIntent.metadata);

//   // Make sure we have the required metadata
//   if (
//     !paymentIntent.metadata ||
//     !paymentIntent.metadata.userId ||
//     !paymentIntent.metadata.productId
//   ) {
//     console.error("Missing required metadata in payment intent");
//     return;
//   }

//   const { userId, productId, priceId, planType } = paymentIntent.metadata;

//   // Find the existing subscription
//   const subscription = await DatingSubscription.findOne({ user: userId });
  
//   // Get product and price details
//   const product = await stripe.products.retrieve(productId);
//   const price = priceId
//     ? await stripe.prices.retrieve(priceId)
//     : product.default_price
//     ? await stripe.prices.retrieve(product.default_price as string)
//     : null;

//   if (!price) {
//     console.error("No price found for product", productId);
//     return;
//   }

//   // Calculate subscription dates
//   const startDate = new Date();
//   const endDate = new Date();
  
//   if (price.recurring) {
//     const { interval, interval_count } = price.recurring;
//     if (interval === "day")
//       endDate.setDate(endDate.getDate() + (interval_count || 1));
//     else if (interval === "week")
//       endDate.setDate(endDate.getDate() + (interval_count || 1) * 7);
//     else if (interval === "month")
//       endDate.setMonth(endDate.getMonth() + (interval_count || 1));
//     else if (interval === "year")
//       endDate.setFullYear(endDate.getFullYear() + (interval_count || 1));
//   } else {
//     // Default to 30 days for one-time payments
//     endDate.setDate(endDate.getDate() + 30);
//   }

//   // Update or create transaction
//   const transaction = await Transaction.findOne({ stripePaymentIntentId: paymentIntent.id });
  
//   if (transaction) {
//     // Update existing transaction
//     transaction.status = TransactionStatus.SUCCESS;
//     transaction.metadata = {
//       ...transaction.metadata,
//       completedAt: new Date()
//     };
//     await transaction.save();
//     console.log(`Updated transaction ${transaction._id} to SUCCESS`);
//   } else {
//     // Create new transaction
//     await createTransaction({
//       user: userId,
//       type: TransactionType.DATING_SUBSCRIPTION,
//       amount: paymentIntent.amount / 100,
//       status: TransactionStatus.SUCCESS,
//       stripeCustomerId: paymentIntent.customer as string,
//       stripePaymentIntentId: paymentIntent.id,
//       paymentMethod: "card",
//       reference: {
//         model: 'DatingSubscription',
//         id: subscription ? subscription._id : null // Will be updated after subscription creation
//       },
//       metadata: {
//         plan: planType || product.metadata?.plan_type || DatingSubscriptionPlan.BASIC,
//         productId,
//         priceId: price.id,
//         paidAt: new Date()
//       }
//     });
//   }

//   // Update or create subscription
//   if (subscription) {
//     // Update existing subscription
//     subscription.plan = planType as DatingSubscriptionPlan || 
//                         product.metadata?.plan_type as DatingSubscriptionPlan || 
//                         DatingSubscriptionPlan.BASIC;
//     subscription.isActive = true;
//     subscription.startDate = startDate;
//     subscription.endDate = endDate;
//     // subscription.stripeProductId = productId;
//     // subscription.stripePriceId = price.id;
//     subscription.stripeCustomerId = paymentIntent.customer as string;
//     await subscription.save();
    
//     console.log(`Updated subscription for user ${userId}`);
//   } else {
//     // Create new subscription
//     const newSubscription = await DatingSubscription.create({
//       user: userId,
//       plan: planType as DatingSubscriptionPlan || 
//             product.metadata?.plan_type as DatingSubscriptionPlan || 
//             DatingSubscriptionPlan.BASIC,
//       isActive: true,
//       startDate,
//       endDate,
//       stripeProductId: productId,
//       stripePriceId: price.id,
//       stripeCustomerId: paymentIntent.customer as string,
//       paymentMethod: "card",
//       features: {}  // Add default features if needed
//     });
    
//     // If we created a transaction without a subscription reference, update it
//     if (!subscription) {
//       await Transaction.findOneAndUpdate(
//         { stripePaymentIntentId: paymentIntent.id },
//         { 
//           'reference.id': newSubscription._id 
//         }
//       );
//     }
    
//     console.log(`Created new subscription for user ${userId}`);
//   }
// }
// async function handlePaymentIntentCanceled(paymentIntent: Stripe.PaymentIntent) {
//   console.log("Payment intent canceled:", paymentIntent.id);
  
//   // Update transaction status to CANCELLED
//   await Transaction.findOneAndUpdate(
//     { stripePaymentIntentId: paymentIntent.id },
//     { 
//       status: TransactionStatus.CANCELLED,
//       metadata: {
//         canceledAt: new Date(),
//         reason: "Payment intent canceled"
//       }
//     }
//   );
  
//   console.log(`Updated transaction for canceled payment ${paymentIntent.id}`);
// }
// Handle payment_intent.payment_failed
// async function handlePaymentIntentFailed(paymentIntent: Stripe.PaymentIntent) {
//   console.log("Payment intent failed:", paymentIntent.id);
  
//   // Update transaction status to FAILED
//   await Transaction.findOneAndUpdate(
//     { stripePaymentIntentId: paymentIntent.id },
//     { 
//       status: TransactionStatus.FAILED,
//       metadata: {
//         failedAt: new Date(),
//         failureMessage: paymentIntent.last_payment_error?.message || "Payment failed"
//       }
//     }
//   );
  
//   console.log(`Updated transaction for failed payment ${paymentIntent.id}`);
// }
// // Helper function to create a transaction
// async function createTransaction(data: any) {
//   const transaction = await Transaction.create(data);
//   console.log(`Created transaction ${transaction._id}`);
//   return transaction;
// }

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

