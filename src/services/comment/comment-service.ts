import { Request, Response } from "express";
import { JwtPayload } from "jsonwebtoken";
import mongoose from "mongoose";
import { httpStatusCode } from "src/lib/constant";
import { errorResponseHandler } from "src/lib/errors/error-response-handler";
import { Comment } from "src/models/comment/comment-schema";
import { eventModel } from "src/models/event/event-schema";
import { LikeModel } from "src/models/like/like-schema";
import { postModels } from "src/models/post/post-schema";
import { RepostModel } from "src/models/repost/repost-schema";

// Create Comment
export const createCommentService = async (req: Request, res: Response) => {
  if (!req.user) {
    return errorResponseHandler("Authentication failed", httpStatusCode.UNAUTHORIZED, res);
  }

  const { id: userId } = req.user as JwtPayload;
  const { postId, repostId, eventId, parentCommentId, type, text, audioUrl } = req.body;

  // Validate that exactly one of postId, repostId, or eventId is provided
  const providedTargets = [postId, repostId, eventId].filter(Boolean).length;
  if (providedTargets !== 1) {
    return errorResponseHandler(
      "Exactly one of Post ID, Repost ID, or Event ID must be provided",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

  // Validate and check existence of post, repost, or event
  if (postId) {
    if (!mongoose.Types.ObjectId.isValid(postId)) {
      return errorResponseHandler("Invalid post ID", httpStatusCode.BAD_REQUEST, res);
    }
    const post = await postModels.findById(postId);
    if (!post) {
      return errorResponseHandler("Post not found", httpStatusCode.NOT_FOUND, res);
    }
  }

  if (repostId) {
    if (!mongoose.Types.ObjectId.isValid(repostId)) {
      return errorResponseHandler("Invalid repost ID", httpStatusCode.BAD_REQUEST, res);
    }
    const repost = await RepostModel.findById(repostId);
    if (!repost) {
      return errorResponseHandler("Repost not found", httpStatusCode.NOT_FOUND, res);
    }
  }

  if (eventId) {
    if (!mongoose.Types.ObjectId.isValid(eventId)) {
      return errorResponseHandler("Invalid event ID", httpStatusCode.BAD_REQUEST, res);
    }
    const event = await eventModel.findById(eventId);
    if (!event) {
      return errorResponseHandler("Event not found", httpStatusCode.NOT_FOUND, res);
    }
  }

  // Validate parent comment if provided
  if (parentCommentId) {
    if (!mongoose.Types.ObjectId.isValid(parentCommentId)) {
      return errorResponseHandler("Invalid parent comment ID", httpStatusCode.BAD_REQUEST, res);
    }
    const parentComment = await Comment.findById(parentCommentId);
    if (!parentComment) {
      return errorResponseHandler("Parent comment not found", httpStatusCode.NOT_FOUND, res);
    }

    // Ensure reply is associated with the same target as the parent
    if (postId && parentComment.post && parentComment.post.toString() !== postId) {
      return errorResponseHandler(
        "Parent comment does not belong to the specified post",
        httpStatusCode.BAD_REQUEST,
        res
      );
    }
    if (repostId && parentComment.repost && parentComment.repost.toString() !== repostId) {
      return errorResponseHandler(
        "Parent comment does not belong to the specified repost",
        httpStatusCode.BAD_REQUEST,
        res
      );
    }
    if (eventId && parentComment.get('event') && parentComment.get('event').toString() !== eventId) {
      return errorResponseHandler(
        "Parent comment does not belong to the specified event",
        httpStatusCode.BAD_REQUEST,
        res
      );
    }

    // Inherit target from parent comment if not provided
    if (!postId && !repostId && !eventId) {
      if (parentComment.post) req.body.postId = parentComment.post.toString();
      if (parentComment.repost) req.body.repostId = parentComment.repost.toString();
      if (parentComment.get('event')) req.body.eventId = parentComment.get('event').toString();
    }
  }

  // Validate comment type
  if (!type) {
    return errorResponseHandler("Comment type is required", httpStatusCode.BAD_REQUEST, res);
  }

  // Create comment data
  const commentData: any = {
    user: userId,
    type,
    parentComment: parentCommentId || null,
  };

  // Set target field (post, repost, or event)
  if (postId || req.body.postId) {
    commentData.post = postId || req.body.postId;
  } else if (repostId || req.body.repostId) {
    commentData.repost = repostId || req.body.repostId;
  } else if (eventId || req.body.eventId) {
    commentData.event = eventId || req.body.eventId;
  }

  // Set content based on type
  if (type === "text" && text) {
    commentData.text = text.trim();
  } else if (type === "audio" && audioUrl) {
    commentData.audioUrl = audioUrl;
  } else {
    const errorMessage =
      type === "text"
        ? "Text is required for text comments"
        : "Audio URL is required for audio comments";
    return errorResponseHandler(errorMessage, httpStatusCode.BAD_REQUEST, res);
  }

  const newComment = new Comment(commentData);
  await newComment.save();

  // Populate user and target information
  const populatedComment = await Comment.findById(newComment._id)
    .populate("user", "userName photos")
    .populate("post")
    .populate("repost")
    .populate("event");

  return {
    success: true,
    message: parentCommentId ? "Reply added successfully" : "Comment created successfully",
    data: populatedComment,
  };
};

// Get All Comments for a Post, Repost, or Event (only top-level comments)
export const getCommentsService = async (req: Request, res: Response) => {
  const { targetType, targetId } = req.params;
 const { id: userId } = req.user as JwtPayload;

  // Validate target type
  if (!["post", "repost", "event"].includes(targetType)) {
    return errorResponseHandler(
      "Invalid target type. Must be 'post', 'repost', or 'event'",
      httpStatusCode.BAD_REQUEST,
      res
    );
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
    isDeleted: false,
  };

  if (targetType === "post") {
    query.post = targetId;
  } else if (targetType === "repost") {
    query.repost = targetId;
  } else {
    query.event = targetId;
  }

  // Find top-level comments for the target with pagination
  const comments = await Comment.find(query)
    .sort({ createdAt: -1 }) // Sort by newest first
    .skip(skip)
    .limit(limit)
    .populate("user", "userName photos");

  // Get total count for pagination (only top-level comments)
  const totalComments = await Comment.countDocuments(query);

  // For each comment, get the reply count and replies
  const commentsWithReplies = await Promise.all(
    comments.map(async (comment) => {
      // Get reply count
      const replyCount = await Comment.countDocuments({
        parentComment: comment._id,
        isDeleted: false,
      });

      // Get first few replies for each comment
      const replies = await Comment.find({
        parentComment: comment._id,
        isDeleted: false,
      }).sort({ createdAt: 1 })
        .populate("user", "userName photos");

        const likesCount = await LikeModel.countDocuments({
          targetType:"comments",
          target:comment._id
        })

        const isLikedByUser = await LikeModel.exists({
        user: userId,
        targetType: "comments",
        target: comment._id
      });

      const commentObj = comment.toObject();
      return {
        ...commentObj,
        replyCount,
        replies,
        likesCount,
        isLikedByUser:!!isLikedByUser
      };
    })
  );

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
        hasPrevPage: page > 1,
      },
    },
  };
};

export const getCommentsServiceOptimized = async (req: Request, res: Response) => {
  const { targetType, targetId } = req.params;
  const { id: userId } = req.user as JwtPayload;

  // Validate target type
  if (!["post", "repost", "event"].includes(targetType)) {
    return errorResponseHandler(
      "Invalid target type. Must be 'post', 'repost', or 'event'",
      httpStatusCode.BAD_REQUEST,
      res
    );
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
    isDeleted: false,
  };

  if (targetType === "post") {
    query.post = targetId;
  } else if (targetType === "repost") {
    query.repost = targetId;
  } else {
    query.event = targetId;
  }

  // Find top-level comments
  const comments = await Comment.find(query)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .populate("user", "userName photos")
    .lean(); // Use lean() for better performance

  // Get total count
  const totalComments = await Comment.countDocuments(query);

  // Collect all comment IDs (including replies)
  const commentIds = comments.map(c => c._id);
  
  // Get all replies for all comments in one query
  const allReplies = await Comment.find({
    parentComment: { $in: commentIds },
    isDeleted: false,
  })
    .sort({ createdAt: 1 })
    .populate("user", "userName photos")
    .lean();

  // Get reply IDs
  const replyIds = allReplies.map(r => r._id);
  const allIds = [...commentIds, ...replyIds];

  // Batch query for all likes counts
  const likesAggregation = await LikeModel.aggregate([
    {
      $match: {
        targetType: "comments",
        target: { $in: allIds }
      }
    },
    {
      $group: {
        _id: "$target",
        count: { $sum: 1 }
      }
    }
  ]);

  // Create a map of likes counts
  const likesCountMap = new Map(
    likesAggregation.map(item => [item._id.toString(), item.count])
  );

  // Batch query for current user's likes
  const userLikes = await LikeModel.find({
    user: userId,
    targetType: "comments",
    target: { $in: allIds }
  }).lean();

  // Create a set of comment IDs the user has liked
  const userLikedSet = new Set(
    userLikes.map(like => like.target.toString())
  );

  // Group replies by parent comment
  const repliesByParent = allReplies.reduce((acc : any, reply : any) => {
    const parentId = reply.parentComment.toString();
    if (!acc[parentId]) acc[parentId] = [];
    
    // Add likes info to reply
    const replyId = reply._id.toString();
    acc[parentId].push({
      ...reply,
      likesCount: likesCountMap.get(replyId) || 0,
      isLikedByUser: userLikedSet.has(replyId)
    });
    
    return acc;
  }, {} as Record<string, any[]>);

  // Build final comments with replies
  const commentsWithReplies = comments.map(comment => {
    const commentId = comment._id.toString();
    const replies = repliesByParent[commentId] || [];
    
    return {
      ...comment,
      replyCount: replies.length,
      replies,
      likesCount: likesCountMap.get(commentId) || 0,
      isLikedByUser: userLikedSet.has(commentId)
    };
  });

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
        hasPrevPage: page > 1,
      },
    },
  };
};

// For backward compatibility - Get comments for a post
export const getPostCommentsService = async (req: Request, res: Response) => {
  const { postId } = req.params;
  req.params.targetType = "post";
  req.params.targetId = postId;
  return getCommentsService(req, res);
};

// For backward compatibility - Get comments for a repost
export const getRepostCommentsService = async (req: Request, res: Response) => {
  const { repostId } = req.params;
  req.params.targetType = "repost";
  req.params.targetId = repostId;
  return getCommentsService(req, res);
};

// Get comments for an event
export const getEventCommentsService = async (req: Request, res: Response) => {
  const { eventId } = req.params;
  req.params.targetType = "event";
  req.params.targetId = eventId;
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
      replies,
    },
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
    isDeleted: false,
  })
    .sort({ createdAt: 1 }) // Sort by oldest first for replies
    .skip(skip)
    .limit(limit)
    .populate("user", "userName photos");

  // Get total count for pagination
  const totalReplies = await Comment.countDocuments({
    parentComment: commentId,
    isDeleted: false,
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
        hasPrevPage: page > 1,
      },
    },
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
    return errorResponseHandler(
      "Unauthorized: You can only update your own comments",
      httpStatusCode.FORBIDDEN,
      res
    );
  }

  // Update fields based on comment type
  const updateData: any = {};

  if (comment.type === "text" && text) {
    updateData.text = text;
  } else if (comment.type === "audio" && audioUrl) {
    updateData.audioUrl = audioUrl;
  } else if ((comment.type === "text" && !text) || (comment.type === "audio" && !audioUrl)) {
    const errorMessage =
      comment.type === "text"
        ? "Text is required for text comments"
        : "Audio URL is required for audio comments";
    return errorResponseHandler(errorMessage, httpStatusCode.BAD_REQUEST, res);
  }

  // Update the comment
  const updatedComment = await Comment.findByIdAndUpdate(commentId, updateData, {
    new: true,
    runValidators: true,
  }).populate("user", "username photos");

  return {
    success: true,
    message: "Comment updated successfully",
    data: updatedComment,
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
    return errorResponseHandler(
      "Unauthorized: You can only delete your own comments",
      httpStatusCode.FORBIDDEN,
      res
    );
  }

  // Soft delete the comment
  await Comment.findByIdAndUpdate(commentId, { isDeleted: true });

  // Soft delete all replies
  await Comment.updateMany({ parentComment: commentId }, { isDeleted: true });

  return {
    success: true,
    message: "Comment deleted successfully",
  };
};

// Count comments for a post, repost, or event
export const countCommentsService = async (req: Request, res: Response) => {
  const { targetType, targetId } = req.params;

  // Validate target type
  if (!["post", "repost", "event"].includes(targetType)) {
    return errorResponseHandler(
      "Invalid target type. Must be 'post', 'repost', or 'event'",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

  // Validate target ID
  if (!mongoose.Types.ObjectId.isValid(targetId)) {
    return errorResponseHandler(`Invalid ${targetType} ID`, httpStatusCode.BAD_REQUEST, res);
  }

  // Build query based on target type
  const query: any = { isDeleted: false };

  if (targetType === "post") {
    query.post = targetId;
  } else if (targetType === "repost") {
    query.repost = targetId;
  } else {
    query.event = targetId;
  }

  const totalCount = await Comment.countDocuments(query);

  const topLevelCount = await Comment.countDocuments({
    ...query,
    parentComment: null,
  });

  const replyCount = totalCount - topLevelCount;

  return {
    success: true,
    message: "Comment count retrieved successfully",
    data: {
      totalCount,
      topLevelCount,
      replyCount,
    },
  };
};

// For backward compatibility - Count comments for a post
export const countPostCommentsService = async (req: Request, res: Response) => {
  const { postId } = req.params;
  req.params.targetType = "post";
  req.params.targetId = postId;
  return countCommentsService(req, res);
};

// Count comments for a repost
export const countRepostCommentsService = async (req: Request, res: Response) => {
  const { repostId } = req.params;
  req.params.targetType = "repost";
  req.params.targetId = repostId;
  return countCommentsService(req, res);
};

// Count comments for an event
export const countEventCommentsService = async (req: Request, res: Response) => {
  const { eventId } = req.params;
  req.params.targetType = "event";
  req.params.targetId = eventId;
  return countCommentsService(req, res);
};