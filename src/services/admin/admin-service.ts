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

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-02-24.acacia",
});

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
      res
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
      res
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
    { new: true }
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
      res
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
      res
    );
  }

  const existing = await PromotionPlanModel.findById(planId);
  if (!existing) {
    return errorResponseHandler(
      "Promotion plan not found",
      httpStatusCode.NOT_FOUND,
      res
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
    { new: true }
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
      }
    );

    return { settingsToken, phoneNummber:admin.phoneNumber, email:admin.email };
  },
  async submitChangeRequest(payload: any) {
    const { adminId, oldValue, newValue, type } = payload;
    const allowedTypes = ["EMAIL", "PHONE"];

    if (!oldValue || !newValue) {
      throw new Error(
        `Old ${type.toLowerCase()} and new ${type.toLowerCase()} are required`
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
      "ADMIN"
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
      "ADMIN"
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
      { used: true }
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
      { password: await hashPassword(password) }
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
      { new: true }
    ).select("-password");

    if (!updatedAdmin) {
      throw new Error("Admin not found");
    }

    return {
      message: "Profile updated successfully",
      admin: updatedAdmin,
    };
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
      { used: true }
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
      new Set(roleAccess.map((r: string) => r.trim()))
    );

    const invalidRoles = uniqueRoleAccess.filter(
      (r: string) => !ALLOWED_ROLE_ACCESS.includes(r)
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
      { new: true }
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
  };
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
