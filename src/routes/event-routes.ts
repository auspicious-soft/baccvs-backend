import { Router } from "express";
import {
  createEvent,
  deleteEvent,
  getEventOfOtherUser,
  getEventsById,
  getUserEventFeed,
  getUserEvents,
  updateEvent,
  getEventAnalytics,
} from "src/controllers/event/event-controller";
import { checkAuth } from "src/middleware/check-auth";

const router = Router();

router.post("/", createEvent);
router.get("/:id", getEventsById);
router.get("/:id/analytics", getEventAnalytics);
router.post("/user/event/feed", getUserEventFeed);
router.get("/user/events", getUserEvents);
router.get("/get/eventofother/:id", getEventOfOtherUser);
router.post("/update-event/:id", updateEvent);
router.delete("/delete-event/:id", deleteEvent);

export { router };
