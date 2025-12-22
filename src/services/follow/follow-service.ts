import { FollowRelationshipStatus } from "src/lib/constant";
import { followModel } from "src/models/follow/follow-schema";
import { NotificationModel } from "src/models/notification/notification-schema";
import { usersModel } from "src/models/user/user-schema";
import { sendPushToToken } from "src/utils/firebase-admin";
import { Request, Response } from "express";
import { JwtPayload } from "jsonwebtoken";
import { httpStatusCode } from "src/lib/constant";
import { errorResponseHandler } from "src/lib/errors/error-response-handler";
import { isValidObjectId } from "mongoose";

// Helper function to create follow notification
const createFollowNotification = async (
  senderId: string,
  recipientId: string,
  notificationType: "follow" | "follow_back"
) => {
  try {
    const sender = await usersModel
      .findById(senderId)
      .select("userName photos");

    let title = "";
    let message = "";

    if (notificationType === "follow") {
      title = 'New Follower';
      message = `${sender?.userName} started following you`;
    } else if (notificationType === "follow_back") {
      title = 'Started following you back';
      message = `${sender?.userName} followed you back`;
    }

    const notification = new NotificationModel({
      recipient: recipientId,
      sender: senderId,
      type: "follow",
      title,
      message,
      read: false,
      actionLink: `/profile/${senderId}`,
      metadata: {
        followerId: senderId,
        followerName: sender?.userName,
        followerPhoto: sender?.photos?.[0] || null,
        notificationType,
      },
      reference: {
        model: "users",
        id: senderId,
      },
    });

    await notification.save();
    // Try to send push notification (non-blocking)
    try {
      const recipient = await usersModel
        .findById(recipientId)
        .select("fcmToken pushNotification");
      if (recipient && recipient.pushNotification && recipient.fcmToken) {
        sendPushToToken(recipient.fcmToken, title, message, {
          type: notificationType,
          followerId: senderId,
        }).catch((err) =>
          console.warn("sendPushToToken error for follow notification:", err)
        );
      }
    } catch (err) {
      console.warn("Failed to fetch recipient for push send:", err);
    }

    return notification;
  } catch (error) {
    console.error("Error creating follow notification:", error);
    // Don't throw error - notifications shouldn't block the follow operation
  }
};

// Helper function to check if target user follows back and send notification
const checkAndSendFollowBackNotification = async (
  currentUserId: string,
  targetUserId: string
) => {
  try {
    const reverseFollow = await followModel.findOne({
      follower_id: targetUserId,
      following_id: currentUserId,
      relationship_status: FollowRelationshipStatus.FOLLOWING,
    });

    if (reverseFollow) {
      // Target user follows back, send notification to current user
      await createFollowNotification(
        targetUserId,
        currentUserId,
        "follow_back"
      );
    }
  } catch (error) {
    console.error("Error checking follow back:", error);
  }
};

// Unified service to handle sending, canceling, unfollowing, and resending follow requests
export const followUserService = async (req: Request, res: Response) => {
  if (!req.user) {
    return errorResponseHandler(
      "Authentication failed",
      httpStatusCode.UNAUTHORIZED,
      res
    );
  }

  const { id: currentUserId } = req.user as JwtPayload;
  const { targetUserId } = req.params;

  if (!isValidObjectId(targetUserId)) {
    return errorResponseHandler(
      "Invalid target user ID",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

  if (currentUserId === targetUserId) {
    return errorResponseHandler(
      "You cannot follow yourself",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

  const existingFollow = await followModel.findOne({
    follower_id: currentUserId,
    following_id: targetUserId,
  });

  if (!existingFollow) {
    const newFollowRequest = new followModel({
      follower_id: currentUserId,
      following_id: targetUserId,
      relationship_status: FollowRelationshipStatus.FOLLOWING,
      is_approved: true,
    });
    await newFollowRequest.save();

    // Send notification to target user that current user is following them
    await createFollowNotification(currentUserId, targetUserId, "follow");

    // TODO: Check if target user follows back and send notification (non-blocking)
    // checkAndSendFollowBackNotification(currentUserId, targetUserId).catch(
    //   (err) => console.error("Error in follow back check:", err)
    // );

    return {
      success: true,
      message: "Followed the User successfully",
      data: { follow: newFollowRequest },
    };
  } else {
    if (
      existingFollow.relationship_status === FollowRelationshipStatus.FOLLOWING
    ) {
      await followModel.findByIdAndDelete(existingFollow._id);
      return {
        success: true,
        message: "Successfully unfollowed the user",
      };
    }
    if (
      existingFollow.relationship_status === FollowRelationshipStatus.UNFOLLOWED
    ) {
      await followModel.findByIdAndUpdate(existingFollow._id, {
        relationship_status: FollowRelationshipStatus.FOLLOWING,
        is_approved: true,
        unfollowed_at: null,
      });

      // Send notification to target user that current user is following them again
      await createFollowNotification(currentUserId, targetUserId, "follow");

      // TODO: Check if target user follows back and send notification (non-blocking)
      // checkAndSendFollowBackNotification(currentUserId, targetUserId).catch(
      //   (err) => console.error("Error in follow back check:", err)
      // );

      return {
        success: true,
        message: "Followed the user successfully",
      };
    }
  }

  return errorResponseHandler(
    "Invalid relationship status",
    httpStatusCode.BAD_REQUEST,
    res
  );
};
export const getFollowStatsService = async (req: Request, res: Response) => {
  if (!req.user) {
    return errorResponseHandler(
      "Authentication failed",
      httpStatusCode.UNAUTHORIZED,
      res
    );
  }

  const { id: userId } = req.user as JwtPayload;

  const followersCount = await followModel.countDocuments({
    following_id: userId,
    relationship_status: FollowRelationshipStatus.FOLLOWING,
  });

  const followingCount = await followModel.countDocuments({
    follower_id: userId,
    relationship_status: FollowRelationshipStatus.FOLLOWING,
  });

  return {
    success: true,
    message: "Follow stats retrieved successfully",
    data: {
      followers: followersCount,
      following: followingCount,
    },
  };
};

// Get follow history between current user and target user
export const getFollowRelationshipService = async (
  req: Request,
  res: Response
) => {
  if (!req.user) {
    return errorResponseHandler(
      "Authentication failed",
      httpStatusCode.UNAUTHORIZED,
      res
    );
  }

  const { id: currentUserId } = req.user as JwtPayload;
  const { targetUserId } = req.params;

  const followRelationship = await followModel
    .findOne({
      follower_id: currentUserId,
      following_id: targetUserId,
    })
    .populate("following_id", "userName media")
    .lean();

  if (!followRelationship) {
    return {
      success: true,
      message: "No follow relationship found",
      data: { status: "NOT_FOLLOWING" },
    };
  }

  return {
    success: true,
    message: "Follow relationship retrieved successfully",
    data: {
      status: followRelationship.relationship_status,
      follow: followRelationship,
    },
  };
};

// Retrieve pending follow requests
// export const getPendingFollowRequestsService = async (req: Request, res: Response) => {
//     if (!req.user) {
//         return errorResponseHandler("Authentication failed", httpStatusCode.UNAUTHORIZED, res);
//     }

//     const { id: currentUserId } = req.user as JwtPayload;

//     const pendingRequests = await followModel.find({
//         following_id: currentUserId,
//         relationship_status: FollowRelationshipStatus.PENDING
//     })
//     .populate('follower_id', 'userName')
//     .sort({ createdAt: -1 })
//     .lean();

//     if (pendingRequests.length === 0) {
//         return errorResponseHandler("No pending follow requests found", httpStatusCode.NOT_FOUND, res);
//     }

//     return {
//         success: true,
//         message: "Pending follow requests retrieved successfully",
//         data: { pendingRequests }
//     };
// };

// // Handle accepting or rejecting a follow request with follow-back option
// export const handleFollowRequestService = async (req: Request, res: Response) => {
//     if (!req.user) {
//         return errorResponseHandler("Authentication failed", httpStatusCode.UNAUTHORIZED, res);
//     }

//     const { id: currentUserId } = req.user as JwtPayload;
//     const { requestId } = req.params;
//     const {  followBack } = req.body;
//     const isApproved = true;
//     if (typeof followBack !== 'boolean') {
//         return errorResponseHandler("followBack must be a boolean value", httpStatusCode.BAD_REQUEST, res);
//     }
//     if (typeof isApproved !== 'boolean') {
//         return errorResponseHandler("isApproved must be a boolean value", httpStatusCode.BAD_REQUEST, res);
//     }

//     const followRequest = await followModel.findOne({
//         _id: requestId,
//         following_id: currentUserId,
//         relationship_status: FollowRelationshipStatus.PENDING
//     });

//     if (!followRequest) {
//         return errorResponseHandler("Follow request not found or Unauthorized", httpStatusCode.NOT_FOUND, res);
//     }

//     if (isApproved) {
//         followRequest.relationship_status = FollowRelationshipStatus.FOLLOWING;
//         followRequest.is_approved = true;
//         followRequest.unfollowed_at = null;
//         await followRequest.save();

//         if (followBack) {
//             const existingReverseFollow = await followModel.findOne({
//                 follower_id: currentUserId,
//                 following_id: followRequest.follower_id,
//             });

//             if (!existingReverseFollow) {
//                 const newFollowBackRequest = new followModel({
//                     follower_id: currentUserId,
//                     following_id: followRequest.follower_id,
//                     relationship_status: FollowRelationshipStatus.FOLLOWING,
//                     is_approved: true,
//                 });
//                 await newFollowBackRequest.save();
//             } else if (existingReverseFollow.relationship_status !== FollowRelationshipStatus.FOLLOWING) {
//                 existingReverseFollow.relationship_status = FollowRelationshipStatus.FOLLOWING;
//                 existingReverseFollow.is_approved = true;
//                 existingReverseFollow.unfollowed_at = null;
//                 await existingReverseFollow.save();
//             }
//         }

//         return {
//             success: true,
//             message: "Follow request approved successfully",
//             data: { follow: followRequest }
//         };
//     } else {
//         followRequest.relationship_status = FollowRelationshipStatus.UNFOLLOWED;
//         followRequest.is_approved = false;
//         followRequest.unfollowed_at = new Date();
//         await followRequest.save();

//         return {
//             success: true,
//             message: "Follow request rejected successfully",
//             data: { follow: followRequest }
//         };
//     }
// };

// Get follow stats (followers and following count)

// import { FollowRelationshipStatus } from "src/lib/constant";
// import { followModel } from "src/models/follow/follow-schema";
// import { Request, Response } from "express";
// import { JwtPayload } from "jsonwebtoken";
// import { httpStatusCode } from "src/lib/constant";
// import { errorResponseHandler } from "src/lib/errors/error-response-handler";
// import { isValidObjectId } from "mongoose";

// export const followUserService = async (req: Request, res: Response) => {
//     if (!req.user) {
//       return errorResponseHandler(
//         "Authentication failed",
//         httpStatusCode.UNAUTHORIZED,
//         res
//       );
//     }

//     const { id: currentUserId } = req.user as JwtPayload;
//     const { targetUserId } = req.params;

//     // Validate targetUserId
//     if (!isValidObjectId(targetUserId)) {
//       return errorResponseHandler(
//         "Invalid target user ID",
//         httpStatusCode.BAD_REQUEST,
//         res
//       );
//     }

//     if (currentUserId === targetUserId) {
//       return errorResponseHandler(
//         "You cannot follow yourself",
//         httpStatusCode.BAD_REQUEST,
//         res
//       );
//     }

//     // Check for existing relationship
//     const existingFollow = await followModel.findOne({
//       follower_id: currentUserId,
//       following_id: targetUserId,
//     });

//     if (!existingFollow) {
//       // No existing relationship: Create a new follow request with PENDING status
//       const newFollowRequest = new followModel({
//         follower_id: currentUserId,
//         following_id: targetUserId,
//         relationship_status: FollowRelationshipStatus.PENDING,
//         is_approved: false,
//       });
//       await newFollowRequest.save();
//       return {
//         success: true,
//         message: "Follow request sent successfully",
//         data: { follow: newFollowRequest },
//       };
//     } else {
//       // Existing relationship: Handle based on current status
//       if (existingFollow.relationship_status === FollowRelationshipStatus.PENDING) {
//         // Delete the record to cancel the follow request
//         await followModel.findByIdAndDelete(existingFollow._id);
//         return {
//           success: true,
//           message: "Follow request canceled successfully",
//         };
//       }
//       if (existingFollow.relationship_status === FollowRelationshipStatus.FOLLOWING) {
//         // Update to UNFOLLOWED and set is_approved to false
//         await followModel.findByIdAndUpdate(existingFollow._id, {
//           relationship_status: FollowRelationshipStatus.UNFOLLOWED,
//           is_approved: false,
//           unfollowed_at: new Date(), // Optionally set unfollowed_at
//         });
//         return {
//           success: true,
//           message: "Successfully unfollowed the user",
//         };
//       }
//       if (existingFollow.relationship_status === FollowRelationshipStatus.UNFOLLOWED) {
//         // Update to PENDING and set is_approved to false
//         await followModel.findByIdAndUpdate(existingFollow._id, {
//           relationship_status: FollowRelationshipStatus.PENDING,
//           is_approved: false,
//           unfollowed_at: null, // Optionally reset unfollowed_at
//         });
//         return {
//           success: true,
//           message: "Follow request sent successfully",
//         };
//       }
//     }

//     // Fallback for unexpected cases
//     return errorResponseHandler(
//       "Invalid relationship status",
//       httpStatusCode.BAD_REQUEST,
//       res
//     );
//   };

// export const getPendingFollowRequestsService = async (req: Request, res: Response) => {
//     if (!req.user) {
//         return errorResponseHandler("Authentication failed", httpStatusCode.UNAUTHORIZED, res);
//     }

//     const { id: currentUserId } = req.user as JwtPayload;

//     const pendingRequests = await followModel.find({
//         following_id: currentUserId,
//         relationship_status: FollowRelationshipStatus.PENDING
//     })
//     .populate('follower_id', 'userName')
//     .sort({ createdAt: -1 })
//     .lean();

//     if (pendingRequests.length === 0) {
//         return errorResponseHandler("No pending follow requests found", httpStatusCode.NOT_FOUND, res);
//     }

//     return {
//         success: true,
//         message: "Pending follow requests retrieved successfully",
//         data: { pendingRequests }
//     };
// };

// export const handleFollowRequestService = async (req: Request, res: Response) => {
//     if (!req.user) {
//         return errorResponseHandler("Authentication failed", httpStatusCode.UNAUTHORIZED, res);
//     }

//     const { id: currentUserId } = req.user as JwtPayload;
//     const { requestId } = req.params;
//     const { isApproved } = req.body;

//     if (typeof isApproved !== 'boolean') {
//         return errorResponseHandler("isApproved must be a boolean value", httpStatusCode.BAD_REQUEST, res);
//     }

//     const followRequest = await followModel.findOne({
//         _id: requestId,
//         following_id: currentUserId,
//         relationship_status: FollowRelationshipStatus.PENDING
//     });

//     if (!followRequest) {
//         return errorResponseHandler("Follow request not found or Unauthorized", httpStatusCode.NOT_FOUND, res);
//     }

//     if (isApproved) {
//         // Approve the request
//         followRequest.relationship_status = FollowRelationshipStatus.FOLLOWING;
//         followRequest.is_approved = true;
//         followRequest.unfollowed_at = null;  // Now this is valid
//         await followRequest.save();

//         return {
//             success: true,
//             message: "Follow request approved successfully",
//             data: { follow: followRequest }
//         };
//     } else {
//         // Instead of deleting, mark as unfollowed
//         followRequest.relationship_status = FollowRelationshipStatus.UNFOLLOWED;
//         followRequest.is_approved = false;
//         followRequest.unfollowed_at = new Date();
//         await followRequest.save();

//         return {
//             success: true,
//             message: "Follow request rejected successfully",
//             data: { follow: followRequest }
//         };
//     }
// };

// export const cancelFollowRequestService = async (req: Request, res: Response) => {
//     if (!req.user) {
//         return errorResponseHandler("Authentication failed", httpStatusCode.UNAUTHORIZED, res);
//     }

//     const { id: currentUserId } = req.user as JwtPayload;
//     const { id } = req.params;

//     const pendingRequest = await followModel.findOne({
//         _id: id,
//         follower_id: currentUserId,
//         relationship_status: FollowRelationshipStatus.PENDING
//     });

//     if (!pendingRequest) {
//         return errorResponseHandler("No pending request found or Unauthorized to cancel", httpStatusCode.NOT_FOUND, res);
//     }

//     // Instead of deleting, update the status
//     pendingRequest.relationship_status = FollowRelationshipStatus.UNFOLLOWED;
//     pendingRequest.is_approved = false;
//     pendingRequest.unfollowed_at = new Date();
//     await pendingRequest.save();

//     return {
//         success: true,
//         message: "Follow request canceled successfully",
//         data: { follow: pendingRequest }
//     };
// };

// export const unfollowUserService = async (req: Request, res: Response) => {
//     if (!req.user) {
//         return errorResponseHandler("Authentication failed", httpStatusCode.UNAUTHORIZED, res);
//     }

//     const { id: currentUserId } = req.user as JwtPayload;
//     const { targetUserId } = req.params;

//     if (currentUserId === targetUserId) {
//         return errorResponseHandler("Invalid operation: Cannot unfollow yourself", httpStatusCode.BAD_REQUEST, res);
//     }

//     const existingFollow = await followModel.findOne({
//         follower_id: currentUserId,
//         following_id: targetUserId,
//         relationship_status: FollowRelationshipStatus.FOLLOWING
//     });

//     if (!existingFollow) {
//         return errorResponseHandler("Not following this user", httpStatusCode.NOT_FOUND, res);
//     }

//     // Update the relationship status instead of deleting
//     const updatedFollow = await followModel.findByIdAndUpdate(
//         existingFollow._id,
//         {
//             relationship_status: FollowRelationshipStatus.UNFOLLOWED,
//             is_approved: false,
//             unfollowed_at: new Date()
//         },
//         { new: true }
//     );

//     return {
//         success: true,
//         message: "Successfully unfollowed user",
//         data: {
//             unfollowedUserId: targetUserId,
//             unfollowedAt: updatedFollow ? updatedFollow.unfollowed_at : null
//         }
//     };
// };

// // Add new utility service to get active followers/following count
// export const getFollowStatsService = async (req: Request, res: Response) => {
//     if (!req.user) {
//         return errorResponseHandler("Authentication failed", httpStatusCode.UNAUTHORIZED, res);
//     }

//     const { id: userId } = req.user as JwtPayload;

//     const followersCount = await followModel.countDocuments({
//         following_id: userId,
//         relationship_status: FollowRelationshipStatus.FOLLOWING
//     });

//     const followingCount = await followModel.countDocuments({
//         follower_id: userId,
//         relationship_status: FollowRelationshipStatus.FOLLOWING
//     });

//     return {
//         success: true,
//         message: "Follow stats retrieved successfully",
//         data: {
//             followers: followersCount,
//             following: followingCount
//         }
//     };
// };

// // Add a new service to get follow history
// export const getFollowHistoryService = async (req: Request, res: Response) => {
//     if (!req.user) {
//         return errorResponseHandler("Authentication failed", httpStatusCode.UNAUTHORIZED, res);
//     }

//     const { id: currentUserId } = req.user as JwtPayload;
//     const { targetUserId } = req.params;

//     const followHistory = await followModel.find({
//         follower_id: currentUserId,
//         following_id: targetUserId
//     })
//     .sort({ createdAt: -1 })
//     .populate('following_id', 'userName profilePicture')
//     .lean();

//     if (!followHistory.length) {
//         return errorResponseHandler("No follow history found", httpStatusCode.NOT_FOUND, res);
//     }

//     return {
//         success: true,
//         message: "Follow history retrieved successfully",
//         data: { followHistory }
//     };
// };
