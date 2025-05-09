import { Request, Response } from "express";
import { httpStatusCode } from "src/lib/constant";
import { errorParser, errorResponseHandler } from "src/lib/errors/error-response-handler";
import { ReferralCodeModel } from "src/models/referalcode/referal-schema";
import { usersModel } from "src/models/user/user-schema";

export const createReferralCode = async (req: Request, res: Response) => {
  try {
    const { userId } = req.body;

    // Check if the user exists
    const user = await usersModel.findById(userId);
    if (!user) {
      return res.status(httpStatusCode.NOT_FOUND).json({ message: "User not found" });
    }

    // Check if the user already has 6 referral codes
    const existingCodes = await ReferralCodeModel.countDocuments({
      codeCreatedBy: userId,
    });

    if (existingCodes >= 6) {
      return res.status(httpStatusCode.OK).json({ message: "User cannot have more than 6 referral codes" });
    }

    // Create a new referral code
    const referralCode = await ReferralCodeModel.create({
      codeCreatedBy: userId,
    });

    res.status(httpStatusCode.CREATED).json({
      message: "Referral code created successfully",
      referralCode,
    });
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message || "An error occurred" });
  }
};

export const validateReferralCodeService = async (req: any, res: Response) => {
    const { referralCode } = req.body;

    if (!referralCode) {
      return errorResponseHandler("Referral code is required", httpStatusCode.FORBIDDEN, res)          
    }

    // Check if referral code exists
    const referralCodeDocument = await ReferralCodeModel.findOne({ code: referralCode});
    if (!referralCodeDocument) {
      return errorResponseHandler("Invalid referral code", httpStatusCode.UNAUTHORIZED, res)
    }

    // Check if referral code is already used
    if (referralCodeDocument.used) {
      return errorResponseHandler("Referral code has already been used", httpStatusCode.UNAUTHORIZED, res)
    }
    // const usedReferalCode = await ReferralCodeModel.findByIdAndUpdate(referralCodeDocument._id, { used: true }, { new: true });
    return { success: true, message: "Referral Code is valid you can signup" };

};

