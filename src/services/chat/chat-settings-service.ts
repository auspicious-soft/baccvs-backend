import { Request, Response } from "express";
import { Conversation } from "../../models/chat/conversation-schema";
import { SquadConversation } from "../../models/chat/squad-conversation-schema";
import { CommunityConversation } from "../../models/chat/community-conversation-schema";
import { httpStatusCode } from "../../lib/constant";
import { errorResponseHandler } from "../../lib/errors/error-response-handler";
import mongoose from "mongoose";
import { uploadStreamToS3Service } from "src/configF/s3";
import { customAlphabet } from "nanoid";
import { Readable } from "stream";
import busboy from "busboy";

// Toggle pin status for a direct conversation
export const togglePinDirectConversationService = async (req: any, res: Response) => {
  const userId = req.user.id;
  const { conversationId } = req.params;

    // Check if conversation exists and user is a participant
    const conversation = await Conversation.findOne({
      _id: conversationId,
      participants: userId,
      isActive: true
    });

    if (!conversation) {
      return errorResponseHandler(
        "Conversation not found or you're not a participant",
        httpStatusCode.NOT_FOUND,
        res
      );
    }

    // Toggle pin status for this user
    const isPinned = conversation.isPinned.get(userId) || false;
    conversation.isPinned.set(userId, !isPinned);
    await conversation.save();

    return {
      success: true,
      message: "Pin status updated successfully",
      isPinned: !isPinned
    };
};

// Toggle pin status for a squad conversation
export const togglePinSquadConversationService = async (req: any, res: Response) => {
  const userId = req.user.id;
  const { squadConversationId } = req.params;

    const squadConversation = await SquadConversation.findById(squadConversationId);
    
    if (!squadConversation) {
      return errorResponseHandler(
        "Squad conversation not found",
        httpStatusCode.NOT_FOUND,
        res
      );
    }

    // Check if user is a member of the squad
    const squad = await mongoose.model('Squad').findOne({
      _id: squadConversation.squad,
      "members.user": userId
    });

    if (!squad) {
      return errorResponseHandler(
        "You are not a member of this squad",
        httpStatusCode.FORBIDDEN,
        res
      );
    }

    // Toggle pin status for this user
    const isPinned = (squadConversation as any).isPinned?.get(userId) || false;
    (squadConversation as any).isPinned?.set(userId, !isPinned);
    await squadConversation.save();

    return {
      success: true,
      isPinned: !isPinned
    };

};

// Toggle pin status for a community conversation
export const togglePinCommunityConversationService = async (req: any, res: Response) => {
  const userId = req.user.id;
  const { communityConversationId } = req.params;

    const communityConversation = await CommunityConversation.findById(communityConversationId);
    
    if (!communityConversation) {
      return errorResponseHandler(
        "Community conversation not found",
        httpStatusCode.NOT_FOUND,
        res
      );
    }

    // Check if user is a member of the community
    const community = await mongoose.model('Community').findOne({
      _id: communityConversation.community,
      "members.user": userId
    });

    if (!community) {
      return errorResponseHandler(
        "You are not a member of this community",
        httpStatusCode.FORBIDDEN,
        res
      );
    }

    // Toggle pin status for this user
    const isPinned = communityConversation.isPinned.get(userId) || false;
    communityConversation.isPinned.set(userId, !isPinned);
    await communityConversation.save();

    return {
      success: true,
      isPinned: !isPinned
    };

};

// Update background for direct conversation
export const updateDirectConversationBackgroundService = async (req: any, res: Response) => {
  const userId = req.user.id;
  const email = req.user.email;
  const { conversationId } = req.params;

  // Check if conversation exists and user is a participant
  const conversation = await Conversation.findOne({
    _id: conversationId,
    participants: userId,
    isActive: true
  });

  if (!conversation) {
    return errorResponseHandler(
      "Conversation not found or you're not a participant",
      httpStatusCode.NOT_FOUND,
      res
    );
  }

  if (req.headers["content-type"]?.includes("multipart/form-data")) {
    return new Promise<void>((resolve) => {
      const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB limit for background images
      const busboyParser = busboy({
        headers: req.headers,
        limits: {
          fileSize: MAX_FILE_SIZE,
          files: 1,
          fieldSize: 1024 * 100, // 100KB for fields
          fields: 5,
        },
      });

      let parsedData: any = {
        backgroundColor: null
      };
      let backgroundImageUrl: string | null = null;
      let fileUploaded = false;
      let fileUploadPromise: Promise<void> | null = null;
      let hasError = false;

      const handleError = (message: string, statusCode: number = httpStatusCode.INTERNAL_SERVER_ERROR) => {
        if (hasError) return;
        hasError = true;
        errorResponseHandler(message, statusCode, res);
        resolve();
      };

      busboyParser.on("field", (fieldname: string, value: string) => {
        if (hasError) return;

        try {
          if (fieldname === "backgroundColor") {
            // Validate hex color format
            if (value && !/^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/.test(value)) {
              return handleError("Invalid background color format. Use hex format (#RRGGBB or #RGB)", httpStatusCode.BAD_REQUEST);
            }
            parsedData.backgroundColor = value || null;
          } else {
            return handleError(`Invalid field: ${fieldname}`, httpStatusCode.BAD_REQUEST);
          }
        } catch (error) {
          console.error("Field processing error:", error);
          return handleError(`Error processing field ${fieldname}`, httpStatusCode.BAD_REQUEST);
        }
      });

      busboyParser.on("file", (fieldname: string, fileStream: any, fileInfo: any) => {
        if (hasError) {
          fileStream.resume();
          return;
        }

        if (fieldname !== "backgroundImage") {
          fileStream.resume();
          return handleError("Invalid file field name. Use 'backgroundImage'", httpStatusCode.BAD_REQUEST);
        }

        if (fileUploaded) {
          fileStream.resume();
          return handleError("Only one background image is allowed", httpStatusCode.BAD_REQUEST);
        }

        const { filename, mimeType } = fileInfo;

        if (!filename || filename.trim() === "") {
          fileStream.resume();
          return handleError("Filename is required", httpStatusCode.BAD_REQUEST);
        }

        const isImage = mimeType.startsWith("image/");
        if (!isImage) {
          fileStream.resume();
          return handleError("Only image files are allowed for background", httpStatusCode.BAD_REQUEST);
        }

        const allowedImageTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
        if (!allowedImageTypes.includes(mimeType)) {
          fileStream.resume();
          return handleError("Unsupported image format. Use JPEG, PNG, GIF, or WebP", httpStatusCode.BAD_REQUEST);
        }

        let fileSize = 0;
        let uploadTimeout: NodeJS.Timeout | null = null;

        fileUploadPromise = new Promise<void>((resolveUpload, rejectUpload) => {
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

              // Create unique filename for background image
              const uniqueFileName = `background_${conversationId}_${userId}_${Date.now()}_${filename}`;
              
              const uploadedImageUrl = await uploadStreamToS3Service(
                readableStream,
                uniqueFileName,
                mimeType,
                email || `background_${customAlphabet("0123456789", 5)()}`
              );

              if (!uploadedImageUrl || typeof uploadedImageUrl !== "string") {
                throw new Error("Failed to get valid upload URL");
              }

              if (uploadTimeout) {
                clearTimeout(uploadTimeout);
                uploadTimeout = null;
              }

              backgroundImageUrl = uploadedImageUrl;
              fileUploaded = true;
              resolveUpload();
            } catch (error) {
              if (uploadTimeout) {
                clearTimeout(uploadTimeout);
                uploadTimeout = null;
              }
              console.error("Background image upload error:", error);
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
        });
      });

      busboyParser.on("finish", async () => {
        if (hasError) return;

        try {
          if (fileUploadPromise) {
            await fileUploadPromise;
          }

          // Get current background settings for this user
          const currentSettings : any = conversation.backgroundSettings.get(userId) || {};

          // Update background settings for this user
          const newSettings = {
            backgroundImage: backgroundImageUrl || currentSettings.backgroundImage || null,
            backgroundColor: parsedData.backgroundColor !== undefined ? parsedData.backgroundColor : currentSettings.backgroundColor || null
          };

          conversation.backgroundSettings.set(userId, newSettings);
          await conversation.save();

          // Send success response
          res.status(httpStatusCode.OK).json({
            success: true,
            message: "Background updated successfully",
            data: newSettings
          });
          resolve();
        } catch (error) {
          console.error("Background update error:", error);
          return handleError(
            (error as Error).message || "Error updating background",
            httpStatusCode.INTERNAL_SERVER_ERROR
          );
        }
      });

      busboyParser.on("error", (error: any) => {
        console.error("Busboy error:", error);
        return handleError(
          error.message || "Error processing file upload",
          httpStatusCode.INTERNAL_SERVER_ERROR
        );
      });

      req.on("error", (error : any) => {
        console.error("Request stream error:", error);
        return handleError("Error reading request data", httpStatusCode.BAD_REQUEST);
      });

      // Add timeout for busboy parsing
      const parserTimeout = setTimeout(() => {
        handleError("Request parsing timed out", httpStatusCode.REQUEST_TIMEOUT);
      }, 30000);

      busboyParser.on("finish", () => {
        clearTimeout(parserTimeout);
      });

      req.pipe(busboyParser);
    });
  } else {
    // JSON request handling (for backgroundColor only)
      if (!req.body || typeof req.body !== "object") {
        return errorResponseHandler("Invalid request body", httpStatusCode.BAD_REQUEST, res);
      }

      const { backgroundColor } = req.body;

      // Validate backgroundColor if provided
      if (backgroundColor && !/^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/.test(backgroundColor)) {
        return errorResponseHandler("Invalid background color format. Use hex format (#RRGGBB or #RGB)", httpStatusCode.BAD_REQUEST, res);
      }

      // Get current background settings for this user
      const currentSettings : any = conversation.backgroundSettings.get(userId) || {};

      // Update background settings for this user
      const newSettings = {
        backgroundImage: currentSettings.backgroundImage || null,
        backgroundColor: backgroundColor || null
      };

      conversation.backgroundSettings.set(userId, newSettings);
      await conversation.save();

      return{
        success: true,
        message: "Background color updated successfully",
        data: newSettings
      };

  }
};

// Update background for squad conversation
export const updateSquadConversationBackgroundService = async (req: any, res: Response) => {
  const userId = req.user.id;
  const email = req.user.email;
  const { squadConversationId } = req.params;

  // Check if squad conversation exists
  try {
    const squadConversation = await SquadConversation.findById(squadConversationId);
    
    if (!squadConversation) {
      const error = new Error("Squad conversation not found") as any;
      error.statusCode = httpStatusCode.NOT_FOUND;
      throw error;
    }

    // Check if user is a member of the squad
    const squad = await mongoose.model('Squad').findOne({
      _id: squadConversation.squad,
      "members.user": userId 
    });

    if (!squad) {
      const error = new Error("You are not a member of this squad") as any;
      error.statusCode = httpStatusCode.FORBIDDEN;
      throw error;
    }

    if (req.headers["content-type"]?.includes("multipart/form-data")) {
      return new Promise<any>((resolve) => {
        const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB limit for background images
        const busboyParser = busboy({
          headers: req.headers,
          limits: {
            fileSize: MAX_FILE_SIZE,
            files: 1,
            fieldSize: 1024 * 100, // 100KB for fields
            fields: 5,
          },
        });

        let parsedData: any = {
          backgroundColor: null
        };
        let backgroundImageUrl: string | null = null;
        let fileUploaded = false;
        let fileUploadPromise: Promise<void> | null = null;
        let hasError = false;

        const handleError = (message: string, statusCode: number = httpStatusCode.INTERNAL_SERVER_ERROR) => {
          if (hasError) return;
          hasError = true;
          const error = new Error(message) as any;
          error.statusCode = statusCode;
          throw error;
        };

        busboyParser.on("field", (fieldname: string, value: string) => {
          if (hasError) return;

          try {
            if (fieldname === "backgroundColor") {
              // Validate hex color format
              if (value && !/^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/.test(value)) {
                handleError("Invalid background color format. Use hex format (#RRGGBB or #RGB)", httpStatusCode.BAD_REQUEST);
                return;
              }
              parsedData.backgroundColor = value || null;
            } else {
              handleError(`Invalid field: ${fieldname}`, httpStatusCode.BAD_REQUEST);
              return;
            }
          } catch (error) {
            console.error("Field processing error:", error);
            handleError(`Error processing field ${fieldname}`, httpStatusCode.BAD_REQUEST);
          }
        });

        busboyParser.on("file", (fieldname: string, fileStream: any, fileInfo: any) => {
          if (hasError) {
            fileStream.resume();
            return;
          }

          if (fieldname !== "backgroundImage") {
            fileStream.resume();
            handleError("Invalid file field name. Use 'backgroundImage'", httpStatusCode.BAD_REQUEST);
            return;
          }

          if (fileUploaded) {
            fileStream.resume();
            handleError("Only one background image is allowed", httpStatusCode.BAD_REQUEST);
            return;
          }

          const { filename, mimeType } = fileInfo;

          if (!filename || filename.trim() === "") {
            fileStream.resume();
            handleError("Filename is required", httpStatusCode.BAD_REQUEST);
            return;
          }

          const isImage = mimeType.startsWith("image/");
          if (!isImage) {
            fileStream.resume();
            handleError("Only image files are allowed for background", httpStatusCode.BAD_REQUEST);
            return;
          }

          const allowedImageTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
          if (!allowedImageTypes.includes(mimeType)) {
            fileStream.resume();
            handleError("Unsupported image format. Use JPEG, PNG, GIF, or WebP", httpStatusCode.BAD_REQUEST);
            return;
          }

          let fileSize = 0;
          let uploadTimeout: NodeJS.Timeout | null = null;

          fileUploadPromise = new Promise<void>((resolveUpload, rejectUpload) => {
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

                // Create unique filename for background image
                const uniqueFileName = `squad_background_${squadConversationId}_${userId}_${Date.now()}_${filename}`;
                
                const uploadedImageUrl = await uploadStreamToS3Service(
                  readableStream,
                  uniqueFileName,
                  mimeType,
                  email || `squad_background_${customAlphabet("0123456789", 5)()}`
                );

                if (!uploadedImageUrl || typeof uploadedImageUrl !== "string") {
                  throw new Error("Failed to get valid upload URL");
                }

                if (uploadTimeout) {
                  clearTimeout(uploadTimeout);
                  uploadTimeout = null;
                }

                backgroundImageUrl = uploadedImageUrl;
                fileUploaded = true;
                resolveUpload();
              } catch (error) {
                if (uploadTimeout) {
                  clearTimeout(uploadTimeout);
                  uploadTimeout = null;
                }
                console.error("Background image upload error:", error);
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
          });
        });

        busboyParser.on("finish", async () => {
          if (hasError) return;

          try {
            if (fileUploadPromise) {
              await fileUploadPromise;
            }

            // Get current background settings for this user
            const currentSettings = (squadConversation as any).backgroundSettings.get(userId) || {};

            // Update background settings for this user
            const newSettings = {
              backgroundImage: backgroundImageUrl || currentSettings.backgroundImage || null,
              backgroundColor: parsedData.backgroundColor !== undefined ? parsedData.backgroundColor : currentSettings.backgroundColor || null
            };

            (squadConversation as any).backgroundSettings.set(userId, newSettings);
            await squadConversation.save();

            // Return success data instead of sending response
            resolve({
              success: true,
              message: "Squad background updated successfully",
              backgroundSettings: newSettings
            });
          } catch (error) {
            console.error("Squad background update error:", error);
            handleError(
              (error as Error).message || "Error updating squad background",
              httpStatusCode.INTERNAL_SERVER_ERROR
            );
          }
        });

        busboyParser.on("error", (error: any) => {
          console.error("Busboy error:", error);
          handleError(
            error.message || "Error processing file upload",
            httpStatusCode.INTERNAL_SERVER_ERROR
          );
        });

        req.on("error", (error: any) => {
          console.error("Request stream error:", error);
          handleError("Error reading request data", httpStatusCode.BAD_REQUEST);
        });

        // Add timeout for busboy parsing
        const parserTimeout = setTimeout(() => {
          handleError("Request parsing timed out", httpStatusCode.REQUEST_TIMEOUT);
        }, 30000);

        busboyParser.on("finish", () => {
          clearTimeout(parserTimeout);
        });

        req.pipe(busboyParser);
      });
    } else {
      // JSON request handling (for backgroundColor only)
      try {
        if (!req.body || typeof req.body !== "object") {
          const error = new Error("Invalid request body") as any;
          error.statusCode = httpStatusCode.BAD_REQUEST;
          throw error;
        }

        const { backgroundColor } = req.body;

        // Validate backgroundColor if provided
        if (backgroundColor && !/^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/.test(backgroundColor)) {
          const error = new Error("Invalid background color format. Use hex format (#RRGGBB or #RGB)") as any;
          error.statusCode = httpStatusCode.BAD_REQUEST;
          throw error;
        }

        // Get current background settings for this user
        const currentSettings = (squadConversation as any).backgroundSettings.get(userId) || {};

        // Update background settings for this user
        const newSettings = {
          backgroundImage: currentSettings.backgroundImage || null,
          backgroundColor: backgroundColor || null
        };

        (squadConversation as any).backgroundSettings.set(userId, newSettings);
        await squadConversation.save();

        return {
          success: true,
          message: "Squad background color updated successfully",
          backgroundSettings: newSettings
        };
      } catch (error: any) {
        console.error("JSON squad background update error:", error);
        // Add statusCode to error if not present
        if (!error.statusCode) {
          error.statusCode = httpStatusCode.INTERNAL_SERVER_ERROR;
        }
        throw error;
      }
    }
  } catch (error: any) {
    console.error("Squad conversation background service error:", error);
    if (!error.statusCode) {
      error.statusCode = httpStatusCode.INTERNAL_SERVER_ERROR;
    }
    throw error;
  }
};

// Update background for community conversation
export const updateCommunityConversationBackgroundService = async (req: any, res: Response) => {
  const userId = req.user.id;
  const { communityConversationId } = req.params;
  const { backgroundImage, backgroundColor } = req.body;

    const communityConversation = await CommunityConversation.findById(communityConversationId);
    
    if (!communityConversation) {
      return errorResponseHandler(
        "Community conversation not found",
        httpStatusCode.NOT_FOUND,
        res
      );
    }

    // Check if user is a member of the community
    const community = await mongoose.model('Community').findOne({
      _id: communityConversation.community,
      "members.user": userId
    });

    if (!community) {
      return errorResponseHandler(
        "You are not a member of this community",
        httpStatusCode.FORBIDDEN,
        res
      );
    }

    // Update background settings for this user
    communityConversation.backgroundSettings.set(userId, {
      backgroundImage: backgroundImage || null,
      backgroundColor: backgroundColor || null
    });
    await communityConversation.save();

    return {
      success: true,
      message: "Background updated successfully",
      backgroundSettings: communityConversation.backgroundSettings.get(userId)
    };
 
};
