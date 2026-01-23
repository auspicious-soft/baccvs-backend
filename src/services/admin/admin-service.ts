import { Response } from "express";
import { httpStatusCode } from "src/lib/constant";
import { errorResponseHandler } from "src/lib/errors/error-response-handler";
import { LikeProductsModel } from "src/models/likeProducts/likeProductsModel";
import { PromotionPlanModel } from "src/models/promotion/promotionPlan-schema";
import mongoose from "mongoose";
import Stripe from "stripe";
import { AdminModel } from "src/models/admin/admin-schema";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import {
  generateAndSendOtp,
  hashPassword,
  sendResetPasswordEmail,
  sendStaffInvitationEmail,
  sha256,
  verifyPassword,
} from "src/utils/admin-utils/helper";
import { AdminChangeRequestModel } from "src/models/admin/admin-change-schema";
import { OtpModel } from "src/models/system/otp-schema";
import { usersModel } from "src/models/user/user-schema";
import { reportModel } from "src/models/report/report-schema";
import { followModel } from "src/models/follow/follow-schema";
import { eventModel } from "src/models/event/event-schema";
import { purchaseModel } from "src/models/purchase/purchase-schema";
import { ticketModel } from "src/models/ticket/ticket-schema";
import {
  Transaction,
  TransactionStatus,
  TransactionType,
} from "src/models/transaction/transaction-schema";
import { resellModel } from "src/models/resell/resell-schema";
import { EventViewerModel } from "src/models/eventViewers/eventViewers-schema";
import { LikeModel } from "src/models/like/like-schema";
import { NotificationModel } from "src/models/notification/notification-schema";
import { Comment } from "src/models/comment/comment-schema";
import { transferModel } from "src/models/transfer/transfer-schema";
import { ReferralCodeModel } from "src/models/referalcode/referal-schema";
import { ReferralClickModel } from "src/models/referalclick/referal-click-schema";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-02-24.acacia",
});

function getRevenueDateRange(filter?: string) {
  const now = new Date();
  let start: Date;
  let end: Date;

  switch (filter) {
    case "today":
      start = new Date();
      start.setUTCHours(0, 0, 0, 0);
      end = new Date();
      end.setUTCHours(23, 59, 59, 999);
      break;

    case "yesterday":
      start = new Date();
      start.setUTCDate(start.getUTCDate() - 1);
      start.setUTCHours(0, 0, 0, 0);
      end = new Date(start);
      end.setUTCHours(23, 59, 59, 999);
      break;

    case "this_week": {
      const day = now.getUTCDay() || 7;
      start = new Date();
      start.setUTCDate(now.getUTCDate() - day + 1);
      start.setUTCHours(0, 0, 0, 0);
      end = new Date();
      end.setUTCHours(23, 59, 59, 999);
      break;
    }

    case "last_week": {
      const day = now.getUTCDay() || 7;
      start = new Date();
      start.setUTCDate(now.getUTCDate() - day - 6);
      start.setUTCHours(0, 0, 0, 0);
      end = new Date(start);
      end.setUTCDate(start.getUTCDate() + 6);
      end.setUTCHours(23, 59, 59, 999);
      break;
    }

    case "this_month":
      start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
      end = new Date(
        Date.UTC(
          now.getUTCFullYear(),
          now.getUTCMonth() + 1,
          0,
          23,
          59,
          59,
          999,
        ),
      );
      break;

    case "last_month":
      start = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1),
      );
      end = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0, 23, 59, 59, 999),
      );
      break;

    case "this_year":
      start = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
      end = new Date(Date.UTC(now.getUTCFullYear(), 11, 31, 23, 59, 59, 999));
      break;

    case "last_year":
      start = new Date(Date.UTC(now.getUTCFullYear() - 1, 0, 1));
      end = new Date(
        Date.UTC(now.getUTCFullYear() - 1, 11, 31, 23, 59, 59, 999),
      );
      break;

    default:
      return null;
  }

  return { start, end };
}

function getGraphDateFormat(filter?: string) {
  if (filter === "today") return "%H:00";
  if (filter?.includes("year")) return "%Y-%m";
  return "%Y-%m-%d";
}
const calculatePercentageChange = (current: number, previous: number) => {
  if (previous === 0 && current === 0) {
    return { percentage: 0, trend: "same" };
  }

  if (previous === 0) {
    return { percentage: 100, trend: "up" };
  }

  const diff = ((current - previous) / previous) * 100;

  return {
    percentage: Number(diff.toFixed(2)),
    trend: diff > 0 ? "up" : diff < 0 ? "down" : "same",
  };
};

// export const loginService = async (payload: any, res: Response) => {
//     const { username, password } = payload;
//     const countryCode = "+45";
//     const toNumber = Number(username);
//     const isEmail = isNaN(toNumber);
//     let user: any = null;

//     if (isEmail) {

//         user = await adminModel.findOne({ email: username }).select('+password');
//         if (!user) {
//             user = await usersModel.findOne({ email: username }).select('+password');
//         }
//     } else {

//         const formattedPhoneNumber = `${countryCode}${username}`;
//         user = await adminModel.findOne({ phoneNumber: formattedPhoneNumber }).select('+password');
//         if (!user) {
//             user = await usersModel.findOne({ phoneNumber: formattedPhoneNumber }).select('+password');
//         }
//     }

//     if (!user) return errorResponseHandler('User not found', httpStatusCode.NOT_FOUND, res);
//     const isPasswordValid = await bcrypt.compare(password, user.password);
//     if (!isPasswordValid) {
//         return errorResponseHandler('Invalid password', httpStatusCode.UNAUTHORIZED, res);
//     }
//     const userObject = user.toObject();
//     delete userObject.password;

//     return {
//         success: true,
//         message: "Login successful",
//         data: {
//             user: userObject,
//         },
//     };
// };

// export const forgotPasswordService = async (payload: any, res: Response) => {
//     const { username } = payload;
//     const countryCode = "+45";
//     const toNumber = Number(username);
//     const isEmail = isNaN(toNumber);
//     let user: any = null;
//     if (isEmail) {

//         user = await adminModel.findOne({ email: username }).select('+password');
//         if (!user) {
//             user = await usersModel.findOne({ email: username }).select('+password');
//         }
//         if (!user) return errorResponseHandler('User not found', httpStatusCode.NOT_FOUND, res);

//         const passwordResetToken = await generatePasswordResetToken(username);
//         if (passwordResetToken) {
//             await sendPasswordResetEmail(username, passwordResetToken.token);
//             return { success: true, message: "Password reset email sent with OTP" };
//         }
//     } else {
//         const formattedPhoneNumber = `${countryCode}${username}`;
//         user = await adminModel.findOne({ phoneNumber: formattedPhoneNumber }).select('+password');
//         if (!user) {
//             user = await usersModel.findOne({ phoneNumber: formattedPhoneNumber }).select('+password');
//         }
//         if (!user) return errorResponseHandler('User not found', httpStatusCode.NOT_FOUND, res);

//         const passwordResetTokenBySms = await generatePasswordResetTokenByPhone(formattedPhoneNumber);
//         if (passwordResetTokenBySms) {
//             await generatePasswordResetTokenByPhoneWithTwilio(formattedPhoneNumber, passwordResetTokenBySms.token);
//             return { success: true, message: "Password reset SMS sent with OTP" };
//         }
//     }

//     return errorResponseHandler('Failed to generate password reset token', httpStatusCode.INTERNAL_SERVER_ERROR, res);
// };

// export const newPassswordAfterOTPVerifiedService = async (payload: { password: string, otp: string }, res: Response) => {
//     // console.log('payload: ', payload);
//     const { password, otp } = payload

//     const existingToken = await getPasswordResetTokenByToken(otp)
//     if (!existingToken) return errorResponseHandler("Invalid OTP", httpStatusCode.BAD_REQUEST, res)

//     const hasExpired = new Date(existingToken.expires) < new Date()
//     if (hasExpired) return errorResponseHandler("OTP expired", httpStatusCode.BAD_REQUEST, res)

//         let existingAdmin:any;

//         if (existingToken.email) {
//           existingAdmin = await adminModel.findOne({ email: existingToken.email });
//         }
//         else if (existingToken.phoneNumber) {
//           existingAdmin = await adminModel.findOne({ phoneNumber: existingToken.phoneNumber });
//         }

//     const hashedPassword = await bcrypt.hash(password, 10)
//     const response = await adminModel.findByIdAndUpdate(existingAdmin._id, { password: hashedPassword }, { new: true });
//     await passwordResetTokenModel.findByIdAndDelete(existingToken._id);

//     return {
//         success: true,
//         message: "Password updated successfully",
//         data: response
//     }
// }

export const createLikeProductService = async (req: any, res: Response) => {
  const { title, credits, price, interval } = req.body;

  // Validation
  if (!title || !credits || !price) {
    return errorResponseHandler(
      "title, credits & price are required",
      httpStatusCode.BAD_REQUEST,
      res,
    );
  }

  // Create Stripe product
  const stripeProduct = await stripe.products.create({
    name: title,
    metadata: {
      type: "likes",
      credits: credits.toString(),
    },
  });

  const stripePrice = await stripe.prices.create({
    product: stripeProduct.id,
    unit_amount: price * 100, // convert $ -> cents
    currency: "usd",
    recurring: { interval: interval || "month" },
    metadata: {
      type: "likes",
      credits: credits.toString(),
    },
  });

  // Save to MongoDB
  const product = await LikeProductsModel.create({
    title,
    credits,
    price,
    interval: interval || "month",
    stripeProductId: stripeProduct.id,
    stripePriceId: stripePrice.id,
  });

  return {
    success: true,
    message: "Like product created successfully",
    data: product,
  };
};
export const updateLikeProductService = async (req: any, res: Response) => {
  const { productId } = req.params;
  const { title, credits, price, interval } = req.body;

  const product = await LikeProductsModel.findById(productId);
  if (!product) {
    return errorResponseHandler(
      "Product not found",
      httpStatusCode.NOT_FOUND,
      res,
    );
  }

  // Update Stripe product
  if (title) {
    await stripe.products.update(product.stripeProductId!, {
      name: title,
    });
  }

  // Create new Stripe price if price/credits changed
  let newStripePrice;
  if (price || credits || interval) {
    newStripePrice = await stripe.prices.create({
      product: product.stripeProductId!,
      unit_amount: (price || product.price) * 100,
      currency: "usd",
      recurring: { interval: interval || product.interval },
      metadata: {
        type: "likes",
        credits: (credits || product.credits).toString(),
      },
    });
  }

  // Update MongoDB record
  const updated = await LikeProductsModel.findByIdAndUpdate(
    productId,
    {
      title: title ?? product.title,
      credits: credits ?? product.credits,
      price: price ?? product.price,
      interval: interval ?? product.interval,
      stripePriceId: newStripePrice?.id || product.stripePriceId,
    },
    { new: true },
  );

  return {
    success: true,
    message: "Like product updated successfully",
    data: updated,
  };
};
export const getLikeProductsService = async (req: any, res: Response) => {
  const products = await LikeProductsModel.find().sort({ price: 1 });

  return {
    success: true,
    message: "Like products fetched successfully",
    data: products,
  };
};

export const getLikeProductByIdService = async (req: any, res: Response) => {
  const { productId } = req.params;

  const product = await LikeProductsModel.findById(productId);

  if (!product) {
    return {
      success: false,
      message: "Like product not found",
      status: 404,
    };
  }

  return {
    success: true,
    message: "Like product fetched successfully",
    data: product,
  };
};

export const createPromotionPlanService = async (req: any, res: Response) => {
  const { title, price, durationDays } = req.body;

  if (!title || !price || !durationDays) {
    return errorResponseHandler(
      "title, price & durationDays are required",
      httpStatusCode.BAD_REQUEST,
      res,
    );
  }

  // Save plan to DB (no Stripe product/price created)
  const plan = await PromotionPlanModel.create({
    title,
    price,
    priceInCents: price * 100,
    durationDays,
  });

  return {
    success: true,
    message: "Promotion plan created successfully",
    data: plan,
  };
};

export const updatePromotionPlanService = async (req: any, res: Response) => {
  const { planId } = req.params;
  const { title, price, durationDays } = req.body;

  if (!mongoose.Types.ObjectId.isValid(planId)) {
    return errorResponseHandler(
      "Invalid plan ID",
      httpStatusCode.BAD_REQUEST,
      res,
    );
  }

  const existing = await PromotionPlanModel.findById(planId);
  if (!existing) {
    return errorResponseHandler(
      "Promotion plan not found",
      httpStatusCode.NOT_FOUND,
      res,
    );
  }

  const updated = await PromotionPlanModel.findByIdAndUpdate(
    planId,
    {
      title: title ?? existing.title,
      price: price ?? existing.price,
      durationDays: durationDays ?? existing.durationDays,
      priceInCents: price ? price * 100 : existing.priceInCents,
    },
    { new: true },
  );

  return {
    success: true,
    message: "Promotion plan updated successfully",
    data: updated,
  };
};
export const getPromotionPlansService = async (req: any, res: Response) => {
  const plans = await PromotionPlanModel.find().sort({ price: 1 });

  return {
    success: true,
    message: "Promotion plans fetched successfully",
    data: plans,
  };
};

export const adminSettings = {
  async verifyAdminPassword(payload: any) {
    const { adminId, password } = payload;

    if (!password) throw new Error("Password is Required");

    const admin = await AdminModel.findOne({
      _id: adminId,
      isDeleted: false,
      isBlocked: false,
    }).select("password phoneNumber email");

    if (!admin || !admin.password) {
      throw new Error("Admin not found");
    }

    const isValid = await verifyPassword(password, admin.password);
    if (!isValid) {
      throw new Error("Invalid password");
    }
    const settingsToken = jwt.sign(
      {
        adminId: admin._id,
        scope: "SETTINGS",
      },
      process.env.SETTINGS_JWT_SECRET as string,
      {
        expiresIn: "5m",
      },
    );

    return {
      settingsToken,
      phoneNummber: admin.phoneNumber,
      email: admin.email,
    };
  },
  async submitChangeRequest(payload: any) {
    const { adminId, oldValue, newValue, type } = payload;
    const allowedTypes = ["EMAIL", "PHONE"];

    if (!oldValue || !newValue) {
      throw new Error(
        `Old ${type.toLowerCase()} and new ${type.toLowerCase()} are required`,
      );
    }

    if (!type) {
      if (!allowedTypes.includes(type)) {
        throw new Error("Invalid Type");
      }
    }

    const admin = await AdminModel.findOne({
      _id: adminId,
      isDeleted: false,
      isBlocked: false,
    });

    if (!admin) throw new Error("Admin not Found");

    if (type === "EMAIL") {
      if (admin.email !== oldValue) {
        throw new Error("Old email doesn't match");
      }
    }

    if (type === "PHONE") {
      if (!admin.phoneNumber) {
        throw new Error("Phone number not set for this admin");
      }

      if (admin.phoneNumber.toString() !== oldValue) {
        throw new Error("Old phone number doesn't match");
      }
    }

    if (type === "EMAIL") {
      const existing = await AdminModel.findOne({ email: newValue });
      if (existing) throw new Error("New email already in use");
    } else if (type === "PHONE") {
      const existing = await AdminModel.findOne({ phoneNumber: newValue });
      if (existing) throw new Error("New phone already in use");
    }

    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 min

    await AdminChangeRequestModel.deleteMany({
      adminId,
      type: type,
      isVerified: false,
    });

    const changeRequest = await AdminChangeRequestModel.create({
      adminId,
      type: type,
      purpose: "CHANGE_EMAIL",
      oldValue: oldValue,
      newValue: newValue,
      isVerified: false,
      expiresAt,
    });

    const otp = await generateAndSendOtp(
      newValue,
      type === "EMAIL" ? "VERIFY_EMAIL" : "VERIFY_PHONE",
      type,
      "ADMIN",
    );
    return {
      expiresAt,
      //todo remove otp from here.
      otp,
    };
  },
  async resendChangeOtp(payload: any) {
    const { adminId, newValue, type } = payload;
    if (!adminId || !newValue || !type)
      throw new Error("Missing required fields");

    const changeRequest = await AdminChangeRequestModel.findOne({
      adminId,
      type,
      newValue,
      isVerified: false,
      expiresAt: { $gt: new Date() },
    });
    if (!changeRequest)
      throw new Error(`No pending ${type.toLowerCase()} change request found`);

    const otp = await generateAndSendOtp(
      newValue,
      type === "EMAIL" ? "VERIFY_EMAIL" : "VERIFY_PHONE",
      type,
      "ADMIN",
    );

    return {
      message: `OTP resent to new ${type.toLowerCase()}`,
      otp,
    };
  },

  async verifyChangeOtp(payload: any) {
    const { adminId, newValue, otp, type } = payload;
    if (!adminId || !newValue || !otp || !type)
      throw new Error("Missing required fields");

    const changeRequest = await AdminChangeRequestModel.findOne({
      adminId,
      type,
      newValue,
      isVerified: false,
      expiresAt: { $gt: new Date() },
    });

    if (!changeRequest) {
      throw new Error("Change request expired or not found");
    }

    const otpRecord = await OtpModel.findOne({
      [type === "EMAIL" ? "email" : "phone"]: newValue,
      code: otp,
      userType: "ADMIN",
    });

    if (!otpRecord) {
      throw new Error("Invalid OTP");
    }
    const updateData: any = {};
    if (type === "EMAIL") updateData.email = newValue;
    else updateData.phoneNumber = newValue;

    await AdminModel.updateOne({ _id: adminId }, { $set: updateData });
    await OtpModel.deleteMany({
      [type === "EMAIL" ? "email" : "phone"]: newValue,
    });
    await AdminChangeRequestModel.deleteOne({ _id: changeRequest._id });

    return { message: `${type} updated successfully` };
  },

  async requestPasswordReset(payload: any) {
    const { adminId, email } = payload;
    if (!email) throw new Error("Email is required");
    const admin = await AdminModel.findOne({
      _id: adminId,
      email,
      isDeleted: false,
      isBlocked: false,
    });
    if (!admin) throw new Error("Admin Not Found.");

    await OtpModel.updateMany(
      {
        adminId,
        purpose: "FORGOT_PASSWORD",
        tokenType: "RESET",
        used: false,
      },
      { used: true },
    );

    const rawToken = crypto.randomBytes(32).toString("hex");
    const hashedToken = sha256(rawToken);

    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    await OtpModel.create({
      adminId: admin._id,
      email,
      code: hashedToken,
      tokenType: "RESET",
      purpose: "FORGOT_PASSWORD",
      type: "EMAIL",
      userType: "ADMIN",
      expiresAt,
    });

    const resetLink = `${process.env.FRONTEND_URL}/reset-password?token=${rawToken}`;

    await sendResetPasswordEmail({
      to: email,
      resetLink: resetLink,
      companyName: "Baccvs",
    });
    return { message: "Password reset link sent", resetLink };
  },

  async resetPassword(payload: any) {
    const { token, password, confirmPassword } = payload;

    if (password !== confirmPassword) {
      throw new Error("Passwords do not match");
    }

    if (password.length < 8) {
      throw new Error("Password must be at least 8 characters");
    }

    const hashedToken = sha256(token);

    const resetRecord = await OtpModel.findOne({
      code: hashedToken,
      tokenType: "RESET",
      purpose: "FORGOT_PASSWORD",
      userType: "ADMIN",
      used: false,
      expiresAt: { $gt: new Date() },
    });

    if (!resetRecord) {
      throw new Error("Invalid or expired reset link");
    }

    await AdminModel.updateOne(
      { _id: resetRecord.adminId },
      { password: await hashPassword(password) },
    );

    await OtpModel.updateOne({ _id: resetRecord._id }, { used: true });

    return {
      message: "Password reset successful",
    };
  },
  async updateAdminData(payload: any) {
    const {
      adminId,
      fullName,
      image,
      eventNotification,
      signUpNotification,
      complaintsNotification,
      paymentsNotification,
    } = payload;

    const updatePayload: Record<string, any> = {};

    if (fullName !== undefined) {
      const normalized = fullName.trim().replace(/\s+/g, " ");
      const parts = normalized.split(" ");

      if (parts.length < 2) {
        throw new Error("Full name must include first and last name");
      }

      updatePayload.firstName = parts[0];
      updatePayload.lastName = parts.slice(1).join(" ");
      updatePayload.fullName = normalized;
    }
    if (image !== undefined) updatePayload.image = image;

    if (typeof eventNotification === "boolean")
      updatePayload.eventNotification = eventNotification;

    if (typeof signUpNotification === "boolean")
      updatePayload.signUpNotification = signUpNotification;

    if (typeof complaintsNotification === "boolean")
      updatePayload.complaintsNotification = complaintsNotification;

    if (typeof paymentsNotification === "boolean")
      updatePayload.paymentsNotification = paymentsNotification;

    if (Object.keys(updatePayload).length === 0) {
      throw new Error("No valid fields provided for update");
    }

    const updatedAdmin = await AdminModel.findOneAndUpdate(
      { _id: adminId, isDeleted: false, isBlocked: false },
      { $set: updatePayload },
      { new: true },
    ).select("-password");

    if (!updatedAdmin) {
      throw new Error("Admin not found");
    }

    return {
      message: "Profile updated successfully",
      admin: updatedAdmin,
    };
  },
  async getAdminData(payload: any) {
    const { adminId } = payload;

    if (!adminId) {
      throw new Error("Unauthorized");
    }

    const checkExist = await AdminModel.findOne({
      _id: adminId,
      role: "SUPERADMIN",
      isDeleted: false,
      isBlocked: false,
    })
      .select("-createdAt -updatedAt -__v -password")
      .lean();
    if (!checkExist) {
      throw new Error("Admin not Found.");
    }
    return { data: checkExist };
  },
};

export const StaffServices = {
  async inviteStaff(payload: any) {
    const { adminId, email, roleAccess, firstName, lastName, adminName } =
      payload;

    const existing = await AdminModel.findOne({ email, isDeleted: false });
    if (existing) throw new Error("User already exists");

    const staff = await AdminModel.create({
      email,
      role: "STAFF",
      roleAccess,
      inviteStatus: "INVITED",
      firstName: firstName,
      lastName: lastName ? lastName : "",
      fullName: `${firstName} ${`${lastName}` ? `${lastName}` : ""}`,
      image: "",
      authType: "EMAIL",
    });
    await OtpModel.updateMany(
      {
        email,
        purpose: "STAFF_INVITE",
        used: false,
      },
      { used: true },
    );
    const rawToken = crypto.randomBytes(32).toString("hex");
    const hashedToken = sha256(rawToken);

    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await OtpModel.create({
      adminId: staff._id,
      email,
      code: hashedToken,
      purpose: "STAFF_INVITE",
      tokenType: "INVITE",
      type: "EMAIL",
      userType: "STAFF",
      expiresAt,
    });
    const inviteLink = `${process.env.FRONTEND_URL}/staff-invite?token=${rawToken}`;

    await sendStaffInvitationEmail({
      to: email,
      inviteLink,
      staffName: firstName,
      invitedBy: adminName,
      companyName: "Baccvs",
    });

    return { message: "Staff invitation sent", inviteLink };
  },

  async acceptInvitation(payload: any) {
    const { token, password } = payload;

    const hashedToken = sha256(token);

    const invite = await OtpModel.findOne({
      code: hashedToken,
      purpose: "STAFF_INVITE",
      used: false,
      expiresAt: { $gt: new Date() },
    });

    if (!invite) throw new Error("Invite link expired or invalid");

    const staff = await AdminModel.findById(invite.adminId);
    if (!staff) throw new Error("Staff not found");

    staff.password = await hashPassword(password);
    staff.inviteStatus = "ACTIVE";

    await staff.save();

    invite.used = true;
    await invite.save();

    return { message: "Staff account activated successfully" };
  },

  async getAllStaffMembers(payload: any) {
    const { status, page, limit, access, search } = payload;

    const pageNumber = parseInt(page, 10) || 1;
    const limitNumber = parseInt(limit, 10) || 10;
    const skip = (pageNumber - 1) * limitNumber;

    const filter: any = {
      role: "STAFF",
      isDeleted: false,
    };

    if (status) {
      if (status.toLowerCase() === "active") {
        filter.isBlocked = false;
      } else if (status.toLowerCase() === "inactive") {
        filter.isBlocked = true;
      } else {
        throw new Error("Invalid status. Allowed values: active, inactive");
      }
    }

    if (search) {
      filter.email = { $regex: search, $options: "i" };
    }

    if (access) {
      filter.roleAccess = { $in: [access] };
    }

    const totalStaff = await AdminModel.countDocuments(filter);

    const staffList = await AdminModel.aggregate([
      { $match: filter },
      { $sort: { createdAt: -1 } },
      { $skip: skip },
      { $limit: limitNumber },
      {
        $project: {
          _id: 1,
          firstName: 1,
          lastName: 1,
          fullName: 1,
          email: 1,
          image: 1,
          role: 1,
          roleAccess: 1,
          isBlocked: 1,
          isDeleted: 1,
          createdAt: 1,
          updatedAt: 1,
        },
      },
    ]);

    return {
      data: staffList,
      pagination: {
        total: totalStaff,
        page: pageNumber,
        limit: limitNumber,
        totalPages: Math.ceil(totalStaff / limitNumber),
      },
    };
  },

  async getSingleStaffMember(payload: any) {
    const { id, adminId } = payload;

    if (!adminId) throw new Error("Unauthorized");

    if (!id) throw new Error("Id is required");

    const staff = await AdminModel.findOne({
      _id: id,
      isDeleted: false,
    })
      .select("-password")
      .lean();
    if (!staff) throw new Error("Staff Member Not Found");

    return staff;
  },

  async updateStaffRoleAccess(payload: any) {
    const { adminId, staffId, roleAccess } = payload;

    const ALLOWED_ROLE_ACCESS = [
      "full",
      "Dashboard",
      "Users",
      "Event&Ticketing",
      "Revenue&Financial",
      "Referrals",
      "Marketing&Promotions",
      "Security&Compliance",
      "Customer&Support",
      "Loyalty&Gamification",
      "Staffs",
      "Settings",
    ];

    if (!Array.isArray(roleAccess)) {
      throw new Error("roleAccess must be an array");
    }
    if (!adminId) {
      throw new Error("Unauthorized");
    }

    if (!staffId) {
      throw new Error("Staff ID is required");
    }

    const uniqueRoleAccess = Array.from(
      new Set(roleAccess.map((r: string) => r.trim())),
    );

    const invalidRoles = uniqueRoleAccess.filter(
      (r: string) => !ALLOWED_ROLE_ACCESS.includes(r),
    );

    if (invalidRoles.length) {
      throw new Error(`Invalid roleAccess values: ${invalidRoles.join(", ")}`);
    }

    const admin = await AdminModel.findOne({
      _id: adminId,
      isDeleted: false,
      isBlocked: false,
      role: { $in: ["SUPERADMIN", "ADMIN"] },
    });
    if (!admin) {
      throw new Error("Not allowed to update staff permissions");
    }
    const staff = await AdminModel.findOneAndUpdate(
      {
        _id: staffId,
        role: "STAFF",
        isDeleted: false,
      },
      {
        $set: { roleAccess: uniqueRoleAccess },
      },
      { new: true },
    );

    if (!staff) {
      throw new Error("Staff member not found");
    }

    return {
      message: "Staff role access updated successfully",
      roleAccess: staff.roleAccess,
    };
  },

  async removeUnRemoveStaff(payload: any) {
    const { adminId, staffId } = payload;

    if (!adminId) {
      throw new Error("Unauthorized");
    }

    if (!staffId) {
      throw new Error("Staff ID is required");
    }

    const admin = await AdminModel.findOne({
      _id: adminId,
      isDeleted: false,
      isBlocked: false,
      role: { $in: ["SUPERADMIN", "ADMIN"] },
    });

    if (!admin) {
      throw new Error("Not allowed to manage staff");
    }
    const staff = await AdminModel.findOne({
      _id: staffId,
      role: "STAFF",
      isDeleted: false,
    });

    if (!staff) {
      throw new Error("Staff member not found");
    }

    staff.isBlocked = !staff.isBlocked;
    await staff.save();

    return {
      message: staff.isBlocked
        ? "Staff member blocked successfully"
        : "Staff member unblocked successfully",
      isBlocked: staff.isBlocked,
    };
  },
};

export const UserServices = {
  async getAllUsers(payload: any) {
    const { status, page, limit, search } = payload;

    const pageNumber = parseInt(page, 10) || 1;
    const limitNumber = parseInt(limit, 10) || 10;
    const skip = (pageNumber - 1) * limitNumber;

    const baseFilter: any = { isDeleted: false };

    if (status) {
      if (status === "active") {
        baseFilter.$and = [
          {
            $or: [{ isBlocked: false }, { isBlocked: { $exists: false } }],
          },
          {
            $or: [{ isBanned: false }, { isBanned: { $exists: false } }],
          },
        ];
      }

      if (status === "inactive") {
        baseFilter.$and = [
          {
            $or: [{ isBlocked: true }],
          },
          {
            $or: [{ isBanned: false }, { isBanned: { $exists: false } }],
          },
        ];
      }

      if (status === "banned") {
        baseFilter.$or = [{ isBanned: true }];
      }
    }

    // 🔹 Search
    if (search) {
      baseFilter.$or = [
        { fullName: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
      ];
    }

    const now = new Date();
    const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);

    const [result = {}] = await usersModel.aggregate<any>([
      {
        $facet: {
          // 📄 Users list
          users: [
            { $match: baseFilter },
            { $sort: { createdAt: -1 } },
            { $skip: skip },
            { $limit: limitNumber },
            {
              $project: {
                userName: 1,
                email: 1,
                photos: 1,
                isBlocked: 1,
                isBanned: 1,
                createdAt: 1,
                phoneNumber: 1,
                countryCode: 1,
                dob: 1,
                gender: 1,
                location: 1,
                status: 1,
                fullName: 1,
                isDeleted: 1,
              },
            },
          ],

          // 📊 Pagination count
          paginationCount: [{ $match: baseFilter }, { $count: "count" }],

          // 📊 Stats
          totalUsers: [{ $match: { isDeleted: false } }, { $count: "count" }],

          lastMonthTotalUsers: [
            {
              $match: {
                isDeleted: false,
                createdAt: { $lt: startOfThisMonth },
              },
            },
            { $count: "count" },
          ],

          newUsersThisMonth: [
            {
              $match: {
                isDeleted: false,
                createdAt: { $gte: startOfThisMonth },
              },
            },
            { $count: "count" },
          ],

          newUsersLastMonth: [
            {
              $match: {
                isDeleted: false,
                createdAt: {
                  $gte: startOfLastMonth,
                  $lte: endOfLastMonth,
                },
              },
            },
            { $count: "count" },
          ],

          activeUsers: [
            {
              $match: {
                isDeleted: false,
                isBlocked: false,
                isBanned: false,
              },
            },
            { $count: "count" },
          ],

          activeUsersLastMonth: [
            {
              $match: {
                isDeleted: false,
                isBlocked: false,
                isBanned: false,
                createdAt: { $lt: startOfThisMonth },
              },
            },
            { $count: "count" },
          ],

          bannedUsers: [
            {
              $match: {
                isDeleted: false,
                isBanned: true,
              },
            },
            { $count: "count" },
          ],

          bannedUsersLastMonth: [
            {
              $match: {
                isDeleted: false,
                isBanned: true,
                createdAt: { $lt: startOfThisMonth },
              },
            },
            { $count: "count" },
          ],
        },
      },
    ]);

    const getCount = (arr: any[]) => arr?.[0]?.count ?? 0;

    const percentage = (current: number, previous: number) =>
      previous === 0
        ? 100
        : Number((((current - previous) / previous) * 100).toFixed(2));

    return {
      data: result.users ?? [],
      stats: {
        totalUsers: {
          count: getCount(result.totalUsers),
          percentage: percentage(
            getCount(result.totalUsers),
            getCount(result.lastMonthTotalUsers),
          ),
        },
        newUsers: {
          count: getCount(result.newUsersThisMonth),
          percentage: percentage(
            getCount(result.newUsersThisMonth),
            getCount(result.newUsersLastMonth),
          ),
        },
        activeUsers: {
          count: getCount(result.activeUsers),
          percentage: percentage(
            getCount(result.activeUsers),
            getCount(result.activeUsersLastMonth),
          ),
        },
        bannedUsers: {
          count: getCount(result.bannedUsers),
          percentage: percentage(
            getCount(result.bannedUsers),
            getCount(result.bannedUsersLastMonth),
          ),
        },
      },
      pagination: {
        total: getCount(result.paginationCount),
        page: pageNumber,
        limit: limitNumber,
        totalPages: Math.ceil(getCount(result.paginationCount) / limitNumber),
      },
    };
  },
  async updateUsersBanStatus(payload: any) {
    const { admin, userIds, isBanned } = payload;

    if (!admin) {
      throw new Error("Unauthorized");
    }

    const updatePayload: any = {
      isBanned,
      updatedAt: new Date(),
    };

    if (isBanned) {
      updatePayload.status = "banned";
      // updatePayload.isBlocked = true;
    } else {
      updatePayload.status = "active";
      // updatePayload.isBlocked = false;
    }

    const result = await usersModel.updateMany(
      {
        _id: { $in: userIds },
        isDeleted: false,
      },
      {
        $set: updatePayload,
      },
    );

    return {
      affectedCount: result.modifiedCount,
      isBanned,
      message: isBanned
        ? "Users banned successfully"
        : "Users unbanned successfully",
    };
  },
  async deleteMultipleUsers(payload: any) {
    const { admin, userIds } = payload;

    if (!admin) {
      throw new Error("Unauthorized");
    }

    const result = await usersModel.updateMany(
      {
        _id: { $in: userIds },
        isDeleted: false,
      },
      {
        $set: {
          isDeleted: true,
          status: "deleted",
          updatedAt: new Date(),
        },
      },
    );

    return {
      affectedCount: result.modifiedCount,
      message: "Users deleted successfully",
    };
  },
  async getSingleUserDetails(payload: any) {
    const { admin, userId } = payload;

    if (!admin) {
      throw new Error("Unauthorized");
    }

    const user = await usersModel
      .findOne({
        _id: userId,
        isDeleted: false,
      })
      .select(
        "-password -fcmToken -createdAt -updatedAt -__v -token -stripeAccountId -stripeAccountData",
      )
      .lean();

    if (!user) {
      throw new Error("User not found");
    }

    const followersCount = await followModel.countDocuments({
      following_id: userId,
      relationship_status: "FOLLOWING",
    });

    const followingCount = await followModel.countDocuments({
      follower_id: userId,
      relationship_status: "FOLLOWING",
    });

    const totalEvents = await eventModel.countDocuments({
      creator: userId,
    });

    const reports = await reportModel.aggregate([
      {
        $match: {
          target: new mongoose.Types.ObjectId(userId),
          targetType: "users",
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "reporter",
          foreignField: "_id",
          as: "reporter",
        },
      },
      { $unwind: "$reporter" },
      {
        $project: {
          _id: 1,
          reason: 1,
          details: 1,
          status: 1,
          createdAt: 1,
          reporter: {
            _id: "$reporter._id",
            userName: "$reporter.userName",
            email: "$reporter.email",
          },
        },
      },
      { $sort: { createdAt: -1 } },
    ]);

    return {
      user,
      stats: {
        followersCount,
        followingCount,
        totalEvents,
        reportsCount: reports.length,
      },
      reports,
    };
  },
};
export const adminEventAndTicketingServices = {
  async getEventStats(payload: any) {
    const { adminId, startDate, endDate, revenueFilter, search, eventFilter } =
      payload;
    const now = new Date();

    /* ---------------- EVENT DATE FILTER ---------------- */
    const eventMatch: any = {};
    if (eventFilter === "upcoming") eventMatch.utcDateTime = { $gt: now };
    if (eventFilter === "past") eventMatch.utcDateTime = { $lt: now };
    if (eventFilter === "ongoing") {
      eventMatch.$expr = {
        $and: [{ $lte: ["$utcDateTime", now] }, { $gte: ["$endTime", now] }],
      };
    }
    if (search) eventMatch.title = { $regex: search, $options: "i" };

    /* ---------------- DATE RANGE ---------------- */
    const purchaseDateFilter: any = {};
    if (startDate && endDate) {
      purchaseDateFilter.purchaseDate = {
        $gte: new Date(startDate),
        $lte: new Date(endDate),
      };
    }

    const revenueRange = getRevenueDateRange(revenueFilter);
    let previousMonthRange = null;

    if (revenueFilter === "thisMonth") {
      const startOfThisMonth = revenueRange.start;

      previousMonthRange = {
        start: new Date(
          startOfThisMonth.getFullYear(),
          startOfThisMonth.getMonth() - 1,
          1,
        ),
        end: new Date(
          startOfThisMonth.getFullYear(),
          startOfThisMonth.getMonth(),
          0,
          23,
          59,
          59,
          999,
        ),
      };
    }

    /* ---------------- TICKET SALES & GRAPH ---------------- */
    let salesAnalytics = {
      totalTicketsSold: 0,
      grossRevenueUSD: 0,
      netRevenueUSD: 0,
      graph: [],
    };

    if (revenueRange) {
      const salesAgg = await purchaseModel.aggregate([
        {
          $match: {
            purchaseType: "purchase",
            status: { $in: ["active", "used"] },
            purchaseDate: { $gte: revenueRange.start, $lte: revenueRange.end },
          },
        },
        {
          $addFields: {
            day: {
              $dateToString: { format: "%Y-%m-%d", date: "$purchaseDate" },
            },
            stripeFeeUSD: {
              $cond: [
                { $ifNull: ["$metaData.balanceTx", false] },
                {
                  $divide: [
                    { $multiply: ["$metaData.balanceTx.fee", 0.01] },
                    "$metaData.balanceTx.exchange_rate",
                  ],
                },
                0,
              ],
            },
            netRevenueUSD: {
              $subtract: [
                "$totalPrice",
                {
                  $cond: [
                    { $ifNull: ["$metaData.balanceTx", false] },
                    {
                      $divide: [
                        { $multiply: ["$metaData.balanceTx.fee", 0.01] },
                        "$metaData.balanceTx.exchange_rate",
                      ],
                    },
                    0,
                  ],
                },
              ],
            },
          },
        },
        {
          $group: {
            _id: "$day",
            ticketsSold: { $sum: "$quantity" },
            grossRevenueUSD: { $sum: "$totalPrice" },
            netRevenueUSD: { $sum: "$netRevenueUSD" },
          },
        },
        { $sort: { _id: 1 } },
      ]);

      salesAnalytics.graph = salesAgg.map((d) => ({
        date: d._id,
        ticketsSold: d.ticketsSold,
        grossRevenueUSD: d.grossRevenueUSD,
        netRevenueUSD: d.netRevenueUSD,
      }));

      salesAnalytics.totalTicketsSold = salesAgg.reduce(
        (sum, d) => sum + d.ticketsSold,
        0,
      );
      salesAnalytics.grossRevenueUSD = salesAgg.reduce(
        (sum, d) => sum + d.grossRevenueUSD,
        0,
      );
      salesAnalytics.netRevenueUSD = salesAgg.reduce(
        (sum, d) => sum + d.netRevenueUSD,
        0,
      );
    }

    /* ---------------- TOTAL EVENTS ---------------- */
    const totalEvents = await eventModel.countDocuments(eventMatch);

    /* ---------------- TICKET + REVENUE AGG ---------------- */
    const ticketSalesAgg = await purchaseModel.aggregate([
      {
        $match: {
          status: { $in: ["active", "used"] },
          ...purchaseDateFilter,
          purchaseType: "purchase",
        },
      },
      {
        $group: {
          _id: null,
          ticketsSold: { $sum: "$quantity" },
          grossRevenueUSD: { $sum: "$totalPrice" },
          stripeFeeUSD: {
            $sum: {
              $cond: [
                { $ifNull: ["$metaData.balanceTx", false] },
                {
                  $divide: [
                    { $multiply: ["$metaData.balanceTx.fee", 0.01] },
                    "$metaData.balanceTx.exchange_rate",
                  ],
                },
                0,
              ],
            },
          },
        },
      },
    ]);

    const ticketSales = ticketSalesAgg[0] || {
      ticketsSold: 0,
      grossRevenueUSD: 0,
      stripeFeeUSD: 0,
    };
    const netRevenueUSD =
      ticketSales.grossRevenueUSD - ticketSales.stripeFeeUSD;

    /* ---------------- AVAILABLE TICKETS ---------------- */
    const availableTicketsAgg = await ticketModel.aggregate([
      { $group: { _id: null, totalAvailable: { $sum: "$available" } } },
    ]);
    const availableTickets = availableTicketsAgg[0]?.totalAvailable || 0;

    /* ---------------- TOP 7 EVENTS ---------------- */
    const topEvents = await purchaseModel.aggregate([
      {
        $match: {
          status: { $in: ["active", "used", "transferred"] },
          purchaseType: "purchase",
        },
      },
      {
        $group: {
          _id: "$event",
          ticketsSold: { $sum: "$quantity" },
          revenueUSD: { $sum: "$totalPrice" },
        },
      },
      { $sort: { revenueUSD: -1 } },
      { $limit: 7 },
      {
        $lookup: {
          from: "events",
          localField: "_id",
          foreignField: "_id",
          as: "event",
        },
      },
      { $unwind: "$event" },
      {
        $replaceRoot: {
          newRoot: {
            $mergeObjects: [
              "$event",
              { ticketsSold: "$ticketsSold", revenueUSD: "$revenueUSD" },
            ],
          },
        },
      },
    ]);

    /* ---------------- EVENT LIST ---------------- */
    const events = await eventModel.aggregate([
      { $match: eventMatch },
      {
        $lookup: {
          from: "tickets",
          localField: "_id",
          foreignField: "event",
          as: "tickets",
        },
      },
      {
        $lookup: {
          from: "purchases",
          localField: "_id",
          foreignField: "event",
          as: "purchases",
        },
      },
      {
        $addFields: {
          ticketsSold: { $sum: "$purchases.quantity" },
          ticketStartFrom: { $min: "$tickets.price" },
        },
      },
      { $sort: { utcDateTime: -1 } },
    ]);
    let previousMonthStats = {
      totalTicketsSold: 0,
      grossRevenueUSD: 0,
      netRevenueUSD: 0,
    };

    if (previousMonthRange) {
      const prevAgg = await purchaseModel.aggregate([
        {
          $match: {
            purchaseType: "purchase",
            status: { $in: ["active", "used"] },
            purchaseDate: {
              $gte: previousMonthRange.start,
              $lte: previousMonthRange.end,
            },
          },
        },
        {
          $addFields: {
            stripeFeeUSD: {
              $cond: [
                { $ifNull: ["$metaData.balanceTx", false] },
                {
                  $divide: [
                    { $multiply: ["$metaData.balanceTx.fee", 0.01] },
                    "$metaData.balanceTx.exchange_rate",
                  ],
                },
                0,
              ],
            },
          },
        },
        {
          $group: {
            _id: null,
            totalTicketsSold: { $sum: "$quantity" },
            grossRevenueUSD: { $sum: "$totalPrice" },
            stripeFeeUSD: { $sum: "$stripeFeeUSD" },
          },
        },
      ]);

      if (prevAgg[0]) {
        previousMonthStats.totalTicketsSold = prevAgg[0].totalTicketsSold;
        previousMonthStats.grossRevenueUSD = prevAgg[0].grossRevenueUSD;
        previousMonthStats.netRevenueUSD =
          prevAgg[0].grossRevenueUSD - prevAgg[0].stripeFeeUSD;
      }
    }
    const ticketSoldChange = calculatePercentageChange(
      ticketSales.ticketsSold,
      previousMonthStats.totalTicketsSold,
    );

    const grossRevenueChange = calculatePercentageChange(
      ticketSales.grossRevenueUSD,
      previousMonthStats.grossRevenueUSD,
    );

    const netRevenueChange = calculatePercentageChange(
      netRevenueUSD,
      previousMonthStats.netRevenueUSD,
    );

    /* ---------------- FINAL RESPONSE ---------------- */
    return {
      summary: {
        totalEvents,
        totalTicketSold: {
          value: ticketSales.ticketsSold,
          ...ticketSoldChange,
        },
        grossRevenueUSD: {
          value: ticketSales.grossRevenueUSD,
          ...grossRevenueChange,
        },
        stripeFeeUSD: ticketSales.stripeFeeUSD,
        netRevenueUSD: {
          value: netRevenueUSD,
          ...netRevenueChange,
        },
        availableTickets,
      },
      ticketSalesSummary: {
        filter: revenueFilter,
        totalTicketsSold: salesAnalytics.totalTicketsSold,
        grossRevenueUSD: salesAnalytics.grossRevenueUSD,
        netRevenueUSD: salesAnalytics.netRevenueUSD,
      },
      ticketSalesGraph: salesAnalytics.graph,
      topEvents,
      events,
    };
  },
  async getEventById(payload: any) {
    const { eventId, revenueFilter, startDate, endDate } = payload;

    if (!eventId) throw new Error("eventId is required");

    const now = new Date();

    /* ---------------- GET EVENT DETAILS ---------------- */
    const event = await eventModel
      .findById(eventId)
      .populate("creator", "userName email photos")
      .populate("coHosts", "userName email photos");

    if (!event) throw new Error("Event not found");

    /* ---------------- GET EVENT TICKETS ---------------- */
    const tickets = await ticketModel.find({ event: event._id });

    /* ---------------- DATE RANGE FILTER ---------------- */
    const purchaseDateFilter: any = { event: event._id };
    if (startDate && endDate) {
      purchaseDateFilter.purchaseDate = {
        $gte: new Date(startDate),
        $lte: new Date(endDate),
      };
    }

    const revenueRange = getRevenueDateRange(revenueFilter);

    /* ---------------- TICKET SALES & GRAPH ---------------- */
    let salesAnalytics = {
      totalTicketsSold: 0,
      grossRevenueUSD: 0,
      netRevenueUSD: 0,
      graph: [],
    };

    if (revenueRange) {
      const salesAgg = await purchaseModel.aggregate([
        {
          $match: {
            event: event._id,
            purchaseType: "purchase",
            status: { $in: ["active", "used", "transferred"] },
            purchaseDate: { $gte: revenueRange.start, $lte: revenueRange.end },
          },
        },
        {
          $addFields: {
            day: {
              $dateToString: { format: "%Y-%m-%d", date: "$purchaseDate" },
            },
            stripeFeeUSD: {
              $cond: [
                { $ifNull: ["$metaData.balanceTx", false] },
                {
                  $divide: [
                    { $multiply: ["$metaData.balanceTx.fee", 0.01] },
                    "$metaData.balanceTx.exchange_rate",
                  ],
                },
                0,
              ],
            },
            netRevenueUSD: {
              $subtract: [
                "$totalPrice",
                {
                  $cond: [
                    { $ifNull: ["$metaData.balanceTx", false] },
                    {
                      $divide: [
                        { $multiply: ["$metaData.balanceTx.fee", 0.01] },
                        "$metaData.balanceTx.exchange_rate",
                      ],
                    },
                    0,
                  ],
                },
              ],
            },
          },
        },
        {
          $group: {
            _id: "$day",
            ticketsSold: { $sum: "$quantity" },
            grossRevenueUSD: { $sum: "$totalPrice" },
            netRevenueUSD: { $sum: "$netRevenueUSD" },
          },
        },
        { $sort: { _id: 1 } },
      ]);

      salesAnalytics.graph = salesAgg.map((d) => ({
        date: d._id,
        ticketsSold: d.ticketsSold,
        grossRevenueUSD: d.grossRevenueUSD,
        netRevenueUSD: d.netRevenueUSD,
      }));

      salesAnalytics.totalTicketsSold = salesAgg.reduce(
        (sum, d) => sum + d.ticketsSold,
        0,
      );
      salesAnalytics.grossRevenueUSD = salesAgg.reduce(
        (sum, d) => sum + d.grossRevenueUSD,
        0,
      );
      salesAnalytics.netRevenueUSD = salesAgg.reduce(
        (sum, d) => sum + d.netRevenueUSD,
        0,
      );
    }

    /* ---------------- HOST & CO-HOST STATS ---------------- */
    const hostIds = [
      event.creator?._id,
      ...(event.coHosts || []).map((c: any) => c._id),
    ];

    const hostObjectIds = hostIds
      .filter(Boolean)
      .map((id: any) => new mongoose.Types.ObjectId(id));

    const hostStatsAgg = await purchaseModel.aggregate([
      {
        $match: {
          status: { $in: ["active", "used"] },
          purchaseType: "purchase",
        },
      },
      {
        $lookup: {
          from: "events",
          localField: "event",
          foreignField: "_id",
          as: "event",
        },
      },
      { $unwind: "$event" },
      // build hosts array containing creator + coHosts
      {
        $addFields: {
          hosts: {
            $concatArrays: [
              ["$event.creator"],
              { $ifNull: ["$event.coHosts", []] },
            ],
          },
        },
      },
      { $unwind: "$hosts" },
      { $match: { hosts: { $in: hostObjectIds } } },
      // first grouping to collect events per host
      {
        $group: {
          _id: "$hosts",
          totalTicketsSold: { $sum: "$quantity" },
          eventsSet: { $addToSet: "$event" },
        },
      },
      // unwind events to extract coHosts across hosted events
      { $unwind: { path: "$eventsSet", preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: "$_id",
          totalTicketsSold: { $first: "$totalTicketsSold" },
          totalEventsHosted: { $addToSet: "$eventsSet._id" },
        },
      },
      // populate host user info
      {
        $lookup: {
          from: "users",
          localField: "_id",
          foreignField: "_id",
          as: "host",
        },
      },
      { $unwind: { path: "$host", preserveNullAndEmptyArrays: true } },
      // populate co-hosts details
      {
        $project: {
          hostId: "$_id",
          username: "$host.userName",
          photos: "$host.photos",
          fullName: "$host.fullName",
          totalTicketsSold: 1,
          totalEventsHosted: { $size: "$totalEventsHosted" },
        },
      },
    ]);

    const hostStats = hostStatsAgg.map((h: any) => ({
      hostId: h.hostId,
      username: h.username,
      photos: h.photos,
      fullName: h.fullName,
      totalTicketsSold: h.totalTicketsSold,
      totalEventsHosted: h.totalEventsHosted,
    }));

    /* ---------------- CO-HOST STATS ---------------- */
    const coHostIds = (event.coHosts || []).map((c: any) => c._id);
    const coHostObjectIds = coHostIds
      .filter(Boolean)
      .map((id: any) => new mongoose.Types.ObjectId(id));

    let coHostStats: any[] = [];
    if (coHostObjectIds.length > 0) {
      const coHostAgg = await purchaseModel.aggregate([
        {
          $match: {
            status: { $in: ["active", "used"] },
            purchaseType: "purchase",
          },
        },
        {
          $lookup: {
            from: "events",
            localField: "event",
            foreignField: "_id",
            as: "event",
          },
        },
        { $unwind: "$event" },
        {
          $unwind: { path: "$event.coHosts", preserveNullAndEmptyArrays: true },
        },
        { $match: { "event.coHosts": { $in: coHostObjectIds } } },
        {
          $group: {
            _id: "$event.coHosts",
            totalTicketsSold: { $sum: "$quantity" },
            eventsSet: { $addToSet: "$event._id" },
          },
        },
        {
          $lookup: {
            from: "users",
            localField: "_id",
            foreignField: "_id",
            as: "coHost",
          },
        },
        { $unwind: { path: "$coHost", preserveNullAndEmptyArrays: true } },
        {
          $project: {
            coHostId: "$_id",
            username: "$coHost.userName",
            photos: "$coHost.photos",
            fullName: "$coHost.fullName",
            totalTicketsSold: 1,
            totalEventsCoHosted: { $size: "$eventsSet" },
          },
        },
      ]);

      coHostStats = coHostAgg.map((c: any) => ({
        coHostId: c.coHostId,
        username: c.username,
        photos: c.photos,
        fullName: c.fullName,
        totalTicketsSold: c.totalTicketsSold,
        totalEventsCoHosted: c.totalEventsCoHosted,
      }));
    }
    /* ---------------- EVENT VIEWS ---------------- */
    const viewsAgg = await EventViewerModel.aggregate([
      { $match: { event: event._id } },
      {
        $lookup: {
          from: "users",
          localField: "user",
          foreignField: "_id",
          as: "user",
        },
      },
      { $unwind: "$user" },
      {
        $group: {
          _id: null,
          totalViews: { $sum: "$viewCount" },
          maleViews: {
            $sum: {
              $cond: [{ $eq: ["$user.gender", "male"] }, "$viewCount", 0],
            },
          },
          femaleViews: {
            $sum: {
              $cond: [{ $eq: ["$user.gender", "female"] }, "$viewCount", 0],
            },
          },
          otherViews: {
            $sum: {
              $cond: [{ $eq: ["$user.gender", "other"] }, "$viewCount", 0],
            },
          },
          ages: { $push: "$user.dob" },
        },
      },
    ]);

    let viewStats: any = {
      totalViews: 0,
      maleViews: 0,
      femaleViews: 0,
      otherViews: 0,
      malePercentage: 0,
      femalePercentage: 0,
      otherPercentage: 0,
      averageAge: null,
    };

    if (viewsAgg.length > 0) {
      const data = viewsAgg[0];
      const total = data.totalViews || 1;

      viewStats.totalViews = data.totalViews || 0;
      viewStats.maleViews = data.maleViews || 0;
      viewStats.femaleViews = data.femaleViews || 0;
      viewStats.otherViews = data.otherViews || 0;

      viewStats.malePercentage = Math.round(
        (viewStats.maleViews / total) * 100,
      );
      viewStats.femalePercentage = Math.round(
        (viewStats.femaleViews / total) * 100,
      );
      viewStats.otherPercentage = Math.round(
        (viewStats.otherViews / total) * 100,
      );

      // Calculate average age
      const today = new Date();
      const ages = data.ages.filter(Boolean).map((dob: Date) => {
        const birthDate = new Date(dob);
        let age = today.getFullYear() - birthDate.getFullYear();
        const m = today.getMonth() - birthDate.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) age--;
        return age;
      });

      if (ages.length > 0) {
        const sumAges = ages.reduce((sum, a) => sum + a, 0);
        viewStats.averageAge = Math.round(sumAges / ages.length);
      }
    }
    /* ---------------- EVENT LIKES ---------------- */
    const likesAgg = await LikeModel.aggregate([
      {
        $match: {
          targetType: "event",
          target: new mongoose.Types.ObjectId(event._id),
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "user",
          foreignField: "_id",
          as: "user",
        },
      },
      { $unwind: "$user" },
      {
        $group: {
          _id: null,
          totalLikes: { $sum: 1 },
          maleLikes: {
            $sum: { $cond: [{ $eq: ["$user.gender", "male"] }, 1, 0] },
          },
          femaleLikes: {
            $sum: { $cond: [{ $eq: ["$user.gender", "female"] }, 1, 0] },
          },
          otherLikes: {
            $sum: { $cond: [{ $eq: ["$user.gender", "other"] }, 1, 0] },
          },
        },
      },
    ]);

    let likeStats: any = {
      totalLikes: 0,
      maleLikes: 0,
      femaleLikes: 0,
      otherLikes: 0,
      malePercentage: 0,
      femalePercentage: 0,
      otherPercentage: 0,
    };

    if (likesAgg.length > 0) {
      const data = likesAgg[0];
      const total = data.totalLikes || 1;

      likeStats.totalLikes = data.totalLikes || 0;
      likeStats.maleLikes = data.maleLikes || 0;
      likeStats.femaleLikes = data.femaleLikes || 0;
      likeStats.otherLikes = data.otherLikes || 0;

      likeStats.malePercentage = Math.round(
        (likeStats.maleLikes / total) * 100,
      );
      likeStats.femalePercentage = Math.round(
        (likeStats.femaleLikes / total) * 100,
      );
      likeStats.otherPercentage = Math.round(
        (likeStats.otherLikes / total) * 100,
      );
    }

    /* ---------------- FINAL RESPONSE ---------------- */
    return {
      event,
      tickets, // include all tickets of this event
      ticketSalesSummary: {
        filter: revenueFilter,
        totalTicketsSold: salesAnalytics.totalTicketsSold,
        grossRevenueUSD: salesAnalytics.grossRevenueUSD,
        netRevenueUSD: salesAnalytics.netRevenueUSD,
      },
      ticketSalesGraph: salesAnalytics.graph,
      hostStats,
      coHostStats,
      viewStats,
      likeStats,
    };
  },
  async refundAllEventPurchases(payload: any) {
    const { adminId, eventId, reason } = payload;

    // const admin = await AdminModel.findOne({
    //   _id: adminId,
    //   isDeleted: false,
    //   isBlocked: false,
    //   role: { $in: ["SUPERADMIN", "ADMIN"] },
    // });
    // if (!admin) throw new Error("Not allowed to perform refunds");

    if (!eventId) throw new Error("eventId is required");

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const event = await eventModel.findById(eventId).session(session);
      if (!event) throw new Error("Event not found");

      const purchases = await purchaseModel
        .find({
          event: eventId,
          status: { $nin: ["refunded", "disabled", "pending"] },
          purchaseType: "purchase",
        })
        .session(session);

      if (!purchases || purchases.length === 0) {
        await session.commitTransaction();
        return { message: "No purchases to refund", refunded: 0 };
      }

      const results: any[] = [];

      for (const p of purchases) {
        try {
          const transaction = await Transaction.findOne({
            "reference.model": "purchase",
            "reference.id": p._id,
            status: TransactionStatus.SUCCESS,
          }).session(session);

          let refundId: string | null = null;

          if (transaction && transaction.stripePaymentIntentId) {
            // Determine refund amount in cents (USD) to request from Stripe
            let refundAmountCents: number | undefined;

            // If admin provided a refundAmount (in dollars), use that
            if (payload && typeof payload.refundAmount === "number") {
              refundAmountCents = Math.max(
                1,
                Math.round(payload.refundAmount * 100),
              );
            } else {
              // Try to compute from balanceTx if available
              const bt = (
                transaction.metadata ||
                (transaction as any).metaData ||
                {}
              ).balanceTx;
              if (bt && typeof bt.fee !== "undefined") {
                // bt.fee is in pence (GBP minor unit). Convert to GBP then to USD using exchange_rate
                const feeGBP = (Number(bt.fee) || 0) * 0.01; // e.g. 803 -> 8.03 GBP
                const exchangeRate = Number(bt.exchange_rate) || 1; // GBP -> USD factor: GBP / exchange_rate => USD
                const feeUSD =
                  exchangeRate !== 0 ? feeGBP / exchangeRate : feeGBP;

                // Default refund = purchase totalPrice (USD) minus feeUSD
                const defaultRefundUSD = (Number(p.totalPrice) || 0) - feeUSD;
                refundAmountCents = Math.max(
                  1,
                  Math.round(defaultRefundUSD * 100),
                );
              } else {
                // Fallback: refund full purchase amount
                refundAmountCents = Math.max(
                  1,
                  Math.round((Number(p.totalPrice) || 0) * 100),
                );
              }
            }

            // create refund via Stripe but DO NOT change domain state here — webhook will apply final status
            const refundPayload: any = {
              payment_intent: transaction.stripePaymentIntentId,
              reason: reason || "requested_by_customer",
            };
            if (typeof refundAmountCents === "number")
              refundPayload.amount = refundAmountCents;

            const refund = await stripe.refunds.create(refundPayload);
            refundId = refund.id;

            transaction.metadata = {
              ...transaction.metadata,
              refundRequestedAt: new Date(),
              refundId: refund.id,
              refundRequestedAmountCents: refundAmountCents,
            };
            await transaction.save({ session });
          } else if (transaction) {
            // annotate transaction as refund requested (no Stripe interaction possible)
            transaction.metadata = {
              ...transaction.metadata,
              refundRequestedAt: new Date(),
            };
            await transaction.save({ session });
          }

          // annotate purchase with refund request but do not change status/isActive yet
          if (!p.metaData) p.metaData = {} as any;
          (p.metaData as any).refundRequested = {
            refundId,
            requestedAt: new Date(),
            requestedBy: "Admin",
            // store amount in dollars for readability; if refund was computed store that, else full totalPrice
            amount:
              transaction &&
              transaction.metadata &&
              transaction.metadata.refundRequestedAmountCents
                ? Number(transaction.metadata.refundRequestedAmountCents) / 100
                : p.totalPrice,
          };
          await p.save({ session });

          results.push({ purchaseId: p._id, refundId });
        } catch (innerErr) {
          // continue with other refunds but record the error
          results.push({
            purchaseId: p._id,
            error: (innerErr as Error).message,
          });
        }
      }

      await session.commitTransaction();

      return {
        message: "Refund process completed",
        refunded: results.length,
        results,
      };
    } catch (err) {
      await session.abortTransaction();
      throw err;
    } finally {
      session.endSession();
    }
  },
  async deleteEventById(eventId: string) {
    const session = await mongoose.startSession();

    try {
      session.startTransaction();

      const eventObjectId = new mongoose.Types.ObjectId(eventId);

      /* ---------------- VALIDATE EVENT ---------------- */
      const event = await eventModel.findById(eventObjectId).session(session);
      if (!event) {
        throw new Error("Event not found");
      }

      /* ---------------- COMMENTS ---------------- */
      const comments = await Comment.find({ event: eventObjectId })
        .select("_id")
        .session(session);

      const commentIds = comments.map((c) => c._id);

      await Comment.deleteMany({ event: eventObjectId }).session(session);

      /* ---------------- LIKES ---------------- */
      await LikeModel.deleteMany({
        $or: [
          { targetType: "event", target: eventObjectId },
          { targetType: "comments", target: { $in: commentIds } },
        ],
      }).session(session);

      /* ---------------- EVENT VIEWERS ---------------- */
      await EventViewerModel.deleteMany({ event: eventObjectId }).session(
        session,
      );

      /* ---------------- NOTIFICATIONS ---------------- */
      await NotificationModel.deleteMany({
        "reference.model": "events",
        "reference.id": eventObjectId,
      }).session(session);

      /* ---------------- TICKETS ---------------- */
      const tickets = await ticketModel
        .find({ event: eventObjectId })
        .select("_id")
        .session(session);

      const ticketIds = tickets.map((t) => t._id);

      await ticketModel.deleteMany({ event: eventObjectId }).session(session);

      /* ---------------- PURCHASES ---------------- */
      const purchases = await purchaseModel
        .find({ event: eventObjectId })
        .select("_id")
        .session(session);

      const purchaseIds = purchases.map((p) => p._id);

      await purchaseModel.deleteMany({ event: eventObjectId }).session(session);

      /* ---------------- RESALES ---------------- */
      await resellModel
        .deleteMany({
          originalPurchase: { $in: purchaseIds },
        })
        .session(session);

      /* ---------------- TRANSFERS ---------------- */
      await transferModel
        .deleteMany({
          $or: [
            { event: eventObjectId },
            { originalPurchase: { $in: purchaseIds } },
            { ticket: { $in: ticketIds } },
          ],
        })
        .session(session);

      /* ---------------- DELETE EVENT ---------------- */
      await eventModel.deleteOne({ _id: eventObjectId }).session(session);

      await session.commitTransaction();
      session.endSession();

      return {
        success: true,
        message: "Event and all related data deleted successfully",
      };
    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      throw error;
    }
  },
};
export const adminRevenueAndFinancialServices = {
  async getFinancialOverview(payload: any) {
    const { adminId, startDate, endDate } = payload;
  },
};
export const adminReferalServices = {
  async getReferalStats(payload: any) {
    const { search = "", page = 1, limit = 10 } = payload;

    const skip = (page - 1) * limit;

    /* ---------------- SUMMARY COUNTS ---------------- */
    const [totalReferralCount, usedReferralCount, availableReferralCount] =
      await Promise.all([
        ReferralCodeModel.countDocuments(),
        ReferralCodeModel.countDocuments({ used: true }),
        ReferralCodeModel.countDocuments({ used: false }),
      ]);

    /* ---------------- NEW USERS ACQUIRED ---------------- */
    const newUsers = await usersModel
      .find({ referredBy: { $ne: null } })
      .populate({
        path: "referredBy",
        select: "code codeCreatedBy",
        populate: {
          path: "codeCreatedBy",
          select: "userName email",
        },
      })
      .select("userName email createdAt")
      .sort({ createdAt: -1 })
      .limit(10);

    /* ---------------- TOP PERFORMING USER ---------------- */
    const topPerformerAgg = await ReferralCodeModel.aggregate([
      { $match: { used: true } },
      {
        $group: {
          _id: "$codeCreatedBy",
          totalReferrals: { $sum: 1 },
        },
      },
      { $sort: { totalReferrals: -1 } },
      { $limit: 1 },
      {
        $lookup: {
          from: "users",
          localField: "_id",
          foreignField: "_id",
          as: "user",
        },
      },
      { $unwind: "$user" },
      {
        $project: {
          _id: 0,
          userId: "$user._id",
          userName: "$user.userName",
          email: "$user.email",
          totalReferrals: 1,
        },
      },
    ]);

    const topPerformingUser = topPerformerAgg[0] || null;

    /* ---------------- SEARCH FILTER ---------------- */
    const searchMatch: any = {};

    if (search) {
      searchMatch.$or = [
        { code: { $regex: search, $options: "i" } },
        { "creator.userName": { $regex: search, $options: "i" } },
        { "creator.email": { $regex: search, $options: "i" } },
        { "referred.userName": { $regex: search, $options: "i" } },
        { "referred.email": { $regex: search, $options: "i" } },
      ];
    }

    /* ---------------- ALL REFERRALS LIST ---------------- */
    const referralListAgg = await ReferralCodeModel.aggregate([
      {
        $lookup: {
          from: "users",
          localField: "codeCreatedBy",
          foreignField: "_id",
          as: "creator",
        },
      },
      { $unwind: "$creator" },
      {
        $lookup: {
          from: "users",
          localField: "referredUser",
          foreignField: "_id",
          as: "referred",
        },
      },
      {
        $unwind: {
          path: "$referred",
          preserveNullAndEmptyArrays: true,
        },
      },
      { $match: searchMatch },
      {
        $project: {
          code: 1,
          used: 1,
          createdAt: 1,
          creator: {
            _id: "$creator._id",
            userName: "$creator.userName",
            email: "$creator.email",
          },
          referredUser: {
            _id: "$referred._id",
            userName: "$referred.userName",
            email: "$referred.email",
          },
        },
      },
      { $sort: { createdAt: -1 } },
      { $skip: skip },
      { $limit: limit },
    ]);

    const totalFilteredCount = await ReferralCodeModel.aggregate([
      {
        $lookup: {
          from: "users",
          localField: "codeCreatedBy",
          foreignField: "_id",
          as: "creator",
        },
      },
      { $unwind: "$creator" },
      {
        $lookup: {
          from: "users",
          localField: "referredUser",
          foreignField: "_id",
          as: "referred",
        },
      },
      {
        $unwind: {
          path: "$referred",
          preserveNullAndEmptyArrays: true,
        },
      },
      { $match: searchMatch },
      { $count: "count" },
    ]);

    /* ---------------- FINAL RESPONSE ---------------- */
    // ---------------- CLICK & CONVERSION STATS ----------------
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - 6);
    weekStart.setHours(0, 0, 0, 0);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const yearStart = new Date(now.getFullYear(), 0, 1);

    const [
      clicksToday,
      clicksWeek,
      clicksMonth,
      clicksYear,
      signupsToday,
      signupsWeek,
      signupsMonth,
      signupsYear,
    ] = await Promise.all([
      ReferralClickModel.countDocuments({ createdAt: { $gte: todayStart } }),
      ReferralClickModel.countDocuments({ createdAt: { $gte: weekStart } }),
      ReferralClickModel.countDocuments({ createdAt: { $gte: monthStart } }),
      ReferralClickModel.countDocuments({ createdAt: { $gte: yearStart } }),
      usersModel.countDocuments({
        referredBy: { $ne: null },
        createdAt: { $gte: todayStart },
      }),
      usersModel.countDocuments({
        referredBy: { $ne: null },
        createdAt: { $gte: weekStart },
      }),
      usersModel.countDocuments({
        referredBy: { $ne: null },
        createdAt: { $gte: monthStart },
      }),
      usersModel.countDocuments({
        referredBy: { $ne: null },
        createdAt: { $gte: yearStart },
      }),
    ]);

    const calcConversion = (signups: number, clicks: number) =>
      clicks === 0 ? 0 : Number(((signups / clicks) * 100).toFixed(2));

    const conversionStats = {
      today: {
        clicks: clicksToday,
        signups: signupsToday,
        conversionRate: calcConversion(signupsToday, clicksToday),
      },
      week: {
        clicks: clicksWeek,
        signups: signupsWeek,
        conversionRate: calcConversion(signupsWeek, clicksWeek),
      },
      month: {
        clicks: clicksMonth,
        signups: signupsMonth,
        conversionRate: calcConversion(signupsMonth, clicksMonth),
      },
      year: {
        clicks: clicksYear,
        signups: signupsYear,
        conversionRate: calcConversion(signupsYear, clicksYear),
      },
    };

    return {
      summary: {
        totalReferralCount,
        usedReferralCount,
        availableReferralCount,
      },
      conversionStats,
      newUsersAcquired: newUsers,
      topPerformingUser,
      referrals: {
        data: referralListAgg,
        pagination: {
          page,
          limit,
          total: totalFilteredCount[0]?.count || 0,
        },
      },
    };
  },
};
