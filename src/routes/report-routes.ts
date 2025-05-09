import { Router } from "express";
import { 
  createReport,
  getReportById,
  getAllReports,
  updateReportStatus,
  deleteReport
} from "src/controllers/report/report-controller";

const router = Router();

// Create a new report
router.post("/", createReport);

// Get a specific report by ID
router.get("/:id", getReportById);

// Get all reports (with optional filters)
router.get("/", getAllReports);

// Update report status
router.patch("/:id/status", updateReportStatus);

// Delete a report
router.delete("/:id", deleteReport);

export { router };