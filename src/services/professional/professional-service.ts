import e from "express";
import mongoose from "mongoose";
import { EventType, httpStatusCode, MusicType, VenueType } from "src/lib/constant";
import { errorResponseHandler } from "src/lib/errors/error-response-handler";
import { ProfessionalProfileModel, ProfileType } from "src/models/professional/professional-schema";
import { usersModel } from "src/models/user/user-schema";

// Interface for ProfessionalProfile (for type safety)
interface ProfessionalProfile {
  user: string;
  Role: string;
  stageName?: string;
  about?: string;
  contactPhoneNumber?: string;
  siretNumber?: string;
  location: {
    type: string;
    coordinates: [number, number];
    address: string;
  };
  photoUrl?: string[];
  videosUrl?: string[];
  packages?: {
    name: string;
    pricePerHour: number;
    details: string;
    isActive: boolean;
  }[];
  preferences: {
    musicTypes: string[];
    eventTypes: string[];
    venueTypes: string[];
  };
  rating: {
    average: number;
    count: number;
  };
}



export const createProfessionalProfileService = async (req:any, res:any) => {
  const { id: user } = req.user;
 
  const {role,stageName,about,contactPhoneNumber,siretNumber,location,photoUrl,videosUrl,packages,preferences,isVerified,isActive,
} = req.body;

  // Validate required fields
  if (!user || !mongoose.Types.ObjectId.isValid(user)) {
    return errorResponseHandler(
      "Valid user ID is required",
      httpStatusCode.BAD_REQUEST,
      res
    )
  }
  if (!role || !Object.values(ProfileType).includes(role)) {
    return errorResponseHandler(
      "Role is required " ,
      httpStatusCode.BAD_REQUEST,
      res
    )
  }
  if (!location?.address) {
    return errorResponseHandler(
      "Location address is required",
      httpStatusCode.BAD_REQUEST,
      res
    )
  }

  // Validate enums in preferences
  if (preferences) {
    if (
      preferences.musicTypes &&
      !preferences.musicTypes.every((type: string) =>
        Object.values(MusicType).includes(type)
      )
    ) {
      return errorResponseHandler(
        "Invalid music type",
        httpStatusCode.BAD_REQUEST,
        res
      )
    }
    if (
      preferences.eventTypes &&
      !preferences.eventTypes.every((type: string) =>
        Object.values(EventType).includes(type)
      )
    ) {
      return errorResponseHandler(
        "Invalid event type",
        httpStatusCode.BAD_REQUEST,
        res
      )
    }
    if (
      preferences.venueTypes &&
      !preferences.venueTypes.every((type: string) =>
        Object.values(VenueType).includes(type)
      )
    ) {
      return errorResponseHandler(
        "Invalid venue type",
        httpStatusCode.BAD_REQUEST,
        res
      )
    }
  }

  // Validate packages
  if (packages) {
    for (const pkg of packages) {
      if (!pkg.name || !pkg.pricePerHour || !pkg.details) {
        return errorResponseHandler(
          "Package name, price per hour, and details are required",
          httpStatusCode.BAD_REQUEST,
          res
        );
      }
      if (pkg.pricePerHour < 0) {
        return errorResponseHandler(
          "Price per hour must be a positive number",
          httpStatusCode.BAD_REQUEST,
          res
        );
      }
    }
  }
  const isUser = await usersModel.findById(user);
  if (!isUser) {
    return errorResponseHandler(
      "User not found",
      httpStatusCode.NOT_FOUND,
      res)
  }

  // Check for existing profile for the user and role
  const existingProfile = await ProfessionalProfileModel.findOne({
    user,
    role,
  });
  if (existingProfile) {
    return errorResponseHandler(
      "Profile already exists for this user and role",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

  // Create new profile
  const profile = new ProfessionalProfileModel({
    user,
    role,
    stageName,
    about,
    contactPhoneNumber,
    siretNumber,
    location: {
      type: "Point",
      coordinates: location.coordinates || [0, 0],
      address: location.address,
    },
    photoUrl: photoUrl || [],
    videosUrl: videosUrl || [],
    packages: packages || [],
    preferences: {
      musicTypes: preferences?.musicTypes || [],
      eventTypes: preferences?.eventTypes || [],
      venueTypes: preferences?.venueTypes || [],
    },
    rating: { average: 0, count: 0 },
    isVerified: isVerified ?? true,
    isActive: isActive ?? true,
  });

  await profile.save();
  return { 
      success: true,
    message: "Profile created successfully",
     profile

   };
}

// export const getAllProfessionalProfilesService = async (req:any, res:any) => {
//   const { role, musicType, eventType, venueType, near } = req.query;

//   // Build query
//   const query: any = {};
//   if (role && Object.values(ProfileType).includes(role as string)) {
//     query.Role = role;
//   }
//   if (musicType && Object.values(MusicType).includes(musicType as string)) {
//     query["preferences.musicTypes"] = musicType;
//   }
//   if (eventType && Object.values(EventType).includes(eventType as string)) {
//     query["preferences.eventTypes"] = eventType;
//   }
//   if (venueType && Object.values(VenueType).includes(venueType as string)) {
//     query["preferences.venueTypes"] = venueType;
//   }

//   // Geospatial query for 'near' (expects lng,lat)
//   if (near) {
//     const coordinates = (near as string).split(",").map(Number);
//     if (coordinates.length !== 2 || coordinates.some(isNaN)) {
//       errorResponseHandler(
//         "Longitude and latitude are required",
//         httpStatusCode.BAD_REQUEST,
//         res
//       );
//     }
//     const [lng, lat] = coordinates;
//     query.location = {
//       $near: {
//         $geometry: {
//           type: "Point",
//           coordinates: [lng, lat],
//         },
//         $maxDistance: 10000, // 10km radius (adjust as needed)
//       },
//     };
//   }

//   const profiles = await ProfessionalProfileModel.find(query).populate(
//     "user",
//     "email firstName lastName"
//   );
//   if (!profiles || profiles.length === 0) {
//     return res.status(httpStatusCode.NOT_FOUND).json({
//       message: "No profiles found",
//     });
//   }
//   return {
//     success: true,
//     message: "Profiles retrieved successfully",
//     profiles,
//   }
// }

export const getProfessionalProfileByIdService = async (req:any, res:any) => {
  const {id} = req.params
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return errorResponseHandler(
      "Invalid profile ID",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

  const profile = await ProfessionalProfileModel.findById(id).populate("user","-token -password -__v -createdAt -updatedAt");
  if (!profile) {
    return errorResponseHandler(
      "Profile not found",
      httpStatusCode.NOT_FOUND,
      res
    );
  }

  return {
    success: true,
    message: "Profile retrieved successfully",
    data:profile,
  };
}

export const getUserAllprofessionalProfilesService = async (req:any, res:any) => {
  const {id} = req.user
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return errorResponseHandler(
      "Invalid profile ID",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }
  const profile  = await ProfessionalProfileModel.find({user:id}).populate("user");
  if (!profile) {
    return errorResponseHandler(
      "Profile not found",
      httpStatusCode.NOT_FOUND,
      res
    );
  }
  return {
    success: true,
    message: "Profile retrieved successfully",
    data:profile,
  };
}

export const getAllProfessionalProfilesService = async (req: any, res: any) => {
  const { id } = req.user;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return errorResponseHandler(
      "Invalid profile ID",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

  const profiles = await ProfessionalProfileModel.find({ user: { $ne: id } }).populate("user");

  if (!profiles || profiles.length === 0) {
    return errorResponseHandler(
      "No professional profiles found",
      httpStatusCode.NOT_FOUND,
      res
    );
  }

  return {
    success: true,
    message: "Profiles retrieved successfully",
    data:profiles,
  };
};

export const updateProfessionalProfileService = async (req:any, res:any) => {
  const { id: user } = req.user;
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return errorResponseHandler(
      "Invalid profile ID",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

  const {
    stageName,
    about,
    contactPhoneNumber,
    siretNumber,
    location,
    photoUrl,
    videosUrl,
    packages,
    preferences
  } = req.body;

  const validUser = await ProfessionalProfileModel.findById(id);
  if (!validUser || validUser.user.toString() !== user) {
    return errorResponseHandler(
      "Unauthorized: You can only update your own profiles",
      httpStatusCode.FORBIDDEN,
      res
    );
  }
  // Validate enums in preferences
  if (preferences) {
    if (
      preferences.musicTypes &&
      !preferences.musicTypes.every((type: string) =>
        Object.values(MusicType).includes(type)
      )
    ) {
      return errorResponseHandler(
        "Invalid music type",
        httpStatusCode.BAD_REQUEST,
        res
      );
    }
    if (
      preferences.eventTypes &&
      !preferences.eventTypes.every((type: string) =>
        Object.values(EventType).includes(type)
      )
    ) {
      return errorResponseHandler(
        "Invalid event type",
        httpStatusCode.BAD_REQUEST,
        res
      );
    }
    if (
      preferences.venueTypes &&
      !preferences.venueTypes.every((type: string) =>
        Object.values(VenueType).includes(type)
      )
    ) {
      return errorResponseHandler(
        "Invalid venue type",
        httpStatusCode.BAD_REQUEST,
        res
      );
    }
  }

  // Validate packages
  if (packages) {
    for (const pkg of packages) {
      if (!pkg.name || !pkg.pricePerHour || !pkg.details) {
        return errorResponseHandler(
          "Invalid package details",
          httpStatusCode.BAD_REQUEST,
          res
        );
      }
      if (pkg.pricePerHour < 0) {
        return errorResponseHandler(
          "Price per hour cannot be negative",
          httpStatusCode.BAD_REQUEST,
          res
        );
      }
    }
  }

  // Prepare update object
  const updateData: Partial<ProfessionalProfile> = {
    stageName,
    about,
    contactPhoneNumber,
    siretNumber,
    photoUrl,
    videosUrl,
    packages,
    preferences,
  };

  if (location) {
    updateData.location = {
      type: "Point",
      coordinates: location.coordinates || [0, 0],
      address: location.address,
    };
  }

  const profile = await ProfessionalProfileModel.findByIdAndUpdate(
    id,
    { $set: updateData },
    { new: true, runValidators: true }
  );

  if (!profile) {
    return errorResponseHandler(
      "Profile not found",
      httpStatusCode.NOT_FOUND,
      res
    );
  }

 return {
    success: true,
    message: "Profile updated successfully",
    data:profile,
  };
}

export const deleteProfessionalProfileService = async (req:any, res:any) => {
  const { id: user } = req.user;
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return errorResponseHandler(
      "Invalid profile ID",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }
  const validUser = await ProfessionalProfileModel.findById(id);
  if (!validUser || validUser.user.toString() !== user) {
    return errorResponseHandler(
      "Unauthorized: You can only delete your own profiles",
      httpStatusCode.FORBIDDEN,
      res
    );
  }

  const profile = await ProfessionalProfileModel.findByIdAndDelete(id);
  if (!profile) {
    return errorResponseHandler(
      "Profile not found",
      httpStatusCode.NOT_FOUND,
      res
    );
  }

  return {
    success: true,
    message: "Profile deleted successfully",
  };
}