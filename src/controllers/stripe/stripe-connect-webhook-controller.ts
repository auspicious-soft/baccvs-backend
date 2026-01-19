import { Request, Response } from "express";
import { stripe } from "src/services/stripe/stripe-connect-service";
import { usersModel } from "src/models/user/user-schema";
import { errorResponseHandler } from "src/lib/errors/error-response-handler";

export const handleStripeConnectWebhook = async (
  req: Request,
  res: Response
) => {
  const sig = req.headers["stripe-signature"] as string;
  const webhookSecret = process.env.STRIPE_CONNECT_WEBHOOK_SECRET;

  if (!webhookSecret) {
    return res.status(500).send("Stripe Connect webhook secret not configured");
  }

  let event;
  try {
    const payload = (req as any).rawBody || req.body;
    if (!payload) {
      throw new Error("No webhook payload was provided.");
    }
    if (!sig) {
      throw new Error("Missing Stripe signature header");
    }

    event = stripe.webhooks.constructEvent(payload, sig, webhookSecret);
  } catch (err: any) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  const connectedAccountId = event.account;
  if (!connectedAccountId) {
    return res.status(400).send("Missing connected account ID");
  }

  try {
    if (event.type === "account.updated") {
      const account = event.data.object as any;

      const user = await usersModel.findOne({
        stripeAccountId: connectedAccountId,
      });

      if (user) {
        const prevComplete = Boolean(user.onboardingComplete);

        // Persist the full account object for debugging and future use
        // user.stripeAccountData = account;

        const newComplete = Boolean(
          account.details_submitted &&
            account.charges_enabled &&
            account.payouts_enabled
        );

        user.onboardingComplete = newComplete;

        await user.save();

        if (!prevComplete && newComplete) {
          // Onboarding just completed — log and (optionally) notify
          console.log(
            `Stripe onboarding completed for user ${user._id} (account ${connectedAccountId})`
          );
          // TODO: create app notification / email to user using existing notification service
        } else {
          // Requirements changed — log current requirements for operator visibility
          console.log(
            `Stripe account updated for user ${user._id}: currently_due=`,
            account.requirements?.currently_due
          );
        }
      }
    }

    return res.json({ received: true });
  } catch (err: any) {
    return res.status(500).send("Webhook handling failed");
  }
};
