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
import { usersModel } from "src/models/user/user-schema";

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
  const { id: userId } = req.user as any;
  const {
    type = "discover",
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
    filterApplied = false
  } = req.body;

  const now = new Date();
  const baseDate = new Date();
  baseDate.setHours(0, 0, 0, 0);

  // Optimized populate function with single aggregation
  const populateEventsOptimized = async (eventIds: any[]) => {
    if (!eventIds.length) return [];

    const pipeline = [
      { $match: { _id: { $in: eventIds } } },
      {
        $lookup: {
          from: "users",
          localField: "creator",
          foreignField: "_id",
          as: "creator",
          pipeline: [{ $project: { userName: 1, photos: 1 } }]
        }
      },
      {
        $lookup: {
          from: "users",
          localField: "invitedGuests",
          foreignField: "_id",
          as: "invitedGuests",
          pipeline: [{ $project: { userName: 1 } }]
        }
      },
      {
        $lookup: {
          from: "users",
          localField: "coHosts",
          foreignField: "_id",
          as: "coHosts",
          pipeline: [{ $project: { userName: 1, photos: 1 } }]
        }
      },
      {
        $lookup: {
          from: "professionalProfiles",
          localField: "lineup",
          foreignField: "_id",
          as: "lineup"
        }
      },
      {
        $lookup: {
          from: "tickets",
          localField: "_id",
          foreignField: "event",
          as: "tickets"
        }
      },
      { $unwind: { path: "$creator", preserveNullAndEmptyArrays: true } }
    ];

    return await eventModel.aggregate(pipeline);
  };

  // Optimized filter application with better indexing
  const buildFilterQuery = (baseQuery: any = {}) => {
    const query = { ...baseQuery };
    
    if (musicType?.length) {
      query["eventPreferences.musicType"] = { $in: musicType };
    }
    if (eventType?.length) {
      query["eventPreferences.eventType"] = { $in: eventType };
    }
    if (venueType?.length) {
      query["eventPreferences.venueType"] = { $in: venueType };
    }
    if (isFree !== undefined) {
      query["ticketing.isFree"] = isFree;
    }
    if (date) {
      query["date"] = { $gte: new Date(date) };
    }

    // Week filter optimization
    if (week === "this" || week === "next") {
      const today = new Date();
      const currentDay = today.getDay();
      const daysToMonday = currentDay === 0 ? 6 : currentDay - 1;

      const monday = new Date(today);
      monday.setDate(today.getDate() - daysToMonday);
      monday.setHours(0, 0, 0, 0);

      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      sunday.setHours(23, 59, 59, 999);

      if (week === "next") {
        monday.setDate(monday.getDate() + 7);
        sunday.setDate(sunday.getDate() + 7);
      }

      query["date"] = { $gte: monday, $lte: sunday };
    }

    return query;
  };

  // Optimized distance and price filtering using aggregation
  const buildLocationPipeline = (lat?: number, lng?: number, maxDistance?: number) => {
    if (lat === undefined || lng === undefined || maxDistance === undefined) {
      return [];
    }

    return [
      {
        $geoNear: {
          near: {
            type: "Point",
            coordinates: [lng, lat]
          },
          distanceField: "distance",
          maxDistance: maxDistance * 1000, // Convert km to meters
          spherical: true
        }
      }
    ];
  };

  const buildPricePipeline = (minPrice?: number, maxPrice?: number) => {
    if (minPrice === undefined && maxPrice === undefined) {
      return [];
    }

    const priceMatch: any = {};
    if (minPrice !== undefined) {
      priceMatch["tickets.price"] = { $gte: minPrice };
    }
    if (maxPrice !== undefined) {
      priceMatch["tickets.price"] = { 
        ...priceMatch["tickets.price"],
        $lte: maxPrice 
      };
    }

    return [
      {
        $lookup: {
          from: "tickets",
          localField: "_id",
          foreignField: "event",
          as: "tickets"
        }
      },
      {
        $match: {
          $or: [
            { "tickets": { $size: 0 } }, // No tickets (free event)
            priceMatch
          ]
        }
      }
    ];
  };

  // Main aggregation pipeline builder
  const buildEventPipeline = (matchQuery: any) => {
    const pipeline: any[] = [{ $match: matchQuery }];

    // Add location filter if specified
    const locationPipeline = buildLocationPipeline(lat, lng, maxDistance);
    if (locationPipeline.length) {
      pipeline.splice(0, 1, ...locationPipeline, { $match: matchQuery });
    }

    // Add price filter if specified
    const pricePipeline = buildPricePipeline(minPrice, maxPrice);
    pipeline.push(...pricePipeline);

    // Add population lookups
    pipeline.push(
      {
        $lookup: {
          from: "users",
          localField: "creator",
          foreignField: "_id",
          as: "creator",
          pipeline: [{ $project: { userName: 1, photos: 1 } }]
        }
      },
      {
        $lookup: {
          from: "users",
          localField: "invitedGuests",
          foreignField: "_id",
          as: "invitedGuests",
          pipeline: [{ $project: { userName: 1 } }]
        }
      },
      {
        $lookup: {
          from: "users",
          localField: "coHosts",
          foreignField: "_id",
          as: "coHosts",
          pipeline: [{ $project: { userName: 1, photos: 1 } }]
        }
      },
      {
        $lookup: {
          from: "professionalProfiles",
          localField: "lineup",
          foreignField: "_id",
          as: "lineup"
        }
      },
      {
        $lookup: {
          from: "tickets",
          localField: "_id",
          foreignField: "event",
          as: "tickets"
        }
      },
      { $unwind: { path: "$creator", preserveNullAndEmptyArrays: true } },
      { $sort: { date: 1 } }
    );

    return pipeline;
  };

  // Special pipeline builder for today's events with distance and spots left
  const buildTodayEventPipeline = (matchQuery: any, userLocation?: any) => {
    const pipeline: any[] = [];

    // Add distance calculation if user has saved location
    if (userLocation && userLocation.coordinates && userLocation.coordinates.length === 2) {
      const [userLng, userLat] = userLocation.coordinates;
      // Use $geoNear as first stage (requires 2dsphere index on location field)
      pipeline.push(
        {
          $geoNear: {
            near: {
              type: "Point",
              coordinates: [userLng, userLat]
            },
            distanceField: "distance",
            spherical: true,
            query: matchQuery
          }
        }
      );
    } else {
      pipeline.push({ $match: matchQuery });
    }

    // Add price filter if specified (only if not using geoNear)
    if (!userLocation || !userLocation.coordinates || userLocation.coordinates.length !== 2) {
      const pricePipeline = buildPricePipeline(minPrice, maxPrice);
      pipeline.push(...pricePipeline);
    } else {
      // Handle price filter manually when using geoNear
      if (minPrice !== undefined || maxPrice !== undefined) {
        pipeline.push(
          {
            $lookup: {
              from: "tickets",
              localField: "_id",
              foreignField: "event",
              as: "tickets"
            }
          }
        );
        
        const priceMatch: any = {};
        if (minPrice !== undefined) {
          priceMatch["tickets.price"] = { $gte: minPrice };
        }
        if (maxPrice !== undefined) {
          priceMatch["tickets.price"] = { 
            ...priceMatch["tickets.price"],
            $lte: maxPrice 
          };
        }

        pipeline.push({
          $match: {
            $or: [
              { "tickets": { $size: 0 } }, // No tickets (free event)
              priceMatch
            ]
          }
        });
      }
    }

    // Add population lookups with spots left calculation
    pipeline.push(
      {
        $lookup: {
          from: "users",
          localField: "creator",
          foreignField: "_id",
          as: "creator",
          pipeline: [{ $project: { userName: 1, photos: 1 } }]
        }
      },
      {
        $lookup: {
          from: "users",
          localField: "invitedGuests",
          foreignField: "_id",
          as: "invitedGuests",
          pipeline: [{ $project: { userName: 1 } }]
        }
      },
      {
        $lookup: {
          from: "users",
          localField: "coHosts",
          foreignField: "_id",
          as: "coHosts",
          pipeline: [{ $project: { userName: 1, photos: 1 } }]
        }
      },
      {
        $lookup: {
          from: "professionalProfiles",
          localField: "lineup",
          foreignField: "_id",
          as: "lineup"
        }
      }
    );

    // Add tickets lookup only if not already added for price filtering
    if (!userLocation || !userLocation.coordinates || userLocation.coordinates.length !== 2 || (minPrice === undefined && maxPrice === undefined)) {
      pipeline.push({
        $lookup: {
          from: "tickets",
          localField: "_id",
          foreignField: "event",
          as: "tickets"
        }
      });
    }

    pipeline.push(
      {
        $lookup: {
          from: "purchases",
          localField: "_id",
          foreignField: "event",
          as: "purchases"
        }
      },
      { $unwind: { path: "$creator", preserveNullAndEmptyArrays: true } },
      {
        $addFields: {
          totalSold: {
            $sum: "$purchases.quantity"
          },
          spotsLeft: {
            $subtract: ["$capacity", { $sum: "$purchases.quantity" }]
          },
          distanceKm: {
            $cond: {
              if: { $ifNull: ["$distance", false] },
              then: { $round: [{ $divide: ["$distance", 1000] }, 2] },
              else: null
            }
          }
        }
      },
      { $sort: { date: 1 } }
    );

    return pipeline;
  };

  // Handle different feed types
  if (type === "discover") {
    const user = await usersModel.findById(userId).lean();
    if (!user) return { success: false, message: "User not found" };

    if (filterApplied) {
      const filterQuery = buildFilterQuery({ date: { $gte: baseDate } });
      const pipeline : any = buildEventPipeline(filterQuery);
      const events = await eventModel.aggregate(pipeline);

      return {
        success: true,
        message: "Discover feed fetched successfully",
        data: events
      };
    }

    // Build personalized queries
    const forYouQuery = buildFilterQuery({ date: { $gte: baseDate } });
    
    // Add user preferences
    if (user.musicStyles?.length) {
      forYouQuery["eventPreferences.musicType"] = { $in: user.musicStyles };
    }
    if (user.eventTypes?.length) {
      forYouQuery["eventPreferences.eventType"] = { $in: user.eventTypes };
    }
    // if (user.atmosphereVibes?.length) {
    //   forYouQuery["eventPreferences.atmosphereVibe"] = { $in: user.atmosphereVibes };
    // }
    // if (user.interestCategories?.length) {
    //   forYouQuery["interestCategories"] = { $in: user.interestCategories };
    // }
    // if (user.language?.length) {
    //   forYouQuery["language"] = { $in: user.language };
    // }

    // Today's events query
    const startToday = new Date();
    startToday.setHours(0, 0, 0, 0);
    const endToday = new Date();
    endToday.setHours(23, 59, 59, 999);
    const todayQuery = buildFilterQuery({ 
      date: { $gte: startToday, $lte: endToday } 
    });

    // Trending events with optimized aggregation
    const trendingPipeline = [
      {
        $group: {
          _id: "$event",
          purchaseCount: { $sum: "$quantity" }
        }
      },
      { $sort: { purchaseCount: -1 } },
      { $limit: 50 }, // Limit trending events
      {
        $lookup: {
          from: "events",
          localField: "_id",
          foreignField: "_id",
          as: "eventDetails"
        }
      },
      { $unwind: "$eventDetails" },
      { $replaceRoot: { newRoot: "$eventDetails" } },
      { $match: buildFilterQuery({ date: { $gte: baseDate } }) }
    ];

    // Add location and price filters to trending
    const locationPipeline = buildLocationPipeline(lat, lng, maxDistance);
    const pricePipeline = buildPricePipeline(minPrice, maxPrice);
    
    if (locationPipeline.length || pricePipeline.length) {
      trendingPipeline.push(...locationPipeline, ...pricePipeline);
    }

    // Add population to trending
    trendingPipeline.push(
      {
        $lookup: {
          from: "users",
          localField: "creator",
          foreignField: "_id",
          as: "creator",
          pipeline: [{ $project: { userName: 1, photos: 1 } }]
        }
      },
      {
        $lookup: {
          from: "tickets",
          localField: "_id",
          foreignField: "event",
          as: "tickets"
        }
      },
      { $unwind: { path: "$creator", preserveNullAndEmptyArrays: true } }
    );

    // Execute all queries in parallel
    const [foryouEvents, todayEvents, trendingEvents] = await Promise.all([
      eventModel.aggregate(buildEventPipeline(forYouQuery)),
      eventModel.aggregate(buildTodayEventPipeline(todayQuery, user.location)),
      purchaseModel.aggregate(trendingPipeline)
    ]);

    return {
      success: true,
      message: "Discover feed fetched successfully",
      data: {
        foryouEvents,
        todayEvents,
        trendingEvents
      }
    };
  }

  // Optimized queries for other types
  if (type === "myEvents") {
    const pipeline = buildEventPipeline({ creator: userId });
    const events = await eventModel.aggregate(pipeline);
    
    return {
      success: true,
      message: "My events fetched successfully",
      data: {
        populated: events,
        totalCount: events.length
      }
    };
  }

  if (type === "past") {
    const pipeline = buildEventPipeline({ 
      creator: userId, 
      date: { $lt: baseDate } 
    });
    pipeline[pipeline.length - 1] = { $sort: { date: -1 } }; // Sort descending for past events
    
    const events = await eventModel.aggregate(pipeline);
    
    return {
      success: true,
      message: "Past events fetched successfully",
      data: {
        populated: events,
        totalCount: events.length
      }
    };
  }

  if (type === "upcoming") {
    const pipeline = buildEventPipeline({ 
      creator: userId, 
      date: { $gte: baseDate } 
    });
    const events = await eventModel.aggregate(pipeline);
    
    return {
      success: true,
      message: "Upcoming events fetched successfully",
      data: {
        populated: events,
        totalCount: events.length
      }
    };
  }

  return { success: false, message: "Invalid type parameter" };
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

export const getUserEventsService = async (req:any,res:Response)=>{
  if (!req.user) {
    return errorResponseHandler("Authentication failed", httpStatusCode.UNAUTHORIZED, res);
  }

  const { id: userId } = req.user 

  const events = await eventModel
    .find({ creator: userId })
    .populate("creator", "userName photos")
    .populate("invitedGuests", "userName photos")
    .populate("coHosts", "userName photos")
    .populate("lineup", "userName photos")
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