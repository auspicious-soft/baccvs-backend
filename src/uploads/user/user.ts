import { Request, Response } from "express"
import { errorResponseHandler } from "../../lib/errors/error-response-handler"
import { AtmosphereVibe, EventType, InterestCategory, MusicStyle, usersModel } from "../../models/user/user-schema"
import bcrypt from "bcryptjs"
import { generatePasswordResetToken, generatePasswordResetTokenByPhone, getPasswordResetTokenByToken } from "../../utils/mails/token"
import { sendEmailVerificationCode, sendPasswordResetEmail } from "../../utils/mails/mail"
import { generatePasswordResetTokenByPhoneWithTwilio } from "../../utils/sms/sms"
import { FollowRelationshipStatus, httpStatusCode, PostVisibility } from "../../lib/constant"
import { customAlphabet } from "nanoid"
import jwt, { JwtPayload } from "jsonwebtoken"
import { configDotenv } from 'dotenv';
import { createReferralCodeService, generateUserToken, getReferralCodeCreator, getSignUpQueryByAuthType, handleExistingUser, hashPasswordIfEmailAuth, validatePassword, validateUserForLogin } from "src/utils/userAuth/signUpAuth"
import { ReferralCodeModel } from "src/models/referalcode/referal-schema"
import { passwordResetTokenModel } from "src/models/password-token-schema"
import { followModel } from "src/models/follow/follow-schema"
import { storyModel } from "src/models/story/story-schema"
import { postModels } from "src/models/post/post-schema"
import { LikeModel } from "src/models/like/like-schema"
import { RepostModel } from "src/models/repost/repost-schema"
import { eventModel } from "src/models/event/event-schema"
import { UserMatch } from "src/models/usermatch/usermatch-schema"
import { Comment } from "src/models/comment/comment-schema"
configDotenv()


const sanitizeUser = (user: any) => {
  const sanitized = user.toObject();
  delete sanitized.password;
  return sanitized;
};

export const signUpService = async (userData: any, authType: string, res: Response) => {
  if(!userData) return errorResponseHandler("User data is required", httpStatusCode.BAD_REQUEST, res)  
 
      // Validate auth type
      if (!authType) {
        return errorResponseHandler("Auth type is required", httpStatusCode.BAD_REQUEST, res);
      }
  
      if (!["Email", "Google", "Apple", "Facebook", "Twitter"].includes(authType)) {
        return errorResponseHandler("Invalid auth type", httpStatusCode.BAD_REQUEST, res);
      }
  
      // Check for existing user
      const query = getSignUpQueryByAuthType(userData, authType);
      const existingUser = await usersModel.findOne(query);
      const existingUserResponse = existingUser ? handleExistingUser(existingUser as any, authType, res) : null;
      if (existingUserResponse) return existingUserResponse;
      const existingNumber = await usersModel.findOne({ phoneNumber: userData.phoneNumber });
      if (existingNumber) {
        return errorResponseHandler("Phone number already registered", httpStatusCode.BAD_REQUEST, res);
      }
      const existingUserName = await usersModel.findOne({ userName: userData.userName });
      if (existingUserName) {
        return errorResponseHandler("Username already taken", httpStatusCode.BAD_REQUEST, res);
      }
  
      // Prepare new user data
      const newUserData = { 
        ...userData,
        authType,
        email: userData.email?.toLowerCase(), // Ensure email is lowercase
        identifier: customAlphabet("0123456789", 5)(),
      };
  
      // Hash password if email auth
      newUserData.password = await hashPasswordIfEmailAuth(userData, authType);
  
      // Get referral code if provided
      if(!userData.referralCode) {
        return errorResponseHandler("Referral code is required", httpStatusCode.BAD_REQUEST, res);
      }
      if (userData.referralCode) {
        newUserData.referredBy = await getReferralCodeCreator(userData, res);
        if (!newUserData.referredBy) return; // getReferralCodeCreator will handle the error response
      }
  
      // Create user
      let user = await usersModel.create(newUserData);
  
      // Handle referral code updates
      if (user._id && newUserData.referredBy) {
        await Promise.all([
          ReferralCodeModel.findByIdAndUpdate(
            newUserData.referredBy,
            { 
              $set: {
                used: true, 
                referredUser: user._id
              }
            },
            { new: true }
          ),
          createReferralCodeService(user._id, res)
        ]);
      }
  
      // Generate token for non-email auth
      if (!process.env.JWT_SECRET) {
        return errorResponseHandler("JWT_SECRET is not defined", httpStatusCode.INTERNAL_SERVER_ERROR, res);
      }
  
      if (authType !== "Email") {
        user.token = generateUserToken(user as any);
      }
  
      // Populate and save
      user = await user.populate('referredBy');
      await user.save();
  
      return { 
        success: true, 
        message: authType === "Email" ? "User registered with Email successfully" : "Sign-up successfully", 
        data: sanitizeUser(user) 
      };
  };

export const loginUserService = async (userData: any, authType: string, res: Response) => {
if(!userData) return errorResponseHandler("User data is required", httpStatusCode.BAD_REQUEST, res)  
  if (!authType) {
    return errorResponseHandler("Auth type is required", httpStatusCode.BAD_REQUEST, res);
  }
    let query = getSignUpQueryByAuthType(userData, authType);
    let user: any = await usersModel.findOne(query);
    if(!user){
      errorResponseHandler("Invalid User Credential", httpStatusCode.NOT_FOUND, res);
    }
    // if (!user && (authType === 'Google' || authType === 'Apple' || authType === 'Facebook' || authType === 'Twitter')) {
    //     user = await createNewUser(userData, authType); // You should implement the createNewUser function as per your needs
    // }
  
    let validationResponse = await validateUserForLogin(user, authType, userData, res);
    if (validationResponse) return validationResponse;
  
    if (authType === "Email") {
        let passwordValidationResponse = await validatePassword(userData, user.password, res);
        if (passwordValidationResponse) return passwordValidationResponse;
    }
  
    user.token = generateUserToken(user as any);
    
    await user.save();
    return {
        success: true,
        message: "Logged in successfully",
        data: sanitizeUser(user),
    };
  };

// const createNewUser = async (userData: any, authType: string) => {
//     let newUser = new usersModel({
//         email: userData.email, 
//         username: userData.username, 
//         phoneNumber: userData.phoneNumber, 
//         dob:userData.dob,
//         gender: userData.gender,
//         authType: authType, 
//         interestedIn: userData.interestedIn,  
//         fcmToken: userData.fcmToken,   
//         photos: userData.photos,   
//         password: null,        
//         isEmailVerified: true,
//         location: userData.location,
//         identifier: customAlphabet("0123456789", 5)(),
//         countryCode: "+45",
//         referredBy: null,
//         token: generateUserToken(userData), 
//     });
  
//     await newUser.save();
    
//     return newUser;
// };  

export const verifyEmailService = async (payload: any, res: Response) => {
  if (!payload.email) return errorResponseHandler("Email is required", httpStatusCode.BAD_REQUEST, res);
  
  const { email, resend } = payload;
  
  // If not resending, check if email already exists
  if (!resend) {
    const existingEmail = await usersModel.findOne({ email });
    if (existingEmail) {
      return errorResponseHandler("Email already registered", httpStatusCode.BAD_REQUEST, res);
    }
  } else {
    // If resending, explicitly delete any existing tokens for this email
    await passwordResetTokenModel.findOneAndDelete({ email });
  }
  
  // Generate new token
  const genId = customAlphabet('0123456789', 6);
  const token = genId();
  const expires = new Date(new Date().getTime() + 60 * 1000); // 1 hour expiry
  
  // Create new token
  const newPasswordResetToken = new passwordResetTokenModel({
    email,
    token,
    expires
  });
  
  const savedToken = await newPasswordResetToken.save();
  
  if (savedToken) {
    await sendEmailVerificationCode(email, token);
    return { 
      success: true, 
      message: resend ? "Verification code resent successfully" : "Verification email with OTP sent" 
    };
  }
  
  return errorResponseHandler("Failed to generate verification code", httpStatusCode.INTERNAL_SERVER_ERROR, res);
}

export const verifyOtpEmailService = async (payload: any, res: Response) => {
  if(!payload.otp || !payload.email) return errorResponseHandler("Both Field is required", httpStatusCode.BAD_REQUEST, res)  
  const { otp, email } = payload
  
  // Parameters in correct order (email, token)
  const existingToken = await getPasswordResetTokenByToken(email, otp)
  if (!existingToken) return errorResponseHandler("Invalid OTP", httpStatusCode.BAD_REQUEST, res)

  const hasExpired = new Date(existingToken.expires) < new Date()
  if (hasExpired) return errorResponseHandler("OTP expired", httpStatusCode.BAD_REQUEST, res)

  return { success: true, message: "OTP verified successfully" }    
}

export const forgotPasswordService = async (payload: any, res: Response) => {
    const { email } = payload;
    
    const client = await usersModel.findOne({ email });
    if (!client) return errorResponseHandler("User not found", httpStatusCode.NOT_FOUND, res);

    // Generate a JWT token for password reset
    const resetToken = jwt.sign(
        { email, type: 'password_reset' },
        process.env.JWT_SECRET as string,
        { expiresIn: '1h' }
    );

    // Create reset link
    const resetLink = `${process.env.PASSWORD_RESET_URL}?token=${resetToken}`;

    // Send email with reset link
    await sendPasswordResetEmail(email,resetLink);

    return { 
        success: true, 
        message: "Password reset link sent to email" 
    };
}

export const resetPasswordWithTokenService = async (req: Request, res: Response) => {
  const { token, newPassword } = req.body;

  
    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as JwtPayload;
    
    if (decoded.type !== 'password_reset') {
      return errorResponseHandler(
        "Invalid reset token",
        httpStatusCode.BAD_REQUEST,
        res
      );
    }

    // Find user and update password
    const user = await usersModel.findOne({ email: decoded.email });
    if (!user) {
      return errorResponseHandler(
        "User not found",
        httpStatusCode.NOT_FOUND,
        res
      );
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;
    await user.save();

    // Determine if request is from mobile app or web
    const userAgent = req.headers['user-agent'] || '';
    const isMobileApp = userAgent.includes('yourAppIdentifier'); // Adjust based on your mobile app

    return {
      success: true,
      message: "Password reset successful",
      redirectUrl: isMobileApp ? 'yourapp://login' : '/login'
    };

  
};

export const verifyOtpPasswordResetService = async (token: string,email: string, res: Response) => {
    if(!token || !email) return errorResponseHandler("Both Field is required", httpStatusCode.BAD_REQUEST, res)
    const existingToken = await getPasswordResetTokenByToken(email,token)
    if (!existingToken) return errorResponseHandler("Invalid Credential", httpStatusCode.BAD_REQUEST, res)

    const hasExpired = new Date(existingToken.expires) < new Date()
    if (hasExpired) return errorResponseHandler("OTP expired", httpStatusCode.BAD_REQUEST, res)
    return { success: true, message: "OTP verified successfully",existingToken }
}


export const newPassswordAfterOTPVerifiedService = async (payload: any, res: Response) => {
    const { password, email } = payload

    if(!password || !email) return errorResponseHandler("Both Field is required", httpStatusCode.BAD_REQUEST, res)

    const existingClient = await usersModel.findOne({ email })
    if (!existingClient) return errorResponseHandler("User not found", httpStatusCode.NOT_FOUND, res)

    const hashedPassword = bcrypt.hashSync(password, 10)
    await usersModel.findByIdAndUpdate(existingClient._id, { password: hashedPassword },{ new: true })

    return {
        success: true,
        message: "Password updated successfully"
    }
}

export const passwordResetService = async (req: Request, res: Response) => {
    const { currentPassword, newPassword } = req.body
    const getAdmin = await usersModel.findById(req.params.id).select("+password")
    if (!getAdmin) return errorResponseHandler("Admin not found", httpStatusCode.NOT_FOUND, res)

    // const passwordMatch = bcrypt.compareSync(currentPassword, getAdmin.password)
    // if (!passwordMatch) return errorResponseHandler("Current password invalid", httpStatusCode.BAD_REQUEST, res)
    const hashedPassword = bcrypt.hashSync(newPassword, 10)
    const response = await usersModel.findByIdAndUpdate(req.params.id, { password: hashedPassword })
    return {
        success: true,
        message: "Password updated successfully",
        data: response
    }
}

export const getUserInfoService = async (id: string, res: Response) => {
    // const user = await usersModel.findById(id);
    // if (!user) return errorResponseHandler("User not found", httpStatusCode.NOT_FOUND, res);
  
    // const userProjects = await projectsModel.find({ userId: id }).select("-__v");
  
    // return {
    //     success: true,
    //     message: "User retrieved successfully",
    //     data: {
    //         user,
    //         projects: userProjects.length > 0 ? userProjects : [],
    //     }
    // };
}

export const getUserInfoByEmailService = async (email: string, res: Response) => {
    const client = await usersModel.findOne({ email })
    if (!client) return errorResponseHandler("User not found", httpStatusCode.NOT_FOUND, res)
    return {
        success: true,
        message: "Client info fetched successfully",
        data: client
    }
}

export const editUserInfoService = async (id: string, payload: any, req: any, res: Response) => {
  const { id: userId } = req.user;
  const user = await usersModel.findById(id);
  if (!user) return errorResponseHandler("User not found", httpStatusCode.NOT_FOUND, res);

  if (userId !== id) return errorResponseHandler("Unauthorized you can only edit your own profile", httpStatusCode.UNAUTHORIZED, res);
  
  // Create an object with only the allowed fields
  const allowedFields = [
    'userName', 
    'photos', 
    'about', 
    'drinking', 
    'smoke', 
    'marijuana', 
    'drugs', 
    'interestCategories', 
    'musicStyles', 
    'atmosphereVibes', 
    'eventTypes', 
    'height',
    'location'
  ];
  
  const updateData: any = {};
  
  // Only copy allowed fields from payload
  allowedFields.forEach(field => {
    if (payload[field] !== undefined) {
      updateData[field] = payload[field];
    }
  });
  
  // Validate enum fields
  if (updateData.drinking && !["Yes", "No", "prefer not to say"].includes(updateData.drinking)) {
    return errorResponseHandler("Invalid drinking value", httpStatusCode.BAD_REQUEST, res);
  }
  
  if (updateData.smoke && !["Yes", "No", "prefer not to say"].includes(updateData.smoke)) {
    return errorResponseHandler("Invalid smoke value", httpStatusCode.BAD_REQUEST, res);
  }
  
  if (updateData.marijuana && !["Yes", "No", "prefer not to say"].includes(updateData.marijuana)) {
    return errorResponseHandler("Invalid marijuana value", httpStatusCode.BAD_REQUEST, res);
  }
  
  if (updateData.drugs && !["Yes", "No", "prefer not to say"].includes(updateData.drugs)) {
    return errorResponseHandler("Invalid drugs value", httpStatusCode.BAD_REQUEST, res);
  }
  
  // Validate interestCategories
  if (updateData.interestCategories && Array.isArray(updateData.interestCategories)) {
    for (const category of updateData.interestCategories) {
      if (!Object.values(InterestCategory).includes(category)) {
        return errorResponseHandler(`Invalid interest category: ${category}`, httpStatusCode.BAD_REQUEST, res);
      }
    }
  }
  
  // Validate musicStyles
  if (updateData.musicStyles && Array.isArray(updateData.musicStyles)) {
    for (const style of updateData.musicStyles) {
      if (!Object.values(MusicStyle).includes(style)) {
        return errorResponseHandler(`Invalid music style: ${style}`, httpStatusCode.BAD_REQUEST, res);
      }
    }
  }
  
  // Validate atmosphereVibes
  if (updateData.atmosphereVibes && Array.isArray(updateData.atmosphereVibes)) {
    for (const vibe of updateData.atmosphereVibes) {
      if (!Object.values(AtmosphereVibe).includes(vibe)) {
        return errorResponseHandler(`Invalid atmosphere vibe: ${vibe}`, httpStatusCode.BAD_REQUEST, res);
      }
    }
  }
  
  // Validate eventTypes
  if (updateData.eventTypes && Array.isArray(updateData.eventTypes)) {
    for (const type of updateData.eventTypes) {
      if (!Object.values(EventType).includes(type)) {
        return errorResponseHandler(`Invalid event type: ${type}`, httpStatusCode.BAD_REQUEST, res);
      }
    }
  }
  
  // Handle location update if provided
  if (payload.location) {
    if (!updateData.location) {
      updateData.location = {
        type: 'Point',
        coordinates: [0, 0],
        address: ''
      };
    }
    
    if (payload.location.coordinates) {
      updateData.location.coordinates = payload.location.coordinates;
    }
    
    if (payload.location.address) {
      updateData.location.address = payload.location.address;
    }
  }
  
  // Ensure photos is properly handled as an array
  if (payload.photos !== undefined) {
    updateData.photos = Array.isArray(payload.photos) ? payload.photos : [];
  }
  
  const updatedUser = await usersModel.findByIdAndUpdate(
    id,
    { $set: updateData },
    { new: true }
  );

  return {
    success: true,
    message: "User updated successfully",
    data: updatedUser,
  };
}

// Dashboard
export const getDashboardStatsService = async (req: any, res: Response) => {
    try {
        const { id: userId } = req.user;
        
        // Check if user has posted any content
        const hasUserPostedContent = await postModels.exists({ user: userId });
        
        // Get users the current user follows
        const following = await followModel.find({
            follower_id: userId,
            relationship_status: FollowRelationshipStatus.FOLLOWING,
            is_approved: true
        }).select('following_id');
        
        const followingIds = following.map(f => f.following_id);
        
        // ===== STORIES SECTION =====
        // Get current user's own stories
        const userStoriesRaw = await storyModel
            .find({
                user: userId,
                expiresAt: { $gt: new Date() }
            })
            .sort({ createdAt: -1 })
            .populate('user', 'userName photos');
            
        // Group user's own stories
        let userStories = null;
        if (userStoriesRaw.length > 0) {
            userStories = {
                user: userStoriesRaw[0].user,
                stories: userStoriesRaw
            };
        }
            
        // Get stories from users the current user follows
        const followingStoriesRaw = await storyModel
            .find({
                user: { $in: followingIds },
                expiresAt: { $gt: new Date() }
            })
            .sort({ createdAt: -1 })
            .populate('user', 'userName photos')
            .limit(10);
        
        // Group following stories by user
        const followingStoriesByUser: { [key: string]: { user: any; stories: any[] } } = {};
        followingStoriesRaw.forEach(story => {
            const storyUserId = story.user._id.toString();
            
            if (!followingStoriesByUser[storyUserId]) {
                followingStoriesByUser[storyUserId] = {
                    user: story.user,
                    stories: []
                };
            }
            
            followingStoriesByUser[storyUserId].stories.push(story);
        });
        
        // Convert to array for easier frontend handling
        const followingStories = Object.values(followingStoriesByUser);
        
        // ===== POSTS SECTION =====
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 10;
        const skip = (page - 1) * limit;
        
        // First get posts from followed users
        const followingPosts = await postModels
            .find({
                user: { $in: followingIds }
            })
            .sort({ createdAt: -1 })
            .populate('user', 'userName photos');
            
        // If we don't have enough posts from followed users, get public posts
        let publicPosts : any[] = [];
        if (followingPosts.length < limit) {
            const neededPublicPosts = limit - followingPosts.length;
            
            publicPosts = await postModels
                .find({
                    user: { $nin: [...followingIds, userId] }, // Exclude followed users and self
                    visibility: PostVisibility.PUBLIC
                })
                .sort({ createdAt: -1 })
                .limit(neededPublicPosts)
                .populate('user', 'userName photos');
        }
        
        // Combine followed posts with public posts
        const allPosts = [...followingPosts, ...publicPosts];
        
        // Apply pagination to the combined posts
        const paginatedPosts = allPosts.slice(skip, skip + limit);
        
        // ===== REPOSTS SECTION =====
        // Get reposts from followed users
        const followingReposts = await RepostModel.find({
            user: { $in: followingIds }
        })
        .sort({ createdAt: -1 })
        .populate('user', 'userName photos')
        .populate({
            path: 'originalPost',
            populate: {
                path: 'user',
                select: 'userName photos'
            }
        });
        
        // Apply pagination to reposts
        const paginatedReposts = followingReposts.slice(skip, skip + limit);
        
        // Get post IDs for engagement stats
        const postIds = paginatedPosts.map(post => post._id);
        const repostIds = paginatedReposts.map(repost => repost._id);
        const originalPostIds = paginatedReposts.map(repost => repost.originalPost._id);
        
        // Get likes for posts
        const postLikes = await LikeModel.find({
            targetType: 'posts',
            target: { $in: postIds }
        });
        
        // Get likes for reposts
        const repostLikes = await LikeModel.find({
            targetType: 'reposts',
            target: { $in: repostIds }
        });
        
        // Get likes for original posts in reposts
        const originalPostLikes = await LikeModel.find({
            targetType: 'posts',
            target: { $in: originalPostIds }
        });
        
        // Get user's likes to determine which posts/reposts the user has already liked
        const userPostLikes = await LikeModel.find({
            user: userId,
            targetType: 'posts',
            target: { $in: [...postIds, ...originalPostIds] }
        });
        
        const userRepostLikes = await LikeModel.find({
            user: userId,
            targetType: 'reposts',
            target: { $in: repostIds }
        });
        
        // Create sets of IDs that the user has liked for quick lookup
        const userLikedPostIds = new Set(userPostLikes.map(like => like.target.toString()));
        const userLikedRepostIds = new Set(userRepostLikes.map(like => like.target.toString()));
        
        // Get comments for posts
        const postComments = await Comment.find({
            post: { $in: postIds },
            isDeleted: false
        });
        
        // Get comments for reposts
        const repostComments = await Comment.find({
            repost: { $in: repostIds },
            isDeleted: false
        });
        
        // Get comments for original posts in reposts
        const originalPostComments = await Comment.find({
            post: { $in: originalPostIds },
            isDeleted: false
        });
        
        // Get reposts for posts
        const postsReposts = await RepostModel.find({
            originalPost: { $in: postIds }
        });
        
        // Get reposts for original posts in reposts
        const originalPostsReposts = await RepostModel.find({
            originalPost: { $in: originalPostIds }
        });
        
        // Create maps of engagement stats
        const postEngagementStats: { [key: string]: { likes: number; comments: number; reposts: number } } = {};
        postIds.forEach(postId => {
            postEngagementStats[postId.toString()] = {
                likes: 0,
                comments: 0,
                reposts: 0
            };
        });
        
        const repostEngagementStats: { [key: string]: { likes: number; comments: number } } = {};
        repostIds.forEach(repostId => {
            repostEngagementStats[repostId.toString()] = {
                likes: 0,
                comments: 0
            };
        });
        
        const originalPostEngagementStats: { [key: string]: { likes: number; comments: number; reposts: number } } = {};
        originalPostIds.forEach(postId => {
            originalPostEngagementStats[postId.toString()] = {
                likes: 0,
                comments: 0,
                reposts: 0
            };
        });
        
        // Fill in the post engagement stats
        postLikes.forEach(like => {
            const postId = like.target.toString();
            if (postEngagementStats[postId]) {
                postEngagementStats[postId].likes += 1;
            }
        });
        
        postComments.forEach(comment => {
            const postId = comment.post?.toString();
            if (postId && postEngagementStats[postId]) {
                postEngagementStats[postId].comments += 1;
            }
        });
        
        postsReposts.forEach(repost => {
            const postId = repost.originalPost.toString();
            if (postEngagementStats[postId]) {
                postEngagementStats[postId].reposts += 1;
            }
        });
        
        // Fill in the repost engagement stats
        repostLikes.forEach(like => {
            const repostId = like.target.toString();
            if (repostEngagementStats[repostId]) {
                repostEngagementStats[repostId].likes += 1;
            }
        });
        
        repostComments.forEach(comment => {
            const repostId = comment.repost?.toString();
            if (repostId && repostEngagementStats[repostId]) {
                repostEngagementStats[repostId].comments += 1;
            }
        });
        
        // Fill in the original post engagement stats for reposts
        originalPostLikes.forEach(like => {
            const postId = like.target.toString();
            if (originalPostEngagementStats[postId]) {
                originalPostEngagementStats[postId].likes += 1;
            }
        });
        
        originalPostComments.forEach(comment => {
            const postId = comment.post?.toString();
            if (postId && originalPostEngagementStats[postId]) {
                originalPostEngagementStats[postId].comments += 1;
            }
        });
        
        originalPostsReposts.forEach(repost => {
            const postId = repost.originalPost.toString();
            if (originalPostEngagementStats[postId]) {
                originalPostEngagementStats[postId].reposts += 1;
            }
        });
        
        // Enrich posts with engagement data
        const enrichedPosts = paginatedPosts.map(post => {
            const postId = post._id.toString();
            const engagement = postEngagementStats[postId] || { likes: 0, comments: 0, reposts: 0 };
            
            // Convert ObjectId to string for proper comparison
            const postUserId = post.user._id.toString();
            
            // Check if this post's author is in the followingIds array
            const isFollowed = followingIds.some(followingId => 
                followingId.toString() === postUserId
            );
            
            // Check if the current user has liked this post
            const isLikedByUser = userLikedPostIds.has(postId);
            
            return {
                _id: post._id,
                content: post.content,
                photos: post.photos,
                createdAt: post.createdAt,
                user: post.user,
                visibility: post.visibility,
                likesCount: engagement.likes,
                commentsCount: engagement.comments,
                repostsCount: engagement.reposts,
                isFollowedUser: isFollowed,
                isLikedByUser: isLikedByUser
            };
        });
        
        // Enrich reposts with engagement data
        const enrichedReposts = paginatedReposts.map(repost => {
            const repostId = repost._id.toString();
            const repostEngagement = repostEngagementStats[repostId] || { likes: 0, comments: 0 };
            
            const originalPostId = repost.originalPost._id.toString();
            const originalPostEngagement = originalPostEngagementStats[originalPostId] || { likes: 0, comments: 0, reposts: 0 };
            
            // Convert ObjectId to string for proper comparison
            const repostUserId = repost.user._id.toString();
            
            // Check if this repost's author is in the followingIds array
            const isFollowed = followingIds.some(followingId => 
                followingId.toString() === repostUserId
            );
            
            // Check if the current user has liked this repost
            const isLikedByUser = userLikedRepostIds.has(repostId);
            
            // Check if the current user has liked the original post
            const isOriginalPostLikedByUser = userLikedPostIds.has(originalPostId);
            
            return {
                _id: repost._id,
                type: repost.type,
                content: repost.content,
                createdAt: repost.createdAt,
                user: repost.user,
                originalPost: {
                    ...((repost.originalPost && typeof (repost.originalPost as any).toObject === 'function')
                        ? (repost.originalPost as any).toObject()
                        : { _id: repost.originalPost }),
                    likesCount: originalPostEngagement.likes,
                    commentsCount: originalPostEngagement.comments,
                    repostsCount: originalPostEngagement.reposts,
                    isLikedByUser: isOriginalPostLikedByUser
                },
                likesCount: repostEngagement.likes,
                commentsCount: repostEngagement.comments,
                isFollowedUser: isFollowed,
                isLikedByUser: isLikedByUser
            };
        });
        
        // ===== EVENTS SECTION =====
        const userLocation = await usersModel.findById(userId).select('location');
        
        let nearbyEvents = [];
        if (userLocation?.location && 'coordinates' in userLocation.location) {
            // Get nearby events (within 50km)
            nearbyEvents = await eventModel.aggregate([
                {
                    $geoNear: {
                        near: {
                            type: "Point",
                            coordinates: userLocation.location.coordinates as [number, number]
                        },
                        distanceField: "distance",
                        maxDistance: 50000, // 50km in meters
                        spherical: true
                    }
                },
                {
                    $match: {
                        startDate: { $gte: new Date() }
                    }
                },
                {
                    $limit: 5
                }
            ]);
            
            // Convert distance to km
            nearbyEvents = nearbyEvents.map(event => ({
                ...event,
                distanceInKm: Math.round((event.distance / 1000) * 10) / 10
            }));
        }
        
        // ===== STATS SECTION =====
        // Get user match stats
        const matchStats = {
            likesSent: await UserMatch.countDocuments({
                fromUser: userId,
                type: "like",
                subType: null
            }),
            matches: await UserMatch.countDocuments({
                fromUser: userId,
                type: "like",
                isMatch: true
            })
        };
        
        // Get follow stats
        const followStats = {
            followers: await followModel.countDocuments({
                following_id: userId,
                relationship_status: FollowRelationshipStatus.FOLLOWING
            }),
            following: following.length
        };
        
        return {
            success: true,
            message: "Dashboard feed fetched successfully",
            data: {
                userActivity: {
                    hasPosted: !!hasUserPostedContent
                },
                stories: {
                    userStories: userStories,
                    followingStories: followingStories
                },
                posts: enrichedPosts,
                reposts: enrichedReposts,
                suggestedEvents: nearbyEvents,
                stats: {
                    matches: matchStats,
                    follows: followStats
                },
                pagination: {
                    total: allPosts.length + followingReposts.length,
                    postsTotal: allPosts.length,
                    repostsTotal: followingReposts.length,
                    page,
                    limit,
                    pages: Math.ceil((allPosts.length + followingReposts.length) / limit),
                    hasNext: page * limit < (allPosts.length + followingReposts.length),
                    hasPrev: page > 1
                }
            }
        };
    } catch (error) {
        console.error("Error in getDashboardStatsService:", error);
        throw error;
    }
}

export const verifyCurrentPasswordService = async (req : any, res: Response) => {
  const {id : userId} = req.user ;  
  const { password } = req.body;
  const user = await usersModel.findById(userId).select('+password');
    if (!user) {
        return errorResponseHandler("User not found", httpStatusCode.NOT_FOUND, res);
    }

    if (!user.password) {
        return errorResponseHandler("Password is not set for this user", httpStatusCode.BAD_REQUEST, res);
    }
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
        return errorResponseHandler("Invalid password", httpStatusCode.UNAUTHORIZED, res);
    }

    return {
        success: true,
        message: "Password verified successfully"
    };
};

export const initiateEmailChangeService = async (req : any, res: Response) => {
    const { id: userId } = req.user;
    const { newEmail } = req.body;
    const user = await usersModel.findById(userId);
    if (!user) {
        return errorResponseHandler("User not found", httpStatusCode.NOT_FOUND, res);
    }

    // Check if new email already exists
    const emailExists = await usersModel.findOne({ email: newEmail.toLowerCase() });
    if (emailExists) {
        return errorResponseHandler("Email already in use", httpStatusCode.BAD_REQUEST, res);
    }

    // Store new email in session or temporary storage
    await usersModel.findByIdAndUpdate(userId, { 
        tempEmail: newEmail.toLowerCase() 
    });

    // Generate and send OTP
    const passwordResetToken = await generatePasswordResetToken(newEmail);
    if (passwordResetToken) {
        await sendEmailVerificationCode(newEmail, passwordResetToken.token);
        return {
            success: true,
            message: "Verification code sent to new email"
        };
    }

    return errorResponseHandler("Failed to send verification code", httpStatusCode.INTERNAL_SERVER_ERROR, res);
};

export const verifyAndChangeEmailService = async (req : any, res: Response) => {
    const { id: userId } = req.user;
    const { otp } = req.body;
    const user = await usersModel.findById(userId);
    if (!user) {
        return errorResponseHandler("User not found", httpStatusCode.NOT_FOUND, res);
    }

    if (!user.tempEmail) {
        return errorResponseHandler("No email change was initiated", httpStatusCode.BAD_REQUEST, res);
    }

    // Verify OTP
    const existingToken = await getPasswordResetTokenByToken( user.tempEmail,otp);
    if (!existingToken) {
        return errorResponseHandler("Invalid OTP", httpStatusCode.BAD_REQUEST, res);
    }

    if (new Date(existingToken.expires) < new Date()) {
        return errorResponseHandler("OTP expired", httpStatusCode.BAD_REQUEST, res);
    }

    // Update email
    user.email = user.tempEmail;
    user.tempEmail = "";
    await user.save();

    return {
        success: true,
        message: "Email updated successfully",
        data: { email: user.email }
    };
};

export const initiatePhoneChangeService = async (req : any, res: Response) => {
    const { id: userId } = req.user;
    const { newPhoneNumber } = req.body;
    const user = await usersModel.findById(userId);
    if (!user) {
        return errorResponseHandler("User not found", httpStatusCode.NOT_FOUND, res);
    }

    // Check if phone number already exists
    const phoneExists = await usersModel.findOne({ phoneNumber: newPhoneNumber });
    if (phoneExists) {
        return errorResponseHandler("Phone number already in use", httpStatusCode.BAD_REQUEST, res);
    }

    // Store new phone in session or temporary storage
    await usersModel.findByIdAndUpdate(userId, { 
        tempPhoneNumber: newPhoneNumber 
    });

    // Generate and send OTP via SMS
    const passwordResetToken = await generatePasswordResetTokenByPhone(newPhoneNumber);
    if (passwordResetToken) {
        await generatePasswordResetTokenByPhoneWithTwilio(newPhoneNumber, passwordResetToken.token);
        return {
            success: true,
            message: "Verification code sent to new phone number"
        };
    }

    return errorResponseHandler("Failed to send verification code", httpStatusCode.INTERNAL_SERVER_ERROR, res);
};

export const verifyAndChangePhoneService = async (req : any, res: Response) => {
    const { id: userId } = req.user;
    const { otp } = req.body;
    const user = await usersModel.findById(userId);
    if (!user) {
        return errorResponseHandler("User not found", httpStatusCode.NOT_FOUND, res);
    }

    if (!user.tempPhoneNumber) {
        return errorResponseHandler("No phone change was initiated", httpStatusCode.BAD_REQUEST, res);
    }

    // Verify OTP
    const existingToken = await passwordResetTokenModel.findOne({
        phoneNumber: user.tempPhoneNumber,
        token: otp
    });

    if (!existingToken) {
        return errorResponseHandler("Invalid OTP", httpStatusCode.BAD_REQUEST, res);
    }

    if (new Date(existingToken.expires) < new Date()) {
        return errorResponseHandler("OTP expired", httpStatusCode.BAD_REQUEST, res);
    }

    // Update phone number
    user.phoneNumber = user.tempPhoneNumber;
    user.tempPhoneNumber = "";
    await user.save();

    return {
        success: true,
        message: "Phone number updated successfully",
        data: { phoneNumber: user.phoneNumber }
    };
};

export const notificationSettingService = async (req : any, res: Response) => {
  const { id: userId } = req.user;
  const { value, type } = req.body;

  // Validate input
  if (!userId) {
    return errorResponseHandler("User ID is required", httpStatusCode.BAD_REQUEST, res);
  }

  if (type === undefined || value === undefined) {
    return errorResponseHandler("Notification type and value are required", httpStatusCode.BAD_REQUEST, res);
  }

  // Find user by ID
  const user = await usersModel.findById(userId);
  if (!user) {
    return errorResponseHandler("User not found", httpStatusCode.NOT_FOUND, res);
  }

  // Update the specified notification setting
  if (type === 'pushNotification') {
    user.pushNotification = value;
  } else if (type === 'newsLetterNotification') {
    user.newsLetterNotification = value;
  } else if (type === 'eventsNotification') {
    user.eventsNotification = value;
  } else if (type === 'chatNotification') {
    user.chatNotification = value;
  } else {
    return errorResponseHandler("Invalid notification type", httpStatusCode.BAD_REQUEST, res);
  }

  // Save the updated user
  await user.save();

  // Return success response
  return {
    success: true,
    message: "Notification settings updated successfully",
    data: {
      [type]: value
    }
  };
};
export const toggleTwoFactorAuthenticationService = async (req: any, res: Response) => {
    const { id: userId } = req.user;
    const { enabled } = req.body;

    // Validate input
    if (!userId) {
      return errorResponseHandler("User ID is required", httpStatusCode.BAD_REQUEST, res);
    }

    if (enabled === undefined) {
      return errorResponseHandler("Two-factor authentication status is required", httpStatusCode.BAD_REQUEST, res);
    }

    if (typeof enabled !== 'boolean') {
      return errorResponseHandler("Two-factor authentication status must be a boolean", httpStatusCode.BAD_REQUEST, res);
    }

    // Find user by ID
    const user = await usersModel.findById(userId);
    if (!user) {
      return errorResponseHandler("User not found", httpStatusCode.NOT_FOUND, res);
    }

    // Update the two-factor authentication setting
    user.twoFactorAuthentication = enabled;

    // Save the updated user
    await user.save();

    // Return success response
    return {
      success: true,
      message: `Two-factor authentication ${enabled ? 'enabled' : 'disabled'} successfully`,
      data: {
        twoFactorAuthentication: enabled
      }
    };
  }

export const getReferalCodeService = async (req: any, res: Response) => {
    const { id: userId } = req.user;
    const referralCodes = await ReferralCodeModel.find({ codeCreatedBy: userId });
    if (!referralCodes) {
      return errorResponseHandler("Referral codes not found", httpStatusCode.NOT_FOUND, res);
    }
    return {
      success: true,
      message: "Referral codes retrieved successfully",
      data: referralCodes
    };  
    };

export const changePasswordService = async (req: any, res: Response) => {
  const { id: userId } = req.user;
  const { currentPassword, newPassword } = req.body;
  
  // Validate input
  if (!currentPassword || !newPassword) {
    return errorResponseHandler("Current password and new password are required", httpStatusCode.BAD_REQUEST, res);
  }
  
  if (currentPassword === newPassword) {
    return errorResponseHandler("New password must be different from current password", httpStatusCode.BAD_REQUEST, res);
  }
  
  // Find user with password
  const user = await usersModel.findById(userId).select('+password');
  if (!user) {
    return errorResponseHandler("User not found", httpStatusCode.NOT_FOUND, res);
  }
  
  // Verify current password
  if (!user.password) {
    return errorResponseHandler("Password is not set for this user", httpStatusCode.BAD_REQUEST, res);
  }
  const isPasswordValid = await bcrypt.compare(currentPassword, user.password);
  if (!isPasswordValid) {
    return errorResponseHandler("Current password is incorrect", httpStatusCode.UNAUTHORIZED, res);
  }
  
  // Hash and update new password
  const hashedPassword = await bcrypt.hash(newPassword, 10);
  user.password = hashedPassword;
  
  // Save the updated user
  await user.save();
  
  return {
    success: true,
    message: "Password changed successfully"
  };
}

