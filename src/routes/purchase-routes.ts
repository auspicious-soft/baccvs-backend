import { Router } from "express";
import { getPurchaseTicketById, getPurchaseTickets, purchaseTicket } from "src/controllers/purchase/purchase-controller";
import { checkAuth } from "src/middleware/check-auth";

const router = Router()

router.post("/purchaseticket/:ticketId",purchaseTicket);
router.get("/purchaseticket",getPurchaseTickets);
router.get("/purchaseticket/:purchaseId",getPurchaseTicketById);
 
export {router}