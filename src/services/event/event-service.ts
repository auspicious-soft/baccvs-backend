import { Request, Response } from "express";
import { JwtPayload } from "jsonwebtoken";
import { isValidObjectId } from "mongoose";
import Busboy from "busboy";
import { Readable } from "stream";
import { customAlphabet } from "nanoid";
import { EventVisibility, httpStatusCode } from "src/lib/constant";
import { errorResponseHandler } from "src/lib/errors/error-response-handler";
import { eventModel } from "src/models/event/event-schema";
import { ticketModel } from "src/models/ticket/ticket-schema";
import { uploadStreamToS3Service } from "src/configF/s3";
import { ProfessionalProfileModel } from "src/models/professional/professional-schema";

export const createEventService = async (req: Request, res: Response) => {
  if (!req.user) {
    return errorResponseHandler(
      "Authentication failed while creating event",
      httpStatusCode.UNAUTHORIZED,
      res
    );
  }

  const { id: creatorId } = req.user as JwtPayload;
  let parsedData: any = {};
  let coverPhoto: string | null = null;
  let videos: string[] = [];

  // Handle multipart/form-data for file uploads
  if (req.headers["content-type"]?.includes("multipart/form-data")) {

    return new Promise((resolve, reject) => {
      const busboy = Busboy({ headers: req.headers });
      const uploadPromises: Array<{ promise: Promise<string>; fieldname: string }> = [];

      busboy.on("field", (fieldname: string, value: string) => {
        if (
          ["location", "tickets", "lineup", "invitedGuests", "coHosts", "eventPreferences"].includes(
            fieldname
          )
        ) {
          try {
            parsedData[fieldname] = JSON.parse(value);
          } catch (error) {
            return reject({
              success: false,
              message: `Failed to parse ${fieldname}. Must be a valid JSON string`,
              code: httpStatusCode.BAD_REQUEST,
            });
          }
        } else {
          parsedData[fieldname] = value;
        }
      });

      busboy.on("file", async (fieldname: string, fileStream: any, fileInfo: any) => {
      

        if (!["coverPhoto", "videos"].includes(fieldname)) {
          fileStream.resume();
          return;
        }

        const { filename, mimeType } = fileInfo;

        // Validate file type with fallback for extension
        const isImage =
          (mimeType.startsWith("image/") || /\.(png|jpg|jpeg|gif)$/i.test(filename)) &&
          fieldname === "coverPhoto";
        const isVideo = mimeType.startsWith("video/") && fieldname === "videos";



        if (!isImage && !isVideo) {
          fileStream.resume();
          return reject({
            success: false,
            message: `Invalid file type. Expected image for coverPhoto or video for videos, got ${mimeType}`,
            code: httpStatusCode.BAD_REQUEST,
          });
        }

        // Create readable stream
        const readableStream = new Readable();
        readableStream._read = () => {};

        fileStream.on("data", (chunk: any) => {
          readableStream.push(chunk);
        });

        fileStream.on("end", () => {
          readableStream.push(null);
        });

        // Upload to S3 and track which field it belongs to
        const uploadPromise = uploadStreamToS3Service(
          readableStream,
          filename,
          mimeType,
          parsedData.title || `event_${customAlphabet("0123456789", 5)()}`
        ).catch((err) => {
          throw err;
        });

        uploadPromises.push({ promise: uploadPromise, fieldname });
      });

      busboy.on("finish", async () => {

        try {
          // Wait for file uploads
          if (uploadPromises.length > 0) {
            const uploadResults = await Promise.all(uploadPromises.map((item) => item.promise));

            // Process uploads based on their fieldname
            uploadResults.forEach((url, index) => {
              const fieldname = uploadPromises[index].fieldname;
              if (fieldname === "coverPhoto") {
                coverPhoto = url;
              } else if (fieldname === "videos") {
                videos.push(url);
              }
            });
          } else {
          }


          // Check if we have a coverPhoto from either upload or form field
          const finalCoverPhoto = coverPhoto || parsedData.coverPhoto;
          if (!finalCoverPhoto) {
            return reject({
              success: false,
              message:
                "Cover photo is required but was not provided or failed to upload. Please ensure you're sending a file with fieldname 'coverPhoto'",
              code: httpStatusCode.BAD_REQUEST,
            });
          }

          // Proceed with event creation
          resolve(await processEventCreation(parsedData, creatorId, coverPhoto, videos, res));
        } catch (error) {
          console.error("Upload error:", error);
          reject({
            success: false,
            message: (error instanceof Error ? error.message : String(error)) || "Failed to upload files",
            code: httpStatusCode.INTERNAL_SERVER_ERROR,
          });
        }
      });

      busboy.on("error", (error: any) => {
        console.error("Busboy error:", error);
        reject({
          success: false,
          message: error.message || "Error processing file uploads",
          code: httpStatusCode.INTERNAL_SERVER_ERROR,
        });
      });

      req.pipe(busboy);
    });
  } else {
    // Handle JSON request
    return processEventCreation(req.body, creatorId, null, [], res);
  }
};

// Process event creation logic
const processEventCreation = async (
  data: any,
  creatorId: string,
  coverPhoto: string | null,
  videos: string[],
  res: Response
) => {
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
    coHosts,
    lineup,
    isFreeEvent,
    enableReselling,
    location,
    tickets,
  } = data;

  // Validate required fields
  if (!title || !date || !startTime || !endTime || !venue || !capacity || isFreeEvent === undefined) {
    return {
      success: false,
      message: "Missing required fields (title, date, startTime, endTime, venue, capacity, isFreeEvent)",
      code: httpStatusCode.BAD_REQUEST,
    };
  }

  // Validate tickets array
  if (isFreeEvent === 'false' && (!tickets || !Array.isArray(tickets) || tickets.length === 0)) {
    return errorResponseHandler(
      "Tickets are required for creating an event with paid entry",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

  // Validate capacity and total ticket quantity
  if (capacity <= 0) {
    return errorResponseHandler(
      "Capacity must be a positive number",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

  if( isFreeEvent === 'false') {
  const totalTicketQuantity = tickets.reduce((sum: number, ticket: any) => sum + (ticket.quantity || 0), 0);
  if (totalTicketQuantity > capacity) {
    return errorResponseHandler(
      `Total ticket quantity (${totalTicketQuantity}) exceeds event capacity (${capacity})`,
      httpStatusCode.BAD_REQUEST,
      res
    );
  }
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

    const invalidIds = invitedGuests.filter((id: string) => !isValidObjectId(id));
    if (invalidIds.length > 0) {
      return errorResponseHandler(
        `Invalid MongoDB ObjectID(s) in invitedGuests: ${invalidIds.join(", ")}`,
        httpStatusCode.BAD_REQUEST,
        res
      );
    }
  }

  // Validate lineup
  if (lineup && Array.isArray(lineup) && lineup.length > 0) {
    const invalidLineupIds = lineup.filter((id: string) => !isValidObjectId(id));
    if (invalidLineupIds.length > 0) {
      return errorResponseHandler(
        `Invalid MongoDB ObjectID(s) in lineup: ${invalidLineupIds.join(", ")}`,
        httpStatusCode.BAD_REQUEST,
        res
      );
    }

    const existingProfiles = await ProfessionalProfileModel.find({ _id: { $in: lineup } })
      .select("_id")
      .lean();
    if (existingProfiles.length !== lineup.length) {
      const missingIds = lineup.filter(
        (id: string) => !existingProfiles.some((profile: any) => profile._id.toString() === id)
      );
      return errorResponseHandler(
        `Professional profile(s) not found for ID(s): ${missingIds.join(", ")}`,
        httpStatusCode.BAD_REQUEST,
        res
      );
    }
  }

  // Validate coHosts
  if (coHosts && Array.isArray(coHosts) && coHosts.length > 0) {
    const invalidCoHostIds = coHosts.filter((id: string) => !isValidObjectId(id));
    if (invalidCoHostIds.length > 0) {
      return errorResponseHandler(
        `Invalid MongoDB ObjectID(s) in coHosts: ${invalidCoHostIds.join(", ")}`,
        httpStatusCode.BAD_REQUEST,
        res
      );
    }
  }

  // Validate location
  if (location) {
    if (
      !location.type ||
      location.type !== "Point" ||
      !Array.isArray(location.coordinates) ||
      location.coordinates.length !== 2 ||
      typeof location.coordinates[0] !== "number" ||
      typeof location.coordinates[1] !== "number"
    ) {
      return errorResponseHandler(
        "Invalid location format. Must be a GeoJSON Point with coordinates [longitude, latitude]",
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
      venueType: [],
    },
    eventVisibility: eventVisibility || EventVisibility.PUBLIC,
    invitedGuests: invitedGuests || [],
    media: {
      coverPhoto: coverPhoto || data.coverPhoto,
      videos: videos.length > 0 ? videos : data.videos || [],
    },
    coHosts: coHosts || [],
    lineup: lineup || [],
    ticketing: {
      isFree: isFreeEvent,
      enableReselling: enableReselling ?? false,
    },
    location: location
      ? {
          type: "Point",
          coordinates: location.coordinates,
          address: location.address || null,
        }
      : {
          type: "Point",
          coordinates: [0, 0],
          address: null,
        },
  });

  const savedEvent = await newEvent.save();
 
  // Create tickets
  let createdTickets: any[] = [];
  if(isFreeEvent === 'false'){
  const ticketDocs = tickets.map((ticket: any) => ({
    event: savedEvent._id,
    name: ticket.name,
    quantity: ticket.quantity,
    price: ticket.price || 0,
    benefits: ticket.benefits,
    available: ticket.quantity,
    isResellable: savedEvent.ticketing?.enableReselling || false,
  }));

   createdTickets = await ticketModel.insertMany(ticketDocs);
  }
  // Populate event fields
  await savedEvent.populate([
    { path: "creator", select: "-password" },
    { path: "invitedGuests", select: "-password" },
    { path: "coHosts", select: "-password" },
    { path: "lineup" },
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
  const events = await eventModel
    .find()
    .populate("creator", "userName")
    .populate("invitedGuests", "userName")
    .populate("coHosts", "userName")
    .populate("lineup")
    .sort({ createdAt: -1 });

  return {
    success: true,
    message: "Events retrieved successfully",
    data: events,
  };
};

export const getEventsByIdService = async (req: Request, res: Response) => {
  const event = await eventModel
    .findById(req.params.id)
    .populate("creator")
    .populate("invitedGuests")
    .populate("coHosts")
    .populate("lineup");

  if (!event) {
    return errorResponseHandler("Event not found", httpStatusCode.NOT_FOUND, res);
  }

  const tickets = await ticketModel.find({ event: event._id }).populate("event");

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
    return errorResponseHandler("Authentication failed", httpStatusCode.UNAUTHORIZED, res);
  }

  const { id: userId } = req.user as JwtPayload;
  let parsedData: any = {};
  let coverPhoto: string | null = null;
  let videos: string[] = [];

  // Handle multipart/form-data for file uploads
  if (req.headers["content-type"]?.includes("multipart/form-data")) {
    return new Promise((resolve, reject) => {
      const busboy = Busboy({ headers: req.headers });
      const uploadPromises: Promise<string>[] = [];

      busboy.on("field", (fieldname: string, value: string) => {
        if (
          ["location", "tickets", "lineup", "invitedGuests", "coHosts", "eventPreferences"].includes(fieldname)
        ) {
          try {
            parsedData[fieldname] = JSON.parse(value);
          } catch (error) {
      return reject({
              success: false,
              message: `Failed to parse ${fieldname}. Must be a valid JSON string`,
              code: httpStatusCode.BAD_REQUEST,
            });
          }
        } else {
          parsedData[fieldname] = value;
        }
      });

      busboy.on("file", async (fieldname: string, fileStream: any, fileInfo: any) => {
        if (!["coverPhoto", "videos"].includes(fieldname)) {
          fileStream.resume();
          return;
        }

        const { filename, mimeType } = fileInfo;

        // Validate file type
        const isImage = mimeType.startsWith("image/") && fieldname === "coverPhoto";
        const isVideo = mimeType.startsWith("video/") && fieldname === "videos";
        if (!isImage && !isVideo) {
          fileStream.resume();
          return reject({
            success: false,
            message: "Only image files are allowed for coverPhoto and video files for videos",
            code: httpStatusCode.BAD_REQUEST,
          });
        }

        // Create readable stream
        const readableStream = new Readable();
        readableStream._read = () => {};

        fileStream.on("data", (chunk: any) => {
          readableStream.push(chunk);
        });

        fileStream.on("end", () => {
          readableStream.push(null);
        });

        // Upload to S3
        const uploadPromise = uploadStreamToS3Service(
          readableStream,
          filename,
          mimeType,
          parsedData.title || `event_${customAlphabet("0123456789", 5)()}`
        );
        uploadPromises.push(uploadPromise);
      });

      busboy.on("finish", async () => {
        try {
          // Wait for file uploads
          const uploadedFiles = await Promise.all(uploadPromises);
          uploadedFiles.forEach((url, index) => {
            if (index === 0 && !coverPhoto && !parsedData.coverPhoto) {
              coverPhoto = url;
            } else {
              videos.push(url);
            }
          });

          // Proceed with event update
          resolve(await processEventUpdate(parsedData, userId, req.params.id, coverPhoto, videos, res));
        } catch (error) {
          console.error("Upload error:", error);
          reject({
            success: false,
            message: (error instanceof Error ? error.message : String(error)) || "Failed to upload files",
            code: httpStatusCode.INTERNAL_SERVER_ERROR,
          });
        }
      });

      busboy.on("error", (error: any) => {
        console.error("Busboy error:", error);
        reject({
          success: false,
          message: error.message || "Error processing file uploads",
          code: httpStatusCode.INTERNAL_SERVER_ERROR,
        });
      });

      req.pipe(busboy);
    });
  } else {
    // Handle JSON request
    return processEventUpdate(req.body, userId, req.params.id, null, [], res);
  }
};

const processEventUpdate = async (
  data: any,
  userId: string,
  eventId: string,
  coverPhoto: string | null,
  videos: string[],
  res: Response
) => {
  const event = await eventModel.findById(eventId);
  if (!event) {
    return {
      success: false,
      message: "Event not found",
      code: httpStatusCode.NOT_FOUND,
    };
  }

  if (event.creator.toString() !== userId) {
    return {
      success: false,
      message: "Not authorized to update this event",
      code: httpStatusCode.FORBIDDEN,
    };
  }

  // Validate lineup
  if (data.lineup && Array.isArray(data.lineup)) {
    const invalidLineupIds = data.lineup.filter((id: string) => !isValidObjectId(id));
    if (invalidLineupIds.length > 0) {
      return {
        success: false,
        message: `Invalid MongoDB ObjectID(s) in lineup: ${invalidLineupIds.join(", ")}`,
        code: httpStatusCode.BAD_REQUEST,
      };
    }

    const existingProfiles = await ProfessionalProfileModel.find({ _id: { $in: data.lineup } }).select("_id").lean();
    if (existingProfiles.length !== data.lineup.length) {
      const missingIds = data.lineup.filter(
        (id: string) => !existingProfiles.some((profile: any) => profile._id.toString() === id)
      );
      return {
        success: false,
        message: `Professional profile(s) not found for ID(s): ${missingIds.join(", ")}`,
        code: httpStatusCode.BAD_REQUEST,
      };
    }
  }

  // Validate coHosts
  if (data.coHosts && Array.isArray(data.coHosts)) {
    const invalidCoHostIds = data.coHosts.filter((id: string) => !isValidObjectId(id));
    if (invalidCoHostIds.length > 0) {
      return {
        success: false,
        message: `Invalid MongoDB ObjectID(s) in coHosts: ${invalidCoHostIds.join(", ")}`,
        code: httpStatusCode.BAD_REQUEST,
      };
    }
  }

  // Validate invitedGuests
  if (data.invitedGuests && Array.isArray(data.invitedGuests)) {
    const invalidGuestIds = data.invitedGuests.filter((id: string) => !isValidObjectId(id));
    if (invalidGuestIds.length > 0) {
      return {
        success: false,
        message: `Invalid MongoDB ObjectID(s) in invitedGuests: ${invalidGuestIds.join(", ")}`,
        code: httpStatusCode.BAD_REQUEST,
      };
    }
  }

  // Validate location
  if (data.location) {
    if (
      !data.location.type ||
      data.location.type !== "Point" ||
      !Array.isArray(data.location.coordinates) ||
      data.location.coordinates.length !== 2 ||
      typeof data.location.coordinates[0] !== "number" ||
      typeof data.location.coordinates[1] !== "number"
    ) {
      return {
        success: false,
        message: "Invalid location format. Must be a GeoJSON Point with coordinates [longitude, latitude]",
        code: httpStatusCode.BAD_REQUEST,
      };
    }
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
    location: any;
    ticketing: any;
  }> = {};

  if (data.title) updateData.title = data.title;
  if (data.aboutEvent) updateData.aboutEvent = data.aboutEvent;
  if (data.date) updateData.date = data.date;
  if (data.startTime) updateData.startTime = data.startTime;
  if (data.endTime) updateData.endTime = data.endTime;
  if (data.venue) updateData.venue = data.venue;
  if (data.capacity) updateData.capacity = data.capacity;
  if (data.eventPreferences) updateData.eventPreferences = data.eventPreferences;
  if (data.eventVisibility) updateData.eventVisibility = data.eventVisibility;
  if (data.invitedGuests) updateData.invitedGuests = data.invitedGuests;
  if (data.coHosts) updateData.coHosts = data.coHosts;
  if (data.lineup) updateData.lineup = data.lineup;
  if (data.isFreeEvent !== undefined || data.enableReselling !== undefined) {
    updateData.ticketing = {
      isFree: data.isFreeEvent ?? event.ticketing?.isFree,
      enableReselling: data.enableReselling ?? event.ticketing?.enableReselling,
    };
  }
  if (data.location) {
    updateData.location = {
      type: "Point",
      coordinates: data.location.coordinates,
      address: data.location.address || null,
    };
  }
  if (coverPhoto || videos.length > 0 || data.media) {
    updateData.media = {
      coverPhoto: coverPhoto || data.media?.coverPhoto || event.media?.coverPhoto,
      videos: videos.length > 0 ? videos : data.media?.videos || event.media?.videos,
    };
  }

  const updatedEvent = await eventModel
    .findByIdAndUpdate(eventId, { $set: updateData }, { new: true, runValidators: true })
    .populate("creator", "userName")
    .populate("invitedGuests", "userName")
    .populate("coHosts", "userName")
    .populate("lineup");

  return {
    success: true,
    message: "Event updated successfully",
    data: updatedEvent,
  };
};

export const deleteEventService = async (req: Request, res: Response) => {
  if (!req.user) {
    return errorResponseHandler("Authentication failed", httpStatusCode.UNAUTHORIZED, res);
  }

  const { id: userId } = req.user as JwtPayload;
  const event = await eventModel.findById(req.params.id);

  if (!event) {
    return errorResponseHandler("Event not found", httpStatusCode.NOT_FOUND, res);
  }

  if (event.creator.toString() !== userId) {
    return errorResponseHandler("Not authorized to delete this event", httpStatusCode.FORBIDDEN, res);
  }

  await eventModel.findByIdAndDelete(req.params.id);
  await ticketModel.deleteMany({ event: req.params.id });

  return {
    success: true,
    message: "Event and associated tickets deleted successfully",
  };
};