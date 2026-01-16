import { Request, Response } from "express";
import {
  createOrGetConnectedAccount,
  createAccountOnboardingLink,
  markOnboardingComplete,
  getConnectedAccountBanksService,
} from "src/services/stripe/stripe-connect-service";
import { errorParser, errorResponseHandler } from "src/lib/errors/error-response-handler";

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
  return res.redirect("baccvs://settingspaymentmethod");
};

export const stripeConnectRefresh = (req: Request, res: Response) => {
  return res.redirect("baccvs://settingspaymentmethod");
};
export const getConnectedAccountBanks = async (req: Request, res: Response) => {
  try {
    const response = await getConnectedAccountBanksService(req, res);
    return res.status(200).json(response);
  } catch (error) {
    const { code, message } = errorParser(error);
    return res
      .status(code || 500)
      .json({ success: false, message: message || "Failed to fetch bank accounts" });
  }
};

