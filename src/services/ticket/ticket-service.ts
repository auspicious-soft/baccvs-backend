import { Response } from "express";
import mongoose from "mongoose";
import { httpStatusCode } from "src/lib/constant";
import { errorResponseHandler } from "src/lib/errors/error-response-handler";
import { purchaseModel } from "src/models/purchase/purchase-schema";
import { ticketModel } from "src/models/ticket/ticket-schema";

export const createTicket = async (req: any, res: Response) => {

    const { event, name, quantity, available, price, benefits, isResellable } = req.body;

    if (!event || !name || !quantity || available === undefined) {
      return errorResponseHandler("Event, name, quantity, and available are required fields", httpStatusCode.BAD_REQUEST, res);
    }

    const eventExists = await mongoose.model('event').findById(event);
    if (!eventExists) {
      return errorResponseHandler("Event not found", httpStatusCode.NOT_FOUND, res);
    }

    if (available > quantity) {
      return errorResponseHandler("Available quantity cannot be greater than total quantity", httpStatusCode.BAD_REQUEST, res);
    }

    const ticket = new ticketModel({
      event,
      name,
      quantity,
      available,
      price: price || 0,
      benefits: benefits || [],
      isResellable: isResellable || false
    });

    const savedTicket = await ticket.save();
    await savedTicket.populate('event');

    return {
      success: true,
      message: "Ticket created successfully",
      data: savedTicket
    };
};

export const getTickets = async (_req: any, res: Response) => {

    const tickets = await ticketModel.find().populate('event');
    return res.status(200).json({
      success: true,
      data: tickets
    });
};

export const getTicketById = async (req: any, res: Response) => {
    const ticketId = req.params.id;

    // Get the ticket with populated event
    const ticket = await ticketModel.findById(ticketId).populate('event');
    if (!ticket) {
      return errorResponseHandler("Ticket not found", httpStatusCode.NOT_FOUND, res);
    }

    // Get purchase statistics for this ticket
    const purchaseStats = await purchaseModel.aggregate([
      {
        $match: {
          ticket: new mongoose.Types.ObjectId(ticketId),
          status: { $in: ['active', 'used', 'transferred'] } // Only count valid purchases
        }
      },
      {
        $group: {
          _id: null,
          totalSold: { $sum: '$quantity' },
          totalSaleAmount: { $sum: '$totalPrice' }
        }
      }
    ]);

    // Get recent buyers (last 10 purchases with buyer details)
    const recentBuyers = await purchaseModel
      .find({
        ticket: ticketId,
        status: { $in: ['active', 'used', 'transferred'] }
      })
      .populate('buyer', 'name email profilePicture') // Adjust fields based on your user schema
      .sort({ purchaseDate: -1 }) // Most recent first
      .select('buyer quantity totalPrice purchaseDate status');

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
      recentBuyers: recentBuyers.map(purchase => ({
        buyer: purchase.buyer,
        quantity: purchase.quantity,
        totalPrice: purchase.totalPrice,
        purchaseDate: purchase.purchaseDate,
        status: purchase.status
      }))
    };

    return {
      success: true,
      message: "Ticket fetched successfully",
      data: enhancedTicket
    };


};

export const getTicketsByEvent = async (req: any, res: Response) => {
    const eventId = req.params.eventId;
    
    // Get all tickets for the event
    const tickets = await ticketModel.find({ event: eventId }).populate('event');
    
    if (!tickets || tickets.length === 0) {
      return errorResponseHandler("No tickets found for this event", httpStatusCode.NOT_FOUND, res);
    }

    // Get purchase statistics for all tickets in this event
    const purchaseStats = await purchaseModel.aggregate([
      {
        $match: {
          event: new mongoose.Types.ObjectId(eventId),
          status: { $in: ['active', 'used', 'transferred'] } // Only count valid purchases
        }
      },
      {
        $group: {
          _id: '$ticket',
          totalSold: { $sum: '$quantity' },
          totalSaleAmount: { $sum: '$totalPrice' }
        }
      }
    ]);

    // Create a map for quick lookup of purchase stats
    const statsMap = new Map();
    purchaseStats.forEach(stat => {
      statsMap.set(stat._id.toString(), {
        totalSold: stat.totalSold,
        totalSaleAmount: stat.totalSaleAmount
      });
    });

    // Enhance tickets with purchase statistics
    const enhancedTickets = tickets.map(ticket => {
      const ticketId = ticket._id.toString();
      const stats = statsMap.get(ticketId) || { totalSold: 0, totalSaleAmount: 0 };
      
      const totalAvailable = ticket.quantity - stats.totalSold;
      const isSoldOut = totalAvailable <= 0;

      return {
        ...ticket.toObject(), // Convert mongoose document to plain object
        totalSold: stats.totalSold,
        totalAvailable: totalAvailable,
        totalSaleAmount: stats.totalSaleAmount,
        isSoldOut: isSoldOut
      };
    });

    // Calculate overall totals for all tickets
    const overallTotals = enhancedTickets.reduce((totals, ticket) => {
      totals.totalTicketsSold += ticket.totalSold;
      totals.totalSalesAmount += ticket.totalSaleAmount;
      return totals;
    }, {
      totalTicketsSold: 0,
      totalSalesAmount: 0
    });

    return {
      success: true,
      message: "Tickets fetched successfully",
      data: {
        enhancedTickets,
       summary: {
        totalTicketsSold: overallTotals.totalTicketsSold,
        totalSalesAmount: overallTotals.totalSalesAmount,
        totalTicketTypes: enhancedTickets.length
      }
    }
    }
};

export const updateTicket = async (req: any, res: Response) => {
    const ticketId = req.params.id;
    const userId = req.user?.id; // Assuming user ID is available in req.user from auth middleware
    const updateData = req.body;

    // First, get the ticket with populated event data
    const existingTicket = await ticketModel.findById(ticketId).populate('event');
    if (!existingTicket) {
      return errorResponseHandler("Ticket not found", httpStatusCode.NOT_FOUND, res);
    }

    // Check if user is the creator of the event or a co-host
    const event = existingTicket.event as any;
    const isEventCreator = event.creator.toString() === userId;
    const isCoHost = event.coHosts && event.coHosts.some((coHost: any) => coHost.toString() === userId);

    if (!isEventCreator && !isCoHost) {
      return errorResponseHandler("You are not authorized to update this ticket", httpStatusCode.FORBIDDEN, res);
    }

    // Check if any tickets have been sold
    const soldTicketsCount = await purchaseModel.countDocuments({
      ticket: ticketId,
      status: { $in: ['active', 'used', 'transferred'] } // Count valid purchases
    });

    if (soldTicketsCount > 0) {
      return errorResponseHandler("Cannot update ticket as it has already been sold", httpStatusCode.BAD_REQUEST, res);
    }

    // If quantity is being updated, check against event capacity
    if (updateData.quantity !== undefined) {
      // Get all tickets for this event (excluding the current ticket being updated)
      const otherTickets = await ticketModel.find({
        event: event._id,
        _id: { $ne: ticketId }
      });

      // Calculate total quantity of other tickets
      const otherTicketsQuantity = otherTickets.reduce((total, ticket) => total + ticket.quantity, 0);
      
      // Check if new total would exceed event capacity
      const newTotalQuantity = otherTicketsQuantity + updateData.quantity;
      
      if (newTotalQuantity > event.capacity) {
        return errorResponseHandler(
          `Total ticket quantity (${newTotalQuantity}) cannot exceed event capacity (${event.capacity})`,
          httpStatusCode.BAD_REQUEST,
          res
        );
      }
    }

    // Proceed with the update
    const updatedTicket = await ticketModel.findByIdAndUpdate(
      ticketId,
      updateData,
      { new: true, runValidators: true }
    ).populate('event');

    return {
      success: true,
      message: "Ticket updated successfully",
      data: updatedTicket
    };


};

export const updateTicketAvailability = async (req: any, res: Response) => {

    const { available } = req.body;
    const updatedTicket = await ticketModel.findByIdAndUpdate(
      req.params.id,
      { $set: { available } },
      { new: true }
    ).populate('event');

    if (!updatedTicket) {
      return errorResponseHandler("Ticket not found", httpStatusCode.NOT_FOUND, res);
    }

    return {
      success: true,
      message: "Ticket availability updated",
      data: updatedTicket
    };

};

export const deleteTicket = async (req: any, res: Response) => {
    const deletedTicket = await ticketModel.findByIdAndDelete(req.params.id);
    if (!deletedTicket) {
      return errorResponseHandler("Ticket not found", httpStatusCode.NOT_FOUND, res);
    }

    return {
      success: true,
      message: "Ticket deleted successfully"
    }
};

export const deleteTicketsByEvent = async (req: any, res: Response) => {

    await ticketModel.deleteMany({ event: req.params.eventId });
    return {
      success: true,
      message: "All tickets for the event deleted"
    };

};
