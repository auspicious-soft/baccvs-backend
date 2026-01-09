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
    event = stripe.webhooks.constructEvent(
      (req as any).rawBody,
      sig,
      webhookSecret
    );
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
        user.onboardingComplete =
          account.details_submitted &&
          account.charges_enabled &&
          account.payouts_enabled;

        await user.save();
      }
    }

    return res.json({ received: true });
  } catch (err: any) {
    return res.status(500).send("Webhook handling failed");
  }
};

