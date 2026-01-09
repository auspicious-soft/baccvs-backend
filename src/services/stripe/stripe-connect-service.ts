import Stripe from "stripe";
import dotenv from "dotenv";
import { usersModel } from "src/models/user/user-schema";

dotenv.config();

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
  apiVersion: "2025-02-24.acacia",
});

export const createOrGetConnectedAccount = async (
  userId: string,
  email?: string
) => {
  const user = await usersModel.findById(userId);
  if (!user) throw new Error("User not found");

  if (user.stripeAccountId) return user.stripeAccountId;

  let account;
  try {
    account = await stripe.accounts.create({
      type: "express",
      country: process.env.STRIPE_ACCOUNT_COUNTRY || "US",
      email: email || user.email,
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
    });
  } catch (err: any) {
    // Surface a clearer message for common Connect setup errors
    const msg = err?.message || String(err);
    if (
      msg.includes(
        "You can only create new accounts if you've signed up for Connect"
      )
    ) {
      throw new Error(
        "Stripe Connect is not enabled for the current account.\n1) Log into the Stripe Dashboard for the account that corresponds to `STRIPE_SECRET_KEY`.\n2) Enable Connect (Settings → Connect) and accept Connect terms for both test and live modes as needed.\n3) Use a full secret key (not a restricted key) with Accounts permissions."
      );
    }
    throw err;
  }

  user.stripeAccountId = account.id;
  await user.save();

  return account.id;
};

export const createAccountOnboardingLink = async (accountId: string) => {
  const refreshUrl = "https://api.baccvs.com/api/stripe-connect/connect/refresh";
  const returnUrl = "https://api.baccvs.com/api/stripe-connect/connect/return";

  const link = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: refreshUrl,
    return_url: returnUrl,
    type: "account_onboarding",
  });

  return link.url;
};

export const markOnboardingComplete = async (userId: string) => {
  await usersModel.findByIdAndUpdate(userId, { onboardingComplete: true });
};

export const listConnectedAccountBanks = async (
  connectedAccountId: string
) => {
  const externalAccounts = await stripe.accounts.listExternalAccounts(
    connectedAccountId,
    {
      object: "bank_account",
      limit: 10,
    }
  );

  return externalAccounts;
};

