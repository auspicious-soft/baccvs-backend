import { Request, Response } from "express";
import { httpStatusCode, PostVisibility } from "src/lib/constant";
import { errorResponseHandler } from "src/lib/errors/error-response-handler";
import { storyModel } from "src/models/story/story-schema";
import { JwtPayload } from "jsonwebtoken";
import { followModel } from "src/models/follow/follow-schema";
import { usersModel } from "src/models/user/user-schema";
import { NotificationModel } from "src/models/notification/notification-schema";
import { FollowRelationshipStatus } from "src/lib/constant";
import { deleteFileFromS3, uploadStreamToS3Service } from "src/configF/s3";
import { customAlphabet } from "nanoid";
import { Readable } from "stream";
import busboy from "busboy";

// Helper function to send mention notifications to tagged users in story
const sendStoryTagNotifications = async (
  storyId: string,
  senderId: string,
  taggedUserIds: string[],
  storyContent: string
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
      title: `${sender.userName} tagged you in a story`,
      message: `${
        sender.userName
      } tagged you in a story: "${storyContent.substring(0, 50)}${
        storyContent.length > 50 ? "..." : ""
      }"`,
      read: false,
      actionLink: `/story/${storyId}`,
      metadata: {
        taggedBy: senderId,
        taggedByName: sender.userName,
        taggedByPhoto: sender.photos?.[0] || null,
        storyId,
      },
      reference: {
        model: "stories",
        id: storyId,
      },
    }));

    await NotificationModel.insertMany(notifications);
  } catch (error) {
    console.error("Error sending story tag notifications:", error);
    // Don't throw error - notifications shouldn't block story creation
  }
};

export const createStoryService = async (req: Request, res: Response) => {
  // Authentication check
  if (!req.user) {
    return errorResponseHandler(
      "Authentication failed while creating story",
      httpStatusCode.UNAUTHORIZED,
      res
    );
  }

  const { id: userId, email } = req.user as JwtPayload;
  let parsedData: any = {
    content: "",
    taggedUsers: [],
    visibility: PostVisibility.PUBLIC,
    storyType: "",
    textColor: "",
    fontFamily: "",
    textAlignment: "",
  };
  let media: any = null;

  if (req.headers["content-type"]?.includes("multipart/form-data")) {
    return new Promise<void>((resolve) => {
      const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB limit
      const busboyParser = busboy({
        headers: req.headers,
        limits: {
          fileSize: MAX_FILE_SIZE,
          files: 1,
          fieldSize: 1024 * 1024,
          fields: 10,
        },
      });

      let fileUploaded = false;
      let fileUploadPromise: Promise<void> | null = null;
      let hasError = false;

      const handleError = (
        message: string,
        statusCode: number = httpStatusCode.INTERNAL_SERVER_ERROR
      ) => {
        if (hasError) return;
        hasError = true;
        errorResponseHandler(message, statusCode, res); // Send error response
        resolve(); // Resolve to prevent hanging
      };

      busboyParser.on("field", (fieldname: string, value: string) => {
        if (hasError) return;

        try {
          const allowedFields = [
            "content",
            "taggedUsers",
            "visibility",
            "storyType",
            "textColor",
            "fontFamily",
            "textAlignment",
          ];
          if (!allowedFields.includes(fieldname)) {
            return errorResponseHandler(
              `Invalid field: ${fieldname}`,
              httpStatusCode.BAD_REQUEST,
              res
            );
          }

          if (value.length > 10000) {
            return errorResponseHandler(
              `Field ${fieldname} exceeds maximum length`,
              httpStatusCode.BAD_REQUEST,
              res
            );
          }

          if (["taggedUsers"].includes(fieldname)) {
            try {
              parsedData[fieldname] = JSON.parse(value);
            } catch (parseError) {
              return errorResponseHandler(
                `Failed to parse ${fieldname}. Must be a valid JSON string`,
                httpStatusCode.BAD_REQUEST,
                res
              );
            }
          } else {
            parsedData[fieldname] = value;
          }
        } catch (error) {
          console.error("Field processing error:", error);
          return errorResponseHandler(
            `Error processing field ${fieldname}`,
            httpStatusCode.BAD_REQUEST,
            res
          );
        }
      });

      busboyParser.on(
        "file",
        (fieldname: string, fileStream: any, fileInfo: any) => {
          if (hasError) {
            fileStream.resume();
            return;
          }

          if (fieldname !== "media") {
            fileStream.resume();
            return errorResponseHandler(
              "Invalid file field name",
              httpStatusCode.BAD_REQUEST,
              res
            );
          }

          if (fileUploaded) {
            fileStream.resume();
            return errorResponseHandler(
              "Only one file is allowed",
              httpStatusCode.BAD_REQUEST,
              res
            );
          }

          const { filename, mimeType } = fileInfo;

          if (!filename || filename.trim() === "") {
            fileStream.resume();
            return errorResponseHandler(
              "Filename is required",
              httpStatusCode.BAD_REQUEST,
              res
            );
          }

          const isImage = mimeType.startsWith("image/");
          if (!isImage) {
            fileStream.resume();
            return errorResponseHandler(
              "Only image files are allowed for story media",
              httpStatusCode.BAD_REQUEST,
              res
            );
          }

          const allowedImageTypes = [
            "image/jpeg",
            "image/png",
            "image/gif",
            "image/webp",
          ];
          if (!allowedImageTypes.includes(mimeType)) {
            fileStream.resume();
            return errorResponseHandler(
              "Unsupported image format",
              httpStatusCode.BAD_REQUEST,
              res
            );
          }

          let fileSize = 0;
          let uploadTimeout: NodeJS.Timeout | null = null;

          fileUploadPromise = new Promise<void>(
            (resolveUpload, rejectUpload) => {
              const chunks: Buffer[] = [];

              fileStream.on("data", (chunk: Buffer) => {
                if (hasError) return;
                fileSize += chunk.length;
                chunks.push(chunk);
              });

              fileStream.on("end", async () => {
                if (hasError) return;

                try {
                  if (chunks.length === 0) {
                    return rejectUpload(new Error("No file data received"));
                  }

                  const fileBuffer = Buffer.concat(chunks);
                  if (fileBuffer.length === 0) {
                    return rejectUpload(new Error("Empty file received"));
                  }

                  const readableStream = new Readable();
                  readableStream.push(fileBuffer);
                  readableStream.push(null);

                  uploadTimeout = setTimeout(() => {
                    rejectUpload(new Error("S3 upload timed out"));
                  }, 60000); // 60s timeout

                  const uploadedMediaUrl = await uploadStreamToS3Service(
                    readableStream,
                    filename,
                    mimeType,
                    email || `story_${customAlphabet("0123456789", 5)()}`,
                    true // Mark as temporary (auto-deletes after 24hrs via S3 Lifecycle)
                  );

                  if (
                    !uploadedMediaUrl ||
                    typeof uploadedMediaUrl !== "string"
                  ) {
                    throw new Error("Failed to get valid upload URL");
                  }

                  if (uploadTimeout) {
                    clearTimeout(uploadTimeout);
                    uploadTimeout = null;
                  }

                  media = {
                    url: uploadedMediaUrl,
                    mediaType: "image",
                    filename: filename,
                    size: fileBuffer.length,
                    mimeType: mimeType,
                  };
                  fileUploaded = true;
                  resolveUpload();
                } catch (error) {
                  if (uploadTimeout) {
                    clearTimeout(uploadTimeout);
                    uploadTimeout = null;
                  }
                  console.error("File processing error:", error);
                  rejectUpload(error);
                }
              });

              fileStream.on("error", (error: any) => {
                if (uploadTimeout) {
                  clearTimeout(uploadTimeout);
                  uploadTimeout = null;
                }
                console.error("File stream error:", error);
                rejectUpload(error);
              });
            }
          );
        }
      );

      busboyParser.on("finish", async () => {
        if (hasError) return;

        try {
          if (fileUploadPromise) {
            await fileUploadPromise;
          }

          // Validate storyType
          if (!parsedData.storyType) {
            return errorResponseHandler(
              "Story type is required",
              httpStatusCode.BAD_REQUEST,
              res
            );
          }
          if (!["text", "photo"].includes(parsedData.storyType)) {
            return errorResponseHandler(
              `Invalid story type: ${parsedData.storyType}`,
              httpStatusCode.BAD_REQUEST,
              res
            );
          }

          // Validate based on storyType
          const hasContent =
            parsedData.content && parsedData.content.trim().length > 0;
          const hasMedia = media !== null;

          if (parsedData.storyType === "text" && !hasContent) {
            return errorResponseHandler(
              "Text content is required for text stories",
              httpStatusCode.BAD_REQUEST,
              res
            );
          }
          if (parsedData.storyType === "photo" && !hasMedia) {
            return errorResponseHandler(
              "Media is required for photo stories",
              httpStatusCode.BAD_REQUEST,
              res
            );
          }

          // Validate content length if present (for both text and photo stories)
          if (hasContent && parsedData.content.trim().length > 2000) {
            return errorResponseHandler(
              "Story content exceeds maximum length of 2000 characters",
              httpStatusCode.BAD_REQUEST,
              res
            );
          }

          // Validate text styling fields for text stories
          if (parsedData.storyType === "text") {
            if (!parsedData.textColor) {
              return errorResponseHandler(
                "Text color is required for text stories",
                httpStatusCode.BAD_REQUEST,
                res
              );
            }
            if (
              !/^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$|^[a-zA-Z]+$/.test(
                parsedData.textColor
              )
            ) {
              return errorResponseHandler(
                "Invalid text color format",
                httpStatusCode.BAD_REQUEST,
                res
              );
            }
            if (!parsedData.fontFamily) {
              return errorResponseHandler(
                "Font family is required for text stories",
                httpStatusCode.BAD_REQUEST,
                res
              );
            }
            if (
              !["left", "center", "right"].includes(parsedData.textAlignment)
            ) {
              return errorResponseHandler(
                "Invalid text alignment",
                httpStatusCode.BAD_REQUEST,
                res
              );
            }
          }

          // Validate and process tagged users
          let validatedTaggedUsers: string[] = [];
          if (parsedData.taggedUsers && Array.isArray(parsedData.taggedUsers)) {
            if (parsedData.taggedUsers.length > 20) {
              return errorResponseHandler(
                "Cannot tag more than 20 users in a story",
                httpStatusCode.BAD_REQUEST,
                res
              );
            }
            if (parsedData.taggedUsers.includes(userId)) {
              return errorResponseHandler(
                "You cannot tag yourself in the story",
                httpStatusCode.BAD_REQUEST,
                res
              );
            }

            for (const id of parsedData.taggedUsers) {
              if (typeof id !== "string" || !id.trim()) {
                return errorResponseHandler(
                  "Invalid user ID in tagged users",
                  httpStatusCode.BAD_REQUEST,
                  res
                );
              }
              try {
                const userExists = await usersModel.findById(id.trim());
                if (!userExists) {
                  return errorResponseHandler(
                    `Tagged user ${id} not found`,
                    httpStatusCode.BAD_REQUEST,
                    res
                  );
                }
                validatedTaggedUsers.push(id.trim());
              } catch (dbError) {
                console.error("Database error checking user:", dbError);
                return errorResponseHandler(
                  "Error validating tagged users",
                  httpStatusCode.INTERNAL_SERVER_ERROR,
                  res
                );
              }
            }
          }

          // Validate visibility
          const validVisibilities = Object.values(PostVisibility);
          const visibility = parsedData.visibility || PostVisibility.PUBLIC;
          if (!validVisibilities.includes(visibility)) {
            return errorResponseHandler(
              "Invalid visibility setting",
              httpStatusCode.BAD_REQUEST,
              res
            );
          }

          // Create expiration date (24 hours from now)
          const expiresAt = new Date();
          expiresAt.setHours(expiresAt.getHours() + 24);

          // Create story
          const newStory = await storyModel.create({
            user: userId,
            content: parsedData.content?.trim() || "", // Content is optional for photo stories
            media: parsedData.storyType === "photo" ? media : null,
            taggedUsers: validatedTaggedUsers,
            visibility: visibility,
            storyType: parsedData.storyType,
            textColor:
              parsedData.storyType === "text"
                ? parsedData.textColor
                : undefined,
            fontFamily:
              parsedData.storyType === "text"
                ? parsedData.fontFamily
                : undefined,
            textAlignment:
              parsedData.storyType === "text"
                ? parsedData.textAlignment
                : undefined,
            expiresAt,
          });

          // Populate story with user data
          const populatedStory = await newStory.populate([
            { path: "user", select: "-password" },
            { path: "taggedUsers", select: "-password" },
          ]);

          // Send notifications to tagged users (non-blocking)
          if (validatedTaggedUsers.length > 0) {
            sendStoryTagNotifications(
              newStory._id.toString(),
              userId,
              validatedTaggedUsers,
              parsedData.content
            ).catch((err) =>
              console.error("Error in story tag notifications:", err)
            );
          }

          // Send success response
          res.status(httpStatusCode.CREATED).json({
            success: true,
            message: "Story created successfully",
            data: populatedStory,
          });
          resolve();
        } catch (error) {
          console.error("Story creation error:", error);
          return handleError(
            (error as Error).message || "Error creating story",
            httpStatusCode.INTERNAL_SERVER_ERROR
          );
        }
      });

      busboyParser.on("error", (error: any) => {
        console.error("Busboy error:", error);
        return handleError(
          error.message || "Error processing file uploads",
          httpStatusCode.INTERNAL_SERVER_ERROR
        );
      });

      req.on("error", (error) => {
        console.error("Request stream error:", error);
        return handleError(
          "Error reading request data",
          httpStatusCode.BAD_REQUEST
        );
      });

      // Add timeout for busboy parsing
      const parserTimeout = setTimeout(() => {
        errorResponseHandler(
          "Request parsing timed out",
          httpStatusCode.REQUEST_TIMEOUT,
          res
        );
      }, 30000);

      busboyParser.on("finish", () => {
        clearTimeout(parserTimeout);
      });

      req.pipe(busboyParser);
    });
  } else {
    // JSON request handling
    try {
      if (!req.body || typeof req.body !== "object") {
        return errorResponseHandler(
          "Invalid request body",
          httpStatusCode.BAD_REQUEST,
          res
        );
      }

      const {
        content,
        media,
        taggedUsers,
        visibility,
        storyType,
        textColor,
        fontFamily,
        textAlignment,
      } = req.body;

      if (!storyType) {
        return errorResponseHandler(
          "Story type is required",
          httpStatusCode.BAD_REQUEST,
          res
        );
      }
      if (!["text", "photo"].includes(storyType)) {
        return errorResponseHandler(
          `Invalid story type: ${storyType}`,
          httpStatusCode.BAD_REQUEST,
          res
        );
      }

      const hasContent = content && content.trim().length > 0;
      const hasMedia = media && typeof media === "object";

      if (storyType === "text" && !hasContent) {
        return errorResponseHandler(
          "Text content is required for text stories",
          httpStatusCode.BAD_REQUEST,
          res
        );
      }
      if (storyType === "photo" && !hasMedia) {
        return errorResponseHandler(
          "Media is required for photo stories",
          httpStatusCode.BAD_REQUEST,
          res
        );
      }

      // Validate content length if present (for both text and photo stories)
      if (hasContent && content.trim().length > 2000) {
        return errorResponseHandler(
          "Story content exceeds maximum length of 2000 characters",
          httpStatusCode.BAD_REQUEST,
          res
        );
      }

      if (storyType === "text") {
        if (!textColor) {
          return errorResponseHandler(
            "Text color is required for text stories",
            httpStatusCode.BAD_REQUEST,
            res
          );
        }
        if (!/^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$|^[a-zA-Z]+$/.test(textColor)) {
          return errorResponseHandler(
            "Invalid text color format",
            httpStatusCode.BAD_REQUEST,
            res
          );
        }
        if (!fontFamily) {
          return errorResponseHandler(
            "Font family is required for text stories",
            httpStatusCode.BAD_REQUEST,
            res
          );
        }
        if (!["left", "center", "right"].includes(textAlignment)) {
          return errorResponseHandler(
            "Invalid text alignment",
            httpStatusCode.BAD_REQUEST,
            res
          );
        }
      }

      if (hasMedia) {
        const { url, mediaType } = media;
        if (!url || typeof url !== "string" || !url.trim()) {
          return errorResponseHandler(
            "Media URL is required and must be a valid string",
            httpStatusCode.BAD_REQUEST,
            res
          );
        }
        if (!["image"].includes(mediaType)) {
          return errorResponseHandler(
            "Media type must be 'image' for photo stories",
            httpStatusCode.BAD_REQUEST,
            res
          );
        }
      }

      let validatedTaggedUsers: string[] = [];
      if (taggedUsers) {
        if (!Array.isArray(taggedUsers)) {
          return errorResponseHandler(
            "Tagged users must be an array",
            httpStatusCode.BAD_REQUEST,
            res
          );
        }
        if (taggedUsers.length > 20) {
          return errorResponseHandler(
            "Cannot tag more than 20 users in a story",
            httpStatusCode.BAD_REQUEST,
            res
          );
        }
        if (taggedUsers.includes(userId)) {
          return errorResponseHandler(
            "You cannot tag yourself in the story",
            httpStatusCode.BAD_REQUEST,
            res
          );
        }

        for (const id of taggedUsers) {
          if (typeof id !== "string" || !id.trim()) {
            return errorResponseHandler(
              "Invalid user ID in tagged users",
              httpStatusCode.BAD_REQUEST,
              res
            );
          }
          try {
            const userExists = await usersModel.findById(id.trim());
            if (!userExists) {
              return errorResponseHandler(
                `Tagged user ${id} not found`,
                httpStatusCode.BAD_REQUEST,
                res
              );
            }
            validatedTaggedUsers.push(id.trim());
          } catch (dbError) {
            console.error("Database error checking user:", dbError);
            return errorResponseHandler(
              "Error validating tagged users",
              httpStatusCode.INTERNAL_SERVER_ERROR,
              res
            );
          }
        }
      }

      const validVisibilities = Object.values(PostVisibility);
      const visibilityValue = visibility || PostVisibility.PUBLIC;
      if (!validVisibilities.includes(visibilityValue)) {
        return errorResponseHandler(
          "Invalid visibility setting",
          httpStatusCode.BAD_REQUEST,
          res
        );
      }

      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 24);

      const newStory = await storyModel.create({
        user: userId,
        content: content?.trim() || "", // Content is optional for photo stories
        media: storyType === "photo" ? media : null,
        taggedUsers: validatedTaggedUsers,
        visibility: visibilityValue,
        storyType,
        textColor: storyType === "text" ? textColor : undefined,
        fontFamily: storyType === "text" ? fontFamily : undefined,
        textAlignment: storyType === "text" ? textAlignment : undefined,
        expiresAt,
      });

      const populatedStory = await newStory.populate([
        { path: "user", select: "-password" },
        { path: "taggedUsers", select: "-password" },
      ]);

      // Send notifications to tagged users (non-blocking)
      if (validatedTaggedUsers.length > 0) {
        sendStoryTagNotifications(
          newStory._id.toString(),
          userId,
          validatedTaggedUsers,
          content
        ).catch((err) =>
          console.error("Error in story tag notifications:", err)
        );
      }

      // Send success response
      return res.status(httpStatusCode.CREATED).json({
        success: true,
        message: "Story created successfully",
        data: populatedStory,
      });
    } catch (error) {
      console.error("JSON story creation error:", error);
      return errorResponseHandler(
        (error as Error).message || "Error creating story",
        httpStatusCode.INTERNAL_SERVER_ERROR,
        res
      );
    }
  }
};

export const getUserStoriesService = async (req: Request, res: Response) => {
  const { userId } = req.params;

  const { id: currentUserId } = req.user as JwtPayload;

  const user = await usersModel.findById(userId);
  if (!user) {
    return errorResponseHandler(
      "User not found",
      httpStatusCode.NOT_FOUND,
      res
    );
  }

  const isFollowing = await followModel.findOne({
    follower_id: currentUserId,
    following_id: userId,
    relationship_status: FollowRelationshipStatus.FOLLOWING,
    is_approved: true,
  });

  const query: any = {
    user: userId,
    expiresAt: { $gt: new Date() },
  };

  if (userId !== currentUserId.toString() && !isFollowing) {
    query.visibility = PostVisibility.PUBLIC;
  }

  const stories = await storyModel
    .find(query)
    .sort({ createdAt: -1 })
    .populate("user", "-password")
    .populate("taggedUsers", "-password")
    .populate("viewedBy", "-password");

  if (stories.length === 0) {
    return errorResponseHandler(
      "No stories found",
      httpStatusCode.NOT_FOUND,
      res
    );
  }

  return {
    success: true,
    message: "Stories retrieved successfully",
    data: stories,
  };
};
export const getFollowingStoriesService = async (
  req: Request,
  res: Response
) => {
  const { id: userId } = req.user as JwtPayload;

  const following = await followModel
    .find({
      follower_id: userId,
      relationship_status: FollowRelationshipStatus.FOLLOWING,
      is_approved: true,
    })
    .select("following_id");

  const followingIds = following.map((f) => f.following_id);
  followingIds.push(userId); // Include user's own stories

  const stories = await storyModel
    .find({
      user: { $in: followingIds },
      expiresAt: { $gt: new Date() },
    })
    .sort({ createdAt: -1 })
    .populate("user", "-password")
    .populate("taggedUsers", "-password")
    .populate("viewedBy", "-password");

  if (stories.length === 0) {
    return errorResponseHandler(
      "No stories found",
      httpStatusCode.NOT_FOUND,
      res
    );
  }
  return {
    success: true,
    message: "Following stories retrieved successfully",
    data: stories,
  };
};
export const viewStoryService = async (req: Request, res: Response) => {
  const { id: userId } = req.user as JwtPayload;
  const { storyId } = req.params;

  const story = await storyModel.findById(storyId);

  if (!story) {
    return errorResponseHandler(
      "Story not found",
      httpStatusCode.NOT_FOUND,
      res
    );
  }

  if (story.expiresAt < new Date()) {
    return errorResponseHandler(
      "Story has expired",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

  // Skip adding to viewedBy if the user is the story's creator
  if (story.user.toString() !== userId.toString()) {
    // Check if user has already viewed the story
    if (!story.viewedBy.includes(userId)) {
      story.viewedBy.push(userId);
      await story.save();
    }
  }

  return {
    success: true,
    message: "Story viewed successfully",
  };
};
export const getStoryByIdService = async (req: Request, res: Response) => {
  try {
    const { id: userId } = req.user as JwtPayload;
    const { storyId } = req.params;

    const story = await storyModel
      .findById(storyId)
      .populate("user", "-password")
      .populate("taggedUsers", "-password")
      .populate("viewedBy", "-password");

    if (!story) {
      return errorResponseHandler(
        "Story not found",
        httpStatusCode.NOT_FOUND,
        res
      );
    }

    if (story.expiresAt < new Date()) {
      return errorResponseHandler(
        "Story has expired",
        httpStatusCode.BAD_REQUEST,
        res
      );
    }

    if (
      story.visibility !== PostVisibility.PUBLIC &&
      story.user._id.toString() !== userId.toString()
    ) {
      const isFollowing = await followModel.findOne({
        follower_id: userId,
        following_id: story.user._id,
        relationship_status: FollowRelationshipStatus.FOLLOWING,
        is_approved: true,
      });

      if (!isFollowing) {
        return errorResponseHandler(
          "Unauthorized to view this story",
          httpStatusCode.FORBIDDEN,
          res
        );
      }
    }

    return {
      success: true,
      message: "Story retrieved successfully",
      data: story,
    };
  } catch (error) {
    throw error;
  }
};

export const deleteStoryService = async (req: Request, res: Response) => {
  const { id: userId } = req.user as JwtPayload;
  const { storyId } = req.params;

  const story = await storyModel.findById(storyId);

  if (!story) {
    return errorResponseHandler(
      "Story not found or unauthorized",
      httpStatusCode.NOT_FOUND,
      res
    );
  }

  if (story.user.toString() !== userId.toString()) {
    return errorResponseHandler(
      "Unauthorized to delete this story",
      httpStatusCode.FORBIDDEN,
      res
    );
  }

  // Delete associated media file from S3 if it exists
  if (story.media && story.media.url) {
    // Since you're storing just the S3 key in the database,
    // we can use it directly for S3 deletion
    const s3Key = story.media.url; // This is your S3 key like: users/rishabh@auspicioussoft.com/image/jpeg/1750162813017-26f7719e-6d5a-404f-9e7e-451b439b2a83.JPEG
    await deleteFileFromS3(s3Key);
  }

  // Delete the story from database
  await story.deleteOne();

  return {
    success: true,
    message: "Story deleted successfully",
  };
};
