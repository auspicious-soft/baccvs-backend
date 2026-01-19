import { Response } from "express";
import mongoose from "mongoose";
import { httpStatusCode } from "src/lib/constant";
import { errorResponseHandler } from "src/lib/errors/error-response-handler";
import { purchaseModel } from "src/models/purchase/purchase-schema";
import { ticketModel } from "src/models/ticket/ticket-schema";

export const createTicket = async (req: any, res: Response) => {
  const { event, name, quantity, available, price, benefits, isResellable } =
    req.body;

  if (!event || !name || !quantity || available === undefined) {
    return errorResponseHandler(
      "Event, name, quantity, and available are required fields",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

  const eventExists = await mongoose.model("event").findById(event);
  if (!eventExists) {
    return errorResponseHandler(
      "Event not found",
      httpStatusCode.NOT_FOUND,
      res
    );
  }

  if (available > quantity) {
    return errorResponseHandler(
      "Available quantity cannot be greater than total quantity",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

  const ticket = new ticketModel({
    event,
    name,
    quantity,
    available,
    price: price || 0,
    benefits: benefits || [],
    isResellable: isResellable || false,
  });

  const savedTicket = await ticket.save();
  await savedTicket.populate("event");

  return {
    success: true,
    message: "Ticket created successfully",
    data: savedTicket,
  };
};

export const getTickets = async (_req: any, res: Response) => {
  const tickets = await ticketModel.find().populate("event");
  return res.status(200).json({
    success: true,
    data: tickets,
  });
};

export const getTicketById = async (req: any, res: Response) => {
  const ticketId = req.params.id;

  // Get the ticket with populated event
  const ticket = await ticketModel.findById(ticketId).populate("event");
  if (!ticket) {
    return errorResponseHandler(
      "Ticket not found",
      httpStatusCode.NOT_FOUND,
      res
    );
  }

  // Get purchase statistics for this ticket
  const purchaseStats = await purchaseModel.aggregate([
    {
      $match: {
        ticket: new mongoose.Types.ObjectId(ticketId),
        status: { $in: ["active", "used", "transferred"] }, // Only count valid purchases
      },
    },
    {
      $group: {
        _id: null,
        totalSold: { $sum: "$quantity" },
        totalSaleAmount: { $sum: "$totalPrice" },
      },
    },
  ]);

  // Get recent buyers (last 10 purchases with buyer details)
  const recentBuyers = await purchaseModel
    .find({
      ticket: ticketId,
      status: { $in: ["active", "used", "transferred"] },
    })
    .populate("buyer", "userName photos") // Adjust fields based on your user schema
    .sort({ purchaseDate: -1 }) // Most recent first
    .select("buyer quantity totalPrice purchaseDate status")
    .limit(10);

  // Extract statistics or set defaults
  const stats = purchaseStats[0] || { totalSold: 0, totalSaleAmount: 0 };
  const totalAvailable = ticket.quantity - stats.totalSold;
  const isSoldOut = totalAvailable <= 0;

  // Enhanced ticket data
  const enhancedTicket = {
    ...ticket.toObject(),
    totalSold: stats.totalSold,
    totalAvailable: totalAvailable,
    totalSaleAmount: stats.totalSaleAmount,
    isSoldOut: isSoldOut,
    recentBuyers: recentBuyers.map((purchase) => ({
      buyer: purchase.buyer,
      quantity: purchase.quantity,
      totalPrice: purchase.totalPrice,
      purchaseDate: purchase.purchaseDate,
      status: purchase.status,
    })),
  };

  return {
    success: true,
    message: "Ticket fetched successfully",
    data: enhancedTicket,
  };
};

export const getTicketsByEvent = async (req: any, res: Response) => {
  const eventId = req.params.eventId;

  // Get all tickets for the event
  const tickets = await ticketModel.find({ event: eventId }).populate("event");

  if (!tickets || tickets.length === 0) {
    return errorResponseHandler(
      "No tickets found for this event",
      httpStatusCode.NOT_FOUND,
      res
    );
  }

  // Get purchase statistics for all tickets in this event
 const purchaseStats = await purchaseModel.aggregate([
  {
    $match: {
      event: new mongoose.Types.ObjectId(eventId),
      status: { $in: ["active", "used", "transferred"] },
      purchaseType: "purchase",
    },
  },
  {
    $group: {
      _id: "$ticket",
      totalSold: { $sum: "$quantity" },

      // Aggregate in GBP minor units
      grossGBP: { $sum: { $ifNull: ["$metaData.balanceTx.amount", 0] } },
      feeGBP: { $sum: { $ifNull: ["$metaData.balanceTx.fee", 0] } },
      netGBP: { $sum: { $ifNull: ["$metaData.balanceTx.net", 0] } },
      exchangeRate: { $first: "$metaData.balanceTx.exchange_rate" },
    },
  },
]);



  // Create a map for quick lookup of purchase stats
  const statsMap = new Map();
 purchaseStats.forEach((stat) => {
  const rate = stat.exchangeRate || 1; // fallback if missing

  statsMap.set(stat._id.toString(), {
    totalSold: stat.totalSold,
    grossUSD: (stat.grossGBP / 100) / rate,
    stripeFeeUSD: (stat.feeGBP / 100) / rate,
    netUSD: (stat.netGBP / 100) / rate,
  });
});



  // Enhance tickets with purchase statistics
 const enhancedTickets = tickets.map((ticket) => {
  const ticketId = ticket._id.toString();
  const stats = statsMap.get(ticketId) || {
    totalSold: 0,
    grossUSD: 0,
    stripeFeeUSD: 0,
    netUSD: 0,
  };

  const totalAvailable = ticket.quantity - stats.totalSold;

  return {
    ...ticket.toObject(),
    totalSold: stats.totalSold,
    totalAvailable,
    totalGrossUSD: stats.grossUSD,
    totalStripeFeeUSD: stats.stripeFeeUSD,
    totalNetUSD: stats.netUSD,
    isSoldOut: totalAvailable <= 0,
  };
});



  // Calculate overall totals for all tickets
 const overallTotals = enhancedTickets.reduce(
  (totals, ticket) => {
    totals.totalTicketsSold += ticket.totalSold;
    totals.totalGrossUSD += ticket.totalGrossUSD;
    totals.totalStripeFeesUSD += ticket.totalStripeFeeUSD;
    totals.totalNetUSD += ticket.totalNetUSD;
    return totals;
  },
  {
    totalTicketsSold: 0,
    totalGrossUSD: 0,
    totalStripeFeesUSD: 0,
    totalNetUSD: 0,
  }
);



  return {
  success: true,
  message: "Tickets fetched successfully",
  data: {
    enhancedTickets,
    summary: {
      totalTicketsSold: overallTotals.totalTicketsSold,
      totalGrossUSD: overallTotals.totalGrossUSD,
      totalStripeFeesUSD: overallTotals.totalStripeFeesUSD,
      totalNetUSD: overallTotals.totalNetUSD,
      totalTicketTypes: enhancedTickets.length,
      currency: "USD",
    },
  },
};
};

// Helper function to calculate total ticket quantities for an event
const getTotalTicketQuantityForEvent = async (
  eventId: string,
  excludeTicketId?: string
) => {
  const query: any = { event: eventId };
  if (excludeTicketId) {
    query._id = { $ne: excludeTicketId };
  }

  const tickets = await ticketModel.find(query);
  return tickets.reduce((total, ticket) => total + ticket.quantity, 0);
};

// Helper function to validate total capacity for an event
const validateEventCapacity = async (
  eventId: string,
  ticketIdToUpdate: string,
  newQuantity: number,
  eventCapacity: number
) => {
  const allEventTickets = await ticketModel.find({ event: eventId });

  let totalQuantity = 0;
  allEventTickets.forEach((ticket) => {
    if (ticket._id.toString() === ticketIdToUpdate) {
      // Use the new quantity for the ticket being updated
      totalQuantity += newQuantity;
    } else {
      // Use existing quantity for other tickets
      totalQuantity += ticket.quantity;
    }
  });

  return {
    isValid: totalQuantity <= eventCapacity,
    totalQuantity,
    eventCapacity,
  };
};

export const updateTicket = async (req: any, res: Response) => {
  const ticketId = req.params.id;
  const userId = req.user?.id; // Assuming user ID is available in req.user from auth middleware
  const updateData = req.body;

  // First, get the ticket with populated event data
  const existingTicket = await ticketModel.findById(ticketId).populate("event");
  if (!existingTicket) {
    return errorResponseHandler(
      "Ticket not found",
      httpStatusCode.NOT_FOUND,
      res
    );
  }

  // Check if user is the creator of the event or a co-host
  const event = existingTicket.event as any;
  const isEventCreator = event.creator.toString() === userId;
  const isCoHost =
    event.coHosts &&
    event.coHosts.some((coHost: any) => coHost.toString() === userId);

  if (!isEventCreator && !isCoHost) {
    return errorResponseHandler(
      "You are not authorized to update this ticket",
      httpStatusCode.FORBIDDEN,
      res
    );
  }

  // Check if any tickets have been sold
  const soldTicketsCount = await purchaseModel.countDocuments({
    ticket: ticketId,
    status: { $in: ["active", "used", "transferred"] }, // Count valid purchases
  });

  if (soldTicketsCount > 0) {
    return errorResponseHandler(
      "Cannot update ticket as it has already been sold",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

  // If quantity is being updated, check against event capacity
  if (updateData.quantity !== undefined) {
    // Validate that quantity is a positive number
    if (updateData.quantity < 0) {
      return errorResponseHandler(
        "Ticket quantity cannot be negative",
        httpStatusCode.BAD_REQUEST,
        res
      );
    }

    // Get all tickets for this event (including the current ticket being updated)
    const allEventTickets = await ticketModel.find({
      event: event._id,
    });

    // Calculate total quantity excluding the current ticket's old quantity
    let totalOtherTicketsQuantity = 0;
    let currentTicketOldQuantity = 0;

    allEventTickets.forEach((ticket) => {
      if (ticket._id.toString() === ticketId) {
        // This is the ticket being updated - store its current quantity
        currentTicketOldQuantity = ticket.quantity;
      } else {
        // Add other tickets' quantities
        totalOtherTicketsQuantity += ticket.quantity;
      }
    });

    // Calculate new total quantity with the updated ticket quantity
    const newTotalQuantity =
      Number(totalOtherTicketsQuantity) + Number(updateData.quantity);

    // Check if new total would exceed event capacity
    if (newTotalQuantity > event.capacity) {
      return errorResponseHandler(
        `Total ticket quantity (${newTotalQuantity}) cannot exceed event capacity (${event.capacity}). ` +
          `Other tickets total: ${totalOtherTicketsQuantity}, Your new ticket quantity: ${updateData.quantity}, ` +
          `Current ticket quantity: ${currentTicketOldQuantity}`,
        httpStatusCode.BAD_REQUEST,
        res
      );
    }

    // Additional validation: Ensure each ticket has at least some quantity
    // (You might want to allow 0 if tickets can be temporarily disabled)
    if (updateData.quantity === 0) {
      console.warn(
        `Ticket ${ticketId} quantity set to 0 - this will make the ticket unavailable`
      );
    }

    // Log the capacity check for debugging
    console.log(
      `Capacity check - Event: ${event._id}, Capacity: ${event.capacity}, ` +
        `Other tickets: ${totalOtherTicketsQuantity}, New ticket quantity: ${updateData.quantity}, ` +
        `Total: ${newTotalQuantity}`
    );
  }

  // Proceed with the update
  const updatedTicket = await ticketModel
    .findByIdAndUpdate(
      ticketId,
      { available: updateData.quantity, ...updateData },
      { new: true, runValidators: true }
    )
    .populate("event");

  // Optional: Log the update for audit purposes
  console.log(
    `Ticket ${ticketId} updated by user ${userId}. New quantity: ${
      updateData.quantity || existingTicket.quantity
    }`
  );

  return {
    success: true,
    message: "Ticket updated successfully",
    data: updatedTicket,
  };
};

export const updateTicketAvailability = async (req: any, res: Response) => {
  const { available } = req.body;
  const updatedTicket = await ticketModel
    .findByIdAndUpdate(req.params.id, { $set: { available } }, { new: true })
    .populate("event");

  if (!updatedTicket) {
    return errorResponseHandler(
      "Ticket not found",
      httpStatusCode.NOT_FOUND,
      res
    );
  }

  return {
    success: true,
    message: "Ticket availability updated",
    data: updatedTicket,
  };
};

export const deleteTicket = async (req: any, res: Response) => {
  const { id: userId } = req.user; // Fixed destructuring
  const ticketId = req.params.id;

  // Find the ticket and populate the event
  const ticketToDelete: any = await ticketModel
    .findById(ticketId)
    .populate("event");

  if (!ticketToDelete) {
    return errorResponseHandler(
      "Ticket not found",
      httpStatusCode.NOT_FOUND,
      res
    );
  }

  // Check if user is authorized (must be event creator)
  if (ticketToDelete?.event?.creator.toString() !== userId) {
    return errorResponseHandler(
      "You are not authorized to delete this ticket",
      httpStatusCode.FORBIDDEN,
      res
    );
  }

  // Check if ticket has any purchases - prevent deletion if it does
  const existingPurchases = await purchaseModel.find({ ticket: ticketId });
  if (existingPurchases.length > 0) {
    return errorResponseHandler(
      "Cannot delete ticket that has been purchased",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

  // Delete the ticket
  await ticketModel.findByIdAndDelete(ticketId);

  return {
    success: true,
    message: "Ticket deleted successfully",
  };
};

export const deleteTicketsByEvent = async (req: any, res: Response) => {
  await ticketModel.deleteMany({ event: req.params.eventId });
  return {
    success: true,
    message: "All tickets for the event deleted",
  };
};
