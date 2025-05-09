import { Request, Response } from "express";
import { JwtPayload } from "jsonwebtoken";
import mongoose from "mongoose";
import { httpStatusCode } from "src/lib/constant";
import { errorResponseHandler } from "src/lib/errors/error-response-handler";
import { Comment } from "src/models/comment/comment-schema"; // Updated import name

// Create Comment
export const createCommentService = async (req: Request, res: Response) => {
    if (!req.user) {
      return errorResponseHandler("Authentication failed", httpStatusCode.UNAUTHORIZED, res);
    }

    const { id: userId } = req.user as JwtPayload;
    const { postId, parentCommentId, type, text, audioUrl } = req.body;
    if(!postId || !type) {
      return errorResponseHandler("Post ID and comment type are required", httpStatusCode.BAD_REQUEST, res);
    }

    // Validate post ID
    if (!mongoose.Types.ObjectId.isValid(postId)) {
      return errorResponseHandler("Invalid post ID", httpStatusCode.BAD_REQUEST, res);
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
    }

    // Create comment based on type
    const commentData: any = {
      post: postId,
      user: userId,
      type,
      parentComment: parentCommentId || null
    };

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
      .populate('post', 'title');

    return {
      success: true,
      message: parentCommentId ? "Reply added successfully" : "Comment created successfully",
      data: populatedComment 
    };
};

// Get All Comments for a Post (only top-level comments)
export const getPostCommentsService = async (req: Request, res: Response) => {
    const { postId } = req.params;

    // Validate post ID
    if (!mongoose.Types.ObjectId.isValid(postId)) {
      return errorResponseHandler("Invalid post ID", httpStatusCode.BAD_REQUEST, res);
    }

    // Optional pagination parameters
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;

    // Find top-level comments (no parent) for the post with pagination
    const comments = await Comment.find({ 
      post: postId,
      parentComment: null,
      isDeleted: false
    })
      .sort({ createdAt: -1 }) // Sort by newest first
      .skip(skip)
      .limit(limit)
      .populate('user', 'userName photos');

    // Get total count for pagination (only top-level comments)
    const totalComments = await Comment.countDocuments({ 
      post: postId,
      parentComment: null,
      isDeleted: false
    });

    // For each comment, get the reply count
    const commentsWithReplyCount = await Promise.all(comments.map(async (comment) => {
      const replyCount = await Comment.countDocuments({ 
        parentComment: comment._id,
        isDeleted: false
      });
      
      const commentObj = comment.toObject();
      return {
        ...commentObj,
        replyCount
      };
    }));

    return {
      success: true,
      message: "Comments retrieved successfully",
      data: {
        comments: commentsWithReplyCount,
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

// Hard delete a comment (optional, admin only)
export const hardDeleteCommentService = async (req: Request, res: Response) => {
    if (!req.user ) {
      return errorResponseHandler("Unauthorized: Admin access required", httpStatusCode.FORBIDDEN, res);
    }

    const { commentId } = req.params;

    // Validate comment ID
    if (!mongoose.Types.ObjectId.isValid(commentId)) {
      return errorResponseHandler("Invalid comment ID", httpStatusCode.BAD_REQUEST, res);
    }

    // Delete the comment and all its replies
    await Comment.findByIdAndDelete(commentId);
    await Comment.deleteMany({ parentComment: commentId });

    return {
      success: true,
      message: "Comment and all replies permanently deleted"
    };
};

// Get all Comments by User
export const getUserCommentsService = async (req: Request, res: Response) => {
    if (!req.user) {
      return errorResponseHandler("Authentication failed", httpStatusCode.UNAUTHORIZED, res);
    }

    const { id: userId } = req.user as JwtPayload;

    // Validate user ID
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return errorResponseHandler("Invalid user ID", httpStatusCode.BAD_REQUEST, res);
    }

    // Optional pagination parameters
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;

    // Find comments for the user with pagination
    const comments = await Comment.find({ 
      user: userId,
      isDeleted: false
    })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('user', 'userName photos')
      .populate('post', 'title');

    // Get total count for pagination
    const totalComments = await Comment.countDocuments({ 
      user: userId,
      isDeleted: false
    });

    return {
      success: true,
      message: "User comments retrieved successfully",
      data: {
        comments,
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

// Count comments for a post (including replies)
export const countPostCommentsService = async (req: Request, res: Response) => {
    const { postId } = req.params;

    // Validate post ID
    if (!mongoose.Types.ObjectId.isValid(postId)) {
      return errorResponseHandler("Invalid post ID", httpStatusCode.BAD_REQUEST, res);
    }

    const totalCount = await Comment.countDocuments({ 
      post: postId,
      isDeleted: false
    });

    const topLevelCount = await Comment.countDocuments({ 
      post: postId,
      parentComment: null,
      isDeleted: false
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

// Like/Unlike a comment
export const toggleLikeCommentService = async (req: Request, res: Response) => {
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

    // Check if user already liked the comment
    const alreadyLiked = comment.likes.includes(userId);
    
    if (alreadyLiked) {
      // Unlike the comment
      await Comment.findByIdAndUpdate(
        commentId,
        { $pull: { likes: userId } },
        { new: true }
      );
      
      return {
        success: true,
        message: "Comment unliked successfully"
      };
    } else {
      // Like the comment
      await Comment.findByIdAndUpdate(
        commentId,
        { $push: { likes: userId } },
        { new: true }
      );
      
      return {
        success: true,
        message: "Comment liked successfully"
      };
    }
};