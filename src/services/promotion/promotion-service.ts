import { Request, Response } from "express";
import mongoose from "mongoose";
import { httpStatusCode } from "src/lib/constant";
import { errorResponseHandler } from "src/lib/errors/error-response-handler";
import { ProfessionalProfileModel } from "src/models/professional/professional-schema";
import { promotionModel } from "src/models/promotion/promotion-schema";
import { PromotionPlanModel } from "src/models/promotion/promotionPlan-schema";
import { usersModel } from "src/models/user/user-schema";
import { stripe } from "../subscription/subscription-service";
import {
  Transaction,
  TransactionType,
  TransactionStatus,
} from "src/models/transaction/transaction-schema";
import { convertToUTCAndLocal } from "src/utils/date";

export const createPromotionService = async (req: any, res: Response) => {
  const { id: userId } = req.user;

  const {
    ProfessionalId,
    customNotification,
    date,
    time,
    priorityPlacement,
    priceId,
    genderToReach,
    ageRange,
    preferences,
    preferredEventTime,
    Subscription,
    customTags,
    timeZone
  } = req.body;

  const user = await ProfessionalProfileModel.findById(ProfessionalId).lean();
  if (!user) {
    return errorResponseHandler(
      "Professional Account not found",
      httpStatusCode.NOT_FOUND,
      res
    );
  }

  const plan = await PromotionPlanModel.findById(priceId).lean();
  if (!plan) {
    return errorResponseHandler(
      "Promotion plan not found",
      httpStatusCode.NOT_FOUND,
      res
    );
  }

  if (userId.toString() !== user.user.toString()) {
    return errorResponseHandler(
      "You do not have permission to create a promotion for this user",
      httpStatusCode.FORBIDDEN,
      res
    );
  }

  const userInfo = await usersModel.findById(userId);
  if (!userInfo) {
    return errorResponseHandler(
      "User not found",
      httpStatusCode.NOT_FOUND,
      res
    );
  }

  // Validate required fields
  if (!customNotification) {
    return errorResponseHandler(
      "Custom notification is required",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }
  if (!mongoose.Types.ObjectId.isValid(ProfessionalId)) {
    return errorResponseHandler(
      "Invalid user ID",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

  if (!date) {
    return errorResponseHandler(
      "Date is required",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

  if (!time) {
    return errorResponseHandler(
      "Time is required",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

  if (!priorityPlacement) {
    return errorResponseHandler(
      "Priority placement is required",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

  if (!priceId) {
    return errorResponseHandler(
      "priceId is required",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

  if (!genderToReach) {
    return errorResponseHandler(
      "Gender to reach is required",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

  if (!preferredEventTime || preferredEventTime.length === 0) {
    return errorResponseHandler(
      "Preferred event time is required",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

  if (!Subscription) {
    return errorResponseHandler(
      "Subscription type is required",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }
  if (!customTags || customTags.length === 0) {
    return errorResponseHandler(
      "Custom tags are required",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }
  if (!ageRange) {
    return errorResponseHandler(
      "Age range is required",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

  let customerstripeId = "";

  if (userInfo && userInfo.stripeCustomerId) {
    customerstripeId = userInfo.stripeCustomerId;
  } else {
    // Create Stripe customer
    const customer = await stripe.customers.create({
      email: userInfo?.email,
    });
    customerstripeId = customer.id;
  }

  // convert date and time to UTC based on provided timeZone
  const { utcDateTime,localDateTime } = convertToUTCAndLocal(date, time, timeZone || "UTC");

  // count expiry date from date + durationDays
  const expiryDate = new Date(utcDateTime);
  expiryDate.setDate(
    expiryDate.getDate() + (plan.durationDays ? plan.durationDays : 0)
  );


  // Create new promotion with pending status until payment succeeds
  const newPromotion = new promotionModel({
    user: ProfessionalId,
    customNotification,
    date,
    time,
    utcDateTime,
    localDateTime,
    durationDays: plan.durationDays,
    expiryDate,
    priorityPlacement,
    priceId,
    genderToReach,
    ageRange,
    preferences,
    preferredEventTime,
    timeZone,
    Subscription,
    customTags,
    status: "pending",
  });

  const savedPromotion = await newPromotion.save();

  // Create Stripe PaymentIntent for promotion payment
  const amount = Math.round(Number(plan.price) * 100);
  const paymentIntent = await stripe.paymentIntents.create({
    amount,
    currency: "usd",
    customer: customerstripeId,
    metadata: {
      userId: userId?.toString(),
      promotionId: savedPromotion._id.toString(),
      type: "EVENT_PROMOTION",
    },
    automatic_payment_methods: { enabled: true },
  });

  // Save a Transaction record so webhook can resolve this payment intent
  const transaction = await Transaction.create({
    user: userId,
    type: TransactionType.EVENT_PROMOTION,
    amount: plan.price,
    currency: "USD",
    status: TransactionStatus.PENDING,
    reference: {
      model: "promotion",
      id: savedPromotion._id,
    },
    stripePaymentIntentId: paymentIntent.id,
    metadata: {
      promotionTitle: customNotification,
      planId: priceId,
    },
  });

  return {
    success: true,
    message: "Promotion created and payment initiated",
    data: {
      clientSecret: paymentIntent.client_secret,
      stripePaymentIntentId: paymentIntent.id,
      transactionId: transaction._id,
      promotion: savedPromotion,
    },
  };
};

export const getAllPromotionsService = async (req: any, res: Response) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 10;
  const skip = (page - 1) * limit;

  const promotions = await promotionModel
    .find()
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .populate({
      path: "user",
      populate: {
        path: "user",
      },
    });

  const total = await promotionModel.countDocuments();

  return {
    success: true,
    message: "Promotions retrieved successfully",
    data: {
      promotions,
      pagination: {
        total,
        page,
        pages: Math.ceil(total / limit),
      },
    },
  };
};

export const getPromotionByIdService = async (req: any, res: Response) => {
  const { id: userId } = req.user;
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return errorResponseHandler(
      "Invalid promotion ID",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

  const promotion = await promotionModel.findById(id).populate({
    path: "user",
    populate: {
      path: "user",
    },
  });

  if (!promotion) {
    return errorResponseHandler(
      "Promotion not found",
      httpStatusCode.NOT_FOUND,
      res
    );
  }

  return {
    success: true,
    message: "Promotion retrieved successfully",
    data: promotion,
  };
};

export const getUserPromotionsService = async (req: any, res: Response) => {
  // const { id: userId } = req.user;
  const { id: userId } = req.params;
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 10;
  const skip = (page - 1) * limit;

  const promotions = await promotionModel
    .find({ user: userId })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .populate({
      path: "user",
      populate: {
        path: "user",
      },
    });

  const total = await promotionModel.countDocuments({ user: userId });

  return {
    success: true,
    message: "User promotions retrieved successfully",
    data: {
      promotions,
      pagination: {
        total,
        page,
        pages: Math.ceil(total / limit),
      },
    },
  };
};

export const updatePromotionService = async (req: any, res: Response) => {
  const { id } = req.params;
  const { id: userId } = req.user;
  const updateData = req.body;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return errorResponseHandler(
      "Invalid promotion ID",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

  // Check if promotion exists and belongs to user
  const existingPromotion = await promotionModel.findOne({
    _id: id,
    user: userId,
  });

  if (!existingPromotion) {
    return errorResponseHandler(
      "Promotion not found or you don't have permission to update it",
      httpStatusCode.NOT_FOUND,
      res
    );
  }

  // Update promotion
  const updatedPromotion = await promotionModel.findByIdAndUpdate(
    id,
    { $set: updateData },
    { new: true }
  );

  return {
    success: true,
    message: "Promotion updated successfully",
    data: updatedPromotion,
  };
};

export const deletePromotionService = async (req: any, res: Response) => {
  const { id } = req.params;
  const { id: userId } = req.user;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return errorResponseHandler(
      "Invalid promotion ID",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

  // Check if promotion exists and belongs to user
  const existingPromotion = await promotionModel.findOne({
    _id: id,
    user: userId,
  });

  if (!existingPromotion) {
    return errorResponseHandler(
      "Promotion not found or you don't have permission to delete it",
      httpStatusCode.NOT_FOUND,
      res
    );
  }

  // Delete promotion
  await promotionModel.findByIdAndDelete(id);

  return {
    success: true,
    message: "Promotion deleted successfully",
  };
};

export const togglePromotionStatusService = async (req: any, res: Response) => {
  const id = req.params;
  const userId = req.user.id; // Get logged-in user ID from auth token

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return errorResponseHandler(
      "Invalid promotion ID",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

  // First find the professional profiles owned by this user
  const professionalProfiles = await ProfessionalProfileModel.find({
    user: userId,
  });

  if (!professionalProfiles || professionalProfiles.length === 0) {
    return errorResponseHandler(
      "No professional profiles found for this user",
      httpStatusCode.NOT_FOUND,
      res
    );
  }

  // Get all profile IDs
  const profileIds = professionalProfiles.map((profile) => profile._id);

  // Check if promotion exists and belongs to one of user's profiles
  const existingPromotion = await promotionModel.findOne({
    _id: id,
    user: { $in: profileIds },
  });

  if (!existingPromotion) {
    return errorResponseHandler(
      "Promotion not found or you don't have permission to update it",
      httpStatusCode.NOT_FOUND,
      res
    );
  }

  // Toggle status
  const newStatus =
    existingPromotion.status === "active" ? "inactive" : "active";

  const updatedPromotion = await promotionModel.findByIdAndUpdate(
    id,
    { $set: { status: newStatus } },
    { new: true }
  );

  return {
    success: true,
    message: `Promotion ${
      newStatus === "active" ? "activated" : "deactivated"
    } successfully`,
    data: updatedPromotion,
  };
};
