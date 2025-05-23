import { httpStatusCode, PostVisibility } from "src/lib/constant";
import { errorResponseHandler } from "src/lib/errors/error-response-handler";
import { postModels } from "src/models/post/post-schema";
import { Request, Response } from "express";
import { JwtPayload } from "jsonwebtoken";
import { object } from "webidl-conversions";
import mongoose from 'mongoose';
import { usersModel } from "src/models/user/user-schema";

export const createPostService = async (req: any, res: Response) => {
  if (!req.user) {
    return errorResponseHandler("Authentication failed", httpStatusCode.UNAUTHORIZED, res);
  }

  const { id: userId } = req.user;
  const { content, photos, taggedUsers, visibility } = req.body;

  // Basic field validation
  if (!content || !photos || !taggedUsers || !visibility) {
    return errorResponseHandler("All fields are required", httpStatusCode.BAD_REQUEST, res);
  }

  // Validate visibility
  if (!Object.values(PostVisibility).includes(visibility)) {
    return errorResponseHandler("Invalid visibility value", httpStatusCode.BAD_REQUEST, res);
  }

  // Validate taggedUsers array
  if (!Array.isArray(taggedUsers)) {
    return errorResponseHandler("Tagged users must be an array", httpStatusCode.BAD_REQUEST, res);
  }

  // Validate and filter tagged user IDs
  let validatedTaggedUsers = [];
  for (const id of taggedUsers) {
    
      const objectId = new mongoose.Types.ObjectId(id);
      // Check if the user exists in the database
      const userExists = await usersModel.findById(objectId).select('_id').lean();
      if (userExists) {
        validatedTaggedUsers.push(objectId);
      } else {
        return errorResponseHandler(
          `User with ID ${id} does not exist`,
          httpStatusCode.BAD_REQUEST,
          res
        );
      }
   
  }

  // Create new post
  const newPost = new postModels({
    user: userId,
    content,
    photos: photos || [],
    taggedUsers: validatedTaggedUsers,
    visibility: visibility || PostVisibility.PUBLIC,
  });

  
    const savedPost = await newPost.save();
    await savedPost.populate([
      { path: 'user',select: '-password' },
      { path: 'taggedUsers', select: '-password' },
    ]);

    return {
      success: true,
      message: "Post created successfully",
      data: savedPost,
    };
 
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
    return errorResponseHandler("Authentication failed", httpStatusCode.UNAUTHORIZED,res);
  }

  const post = await postModels
    .findById(req.params.id)
    .populate('user', '-password ')
    .populate('taggedUsers', '-password ');

  if (!post) {
    return errorResponseHandler("Post not found", httpStatusCode.NOT_FOUND,res);
  }
  

  return {
    success: true,
    message: "Post retrieved successfully",
    data: post
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
