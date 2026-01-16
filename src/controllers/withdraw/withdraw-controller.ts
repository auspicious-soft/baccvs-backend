import { Request, Response } from "express";
import { JwtPayload } from "jsonwebtoken";
import { httpStatusCode } from "src/lib/constant";
import { errorParser } from "src/lib/errors/error-response-handler";
import { requestWithdrawalService } from "src/services/withdraw/withdraw-service";

export const requestWithdrawalController = async (
  req: Request,
  res: Response
) => {
  try {
    const { amount } = req.body;
    const user = req.user as JwtPayload;
    const userId = user.id || (user as any)._id; // fallback to _id if needed
    const response = await requestWithdrawalService(userId, amount,res);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};
