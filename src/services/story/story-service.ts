import { Request, Response } from "express";
import { httpStatusCode, PostVisibility } from "src/lib/constant";
import { errorResponseHandler } from "src/lib/errors/error-response-handler";
import { storyModel } from "src/models/story/story-schema";
import { JwtPayload } from "jsonwebtoken";
import { followModel } from "src/models/follow/follow-schema";
import { usersModel } from "src/models/user/user-schema";
import { FollowRelationshipStatus } from "src/lib/constant";
import { uploadStreamToS3Service } from "src/configF/s3";
import { customAlphabet } from "nanoid";
import { Readable } from "stream";
import busboy from "busboy";

export const createStoryService = async (req: Request, res: Response) => {
  try {
    // Authentication check
    if (!req.user) {
      return errorResponseHandler(
        'Authentication failed while creating story',
        httpStatusCode.UNAUTHORIZED,
        res
      );
    }

    const { id: userId, email } = req.user as JwtPayload;
    let parsedData: any = { content: '', taggedUsers: [], visibility: PostVisibility.PUBLIC };
    let media: any = null;

    if (req.headers['content-type']?.includes('multipart/form-data')) {
      return new Promise((resolve, reject) => {
        const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB limit
        const busboyParser = busboy({
          headers: req.headers,
          limits: { 
            fileSize: MAX_FILE_SIZE,
            files: 1, // Only allow one file
            fieldSize: 1024 * 1024, // 1MB field size limit
            fields: 10 // Limit number of fields
          },
        });
        
        let fileUploaded = false;
        let fileUploadPromise: Promise<void> | null = null;
        let hasError = false;

        // Helper function to handle errors and cleanup
        const handleError = (message: string, statusCode: number = httpStatusCode.INTERNAL_SERVER_ERROR) => {
          if (hasError) return; // Prevent multiple error responses
          hasError = true;
          reject(errorResponseHandler(message, statusCode, res));
        };

        busboyParser.on('field', (fieldname: string, value: string) => {
          if (hasError) return;
          
          try {
            // Validate field names
            const allowedFields = ['content', 'taggedUsers', 'visibility'];
            if (!allowedFields.includes(fieldname)) {
              return handleError(`Invalid field: ${fieldname}`, httpStatusCode.BAD_REQUEST);
            }

            // Validate field value length
            if (value.length > 10000) { // 10KB limit per field
              return handleError(`Field ${fieldname} exceeds maximum length`, httpStatusCode.BAD_REQUEST);
            }

            if (['taggedUsers', 'visibility'].includes(fieldname)) {
              try {
                parsedData[fieldname] = JSON.parse(value);
              } catch (parseError) {
                return handleError(
                  `Failed to parse ${fieldname}. Must be a valid JSON string`,
                  httpStatusCode.BAD_REQUEST
                );
              }
            } else {
              parsedData[fieldname] = value;
            }
          } catch (error) {
            console.error('Field processing error:', error);
            return handleError(
              `Error processing field ${fieldname}`,
              httpStatusCode.BAD_REQUEST
            );
          }
        });

        busboyParser.on('file', (fieldname: string, fileStream: any, fileInfo: any) => {
          if (hasError) {
            fileStream.resume();
            return;
          }

          if (fieldname !== 'media') {
            fileStream.resume();
            return handleError('Invalid file field name', httpStatusCode.BAD_REQUEST);
          }

          if (fileUploaded) {
            fileStream.resume();
            return handleError('Only one file is allowed', httpStatusCode.BAD_REQUEST);
          }

          const { filename, mimeType } = fileInfo;
          
          // Validate filename
          if (!filename || filename.trim() === '') {
            fileStream.resume();
            return handleError('Filename is required', httpStatusCode.BAD_REQUEST);
          }

          // Validate file type
          const isImage = mimeType.startsWith('image/');
          const isVideo = mimeType.startsWith('video/');
          if (!isImage && !isVideo) {
            fileStream.resume();
            return handleError(
              'Only image or video files are allowed for story media',
              httpStatusCode.BAD_REQUEST
            );
          }

          // Additional mime type validation
          const allowedImageTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
          const allowedVideoTypes = ['video/mp4', 'video/mpeg', 'video/quicktime', 'video/webm'];
          
          if (isImage && !allowedImageTypes.includes(mimeType)) {
            fileStream.resume();
            return handleError('Unsupported image format', httpStatusCode.BAD_REQUEST);
          }
          
          if (isVideo && !allowedVideoTypes.includes(mimeType)) {
            fileStream.resume();
            return handleError('Unsupported video format', httpStatusCode.BAD_REQUEST);
          }

          let fileSize = 0;
          let uploadTimeout: NodeJS.Timeout | null = null;

          // Handle file size limit
          fileStream.on('limit', () => {
            fileStream.resume();
            return handleError(
              `File size exceeds ${MAX_FILE_SIZE / (1024 * 1024)}MB limit`,
              httpStatusCode.BAD_REQUEST
            );
          });

          fileUploadPromise = new Promise<void>((resolveUpload, rejectUpload) => {
            const chunks: Buffer[] = [];
            
            fileStream.on('data', (chunk: Buffer) => {
              if (hasError) return;
              fileSize += chunk.length;
              chunks.push(chunk);
            });

            fileStream.on('end', async () => {
              if (hasError) return;
              
              try {
                if (chunks.length === 0) {
                  return rejectUpload(new Error('No file data received'));
                }

                const fileBuffer = Buffer.concat(chunks);
                
                // Validate actual file size
                if (fileBuffer.length === 0) {
                  return rejectUpload(new Error('Empty file received'));
                }

                const readableStream = new Readable();
                readableStream.push(fileBuffer);
                readableStream.push(null);

                // Set timeout for S3 upload
                uploadTimeout = setTimeout(() => {
                  rejectUpload(new Error('S3 upload timed out'));
                }, 30000); // 30 seconds

                const uploadedMediaUrl = await uploadStreamToS3Service(
                  readableStream,
                  filename,
                  mimeType,
                  email || `story_${customAlphabet('0123456789', 5)()}`
                );

                // Validate upload result
                if (!uploadedMediaUrl || typeof uploadedMediaUrl !== 'string') {
                  throw new Error('Failed to get valid upload URL');
                }

                // Clear timeout on success
                if (uploadTimeout) {
                  clearTimeout(uploadTimeout);
                  uploadTimeout = null;
                }

                media = {
                  url: uploadedMediaUrl,
                  mediaType: isImage ? 'image' : 'video',
                  filename: filename,
                  size: fileBuffer.length,
                  mimeType: mimeType
                };
                fileUploaded = true;
                resolveUpload();
              } catch (error) {
                // Clear timeout on error
                if (uploadTimeout) {
                  clearTimeout(uploadTimeout);
                  uploadTimeout = null;
                }
                console.error('File processing error:', error);
                rejectUpload(error);
              }
            });

            fileStream.on('error', (error: any) => {
              // Clear timeout on stream error
              if (uploadTimeout) {
                clearTimeout(uploadTimeout);
                uploadTimeout = null;
              }
              console.error('File stream error:', error);
              rejectUpload(error);
            });
          });
        });

        busboyParser.on('finish', async () => {
          if (hasError) return;
          
          try {
            // Wait for file upload if there was one
            if (fileUploadPromise) {
              await fileUploadPromise;
            }

            // Validate that story has content, media, or both
            const hasContent = parsedData.content && parsedData.content.trim().length > 0;
            const hasMedia = media !== null;

            if (!hasContent && !hasMedia) {
              return handleError(
                'Story must have either text content, media, or both',
                httpStatusCode.BAD_REQUEST
              );
            }

            // Validate content length if present
            if (hasContent && parsedData.content.trim().length > 2000) {
              return handleError(
                'Story content exceeds maximum length of 2000 characters',
                httpStatusCode.BAD_REQUEST
              );
            }

            // Validate and process tagged users
            let validatedTaggedUsers: string[] = [];
            if (parsedData.taggedUsers && Array.isArray(parsedData.taggedUsers)) {
              // Validate tagged users array length
              if (parsedData.taggedUsers.length > 20) {
                return handleError(
                  'Cannot tag more than 20 users in a story',
                  httpStatusCode.BAD_REQUEST
                );
              }

              // Check if user is trying to tag themselves
              if (parsedData.taggedUsers.includes(userId)) {
                return handleError(
                  'You cannot tag yourself in the story',
                  httpStatusCode.BAD_REQUEST
                );
              }

              // Validate each tagged user ID
              for (const id of parsedData.taggedUsers) {
                if (typeof id !== 'string' || !id.trim()) {
                  return handleError(
                    'Invalid user ID in tagged users',
                    httpStatusCode.BAD_REQUEST
                  );
                }

                try {
                  const userExists = await usersModel.findById(id.trim());
                  if (!userExists) {
                    return handleError(
                      `Tagged user ${id} not found`,
                      httpStatusCode.BAD_REQUEST
                    );
                  }
                  validatedTaggedUsers.push(id.trim());
                } catch (dbError) {
                  console.error('Database error checking user:', dbError);
                  return handleError(
                    'Error validating tagged users',
                    httpStatusCode.INTERNAL_SERVER_ERROR
                  );
                }
              }
            }

            // Validate visibility
            const validVisibilities = Object.values(PostVisibility);
            const visibility = parsedData.visibility || PostVisibility.PUBLIC;
            if (!validVisibilities.includes(visibility)) {
              return handleError(
                'Invalid visibility setting',
                httpStatusCode.BAD_REQUEST
              );
            }

            // Create expiration date (24 hours from now)
            const expiresAt = new Date();
            expiresAt.setHours(expiresAt.getHours() + 24);

            // Create story
            const newStory = await storyModel.create({
              user: userId,
              content: parsedData.content?.trim() || '',
              media,
              taggedUsers: validatedTaggedUsers,
              visibility: visibility,
              expiresAt,
            });

            // Populate story with user data
            const populatedStory = await newStory.populate([
              { path: 'user', select: '-password' },
              { path: 'taggedUsers', select: '-password' },
            ]);

            resolve({
              success: true,
              message: 'Story created successfully',
              data: populatedStory,
            });
          } catch (error) {
            console.error('Story creation error:', error);
            return handleError(
              (error as Error).message || 'Error creating story',
              httpStatusCode.INTERNAL_SERVER_ERROR
            );
          }
        });

        busboyParser.on('error', (error: any) => {
          console.error('Busboy error:', error);
          return handleError(
            error.message || 'Error processing file uploads',
            httpStatusCode.INTERNAL_SERVER_ERROR
          );
        });

        // Handle request stream errors
        req.on('error', (error) => {
          console.error('Request stream error:', error);
          return handleError(
            'Error reading request data',
            httpStatusCode.BAD_REQUEST
          );
        });

        req.pipe(busboyParser);
      });
    } else {
      // JSON request handling
      try {
        // Validate request body exists
        if (!req.body || typeof req.body !== 'object') {
          return errorResponseHandler(
            'Invalid request body',
            httpStatusCode.BAD_REQUEST,
            res
          );
        }

        // Validate that story has content, media, or both
        const hasContent = req.body.content && req.body.content.trim().length > 0;
        const hasMedia = req.body.media && typeof req.body.media === 'object';

        if (!hasContent && !hasMedia) {
          return errorResponseHandler(
            'Story must have either text content, media, or both',
            httpStatusCode.BAD_REQUEST,
            res
          );
        }

        // Validate content length if present
        if (hasContent && req.body.content.trim().length > 2000) {
          return errorResponseHandler(
            'Story content exceeds maximum length of 2000 characters',
            httpStatusCode.BAD_REQUEST,
            res
          );
        }

        // Validate media object if present
        if (hasMedia) {
          const { url, mediaType } = req.body.media;
          if (!url || typeof url !== 'string' || !url.trim()) {
            return errorResponseHandler(
              'Media URL is required and must be a valid string',
              httpStatusCode.BAD_REQUEST,
              res
            );
          }
          if (!mediaType || !['image', 'video'].includes(mediaType)) {
            return errorResponseHandler(
              'Media type must be either "image" or "video"',
              httpStatusCode.BAD_REQUEST,
              res
            );
          }
        }

        // Validate and process tagged users
        let validatedTaggedUsers: string[] = [];
        if (req.body.taggedUsers) {
          if (!Array.isArray(req.body.taggedUsers)) {
            return errorResponseHandler(
              'Tagged users must be an array',
              httpStatusCode.BAD_REQUEST,
              res
            );
          }

          if (req.body.taggedUsers.length > 20) {
            return errorResponseHandler(
              'Cannot tag more than 20 users in a story',
              httpStatusCode.BAD_REQUEST,
              res
            );
          }

          if (req.body.taggedUsers.includes(userId)) {
            return errorResponseHandler(
              'You cannot tag yourself in the story',
              httpStatusCode.BAD_REQUEST,
              res
            );
          }

          for (const id of req.body.taggedUsers) {
            if (typeof id !== 'string' || !id.trim()) {
              return errorResponseHandler(
                'Invalid user ID in tagged users',
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
              console.error('Database error checking user:', dbError);
              return errorResponseHandler(
                'Error validating tagged users',
                httpStatusCode.INTERNAL_SERVER_ERROR,
                res
              );
            }
          }
        }

        // Validate visibility
        const validVisibilities = Object.values(PostVisibility);
        const visibility = req.body.visibility || PostVisibility.PUBLIC;
        if (!validVisibilities.includes(visibility)) {
          return errorResponseHandler(
            'Invalid visibility setting',
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
          content: req.body.content?.trim() || '',
          media: req.body.media || null,
          taggedUsers: validatedTaggedUsers,
          visibility: visibility,
          expiresAt,
        });

        // Populate story with user data
        const populatedStory = await newStory.populate([
          { path: 'user', select: '-password' },
          { path: 'taggedUsers', select: '-password' },
        ]);

        return {
          success: true,
          message: 'Story created successfully',
          data: populatedStory,
        };
      } catch (error) {
        console.error('JSON story creation error:', error);
        return errorResponseHandler(
          (error as Error).message || 'Error creating story',
          httpStatusCode.INTERNAL_SERVER_ERROR,
          res
        );
      }
    }
  } catch (error) {
    console.error('Story service error:', error);
    return errorResponseHandler(
      'Unexpected error while creating story',
      httpStatusCode.INTERNAL_SERVER_ERROR,
      res
    );
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
    is_approved: true
  });

  const query: any = {
    user: userId,
    expiresAt: { $gt: new Date() }
  };

  if (userId !== currentUserId.toString() && !isFollowing) {
    query.visibility = PostVisibility.PUBLIC;
  }

  const stories = await storyModel
    .find(query)
    .sort({ createdAt: -1 })
    .populate('user', '-password')
    .populate('taggedUsers', '-password')
    .populate('viewedBy', '-password');

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
    data: stories
  };

};
export const getFollowingStoriesService = async (req: Request, res: Response) => {
  
    const { id: userId } = req.user as JwtPayload;

    const following = await followModel
      .find({
        follower_id: userId,
        relationship_status: FollowRelationshipStatus.FOLLOWING,
        is_approved: true
      })
      .select('following_id');

    const followingIds = following.map(f => f.following_id);
    followingIds.push(userId); // Include user's own stories

    const stories = await storyModel
      .find({
        user: { $in: followingIds },
        expiresAt: { $gt: new Date() }
      })
      .sort({ createdAt: -1 })
      .populate('user', '-password')
      .populate('taggedUsers', '-password')
      .populate('viewedBy', '-password');

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
      data: stories
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
    message: "Story viewed successfully"
  };
};
export const getStoryByIdService = async (req: Request, res: Response) => {
  try {
    const { id: userId } = req.user as JwtPayload;
    const { storyId } = req.params;

    const story = await storyModel
      .findById(storyId)
      .populate('user', '-password')
      .populate('taggedUsers', '-password')
      .populate('viewedBy', '-password');

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
        is_approved: true
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
      data: story
    };
  } catch (error) {
    throw error;
  }
};
export const deleteStoryService = async (req: Request, res: Response) => {
  
  const { id: userId } = req.user as JwtPayload;
  const { storyId } = req.params;

  const story = await storyModel.findOne({
    _id: storyId,
    user: userId
  });

  if (!story) {
    return errorResponseHandler(
      "Story not found or unauthorized",
      httpStatusCode.NOT_FOUND,
      res
    );
  }

  await story.deleteOne();

  return {
    success: true,
    message: "Story deleted successfully"
  };

};