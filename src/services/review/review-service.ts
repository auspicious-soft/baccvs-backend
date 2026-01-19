import { Response } from "express";
import mongoose from "mongoose";
import { httpStatusCode } from "src/lib/constant";
import { errorResponseHandler } from "src/lib/errors/error-response-handler";
import { reviewModel } from "src/models/review/review-schema";
import { ProfessionalProfileModel } from "src/models/professional/professional-schema";

export const createReviewService = async (req: any, res: Response) => {
  if (!req.user)
    return errorResponseHandler(
      "Unauthorized",
      httpStatusCode.UNAUTHORIZED,
      res
    );
  const { id: userId } = req.user as any;
  const { professionalProfileId, rating, comment } = req.body;

  if (!professionalProfileId || !mongoose.isValidObjectId(professionalProfileId)) {
  return errorResponseHandler(
    "Invalid or missing professionalProfileId",
    httpStatusCode.BAD_REQUEST,
    res
  );
}

if (rating === undefined || typeof rating !== "number" || Number.isNaN(rating)) {
  return errorResponseHandler(
    "Rating is required and must be a valid number",
    httpStatusCode.BAD_REQUEST,
    res
  );
}


  const professional = await ProfessionalProfileModel.findById(
    professionalProfileId
  );
  if (!professional)
    return errorResponseHandler(
      "Professional not found",
      httpStatusCode.NOT_FOUND,
      res
    );

  const existing = await reviewModel.findOne({ professionalProfileId, userId });
  if (existing)
    return errorResponseHandler(
      "You have already reviewed this professional",
      httpStatusCode.BAD_REQUEST,
      res
    );

  const review = new reviewModel({
    professionalProfileId,
    userId,
    rating,
    comment,
  });
  const saved = await review.save();

  const agg = await reviewModel.aggregate([
    {
      $match: {
        professionalProfileId: new mongoose.Types.ObjectId(
          professionalProfileId
        ),
      },
    },
    {
      $group: {
        _id: "$professionalProfileId",
        avgRating: { $avg: "$rating" },
        count: { $sum: 1 },
      },
    },
  ]);

  const stats = agg[0] || { avgRating: 0, count: 0 };
  professional.rating = {
    average: stats.avgRating || 0,
    count: stats.count || 0,
  } as any;
  await professional.save();

  await saved.populate({ path: "userId", select: "userName photos" });

  return {
    success: true,
    message: "Review submitted successfully",
    data: saved,
  };
};
