import { Request, Response } from 'express';
import { JwtPayload } from 'jsonwebtoken';
import { httpStatusCode } from 'src/lib/constant';
import { errorResponseHandler } from 'src/lib/errors/error-response-handler';
import { eventModel } from 'src/models/event/event-schema';
import { usersModel } from 'src/models/user/user-schema';

interface LocationQuery {
  longitude: number;
  latitude: number;
  maxDistance?: number; // in kilometers
  minDistance?: number; // in kilometers
}

export const getNearbyUsersService = async (req: Request, res: Response) => {
  const { id: currentUserId } = req.user as JwtPayload;
  const {
    longitude,
    latitude,
    maxDistance = 10, // default 10km
    minDistance = 0
  } = req.query as unknown as LocationQuery;

  if (!longitude || !latitude) {
    return errorResponseHandler(
      'Longitude and latitude are required',
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

  const pipeline = [
    {
      $geoNear: {
        near: {
          type: 'Point',
          coordinates: [parseFloat(longitude.toString()), parseFloat(latitude.toString())]
        },
        distanceField: 'distance', // in meters
        maxDistance: maxDistance * 1000, // convert km to meters
        minDistance: minDistance * 1000,
        spherical: true,
        query: {
          _id: { $ne: currentUserId }, // Exclude current user
          isEmailVerified: true // Only verified users
        }
      }
    },
    {
      $project: {
        _id: 1,
        userName: 1,
        email: 1,
        phoneNumber: 1,
        profilePicture: 1,
        location: 1,
        distance: 1,
        gender: 1,
        interestedIn: 1,
        photos: 1,
        dob: 1
      }
    },
    {
      $addFields: {
        distanceInKm: { $round: [{ $divide: ['$distance', 1000] }, 2] }
      }
    }
  ];

  const nearbyUsers = await usersModel.aggregate(pipeline as any);

  return {
    success: true,
    message: 'Nearby users retrieved successfully',
    data: {
      users: nearbyUsers,
      count: nearbyUsers.length
    }
  };
};

export const getNearbyEventsService = async (req: Request, res: Response) => {
  const {
    longitude,
    latitude,
    maxDistance = 10,
    minDistance = 0
  } = req.query as unknown as LocationQuery;

  if (!longitude || !latitude) {
    return errorResponseHandler(
      'Longitude and latitude are required',
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

  // Add debug logging
  // console.log('Search coordinates:', { longitude, latitude });
  // console.log('Distance range:', { minDistance, maxDistance });

  const pipeline = [
    {
      $geoNear: {
        near: {
          type: 'Point',
          coordinates: [parseFloat(longitude.toString()), parseFloat(latitude.toString())]
        },
        distanceField: 'distance',
        maxDistance: maxDistance * 1000,
        minDistance: minDistance * 1000,
        spherical: true,
        query: {
          date: { $gte: new Date() } // Changed from startDate to date to match schema
        }
      }
    },
    // Debug stage to see what documents pass the geo query
    {
      $addFields: {
        debug_info: {
          original_location: '$location',
          distance_meters: '$distance',
          distance_km: { $divide: ['$distance', 1000] }
        }
      }
    },
    {
      $lookup: {
        from: 'users',
        localField: 'creator',
        foreignField: '_id',
        as: 'creator'
      }
    },
    {
      $unwind: '$creator'
    },
    {
      $project: {
        title: 1,
        aboutEvent: 1, // Added this field
        date: 1,
        startTime: 1, // Added this field
        endTime: 1, // Added this field
        venue: 1, // Added this field
        location: 1,
        distance: 1,
        debug_info: 1, // Keep debug info
        media: 1, // Added this field
        'creator._id': 1,
        'creator.userName': 1,
        'creator.profilePicture': 1,
        eventPreferences: 1, // Added this field
        capacity: 1 // Added this field
      }
    },
    {
      $addFields: {
        distanceInKm: { $round: [{ $divide: ['$distance', 1000] }, 2] }
      }
    },
    {
      $sort: { date: 1 }
    }
  ];

  const nearbyEvents = await eventModel.aggregate(pipeline as any);

  // Add debug logging
  // console.log('Found events count:', nearbyEvents.length);
  if (nearbyEvents.length === 0) {
    // console.log('No events found. Checking total events in database...');
    const totalEvents = await eventModel.countDocuments();
    // console.log('Total events in database:', totalEvents);
  }

  return {
    success: true,
    message: 'Nearby events retrieved successfully',
    data: {
      events: nearbyEvents,
      count: nearbyEvents.length,
      searchParams: {
        coordinates: [longitude, latitude],
        maxDistance,
        minDistance
      }
    }
  };
};

export const updateUserLocationService = async (req: Request, res: Response) => {
  const { id: userId } = req.user as JwtPayload;
  const { longitude, latitude } = req.body;

  if (!longitude || !latitude) {
    return errorResponseHandler(
      'Longitude and latitude are required',
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

  const updatedUser = await usersModel.findByIdAndUpdate(
    userId,
    {
      location: {
        type: 'Point',
        coordinates: [longitude, latitude]
      }
    },
    { new: true }
  ).select('-password -fcmToken');

  if (!updatedUser) {
    return errorResponseHandler(
      'User not found',
      httpStatusCode.NOT_FOUND,
      res
    );
  }

  return {
    success: true,
    message: 'Location updated successfully',
    data: updatedUser
  };
};









