import { Router } from "express";
import { purchaseTicket } from "src/controllers/purchase/purchase-controller";
import { checkAuth } from "src/middleware/check-auth";

const router = Router()

router.post("/purchaseticket/:ticketId",checkAuth,purchaseTicket)

export {router}