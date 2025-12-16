import {
  FollowRelationshipStatus,
  httpStatusCode,
  PostVisibility,
} from "src/lib/constant";
import {
  errorResponseHandler,
  formatErrorResponse,
} from "src/lib/errors/error-response-handler";
import { postModels } from "src/models/post/post-schema";
import { NotificationModel } from "src/models/notification/notification-schema";
import { Request, Response } from "express";
import { JwtPayload } from "jsonwebtoken";
import { object } from "webidl-conversions";
import mongoose from "mongoose";
import { usersModel } from "src/models/user/user-schema";
import { followModel } from "src/models/follow/follow-schema";
import { LikeModel } from "src/models/like/like-schema";
import { Comment } from "src/models/comment/comment-schema";
import { RepostModel } from "src/models/repost/repost-schema";
import { log } from "console";
import { Readable } from "stream";
import Busboy from "busboy";
import { uploadStreamToS3Service } from "src/configF/s3";

// Helper function to send mention notifications to tagged users
const sendTagNotifications = async (
  postId: string,
  senderId: string,
  taggedUserIds: string[],
  postContent: string
) => {
  try {
    const sender = await usersModel
      .findById(senderId)
      .select("userName photos");

    if (!sender || taggedUserIds.length === 0) return;

    // Create notifications for each tagged user
    const notifications = taggedUserIds.map((taggedUserId) => ({
      recipient: taggedUserId,
      sender: senderId,
      type: "mention",
      title: `${sender.userName} tagged you in a post`,
      message: `${
        sender.userName
      } tagged you in a post: "${postContent.substring(0, 50)}${
        postContent.length > 50 ? "..." : ""
      }"`,
      read: false,
      actionLink: `/post/${postId}`,
      metadata: {
        taggedBy: senderId,
        taggedByName: sender.userName,
        taggedByPhoto: sender.photos?.[0] || null,
        postId,
      },
      reference: {
        model: "posts",
        id: postId,
      },
    }));

    await NotificationModel.insertMany(notifications);
  } catch (error) {
    console.error("Error sending tag notifications:", error);
    // Don't throw error - notifications shouldn't block post creation
  }
};

export const createPostService = async (req: any, res: Response) => {
  if (!req.user) {
    throw new Error(
      JSON.stringify({
        success: false,
        message: "Authentication failed",
        code: httpStatusCode.UNAUTHORIZED,
      })
    );
  }

  const { id: userId, email: userEmail } = req.user;

  // Check content type
  if (!req.headers["content-type"]?.includes("multipart/form-data")) {
    throw new Error(
      JSON.stringify({
        success: false,
        message: "Content-Type must be multipart/form-data",
        code: httpStatusCode.BAD_REQUEST,
      })
    );
  }

  return new Promise((resolve, reject) => {
    const busboy = Busboy({ headers: req.headers });
    const uploadPromises: Promise<string>[] = [];
    const formData: any = {};

    busboy.on("field", (fieldname: string, value: string) => {
      if (fieldname === "taggedUsers") {
        try {
          formData[fieldname] = JSON.parse(value);
        } catch {
          formData[fieldname] = value;
        }
      } else {
        formData[fieldname] = value;
      }
    });

    busboy.on(
      "file",
      async (fieldname: string, fileStream: any, fileInfo: any) => {
        if (fieldname !== "photos") {
          fileStream.resume();
          return;
        }

        const { filename, mimeType } = fileInfo;

        if (!mimeType.startsWith("image/")) {
          fileStream.resume();
          return reject(
            new Error(
              JSON.stringify({
                success: false,
                message: "Only image files are allowed",
                code: httpStatusCode.BAD_REQUEST,
              })
            )
          );
        }

        const readableStream = new Readable();
        readableStream._read = () => {};

        fileStream.on("data", (chunk: any) => {
          readableStream.push(chunk);
        });

        fileStream.on("end", () => {
          readableStream.push(null);
        });

        const uploadPromise = uploadStreamToS3Service(
          readableStream,
          filename,
          mimeType,
          userEmail
        );
        uploadPromises.push(uploadPromise);
      }
    );

    busboy.on("finish", async () => {
      if (uploadPromises.length === 0) {
        return reject(
          new Error(
            JSON.stringify({
              success: false,
              message: "At least one photo is required",
              code: httpStatusCode.BAD_REQUEST,
            })
          )
        );
      }

      try {
        const uploadedPhotoKeys = await Promise.all(uploadPromises);

        const { content, visibility } = formData;

        if (!content || !visibility) {
          return reject(
            new Error(
              JSON.stringify({
                success: false,
                message: "Content and visibility are required",
                code: httpStatusCode.BAD_REQUEST,
              })
            )
          );
        }

        if (!Object.values(PostVisibility).includes(visibility)) {
          return reject(
            new Error(
              JSON.stringify({
                success: false,
                message: "Invalid visibility value",
                code: httpStatusCode.BAD_REQUEST,
              })
            )
          );
        }

        // Validate taggedUsers array if provided
        let validatedTaggedUsers = [];
        if (formData.taggedUsers && formData.taggedUsers.length > 0) {
          const parsedTaggedUsers =
            typeof formData.taggedUsers === "string"
              ? JSON.parse(formData.taggedUsers)
              : formData.taggedUsers;

          if (!Array.isArray(parsedTaggedUsers)) {
            return reject(
              new Error(
                JSON.stringify({
                  success: false,
                  message: "Tagged users must be an array",
                  code: httpStatusCode.BAD_REQUEST,
                })
              )
            );
          }

          // Validate and filter tagged user IDs
          for (const id of parsedTaggedUsers) {
            // Trim whitespace and validate format
            const trimmedId = String(id).trim();

            // Check if it's a valid 24-character hex string
            if (!/^[0-9a-fA-F]{24}$/.test(trimmedId)) {
              return reject(
                new Error(
                  JSON.stringify({
                    success: false,
                    message: `Invalid user ID format: ${trimmedId}`,
                    code: httpStatusCode.BAD_REQUEST,
                  })
                )
              );
            }

            try {
              const objectId = new mongoose.Types.ObjectId(trimmedId);
              const userExists = await usersModel
                .findById(objectId)
                .select("_id")
                .lean();

              if (userExists) {
                validatedTaggedUsers.push(objectId);
              } else {
                return reject(
                  new Error(
                    JSON.stringify({
                      success: false,
                      message: `User with ID ${trimmedId} does not exist`,
                      code: httpStatusCode.BAD_REQUEST,
                    })
                  )
                );
              }
            } catch (error) {
              console.error(`Error validating user ID ${trimmedId}:`, error);
              return reject(
                new Error(
                  JSON.stringify({
                    success: false,
                    message: `Invalid user ID: ${trimmedId}`,
                    code: httpStatusCode.BAD_REQUEST,
                  })
                )
              );
            }
          }
        }

        // Create new post
        const newPost = new postModels({
          user: userId,
          content,
          photos: uploadedPhotoKeys,
          taggedUsers: validatedTaggedUsers,
          visibility: visibility || PostVisibility.PUBLIC,
        });

        const savedPost = await newPost.save();
        await savedPost.populate([
          { path: "user", select: "-password" },
          { path: "taggedUsers", select: "-password" },
        ]);
        // Send notifications to tagged users (non-blocking)
        if (validatedTaggedUsers.length > 0) {
          sendTagNotifications(
            savedPost._id.toString(),
            userId,
            validatedTaggedUsers.map((id) => id.toString()),
            content
          ).catch((err) => console.error("Error in tag notifications:", err));
        }
        resolve({
          success: true,
          message: "Post created successfully",
          data: savedPost,
        });
      } catch (error) {
        console.error("Upload or post creation error:", error);
        reject(error);
      }
    });

    busboy.on("error", (error: any) => {
      console.error("Busboy error:", error);
      reject(error);
    });

    req.pipe(busboy);
  });
};

// READ - Get all posts
export const getAllPostsService = async (req: Request, res: Response) => {
  if (!req.user) {
    return errorResponseHandler(
      "Authentication failed",
      httpStatusCode.UNAUTHORIZED,
      res
    );
  }

  const posts = await postModels
    .find()
    .populate("user", "-password")
    .populate("taggedUsers", "-password")
    .sort({ createdAt: -1 });

  return {
    success: true,
    message: "Posts retrieved successfully",
    data: posts,
  };
};

// READ - Get single post by ID
export const getPostByIdService = async (req: Request, res: Response) => {
  if (!req.user) {
    return errorResponseHandler(
      "Authentication failed",
      httpStatusCode.UNAUTHORIZED,
      res
    );
  }

  const { id: userId } = req.user as JwtPayload;
  const postId = req.params.id;

  // Validate post ID
  if (!mongoose.Types.ObjectId.isValid(postId)) {
    return errorResponseHandler(
      "Invalid post ID",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

  // Get the post with user and tagged users
  const post = await postModels
    .findById(postId)
    .populate("user", "-password")
    .populate("taggedUsers", "-password");

  if (!post) {
    return errorResponseHandler(
      "Post not found",
      httpStatusCode.NOT_FOUND,
      res
    );
  }

  // Check if current user follows the post author
  const isFollowing = await followModel.findOne({
    follower_id: userId,
    following_id: post.user._id,
    relationship_status: FollowRelationshipStatus.FOLLOWING,
    is_approved: true,
  });

  // Get likes for this post
  const likes = await LikeModel.find({
    targetType: "posts",
    target: postId,
  }).populate("user", "userName photos");

  // Check if current user has liked this post
  const userLiked = likes.some((like) => like.user._id.toString() === userId);

  // Get comments for this post
  const comments = await Comment.find({
    post: postId,
    parentComment: null, // Only top-level comments
    isDeleted: false,
  })
    .populate("user", "userName photos")
    .sort({ createdAt: -1 });

  // Get comment counts
  const commentCount = await Comment.countDocuments({
    post: postId,
    isDeleted: false,
  });

  // Get repost count
  const repostCount = await RepostModel.countDocuments({
    originalPost: postId,
  });

  // Check if current user has reposted this post
  const userRepost = await RepostModel.findOne({
    user: userId,
    originalPost: postId,
  });

  // Enhance comments with reply counts and like counts
  const enhancedComments = await Promise.all(
    comments.map(async (comment) => {
      // Get reply count for this comment
      const replyCount = await Comment.countDocuments({
        parentComment: comment._id,
        isDeleted: false,
      });

      // Get likes for this comment
      const commentLikes = await LikeModel.find({
        targetType: "comments",
        target: comment._id,
      });

      // Check if current user has liked this comment
      const userLikedComment = commentLikes.some(
        (like) => like.user.toString() === userId
      );

      return {
        ...comment.toObject(),
        replyCount,
        likesCount: commentLikes.length,
        isLikedByUser: userLikedComment,
      };
    })
  );

  // Construct the enhanced post object
  const enhancedPost = {
    ...post.toObject(),
    isFollowingAuthor: !!isFollowing,
    isLikedByUser: userLiked,
    isRepostedByUser: !!userRepost,
    likesCount: likes.length,
    likes: likes,
    commentsCount: commentCount,
    comments: enhancedComments,
    repostsCount: repostCount,
  };

  return {
    success: true,
    message: "Post retrieved successfully",
    data: enhancedPost,
  };
};

// UPDATE - Update a post
export const updatePostService = async (req: Request, res: Response) => {
  if (!req.user) {
    return errorResponseHandler(
      "Authentication failed",
      httpStatusCode.UNAUTHORIZED,
      res
    );
  }

  const { id: userId } = req.user as JwtPayload;
  const { content, photos, taggedUsers, visibility } = req.body;

  const post = await postModels.findById(req.params.id);

  if (!post) {
    return errorResponseHandler(
      "Post not found",
      httpStatusCode.NOT_FOUND,
      res
    );
  }

  if (post.user.toString() !== userId) {
    return errorResponseHandler(
      "Not authorized to update this post",
      httpStatusCode.FORBIDDEN,
      res
    );
  }

  const updateData: {
    content?: string;
    photos?: any;
    taggedUsers?: any;
    visibility?: PostVisibility;
  } = {};
  if (content) updateData.content = content;
  if (photos) updateData.photos = photos;
  if (taggedUsers) updateData.taggedUsers = taggedUsers;
  if (visibility) updateData.visibility = visibility;

  const updatedPost = await postModels
    .findByIdAndUpdate(
      req.params.id,
      { $set: updateData },
      { new: true, runValidators: true }
    )
    .populate("user", "userName ")
    .populate("taggedUsers", "userName ");

  return {
    success: true,
    message: "Post updated successfully",
    data: updatedPost,
  };
};

// DELETE - Delete a post
export const deletePostService = async (req: Request, res: Response) => {
  if (!req.user) {
    return errorResponseHandler(
      "Authentication failed",
      httpStatusCode.UNAUTHORIZED,
      res
    );
  }

  const { id: userId } = req.user as JwtPayload;
  const post = await postModels.findById(req.params.id);

  if (!post) {
    return errorResponseHandler(
      "Post not found",
      httpStatusCode.NOT_FOUND,
      res
    );
  }

  if (post.user.toString() !== userId) {
    return errorResponseHandler(
      "Not authorized to delete this post",
      httpStatusCode.FORBIDDEN,
      res
    );
  }

  await postModels.findByIdAndDelete(req.params.id);

  return {
    success: true,
    message: "Post deleted successfully",
    data: null,
  };
};

export const getAllPostOfCurrentUserService = async (
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
  const { id: userId } = req.user as JwtPayload;
  const posts = await postModels
    .find({ user: userId })
    .populate("user", "userName")
    .populate("taggedUsers", "userName")
    .sort({ createdAt: -1 });

  const totalPost = await postModels.countDocuments({ user: userId });
  return {
    success: true,
    message: "Posts of current user retrieved successfully",
    data: posts,
    totalPost: totalPost,
  };
};

export const getPostsOfOtherUserService = async (req: any, res: Response) => {
  if (!req.user) {
    return errorResponseHandler(
      "Authentication failed",
      httpStatusCode.UNAUTHORIZED,
      res
    );
  }

  const { id: userId } = req.user as JwtPayload;
  const { id: targetUserId } = req.params;

  const posts = await postModels
    .find({ user: targetUserId })
    .populate("user", "userName")
    .populate("taggedUsers", "userName")
    .sort({ createdAt: -1 });

  const totalPost = await postModels.countDocuments({ user: targetUserId });
  return {
    success: true,
    message: "Posts of other user retrieved successfully",
    data: posts,
    totalPost: totalPost,
  };
};
