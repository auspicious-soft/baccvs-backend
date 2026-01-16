import { Response } from "express";
import { httpStatusCode } from "src/lib/constant";
import { errorResponseHandler } from "src/lib/errors/error-response-handler";
import { usersModel } from "src/models/user/user-schema";
import { withdrawalModel } from "src/models/withdrawal/withdrawal-schema";

export const requestWithdrawalService = async (
  userId: string,
  amount: number,
  res:Response
) => {
  if (!amount || amount <= 0) {
    errorResponseHandler("Invalid amount", httpStatusCode.BAD_REQUEST,res);
  }

  const user = await usersModel.findById(userId);
  if (!user || !user.stripeAccountId) {
    errorResponseHandler(
      "User does not have a Stripe account",
      httpStatusCode.NOT_FOUND,
      res
    );
  }

  const withdrawal = await withdrawalModel.create({
    user: userId,
    stripeAccountId: user?.stripeAccountId,
    amount,
    currency: "usd",
    status: "pending",
  });

  return {
    success: true,
    message: "Withdrawal request created successfully",
    data: withdrawal,
  };
};
