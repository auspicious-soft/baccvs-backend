import { Request, Response } from "express";
import { JwtPayload } from "jsonwebtoken";
import mongoose from "mongoose";
import { httpStatusCode } from "src/lib/constant";
import { errorResponseHandler } from "src/lib/errors/error-response-handler";
import { Comment } from "src/models/comment/comment-schema"; // Updated import name
import { postModels } from "src/models/post/post-schema";
import { RepostModel } from "src/models/repost/repost-schema";

// Create Comment
export const createCommentService = async (req: Request, res: Response) => {
    if (!req.user) {
      return errorResponseHandler("Authentication failed", httpStatusCode.UNAUTHORIZED, res);
    }

    const { id: userId } = req.user as JwtPayload;
    const { postId, repostId, parentCommentId, type, text, audioUrl } = req.body;
    
    // Validate that either postId or repostId is provided, but not both
    if ((postId && repostId) || (!postId && !repostId)) {
      return errorResponseHandler("Either Post ID or Repost ID must be provided, but not both", httpStatusCode.BAD_REQUEST, res);
    }
    // if postId check if post exists
    if (postId) {
      const post = await postModels.findById(postId);
      if (!post) {
        return errorResponseHandler("Post not found", httpStatusCode.NOT_FOUND, res);
      }
    }
    // if repostId check if repost exists
    if (repostId) {
      const repost = await RepostModel.findById(repostId);
      if (!repost) {
        return errorResponseHandler("Repost not found", httpStatusCode.NOT_FOUND, res);
      }
    }
    // if parentCommentId check if parent comment exists
    if (parentCommentId) {
      const parentComment = await Comment.findById(parentCommentId);
      if (!parentComment) {
        return errorResponseHandler("Parent comment not found", httpStatusCode.NOT_FOUND, res);
      }
    }
    
    if (!type) {
      return errorResponseHandler("Comment type is required", httpStatusCode.BAD_REQUEST, res);
    }

    // Validate post ID if provided
    if (postId && !mongoose.Types.ObjectId.isValid(postId)) {
      return errorResponseHandler("Invalid post ID", httpStatusCode.BAD_REQUEST, res);
    }
    
    // Validate repost ID if provided
    if (repostId && !mongoose.Types.ObjectId.isValid(repostId)) {
      return errorResponseHandler("Invalid repost ID", httpStatusCode.BAD_REQUEST, res);
    }

    // Validate parent comment ID if provided
    if (parentCommentId && !mongoose.Types.ObjectId.isValid(parentCommentId)) {
      return errorResponseHandler("Invalid parent comment ID", httpStatusCode.BAD_REQUEST, res);
    }

    // Check if parent comment exists
    if (parentCommentId) {
      const parentComment = await Comment.findById(parentCommentId);
      if (!parentComment) {
        return errorResponseHandler("Parent comment not found", httpStatusCode.NOT_FOUND, res);
      }
      
      // For replies, we need to ensure the reply is associated with the same post/repost as the parent
      if (postId && parentComment.post && parentComment.post.toString() !== postId) {
        return errorResponseHandler("Parent comment does not belong to the specified post", httpStatusCode.BAD_REQUEST, res);
      }
      
      if (repostId && parentComment.repost && parentComment.repost.toString() !== repostId) {
        return errorResponseHandler("Parent comment does not belong to the specified repost", httpStatusCode.BAD_REQUEST, res);
      }
      
      // If parent comment has a post, use that post ID
      if (parentComment.post && !postId) {
        req.body.postId = parentComment.post.toString();
      }
      
      // If parent comment has a repost, use that repost ID
      if (parentComment.repost && !repostId) {
        req.body.repostId = parentComment.repost.toString();
      }
    }

    // Create comment based on type
    const commentData: any = {
      user: userId,
      type,
      parentComment: parentCommentId || null
    };
    
    // Set either post or repost field
    if (postId || req.body.postId) {
      commentData.post = postId || req.body.postId;
    } else {
      commentData.repost = repostId || req.body.repostId;
    }

    if (type === 'text' && text) {
      commentData.text = text.trim();
    } else if (type === 'audio' && audioUrl) {
      commentData.audioUrl = audioUrl;
    } else {
      const errorMessage = type === 'text' 
        ? 'Text is required for text comments' 
        : 'Audio URL is required for audio comments';
      return errorResponseHandler(errorMessage, httpStatusCode.BAD_REQUEST, res);
    }

    const newComment = new Comment(commentData);
    await newComment.save();

    // Populate user information for response
    const populatedComment = await Comment.findById(newComment._id)
      .populate('user', 'username profileImage')
      .populate('post', 'title')
      .populate('repost', 'content');

    return {
      success: true,
      message: parentCommentId ? "Reply added successfully" : "Comment created successfully",
      data: populatedComment 
    };
};

// Get All Comments for a Post or Repost (only top-level comments)
export const getCommentsService = async (req: Request, res: Response) => {
    const { targetType, targetId } = req.params;
    
    // Validate target type
    if (!['post', 'repost'].includes(targetType)) {
      return errorResponseHandler("Invalid target type. Must be 'post' or 'repost'", httpStatusCode.BAD_REQUEST, res);
    }

    // Validate target ID
    if (!mongoose.Types.ObjectId.isValid(targetId)) {
      return errorResponseHandler(`Invalid ${targetType} ID`, httpStatusCode.BAD_REQUEST, res);
    }

    // Optional pagination parameters
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;

    // Build query based on target type
    const query: any = {
      parentComment: null,
      isDeleted: false
    };
    
    if (targetType === 'post') {
      query.post = targetId;
    } else {
      query.repost = targetId;
    }

    // Find top-level comments for the target with pagination
    const comments = await Comment.find(query)
      .sort({ createdAt: -1 }) // Sort by newest first
      .skip(skip)
      .limit(limit)
      .populate('user', 'userName photos');

    // Get total count for pagination (only top-level comments)
    const totalComments = await Comment.countDocuments(query);

    // For each comment, get the reply count and replies
    const commentsWithReplies = await Promise.all(comments.map(async (comment) => {
      // Get reply count
      const replyCount = await Comment.countDocuments({ 
        parentComment: comment._id,
        isDeleted: false
      });
      
      // Get first few replies for each comment
      const replies = await Comment.find({ 
        parentComment: comment._id,
        isDeleted: false
      })
        .sort({ createdAt: 1 })
        .limit(3)
        .populate('user', 'userName photos');
      
      const commentObj = comment.toObject();
      return {
        ...commentObj,
        replyCount,
        replies
      };
    }));

    return {
      success: true,
      message: "Comments retrieved successfully",
      data: {
        comments: commentsWithReplies,
        pagination: {
          totalComments,
          totalPages: Math.ceil(totalComments / limit),
          currentPage: page,
          hasNextPage: page * limit < totalComments,
          hasPrevPage: page > 1
        }
      }
    };
};

// For backward compatibility - Get comments for a post
export const getPostCommentsService = async (req: Request, res: Response) => {
    const { postId } = req.params;
    req.params.targetType = 'post';
    req.params.targetId = postId;
    return getCommentsService(req, res);
};

// Get a Single Comment with its replies
export const getCommentService = async (req: Request, res: Response) => {
    const { commentId } = req.params;

    // Validate comment ID
    if (!mongoose.Types.ObjectId.isValid(commentId)) {
      return errorResponseHandler("Invalid comment ID", httpStatusCode.BAD_REQUEST, res);
    }

    // Use the static method from your schema
    const { comment, replies } = await Comment.findWithReplies(commentId);

    if (!comment) {
      return errorResponseHandler("Comment not found", httpStatusCode.NOT_FOUND, res);
    }

    return {
      success: true,
      message: "Comment retrieved successfully",
      data: {
        comment,
        replies
      }
    };
};

// Get replies for a specific comment
export const getCommentRepliesService = async (req: Request, res: Response) => {
    const { commentId } = req.params;

    // Validate comment ID
    if (!mongoose.Types.ObjectId.isValid(commentId)) {
      return errorResponseHandler("Invalid comment ID", httpStatusCode.BAD_REQUEST, res);
    }

    // Optional pagination parameters
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;

    // Find the comment first to make sure it exists
    const parentComment = await Comment.findById(commentId);
    if (!parentComment) {
      return errorResponseHandler("Comment not found", httpStatusCode.NOT_FOUND, res);
    }

    // Find replies with pagination
    const replies = await Comment.find({ 
      parentComment: commentId,
      isDeleted: false
    })
      .sort({ createdAt: 1 }) // Sort by oldest first for replies
      .skip(skip)
      .limit(limit)
      .populate('user', 'userName photos');

    // Get total count for pagination
    const totalReplies = await Comment.countDocuments({ 
      parentComment: commentId,
      isDeleted: false
    });

    return {
      success: true,
      message: "Replies retrieved successfully",
      data: {
        replies,
        pagination: {
          totalReplies,
          totalPages: Math.ceil(totalReplies / limit),
          currentPage: page,
          hasNextPage: page * limit < totalReplies,
          hasPrevPage: page > 1
        }
      }
    };
};

// Update Comment
export const updateCommentService = async (req: Request, res: Response) => {
    if (!req.user) {
      return errorResponseHandler("Authentication failed", httpStatusCode.UNAUTHORIZED, res);
    }

    const { id: userId } = req.user as JwtPayload;
    const { commentId } = req.params;
    const { text, audioUrl } = req.body;

    // Validate comment ID
    if (!mongoose.Types.ObjectId.isValid(commentId)) {
      return errorResponseHandler("Invalid comment ID", httpStatusCode.BAD_REQUEST, res);
    }

    // Find comment
    const comment = await Comment.findById(commentId);

    if (!comment) {
      return errorResponseHandler("Comment not found", httpStatusCode.NOT_FOUND, res);
    }

    // Check if user is the owner of the comment
    if (comment.user.toString() !== userId) {
      return errorResponseHandler("Unauthorized: You can only update your own comments", httpStatusCode.FORBIDDEN, res);
    }

    // Update fields based on comment type
    const updateData: any = {};

    if (comment.type === 'text' && text) {
      updateData.text = text;
    } else if (comment.type === 'audio' && audioUrl) {
      updateData.audioUrl = audioUrl;
    } else if ((comment.type === 'text' && !text) || (comment.type === 'audio' && !audioUrl)) {
      const errorMessage = comment.type === 'text' 
        ? 'Text is required for text comments' 
        : 'Audio URL is required for audio comments';
      return errorResponseHandler(errorMessage, httpStatusCode.BAD_REQUEST, res);
    }

    // Update the comment
    const updatedComment = await Comment.findByIdAndUpdate(
      commentId,
      updateData,
      { new: true, runValidators: true }
    ).populate('user', 'username photos');

    return {
      success: true,
      message: "Comment updated successfully",
      data: updatedComment
    };
};

// Delete Comment (soft delete)
export const deleteCommentService = async (req: Request, res: Response) => {
    if (!req.user) {
      return errorResponseHandler("Authentication failed", httpStatusCode.UNAUTHORIZED, res);
    }

    const { id: userId } = req.user as JwtPayload;
    const { commentId } = req.params;

    // Validate comment ID
    if (!mongoose.Types.ObjectId.isValid(commentId)) {
      return errorResponseHandler("Invalid comment ID", httpStatusCode.BAD_REQUEST, res);
    }

    // Find comment
    const comment = await Comment.findById(commentId);

    if (!comment) {
      return errorResponseHandler("Comment not found", httpStatusCode.NOT_FOUND, res);
    }

    // Check if user is the owner of the comment
    if (comment.user.toString() !== userId) {
      return errorResponseHandler("Unauthorized: You can only delete your own comments", httpStatusCode.FORBIDDEN, res);
    }

    // Soft delete the comment
    await Comment.findByIdAndUpdate(commentId, { isDeleted: true });

    // For better UX, you might also want to soft delete all replies
    await Comment.updateMany(
      { parentComment: commentId },
      { isDeleted: true }
    );

    return {
      success: true,
      message: "Comment deleted successfully"
    };
};

// Count comments for a post or repost
export const countCommentsService = async (req: Request, res: Response) => {
    const { targetType, targetId } = req.params;
    
    // Validate target type
    if (!['post', 'repost'].includes(targetType)) {
      return errorResponseHandler("Invalid target type. Must be 'post' or 'repost'", httpStatusCode.BAD_REQUEST, res);
    }

    // Validate target ID
    if (!mongoose.Types.ObjectId.isValid(targetId)) {
      return errorResponseHandler(`Invalid ${targetType} ID`, httpStatusCode.BAD_REQUEST, res);
    }

    // Build query based on target type
    const query: any = { isDeleted: false };
    
    if (targetType === 'post') {
      query.post = targetId;
    } else {
      query.repost = targetId;
    }

    const totalCount = await Comment.countDocuments(query);

    const topLevelCount = await Comment.countDocuments({ 
      ...query,
      parentComment: null
    });

    const replyCount = totalCount - topLevelCount;

    return {
      success: true,
      message: "Comment count retrieved successfully",
      data: { 
        totalCount,
        topLevelCount,
        replyCount
      }
    };
};

// For backward compatibility - Count comments for a post
export const countPostCommentsService = async (req: Request, res: Response) => {
    const { postId } = req.params;
    req.params.targetType = 'post';
    req.params.targetId = postId;
    return countCommentsService(req, res);
};


