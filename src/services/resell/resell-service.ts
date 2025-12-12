import { Request, Response } from "express";
import { JwtPayload } from "jsonwebtoken";
import { httpStatusCode } from "src/lib/constant";
import { errorResponseHandler } from "src/lib/errors/error-response-handler";
import { resellModel } from "src/models/resell/resell-schema";
import mongoose from "mongoose";
import { purchaseModel } from "src/models/purchase/purchase-schema";
import { Message } from "src/models/chat/message-schema";

/**
 * Create a new resell listing
 */
export const createResellListingService = async (
  req: Request,
  res: Response
) => {
  const { id: userId } = req.user as JwtPayload;
  const { originalPurchaseId, quantity, price } = req.body;

  if (!originalPurchaseId || !quantity || !price) {
    return errorResponseHandler(
      "Missing required fields: originalPurchaseId, quantity, and price are required",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

  if (quantity < 1) {
    return errorResponseHandler(
      "Quantity must be at least 1",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

  if (price <= 0) {
    return errorResponseHandler(
      "Price must be greater than 0",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

  // Verify the original purchase exists and belongs to the user
  const purchase = await purchaseModel.findById(originalPurchaseId);

  if (!purchase) {
    return errorResponseHandler(
      "Original purchase not found",
      httpStatusCode.NOT_FOUND,
      res
    );
  }

  if (!purchase.isResale) {
    return errorResponseHandler(
      "Original purchase is not eligible for resale",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

  if (purchase.buyer.toString() !== userId) {
    return errorResponseHandler(
      "You can only resell tickets that you own",
      httpStatusCode.FORBIDDEN,
      res
    );
  }

  // Check if the user has enough tickets to resell
  if (purchase.quantity < quantity) {
    return errorResponseHandler(
      `You only have ${purchase.quantity} tickets available to resell`,
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

  // Create the resell listing
  const resellListing = new resellModel({
    originalPurchase: originalPurchaseId,
    quantity,
    availableQuantity: quantity,
    price,
    status: "available",
    buyers: [],
  });

  await resellListing.save();

  return {
    success: true,
    message: "Resell listing created successfully",
    data: resellListing,
  };
};

/**
 * Get a resell listing by ID
 */
export const getResellListingByIdService = async (
  req: Request,
  res: Response
) => {
  const { id } = req.params;

  const resellListing = await resellModel.findById(id).populate({
    path: "originalPurchase",
    populate: {
      path: "event",
      select:
        "title aboutEvent date startTime media utcDateTime endTime location",
    },
  });

  if (!resellListing) {
    return errorResponseHandler(
      "Resell listing not found",
      httpStatusCode.NOT_FOUND,
      res
    );
  }

  return {
    success: true,
    Message: "Resell listing retrieved successfully",
    data: resellListing,
  };
};

/**
 * Get all resell listings for the current user
 */
export const getUserResellListingsService = async (
  req: Request,
  res: Response
) => {
  const { id: userId } = req.user as JwtPayload;
  const { status } = req.query;

  // Find all purchases by the user
  const userPurchases = await purchaseModel.find({ buyer: userId });
  const purchaseIds = userPurchases.map((purchase) => purchase._id);

  // Build query for resell listings
  const query: any = { originalPurchase: { $in: purchaseIds } };

  // Add status filter if provided
  if (status && ["available", "sold", "canceled"].includes(status as string)) {
    query.status = status;
  }

  const resellListings = await resellModel
    .find(query)
    .populate({
      path: "originalPurchase",
      populate: {
        path: "event",
      },
    })
    .sort({ createdAt: -1 });

  return {
    success: true,
    data: resellListings,
  };
};

/**
 * Get all available resell listings (excluding current user's listings)
 */
export const getAllResellListingsService = async (
  req: Request,
  res: Response
) => {
  const { id: userId } = req.user as JwtPayload;
  const { eventId, minPrice, maxPrice, sort = "price_asc" } = req.query;

  // Build query
  const query: any = { status: "available", availableQuantity: { $gt: 0 } };

  // Add event filter if provided
  if (eventId) {
    // First find all purchases for this event
    const eventPurchases = await mongoose
      .model("purchase")
      .find({ event: eventId });
    const purchaseIds = eventPurchases.map((purchase) => purchase._id);

    query.originalPurchase = { $in: purchaseIds };
  }

  // Add price range filters if provided
  if (minPrice) {
    query.price = { ...query.price, $gte: Number(minPrice) };
  }

  if (maxPrice) {
    query.price = { ...query.price, $lte: Number(maxPrice) };
  }

  // Determine sort order
  let sortOptions = {};
  switch (sort) {
    case "price_asc":
      sortOptions = { price: 1 };
      break;
    case "price_desc":
      sortOptions = { price: -1 };
      break;
    case "date_asc":
      sortOptions = { listedDate: 1 };
      break;
    case "date_desc":
      sortOptions = { listedDate: -1 };
      break;
    default:
      sortOptions = { price: 1 };
  }

  // Get current user's purchases to exclude their resell listings
  const userPurchases = await purchaseModel.find({ buyer: userId });
  const userPurchaseIds = userPurchases.map((purchase) => purchase._id);

  // Exclude current user's resell listings
  query.originalPurchase = { $nin: userPurchaseIds };

  const resellListings = await resellModel
    .find(query)
    .populate({
      path: "originalPurchase",
      populate: [
        {
          path: "event",
          select:
            "title aboutEvent date timezone venue startTime media utcDateTime endTime location",
        },
        {
          path: "buyer",
          select: "userName email photos",
        },
        {
          path: "ticket",
          select:"-benefits"
        },
      ],
    })
    .sort(sortOptions);

  return {
    success: true,
    message: "Resell listings fetched successfully",
    data: resellListings,
  };
};

/**
 * Update a resell listing (price only)
 */
export const updateResellListingService = async (
  req: Request,
  res: Response
) => {
  const { id: userId } = req.user as JwtPayload;
  const { id } = req.params;
  const { price, quantity } = req.body;

  if (!price || price <= 0) {
    return errorResponseHandler(
      "Price must be greater than 0",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

  const resellListing = await resellModel.findById(id);

  if (!resellListing) {
    return errorResponseHandler(
      "Resell listing not found",
      httpStatusCode.NOT_FOUND,
      res
    );
  }
  const alreadySold = await purchaseModel.findOne({
    status: { $or: ["active", "used"] },
    metaData: { resaleListingId: resellListing._id },
  });
  if (alreadySold) {
    return errorResponseHandler(
      "Cannot update listing after tickets have been sold",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

  // Verify ownership by checking if the original purchase belongs to the user
  const purchase = await purchaseModel.findById(resellListing.originalPurchase);

  if (!purchase || purchase.buyer.toString() !== userId) {
    return errorResponseHandler(
      "You can only update your own resell listings",
      httpStatusCode.FORBIDDEN,
      res
    );
  }

  if (resellListing.status !== "available") {
    return errorResponseHandler(
      "Only available listings can be updated",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

  // Update the price
  resellListing.price = price;
  if (quantity) {
    resellListing.quantity = quantity;
    resellListing.availableQuantity = quantity;
  }
  await resellListing.save();

  return {
    success: true,
    message: "Resell listing updated successfully",
    data: resellListing,
  };
};

/**
 * Cancel a resell listing
 */
export const cancelResellListingService = async (
  req: Request,
  res: Response
) => {
  const { id: userId } = req.user as JwtPayload;
  const { id } = req.params;

  const resellListing = await resellModel.findById(id);

  if (!resellListing) {
    return errorResponseHandler(
      "Resell listing not found",
      httpStatusCode.NOT_FOUND,
      res
    );
  }

  // Verify ownership by checking if the original purchase belongs to the user
  const purchase = await mongoose
    .model("purchase")
    .findById(resellListing.originalPurchase);

  if (!purchase || purchase.buyer.toString() !== userId) {
    return errorResponseHandler(
      "You can only cancel your own resell listings",
      httpStatusCode.FORBIDDEN,
      res
    );
  }

  if (resellListing.status !== "available") {
    return errorResponseHandler(
      "Only available listings can be canceled",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

  // Update the listing status
  resellListing.status = "cancelled";
  resellListing.canceledDate = new Date();
  await resellListing.save();

  // Return the tickets to the original purchase
  // await mongoose.model('purchase').findByIdAndUpdate(
  //   resellListing.originalPurchase,
  //   { $inc: { remainingQuantity: resellListing.availableQuantity } }
  // );

  return {
    success: true,
    message: "Resell listing canceled successfully",
    data: resellListing,
  };
};
