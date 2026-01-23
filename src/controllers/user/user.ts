import { Request, Response } from "express";
import { httpStatusCode } from "../../lib/constant";
import {
  errorParser,
  errorResponseHandler,
} from "../../lib/errors/error-response-handler";
import {
  passswordResetSchema,
  verifyOtpSchema,
  verifyPasswordSchema,
} from "../../validation/client-user";
import { formatZodErrors } from "../../validation/format-zod-errors";
import {
  signUpService,
  forgotPasswordService,
  newPassswordAfterOTPVerifiedService,
  passwordResetService,
  getDashboardStatsService,
  getUserInfoService,
  getUserInfoByEmailService,
  editUserInfoService,
  verifyOtpPasswordResetService,
  verifyEmailService,
  verifyOtpEmailService,
  loginUserService,
  verifyCurrentPasswordService,
  resetPasswordWithTokenService,
  notificationSettingService,
  toggleTwoFactorAuthenticationService,
  getReferalCodeService,
  changePasswordService,
  getAllFollowedUsersService,
  togglePrivacyPreferenceService,
  getUserNotificationPreferencesService,
  getUserPrivacyPreferenceService,
  getUserPostsService,
  getUserInfoByTokenService,
  getConversationsByTypeService,
  getUserAllDataService,
  getAllFollowersService,
  editMessageService,
  getUnchattedFollowingsService,
  searchFeedService,
  deleteUserService,
  createAndroidSubscriptionService,
} from "../../uploads/user/user";
import { validateReferralCodeService } from "../referal/referal";
import {
  changeEmailSchema,
  changePhoneSchema,
} from "../../validation/client-user";
import {
  initiateEmailChangeService,
  verifyAndChangeEmailService,
  initiatePhoneChangeService,
  verifyAndChangePhoneService,
} from "../../uploads/user/user";
import { generateMultipleSignedUrls } from "src/configF/s3";
import { upload, uploadMultipleFilesToS3 } from "src/configF/multer";
import { get } from "http";
import { JwtPayload } from "jsonwebtoken";
import { SubscriptionModel } from "src/models/subscriptions/dating-subscription-schema";
import { PlanModel } from "src/models/plan-schema";
import {
  AppStoreServerAPIClient,
  Environment,
  GetTransactionHistoryVersion,
  ReceiptUtility,
  Order,
  ProductType,
  HistoryResponse,
  TransactionHistoryRequest,
  // decodeTransaction,
} from "@apple/app-store-server-library";
import { TransactionModel } from "src/models/transaction/subscription-transaction";
import jwt from "jsonwebtoken";

async function validateStoreKit2JWS(
  signedJWS: string,
): Promise<{ valid: boolean; data?: any; error?: string }> {
  try {
    if (!signedJWS || typeof signedJWS !== "string") {
      return { valid: false, error: "Signed JWS is missing or invalid" };
    }

    const decoded = jwt.decode(signedJWS, { complete: true });

    if (!decoded || typeof decoded !== "object" || !decoded.header) {
      return { valid: false, error: "Invalid JWS format (decode failed)" };
    }

    const header = decoded.header as any;

    if (
      header.alg !== "ES256" ||
      !Array.isArray(header.x5c) ||
      header.x5c.length === 0
    ) {
      return { valid: false, error: "Invalid JWS header: alg/x5c missing" };
    }

    const appleCertBase64 = header.x5c[0];
    const applePublicKey = `-----BEGIN CERTIFICATE-----\n${appleCertBase64}\n-----END CERTIFICATE-----`;

    const payload = jwt.verify(signedJWS, applePublicKey, {
      algorithms: ["ES256"],
    }) as any;

    return {
      valid: true,
      data: {
        transactionId: payload.transactionId,
        originalTransactionId:
          payload.originalTransactionId || payload.transactionId,
        productId: payload.productId,
        purchaseDate: new Date(Number(payload.purchaseDate)),
        expiresDate: payload.expiresDate
          ? new Date(Number(payload.expiresDate))
          : null,
        environment: payload.environment,
        isTrial: payload.offerDiscountType === "FREE_TRIAL",
        price: payload.price,
        currency: payload.currency,
        transactionReason: payload.transactionReason,
        appAccountToken: payload.appAccountToken || null,
      },
    };
  } catch (err: any) {
    console.error("StoreKit JWS validation error:", err);
    return { valid: false, error: err.message };
  }
}

// Middleware for handling file uploads
export const uploadUserPhotos = upload.array("photos", 5); // Allow up to 5 photos

export const validateReferralCode = async (req: Request, res: Response) => {
  try {
    const response = await validateReferralCodeService(req, res);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error) {
    const { code, message } = errorParser(error);
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};

export const signup = async (req: Request, res: Response) => {
  try {
    const userData = req.body;
    const response: any = await signUpService(
      req,
      userData,
      userData.authType,
      res,
    );
    return res.status(httpStatusCode.CREATED).json(response);
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: message || "An error occurred",
    });
  }
};
export const socialSignUp = async (req: Request, res: Response) => {
  try {
    const userData = req.body;
    // const response: any = await socialSignUpService(userData, res);
    // return res.status(httpStatusCode.CREATED).json(response);
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: message || "An error occurred",
    });
  }
};

export const login = async (req: Request, res: Response) => {
  try {
    const response = await loginUserService(req.body, req.body.authType, res);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};

export const verifyEmail = async (req: Request, res: Response) => {
  try {
    const response = await verifyEmailService(req.body, res);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};

export const verifyingEmailOtp = async (req: Request, res: Response) => {
  try {
    const response = await verifyOtpEmailService(req.body, res);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};

export const forgotPassword = async (req: Request, res: Response) => {
  try {
    const response = await forgotPasswordService(req.body, res);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};

export const verifyOtpPasswordReset = async (req: Request, res: Response) => {
  const { otp, email } = req.body;

  try {
    const response = await verifyOtpPasswordResetService(otp, email, res);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};

export const newPassswordAfterOTPVerified = async (
  req: Request,
  res: Response,
) => {
  try {
    const response = await newPassswordAfterOTPVerifiedService(req.body, res);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};

export const passwordReset = async (req: Request, res: Response) => {
  const validation = passswordResetSchema.safeParse(req.body);
  if (!validation.success)
    return res
      .status(httpStatusCode.BAD_REQUEST)
      .json({ success: false, message: formatZodErrors(validation.error) });
  try {
    const response = await passwordResetService(req, res);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};

export const getUserInfo = async (req: Request, res: Response) => {
  try {
    const response = await getUserInfoService(req, res);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};

export const getUserInfoByEmail = async (req: Request, res: Response) => {
  try {
    const response = await getUserInfoByEmailService(req.params.email, res);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};

export const editUserInfo = async (req: Request, res: Response) => {
  try {
    const response = await editUserInfoService(req, res);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error: any) {
    // Check if response was already sent
    if (res.headersSent) {
      console.error(
        "Response already sent, cannot send error response:",
        error,
      );
      return;
    }

    const { code, message } = errorParser(error);
    return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: message || "An error occurred",
    });
  }
};

// Dashboard
export const getDashboardStats = async (req: Request, res: Response) => {
  try {
    const response = await getDashboardStatsService(req, res);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};

// First screen - Verify password
export const verifyCurrentPassword = async (req: Request, res: Response) => {
  try {
    const response = await verifyCurrentPasswordService(req, res);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};

// Second screen - Submit new email
export const submitNewEmail = async (req: Request, res: Response) => {
  const validation = changeEmailSchema.safeParse(req.body);
  if (!validation.success) {
    return res
      .status(httpStatusCode.BAD_REQUEST)
      .json({ success: false, message: formatZodErrors(validation.error) });
  }

  try {
    const response = await initiateEmailChangeService(req, res);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};

// Second screen - Submit new phone
export const submitNewPhone = async (req: Request, res: Response) => {
  const validation = changePhoneSchema.safeParse(req.body);
  if (!validation.success) {
    return res
      .status(httpStatusCode.BAD_REQUEST)
      .json({ success: false, message: formatZodErrors(validation.error) });
  }

  try {
    const response = await initiatePhoneChangeService(req, res);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};

// Third screen - Verify and complete email change
export const verifyAndCompleteEmailChange = async (
  req: Request,
  res: Response,
) => {
  const validation = verifyOtpSchema.safeParse(req.body);
  if (!validation.success) {
    return res
      .status(httpStatusCode.BAD_REQUEST)
      .json({ success: false, message: formatZodErrors(validation.error) });
  }

  try {
    const response = await verifyAndChangeEmailService(req, res);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};

// Third screen - Verify and complete phone change
export const verifyAndCompletePhoneChange = async (
  req: Request,
  res: Response,
) => {
  const validation = verifyOtpSchema.safeParse(req.body);
  if (!validation.success) {
    return res
      .status(httpStatusCode.BAD_REQUEST)
      .json({ success: false, message: formatZodErrors(validation.error) });
  }

  try {
    const response = await verifyAndChangePhoneService(req, res);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};

export const resetPasswordWithToken = async (req: Request, res: Response) => {
  try {
    const response = await resetPasswordWithTokenService(req, res);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};
export const notificationSetting = async (req: Request, res: Response) => {
  try {
    const response = await notificationSettingService(req, res);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};
export const toggleTwoFactorAuthentication = async (
  req: Request,
  res: Response,
) => {
  try {
    const response = await toggleTwoFactorAuthenticationService(req, res);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};
export const getReferalCode = async (req: Request, res: Response) => {
  try {
    const response = await getReferalCodeService(req, res);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};

export const changePassword = async (req: Request, res: Response) => {
  try {
    const response = await changePasswordService(req, res);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};

export const getSignedUrlsForSignup = async (req: Request, res: Response) => {
  try {
    const { files, email } = req.body;

    if (!files || !Array.isArray(files) || !email) {
      return res.status(httpStatusCode.BAD_REQUEST).json({
        success: false,
        message: "Files array and email are required",
      });
    }

    const signedUrls = await generateMultipleSignedUrls(files, email);

    return res.status(httpStatusCode.OK).json({
      success: true,
      message: "Signed URLs generated successfully",
      data: signedUrls,
    });
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: message || "An error occurred generating signed URLs",
    });
  }
};

export const getAllFollowedUsers = async (req: Request, res: Response) => {
  try {
    const response = await getAllFollowedUsersService(req, res);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: message || "An error occurred fetching users",
    });
  }
};
export const getAllFollowingUsers = async (req: Request, res: Response) => {
  try {
    const response = await getAllFollowersService(req, res);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: message || "An error occurred fetching users",
    });
  }
};
export const togglePrivacyPreference = async (req: Request, res: Response) => {
  try {
    const response = await togglePrivacyPreferenceService(req, res);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: message || "An error occurred toggling privacy preference",
    });
  }
};

export const getUserNotificationPreferences = async (
  req: Request,
  res: Response,
) => {
  try {
    const response = await getUserNotificationPreferencesService(req, res);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: message || "An error occurred fetching notification preferences",
    });
  }
};
export const getUserPrivacyPreference = async (req: Request, res: Response) => {
  try {
    const response = await getUserPrivacyPreferenceService(req, res);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: message || "An error occurred fetching privacy preferences",
    });
  }
};
export const getUserPosts = async (req: Request, res: Response) => {
  try {
    const response = await getUserPostsService(req, res);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: message || "An error occurred fetching user posts",
    });
  }
};
export const getUserInfoByToken = async (req: Request, res: Response) => {
  try {
    const response = await getUserInfoByTokenService(req, res);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: message || "An error occurred fetching user info",
    });
  }
};

export const getFollowList = async (req: Request, res: Response) => {
  try {
    // const response = await getFollowListService(req, res);
    // return res.status(httpStatusCode.OK).json(response);
  } catch (error) {
    const { code, message } = errorParser(error);
    return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: message || "An error occurred fetching follow list",
    });
  }
};

export const getConversationsByType = async (req: Request, res: Response) => {
  try {
    const result = await getConversationsByTypeService(req, res);
    if (!result.success) return; // Error already handled by service
    return res.status(httpStatusCode.OK).json(result);
  } catch (error) {
    const { code, message } = errorParser(error);
    return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: message || "An error occurred fetching follow list",
    });
  }
};
export const getUnchattedFollowings = async (req: Request, res: Response) => {
  try {
    const result = await getUnchattedFollowingsService(req, res);
    if (!result.success) return; // Error already handled by service
    return res.status(httpStatusCode.OK).json(result);
  } catch (error) {
    const { code, message } = errorParser(error);
    return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: message || "An error occurred fetching follow list",
    });
  }
};
export const getUserAllData = async (req: Request, res: Response) => {
  try {
    const userId = req.query.userId || (req.user as JwtPayload).id;
    if (!userId) {
      return errorResponseHandler(
        "User id is required",
        httpStatusCode.NOT_FOUND,
        res,
      );
    }
    const result = await getUserAllDataService(userId, res);
    return res.status(httpStatusCode.OK).json(result);
  } catch (error) {
    const { code, message } = errorParser(error);
    return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: message || "An error occurred fetching follow list",
    });
  }
};
export const editMessage = async (req: Request, res: Response) => {
  try {
    const { id: userId } = req.user as any;
    if (!userId) {
      return errorResponseHandler(
        "User id is required",
        httpStatusCode.NOT_FOUND,
        res,
      );
    }
    const result = await editMessageService(req, res);
    return res.status(httpStatusCode.OK).json(result);
  } catch (error) {
    const { code, message } = errorParser(error);
    return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: message || "An error occurred fetching follow list",
    });
  }
};
export const searchFeedController = async (req: Request, res: Response) => {
  try {
    const response = await searchFeedService(req);

    return res.status(httpStatusCode.OK).json(response);
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res.status(code || 500).json({
      success: false,
      message: message || "Failed to fetch search feed",
    });
  }
};

export const deleteUser = async (req: Request, res: Response) => {
  try {
    const response = await deleteUserService(req, res);

    // Check if response was already sent
    if (res.headersSent) {
      console.error("Response already sent, cannot send delete response");
      return;
    }

    return res.status(httpStatusCode.OK).json(response);
  } catch (error: any) {
    // Check if response was already sent
    if (res.headersSent) {
      console.error(
        "Response already sent, cannot send error response:",
        error,
      );
      return;
    }

    const { code, message } = errorParser(error);
    return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: message || "Failed to delete user account",
    });
  }
};
export const validateIosReceipt = async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    const { receiptData } = req.body;

    // Validate input
    if (!receiptData) {
      return res.status(400).json({
        success: false,
        error: "Validation Error",
        message: "Receipt data is required",
      });
    }

    if (!user || !user.id) {
      return res.status(401).json({
        success: false,
        error: "Authentication Error",
        message: "User not authenticated",
      });
    }

    // Step 1: Validate the initial receipt/transaction
    const result = await validateStoreKit2JWS(receiptData);

    if (!result.valid) {
      return res.status(400).json({
        success: false,
        error: "Invalid Receipt",
        message: "The provided receipt is invalid or has been tampered with",
      });
    }

    const {
      transactionId,
      originalTransactionId,
      productId,
      purchaseDate,
      expiresDate,
      environment,
      currency,
      price,
      transactionReason,
    } = result.data;

    // Step 2: Initialize App Store Server API Client
    const issuerId = process.env.APPLE_ISSUER_ID || "";
    const keyId = process.env.APPLE_KEY_ID || "";
    const bundleId = process.env.APPLE_BUNDLE_ID || "";
    const signingKey = process.env.APPLE_PRIVATE_KEY || "";

    if (!issuerId || !keyId || !bundleId || !signingKey) {
      console.error("Missing Apple credentials in environment variables");
      return res.status(500).json({
        success: false,
        error: "Configuration Error",
        message: "Server configuration error",
      });
    }

    const environmentUsed =
      environment === "Sandbox" ? Environment.SANDBOX : Environment.PRODUCTION;

    const client = new AppStoreServerAPIClient(
      signingKey,
      keyId,
      issuerId,
      bundleId,
      environmentUsed,
    );

    // Step 3: Get full transaction history
    let response: any = null;
    let transactions: string[] = [];

    const transactionHistoryRequest: TransactionHistoryRequest = {
      sort: Order.DESCENDING, // Get latest first
      revoked: false,
      productTypes: [ProductType.AUTO_RENEWABLE],
    };

    try {
      do {
        if (!response) {
          // First request: no revision
          response = await client.getTransactionHistory(
            originalTransactionId,
            null,
            transactionHistoryRequest,
            GetTransactionHistoryVersion.V2,
          );
        } else {
          // Subsequent requests: pass revision
          response = await client.getTransactionHistory(
            originalTransactionId,
            response.revision,
            transactionHistoryRequest,
            GetTransactionHistoryVersion.V2,
          );
        }

        if (response.signedTransactions) {
          transactions.push(...response.signedTransactions);
        }
      } while (response.hasMore);
    } catch (apiError: any) {
      console.error("App Store API Error: while do", apiError);
      return res.status(502).json({
        success: false,
        error: "App Store API Error",
        message: "Failed to fetch transaction history from Apple",
      });
    }

    if (transactions.length === 0) {
      return res.status(404).json({
        success: false,
        error: "No Transactions Found",
        message: "No transaction history found for this purchase",
      });
    }

    // Step 4: Decode all transactions
    const decodedTransactions = [];

    for (const signedTx of transactions) {
      try {
        const decoded = await validateStoreKit2JWS(signedTx);
        if (decoded.valid) {
          decodedTransactions.push(decoded);
        }
      } catch (decodeError) {
        console.error("Failed to decode transaction:", decodeError);
        // Continue with other transactions
      }
    }

    if (decodedTransactions.length === 0) {
      return res.status(400).json({
        success: false,
        error: "Invalid Transactions",
        message: "All transactions in history are invalid",
      });
    }

    // Step 5: Get the latest valid transaction
    const latest: any = decodedTransactions.sort(
      (a: any, b: any) => b.data.purchaseDate - a.data.purchaseDate,
    )[0];

    if (!latest.valid) {
      return res.status(400).json({
        success: false,
        error: "Invalid Latest Transaction",
        message: "The latest transaction is invalid",
      });
    }

    console.log("Latest Transaction:", {
      productId: latest.data.productId,
      purchaseDate: new Date(latest.data.purchaseDate),
      expiresDate: latest.data.expiresDate
        ? new Date(latest.data.expiresDate)
        : null,
      price: latest.data.price,
      currency: latest.data.currency,
      environment: latest.data.environment,
    });

    // Step 6: Find the plan
    const planData = await PlanModel.findOne({
      iosProductId: latest.data.productId,
    });

    if (!planData) {
      return res.status(404).json({
        success: false,
        error: "Plan Not Found",
        message: `No subscription plan found for product ID: ${latest.data.productId}`,
      });
    }

    const userId = user.id;
    const now = new Date();
    const expirationDate = latest.data.expiresDate
      ? new Date(latest.data.expiresDate)
      : null;

    // Step 7: Determine subscription status
    let subscriptionStatus: "active" | "expired" | "canceled" | "past_due" =
      "active";

    if (!expirationDate) {
      // Non-renewable purchase or lifetime
      subscriptionStatus = "active";
    } else if (expirationDate <= now) {
      subscriptionStatus = "canceled";
    } else {
      subscriptionStatus = "active";
    }

    // Step 8: Check for existing subscription
    const existingSubscription = await SubscriptionModel.findOne({
      userId,
    });
   
    // Step 9: Create or update subscription
    let subscription;

    if (!existingSubscription) {
      // Create new subscription
      subscription = await SubscriptionModel.create({
        userId,
        subscriptionId: latest.data.productId,
        planId: planData._id,
        deviceType: "IOS",
        orderId: originalTransactionId,
        transactionId: latest.data.transactionId,
        amount: latest.data.price ? latest.data.price / 1000 : 0, // Convert from micro-units
        currency: latest.data.currency
          ? latest.data.currency.toLowerCase()
          : "usd",
        status: subscriptionStatus,
        currentPeriodStart: new Date(latest.data.purchaseDate),
        currentPeriodEnd: expirationDate,
        environment: latest.data.environment,
      });

      console.log("Created new subscription:", subscription?._id);
    } else {
      // Update existing subscription
      const updateData: any = {
        subscriptionId: latest.data.productId,
        planId: planData._id,
        orderId: originalTransactionId,
        transactionId: latest.data.transactionId,
        currentPeriodStart: new Date(latest.data.purchaseDate),
        currentPeriodEnd: expirationDate,
        status: subscriptionStatus,
        amount: latest.data.price ? latest.data.price / 1000 : 0,
        currency: latest.data.currency
          ? latest.data.currency.toLowerCase()
          : "usd",
        environment: latest.data.environment,
      };

      subscription = await SubscriptionModel.findOneAndUpdate(
        { userId, environment: latest.data.environment },
        { $set: updateData },
        { new: true, upsert: false },
      );

      console.log("Updated existing subscription:", subscription?._id);
    }
  //   if(subscription){
  //   await TransactionModel.create({
  //     orderId: transactionId,
  //     userId: userId,
  //     planId: planData._id,
  //     status: "succeeded",
  //     amount: latest.data.price ? latest.data.price / 1000 : 0,
  //     currency: currency.toLowerCase(),
  //     paidAt: new Date(purchaseDate) ?? new Date(),
  //     environment: environment,
  //   });
  // }
    // Step 10: Return success response
    return res.status(200).json({
      success: true,
      message: "Receipt validated successfully",
      data: {subscription},
    });
  } catch (error: any) {
    console.error("Error validating iOS receipt:", error);

    // Handle specific error types
    if (error.message?.includes("JWT")) {
      return res.status(400).json({
        success: false,
        error: "Invalid Receipt",
        message: "Receipt validation failed - invalid JWT signature",
      });
    }

    if (error.message?.includes("Network")) {
      return res.status(502).json({
        success: false,
        error: "Network Error",
        message: "Failed to connect to Apple App Store servers",
      });
    }

    if (error.name === "ValidationError") {
      return res.status(400).json({
        success: false,
        error: "Validation Error",
        message: error.message,
      });
    }

    // Generic error response
    return res.status(500).json({
      success: false,
      error: "Internal Server Error",
      message: "An unexpected error occurred while validating the receipt",
    });
  }
};
export const createAndroidSubscription = async (
  req: Request,
  res: Response,
) => {
  try {
    const userData = req.user as any;
    const language = userData?.language || req.body.language || "en";

    // Get user ID from authenticated user
    const userId = userData?.id || userData?._id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: "unauthorized",
        message: "User authentication required",
      });
    }

    // Validate request body
    const purchaseData = req.body;

    if (!purchaseData) {
      return res.status(400).json({
        success: false,
        error: "invalidRequest",
        message: "Purchase data is required",
      });
    }

    // Validate platform
    if (!purchaseData.platform) {
      return res.status(400).json({
        success: false,
        error: "invalidRequest",
        message: "Platform is required (ANDROID or IOS)",
      });
    }

    // Route to appropriate service based on platform
    let response;

    response = await createAndroidSubscriptionService(userId, purchaseData);

    // Success response
    console.log("response:", response);
    return res.status(response?.data?.isNew ? 201 : 200).json(response);
  } catch (err: any) {
    console.error("Controller error:", err);

    // Error mapping
    const errorMessages: Record<string, { code: number; message: string }> = {
      purchaseTokenRequired: {
        code: 400,
        message: "Purchase token is required",
      },
      productIdRequired: { code: 400, message: "Product ID is required" },
      invalidPurchaseData: {
        code: 400,
        message: "Invalid purchase data format",
      },
      userNotFound: { code: 404, message: "User not found" },
      invalidSignature: { code: 400, message: "Invalid purchase signature" },
      invalidAndroidData: {
        code: 400,
        message: "Invalid Android purchase data",
      },
      googlePlayInitFailed: {
        code: 500,
        message: "Failed to initialize Google Play services",
      },
      googlePlayAuthFailed: {
        code: 401,
        message: "Google Play authentication failed",
      },
      purchaseNotFound: {
        code: 404,
        message: "Purchase not found in Google Play",
      },
      purchaseExpired: { code: 410, message: "Purchase has expired" },
      googlePlayVerificationFailed: {
        code: 500,
        message: "Failed to verify purchase with Google Play",
      },
      invalidBundleId: { code: 403, message: "Bundle ID does not match" },
      productIdMismatch: { code: 400, message: "Product ID mismatch" },
    };

    const error = errorMessages[err.message] || {
      code: 500,
      message: "Internal server error",
    };

    return res.status(error.code).json({
      success: false,
      error: err.message || "internalServerError",
      message: error.message,
    });
  }
};
export const restorePurchase = async (req: Request, res: Response) => {
  try {
    const userData = req.user as any;
    const userId = userData?.id || userData?._id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: "unauthorized",
        message: "User authentication required",
      });
    }

    // Validate request body
    const { purchaseToken, packageName, productId, data }: any = req.body;

    if (!purchaseToken || !packageName || !productId) {
      return res.status(400).json({
        success: false,
        error: "invalidRequest",
        message: "purchaseToken, packageName, and productId are required",
      });
    }

    console.log("🔄 Restore purchase request:", {
      userId,
      purchaseToken,
      packageName,
      productId,
      data,
    });
    // Call service
    const result = await restorePurchaseService(
      userId,
      purchaseToken,
      packageName,
      productId,
    );

    return res.status(200).json(result);
  } catch (err: any) {
    console.error("❌ Restore purchase error:", err);

    const errorMessages: Record<string, { code: number; message: string }> = {
      purchaseNotFoundInGoogle: {
        code: 404,
        message: "Purchase not found in Google Play",
      },
      purchaseExpired: { code: 410, message: "Purchase has expired" },
      purchaseNotValid: {
        code: 400,
        message: "Purchase is not valid or has been refunded",
      },
      googlePlayVerificationFailed: {
        code: 500,
        message: "Failed to verify with Google Play",
      },
      subscriptionNotFound: {
        code: 404,
        message: "Subscription not found in database",
      },
      wrongUser: {
        code: 403,
        message: "This purchase belongs to a different user",
      },
    };

    const error = errorMessages[err.message] || {
      code: 500,
      message: "Internal server error",
    };

    return res.status(error.code).json({
      success: false,
      canRestore: false,
      error: err.message || "internalServerError",
      message: error.message,
    });
  }
};
