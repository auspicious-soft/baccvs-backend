import { Request, Response } from "express";
import {
  createOrGetConnectedAccount,
  createAccountOnboardingLink,
  markOnboardingComplete,
} from "src/services/stripe/stripe-connect-service";
import { errorResponseHandler } from "src/lib/errors/error-response-handler";

export const createOnboardingLink = async (req: Request, res: Response) => {
  try {
    if (!req.user) return errorResponseHandler("User not found", 401, res);
    const { id: userId, email } = req.user as any;

    const accountId = await createOrGetConnectedAccount(userId, email);
    const url = await createAccountOnboardingLink(accountId);

    return res.status(200).json({
      success: true,
      data: {
        url,
        accountId,
      },
    });
  } catch (err: any) {
    return errorResponseHandler(
      err.message || "Failed to create onboarding link",
      500,
      res
    );
  }
};

export const completeOnboarding = async (req: Request, res: Response) => {
  try {
    if (!req.user) return errorResponseHandler("User not found", 401, res);
    const { id: userId } = req.user as any;

    await markOnboardingComplete(userId);
    return res
      .status(200)
      .json({ success: true, message: "Onboarding marked complete" });
  } catch (err: any) {
    return errorResponseHandler(
      err.message || "Failed to mark onboarding complete",
      500,
      res
    );
  }
};

export const stripeConnectReturn = (req: Request, res: Response) => {
  // optional: verify account_id or state params from query: req.query.account_id, req.query.state
  return res.redirect("baccvs://settingspaymentmethod");
};

export const stripeConnectRefresh = (req: Request, res: Response) => {
  // optional: handle cancel/refresh actions
  return res.redirect("baccvs://settingspaymentmethod");
};
