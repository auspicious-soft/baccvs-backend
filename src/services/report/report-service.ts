import { Request, Response } from "express";
import mongoose from "mongoose";
import { reportModel, ReportStatus } from "src/models/report/report-schema";
import { errorResponseHandler } from "src/lib/errors/error-response-handler";
import { httpStatusCode } from "src/lib/constant";
import { JwtPayload } from "jsonwebtoken";
import { postModels } from "src/models/post/post-schema";
import { Comment } from "src/models/comment/comment-schema";
import { usersModel } from "src/models/user/user-schema";
import { Squad } from "src/models/squad/squad-schema"; // Assuming you have a Squad model

export const createReportService = async (req: Request, res: Response) => {
  const { id: reporterId } = req.user as JwtPayload;
  const { targetType, targetId, reason, details } = req.body;

  if (!targetType || !targetId || !reason) {
    return errorResponseHandler(
      "Missing required fields",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

  if (!["posts", "comments", "users", "Squad"].includes(targetType)) {
    return errorResponseHandler(
      "Invalid target type",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

  // Validate targetId format
  if (!mongoose.Types.ObjectId.isValid(targetId)) {
    return errorResponseHandler(
      "Invalid target ID format",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

  // Validate that target exists and matches the specified type
  let targetExists = false;
  if (targetType === "posts") {
    const post = await postModels.findById(targetId).exec();
    targetExists = !!post;
  } else if (targetType === "comments") {
    const comment = await Comment.findById(targetId).exec();
    targetExists = !!comment;
  } else if (targetType === "users") {
    const user = await usersModel.findById(targetId).exec();
    targetExists = !!user;
  } else if (targetType === "Squad") {
    const squad = await Squad.findById(targetId).exec();
    targetExists = !!squad;
  }

  if (!targetExists) {
    return errorResponseHandler(
      `${targetType} with ID ${targetId} does not exist`,
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

  // Check if report already exists
  const existingReport = await reportModel.findOne({
    reporter: reporterId,
    targetType,
    target: targetId,
    status: { $ne: ReportStatus.DISMISSED }
  });

  if (existingReport) {
    return errorResponseHandler(
      `You have already reported this ${targetType}`,
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

  const report = new reportModel({
    reporter: reporterId,
    targetType,
    target: targetId,
    reason,
    details,
    status: ReportStatus.PENDING
  });

  await report.save();

  return {
    success: true,
    message: "Report created successfully",
    data: report
  };
};

export const getReportByIdService = async (req: Request, res: Response) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return errorResponseHandler(
      "Invalid report ID",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

  const report = await reportModel
    .findById(id)
    .populate('reporter', 'userName email')
    .populate({
      path: 'target',
    })
    .exec();

  if (!report) {
    return errorResponseHandler(
      "Report not found",
      httpStatusCode.NOT_FOUND,
      res
    );
  }

  return {
    success: true,
    message: "Report retrieved successfully",
    data: report
  };
};

export const getAllReportsService = async (req: Request, res: Response) => {
  const { status, targetType, page = 1, limit = 10 } = req.query;
  const query: any = {};

  if (status) {
    query.status = status;
  }
  if (targetType) {
    query.targetType = targetType;
  }

  const skip = (Number(page) - 1) * Number(limit);

  const reports = await reportModel
    .find(query)
    .populate('reporter', 'userName email')
    .populate({
      path: 'target',
      populate: {
        path: targetType === 'Squad' ? 'squadName description' : '', // Adjust fields based on your Squad model
      }
    })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(Number(limit))
    .exec();

  const total = await reportModel.countDocuments(query);

  return {
    success: true,
    message: "Reports retrieved successfully",
    data: reports,
    pagination: {
      total,
      page: Number(page),
      pages: Math.ceil(total / Number(limit))
    }
  };
};

// The updateReportStatusService and deleteReportService remain unchanged
export const updateReportStatusService = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { status, adminNotes } = req.body;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return errorResponseHandler(
      "Invalid report ID",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

  if (!Object.values(ReportStatus).includes(status)) {
    return errorResponseHandler(
      "Invalid status",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

  const report = await reportModel.findById(id).exec();

  if (!report) {
    return errorResponseHandler(
      "Report not found",
      httpStatusCode.NOT_FOUND,
      res
    );
  }

  const updates: any = {
    status,
    adminNotes: adminNotes || report.adminNotes
  };

  if (status === ReportStatus.RESOLVED || status === ReportStatus.DISMISSED) {
    updates.resolvedAt = new Date();
  }

  const updatedReport = await reportModel.findByIdAndUpdate(
    id,
    updates,
    { new: true }
  ).exec();

  return {
    success: true,
    message: "Report status updated successfully",
    data: updatedReport
  };
};

export const deleteReportService = async (req: Request, res: Response) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return errorResponseHandler(
      "Invalid report ID",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

  const report = await reportModel.findByIdAndDelete(id).exec();

  if (!report) {
    return errorResponseHandler(
      "Report not found",
      httpStatusCode.NOT_FOUND,
      res
    );
  }

  return {
    success: true,
    message: "Report deleted successfully"
  };
};