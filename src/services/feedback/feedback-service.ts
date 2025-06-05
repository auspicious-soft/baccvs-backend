import { Request, Response } from "express";
import { FeedbackModel } from "../../models/feedback/feedback-schema";
import { httpStatusCode } from "../../lib/constant";
import { errorResponseHandler } from "../../lib/errors/error-response-handler";

// Create new feedback
export const createFeedbackService = async (req: any, res: Response) => {
    const { userId } = req.user;
    const { subject, description } = req.body;

    if (!subject || !description) {
      return errorResponseHandler("Subject and description are required", httpStatusCode.BAD_REQUEST, res);
    }
    if (!["issue","suggestion","experience","other"].includes(subject)) {
      return errorResponseHandler(`Invalid subject. Must be one of: ${["issue","suggestion","experience","other"].join(", ")}`, httpStatusCode.BAD_REQUEST, res);
    }

    const feedback = new FeedbackModel({
      userId,
      subject,
      description
    });

    await feedback.save();
    
    return {
      success: true,
      message: "Feedback submitted successfully",
      data: feedback
    };
};

// Get all feedback (with optional filters)
export const getAllFeedbackService = async (req: any, res: Response) => {
    const { status, subject } = req.query;
    const query: any = {};
    
    // Add filters if provided
    if (status) query.status = status;
    if (subject) query.subject = subject;
    
    // For regular users, only show their own feedback
    if (!req.user.isAdmin) {
      query.userId = req.user.userId;
    }
    
    const feedback = await FeedbackModel.find(query)
      .populate('userId', 'userName email')
      .sort({ createdAt: -1 });
    
    return {
      success: true,
      message: "Feedback retrieved successfully",
      data: feedback
    };
};

// Get feedback by ID
export const getFeedbackByIdService = async (req: any, res: Response) => {
    const { id } = req.params;
    const feedback = await FeedbackModel.findById(id)
      .populate('userId', 'userName email');
    
    if (!feedback) {
      return errorResponseHandler("Feedback not found", httpStatusCode.NOT_FOUND, res);
    }
    
    // Check if user is authorized to view this feedback
    if (!req.user.isAdmin && feedback?.userId?.toString() !== req.user.userId) {
      return errorResponseHandler("Unauthorized to view this feedback", httpStatusCode.UNAUTHORIZED, res);
    }
    
    return {
      success: true,
      message: "Feedback retrieved successfully",
      data: feedback
    };
};

// Update feedback status (admin only)
export const updateFeedbackStatusService = async (req: any, res: Response) => {
    const { id } = req.params;
    const { status } = req.body;
    
    if (!status || !["pending", "in progress", "resolved"].includes(status)) {
      return errorResponseHandler("Invalid status. Must be: pending, in progress, or resolved", httpStatusCode.BAD_REQUEST, res);
    }
    
    const feedback = await FeedbackModel.findByIdAndUpdate(
      id,
      { status },
      { new: true }
    );
    
    if (!feedback) {
      return errorResponseHandler("Feedback not found", httpStatusCode.NOT_FOUND, res);
    }
    
    return {
      success: true,
      message: "Feedback status updated successfully",
      data: feedback
    };
};

// Delete feedback
export const deleteFeedbackService = async (req: any, res: Response) => {
  const { id } = req.params;
  const feedback = await FeedbackModel.findById(id);

  if (!feedback) {
    return errorResponseHandler("Feedback not found", httpStatusCode.NOT_FOUND, res);
    }
    
    // Check if user is authorized to delete this feedback
    if (!req.user.isAdmin && feedback?.userId?.toString() !== req.user.userId) {
      return errorResponseHandler("Unauthorized to delete this feedback", httpStatusCode.UNAUTHORIZED, res);
    }
    
    await FeedbackModel.findByIdAndDelete(id);
    
    return {
      success: true,
      message: "Feedback deleted successfully"
    };
};