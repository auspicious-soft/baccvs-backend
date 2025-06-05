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
  if (!req.user) {
    return errorResponseHandler(
      'Authentication failed while creating story',
      httpStatusCode.UNAUTHORIZED,
      res
    );
  }

  const { id: userId, email } = req.user as JwtPayload;
  let parsedData: any = { content: '', taggedUsers: [], visibility: PostVisibility.PUBLIC };
  let media: any = null; // Changed from string | null to any

  // Handle multipart/form-data for file uploads
  if (req.headers['content-type']?.includes('multipart/form-data')) {
    return new Promise((resolve, reject) => {
      const busboyParser = busboy({ headers: req.headers });
      let fileUploaded = false;
      let fileUploadPromise: Promise<void> | null = null;

      busboyParser.on('field', (fieldname: string, value: string) => {
        console.log(`Busboy - Received field: ${fieldname}=${value}`);
        
        if (['taggedUsers', 'visibility'].includes(fieldname)) {
          try {
            parsedData[fieldname] = JSON.parse(value);
          } catch (error) {
            console.log(`Busboy - Failed to parse ${fieldname}:`, error instanceof Error ? error.message : String(error));
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

      busboyParser.on('file', (fieldname: string, fileStream: any, fileInfo: any) => {
        console.log(`Busboy - Received file: ${fieldname}`, fileInfo);
        
        if (fieldname !== 'media') {
          console.log(`Skipping file field: ${fieldname}`);
          fileStream.resume(); // Drain the stream
          return;
        }

        if (fileUploaded) {
          console.log('File already uploaded, skipping');
          fileStream.resume(); // Drain the stream
          return;
        }

        const { filename, mimeType } = fileInfo;
        console.log(`Processing file: ${filename}, type: ${mimeType}`);

        // Validate file type (image or video)
        const isImage = mimeType.startsWith('image/');
        const isVideo = mimeType.startsWith('video/');
        if (!isImage && !isVideo) {
          console.log(`Invalid file type: ${mimeType}`);
          fileStream.resume(); // Drain the stream
          return reject({
            success: false,
            message: 'Only image or video files are allowed for story media',
            code: httpStatusCode.BAD_REQUEST,
          });
        }

        // Create a promise for the file upload
        fileUploadPromise = new Promise<void>((resolveUpload, rejectUpload) => {
          // Collect file chunks
          const chunks: Buffer[] = [];
          
          fileStream.on('data', (chunk: Buffer) => {
            chunks.push(chunk);
          });

          fileStream.on('end', async () => {
            try {
              console.log(`File stream ended. Total chunks: ${chunks.length}`);
              
              if (chunks.length === 0) {
                return rejectUpload(new Error('No file data received'));
              }

              // Combine all chunks into a single buffer
              const fileBuffer = Buffer.concat(chunks);
              console.log(`File buffer size: ${fileBuffer.length} bytes`);

              // Create readable stream from buffer
              const readableStream = new Readable();
              readableStream.push(fileBuffer);
              readableStream.push(null); // End the stream

              // Upload to S3
              const uploadedMediaUrl = await uploadStreamToS3Service(
                readableStream,
                filename,
                mimeType,
                email || `story_${customAlphabet('0123456789', 5)()}`
              );
              
              // Create media object that matches your schema
              media = {
                url: uploadedMediaUrl,
                mediaType: isImage ? 'image' : 'video'
              };
              
              console.log(`File uploaded successfully: ${uploadedMediaUrl}`);
              fileUploaded = true;
              resolveUpload();
            } catch (error) {
              console.error('File processing error:', error);
              rejectUpload(error);
            }
          });

          fileStream.on('error', (error: any) => {
            console.error('File stream error:', error);
            rejectUpload(error);
          });
        });
      });

      busboyParser.on('finish', async () => {
        console.log('Busboy finished parsing');
        console.log('Parsed data:', parsedData);
        
        try {
          // Wait for file upload to complete if there was a file
          if (fileUploadPromise) {
            console.log('Waiting for file upload to complete...');
            await fileUploadPromise;
          }
          
          console.log('Media uploaded:', media);
          
          // Validate content or media presence
          if (!parsedData.content && !media) {
            return reject({
              success: false,
              message: 'Story must have either text content or media',
              code: httpStatusCode.BAD_REQUEST,
            });
          }

          // Validate tagged users
          let validatedTaggedUsers: string[] = [];
          if (parsedData.taggedUsers && Array.isArray(parsedData.taggedUsers)) {
            if (parsedData.taggedUsers.includes(userId)) {
              return reject({
                success: false,
                message: 'You cannot tag yourself in the story',
                code: httpStatusCode.BAD_REQUEST,
              });
            }

            for (const id of parsedData.taggedUsers) {
              const userExists = await usersModel.findById(id);
              if (!userExists) {
                return reject({
                  success: false,
                  message: `Tagged user ${id} not found`,
                  code: httpStatusCode.BAD_REQUEST,
                });
              }
              validatedTaggedUsers.push(id);
            }
          }

          // Set expiration time to 24 hours from now
          const expiresAt = new Date();
          expiresAt.setHours(expiresAt.getHours() + 24);

          // Create story
          const newStory = await storyModel.create({
            user: userId,
            content: parsedData.content,
            media, // Now this is an object or null
            taggedUsers: validatedTaggedUsers,
            visibility: parsedData.visibility || PostVisibility.PUBLIC,
            expiresAt,
          });

          // Populate user and taggedUsers
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
          reject({
            success: false,
            message: error instanceof Error ? error.message : 'Failed to create story',
            code: httpStatusCode.INTERNAL_SERVER_ERROR,
          });
        }
      });

      busboyParser.on('error', (error: any) => {
        console.error('Busboy error:', error);
        reject({
          success: false,
          message: error.message || 'Error processing file uploads',
          code: httpStatusCode.INTERNAL_SERVER_ERROR,
        });
      });

      req.pipe(busboyParser);
    });
  } else {
    // Handle JSON request
    if (!req.body.content && !req.body.media) {
      return errorResponseHandler(
        'Story must have either text content or media',
        httpStatusCode.BAD_REQUEST,
        res
      );
    }

    // Validate tagged users
    let validatedTaggedUsers: string[] = [];
    if (req.body.taggedUsers && Array.isArray(req.body.taggedUsers)) {
      if (req.body.taggedUsers.includes(userId)) {
        return errorResponseHandler(
          'You cannot tag yourself in the story',
          httpStatusCode.BAD_REQUEST,
          res
        );
      }

      for (const id of req.body.taggedUsers) {
        const userExists = await usersModel.findById(id);
        if (!userExists) {
          return errorResponseHandler(
            `Tagged user ${id} not found`,
            httpStatusCode.BAD_REQUEST,
            res
          );
        }
        validatedTaggedUsers.push(id);
      }
    }

    // Set expiration time to 24 hours from now
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);

    // Create story
    const newStory = await storyModel.create({
      user: userId,
      content: req.body.content,
      media: req.body.media, // This should also be an object if coming from JSON
      taggedUsers: validatedTaggedUsers,
      visibility: req.body.visibility || PostVisibility.PUBLIC,
      expiresAt,
    });

    // Populate user and taggedUsers
    const populatedStory = await newStory.populate([
      { path: 'user', select: '-password' },
      { path: 'taggedUsers', select: '-password' },
    ]);

    return {
      success: true,
      message: 'Story created successfully',
      data: populatedStory,
    };
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