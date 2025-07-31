import { Request, Response } from "express";
import { JwtPayload } from "jsonwebtoken";
import { httpStatusCode } from "src/lib/constant";
import { errorResponseHandler } from "src/lib/errors/error-response-handler";
import { eventModel } from "src/models/event/event-schema";
import { purchaseModel } from "src/models/purchase/purchase-schema";
import { ticketModel } from "src/models/ticket/ticket-schema";
import { generateQRCode } from "src/utils/qr/generateQRCode";

export const purchaseTicketService = async (req: Request, res: Response) => {
  if (!req.user) {
    return errorResponseHandler("Authentication failed while making purchase", httpStatusCode.UNAUTHORIZED, res);
  }

  const { id: userId } = req.user as JwtPayload;
  const { ticketId } = req.params;
  console.log('ticketId:', ticketId);  
  const { quantity = 1 } = req.body;

  const ticket = await ticketModel.findById(ticketId);

  if (!ticket) {
    return errorResponseHandler("Ticket not found", httpStatusCode.NOT_FOUND, res);
  }

  // Check if there are enough tickets available
  if (ticket.available <= quantity) {
    return errorResponseHandler("Not enough tickets available", httpStatusCode.BAD_REQUEST, res);
  }

  // Get the event to check if user has access
  const event = await eventModel.findById(ticket.event);

  // Check if user has access to private event
  if (!event) {
    return errorResponseHandler("Event not found", httpStatusCode.NOT_FOUND, res);
  }

  if (event.eventVisibility === 'private') {
    const hasAccess =
      event.creator.equals(userId) ||
      event.coHosts.some(host => host.equals(userId)) ||
      event.invitedGuests.some(guest => guest.equals(userId));

    if (!hasAccess) {
      return errorResponseHandler("You do not have access to this event", httpStatusCode.FORBIDDEN, res);
    }
  }

  // Generate a unique QR code
  const qrCode = await generateQRCode({
    userId: userId,
    ticketId: ticket._id,
    eventId: event._id,
    timestamp: Date.now(),
    quantity
  });

  // Create purchase record
  const purchase = new purchaseModel({
    ticket: ticket._id,
    event: event._id,
    buyer: userId,
    quantity,
    totalPrice: ticket.price * quantity,
    qrCode,
    purchaseDate: new Date()
  });

  await purchase.save();

  // Update ticket availability
  ticket.available -= quantity;
  await ticket.save();

  return{
    success: true,
    data: purchase
  };
}

export const getPurchaseTicketsService = async (req: Request, res: Response) => {
  // Check if user is authenticated
  if (!req.user) {
    return errorResponseHandler("Authentication failed", httpStatusCode.UNAUTHORIZED, res);
  }

  const { id: userId } = req.user as JwtPayload;

    // Fetch all purchase records for the authenticated user
    const purchases = await purchaseModel
      .find({ buyer: userId,status:{$nin:['refunded', 'disabled','pending']} })
      .populate("ticket") 
      .populate("event") 
      .select("-__v") 
      .lean(); 

    if (!purchases || purchases.length === 0) {
      return errorResponseHandler("No purchases found for this user", httpStatusCode.NOT_FOUND, res);
    }

    return {
      success: true,
      message:"Purchase records retrieved successfully",
      data: purchases,
    };
  }