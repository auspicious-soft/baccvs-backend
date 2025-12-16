import express, { Router } from "express";
import { checkAuth } from "src/middleware/check-auth";
import {
  getUserNotifications,
  getUnreadNotificationsCount,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  deleteNotification,
  getNotificationsByType,
  clearAllNotifications,
} from "src/controllers/notification/notification-controller";

const router: Router = express.Router();

// Specific routes FIRST (before parameterized routes)

// Get unread notifications count
// GET /api/notification/unread-count
router.get("/unread-count", checkAuth, getUnreadNotificationsCount);

// Mark all notifications as read
// PUT /api/notification/mark-all/read
router.put("/mark-all/read", checkAuth, markAllNotificationsAsRead);

// Clear all notifications for the user
// DELETE /api/notification/clear-all
router.delete("/clear-all", checkAuth, clearAllNotifications);

// Get notifications filtered by type
// GET /api/notification/type/:type?page=1&limit=10
router.get("/type/:type", checkAuth, getNotificationsByType);

// Parameterized routes AFTER specific routes

// Get all notifications for the current user with pagination
// GET /api/notification?page=1&limit=10
router.get("/", checkAuth, getUserNotifications);

// Mark a single notification as read
// PUT /api/notification/:notificationId/read
router.put("/:notificationId/read", checkAuth, markNotificationAsRead);

// Delete a notification
// DELETE /api/notification/:notificationId
router.delete("/:notificationId", checkAuth, deleteNotification);

export default router;
