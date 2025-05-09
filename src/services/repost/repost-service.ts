import { Request, Response } from 'express';
import { JwtPayload } from 'jsonwebtoken';
import { httpStatusCode } from 'src/lib/constant';
import { errorResponseHandler } from 'src/lib/errors/error-response-handler';
import { RepostModel } from 'src/models/repost/repost-schema';
import { postModels } from 'src/models/post/post-schema';

export const createRepostService = async (req: Request, res: Response) => {
  const { id: userId } = req.user as JwtPayload;
  const { postId, type, content } = req.body;

  // Validate post exists
  const originalPost = await postModels.findById(postId);
  if (!originalPost) {
    return errorResponseHandler(
      'Original post not found',
      httpStatusCode.NOT_FOUND,
      res
    );
  }
  if (originalPost.user.toString() === userId) {
    return errorResponseHandler(
      'You cannot repost your own post',
      httpStatusCode.BAD_REQUEST,
      res
    );
  }
  // Check if user has already reposted this post
  const existingRepost = await RepostModel.findOne({
    user: userId,
    originalPost: postId
  });

  if (existingRepost) {
    return errorResponseHandler(
      'You have already reposted this post',
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

  // Validate quote repost has content
  if (type === 'quote' && !content) {
    return errorResponseHandler(
      'Content is required for quote reposts',
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

  const repost = new RepostModel({
    user: userId,
    originalPost: postId,
    type,
    content: type === 'quote' ? content : undefined,
  });

  await repost.save();

  // Populate the response
  const populatedRepost = await RepostModel.findById(repost._id)
    .populate('user', '-password')
    .populate({
      path: 'originalPost',
      populate: {
        path: 'user',
        select: '-password'
      }
    });

  return {
    success: true,
    message: 'Post reposted successfully',
    data: populatedRepost
  };
};

export const deleteRepostService = async (req: Request, res: Response) => {
  const { id: userId } = req.user as JwtPayload;
  const { repostId } = req.params;

  const repost = await RepostModel.findOne({
    _id: repostId,
  });

  if (!repost) {
    return errorResponseHandler(
      'Repost not found or unauthorized',
      httpStatusCode.NOT_FOUND,
      res
    );
  }
  if (repost.user.toString() !== userId) {
    return errorResponseHandler(
      'Unauthorized to delete this repost',
      httpStatusCode.FORBIDDEN,
      res
    );
  }

  await repost.deleteOne();

  return {
    success: true,
    message: 'Repost removed successfully'
  };
};

export const getUserRepostsService = async (req: Request, res: Response) => {
  const { id: userId } = req.user as JwtPayload;
  console.log('userId:', userId); 
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 10;

  const reposts = await RepostModel.find({ user: userId })
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .populate('user', '-password')
    .populate({
      path: 'originalPost',
      populate: {
        path: 'user',
        select: '-password'
      }
    });
    if(reposts.length === 0){
      return errorResponseHandler(
        'No reposts found',
        httpStatusCode.NOT_FOUND,
        res
      );
    }

  const total = await RepostModel.countDocuments({ user: userId });

  return {
    success: true,
    data: {
      reposts,
      pagination: {
        current: page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    }
  };
};