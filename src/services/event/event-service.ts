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
import { purchaseModel } from "src/models/purchase/purchase-schema";

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
    return errorResponseHandler(
      "Missing required fields (title, date, startTime, endTime, venue, capacity, isFreeEvent)",
      httpStatusCode.BAD_REQUEST,
      res
    );
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

export const getUserEventFeedService = async (req: Request, res: Response) => {
  const {
    week,
    date,
    maxDistance,
    lat,
    lng,
    minPrice,
    maxPrice,
    isFree,
    musicType,
    eventType,
    venueType,
  } = req.body;

  const query: any = {};
  const now = new Date();
  let startDate: Date | undefined;
  let endDate: Date | undefined;

  // Date filtering
  if (week === "this") {
    const day = now.getDay();
    startDate = new Date(now);
    startDate.setHours(0, 0, 0, 0);
    endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + (7 - day));
    endDate.setHours(23, 59, 59, 999);
  } else if (week === "next") {
    const day = now.getDay();
    startDate = new Date(now);
    startDate.setHours(0, 0, 0, 0);
    startDate.setDate(startDate.getDate() + (8 - day));
    endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + 6);
    endDate.setHours(23, 59, 59, 999);
  } else if (date) {
    startDate = new Date(date as string);
    startDate.setHours(0, 0, 0, 0);
    endDate = new Date(startDate);
    endDate.setHours(23, 59, 59, 999);
  }

  const baseDate = new Date();
  baseDate.setHours(0, 0, 0, 0);

  if (startDate && endDate) {
    query.date = {
      $gte: startDate < baseDate ? baseDate : startDate,
      $lte: endDate,
    };
  } else {
    query.date = { $gte: baseDate };
  }

  // Geo filtering - Use $geoWithin with $centerSphere for aggregation pipelines
  if (maxDistance && lat && lng) {
    const radiusInRadians = parseFloat(maxDistance as string) / 6371; // Convert km to radians
    query.location = {
      $geoWithin: {
        $centerSphere: [
          [parseFloat(lng as string), parseFloat(lat as string)],
          radiusInRadians
        ]
      }
    };
  }

  // Event preferences
  if (musicType) {
    const musicTypes = Array.isArray(musicType)
      ? musicType
      : (musicType as string).split(",").map((t) => t.trim());
    query["eventPreferences.musicType"] = { $in: musicTypes };
  }
  if (eventType) {
    const eventTypes = Array.isArray(eventType)
      ? eventType
      : (eventType as string).split(",").map((t) => t.trim());
    query["eventPreferences.eventType"] = { $in: eventTypes };
  }
  if (venueType) {
    const venueTypes = Array.isArray(venueType)
      ? venueType
      : (venueType as string).split(",").map((t) => t.trim());
    query["eventPreferences.venueType"] = { $in: venueTypes };
  }

  let events;

  // 👉 If filtering for paid events with price range — use aggregation
  if (isFree === "false" && (minPrice || maxPrice)) {
    query["ticketing.isFree"] = false;

    const pipeline: any[] = [
      { $match: query },
      {
        $lookup: {
          from: "tickets",
          localField: "_id",
          foreignField: "event",
          as: "tickets",
        },
      },
      { $match: { tickets: { $exists: true, $ne: [] } } },
      { $unwind: "$tickets" },
    ];

    const priceMatch: any = {};
    if (minPrice) priceMatch["tickets.price"] = { $gte: parseFloat(minPrice as string) };
    if (maxPrice) {
      if (priceMatch["tickets.price"]) {
        priceMatch["tickets.price"].$lte = parseFloat(maxPrice as string);
      } else {
        priceMatch["tickets.price"] = { $lte: parseFloat(maxPrice as string) };
      }
    }

    pipeline.push(
      { $match: priceMatch },
      {
        $group: {
          _id: "$_id",
          doc: { $first: "$$ROOT" },
          minTicketPrice: { $min: "$tickets.price" },
          maxTicketPrice: { $max: "$tickets.price" },
          tickets: { $push: "$tickets" },
        },
      },
      {
        $replaceRoot: {
          newRoot: {
            $mergeObjects: ["$doc", {
              minTicketPrice: "$minTicketPrice",
              maxTicketPrice: "$maxTicketPrice",
              tickets: "$tickets"
            }],
          },
        },
      }
    );

    // If geo filtering is needed, add distance calculation and sort
    if (maxDistance && lat && lng) {
      pipeline.push({
        $addFields: {
          distance: {
            $multiply: [
              {
                $acos: {
                  $add: [
                    {
                      $multiply: [
                        { $sin: { $degreesToRadians: parseFloat(lat as string) } },
                        { $sin: { $degreesToRadians: { $arrayElemAt: ["$location.coordinates", 1] } } }
                      ]
                    },
                    {
                      $multiply: [
                        { $cos: { $degreesToRadians: parseFloat(lat as string) } },
                        { $cos: { $degreesToRadians: { $arrayElemAt: ["$location.coordinates", 1] } } },
                        { $cos: { $degreesToRadians: { $subtract: [{ $arrayElemAt: ["$location.coordinates", 0] }, parseFloat(lng as string)] } } }
                      ]
                    }
                  ]
                }
              },
              6371 // Earth's radius in km
            ]
          }
        }
      });
      pipeline.push({ $sort: { distance: 1, date: 1 } });
    } else {
      pipeline.push({ $sort: { date: 1 } });
    }

    events = await eventModel.aggregate(pipeline);

    // Populate references
    events = await eventModel.populate(events, [
      { path: "creator", select: "userName" },
      { path: "invitedGuests", select: "userName" },
      { path: "coHosts", select: "userName" },
      { path: "lineup" },
    ]);
  } else {
    // 👉 Free events or no price filter — use .find()
    if (isFree === "true") {
      query["ticketing.isFree"] = true;
    } else if (isFree === "false") {
      query["ticketing.isFree"] = false;
    }

    // For .find() queries, we can still use $near if no aggregation is needed
    if (maxDistance && lat && lng) {
      query.location = {
        $near: {
          $geometry: {
            type: "Point",
            coordinates: [parseFloat(lng as string), parseFloat(lat as string)],
          },
          $maxDistance: parseFloat(maxDistance as string) * 1000,
        },
      };
    }

    events = await eventModel
      .find(query)
      .populate("creator", "userName photos")
      .populate("invitedGuests", "userName")
      .populate("coHosts", "userName photos")
      .populate("lineup")
      .sort({ date: 1 });

    // 🧩 Manually attach tickets
    const eventIds = events.map((e) => e._id);
    const allTickets = await ticketModel.find({ event: { $in: eventIds } });

    const ticketsMap = new Map();
    for (const ticket of allTickets) {
      const eid = ticket.event.toString();
      if (!ticketsMap.has(eid)) ticketsMap.set(eid, []);
      ticketsMap.get(eid).push(ticket);
    }

    events = events.map((event) => {
      const e = event.toObject() as any;
      e.tickets = ticketsMap.get(event._id.toString()) || [];
      return e;
    });
  }

  return {
    success: true,
    message: "Events retrieved successfully",
    data: events,
    totalCount: events.length,
  };
};

export const getEventOfOtherUserService = async(req:any,res:Response)=>{
  const { id: userId } = req.params;

  if (!isValidObjectId(userId)) {
    return errorResponseHandler("Invalid user ID", httpStatusCode.BAD_REQUEST, res);
  }

  const events = await eventModel
    .find({ creator: userId })
    .populate("creator", "userName")
    .populate("invitedGuests", "userName")
    .populate("coHosts", "userName")
    .populate("lineup")
    .sort({ createdAt: -1 });

  if (events.length === 0) {
    return errorResponseHandler("No events found for this user", httpStatusCode.NOT_FOUND, res);
  }

  return {
    success: true,
    message: "Events retrieved successfully",
    data: events,
  };
}

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

  // Check if any tickets have been purchased for this event
  const existingPurchases = await purchaseModel.findOne({ 
    event: eventId,
    status: { $in: ['active', 'used', 'transferred', 'pending'] }
  });

  if (existingPurchases) {
    return errorResponseHandler(
      "Cannot update event details. Tickets have already been purchased for this event.",
      httpStatusCode.FORBIDDEN,
      res
    );
  }

  // Validate lineup
  if (data.lineup && Array.isArray(data.lineup)) {
    const invalidLineupIds = data.lineup.filter((id: string) => !isValidObjectId(id));
    if (invalidLineupIds.length > 0) {
      return errorResponseHandler(
        `Invalid MongoDB ObjectID(s) in lineup: ${invalidLineupIds.join(", ")}`,
        httpStatusCode.BAD_REQUEST,
        res
      );
    }

    const existingProfiles = await ProfessionalProfileModel.find({ _id: { $in: data.lineup } }).select("_id").lean();
    if (existingProfiles.length !== data.lineup.length) {
      const missingIds = data.lineup.filter(
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
  if (data.coHosts && Array.isArray(data.coHosts)) {
    const invalidCoHostIds = data.coHosts.filter((id: string) => !isValidObjectId(id));
    if (invalidCoHostIds.length > 0) {
      return errorResponseHandler(
        `Invalid MongoDB ObjectID(s) in coHosts: ${invalidCoHostIds.join(", ")}`,
        httpStatusCode.BAD_REQUEST,
        res
      );
    }
  }

  // Validate invitedGuests
  if (data.invitedGuests && Array.isArray(data.invitedGuests)) {
    const invalidGuestIds = data.invitedGuests.filter((id: string) => !isValidObjectId(id));
    if (invalidGuestIds.length > 0) {
      return errorResponseHandler(
        `Invalid MongoDB ObjectID(s) in invitedGuests: ${invalidGuestIds.join(", ")}`,
        httpStatusCode.BAD_REQUEST,
        res
      );
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
      return errorResponseHandler(
        "Invalid location format. Must be a GeoJSON Point with coordinates [longitude, latitude]",
        httpStatusCode.BAD_REQUEST,
        res
      );
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