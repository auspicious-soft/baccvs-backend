import { Request, Response } from "express";
import { JwtPayload } from "jsonwebtoken";
import { isValidObjectId } from "mongoose";
import { EventVisibility, httpStatusCode } from "src/lib/constant";
import { errorResponseHandler } from "src/lib/errors/error-response-handler";
import { eventModel } from "src/models/event/event-schema";
import { ticketModel } from "src/models/ticket/ticket-schema";

export const createEventService = async (req: Request, res: Response) => {
  if (!req.user) {
    return errorResponseHandler(
      "Authentication failed while creating event",
      httpStatusCode.UNAUTHORIZED,
      res
    );
  }

  const { id: creatorId } = req.user as JwtPayload;
  const {
    title,
    aboutEvent,
    date,
    startTime,
    endTime,
    venue,
    capacity,
    eventPreferences,
    eventVisibility,
    invitedGuests,
    media,
    coHosts,
    lineup,
    isFreeEvent,
    enableReselling,
    location,
    tickets,
  } = req.body;

  // Validate tickets array
  if (!tickets || !Array.isArray(tickets) || tickets.length === 0) {
    return errorResponseHandler(
      "At least one ticket is required",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

  // Validate capacity and total ticket quantity
  if (!capacity || capacity <= 0) {
    return errorResponseHandler(
      "Event capacity must be a positive number",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

  const totalTicketQuantity = tickets.reduce((sum, ticket) => sum + (ticket.quantity || 0), 0);
  if (totalTicketQuantity > capacity) {
    return errorResponseHandler(
      `Total ticket quantity (${totalTicketQuantity}) exceeds event capacity (${capacity})`,
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

  // Validate invited guests for private events
  if (eventVisibility === EventVisibility.PRIVATE) {
    if (!invitedGuests || !Array.isArray(invitedGuests) || invitedGuests.length === 0) {
      return errorResponseHandler(
        "Private events must have at least one invited guest",
        httpStatusCode.BAD_REQUEST,
        res
      );
    }

    // Validate that all invitedGuests IDs are valid MongoDB ObjectIDs
    const invalidIds = invitedGuests.filter((id) => !isValidObjectId(id));
    if (invalidIds.length > 0) {
      return errorResponseHandler(
        `Invalid MongoDB ObjectID(s) in invitedGuests: ${invalidIds.join(", ")}`,
        httpStatusCode.BAD_REQUEST,
        res
      );
    }
  }

  // Create the event
  const newEvent = new eventModel({
    creator: creatorId,
    title,
    aboutEvent: aboutEvent || "",
    date,
    startTime,
    endTime,
    venue,
    capacity,
    eventPreferences: eventPreferences || {
      musicType: [],
      eventType: [],
      venueType: null,
    },
    eventVisibility: eventVisibility || EventVisibility.PUBLIC,
    invitedGuests: invitedGuests || [],
    media: media || {
      coverPhoto: "default-cover-photo-url",
      videos: [],
    },
    coHosts: coHosts || [],
    lineup: lineup || [],
    ticketing: {
      isFree: isFreeEvent,
      enableReselling: enableReselling ?? false,
    },
    location: location || {
      type: "Point",
      coordinates: [0, 0],
    },    
  });

  const savedEvent = await newEvent.save();

  // Create tickets for the event
  const ticketDocs = tickets.map((ticket) => ({
    event: savedEvent._id,
    name: ticket.name,
    quantity: ticket.quantity,
    price: ticket.price || 0,
    benefits: ticket.benefits,
    available: ticket.quantity,
    isResellable: savedEvent.ticketing?.enableReselling || false,
  }));

  const createdTickets = await ticketModel.insertMany(ticketDocs);

  // Populate event fields
  await savedEvent.populate([
    { path: "creator", select: "-password" },
    { path: "invitedGuests", select: "-password" },
    { path: "coHosts", select: "-password" },
  ]);

  // Populate ticket event field
  await ticketModel.populate(createdTickets, {
    path: "event",
    select: "title venue date",
  });

  return {
    success: true,
    message: "Event and tickets created successfully",
    data: {
      event: savedEvent,
      tickets: createdTickets,
    },
  };
};

export const getAllEventsService = async (req: Request, res: Response) => {
  // if (!req.user) {
  //   return errorResponseHandler("Authentication failed", httpStatusCode.UNAUTHORIZED,res);
  // }

  const events = await eventModel
    .find()
    .populate("creator", "userName")
    .populate("invitedGuests", "userName")
    .populate("coHosts", "userName")
    .sort({ createdAt: -1 });

  return {
    success: true,
    message: "Events retrieved successfully",
    data: events,
  };
};

export const getEventsByIdService = async (req: Request, res: Response) => {
  // if (!req.user) {
  //   return errorResponseHandler("Authentication failed", httpStatusCode.UNAUTHORIZED,res);
  // }

  const event = await eventModel
    .findById(req.params.id)
    .populate("creator")
    .populate("invitedGuests")
    .populate("coHosts");

  if (!event) {
    return errorResponseHandler(
      "Event not found",
      httpStatusCode.NOT_FOUND,
      res
    );
  }

  const tickets = await ticketModel
    .find({ event: event._id })
    .populate("event");

  return {
    success: true,
    message: "Event and tickets retrieved successfully",
    data: {
      event,
      tickets,
    },
  };
};

export const updateEventService = async (req: Request, res: Response) => {
  if (!req.user) {
    return errorResponseHandler(
      "Authentication failed",
      httpStatusCode.UNAUTHORIZED,
      res
    );
  }

  const { id: userId } = req.user as JwtPayload;
  const event = await eventModel.findById(req.params.id);

  if (!event) {
    return errorResponseHandler(
      "Event not found",
      httpStatusCode.NOT_FOUND,
      res
    );
  }

  if (event.creator.toString() !== userId) {
    return errorResponseHandler(
      "Not authorized to update this event",
      httpStatusCode.FORBIDDEN,
      res
    );
  }

  const updateData: Partial<{
    title: string;
    aboutEvent: string;
    date: string;
    startTime: string;
    endTime: string;
    venue: string;
    capacity: number;
    eventPreferences: any;
    eventVisibility: string;
    invitedGuests: string[];
    media: any;
    coHosts: string[];
    lineup: string[];
  }> = {};
  if (req.body.title) updateData.title = req.body.title;
  if (req.body.aboutEvent) updateData.aboutEvent = req.body.aboutEvent;
  if (req.body.date) updateData.date = req.body.date;
  if (req.body.startTime) updateData.startTime = req.body.startTime;
  if (req.body.endTime) updateData.endTime = req.body.endTime;
  if (req.body.venue) updateData.venue = req.body.venue;
  if (req.body.capacity) updateData.capacity = req.body.capacity;
  if (req.body.eventPreferences)
    updateData.eventPreferences = req.body.eventPreferences;
  if (req.body.eventVisibility)
    updateData.eventVisibility = req.body.eventVisibility;
  if (req.body.invitedGuests) updateData.invitedGuests = req.body.invitedGuests;
  if (req.body.media) updateData.media = req.body.media;
  if (req.body.coHosts) updateData.coHosts = req.body.coHosts;
  if (req.body.lineup) updateData.lineup = req.body.lineup;

  const updatedEvent = await eventModel
    .findByIdAndUpdate(
      req.params.id,
      { $set: updateData },
      { new: true, runValidators: true }
    )
    .populate("creator", "userName")
    .populate("invitedGuests", "userName")
    .populate("coHosts", "userName");

  return {
    success: true,
    message: "Event updated successfully",
    data: updatedEvent,
  };
};

export const deleteEventService = async (req: Request, res: Response) => {
  if (!req.user) {
    return errorResponseHandler(
      "Authentication failed",
      httpStatusCode.UNAUTHORIZED,
      res
    );
  }

  const { id: userId } = req.user as JwtPayload;
  const event = await eventModel.findById(req.params.id);

  if (!event) {
    return errorResponseHandler(
      "Event not found",
      httpStatusCode.NOT_FOUND,
      res
    );
  }

  if (event.creator.toString() !== userId) {
    return errorResponseHandler(
      "Not authorized to delete this event",
      httpStatusCode.FORBIDDEN,
      res
    );
  }

  // Delete the event
  await eventModel.findByIdAndDelete(req.params.id);
  // Delete associated tickets
  await ticketModel.deleteMany({ event: req.params.id });

  return {
    success: true,
    message: "Event and associated tickets deleted successfully",
  };
};
