import { FollowRelationshipStatus, httpStatusCode, PostVisibility } from "src/lib/constant";
import { errorResponseHandler, formatErrorResponse } from "src/lib/errors/error-response-handler";
import { postModels } from "src/models/post/post-schema";
import { Request, Response } from "express";
import { JwtPayload } from "jsonwebtoken";
import { object } from "webidl-conversions";
import mongoose from 'mongoose';
import { usersModel } from "src/models/user/user-schema";
import { followModel } from "src/models/follow/follow-schema";
import { LikeModel } from "src/models/like/like-schema";
import { Comment } from "src/models/comment/comment-schema";
import { RepostModel } from "src/models/repost/repost-schema";
import { log } from "console";
import { Readable } from 'stream';
import Busboy from 'busboy';
import { uploadStreamToS3Service } from "src/configF/s3";

export const createPostService = async (req: any, res: Response) => {
  if (!req.user) {
    return errorResponseHandler("Authentication failed", httpStatusCode.UNAUTHORIZED, res);
  }

  const { id: userId, email: userEmail } = req.user;

  // Check content type - always expect multipart/form-data since files are always included
  if (!req.headers['content-type']?.includes('multipart/form-data')) {
    return errorResponseHandler('Content-Type must be multipart/form-data', httpStatusCode.BAD_REQUEST, res);
  }

  return new Promise((resolve, reject) => {
    const busboy = Busboy({ headers: req.headers });
    const uploadPromises: Promise<string>[] = [];
    const formData: any = {};

    busboy.on('field', (fieldname: string, value: string) => {
      // Handle form fields
      if (fieldname === 'taggedUsers') {
        try {
          formData[fieldname] = JSON.parse(value);
        } catch {
          formData[fieldname] = value;
        }
      } else {
        formData[fieldname] = value;
      }
    });

    busboy.on('file', async (fieldname: string, fileStream: any, fileInfo: any) => {
      if (fieldname !== 'photos') {
        fileStream.resume(); // Skip non-photo files
        return;
      }

      const { filename, mimeType } = fileInfo;
      
      // Validate file type (optional - add your validation rules)
      if (!mimeType.startsWith('image/')) {
        fileStream.resume();
        return reject(errorResponseHandler('Only image files are allowed', httpStatusCode.BAD_REQUEST, res));
      }

      // Create a readable stream from the file stream
      const readableStream = new Readable();
      readableStream._read = () => {}; // Required implementation

      fileStream.on('data', (chunk: any) => {
        readableStream.push(chunk);
      });

      fileStream.on('end', () => {
        readableStream.push(null); // End of stream
      });

      // Add upload promise to array
      const uploadPromise = uploadStreamToS3Service(
        readableStream,
        filename,
        mimeType,
        userEmail
      );
      uploadPromises.push(uploadPromise);
    });

    busboy.on('finish', async () => {
      // Check if any files were uploaded
      if (uploadPromises.length === 0) {
        return reject(errorResponseHandler('At least one photo is required', httpStatusCode.BAD_REQUEST, res));
      }

      try {
        // Wait for all file uploads to complete
        const uploadedPhotoKeys = await Promise.all(uploadPromises);
        
        // Validate required fields
        const { content, visibility } = formData;
        
        if (!content || !visibility) {
          return reject(errorResponseHandler("Content and visibility are required", httpStatusCode.BAD_REQUEST, res));
        }

        // Validate visibility
        if (!Object.values(PostVisibility).includes(visibility)) {
          return reject(errorResponseHandler("Invalid visibility value", httpStatusCode.BAD_REQUEST, res));
        }

        // Validate taggedUsers array if provided
        let validatedTaggedUsers = [];
        if (formData.taggedUsers && formData.taggedUsers.length > 0) {
          const parsedTaggedUsers = typeof formData.taggedUsers === 'string' 
            ? JSON.parse(formData.taggedUsers) 
            : formData.taggedUsers;
            
          if (!Array.isArray(parsedTaggedUsers)) {
            return reject(errorResponseHandler("Tagged users must be an array", httpStatusCode.BAD_REQUEST, res));
          }

          // Validate and filter tagged user IDs
          for (const id of parsedTaggedUsers) {
            try {
              const objectId = new mongoose.Types.ObjectId(id);
              // Check if the user exists in the database
              const userExists = await usersModel.findById(objectId).select('_id').lean();
              if (userExists) {
                validatedTaggedUsers.push(objectId);
              } else {
                return reject(errorResponseHandler(
                  `User with ID ${id} does not exist`,
                  httpStatusCode.BAD_REQUEST,
                  res
                ));
              }
            } catch (error) {
              return reject(errorResponseHandler(
                `Invalid user ID format: ${id}`,
                httpStatusCode.BAD_REQUEST,
                res
              ));
            }
          }
        }

        // Create new post with uploaded photo keys
        const newPost = new postModels({
          user: userId,
          content,
          photos: uploadedPhotoKeys, // Store the S3 keys in database
          taggedUsers: validatedTaggedUsers,
          visibility: visibility || PostVisibility.PUBLIC,
        });

        const savedPost = await newPost.save();
        await savedPost.populate([
          { path: 'user', select: '-password' },
          { path: 'taggedUsers', select: '-password' },
        ]);

        resolve({
          success: true,
          message: "Post created successfully",
          data: savedPost,
        });

      } catch (error) {
        console.error('Upload or post creation error:', error);
        reject(formatErrorResponse(res, error));
      }
    });

    busboy.on('error', (error: any) => {
      console.error('Busboy error:', error);
      reject(formatErrorResponse(res, error));
    });

    req.pipe(busboy);
  });
};

// READ - Get all posts
export const getAllPostsService = async (req: Request, res: Response) => {
  if (!req.user) {
    return errorResponseHandler("Authentication failed", httpStatusCode.UNAUTHORIZED,res);
  }

  const posts = await postModels.find()
    .populate('user', '-password')
    .populate('taggedUsers', '-password')
    .sort({ createdAt: -1 });


  return {
    success: true,
    message: "Posts retrieved successfully",
    data: posts
  };
};

// READ - Get single post by ID
export const getPostByIdService = async (req: Request, res: Response) => {
  if (!req.user) {
    return errorResponseHandler("Authentication failed", httpStatusCode.UNAUTHORIZED, res);
  }

  const { id: userId } = req.user as JwtPayload;
  const postId = req.params.id;

  // Validate post ID
  if (!mongoose.Types.ObjectId.isValid(postId)) {
    return errorResponseHandler("Invalid post ID", httpStatusCode.BAD_REQUEST, res);
  }

  // Get the post with user and tagged users
  const post = await postModels
    .findById(postId)
    .populate('user', '-password')
    .populate('taggedUsers', '-password');

  if (!post) {
    return errorResponseHandler("Post not found", httpStatusCode.NOT_FOUND, res);
  }

  // Check if current user follows the post author
  const isFollowing = await followModel.findOne({
    follower_id: userId,
    following_id: post.user._id,
    relationship_status: FollowRelationshipStatus.FOLLOWING,
    is_approved: true
  });

  // Get likes for this post
  const likes = await LikeModel.find({ targetType: 'posts', target: postId })
    .populate('user', 'userName photos');
  
  // Check if current user has liked this post
  const userLiked = likes.some(like => like.user._id.toString() === userId);

  // Get comments for this post
  const comments = await Comment.find({ 
    post: postId,
    parentComment: null, // Only top-level comments
    isDeleted: false
  })
  .populate('user', 'userName photos')
  .sort({ createdAt: -1 });

  // Get comment counts
  const commentCount = await Comment.countDocuments({ 
    post: postId,
    isDeleted: false
  });

  // Get repost count
  const repostCount = await RepostModel.countDocuments({ originalPost: postId });

  // Enhance comments with reply counts and like counts
  const enhancedComments = await Promise.all(comments.map(async (comment) => {
    // Get reply count for this comment
    const replyCount = await Comment.countDocuments({ 
      parentComment: comment._id,
      isDeleted: false
    });

    // Get likes for this comment
    const commentLikes = await LikeModel.find({ 
      targetType: 'comments', 
      target: comment._id 
    });

    // Check if current user has liked this comment
    const userLikedComment = commentLikes.some(like => 
      like.user.toString() === userId
    );

    return {
      ...comment.toObject(),
      replyCount,
      likesCount: commentLikes.length,
      isLikedByUser: userLikedComment
    };
  }));

  // Construct the enhanced post object
  const enhancedPost = {
    ...post.toObject(),
    isFollowingAuthor: !!isFollowing,
    isLikedByUser: userLiked,
    likesCount: likes.length,
    likes: likes,
    commentsCount: commentCount,
    comments: enhancedComments,
    repostsCount: repostCount
  };

  return {
    success: true,
    message: "Post retrieved successfully",
    data: enhancedPost
  };
};

// UPDATE - Update a post
export const updatePostService = async (req: Request, res: Response) => {
  if (!req.user) {
    return errorResponseHandler("Authentication failed", httpStatusCode.UNAUTHORIZED,res);
  }

  const { id: userId } = req.user as JwtPayload;
  const { content, photos, taggedUsers, visibility } = req.body;

  const post = await postModels.findById(req.params.id);
  
  if (!post) {
    return errorResponseHandler("Post not found", httpStatusCode.NOT_FOUND,res);
  }

  if (post.user.toString() !== userId) {
    return errorResponseHandler("Not authorized to update this post", httpStatusCode.FORBIDDEN,res);
  }

  const updateData: { content?: string; photos?: any; taggedUsers?: any; visibility?: PostVisibility } = {};
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
    .populate('user', 'userName ')
    .populate('taggedUsers', 'userName ');

  return {
    success: true,
    message: "Post updated successfully",
    data: updatedPost
  };
};

// DELETE - Delete a post
export const deletePostService = async (req: Request, res: Response) => {
  if (!req.user) {
    return errorResponseHandler("Authentication failed", httpStatusCode.UNAUTHORIZED,res);
  }

  const { id: userId } = req.user as JwtPayload;
  const post = await postModels.findById(req.params.id);

  if (!post) {
    return errorResponseHandler("Post not found", httpStatusCode.NOT_FOUND,res);
  }

  if (post.user.toString() !== userId) {
    return errorResponseHandler("Not authorized to delete this post", httpStatusCode.FORBIDDEN,res);
  }

  await postModels.findByIdAndDelete(req.params.id);

  return {
    success: true,
    message: "Post deleted successfully",
    data: null
  };
};

export const getAllPostOfCurrentUserService = async (req: Request, res: Response) => {
  if (!req.user) {
    return errorResponseHandler("Authentication failed", httpStatusCode.UNAUTHORIZED,res);
  }
  const { id: userId } = req.user as JwtPayload;
  const posts = await postModels.find({user:userId})
  .populate('user', 'userName')
  .populate('taggedUsers', 'userName')
  .sort({createdAt: -1}) 

  const totalPost = await postModels.countDocuments({user:userId})
  return {
    success: true,
    message: "Posts of current user retrieved successfully",
    data: posts,
    totalPost: totalPost
  };
}
