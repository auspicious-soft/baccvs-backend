import { Router} from "express"
import { createEvent, deleteEvent, getAllEvents, getEventOfOtherUser, getEventsById, updateEvent } from "src/controllers/event/event-controller"
import { checkAuth } from "src/middleware/check-auth"

const router = Router()

router.post("/",checkAuth,createEvent)
router.get("/:id",getEventsById)
router.get("/getallevents",getAllEvents)
router.get("/get/eventofother/:id",getEventOfOtherUser)
router.put("/update-event",updateEvent)
router.delete("/delete-event",deleteEvent)

export {router}