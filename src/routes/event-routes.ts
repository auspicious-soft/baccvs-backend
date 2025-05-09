import { Router} from "express"
import { createEvent, deleteEvent, getAllEvents, getEventsById, updateEvent } from "src/controllers/event/event-controller"
import { checkAuth } from "src/middleware/check-auth"

const router = Router()

router.post("/",checkAuth,createEvent)
router.get("/:id",getEventsById)
router.get("/getallevents",getAllEvents)
router.put("/update-event",updateEvent)
router.delete("/delete-event",deleteEvent)

export {router}