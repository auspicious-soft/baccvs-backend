import { Router } from "express";
import { 
  createFeedback,
  getAllFeedback,
  getFeedbackById,
  updateFeedbackStatus,
  deleteFeedback
} from "src/controllers/feedback/feedback-controller";
import { checkAuth } from "src/middleware/check-auth";
import { checkValidAdminRole } from "src/utils";

const router = Router();

// Create a new feedback (requires authentication)
router.post("/",createFeedback);

// Get all feedback (users get their own, admins get all)
router.get("/", getAllFeedback);

// Get a specific feedback by ID
router.get("/:id", getFeedbackById);

// Update feedback status (admin only)
router.patch("/:id/status",  checkValidAdminRole, updateFeedbackStatus);

// Delete feedback (users can delete their own, admins can delete any)
router.delete("/:id", deleteFeedback);

export { router };