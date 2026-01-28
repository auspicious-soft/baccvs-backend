import { Request, Response } from "express";
import { JwtPayload } from "jsonwebtoken";
import mongoose, { isValidObjectId } from "mongoose";
import Busboy from "busboy";
import { Readable } from "stream";
import { customAlphabet } from "nanoid";
import {
  EventVisibility,
  httpStatusCode,
  FollowRelationshipStatus,
} from "src/lib/constant";
import { errorResponseHandler } from "src/lib/errors/error-response-handler";
import { eventModel } from "src/models/event/event-schema";
import { ticketModel } from "src/models/ticket/ticket-schema";
import { uploadStreamToS3Service } from "src/configF/s3";
import { ProfessionalProfileModel } from "src/models/professional/professional-schema";
import { purchaseModel } from "src/models/purchase/purchase-schema";
import { usersModel } from "src/models/user/user-schema";
import { followModel } from "src/models/follow/follow-schema";
import { LikeModel } from "src/models/like/like-schema";
import { Comment } from "src/models/comment/comment-schema";
import { NotificationModel } from "src/models/notification/notification-schema";
import { convertToUTCAndLocal } from "src/utils/date";
import { sendPushToToken } from "src/utils/firebase-admin";
import { EventViewerModel } from "src/models/eventViewers/eventViewers-schema";

type TimeFilter = "today" | "week" | "month" | "year";

interface AnalyticsQuery {
  timeFilter?: TimeFilter;
}

// Helper function to send event creation notifications
const sendEventNotifications = async (
  eventId: string,
  creatorId: string,
  invitedGuestIds: string[],
  coHostIds: string[],
  eventTitle: string,
) => {
  try {
    const creator = await usersModel
      .findById(creatorId)
      .select("userName photos")
      .lean();

    if (!creator) return;

    const notificationsToCreate: any = [];
    let validInvitedGuests: string[] = [];
    let validCoHosts: string[] = [];
    const followerIdsToNotify: string[] = [];

    // Prepare invited guests notifications
    if (invitedGuestIds && invitedGuestIds.length > 0) {
      validInvitedGuests = invitedGuestIds.filter(
        (id) => id.toString() !== creatorId,
      );

      validInvitedGuests.forEach((guestId) => {
        notificationsToCreate.push({
          recipient: guestId,
          sender: creatorId,
          type: "event_invite",
          title: `${creator.userName} invited you to ${eventTitle}`,
          message: `${creator.userName} invited you to attend event: ${eventTitle}`,
          read: false,
          actionLink: `/event/${eventId}`,
          metadata: {
            invitedBy: creatorId,
            invitedByName: creator.userName,
            invitedByPhoto: creator.photos?.[0] || null,
            eventId,
            eventTitle,
          },
          reference: {
            model: "events",
            id: eventId,
          },
        });
      });
    }

    // Prepare co-host notifications
    if (coHostIds && coHostIds.length > 0) {
      validCoHosts = coHostIds.filter((id) => id.toString() !== creatorId);

      validCoHosts.forEach((coHostId) => {
        notificationsToCreate.push({
          recipient: coHostId,
          sender: creatorId,
          type: "event_invite",
          title: `${creator.userName} invited you as co-host for ${eventTitle}`,
          message: `${creator.userName} invited you to be a co-host for event: ${eventTitle}`,
          read: false,
          actionLink: `/event/${eventId}`,
          metadata: {
            invitedBy: creatorId,
            invitedByName: creator.userName,
            invitedByPhoto: creator.photos?.[0] || null,
            eventId,
            eventTitle,
            role: "co_host",
          },
          reference: {
            model: "events",
            id: eventId,
          },
        });
      });
    }

    // Get all followers of the event creator and prepare follower notifications
    const followers = await followModel
      .find({
        following_id: creatorId,
        relationship_status: FollowRelationshipStatus.FOLLOWING,
      })
      .select("follower_id");

    if (followers && followers.length > 0) {
      followers.forEach((follow: any) => {
        const followerId = follow.follower_id.toString();
        const isAlreadyNotified =
          validInvitedGuests?.some((id) => id.toString() === followerId) ||
          validCoHosts?.some((id) => id.toString() === followerId);

        if (!isAlreadyNotified) {
          notificationsToCreate.push({
            recipient: followerId,
            sender: creatorId,
            type: "event_reminder",
            title: `${creator.userName} created a new event: ${eventTitle}`,
            message: `${creator.userName} created a new event you might like: ${eventTitle}`,
            read: false,
            actionLink: `/event/${eventId}`,
            metadata: {
              createdBy: creatorId,
              createdByName: creator.userName,
              createdByPhoto: creator.photos?.[0] || null,
              eventId,
              eventTitle,
            },
            reference: {
              model: "events",
              id: eventId,
            },
          });

          followerIdsToNotify.push(followerId);
        }
      });
    }

    // Insert all notifications
    if (notificationsToCreate.length > 0) {
      await NotificationModel.insertMany(notificationsToCreate);
    }

    // Send push notifications for all created notifications (non-blocking)
    try {
      const recipientIds = Array.from(
        new Set(notificationsToCreate.map((n: any) => n.recipient.toString())),
      );

      // Avoid double-sending to invited guests (we'll send here as well but if you prefer single place, remove earlier block)
      const users = await usersModel
        .find({ _id: { $in: recipientIds } })
        .select("fcmToken pushNotification")
        .lean();

      const userMap: Record<string, any> = {};
      users.forEach((u: any) => (userMap[u._id.toString()] = u));

      const sent = new Set<string>();

      for (const notif of notificationsToCreate) {
        const rid = notif.recipient.toString();
        if (sent.has(rid)) continue; // send only one push per recipient
        const recipient = userMap[rid];
        if (recipient && recipient.pushNotification && recipient.fcmToken) {
          // Choose title/message from the notification
          sendPushToToken(recipient.fcmToken, notif.title, notif.message, {
            type: notif.type,
            eventId,
          }).catch((err) =>
            console.warn("sendPushToToken error for event notification:", err),
          );
          sent.add(rid);
        }
      }
    } catch (err) {
      console.warn(
        "Failed to send push notifications for event notifications:",
        err,
      );
    }
  } catch (error) {
    console.error("Error sending event notifications:", error);
    // Don't throw error - notifications shouldn't block event creation
  }
};

function getStartOfDayUTC(date = new Date()) {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

const getDateRange = (filter: TimeFilter = "week") => {
  const now = new Date();
  const start = new Date();
  const end = new Date();

  end.setHours(23, 59, 59, 999);

  switch (filter) {
    case "today":
      start.setHours(0, 0, 0, 0);
      break;
    case "week":
      start.setDate(now.getDate() - 6);
      start.setHours(0, 0, 0, 0);
      break;
    case "month":
      start.setDate(now.getDate() - 29);
      start.setHours(0, 0, 0, 0);
      break;
    case "year":
      start.setFullYear(now.getFullYear() - 1);
      start.setHours(0, 0, 0, 0);
      break;
  }

  return { start, end };
};

// export const createEventService = async (req: Request, res: Response) => {
//   if (!req.user) {
//     return errorResponseHandler(
//       "Authentication failed while creating event",
//       httpStatusCode.UNAUTHORIZED,
//       res
//     );
//   }

//   const { id: creatorId } = req.user as JwtPayload;
//   let parsedData: any = {};
//   let coverPhoto: string | null = null;
//   let videos: string[] = [];

//   // Handle multipart/form-data for file uploads
//   if (req.headers["content-type"]?.includes("multipart/form-data")) {
//     return new Promise((resolve, reject) => {
//       const busboy = Busboy({ headers: req.headers });
//       const uploadPromises: Array<{
//         promise: Promise<string>;
//         fieldname: string;
//       }> = [];

//       busboy.on("field", (fieldname: string, value: string) => {
//         if (
//           [
//             "location",
//             "tickets",
//             "lineup",
//             "invitedGuests",
//             "coHosts",
//             "eventPreferences",
//           ].includes(fieldname)
//         ) {
//           try {
//             parsedData[fieldname] = JSON.parse(value);
//           } catch (error) {
//             return reject({
//               success: false,
//               message: `Failed to parse ${fieldname}. Must be a valid JSON string`,
//               code: httpStatusCode.BAD_REQUEST,
//             });
//           }
//         } else {
//           parsedData[fieldname] = value;
//         }
//       });

//       busboy.on(
//         "file",
//         async (fieldname: string, fileStream: any, fileInfo: any) => {
//           if (!["coverPhoto", "videos"].includes(fieldname)) {
//             fileStream.resume();
//             return;
//           }

//           const { filename, mimeType } = fileInfo;

//           // Validate file type with fallback for extension
//           const isImage =
//             (mimeType.startsWith("image/") ||
//               /\.(png|jpg|jpeg|gif)$/i.test(filename)) &&
//             fieldname === "coverPhoto";
//           const isVideo =
//             mimeType.startsWith("video/") && fieldname === "videos";

//           // if (!isImage && !isVideo) {
//           //   fileStream.resume();
//           //   return reject({
//           //     success: false,
//           //     message: `Invalid file type. Expected image for coverPhoto or video for videos, got ${mimeType}`,
//           //     code: httpStatusCode.BAD_REQUEST,
//           //   });
//           // }

//           // Create readable stream
//           const readableStream = new Readable();
//           readableStream._read = () => {};

//           fileStream.on("data", (chunk: any) => {
//             readableStream.push(chunk);
//           });

//           fileStream.on("end", () => {
//             readableStream.push(null);
//           });

//           // Upload to S3 and track which field it belongs to
//           const uploadPromise = uploadStreamToS3Service(
//             readableStream,
//             filename,
//             mimeType,
//             parsedData.title || `event_${customAlphabet("0123456789", 5)()}`
//           ).catch((err) => {
//             throw err;
//           });

//           uploadPromises.push({ promise: uploadPromise, fieldname });
//         }
//       );

//       busboy.on("finish", async () => {
//         try {
//           // Wait for file uploads
//           if (uploadPromises.length > 0) {
//             const uploadResults = await Promise.all(
//               uploadPromises.map((item) => item.promise)
//             );

//             // Process uploads based on their fieldname
//             uploadResults.forEach((url, index) => {
//               const fieldname = uploadPromises[index].fieldname;
//               if (fieldname === "coverPhoto") {
//                 coverPhoto = url;
//               } else if (fieldname === "videos") {
//                 videos.push(url);
//               }
//             });
//           } else {
//           }

//           // Check if we have a coverPhoto from either upload or form field
//           const finalCoverPhoto = coverPhoto || parsedData.coverPhoto;
//           if (!finalCoverPhoto) {
//             return reject({
//               success: false,
//               message:
//                 "Cover photo is required but was not provided or failed to upload. Please ensure you're sending a file with fieldname 'coverPhoto'",
//               code: httpStatusCode.BAD_REQUEST,
//             });
//           }

//           // Proceed with event creation
//           resolve(
//             await processEventCreation(
//               parsedData,
//               creatorId,
//               coverPhoto,
//               videos,
//               res
//             )
//           );
//         } catch (error) {
//           console.error("Upload error:", error);
//           reject({
//             success: false,
//             message:
//               (error instanceof Error ? error.message : String(error)) ||
//               "Failed to upload files",
//             code: httpStatusCode.INTERNAL_SERVER_ERROR,
//           });
//         }
//       });

//       busboy.on("error", (error: any) => {
//         console.error("Busboy error:", error);
//         reject({
//           success: false,
//           message: error.message || "Error processing file uploads",
//           code: httpStatusCode.INTERNAL_SERVER_ERROR,
//         });
//       });

//       req.pipe(busboy);
//     });
//   } else {
//     // Handle JSON request
//     return processEventCreation(req.body, creatorId, null, [], res);
//   }
// };

// Process event creation logic

export const createEventService = async (req: Request, res: Response) => {
  if (!req.user) {
    return errorResponseHandler(
      "Authentication failed while creating event",
      httpStatusCode.UNAUTHORIZED,
      res,
    );
  }

  const { id: creatorId } = req.user as JwtPayload;

  // Expect JSON body only
  const { coverPhoto, videos } = req.body;

  // Validate cover photo URL
  if (!coverPhoto || typeof coverPhoto !== "string") {
    return errorResponseHandler(
      "Cover photo URL is required",
      httpStatusCode.BAD_REQUEST,
      res,
    );
  }

  // Validate videos (optional)
  if (
    videos &&
    (!Array.isArray(videos) || !videos.every((v) => typeof v === "string"))
  ) {
    return errorResponseHandler(
      "Videos must be an array of URL strings",
      httpStatusCode.BAD_REQUEST,
      res,
    );
  }

  // Proceed with existing event creation logic
  return processEventCreation(
    req.body,
    creatorId,
    coverPhoto,
    videos || [],
    res,
  );
};

const processEventCreation = async (
  data: any,
  creatorId: string,
  coverPhoto: string | null,
  videos: string[],
  res: Response,
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
    timezone,
  } = data;

  // Validate required fields
  if (
    !title ||
    !date ||
    !startTime ||
    !endTime ||
    !venue ||
    !capacity ||
    isFreeEvent === undefined ||
    !timezone
  ) {
    return errorResponseHandler(
      "Missing required fields (title, date, startTime, endTime, venue, capacity, isFreeEvent, timezone)",
      httpStatusCode.BAD_REQUEST,
      res,
    );
  }

  // Validate tickets array
  if (
    isFreeEvent === "false" &&
    (!tickets || !Array.isArray(tickets) || tickets.length === 0)
  ) {
    return errorResponseHandler(
      "Tickets are required for creating an event with paid entry",
      httpStatusCode.BAD_REQUEST,
      res,
    );
  }

  // Validate capacity and total ticket quantity
  if (capacity <= 0) {
    return errorResponseHandler(
      "Capacity must be a positive number",
      httpStatusCode.BAD_REQUEST,
      res,
    );
  }

  if (isFreeEvent === "false") {
    const totalTicketQuantity = tickets.reduce(
      (sum: number, ticket: any) => sum + (ticket.quantity || 0),
      0,
    );
    if (totalTicketQuantity > capacity) {
      return errorResponseHandler(
        `Total ticket quantity (${totalTicketQuantity}) exceeds event capacity (${capacity})`,
        httpStatusCode.BAD_REQUEST,
        res,
      );
    }
  }

  // Validate invited guests for private events
  if (eventVisibility === EventVisibility.PRIVATE) {
    if (
      !invitedGuests ||
      !Array.isArray(invitedGuests) ||
      invitedGuests.length === 0
    ) {
      return errorResponseHandler(
        "Private events must have at least one invited guest",
        httpStatusCode.BAD_REQUEST,
        res,
      );
    }

    const invalidIds = invitedGuests.filter(
      (id: string) => !isValidObjectId(id),
    );
    if (invalidIds.length > 0) {
      return errorResponseHandler(
        `Invalid MongoDB ObjectID(s) in invitedGuests: ${invalidIds.join(
          ", ",
        )}`,
        httpStatusCode.BAD_REQUEST,
        res,
      );
    }
  }

  // Validate lineup
  if (lineup && Array.isArray(lineup) && lineup.length > 0) {
    const invalidLineupIds = lineup.filter(
      (id: string) => !isValidObjectId(id),
    );
    if (invalidLineupIds.length > 0) {
      return errorResponseHandler(
        `Invalid MongoDB ObjectID(s) in lineup: ${invalidLineupIds.join(", ")}`,
        httpStatusCode.BAD_REQUEST,
        res,
      );
    }

    const existingProfiles = await ProfessionalProfileModel.find({
      _id: { $in: lineup },
    })
      .select("_id")
      .lean();
    if (existingProfiles.length !== lineup.length) {
      const missingIds = lineup.filter(
        (id: string) =>
          !existingProfiles.some(
            (profile: any) => profile._id.toString() === id,
          ),
      );
      return errorResponseHandler(
        `Professional profile(s) not found for ID(s): ${missingIds.join(", ")}`,
        httpStatusCode.BAD_REQUEST,
        res,
      );
    }
  }

  // Validate coHosts
  if (coHosts && Array.isArray(coHosts) && coHosts.length > 0) {
    const invalidCoHostIds = coHosts.filter(
      (id: string) => !isValidObjectId(id),
    );
    if (invalidCoHostIds.length > 0) {
      return errorResponseHandler(
        `Invalid MongoDB ObjectID(s) in coHosts: ${invalidCoHostIds.join(
          ", ",
        )}`,
        httpStatusCode.BAD_REQUEST,
        res,
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
        res,
      );
    }
  }
  // --- Combine date + startTime into a UTC Date object ---
  const localDateTimeString = `${date}T${startTime}:00`; // e.g., "2025-10-30T18:30:00"
  const eventDateTime = new Date(localDateTimeString);

  if (isNaN(eventDateTime.getTime())) {
    return errorResponseHandler(
      "Invalid date or startTime format",
      httpStatusCode.BAD_REQUEST,
      res,
    );
  }
  const result = convertToUTCAndLocal(date, startTime, timezone);
  // const userTimezoneOffset = getTimezoneOffset(timezone, eventDateTime);

  // const utcDateTime = new Date(
  //   eventDateTime.getTime() - userTimezoneOffset * 60000
  // );

  // // Store both for reference
  // const localDateTime = eventDateTime;

  // Create the event
  const newEvent = new eventModel({
    creator: creatorId,
    title,
    aboutEvent: aboutEvent || "",
    date,
    startTime,
    endTime,
    utcDateTime: result.utcDateTime,
    localDateTime: eventDateTime,
    timezone,
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
  if (isFreeEvent === "false") {
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

  // Send notifications to invited guests and co-hosts (non-blocking)
  sendEventNotifications(
    savedEvent._id.toString(),
    creatorId,
    invitedGuests || [],
    coHosts || [],
    title,
  ).catch((err) => console.error("Error in event notifications:", err));

  return {
    success: true,
    message: "Event and tickets created successfully",
    data: {
      event: savedEvent,
      tickets: createdTickets,
    },
  };
};

export const getUserEventFeedService = async (req: any, res: Response) => {
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
    filterApplied = false,
  } = req.body;

  const now = new Date();
  const baseDate = new Date();
  baseDate.setHours(0, 0, 0, 0);

  const userObjectId = new mongoose.Types.ObjectId(userId);

  // Helper function to add engagement data lookups
  const addEngagementLookups = () => [
    {
      $lookup: {
        from: "likes",
        let: { eventId: "$_id" },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ["$target", "$$eventId"] },
                  { $eq: ["$targetType", "event"] },
                ],
              },
            },
          },
        ],
        as: "likes",
      },
    },
    {
      $lookup: {
        from: "comments",
        localField: "_id",
        foreignField: "event",
        as: "comments",
      },
    },
    {
      $lookup: {
        from: "likes",
        let: { eventId: "$_id" },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ["$target", "$$eventId"] },
                  { $eq: ["$targetType", "event"] },
                  { $eq: ["$user", userObjectId] },
                ],
              },
            },
          },
        ],
        as: "userLike",
      },
    },
  ];

  // Helper function to add engagement calculated fields
  const addEngagementFields = () => ({
    likeCount: { $size: "$likes" },
    commentCount: { $size: "$comments" },
    isLikedByCurrentUser: { $gt: [{ $size: "$userLike" }, 0] },
  });

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
          pipeline: [{ $project: { userName: 1, photos: 1 } }],
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "invitedGuests",
          foreignField: "_id",
          as: "invitedGuests",
          pipeline: [{ $project: { userName: 1 } }],
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "coHosts",
          foreignField: "_id",
          as: "coHosts",
          pipeline: [{ $project: { userName: 1, photos: 1 } }],
        },
      },
      {
        $lookup: {
          from: "professionalProfiles",
          localField: "lineup",
          foreignField: "_id",
          as: "lineup",
        },
      },
      {
        $lookup: {
          from: "tickets",
          localField: "_id",
          foreignField: "event",
          as: "tickets",
        },
      },
      ...addEngagementLookups(),
      { $unwind: { path: "$creator", preserveNullAndEmptyArrays: true } },
      {
        $addFields: {
          ...addEngagementFields(),
        },
      },
      {
        $project: {
          likes: 0,
          comments: 0,
          userLike: 0,
        },
      },
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
  const buildLocationPipeline = (
    lat?: number,
    lng?: number,
    maxDistance?: number,
  ) => {
    if (lat === undefined || lng === undefined || maxDistance === undefined) {
      return [];
    }

    return [
      {
        $geoNear: {
          near: {
            type: "Point",
            coordinates: [lng, lat],
          },
          distanceField: "distance",
          maxDistance: maxDistance * 1000, // Convert km to meters
          spherical: true,
        },
      },
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
        $lte: maxPrice,
      };
    }

    return [
      {
        $lookup: {
          from: "tickets",
          localField: "_id",
          foreignField: "event",
          as: "tickets",
        },
      },
      {
        $match: {
          $or: [
            { tickets: { $size: 0 } }, // No tickets (free event)
            priceMatch,
          ],
        },
      },
    ];
  };

  // Enhanced pipeline builder with distance calculation and engagement data
  const buildEventPipelineWithDistance = (
    matchQuery: any,
    userLocation?: any,
    includeSpotsLeft: boolean = false,
  ) => {
    const pipeline: any[] = [];

    // Add distance calculation if user has location
    if (
      userLocation &&
      userLocation.coordinates &&
      userLocation.coordinates.length === 2
    ) {
      const [userLng, userLat] = userLocation.coordinates;
      // Use $geoNear as first stage (requires 2dsphere index on location field)
      pipeline.push({
        $geoNear: {
          near: {
            type: "Point",
            coordinates: [userLng, userLat],
          },
          distanceField: "distance",
          spherical: true,
          query: matchQuery,
        },
      });
    } else {
      pipeline.push({ $match: matchQuery });
    }

    // Add location filter if specified and not using geoNear with user location
    if (
      (!userLocation ||
        !userLocation.coordinates ||
        userLocation.coordinates.length !== 2) &&
      lat &&
      lng &&
      maxDistance
    ) {
      const locationPipeline = buildLocationPipeline(lat, lng, maxDistance);
      if (locationPipeline.length) {
        pipeline.splice(-1, 1, ...locationPipeline, { $match: matchQuery });
      }
    }

    // Add price filter
    const pricePipeline = buildPricePipeline(minPrice, maxPrice);
    if (pricePipeline.length) {
      pipeline.push(...pricePipeline);
    }

    // Add population lookups
    pipeline.push(
      {
        $lookup: {
          from: "users",
          localField: "creator",
          foreignField: "_id",
          as: "creator",
          pipeline: [{ $project: { userName: 1, photos: 1 } }],
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "invitedGuests",
          foreignField: "_id",
          as: "invitedGuests",
          pipeline: [{ $project: { userName: 1 } }],
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "coHosts",
          foreignField: "_id",
          as: "coHosts",
          pipeline: [{ $project: { userName: 1, photos: 1 } }],
        },
      },
      {
        $lookup: {
          from: "professionalProfiles",
          localField: "lineup",
          foreignField: "_id",
          as: "lineup",
        },
      },
    );

    // Add tickets lookup if not already added
    if (!pricePipeline.length) {
      pipeline.push({
        $lookup: {
          from: "tickets",
          localField: "_id",
          foreignField: "event",
          as: "tickets",
        },
      });
    }

    // Add purchases lookup and spots calculation if needed
    if (includeSpotsLeft) {
      pipeline.push({
        $lookup: {
          from: "purchases",
          localField: "_id",
          foreignField: "event",
          as: "purchases",
        },
      });
    }

    // Add engagement data lookups
    pipeline.push(...addEngagementLookups());

    pipeline.push({
      $unwind: { path: "$creator", preserveNullAndEmptyArrays: true },
    });

    // Add calculated fields
    const addFields: any = {
      ...addEngagementFields(),
    };

    // Add distance calculation
    addFields.distanceKm = {
      $cond: {
        if: { $ifNull: ["$distance", false] },
        then: { $round: [{ $divide: ["$distance", 1000] }, 2] },
        else: null,
      },
    };

    // Add spots left calculation if needed
    if (includeSpotsLeft) {
      addFields.totalSold = { $sum: "$purchases.quantity" };
      addFields.spotsLeft = {
        $subtract: ["$capacity", { $sum: "$purchases.quantity" }],
      };
    }

    pipeline.push({ $addFields: addFields });

    // Remove temporary fields
    pipeline.push({
      $project: {
        likes: 0,
        comments: 0,
        userLike: 0,
      },
    });

    return pipeline;
  };

  // Main aggregation pipeline builder with engagement data
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
          pipeline: [{ $project: { userName: 1, photos: 1 } }],
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "invitedGuests",
          foreignField: "_id",
          as: "invitedGuests",
          pipeline: [{ $project: { userName: 1 } }],
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "coHosts",
          foreignField: "_id",
          as: "coHosts",
          pipeline: [{ $project: { userName: 1, photos: 1 } }],
        },
      },
      {
        $lookup: {
          from: "professionalProfiles",
          localField: "lineup",
          foreignField: "_id",
          as: "lineup",
        },
      },
      {
        $lookup: {
          from: "tickets",
          localField: "_id",
          foreignField: "event",
          as: "tickets",
        },
      },
    );

    // Add engagement data lookups
    pipeline.push(...addEngagementLookups());

    pipeline.push(
      { $unwind: { path: "$creator", preserveNullAndEmptyArrays: true } },
      {
        $addFields: {
          ...addEngagementFields(),
        },
      },
      {
        $project: {
          likes: 0,
          comments: 0,
          userLike: 0,
        },
      },
      { $sort: { date: 1 } },
    );

    return pipeline;
  };

  // Special pipeline builder for today's events with distance, spots left, and engagement
  const buildTodayEventPipeline = (matchQuery: any, userLocation?: any) => {
    const pipeline: any[] = [];

    // Add distance calculation if user has saved location
    if (
      userLocation &&
      userLocation.coordinates &&
      userLocation.coordinates.length === 2
    ) {
      const [userLng, userLat] = userLocation.coordinates;
      // Use $geoNear as first stage (requires 2dsphere index on location field)
      pipeline.push({
        $geoNear: {
          near: {
            type: "Point",
            coordinates: [userLng, userLat],
          },
          distanceField: "distance",
          spherical: true,
          query: matchQuery,
        },
      });
    } else {
      pipeline.push({ $match: matchQuery });
    }

    // Add price filter if specified (only if not using geoNear)
    if (
      !userLocation ||
      !userLocation.coordinates ||
      userLocation.coordinates.length !== 2
    ) {
      const pricePipeline = buildPricePipeline(minPrice, maxPrice);
      pipeline.push(...pricePipeline);
    } else {
      // Handle price filter manually when using geoNear
      if (minPrice !== undefined || maxPrice !== undefined) {
        pipeline.push({
          $lookup: {
            from: "tickets",
            localField: "_id",
            foreignField: "event",
            as: "tickets",
          },
        });

        const priceMatch: any = {};
        if (minPrice !== undefined) {
          priceMatch["tickets.price"] = { $gte: minPrice };
        }
        if (maxPrice !== undefined) {
          priceMatch["tickets.price"] = {
            ...priceMatch["tickets.price"],
            $lte: maxPrice,
          };
        }

        pipeline.push({
          $match: {
            $or: [
              { tickets: { $size: 0 } }, // No tickets (free event)
              priceMatch,
            ],
          },
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
          pipeline: [{ $project: { userName: 1, photos: 1 } }],
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "invitedGuests",
          foreignField: "_id",
          as: "invitedGuests",
          pipeline: [{ $project: { userName: 1 } }],
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "coHosts",
          foreignField: "_id",
          as: "coHosts",
          pipeline: [{ $project: { userName: 1, photos: 1 } }],
        },
      },
      {
        $lookup: {
          from: "professionalProfiles",
          localField: "lineup",
          foreignField: "_id",
          as: "lineup",
        },
      },
    );

    // Add tickets lookup only if not already added for price filtering
    if (
      !userLocation ||
      !userLocation.coordinates ||
      userLocation.coordinates.length !== 2 ||
      (minPrice === undefined && maxPrice === undefined)
    ) {
      pipeline.push({
        $lookup: {
          from: "tickets",
          localField: "_id",
          foreignField: "event",
          as: "tickets",
        },
      });
    }

    pipeline.push({
      $lookup: {
        from: "purchases",
        localField: "_id",
        foreignField: "event",
        as: "purchases",
      },
    });

    // Add engagement data lookups
    pipeline.push(...addEngagementLookups());

    pipeline.push(
      { $unwind: { path: "$creator", preserveNullAndEmptyArrays: true } },
      {
        $addFields: {
          totalSold: {
            $sum: "$purchases.quantity",
          },
          spotsLeft: {
            $subtract: ["$capacity", { $sum: "$purchases.quantity" }],
          },
          distanceKm: {
            $cond: {
              if: { $ifNull: ["$distance", false] },
              then: { $round: [{ $divide: ["$distance", 1000] }, 2] },
              else: null,
            },
          },
          ...addEngagementFields(),
        },
      },
      {
        $project: {
          likes: 0,
          comments: 0,
          userLike: 0,
        },
      },
      { $sort: { date: 1 } },
    );

    return pipeline;
  };

  // Get user data for location
  const user = await usersModel.findById(userId).lean();
  if (!user) return { success: false, message: "User not found" };

  // Handle different feed types
  if (type === "discover") {
    if (filterApplied) {
      const filterQuery = buildFilterQuery({ date: { $gte: baseDate } });
      const pipeline: any = buildEventPipeline(filterQuery);
      const events = await eventModel.aggregate(pipeline);

      return {
        success: true,
        message: "Discover feed fetched successfully",
        data: events,
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

    // Today's events query
    const startToday = new Date();
    startToday.setHours(0, 0, 0, 0);
    const endToday = new Date();
    endToday.setHours(23, 59, 59, 999);
    const todayQuery = buildFilterQuery({
      date: { $gte: startToday, $lte: endToday },
    });

    // Trending events with optimized aggregation and engagement data
    const trendingPipeline = [
      {
        $group: {
          _id: "$event",
          purchaseCount: { $sum: "$quantity" },
        },
      },
      { $sort: { purchaseCount: -1 } },
      { $limit: 50 }, // Limit trending events
      {
        $lookup: {
          from: "events",
          localField: "_id",
          foreignField: "_id",
          as: "eventDetails",
        },
      },
      { $unwind: "$eventDetails" },
      { $replaceRoot: { newRoot: "$eventDetails" } },
      { $match: buildFilterQuery({ date: { $gte: baseDate } }) },
    ];

    // Add location and price filters to trending
    const locationPipeline = buildLocationPipeline(lat, lng, maxDistance);
    const pricePipeline = buildPricePipeline(minPrice, maxPrice);

    if (locationPipeline.length || pricePipeline.length) {
      trendingPipeline.push(...locationPipeline, ...pricePipeline);
    }

    // Add population and engagement to trending
    trendingPipeline.push(
      {
        $lookup: {
          from: "users",
          localField: "creator",
          foreignField: "_id",
          as: "creator",
          pipeline: [{ $project: { userName: 1, photos: 1 } }],
        },
      },
      {
        $lookup: {
          from: "tickets",
          localField: "_id",
          foreignField: "event",
          as: "tickets",
        },
      },
      ...addEngagementLookups(),
      { $unwind: { path: "$creator", preserveNullAndEmptyArrays: true } },
      {
        $addFields: {
          ...addEngagementFields(),
        },
      },
      {
        $project: {
          likes: 0,
          comments: 0,
          userLike: 0,
        },
      },
    );

    // Execute all queries in parallel
    const [foryouEvents, todayEvents, trendingEvents] = await Promise.all([
      eventModel.aggregate(buildEventPipeline(forYouQuery)),
      eventModel.aggregate(buildTodayEventPipeline(todayQuery, user.location)),
      purchaseModel.aggregate(trendingPipeline),
    ]);

    return {
      success: true,
      message: "Discover feed fetched successfully",
      data: {
        foryouEvents,
        todayEvents,
        trendingEvents,
      },
    };
  }

  // Updated queries for other types with distance calculation and engagement
  if (type === "myEvents") {
    const pipeline = buildEventPipelineWithDistance(
      { creator: userObjectId },
      user.location,
    );
    pipeline.push({ $sort: { date: 1 } });
    const events = await eventModel.aggregate(pipeline);

    return {
      success: true,
      message: "My events fetched successfully",
      data: {
        events,
        totalCount: events.length,
      },
    };
  }

  if (type === "past") {
    const pipeline = buildEventPipelineWithDistance(
      {
        creator: userObjectId,
        date: { $lt: baseDate },
      },
      user.location,
    );
    pipeline.push({ $sort: { date: -1 } }); // Sort descending for past events

    const events = await eventModel.aggregate(pipeline);

    return {
      success: true,
      message: "Past events fetched successfully",
      data: {
        events,
        totalCount: events.length,
      },
    };
  }

  if (type === "upcoming") {
    const pipeline = buildEventPipelineWithDistance(
      {
        creator: userObjectId,
        date: { $gte: baseDate },
      },
      user.location,
      true,
    ); // Include spots left for upcoming events
    pipeline.push({ $sort: { date: 1 } });

    const events = await eventModel.aggregate(pipeline);

    return {
      success: true,
      message: "Upcoming events fetched successfully",
      data: {
        events,
        totalCount: events.length,
      },
    };
  }

  return { success: false, message: "Invalid type parameter" };
};

export const getEventOfOtherUserService = async (req: any, res: Response) => {
  const { id: userId } = req.params;

  if (!isValidObjectId(userId)) {
    return errorResponseHandler(
      "Invalid user ID",
      httpStatusCode.BAD_REQUEST,
      res,
    );
  }

  const events = await eventModel
    .find({ creator: userId })
    .populate("creator", "userName")
    .populate("invitedGuests", "userName")
    .populate("coHosts", "userName")
    .populate("lineup")
    .sort({ createdAt: -1 });

  if (events.length === 0) {
    return errorResponseHandler(
      "No events found for this user",
      httpStatusCode.NOT_FOUND,
      res,
    );
  }

  return {
    success: true,
    message: "Events retrieved successfully",
    data: events,
  };
};

export const getUserEventsService = async (req: any, res: Response) => {
  if (!req.user) {
    return errorResponseHandler(
      "Authentication failed",
      httpStatusCode.UNAUTHORIZED,
      res,
    );
  }

  const { id: userId } = req.user;

  const events = await eventModel
    .find({ creator: userId })
    .populate("creator", "userName photos")
    .populate("invitedGuests", "userName photos")
    .populate("coHosts", "userName photos")
    .populate("lineup", "userName photos")
    .sort({ createdAt: -1 });

  if (events.length === 0) {
    return errorResponseHandler(
      "No events found for this user",
      httpStatusCode.NOT_FOUND,
      res,
    );
  }

  return {
    success: true,
    message: "Events retrieved successfully",
    data: events,
  };
};

export const getEventsByIdService = async (req: any, res: Response) => {
  const eventId = req.params.id;
  const currentUserId = req.user?.id || req.user?._id; // Assuming user is available in req.user

  // Get the main event with populated fields
  const event = await eventModel
    .findById(eventId)
    .populate("creator", "userName photos")
    .populate("invitedGuests", "userName")
    .populate("coHosts", "userName photos")
    .populate("lineup");

  if (!event) {
    return errorResponseHandler(
      "Event not found",
      httpStatusCode.NOT_FOUND,
      res,
    );
  }

  //   if (event.creator._id.toString() !== currentUserId.toString()) {
  //    await eventModel.updateOne(
  //   {
  //     _id: eventId,
  //     "viewers.user": { $ne: currentUserId },
  //   },
  //   {
  //     $push: {
  //       viewers: {
  //         user: currentUserId,
  //         viewedAt: new Date(),
  //       },
  //     },
  //   }
  // );

  //   }

  const viewDate = getStartOfDayUTC();

  if (event.creator._id.toString() !== currentUserId.toString()) {
    await EventViewerModel.updateOne(
      {
        event: eventId,
        user: currentUserId,
        viewDate,
      },
      {
        $setOnInsert: {
          firstViewedAt: new Date(),
        },
        $set: {
          lastViewedAt: new Date(),
        },
        $inc: {
          viewCount: 1,
        },
      },
      {
        upsert: true,
      },
    );
  }

  // Get tickets for this event
  const tickets = await ticketModel
    .find({ event: event._id })
    .populate("event");

  // Get purchase data for this event to calculate tickets sold
  const purchases = await purchaseModel.find({ event: event._id });
  const totalTicketsSold = purchases.reduce(
    (sum, purchase) => sum + (purchase.quantity || 0),
    0,
  );

  // Get like count, comment count, and user's like status
  const [likeCount, commentCount, userLike] = await Promise.all([
    LikeModel.countDocuments({ targetType: "event", target: eventId }),
    Comment.countDocuments({ event: eventId }),
    currentUserId
      ? LikeModel.findOne({
          user: currentUserId,
          targetType: "event",
          target: eventId,
        })
      : null,
  ]);

  const isLikedByCurrentUser = !!userLike;

  // Get creator statistics
  const creatorStats = await Promise.all([
    // Total events hosted by creator
    eventModel.countDocuments({ creator: event.creator._id }),
    // Total tickets sold across all creator's events
    eventModel.aggregate([
      { $match: { creator: event.creator._id } },
      {
        $lookup: {
          from: "purchases",
          localField: "_id",
          foreignField: "event",
          as: "purchases",
        },
      },
      {
        $group: {
          _id: null,
          totalTicketsSold: { $sum: { $sum: "$purchases.quantity" } },
        },
      },
    ]),
  ]);

  const creatorTotalEvents = creatorStats[0];
  const creatorTotalTicketsSold = creatorStats[1][0]?.totalTicketsSold || 0;

  // Get coHosts statistics
  const coHostsStats = await Promise.all(
    event.coHosts.map(async (coHost: any) => {
      const [totalEvents, ticketsSoldData] = await Promise.all([
        // Total events created by this coHost
        eventModel.countDocuments({ creator: coHost._id }),
        // Total tickets sold across all coHost's events
        eventModel.aggregate([
          { $match: { creator: coHost._id } },
          {
            $lookup: {
              from: "purchases",
              localField: "_id",
              foreignField: "event",
              as: "purchases",
            },
          },
          {
            $group: {
              _id: null,
              totalTicketsSold: { $sum: { $sum: "$purchases.quantity" } },
            },
          },
        ]),
      ]);

      return {
        coHost: {
          _id: coHost._id,
          userName: coHost.userName,
          photos: coHost.photos,
        },
        totalEventsCreated: totalEvents,
        totalTicketsSold: ticketsSoldData[0]?.totalTicketsSold || 0,
      };
    }),
  );

  // Add sold flag and remaining quantity to tickets
  const ticketsWithSoldInfo = await Promise.all(
    tickets.map(async (ticket) => {
      // Get purchases for this specific ticket
      const ticketPurchases = purchases.filter(
        (purchase) =>
          purchase.ticket &&
          purchase.ticket.toString() === ticket._id.toString(),
      );

      const soldQuantity = ticketPurchases.reduce(
        (sum, purchase) => sum + (purchase.quantity || 0),
        0,
      );
      const remainingQuantity = (ticket.quantity || 0) - soldQuantity;

      return {
        ...ticket.toObject(),
        soldQuantity,
        remainingQuantity,
        isSoldOut: remainingQuantity <= 0,
        hasSales: soldQuantity > 0,
      };
    }),
  );

  // Calculate event capacity and spots left
  const totalCapacity = event.capacity || 0;
  const spotsLeft = Math.max(0, totalCapacity - totalTicketsSold);

  return {
    success: true,
    message: "Event and tickets retrieved successfully",
    data: {
      event: {
        ...event.toObject(),
        totalTicketsSold,
        spotsLeft,
        capacityUtilization:
          totalCapacity > 0
            ? ((totalTicketsSold / totalCapacity) * 100).toFixed(2)
            : 0,
        likeCount,
        commentCount,
        isLikedByCurrentUser,
      },
      tickets: ticketsWithSoldInfo,
      creatorStats: {
        creator: {
          _id: event.creator._id,
          userName: event.creator.userName,
          photos: event.creator.photos,
        },
        totalEventsHosted: creatorTotalEvents,
        totalTicketsSoldAcrossAllEvents: creatorTotalTicketsSold,
      },
      coHostsStats,
      eventSalesStats: {
        totalTicketsSold,
        totalRevenue: purchases.reduce(
          (sum, purchase) => sum + (purchase.totalAmount || 0),
          0,
        ),
        totalPurchases: purchases.length,
        spotsLeft,
        isSoldOut: spotsLeft <= 0,
      },
      engagement: {
        likeCount,
        commentCount,
        isLikedByCurrentUser,
      },
    },
  };
};

export const getEventAnalyticsService = async (req: any, res: Response) => {
  try {
    const eventId = req.params.id;
    const { timeFilter = "week" } = req.query;

    if (!isValidObjectId(eventId)) {
      return errorResponseHandler(
        "Invalid event ID",
        httpStatusCode.BAD_REQUEST,
        res,
      );
    }

    const event = await eventModel.findById(eventId).lean();
    if (!event) {
      return errorResponseHandler(
        "Event not found",
        httpStatusCode.NOT_FOUND,
        res,
      );
    }

    const { start: startDate, end: endDate } = getDateRange(timeFilter);
    const ObjectId = mongoose.Types.ObjectId;
    const eventObjectId = new mongoose.Types.ObjectId(eventId);

    // =====================================================
    // TICKET BREAKDOWN (ALL tickets, even zero sales)
    // =====================================================
    const ticketSalesAgg = await ticketModel.aggregate([
      {
        $match: {
          event: eventObjectId,
        },
      },
      {
        $lookup: {
          from: "purchases",
          let: { ticketId: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$ticket", "$$ticketId"] },
                    { $eq: ["$event", eventObjectId] },
                    { $eq: ["$purchaseType", "purchase"] },
                    { $not: [{ $in: ["$status", ["pending", "refunded"]] }] },
                    { $gte: ["$purchaseDate", startDate] },
                    { $lte: ["$purchaseDate", endDate] },
                  ],
                },
              },
            },
            {
              $group: {
                _id: null,
                ticketsSold: { $sum: "$quantity" },
                revenue: { $sum: "$totalPrice" },
              },
            },
          ],
          as: "sales",
        },
      },
      {
        $unwind: {
          path: "$sales",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $project: {
          ticketName: "$name",
          price: 1,
          totalQuantity: "$quantity",
          ticketsSold: { $ifNull: ["$sales.ticketsSold", 0] },
          revenue: { $ifNull: ["$sales.revenue", 0] },
        },
      },
    ]);

    const ticketBreakdown = ticketSalesAgg.map((t) => ({
      ticketName: t.ticketName,
      price: t.price,
      ticketsSold: t.ticketsSold,
      revenue: t.revenue,
      remaining: Math.max(0, t.totalQuantity - t.ticketsSold),
    }));

    const totalTicketsSold = ticketSalesAgg.reduce(
      (sum, t) => sum + t.ticketsSold,
      0,
    );

    const totalRevenue = ticketSalesAgg.reduce((sum, t) => sum + t.revenue, 0);

    const totalTickets = ticketSalesAgg.reduce(
      (sum, t) => sum + t.totalQuantity,
      0,
    );

    // =====================================================
    // REVENUE CHART (Daily)
    // =====================================================
    const revenueChartData = await purchaseModel.aggregate([
      {
        $match: {
          event: eventObjectId,
          status: { $nin: ["pending", "refunded"] },
          purchaseType: "purchase",
          purchaseDate: { $gte: startDate, $lte: endDate },
        },
      },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$purchaseDate" },
          },
          revenue: { $sum: "$totalPrice" },
          tickets: { $sum: "$quantity" },
        },
      },
      { $sort: { _id: 1 } },
      {
        $project: {
          date: "$_id",
          revenue: 1,
          tickets: 1,
          _id: 0,
        },
      },
    ]);

    // =====================================================
    // VIEW ANALYTICS
    // =====================================================
    const viewsByDate = await EventViewerModel.aggregate([
      {
        $match: {
          event: eventObjectId,
          viewDate: { $gte: startDate, $lte: endDate },
        },
      },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$viewDate" },
          },
          views: { $sum: "$viewCount" },
        },
      },
      { $sort: { _id: 1 } },
      {
        $project: {
          date: "$_id",
          views: 1,
          _id: 0,
        },
      },
    ]);

    const totalViews = viewsByDate.reduce((sum, d) => sum + d.views, 0);

    const uniqueViewsAgg = await EventViewerModel.aggregate([
      {
        $match: {
          event: eventObjectId,
          viewDate: { $gte: startDate, $lte: endDate },
        },
      },
      { $group: { _id: "$user" } },
      { $count: "count" },
    ]);

    const uniqueViews = uniqueViewsAgg[0]?.count || 0;

    // ============ PROFILE TYPE ANALYTICS ============
    const profileData = await EventViewerModel.aggregate([
      {
        $match: {
          event: eventObjectId,
          viewDate: { $gte: startDate, $lte: endDate },
        },
      },
      {
        // unique users only
        $group: { _id: "$user" },
      },
      {
        $lookup: {
          from: "users",
          localField: "_id",
          foreignField: "_id",
          as: "user",
        },
      },
      { $unwind: "$user" },
      {
        $project: {
          gender: { $ifNull: ["$user.gender", "unknown"] },
          dob: "$user.dob",
        },
      },
      {
        $addFields: {
          age: {
            $cond: [
              { $ifNull: ["$dob", false] },
              {
                $dateDiff: {
                  startDate: "$dob",
                  endDate: new Date(),
                  unit: "year",
                },
              },
              null,
            ],
          },
        },
      },
      {
        $group: {
          _id: "$gender",
          count: { $sum: 1 },
          totalAge: {
            $sum: {
              $cond: [{ $ifNull: ["$age", false] }, "$age", 0],
            },
          },
          ageCount: {
            $sum: {
              $cond: [{ $ifNull: ["$age", false] }, 1, 0],
            },
          },
        },
      },
    ]);

    const maleData = profileData.find((p) => p._id === "male") || {
      count: 0,
      totalAge: 0,
      ageCount: 0,
    };
    const femaleData = profileData.find((p) => p._id === "female") || {
      count: 0,
      totalAge: 0,
      ageCount: 0,
    };

    const totalUsers = maleData.count + femaleData.count;

    const malePercentage =
      totalUsers > 0
        ? Number(((maleData.count / totalUsers) * 100).toFixed(2))
        : 0;

    const femalePercentage =
      totalUsers > 0
        ? Number(((femaleData.count / totalUsers) * 100).toFixed(2))
        : 0;

    const totalAgeSum = maleData.totalAge + femaleData.totalAge;
    const totalAgeCount = maleData.ageCount + femaleData.ageCount;

    const averageAge =
      totalAgeCount > 0 ? Number((totalAgeSum / totalAgeCount).toFixed(1)) : 0;

    // =====================================================
    // ENGAGEMENT
    // =====================================================
    const [likes, comments] = await Promise.all([
      LikeModel.countDocuments({
        targetType: "event",
        target: eventId,
        createdAt: { $gte: startDate, $lte: endDate },
      }),
      Comment.countDocuments({
        event: eventId,
        createdAt: { $gte: startDate, $lte: endDate },
      }),
    ]);

    // =====================================================
    // RESPONSE
    // =====================================================
    return {
      success: true,
      message: "Event analytics fetched successfully",
      data: {
        ticket: {
          ticketsSold: totalTicketsSold,
          remainingTickets: Math.max(0, totalTickets - totalTicketsSold),
          totalSale: totalRevenue,
          revenueChart: revenueChartData,
          ticketBreakdown,
        },
        view: {
          totalViews,
          uniqueViews,
          viewsByDate,
        },
        profileType: {
          male: {
            count: maleData.count,
            percentage: malePercentage,
          },
          female: {
            count: femaleData.count,
            percentage: femalePercentage,
          },
          averageAge,
        },
        engagement: {
          likes,
          comments,
        },
      },
    };
  } catch (error) {
    console.error("Event analytics error:", error);
    return errorResponseHandler(
      "Failed to fetch analytics",
      httpStatusCode.INTERNAL_SERVER_ERROR,
      res,
    );
  }
};

export const updateEventService = async (req: Request, res: Response) => {
  if (!req.user) {
    return errorResponseHandler(
      "Authentication failed",
      httpStatusCode.UNAUTHORIZED,
      res,
    );
  }

  const { id: userId } = req.user as JwtPayload;
  let parsedData: any = {};
  let newCoverPhoto: string | null = null;
  let newVideos: string[] = [];

  // Handle multipart/form-data for file uploads
  if (req.headers["content-type"]?.includes("multipart/form-data")) {
    return new Promise((resolve, reject) => {
      const busboy = Busboy({ headers: req.headers });
      const uploadPromises: Promise<string>[] = [];

      busboy.on("field", (fieldname: string, value: string) => {
        if (
          [
            "location",
            "tickets",
            "lineup",
            "invitedGuests",
            "coHosts",
            "eventPreferences",
          ].includes(fieldname)
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
        } else if (fieldname === "existingCoverPhoto") {
          // Handle existing cover photo that user wants to keep
          parsedData[fieldname] = value;
        } else if (fieldname === "existingVideos") {
          // Handle existing videos that user wants to keep
          try {
            const parsed = JSON.parse(value);
            parsedData[fieldname] = Array.isArray(parsed) ? parsed : [parsed];
          } catch {
            parsedData[fieldname] = value ? [value] : [];
          }
        } else if (fieldname === "mediaToDelete") {
          // Handle media that user wants to delete (can be cover photo or videos)
          try {
            const parsed = JSON.parse(value);
            parsedData[fieldname] = Array.isArray(parsed) ? parsed : [parsed];
          } catch {
            parsedData[fieldname] = value ? [value] : [];
          }
        } else if (fieldname === "deleteCoverPhoto") {
          // Flag to delete current cover photo
          parsedData[fieldname] = value === "true";
        } else {
          parsedData[fieldname] = value;
        }
      });

      busboy.on(
        "file",
        async (fieldname: string, fileStream: any, fileInfo: any) => {
          if (!["coverPhoto", "videos"].includes(fieldname)) {
            fileStream.resume();
            return;
          }

          const { filename, mimeType } = fileInfo;

          // Validate file type
          const isCoverPhoto =
            fieldname === "coverPhoto" && mimeType.startsWith("image/");
          const isVideoOrImageInVideos =
            fieldname === "videos" &&
            (mimeType.startsWith("video/") || mimeType.startsWith("image/"));

          if (!isCoverPhoto && !isVideoOrImageInVideos) {
            fileStream.resume();
            return reject({
              success: false,
              message:
                "Only images allowed for coverPhoto and image/video files allowed for videos",
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
          const uploadPromise: any = uploadStreamToS3Service(
            readableStream,
            filename,
            mimeType,
            parsedData.title || `event_${customAlphabet("0123456789", 5)()}`,
          ).then((url) => ({ url, fieldname })); // Track which field this upload is for

          uploadPromises.push(uploadPromise);
        },
      );

      busboy.on("finish", async () => {
        try {
          // Wait for file uploads
          const uploadedFiles = await Promise.all(uploadPromises);

          // Separate uploaded files by type
          uploadedFiles.forEach(({ url, fieldname }) => {
            if (fieldname === "coverPhoto") {
              newCoverPhoto = url;
            } else if (fieldname === "videos") {
              newVideos.push(url);
            }
          });

          // Proceed with event update
          resolve(
            await processEventUpdate(
              parsedData,
              userId,
              req.params.id,
              newCoverPhoto,
              newVideos,
              res,
            ),
          );
        } catch (error) {
          console.error("Upload error:", error);
          reject({
            success: false,
            message:
              (error instanceof Error ? error.message : String(error)) ||
              "Failed to upload files",
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
  newCoverPhoto: string | null,
  newVideos: string[],
  res: Response,
) => {
  const event = await eventModel.findById(eventId);
  if (!event) {
    return errorResponseHandler(
      "Event not found",
      httpStatusCode.NOT_FOUND,
      res,
    );
  }

  if (event.creator.toString() !== userId) {
    return errorResponseHandler(
      "Not authorized to update this event",
      httpStatusCode.FORBIDDEN,
      res,
    );
  }

  // Check if any tickets have been purchased for this event
  const existingPurchases = await purchaseModel.findOne({
    event: eventId,
    status: { $in: ["active", "used", "transferred", "pending"] },
  });

  if (existingPurchases) {
    return errorResponseHandler(
      "Cannot update event details. Tickets have already been purchased for this event.",
      httpStatusCode.FORBIDDEN,
      res,
    );
  }

  // Validate lineup
  if (data.lineup && Array.isArray(data.lineup)) {
    const invalidLineupIds = data.lineup.filter(
      (id: string) => !isValidObjectId(id),
    );
    if (invalidLineupIds.length > 0) {
      return errorResponseHandler(
        `Invalid MongoDB ObjectID(s) in lineup: ${invalidLineupIds.join(", ")}`,
        httpStatusCode.BAD_REQUEST,
        res,
      );
    }

    const existingProfiles = await ProfessionalProfileModel.find({
      _id: { $in: data.lineup },
    })
      .select("_id")
      .lean();
    if (existingProfiles.length !== data.lineup.length) {
      const missingIds = data.lineup.filter(
        (id: string) =>
          !existingProfiles.some(
            (profile: any) => profile._id.toString() === id,
          ),
      );
      return errorResponseHandler(
        `Professional profile(s) not found for ID(s): ${missingIds.join(", ")}`,
        httpStatusCode.BAD_REQUEST,
        res,
      );
    }
  }

  // Validate coHosts
  if (data.coHosts && Array.isArray(data.coHosts)) {
    const invalidCoHostIds = data.coHosts.filter(
      (id: string) => !isValidObjectId(id),
    );
    if (invalidCoHostIds.length > 0) {
      return errorResponseHandler(
        `Invalid MongoDB ObjectID(s) in coHosts: ${invalidCoHostIds.join(
          ", ",
        )}`,
        httpStatusCode.BAD_REQUEST,
        res,
      );
    }
  }

  // Validate invitedGuests
  if (data.invitedGuests && Array.isArray(data.invitedGuests)) {
    const invalidGuestIds = data.invitedGuests.filter(
      (id: string) => !isValidObjectId(id),
    );
    if (invalidGuestIds.length > 0) {
      return errorResponseHandler(
        `Invalid MongoDB ObjectID(s) in invitedGuests: ${invalidGuestIds.join(
          ", ",
        )}`,
        httpStatusCode.BAD_REQUEST,
        res,
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
        res,
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
    localDateTime: any;
    utcDateTime: any;
    timezone: string;
  }> = {};

  if (data.title) updateData.title = data.title;
  if (data.aboutEvent) updateData.aboutEvent = data.aboutEvent;
  if (data.date) updateData.date = data.date;
  if (data.date || data.startTime) {
    const { date, startTime, timezone } = data;
    const localDateTimeString = `${date}T${startTime}`; // e.g. "2025-10-30T18:30"
    const localDateTime = new Date(localDateTimeString);

    // Validate if date parsing worked
    if (isNaN(localDateTime.getTime())) {
      return errorResponseHandler(
        "Invalid date or startTime format",
        httpStatusCode.BAD_REQUEST,
        res,
      );
    }

    // // Convert to UTC ISO string
    // const utcDateTime = new Date(
    //   localDateTime.getTime() - localDateTime.getTimezoneOffset() * 60000
    // );
    const result = convertToUTCAndLocal(date, startTime, timezone);

    updateData.utcDateTime = result.utcDateTime;
    updateData.localDateTime = localDateTime;
  }
  if (data.startTime) updateData.startTime = data.startTime;
  if (data.endTime) updateData.endTime = data.endTime;
  if (data.venue) updateData.venue = data.venue;
  if (data.capacity) updateData.capacity = data.capacity;
  if (data.eventPreferences)
    updateData.eventPreferences = data.eventPreferences;
  if (data.eventVisibility) updateData.eventVisibility = data.eventVisibility;
  if (data.timezone) updateData.timezone = data.timezone;
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

  // Enhanced media management logic
  let finalCoverPhoto: string | null = null;
  let finalVideos: string[] = [];

  // Get current media from database
  const currentCoverPhoto = event.media?.coverPhoto || null;
  const currentVideos = event.media?.videos || [];

  // Handle media to delete (can include cover photo URL or video URLs)
  const mediaToDelete = Array.isArray(data.mediaToDelete)
    ? data.mediaToDelete
    : data.mediaToDelete && data.mediaToDelete.length > 0
      ? [data.mediaToDelete]
      : [];

  // Handle cover photo
  if (newCoverPhoto) {
    // New cover photo uploaded
    finalCoverPhoto = newCoverPhoto;
  } else if (
    data.deleteCoverPhoto ||
    mediaToDelete.includes(currentCoverPhoto)
  ) {
    // User wants to delete current cover photo
    finalCoverPhoto = null;
  } else if (data.existingCoverPhoto !== undefined) {
    // User explicitly specified which cover photo to keep
    finalCoverPhoto = data.existingCoverPhoto || null;
  } else {
    // Keep current cover photo
    finalCoverPhoto = currentCoverPhoto;
  }

  // Handle videos
  const existingVideosToKeep = Array.isArray(data.existingVideos)
    ? data.existingVideos
    : data.existingVideos && data.existingVideos.length > 0
      ? [data.existingVideos]
      : [];

  if (data.existingVideos !== undefined) {
    // User explicitly specified which videos to keep (filtered to remove deleted ones)
    finalVideos = existingVideosToKeep.filter(
      (videoUrl: string) =>
        !mediaToDelete.includes(videoUrl) && currentVideos.includes(videoUrl),
    );
  } else {
    // If no explicit existing videos list, keep all current videos except those to delete
    finalVideos = currentVideos.filter(
      (videoUrl: string) => !mediaToDelete.includes(videoUrl),
    );
  }

  // Add newly uploaded videos
  finalVideos = [...finalVideos, ...newVideos];

  // Remove duplicates
  finalVideos = [...new Set(finalVideos)];

  // Update media in updateData
  updateData.media = {
    coverPhoto: finalCoverPhoto,
    videos: finalVideos,
  };

  // Optional: Delete removed media from S3 storage
  const mediaItemsToDelete = [];
  if (data.deleteCoverPhoto && currentCoverPhoto) {
    mediaItemsToDelete.push(currentCoverPhoto);
  }
  mediaItemsToDelete.push(...mediaToDelete);

  if (mediaItemsToDelete.length > 0) {
    try {
      // You can implement this function to delete from S3
      // await deleteMediaFromS3Service(mediaItemsToDelete);
    } catch (error) {
      console.error("Error deleting media from S3:", error);
      // Don't fail the entire operation if S3 deletion fails
    }
  }

  const updatedEvent = await eventModel
    .findByIdAndUpdate(
      eventId,
      { $set: updateData },
      { new: true, runValidators: true },
    )
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
    return errorResponseHandler(
      "Authentication failed",
      httpStatusCode.UNAUTHORIZED,
      res,
    );
  }

  const { id: userId } = req.user as JwtPayload;
  const event = await eventModel.findById(req.params.id);

  if (!event) {
    return errorResponseHandler(
      "Event not found",
      httpStatusCode.NOT_FOUND,
      res,
    );
  }

  if (event.creator.toString() !== userId) {
    return errorResponseHandler(
      "Not authorized to delete this event",
      httpStatusCode.FORBIDDEN,
      res,
    );
  }
  const existingPurchases = await purchaseModel.findOne({
    event: req.params.id,
    status: { $in: ["active", "used", "transferred", "pending"] },
  });

  if (existingPurchases) {
    return errorResponseHandler(
      "Cannot delete event. Tickets have already been purchased for this event.",
      httpStatusCode.FORBIDDEN,
      res,
    );
  }

  await eventModel.findByIdAndDelete(req.params.id);
  await ticketModel.deleteMany({ event: req.params.id });

  return {
    success: true,
    message: "Event and associated tickets deleted successfully",
  };
};
export const getPurchaseTicketByIdService = async (req: any, res: Response) => {
  const { purchaseId } = req.params;
  const { id: userId } = req.user as JwtPayload;

  if (!isValidObjectId(purchaseId)) {
    return errorResponseHandler(
      "Invalid purchase ID",
      httpStatusCode.BAD_REQUEST,
      res,
    );
  }

  // Get purchase with populated data
  const purchase = await purchaseModel
    .findById(purchaseId)
    .populate({
      path: "ticket",
      select: "name price benefits quantity",
    })
    .populate({
      path: "event",
      select: "title date startTime endTime venue location capacity media",
      populate: [
        {
          path: "creator",
          select: "userName photos email",
        },
        {
          path: "coHosts",
          select: "userName photos email",
        },
        {
          path: "lineup",
          select: "userName photos",
        },
      ],
    })
    .populate({
      path: "buyer",
      select: "userName photos email",
    })
    .select("-metaData -qrCode")
    .lean();

  if (!purchase) {
    return errorResponseHandler(
      "Purchase not found",
      httpStatusCode.NOT_FOUND,
      res,
    );
  }

  // Check if user is authorized to view this purchase
  const isBuyer = purchase.buyer?._id?.toString() === userId;
  const isCreator = purchase.event.creator?._id?.toString() === userId;
  const isCoHost = purchase.event.coHosts.some(
    (coHost: any) => coHost._id.toString() === userId,
  );

  if (!isBuyer && !isCreator && !isCoHost) {
    return errorResponseHandler(
      "Not authorized to view this purchase",
      httpStatusCode.FORBIDDEN,
      res,
    );
  }

  // Get additional event statistics
  const eventStats = await purchaseModel.aggregate([
    {
      $match: {
        event: new mongoose.Types.ObjectId(purchase.event._id),
        status: { $in: ["active", "used"] },
      },
    },
    {
      $group: {
        _id: null,
        totalTicketsSold: { $sum: "$quantity" },
        totalRevenue: { $sum: "$totalPrice" },
        purchaseCount: { $sum: 1 },
      },
    },
  ]);

  // Get total capacity from event
  const event = await eventModel
    .findById(purchase.event._id)
    .select("capacity");

  // Format response
  const formattedPurchase = {
    ...purchase,
    ticketDetails: {
      ...purchase.ticket,
      soldQuantity: purchase.quantity,
      remainingQuantity: Math.max(0, (purchase.ticket as any).available),
    },
    eventDetails: {
      ...purchase.event,
      stats: {
        totalTicketsSold: eventStats[0]?.totalTicketsSold || 0,
        totalRevenue: eventStats[0]?.totalRevenue || 0,
        purchaseCount: eventStats[0]?.purchaseCount || 0,
        totalCapacity: purchase.event.capacity || 0,
        spotsLeft: Math.max(
          0,
          (purchase.event.capacity || 0) -
            (eventStats[0]?.totalTicketsSold || 0),
        ),
        capacityUtilization:
          purchase.event.capacity > 0
            ? (
                ((eventStats[0]?.totalTicketsSold || 0) /
                  purchase.event.capacity) *
                100
              ).toFixed(2)
            : "0.00",
      },
    },
    buyerInfo: purchase.buyer,
    permissions: {
      canMarkAsUsed: isCreator || isCoHost,
      canTransfer: isBuyer && purchase.status === "active",
      canResell:
        isBuyer &&
        purchase.status === "active" &&
        (purchase.ticket as any).isResellable,
    },
  };
  return {
    success: true,
    message: "Purchase ticket details retrieved successfully",
    data: formattedPurchase,
  };
};
export const updatePurchaseStatusService = async (req: any, res: Response) => {
  const { purchaseId } = req.params;
  const { status, notes } = req.body;
  const { id: userId } = req.user as JwtPayload;

  if (!isValidObjectId(purchaseId)) {
    return errorResponseHandler(
      "Invalid purchase ID",
      httpStatusCode.BAD_REQUEST,
      res,
    );
  }

  // Allowed status updates
  const allowedStatuses = ["used", "active"];

  if (!status || !allowedStatuses.includes(status)) {
    return errorResponseHandler(
      `Status must be one of: ${allowedStatuses.join(", ")}`,
      httpStatusCode.BAD_REQUEST,
      res,
    );
  }

  // Get purchase with event details
  const purchase = await purchaseModel
    .findById(purchaseId)
    .populate({
      path: "event",
      select: "creator coHosts title",
      populate: [
        { path: "creator", select: "_id" },
        { path: "coHosts", select: "_id" },
      ],
    })
    .lean();

  if (!purchase) {
    return errorResponseHandler(
      "Purchase not found",
      httpStatusCode.NOT_FOUND,
      res,
    );
  }

  if (
    purchase.purchaseType !== "purchase" ||
    purchase.status === "refunded" ||
    purchase.status === "transferred"
  ) {
    return errorResponseHandler(
      "This purchase cannot be updated",
      httpStatusCode.BAD_REQUEST,
      res,
    );
  }

  // Check if user is authorized (creator or co-host)
  const isCreator = purchase.event?.creator?._id?.toString() === userId;
  const isCoHost = purchase.event?.coHosts?.some(
    (c: any) => c?._id?.toString() === userId,
  );

  if (!isCreator && !isCoHost) {
    return errorResponseHandler(
      "Only event creator or co-hosts can update purchase status",
      httpStatusCode.FORBIDDEN,
      res,
    );
  }

  // Check if status transition is valid
  const currentStatus = purchase.status;
  const validTransitions: any = {
    active: ["used", "disabled"],
    disabled: ["active"],
    used: [], // FINAL STATE
  };

  if (!validTransitions[purchase.status]?.includes(status)) {
    return errorResponseHandler(
      `Cannot change status from ${purchase.status} to ${status}`,
      httpStatusCode.BAD_REQUEST,
      res,
    );
  }

  // Update purchase status
  const updateData: any = {
    status,
  };

  // Sync isActive with status
  if (status === "disabled") {
    updateData.isActive = false;
  }

  if (status === "active") {
    updateData.isActive = true;
  }

  // Add metadata for status changes
  if (status === "used") {
    updateData.metaData = {
      ...purchase.metaData,
      markedUsedBy: userId,
      markedUsedAt: new Date(),
      notes: notes || "",
    };
  } else if (status === "active" && currentStatus === "used") {
    updateData.metadata = {
      ...purchase.metadata,
      reactivatedBy: userId,
      reactivatedAt: new Date(),
      notes: notes || "",
    };
  }

  const updatedPurchase = await purchaseModel
    .findByIdAndUpdate(
      purchaseId,
      { $set: updateData },
      { new: true, runValidators: true },
    )
    .populate({
      path: "ticket",
      select: "name price",
    })
    .populate({
      path: "event",
      select: "title date startTime",
    })
    .populate({
      path: "buyer",
      select: "userName email",
    });

  // Send push notification to buyer about status change
  if (status === "used") {
    try {
      const buyerUser = await usersModel.findById(purchase.buyer).select(
        "fcmToken",
      );

      if (buyerUser && (buyerUser as any).fcmToken) {
        await sendPushToToken(
          (buyerUser as any).fcmToken,
          "Ticket Marked as Used",
          `Your ticket for "${purchase.event.title}" has been marked as used by the event organizer.`,
          {
            purchaseId: purchaseId.toString(),
            eventId: purchase.event._id.toString(),
            ticketId: (purchase.ticket as any).toString(),
            status: String(status),
            markedBy: userId,
          },
        );
      }
    } catch (notificationError) {
      console.error("Failed to send push notification:", notificationError);
    }
  }

  return {
    success: true,
    message: `Purchase status updated to ${status} successfully`,
    data: {
      purchase: updatedPurchase,
      previousStatus: currentStatus,
      updatedBy: isCreator ? "creator" : "co-host",
      updatedAt: new Date(),
    },
  };
};
