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
  let media: any = null;

  if (req.headers['content-type']?.includes('multipart/form-data')) {
    return new Promise((resolve, reject) => {
      const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB limit
      const busboyParser = busboy({
        headers: req.headers,
        limits: { fileSize: MAX_FILE_SIZE }, // Limit file size
      });
      let fileUploaded = false;
      let fileUploadPromise: Promise<void> | null = null;

      busboyParser.on('field', (fieldname: string, value: string) => {
        try {
          if (['taggedUsers', 'visibility'].includes(fieldname)) {
            parsedData[fieldname] = JSON.parse(value);
          } else {
            parsedData[fieldname] = value;
          }
        } catch (error) {
          return errorResponseHandler(
            `Failed to parse ${fieldname}. Must be a valid JSON string`,
            httpStatusCode.BAD_REQUEST,
            res
          );
        }
      });

     busboyParser.on('file', (fieldname: string, fileStream: any, fileInfo: any) => {
  if (fieldname !== 'media' || fileUploaded) {
    fileStream.resume(); // Drain the stream
    return;
  }

  const { filename, mimeType } = fileInfo;
  const isImage = mimeType.startsWith('image/');
  const isVideo = mimeType.startsWith('video/');
  if (!isImage && !isVideo) {
    fileStream.resume();
    return errorResponseHandler(
      'Only image or video files are allowed for story media',
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

  // Track file size
  let fileSize = 0;
  fileStream.on('limit', () => {
    fileStream.resume();
    return errorResponseHandler(
      `File size exceeds ${MAX_FILE_SIZE / (1024 * 1024)}MB limit`,
      httpStatusCode.BAD_REQUEST,
      res
    );
  });

  // Declare uploadTimeout in the outer scope
  let uploadTimeout: NodeJS.Timeout | null = null;

  fileUploadPromise = new Promise<void>((resolveUpload, rejectUpload) => {
    const chunks: Buffer[] = [];
    fileStream.on('data', (chunk: Buffer) => {
      fileSize += chunk.length;
      chunks.push(chunk);
    });

    fileStream.on('end', async () => {
      try {
        if (chunks.length === 0) {
          return rejectUpload(new Error('No file data received'));
        }

        const fileBuffer = Buffer.concat(chunks);
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

        // Clear timeout on success
        if (uploadTimeout) {
          clearTimeout(uploadTimeout);
          uploadTimeout = null;
        }

        media = {
          url: uploadedMediaUrl,
          mediaType: isImage ? 'image' : 'video',
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
        try {
          if (fileUploadPromise) {
            await fileUploadPromise;
          }

          if (!parsedData.content && !media) {
            return errorResponseHandler(
              'Story must have either text content or media',
              httpStatusCode.BAD_REQUEST,
              res
            );
          }

          let validatedTaggedUsers: string[] = [];
          if (parsedData.taggedUsers && Array.isArray(parsedData.taggedUsers)) {
            if (parsedData.taggedUsers.includes(userId)) {
              return errorResponseHandler(
                'You cannot tag yourself in the story',
                httpStatusCode.BAD_REQUEST,
                res
              );
            }

            for (const id of parsedData.taggedUsers) {
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

          const expiresAt = new Date();
          expiresAt.setHours(expiresAt.getHours() + 24);

          const newStory = await storyModel.create({
            user: userId,
            content: parsedData.content,
            media,
            taggedUsers: validatedTaggedUsers,
            visibility: parsedData.visibility || PostVisibility.PUBLIC,
            expiresAt,
          });

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
          return errorResponseHandler(
            (error as Error).message || 'Error creating story',
            httpStatusCode.INTERNAL_SERVER_ERROR,
            res
          );
        }
      });

      busboyParser.on('error', (error: any) => {
        console.error('Busboy error:', error);
        return errorResponseHandler(
          error.message || 'Error processing file uploads',
          httpStatusCode.INTERNAL_SERVER_ERROR,
          res
        );
      });

      req.pipe(busboyParser);
    });
  } else {
    // JSON request handling (unchanged for brevity, but add try-catch)
    try {
      if (!req.body.content && !req.body.media) {
        return errorResponseHandler(
          'Story must have either text content or media',
          httpStatusCode.BAD_REQUEST,
          res
        );
      }

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

      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 24);

      const newStory = await storyModel.create({
        user: userId,
        content: req.body.content,
        media: req.body.media,
        taggedUsers: validatedTaggedUsers,
        visibility: req.body.visibility || PostVisibility.PUBLIC,
        expiresAt,
      });

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