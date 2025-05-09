import { Request, Response } from "express";
import { httpStatusCode, PostVisibility } from "src/lib/constant";
import { errorResponseHandler } from "src/lib/errors/error-response-handler";
import { storyModel } from "src/models/story/story-schema";
import { JwtPayload } from "jsonwebtoken";
import { followModel } from "src/models/follow/follow-schema";
import { usersModel } from "src/models/user/user-schema";
import { FollowRelationshipStatus } from "src/lib/constant";

export const createStoryService = async (req: Request, res: Response) => {
  try {
    const { id: userId } = req.user as JwtPayload;
    const { content, media, taggedUsers, visibility } = req.body;

    if (!content && !media) {
      return errorResponseHandler(
        "Story must have either text content or media",
        httpStatusCode.BAD_REQUEST,
        res
      );
    }

    let validatedTaggedUsers: string[] = [];
    if (taggedUsers && Array.isArray(taggedUsers)) {
      // Check if user is trying to tag themselves
      if (taggedUsers.includes(userId)) {
        return errorResponseHandler(
          "You cannot tag yourself in the story",
          httpStatusCode.BAD_REQUEST,
          res
        );
      }

      for (const id of taggedUsers) {
        // Validate if tagged user exists
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

    const newStory = await storyModel.create({
      user: userId,
      content,
      media,
      taggedUsers: validatedTaggedUsers,
      visibility: visibility || PostVisibility.PUBLIC,
      expiresAt
    });

    const populatedStory = await newStory.populate([
      { path: 'user', select: '-password' },
      { path: 'taggedUsers', select: '-password' }
    ]);

    return {
      success: true,
      message: "Story created successfully",
      data: populatedStory
    };
  } catch (error) {
    throw error;
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