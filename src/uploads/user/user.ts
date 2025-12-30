import { Request, Response } from "express";
import {
  errorParser,
  errorResponseHandler,
  formatErrorResponse,
} from "../../lib/errors/error-response-handler";
import {
  AtmosphereVibe,
  EventType,
  InterestCategory,
  MusicStyle,
  usersModel,
} from "../../models/user/user-schema";
import bcrypt from "bcryptjs";
import {
  generatePasswordResetToken,
  generatePasswordResetTokenByPhone,
  getPasswordResetTokenByToken,
} from "../../utils/mails/token";
import {
  sendEmailVerificationCode,
  sendPasswordResetEmail,
} from "../../utils/mails/mail";
import { generatePasswordResetTokenByPhoneWithTwilio } from "../../utils/sms/sms";
import {
  FollowRelationshipStatus,
  Gender,
  httpStatusCode,
  PostVisibility,
} from "../../lib/constant";
import { customAlphabet } from "nanoid";
import jwt, { JwtPayload } from "jsonwebtoken";
import { configDotenv } from "dotenv";
import {
  createReferralCodeService,
  generateUserToken,
  getReferralCodeCreator,
  getSignUpQueryByAuthType,
  handleExistingUser,
  hashPasswordIfEmailAuth,
  validatePassword,
  validateUserForLogin,
} from "src/utils/userAuth/signUpAuth";
import { ReferralCodeModel } from "src/models/referalcode/referal-schema";
import { passwordResetTokenModel } from "src/models/password-token-schema";
import { followModel } from "src/models/follow/follow-schema";
import { storyModel } from "src/models/story/story-schema";
import { postModels } from "src/models/post/post-schema";
import { LikeModel } from "src/models/like/like-schema";
import { RepostModel } from "src/models/repost/repost-schema";
import { eventModel } from "src/models/event/event-schema";
import { UserMatch } from "src/models/usermatch/usermatch-schema";
import { Comment } from "src/models/comment/comment-schema";
import { Readable } from "stream";
import Busboy from "busboy";
import { uploadStreamToS3Service } from "src/configF/s3";
import { blockModel } from "src/models/block/block-schema";
import { SquadConversation } from "src/models/chat/squad-conversation-schema";
import { Squad } from "src/models/squad/squad-schema";
import { Message } from "src/models/chat/message-schema";
import { Conversation } from "src/models/chat/conversation-schema";
import { CommunityConversation } from "src/models/chat/community-conversation-schema";
import { Community } from "src/models/community/community-schema";
import { calculateDistanceInKm } from "src/utils/distanceCalculator";
import { parse } from "path";
import { json } from "body-parser";
import { ProfessionalProfileModel } from "src/models/professional/professional-schema";
configDotenv();

const sanitizeUser = (user: any) => {
  const sanitized = user.toObject();
  delete sanitized.password;
  return sanitized;
};

export const signUpService = async (
  req: any,
  userData: any,
  authType: string,
  res: Response
) => {
  if (!userData) {
    return {
      success: false,
      message: "User data is required",
      code: httpStatusCode.BAD_REQUEST,
    };
  }
  // Process file uploads if Content-Type is multipart/form-data
  let photos: string[] = [];
  if (req.headers["content-type"]?.includes("multipart/form-data")) {
    return new Promise((resolve, reject) => {
      const busboy = Busboy({ headers: req.headers });
      const uploadPromises: Promise<string>[] = [];
      const parsedData: any = { ...userData };

      busboy.on("field", (fieldname: string, value: string) => {
        if (fieldname === "location") {
          try {
            const parsedLocation = JSON.parse(value);
            if (
              parsedLocation &&
              parsedLocation.type === "Point" &&
              Array.isArray(parsedLocation.coordinates) &&
              parsedLocation.coordinates.length === 2 &&
              typeof parsedLocation.coordinates[0] === "number" &&
              typeof parsedLocation.coordinates[1] === "number"
            ) {
              parsedData[fieldname] = parsedLocation;

            } else {
              return reject({
                success: false,
                message:
                  "Invalid location format. Must be a GeoJSON Point with coordinates [longitude, latitude]",
                code: httpStatusCode.BAD_REQUEST,
              });
            }
          } catch (error) {
           return reject({
              success: false,
              message: "Failed to parse location. Must be a valid JSON string",
              code: httpStatusCode.BAD_REQUEST,
            });
          }
        } else {
          parsedData[fieldname] = value;
        }
      });

      busboy.on("file", (fieldname: string, fileStream: any, fileInfo: any) => {
      
        // Accept 'photos', 'videos', or any field that looks like a file
        const { filename, mimeType } = fileInfo;

        // Validate file type
        const isImage = mimeType.startsWith("image/");
        const isVideo = mimeType.startsWith("video/");

        if (!isImage && !isVideo) {
          fileStream.resume();
          return;
        }

     
        // Collect file chunks
        const chunks: Buffer[] = [];

        fileStream.on("data", (chunk: Buffer) => {
          chunks.push(chunk);
        });

        fileStream.on("end", () => {
        });

        fileStream.on("error", (error: any) => {
          console.error(`Busboy - File stream error for ${filename}:`, error);
        });

        // Create upload promise
        const uploadPromise = new Promise<string>(
          (resolveUpload, rejectUpload) => {
            const chunks: any = [];

            fileStream.on("data", (chunk: any) => {
              chunks.push(chunk);
            });

            fileStream.on("end", async () => {
              try {
                // Combine chunks into single buffer
                const fileBuffer = Buffer.concat(chunks);
                // Create readable stream from buffer
                const readableStream = new Readable();
                readableStream.push(fileBuffer);
                readableStream.push(null);

                // Upload to S3
                const s3Key = await uploadStreamToS3Service(
                  readableStream,
                  filename,
                  mimeType,
                  parsedData.email ||
                    `user_${customAlphabet("0123456789", 5)()}`
                );

                resolveUpload(s3Key);
              } catch (error) {
                console.error(`Busboy - Upload failed for ${filename}:`, error);
                rejectUpload(error);
              }
            });

            fileStream.on("error", (error: any) => {
              console.error(`Busboy - File stream error:`, error);
              rejectUpload(error);
            });
          }
        );

        uploadPromises.push(uploadPromise);
      });

      busboy.on("finish", async () => {
        try {
         
          // Wait for all file uploads to complete
          if (uploadPromises.length > 0) {
            photos = await Promise.all(uploadPromises);
          } else {
            console.log("Busboy - No files were uploaded");
          }

          // Extract authType from parsedData if not provided
          authType = authType || parsedData.authType;
         
          // Validate auth type
          if (!authType) {
            return reject({
              success: false,
              message: "Auth type is required",
              code: httpStatusCode.BAD_REQUEST,
            });
          }

          if (
            !["Email", "Google", "Apple", "Facebook", "Twitter"].includes(
              authType
            )
          ) {
            return reject({
              success: false,
              message: "Invalid auth type",
              code: httpStatusCode.BAD_REQUEST,
            });
          }

          // Continue with the original logic
          resolve(await processUserData(parsedData, authType, photos, res));
        } catch (error) {
          console.error("Upload error:", error);
          reject({
            success: false,
            message: (error as any).message || "Failed to upload files",
            code: httpStatusCode.INTERNAL_SERVER_ERROR,
          });
        }
      });

      busboy.on("error", (error: any) => {
        console.error("Busboy error:", error);
        reject({
          success: false,
          message: error.message || "Error processing file uploads",
          code: httpStatusCode.INTERNAL_SERVER_ERROR,
        });
      });

      // Important: pipe the request to busboy
      req.pipe(busboy);
    });
  } else {
    // If no multipart/form-data, process userData without file uploads
    authType = authType || userData.authType;
    
    // Validate auth type
    if (!authType) {
      return {
        success: false,
        message: "Auth type is required",
        code: httpStatusCode.BAD_REQUEST,
      };
    }

    if (
      !["Email", "Google", "Apple", "Facebook", "Twitter"].includes(authType)
    ) {
      return {
        success: false,
        message: "Invalid auth type",
        code: httpStatusCode.BAD_REQUEST,
      };
    }

    return processUserData(userData, authType, photos, res);
  }
};

// Helper function to process user data and continue original logic
const processUserData = async (
  userData: any,
  authType: string,
  photos: string[],
  res: Response
) => {
  // Check for existing user
  const query = getSignUpQueryByAuthType(userData, authType);
  const existingUser = await usersModel.findOne(query);
  const existingUserResponse = existingUser
    ? handleExistingUser(existingUser as any, authType, res)
    : null;
  if (existingUserResponse) return existingUserResponse;

  const existingNumber = await usersModel.findOne({
    phoneNumber: userData.phoneNumber,
  });
  if (existingNumber) {
    return {
      success: false,
      message: "Phone number already registered",
      code: httpStatusCode.BAD_REQUEST,
    };
  }

  const existingUserName = await usersModel.findOne({
    userName: userData.userName,
  });
  if (existingUserName) {
    return {
      success: false,
      message: "Username already taken",
      code: httpStatusCode.BAD_REQUEST,
    };
  }

  const userCount = await usersModel.countDocuments();

  // Prepare new user data
  const newUserData = {
    ...userData,
    authType,
    email: userData.email?.toLowerCase(),
    identifier: customAlphabet("0123456789", 5)(),
    photos, // Store S3 keys
  };

  // Hash password if email auth
  newUserData.password = await hashPasswordIfEmailAuth(userData, authType);

  // Get referral code if provided
  if (userCount > 0) {
    if (!userData.referralCode) {
      return {
        success: false,
        message: "Referral code is required",
        code: httpStatusCode.BAD_REQUEST,
      };
    }

    newUserData.referredBy = await getReferralCodeCreator(userData, res);
    if (!newUserData.referredBy) {
      return {
        success: false,
        message: "Invalid referral code",
        code: httpStatusCode.BAD_REQUEST,
      };
    }
  }

  // Create user
  let user = await usersModel.create(newUserData);

  // Handle referral updates only if not first user and referral exists
  if (userCount > 0 && user._id && newUserData.referredBy) {
    await Promise.all([
      ReferralCodeModel.findByIdAndUpdate(
        newUserData.referredBy,
        {
          $set: {
            used: true,
            referredUser: user._id,
          },
        },
        { new: true }
      ),
      createReferralCodeService(user._id, res),
    ]);
  } else if (userCount === 0) {
    // If this is the first user, just create their referral code
    await createReferralCodeService(user._id, res);
  }

  // Generate token for non-email auth
  if (!process.env.JWT_SECRET) {
    return {
      success: false,
      message: "JWT_SECRET is not defined",
      code: httpStatusCode.INTERNAL_SERVER_ERROR,
    };
  }

  if (authType !== "Email") {
    if (!userData.fcmToken) {
      return errorResponseHandler(
        "FCM token is required",
        httpStatusCode.BAD_REQUEST,
        res
      );
    }
    user.token = generateUserToken(user as any);
    user.fcmToken = userData.fcmToken;
  }

  // Populate and save
  user = await user.populate("referredBy");
  await user.save();

  // If user uploaded photos during signup, create an automatic post using the first photo
  try {
    const savedPhotos = (user as any).photos;
    if (Array.isArray(savedPhotos) && savedPhotos.length > 0) {
      const firstPhoto = savedPhotos[0];
      const autoPost = new postModels({
        user: user._id,
        content: "",
        photos: [firstPhoto],
        isAutoPost: true,
      });
      await autoPost.save();
    }
  } catch (err) {
    console.warn("Failed to create auto post for new user:", err);
  }

  return {
    success: true,
    message:
      authType === "Email"
        ? "User registered with Email successfully"
        : "Sign-up successfully",
    data: sanitizeUser(user),
  };
};

export const loginUserService = async (
  userData: any,
  authType: string,
  res: Response
) => {
  if (!userData)
    return errorResponseHandler(
      "User data is required",
      httpStatusCode.BAD_REQUEST,
      res
    );
  if (!authType) {
    return errorResponseHandler(
      "Auth type is required",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

  let query = getSignUpQueryByAuthType(userData, authType);
  let user: any = await usersModel.findOne(query);
  if (!user) {
    errorResponseHandler(
      "Invalid User Credential",
      httpStatusCode.NOT_FOUND,
      res
    );
  }
  if (user.status === "deleted") {
    return errorResponseHandler(
      "User account has been deleted",
      httpStatusCode.FORBIDDEN,
      res
    );
  }
  // if (!user && (authType === 'Google' || authType === 'Apple' || authType === 'Facebook' || authType === 'Twitter')) {
  //     user = await createNewUser(userData, authType); // You should implement the createNewUser function as per your needs
  // }

  let validationResponse = await validateUserForLogin(
    user,
    authType,
    userData,
    res
  );
  if (validationResponse) return validationResponse;

  if (authType === "Email") {
    let passwordValidationResponse = await validatePassword(
      userData,
      user.password,
      res
    );
    if (passwordValidationResponse) return passwordValidationResponse;
  }
  user.fcmToken = userData.fcmToken;
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
  if (!payload.email)
    return errorResponseHandler(
      "Email is required",
      httpStatusCode.BAD_REQUEST,
      res
    );

  const { email, resend } = payload;

  // If not resending, check if email already exists
  if (!resend) {
    const existingEmail = await usersModel.findOne({ email });
    if (existingEmail) {
      return errorResponseHandler(
        "Email already registered",
        httpStatusCode.BAD_REQUEST,
        res
      );
    }
  } else {
    // If resending, explicitly delete any existing tokens for this email
    await passwordResetTokenModel.findOneAndDelete({ email });
  }

  // Generate new token
  const genId = customAlphabet("0123456789", 6);
  const token = genId();
  const expires = new Date(new Date().getTime() + 60 * 1000); // 1 hour expiry

  // Create new token
  const newPasswordResetToken = new passwordResetTokenModel({
    email,
    token,
    expires,
  });

  const savedToken = await newPasswordResetToken.save();

  if (savedToken) {
    await sendEmailVerificationCode(email, token);
    return {
      success: true,
      message: resend
        ? "Verification code resent successfully"
        : "Verification email with OTP sent",
    };
  }

  return errorResponseHandler(
    "Failed to generate verification code",
    httpStatusCode.INTERNAL_SERVER_ERROR,
    res
  );
};

export const verifyOtpEmailService = async (payload: any, res: Response) => {
  if (!payload.otp || !payload.email)
    return errorResponseHandler(
      "Both Field is required",
      httpStatusCode.BAD_REQUEST,
      res
    );
  const { otp, email } = payload;

  // Parameters in correct order (email, token)
  const existingToken = await getPasswordResetTokenByToken(email, otp);
  if (!existingToken)
    return errorResponseHandler("Invalid OTP", httpStatusCode.BAD_REQUEST, res);

  const hasExpired = new Date(existingToken.expires) < new Date();
  if (hasExpired)
    return errorResponseHandler("OTP expired", httpStatusCode.BAD_REQUEST, res);

  return { success: true, message: "OTP verified successfully" };
};

export const forgotPasswordService = async (payload: any, res: Response) => {
  const { email } = payload;

  const client = await usersModel.findOne({ email });
  if (!client)
    return errorResponseHandler(
      "User not found",
      httpStatusCode.NOT_FOUND,
      res
    );

  // Generate a JWT token for password reset
  const resetToken = jwt.sign(
    { email, type: "password_reset" },
    process.env.JWT_SECRET as string,
    { expiresIn: "1h" }
  );

  // Create reset link with query parameter format
  const resetLink = `${process.env.PASSWORD_RESET_URL}?token=${resetToken}`;

  // Send email with reset link
  await sendPasswordResetEmail(email, resetLink);

  return {
    success: true,
    message: "Password reset link sent to email",
  };
};

export const resetPasswordWithTokenService = async (
  req: Request,
  res: Response
) => {
  const { token, newPassword } = req.body;

  // Verify token
  const decoded = jwt.verify(
    token,
    process.env.JWT_SECRET as string
  ) as JwtPayload;

  if (decoded.type !== "password_reset") {
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
  const userAgent = req.headers["user-agent"] || "";
  const isMobileApp = userAgent.includes("yourAppIdentifier"); // Adjust based on your mobile app

  return {
    success: true,
    message: "Password reset successful",
    redirectUrl: isMobileApp ? "yourapp://login" : "/login",
  };
};

export const verifyOtpPasswordResetService = async (
  token: string,
  email: string,
  res: Response
) => {
  if (!token || !email)
    return errorResponseHandler(
      "Both Field is required",
      httpStatusCode.BAD_REQUEST,
      res
    );
  const existingToken = await getPasswordResetTokenByToken(email, token);
  if (!existingToken)
    return errorResponseHandler(
      "Invalid Credential",
      httpStatusCode.BAD_REQUEST,
      res
    );

  const hasExpired = new Date(existingToken.expires) < new Date();
  if (hasExpired)
    return errorResponseHandler("OTP expired", httpStatusCode.BAD_REQUEST, res);
  return { success: true, message: "OTP verified successfully", existingToken };
};

export const newPassswordAfterOTPVerifiedService = async (
  payload: any,
  res: Response
) => {
  const { password, email } = payload;

  if (!password || !email)
    return errorResponseHandler(
      "Both Field is required",
      httpStatusCode.BAD_REQUEST,
      res
    );

  const existingClient = await usersModel.findOne({ email });
  if (!existingClient)
    return errorResponseHandler(
      "User not found",
      httpStatusCode.NOT_FOUND,
      res
    );

  const hashedPassword = bcrypt.hashSync(password, 10);
  await usersModel.findByIdAndUpdate(
    existingClient._id,
    { password: hashedPassword },
    { new: true }
  );

  return {
    success: true,
    message: "Password updated successfully",
  };
};

export const passwordResetService = async (req: Request, res: Response) => {
  const { currentPassword, newPassword } = req.body;
  const getAdmin = await usersModel.findById(req.params.id).select("+password");
  if (!getAdmin)
    return errorResponseHandler(
      "Admin not found",
      httpStatusCode.NOT_FOUND,
      res
    );

  // const passwordMatch = bcrypt.compareSync(currentPassword, getAdmin.password)
  // if (!passwordMatch) return errorResponseHandler("Current password invalid", httpStatusCode.BAD_REQUEST, res)
  const hashedPassword = bcrypt.hashSync(newPassword, 10);
  const response = await usersModel.findByIdAndUpdate(req.params.id, {
    password: hashedPassword,
  });
  return {
    success: true,
    message: "Password updated successfully",
    data: response,
  };
};

export const getUserInfoService = async (req: any, res: Response) => {
  if (!req.params.id)
    return errorResponseHandler(
      "User ID is required",
      httpStatusCode.BAD_REQUEST,
      res
    );

  const { id: currentUserId } = req.user;
  const targetUserId = req.params.id;

  // Check block status
  const blockRecord = await blockModel.findOne({
    $or: [
      { blockedBy: currentUserId, blockedUser: targetUserId },
      { blockedBy: targetUserId, blockedUser: currentUserId },
    ],
  });

  // Single flag logic
  let isBlockedByOtherUser: boolean | null = null;

  if (blockRecord) {
    if (blockRecord.blockedBy.toString() === targetUserId) {
      // Other user blocked you
      isBlockedByOtherUser = true;
    } else {
      // You blocked the other user
      isBlockedByOtherUser = false;
    }
  }

  // Fetch target user
  const user = await usersModel
    .findById(targetUserId)
    .select("-password -token -stripeCustomerId -__v");

  if (!user)
    return errorResponseHandler(
      "User not found",
      httpStatusCode.NOT_FOUND,
      res
    );

  const followerCount = await followModel.countDocuments({
    following_id: targetUserId,
    relationship_status: FollowRelationshipStatus.FOLLOWING,
    is_approved: true,
  });

  const followingCount = await followModel.countDocuments({
    follower_id: targetUserId,
    relationship_status: FollowRelationshipStatus.FOLLOWING,
    is_approved: true,
  });

  const eventCount = await eventModel.countDocuments({
    creator: targetUserId,
  });

  const isFollowedByCurrentUser = await followModel.exists({
    follower_id: currentUserId,
    following_id: targetUserId,
    relationship_status: FollowRelationshipStatus.FOLLOWING,
    is_approved: true,
  });

  const isFollowingCurrentUser = await followModel.exists({
    follower_id: targetUserId,
    following_id: currentUserId,
    relationship_status: FollowRelationshipStatus.FOLLOWING,
    is_approved: true,
  });

  const conversationId = await Conversation.findOne({
    participants: { $all: [currentUserId, targetUserId] },
  }).select("_id");

  let professionalProfiles = await ProfessionalProfileModel.find({
    user: targetUserId,
  });

  return {
    success: true,
    message: "User retrieved successfully",
    data: {
      user,
      followerCount,
      followingCount,
      eventCount,
      isFollowedByCurrentUser: !!isFollowedByCurrentUser,
      isFollowingCurrentUser: !!isFollowingCurrentUser,
      conversationId: conversationId ? conversationId._id : null,
      isBlockedByOtherUser,
      professionalProfiles,
    },
  };
};

export const getUserInfoByEmailService = async (
  email: string,
  res: Response
) => {
  const client = await usersModel.findOne({ email });
  if (!client)
    return errorResponseHandler(
      "User not found",
      httpStatusCode.NOT_FOUND,
      res
    );
  return {
    success: true,
    message: "Client info fetched successfully",
    data: client,
  };
};

export const editUserInfoService = async (req: any, res: Response) => {
  const { id: userId, email: userEmail } = req.user;

  // Check if user exists and authorization
  const user = await usersModel.findById(userId);
  if (!user)
    return errorResponseHandler(
      "User not found",
      httpStatusCode.NOT_FOUND,
      res
    );

  // Check content type - expect multipart/form-data for file uploads
  if (!req.headers["content-type"]?.includes("multipart/form-data")) {
    return errorResponseHandler(
      "Content-Type must be multipart/form-data",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

  return new Promise((resolve, reject) => {
    const busboy = Busboy({ headers: req.headers });
    const uploadPromises: Promise<string>[] = [];
    const formData: any = {};

    busboy.on("field", (fieldname: string, value: string) => {
      // Handle form fields - parse arrays for certain fields
      if (
        [
          "interestCategories",
          "musicStyles",
          "atmosphereVibes",
          "eventTypes",
        ].includes(fieldname)
      ) {
        try {
          formData[fieldname] = JSON.parse(value);
        } catch {
          formData[fieldname] = value;
        }
      } else if (fieldname === "location") {
        try {
          formData[fieldname] = JSON.parse(value);
        } catch {
          formData[fieldname] = value;
        }
      } else {
        formData[fieldname] = value;
      }
    });

    busboy.on(
      "file",
      async (fieldname: string, fileStream: any, fileInfo: any) => {
        if (fieldname !== "photos") {
          fileStream.resume(); // Skip non-photo files
          return;
        }

        const { filename, mimeType } = fileInfo;

        // Validate file type
        if (!mimeType.startsWith("image/")) {
          fileStream.resume();
          return reject(
            errorResponseHandler(
              "Only image files are allowed",
              httpStatusCode.BAD_REQUEST,
              res
            )
          );
        }

        // Create a readable stream from the file stream
        const readableStream = new Readable();
        readableStream._read = () => {}; // Required implementation

        fileStream.on("data", (chunk: any) => {
          readableStream.push(chunk);
        });

        fileStream.on("end", () => {
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
      }
    );

    busboy.on("finish", async () => {
      try {
        // Wait for all file uploads to complete (if any)
        let uploadedPhotoKeys: string[] = [];
        if (uploadPromises.length > 0) {
          uploadedPhotoKeys = await Promise.all(uploadPromises);
        }

        // Create an object with only the allowed fields
        const allowedFields = [
          "userName",
          "gender",
          "about",
          "drinking",
          "smoke",
          "marijuana",
          "drugs",
          "work",
          "language",
          "interestCategories",
          "musicStyles",
          "atmosphereVibes",
          "eventTypes",
          "zodiacSign",
          "height",
          "location",
        ];

        const updateData: any = {};

        // Only copy allowed fields from formData
        allowedFields.forEach((field) => {
          if (formData[field] !== undefined) {
            updateData[field] = formData[field];
          }
        });

        // Handle photos - either use uploaded photos or existing photos from form
        if (uploadedPhotoKeys.length > 0) {
          // If new photos were uploaded, use them
          updateData.photos = uploadedPhotoKeys;
        } else if (formData.photos !== undefined) {
          // If no new photos but photos field exists in form, use existing photos
          updateData.photos = Array.isArray(formData.photos)
            ? formData.photos
            : [];
        }

        // Validate enum fields
        if (
          updateData.gender &&
          !Object.values(Gender).includes(updateData.gender)
        ) {
          return reject({
            success: false,
            message: "Invalid gender value",
            code: httpStatusCode.BAD_REQUEST,
          });
        }

        if (
          updateData.drinking &&
          !["Yes", "No", "prefer not to say"].includes(updateData.drinking)
        ) {
          return reject({
            success: false,
            message: "Invalid drinking value",
            code: httpStatusCode.BAD_REQUEST,
          });
        }

        if (
          updateData.smoke &&
          !["Yes", "No", "prefer not to say"].includes(updateData.smoke)
        ) {
          return reject({
            success: false,
            message: "Invalid smoke value",
            code: httpStatusCode.BAD_REQUEST,
          });
        }

        if (
          updateData.marijuana &&
          !["Yes", "No", "prefer not to say"].includes(updateData.marijuana)
        ) {
          return reject({
            success: false,
            message: "Invalid marijuana value",
            code: httpStatusCode.BAD_REQUEST,
          });
        }

        if (
          updateData.drugs &&
          !["Yes", "No", "prefer not to say"].includes(updateData.drugs)
        ) {
          return reject({
            success: false,
            message: "Invalid drugs value",
            code: httpStatusCode.BAD_REQUEST,
          });
        }

        // Validate interestCategories
        if (
          updateData.interestCategories &&
          Array.isArray(updateData.interestCategories)
        ) {
          for (const category of updateData.interestCategories) {
            if (!Object.values(InterestCategory).includes(category)) {
              return reject({
                success: false,
                message: `Invalid interest category: ${category}`,
                code: httpStatusCode.BAD_REQUEST,
              });
            }
          }
        }

        // Validate musicStyles
        if (updateData.musicStyles && Array.isArray(updateData.musicStyles)) {
          for (const style of updateData.musicStyles) {
            if (!Object.values(MusicStyle).includes(style)) {
              return reject({
                success: false,
                message: `Invalid music style: ${style}`,
                code: httpStatusCode.BAD_REQUEST,
              });
            }
          }
        }

        // Validate atmosphereVibes
        if (
          updateData.atmosphereVibes &&
          Array.isArray(updateData.atmosphereVibes)
        ) {
          for (const vibe of updateData.atmosphereVibes) {
            if (!Object.values(AtmosphereVibe).includes(vibe)) {
              return reject({
                success: false,
                message: `Invalid atmosphere vibe: ${vibe}`,
                code: httpStatusCode.BAD_REQUEST,
              });
            }
          }
        }

        // Validate eventTypes
        if (updateData.eventTypes && Array.isArray(updateData.eventTypes)) {
          for (const type of updateData.eventTypes) {
            if (!Object.values(EventType).includes(type)) {
              return reject({
                success: false,
                message: `Invalid event type: ${type}`,
                code: httpStatusCode.BAD_REQUEST,
              });
            }
          }
        }

        // Handle location update if provided
        if (formData.location) {
          if (!updateData.location) {
            // updateData.location = {
            //   type: "Point",
            //   coordinates: [0, 0],
            //   address: "",
            // };
          }

          if (formData.location.coordinates) {
            updateData.location.coordinates = formData.location.coordinates;
          }

          if (formData.location.address) {
            updateData.location.address = formData.location.address;
          }
        }

        // Validate username if provided
        if (updateData.userName) {
          const existingUserName = await usersModel.findOne({
            userName: updateData.userName,
            _id: { $ne: userId }, // Exclude current user
          });
          if (existingUserName) {
            return reject({
              success: false,
              message: "Username already taken",
              code: httpStatusCode.BAD_REQUEST,
            });
          }
        }

        // Validate height if provided
        if (updateData.height) {
          const heightNum = parseFloat(updateData.height);
          if (isNaN(heightNum) || heightNum <= 0 || heightNum > 300) {
            return reject({
              success: false,
              message: "Height must be a valid number between 0 and 300 cm",
              code: httpStatusCode.BAD_REQUEST,
            });
          }
          updateData.height = heightNum;
        }

        // Validate language if provided (accept single string or JSON array)
        if (updateData.language) {
          const validLanguages = [
            "English",
            "French",
            "German",
            "Spanish",
            "Italian",
            "Portuguese",
            "Dutch",
            "Danish",
            "Swedish",
            "Norwegian",
          ];

          let parsedLang: any = updateData.language;
          try {
            parsedLang = JSON.parse(updateData.language);
          } catch (e) {
            // keep as-is (string) if not valid JSON
            parsedLang = updateData.language;
          }

          const languagesToCheck = Array.isArray(parsedLang)
            ? parsedLang
            : [parsedLang];

          const invalid = languagesToCheck.find(
            (l: any) => typeof l !== "string" || !validLanguages.includes(l)
          );

          if (invalid) {
            return reject({
              success: false,
              message: `Invalid language. Supported languages: ${validLanguages.join(
                ", "
              )}`,
              code: httpStatusCode.BAD_REQUEST,
            });
          }

          // normalize to array for storage
          updateData.language = languagesToCheck;
        }

        const updatedUser = await usersModel.findByIdAndUpdate(
          userId,
          { $set: updateData },
          { new: true }
        );

        resolve({
          success: true,
          message: "User updated successfully",
          data: updatedUser,
        });
      } catch (error) {
        console.error("Upload or user update error:", error);
        reject(formatErrorResponse(res, error));
      }
    });

    busboy.on("error", (error: any) => {
      console.error("Busboy error:", error);
      reject(formatErrorResponse(res, error));
    });

    req.pipe(busboy);
  });
};

// Dashboard
export const getDashboardStatsService = async (req: any, res: Response) => {
  try {
    const { id: userId } = req.user;
    const { lat, long } = req.query;
    if (!lat && long) {
      return errorResponseHandler(
        "Latitude and Longitude are required",
        httpStatusCode.BAD_REQUEST,
        res
      );
    }
    const coordinates = [parseFloat(long), parseFloat(lat)];

    // Check if user has posted any content
    const hasUserPostedContent = await postModels.exists({ user: userId,isAutoPost: { $ne: true } });

    // === NEW: Get blocked users ===
    // Users who blocked the current user
    const blockedByUsers = await blockModel
      .find({ blockedUser: userId })
      .select("blockedBy");
    const blockedByIds = blockedByUsers.map((b) => b.blockedBy);

    // Users the current user blocked
    const blockedUsers = await blockModel
      .find({ blockedBy: userId })
      .select("blockedUser");
    const blockedIds = blockedUsers.map((b) => b.blockedUser);

    // Combine all blocked user IDs (both directions)
    const allBlockedIds = [...new Set([...blockedByIds, ...blockedIds])];

    // Get users the current user follows, excluding blocked users
    const following = await followModel
      .find({
        follower_id: userId,
        relationship_status: FollowRelationshipStatus.FOLLOWING,
        is_approved: true,
        following_id: { $nin: allBlockedIds }, // Exclude blocked users
      })
      .select("following_id");

    const followingIds = following.map((f) => f.following_id);

    // === NEW: Get all posts and events that user has liked ===
    const userLikedPosts = await LikeModel.find({
      user: userId,
      targetType: "posts",
    }).select("target");
    const likedPostIds = userLikedPosts.map((like) => like.target.toString());

    const userLikedEvents = await LikeModel.find({
      user: userId,
      targetType: "events",
    }).select("target");
    const likedEventIds = userLikedEvents.map((like) => like.target.toString());

    const userLikedRepost = await LikeModel.find({
      user: userId,
      targetType: "reposts",
    }).select("target");
    const likedRepostIds = userLikedRepost.map((like) =>
      like.target.toString()
    );

    // ===== STORIES SECTION =====
    // Get current user's own stories
    const userStoriesRaw = await storyModel
      .find({
        user: userId,
        expiresAt: { $gt: new Date() },
      })
      .sort({ createdAt: -1 })
      .populate("user", "userName photos")
      .populate("viewedBy", "userName photos");

    // Group user's own stories
    let userStories = null;
    if (userStoriesRaw.length > 0) {
      userStories = {
        user: userStoriesRaw[0].user,
        stories: userStoriesRaw,
      };
    }

    // Get stories from users the current user follows, excluding blocked users
    const followingStoriesRaw = await storyModel
      .find({
        user: { $in: followingIds },
        expiresAt: { $gt: new Date() },
      })
      .sort({ createdAt: -1 })
      .populate("user", "userName photos")
      .populate("viewedBy", "userName photos")
      .limit(10);

    // Group following stories by user
    const followingStoriesByUser: {
      [key: string]: { user: any; stories: any[] };
    } = {};
    followingStoriesRaw.forEach((story) => {
      const storyUserId = story.user._id.toString();

      if (!followingStoriesByUser[storyUserId]) {
        followingStoriesByUser[storyUserId] = {
          user: story.user,
          stories: [],
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

    // Get posts from followed users, excluding blocked users
    const followingPosts = await postModels
      .find({
        user: { $in: followingIds },
        _id: { $nin: likedPostIds },
      })
      .sort({ createdAt: -1 })
      .populate("user", "userName photos");

    // If we don't have enough posts from followed users, get public posts
    let publicPosts: any[] = [];
    if (followingPosts.length < limit) {
      const neededPublicPosts = limit - followingPosts.length;

      publicPosts = await postModels
        .find({
          user: { $nin: [...followingIds, userId, ...allBlockedIds] }, // Exclude followed users, self, and blocked users
          visibility: PostVisibility.PUBLIC,
          _id: { $nin: likedPostIds },
        })
        .sort({ createdAt: -1 })
        .limit(neededPublicPosts)
        .populate("user", "userName photos");
    }

    // Combine followed posts with public posts
    const allPosts = [...followingPosts, ...publicPosts];

    // Apply pagination to the combined posts
    const paginatedPosts = allPosts.slice(skip, skip + limit);

    // ===== REPOSTS SECTION =====
    // Get reposts from followed users, excluding blocked users
    const followingReposts = await RepostModel.find({
      user: { $in: followingIds },
      _id: { $nin: likedRepostIds },
    })
      .sort({ createdAt: -1 })
      .populate("user", "userName photos")
      .populate({
        path: "originalPost",
        populate: {
          path: "user",
          select: "userName photos",
        },
      });

    // === NEW: Filter out reposts where the original post's user is blocked ===
    const filteredReposts = followingReposts.filter((repost) => {
      let originalPostUserId: string | undefined;
      if (
        repost.originalPost &&
        typeof repost.originalPost === "object" &&
        "user" in repost.originalPost
      ) {
        // @ts-ignore
        originalPostUserId =
          (repost.originalPost as any).user?._id?.toString?.() ??
          (repost.originalPost as any).user?.toString?.();
      }
      return (
        !originalPostUserId ||
        !allBlockedIds.some((id) => id.toString() === originalPostUserId)
      );
    });

    // Apply pagination to filtered reposts
    const paginatedReposts = filteredReposts.slice(skip, skip + limit);

    // Get post IDs for engagement stats
    const postIds = paginatedPosts.map((post) => post._id);
    const repostIds = paginatedReposts.map((repost) => repost._id);
    const originalPostIds = paginatedReposts.map(
      (repost) => repost.originalPost._id
    );

    // Get likes for posts
    const postLikes = await LikeModel.find({
      targetType: "posts",
      target: { $in: postIds },
    });

    // Get likes for reposts
    const repostLikes = await LikeModel.find({
      targetType: "reposts",
      target: { $in: repostIds },
    });

    // Get likes for original posts in reposts
    const originalPostLikes = await LikeModel.find({
      targetType: "posts",
      target: { $in: originalPostIds },
    });

    // Get user's likes to determine which posts/reposts the user has already liked
    const userPostLikes = await LikeModel.find({
      user: userId,
      targetType: "posts",
      target: { $in: [...postIds, ...originalPostIds] },
    });

    const userRepostLikes = await LikeModel.find({
      user: userId,
      targetType: "reposts",
      target: { $in: repostIds },
    });

    // Get reposts created by current user for posts
    const userReposts = await RepostModel.find({
      user: userId,
      originalPost: { $in: [...postIds, ...originalPostIds] },
    }).select("originalPost");

    // Create sets of IDs that the user has liked for quick lookup
    const userLikedPostIds = new Set(
      userPostLikes.map((like) => like.target.toString())
    );
    const userLikedRepostIds = new Set(
      userRepostLikes.map((like) => like.target.toString())
    );

    // Create set of post IDs that user has reposted
    const userRepostedPostIds = new Set(
      userReposts.map((repost) => repost.originalPost.toString())
    );

    // Get comments for posts
    const postComments = await Comment.find({
      post: { $in: postIds },
      isDeleted: false,
    });

    // Get comments for reposts
    const repostComments = await Comment.find({
      repost: { $in: repostIds },
      isDeleted: false,
    });

    // Get comments for original posts in reposts
    const originalPostComments = await Comment.find({
      post: { $in: originalPostIds },
      isDeleted: false,
    });

    // Get reposts for posts
    const postsReposts = await RepostModel.find({
      originalPost: { $in: postIds },
    });

    // Get reposts for original posts in reposts
    const originalPostsReposts = await RepostModel.find({
      originalPost: { $in: originalPostIds },
    });

    // Create maps of engagement stats
    const postEngagementStats: {
      [key: string]: { likes: number; comments: number; reposts: number };
    } = {};
    postIds.forEach((postId) => {
      postEngagementStats[postId.toString()] = {
        likes: 0,
        comments: 0,
        reposts: 0,
      };
    });

    const repostEngagementStats: {
      [key: string]: { likes: number; comments: number };
    } = {};
    repostIds.forEach((repostId) => {
      repostEngagementStats[repostId.toString()] = {
        likes: 0,
        comments: 0,
      };
    });

    const originalPostEngagementStats: {
      [key: string]: { likes: number; comments: number; reposts: number };
    } = {};
    originalPostIds.forEach((postId) => {
      originalPostEngagementStats[postId.toString()] = {
        likes: 0,
        comments: 0,
        reposts: 0,
      };
    });

    // Fill in the post engagement stats
    postLikes.forEach((like) => {
      const postId = like.target.toString();
      if (postEngagementStats[postId]) {
        postEngagementStats[postId].likes += 1;
      }
    });

    postComments.forEach((comment) => {
      const postId = comment.post?.toString();
      if (postId && postEngagementStats[postId]) {
        postEngagementStats[postId].comments += 1;
      }
    });

    postsReposts.forEach((repost) => {
      const postId = repost.originalPost.toString();
      if (postEngagementStats[postId]) {
        postEngagementStats[postId].reposts += 1;
      }
    });

    // Fill in the repost engagement stats
    repostLikes.forEach((like) => {
      const repostId = like.target.toString();
      if (repostEngagementStats[repostId]) {
        repostEngagementStats[repostId].likes += 1;
      }
    });

    repostComments.forEach((comment) => {
      const repostId = comment.repost?.toString();
      if (repostId && repostEngagementStats[repostId]) {
        repostEngagementStats[repostId].comments += 1;
      }
    });

    // Fill in the original post engagement stats for reposts
    originalPostLikes.forEach((like) => {
      const postId = like.target.toString();
      if (originalPostEngagementStats[postId]) {
        originalPostEngagementStats[postId].likes += 1;
      }
    });

    originalPostComments.forEach((comment) => {
      const postId = comment.post?.toString();
      if (postId && originalPostEngagementStats[postId]) {
        originalPostEngagementStats[postId].comments += 1;
      }
    });

    originalPostsReposts.forEach((repost) => {
      const postId = repost.originalPost.toString();
      if (originalPostEngagementStats[postId]) {
        originalPostEngagementStats[postId].reposts += 1;
      }
    });

    // Enrich posts with engagement data
    const enrichedPosts = paginatedPosts.map((post) => {
      const postId = post._id.toString();
      const engagement = postEngagementStats[postId] || {
        likes: 0,
        comments: 0,
        reposts: 0,
      };

      // Convert ObjectId to string for proper comparison
      const postUserId = post.user._id.toString();

      // Check if this post's author is in the followingIds array
      const isFollowed = followingIds.some(
        (followingId) => followingId.toString() === postUserId
      );

      // Check if the current user has liked this post
      const isLikedByUser = userLikedPostIds.has(postId);

      // Check if the current user has reposted this post
      const isRepostedByUser = userRepostedPostIds.has(postId);

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
        isLikedByUser: isLikedByUser,
        isRepostedByUser: isRepostedByUser,
      };
    });

    // Enrich reposts with engagement data
    const enrichedReposts = paginatedReposts.map((repost) => {
      const repostId = repost._id.toString();
      const repostEngagement = repostEngagementStats[repostId] || {
        likes: 0,
        comments: 0,
      };

      const originalPostId = repost.originalPost._id.toString();
      const originalPostEngagement = originalPostEngagementStats[
        originalPostId
      ] || { likes: 0, comments: 0, reposts: 0 };

      // Convert ObjectId to string for proper comparison
      const repostUserId = repost.user._id.toString();

      // Check if this repost's author is in the followingIds array
      const isFollowed = followingIds.some(
        (followingId) => followingId.toString() === repostUserId
      );

      // Check if the current user has liked this repost
      const isLikedByUser = userLikedRepostIds.has(repostId);

      // Check if the current user has likedByUser
      const isOriginalPostLikedByUser = userLikedPostIds.has(originalPostId);

      return {
        _id: repost._id,
        type: repost.type,
        content: repost.content,
        createdAt: repost.createdAt,
        user: repost.user,
        originalPost: {
          ...(repost.originalPost &&
          typeof (repost.originalPost as any).toObject === "function"
            ? (repost.originalPost as any).toObject()
            : { _id: repost.originalPost }),
          likesCount: originalPostEngagementStats.length,
          commentsCount: originalPostEngagement.comments,
          repostsCount: originalPostEngagement.reposts,
          isLikedByUser: isOriginalPostLikedByUser,
        },
        likesCount: repostEngagementStats.likes,
        commentsCount: repostEngagement.comments,
        isFollowedByUser: isFollowed,
        isLikedByUser: isLikedByUser,
      };
    });

    // ===== EVENTS SECTION =====
    const userLocation = await usersModel.findById(userId).select("location");

    let nearbyEvents = [];
    if (userLocation?.location && "coordinates" in userLocation.location) {
      // Get nearby events (within 50km)
      nearbyEvents = await eventModel.aggregate([
        {
          $geoNear: {
            near: {
              type: "Point",
              coordinates: coordinates as [number, number],
            },
            distanceField: "distance",
            maxDistance: 50000, // 50km in meters
            spherical: true,
          },
        },
        {
          $match: {
            utcDateTime: { $gte: new Date() },
            user: { $nin: allBlockedIds }, // Exclude blocked users' events
          },
        },
        {
          $limit: 5,
        },
      ]);

      // Convert distance to kilometers
      nearbyEvents = nearbyEvents.map((event) => ({
        ...event,
        distanceInKm: Math.round((event.distance / 1000) * 10) / 10,
      }));
    }

    // ===== STATS SECTION =====
    // Get user match statistics
    const matchStats = {
      likesSent: await UserMatch.countDocuments({
        fromUser: userId,
        type: "like",
        subType: null,
      }),
      matches: await UserMatch.countDocuments({
        fromUser: userId,
        type: "like",
        isMatch: true,
      }),
    };

    // Get follow stats
    const followStats = {
      followers: await followModel.countDocuments({
        following_id: userId,
        relationship_status: FollowRelationshipStatus.FOLLOWING,
      }),
      following: following.length,
    };

    return {
      success: true,
      message: "Dashboard feed fetched successfully",
      data: {
        userActivity: {
          hasPosted: !!hasUserPostedContent,
        },
        stories: {
          userStories: userStories,
          followingStories: followingStories,
        },
        posts: enrichedPosts,
        reposts: enrichedReposts,
        suggestedEvents: nearbyEvents,
        stats: {
          matches: matchStats,
          follows: followStats,
        },
        pagination: {
          total: allPosts.length + filteredReposts.length,
          postsTotal: allPosts.length,
          repostsTotal: filteredReposts.length,
          page,
          limit,
          pages: Math.ceil((allPosts.length + filteredReposts.length) / limit),
          hasNext: page * limit < allPosts.length + filteredReposts.length,
          hasPrev: page > 1,
        },
      },
    };
  } catch (error) {
    console.error("Error in getDashboardStatsService:", error);
    throw error;
  }
};

export const verifyCurrentPasswordService = async (req: any, res: Response) => {
  const { id: userId } = req.user;
  const { password } = req.body;
  const user = await usersModel.findById(userId).select("+password");
  if (!user) {
    return errorResponseHandler(
      "User not found",
      httpStatusCode.NOT_FOUND,
      res
    );
  }

  if (!user.password) {
    return errorResponseHandler(
      "Password is not set for this user",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }
  const isPasswordValid = await bcrypt.compare(password, user.password);
  if (!isPasswordValid) {
    return errorResponseHandler(
      "Invalid password",
      httpStatusCode.UNAUTHORIZED,
      res
    );
  }

  return {
    success: true,
    message: "Password verified successfully",
  };
};

export const initiateEmailChangeService = async (req: any, res: Response) => {
  const { id: userId } = req.user;
  const { newEmail } = req.body;
  const user = await usersModel.findById(userId);
  if (!user) {
    return errorResponseHandler(
      "User not found",
      httpStatusCode.NOT_FOUND,
      res
    );
  }

  // Check if new email already exists
  const emailExists = await usersModel.findOne({
    email: newEmail.toLowerCase(),
  });
  if (emailExists) {
    return errorResponseHandler(
      "Email already in use",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

  // Store new email in session or temporary storage
  await usersModel.findByIdAndUpdate(userId, {
    tempEmail: newEmail.toLowerCase(),
  });

  // Generate and send OTP
  const passwordResetToken = await generatePasswordResetToken(newEmail);
  if (passwordResetToken) {
    await sendEmailVerificationCode(newEmail, passwordResetToken.token);
    return {
      success: true,
      message: "Verification code sent to new email",
    };
  }

  return errorResponseHandler(
    "Failed to send verification code",
    httpStatusCode.INTERNAL_SERVER_ERROR,
    res
  );
};

export const verifyAndChangeEmailService = async (req: any, res: Response) => {
  const { id: userId } = req.user;
  const { otp } = req.body;
  const user = await usersModel.findById(userId);
  if (!user) {
    return errorResponseHandler(
      "User not found",
      httpStatusCode.NOT_FOUND,
      res
    );
  }

  if (!user.tempEmail) {
    return errorResponseHandler(
      "No email change was initiated",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

  // Verify OTP
  const existingToken = await getPasswordResetTokenByToken(user.tempEmail, otp);
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
    data: { email: user.email },
  };
};

export const initiatePhoneChangeService = async (req: any, res: Response) => {
  const { id: userId } = req.user;
  const { newPhoneNumber } = req.body;
  const user = await usersModel.findById(userId);
  if (!user) {
    return errorResponseHandler(
      "User not found",
      httpStatusCode.NOT_FOUND,
      res
    );
  }

  // Check if phone number already exists
  const phoneExists = await usersModel.findOne({ phoneNumber: newPhoneNumber });
  if (phoneExists) {
    return errorResponseHandler(
      "Phone number already in use",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

  // Store new phone in session or temporary storage
  await usersModel.findByIdAndUpdate(userId, {
    tempPhoneNumber: newPhoneNumber,
  });

  // Generate and send OTP via SMS
  const passwordResetToken = await generatePasswordResetTokenByPhone(
    newPhoneNumber
  );
  if (passwordResetToken) {
    await generatePasswordResetTokenByPhoneWithTwilio(
      newPhoneNumber,
      passwordResetToken.token
    );
    return {
      success: true,
      message: "Verification code sent to new phone number",
    };
  }

  return errorResponseHandler(
    "Failed to send verification code",
    httpStatusCode.INTERNAL_SERVER_ERROR,
    res
  );
};

export const verifyAndChangePhoneService = async (req: any, res: Response) => {
  const { id: userId } = req.user;
  const { otp } = req.body;
  const user = await usersModel.findById(userId);
  if (!user) {
    return errorResponseHandler(
      "User not found",
      httpStatusCode.NOT_FOUND,
      res
    );
  }

  if (!user.tempPhoneNumber) {
    return errorResponseHandler(
      "No phone change was initiated",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

  // Verify OTP
  const existingToken = await passwordResetTokenModel.findOne({
    phoneNumber: user.tempPhoneNumber,
    token: otp,
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
    data: { phoneNumber: user.phoneNumber },
  };
};

export const notificationSettingService = async (req: any, res: Response) => {
  const { id: userId } = req.user;
  const { value, type } = req.body;

  // Validate input
  if (!userId) {
    return errorResponseHandler(
      "User ID is required",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

  if (type === undefined || value === undefined) {
    return errorResponseHandler(
      "Notification type and value are required",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

  // Find user by ID
  const user = await usersModel.findById(userId);
  if (!user) {
    return errorResponseHandler(
      "User not found",
      httpStatusCode.NOT_FOUND,
      res
    );
  }

  // Update the specified notification setting
  if (type === "pushNotification") {
    user.pushNotification = value;
  } else if (type === "newsLetterNotification") {
    user.newsLetterNotification = value;
  } else if (type === "eventsNotification") {
    user.eventsNotification = value;
  } else if (type === "chatNotification") {
    user.chatNotification = value;
  } else {
    return errorResponseHandler(
      "Invalid notification type",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

  // Save the updated user
  await user.save();

  // Return success response
  return {
    success: true,
    message: "Notification settings updated successfully",
    data: {
      [type]: value,
    },
  };
};
export const toggleTwoFactorAuthenticationService = async (
  req: any,
  res: Response
) => {
  const { id: userId } = req.user;
  const { enabled } = req.body;

  // Validate input
  if (!userId) {
    return errorResponseHandler(
      "User ID is required",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

  if (enabled === undefined) {
    return errorResponseHandler(
      "Two-factor authentication status is required",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

  if (typeof enabled !== "boolean") {
    return errorResponseHandler(
      "Two-factor authentication status must be a boolean",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

  // Find user by ID
  const user = await usersModel.findById(userId);
  if (!user) {
    return errorResponseHandler(
      "User not found",
      httpStatusCode.NOT_FOUND,
      res
    );
  }

  // Update the two-factor authentication setting
  user.twoFactorAuthentication = enabled;

  // Save the updated user
  await user.save();

  // Return success response
  return {
    success: true,
    message: `Two-factor authentication ${
      enabled ? "enabled" : "disabled"
    } successfully`,
    data: {
      twoFactorAuthentication: enabled,
    },
  };
};

export const getReferalCodeService = async (req: any, res: Response) => {
  const { id: userId } = req.user;
  const referralCodes = await ReferralCodeModel.find({ codeCreatedBy: userId })
    .populate("codeCreatedBy", "userName photos")
    .populate("referredUser", "userName photos");
  if (!referralCodes) {
    return errorResponseHandler(
      "Referral codes not found",
      httpStatusCode.NOT_FOUND,
      res
    );
  }
  return {
    success: true,
    message: "Referral codes retrieved successfully",
    data: referralCodes,
  };
};

export const changePasswordService = async (req: any, res: Response) => {
  const { id: userId } = req.user;
  const { currentPassword, newPassword } = req.body;

  // Validate input
  if (!currentPassword || !newPassword) {
    return errorResponseHandler(
      "Current password and new password are required",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

  if (currentPassword === newPassword) {
    return errorResponseHandler(
      "New password must be different from current password",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

  // Find user with password
  const user = await usersModel.findById(userId).select("+password");
  if (!user) {
    return errorResponseHandler(
      "User not found",
      httpStatusCode.NOT_FOUND,
      res
    );
  }

  // Verify current password
  if (!user.password) {
    return errorResponseHandler(
      "Password is not set for this user",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }
  const isPasswordValid = await bcrypt.compare(currentPassword, user.password);
  if (!isPasswordValid) {
    return errorResponseHandler(
      "Current password is incorrect",
      httpStatusCode.UNAUTHORIZED,
      res
    );
  }

  // Hash and update new password
  const hashedPassword = await bcrypt.hash(newPassword, 10);
  user.password = hashedPassword;

  // Save the updated user
  await user.save();

  return {
    success: true,
    message: "Password changed successfully",
  };
};

export const getAllFollowedUsersService = async (req: any, res: Response) => {
  const { id: userId } = req.user;
  if (!userId) {
    return errorResponseHandler(
      "User not found",
      httpStatusCode.NOT_FOUND,
      res
    );
  }
  // check for both user follow each other

  const following = await followModel
    .find({
      follower_id: userId,
      relationship_status: FollowRelationshipStatus.FOLLOWING,
      is_approved: true,
    })
    .populate("following_id", "userName photos dob");
  // if (!following) {
  //   return errorResponseHandler(
  //     "Users not found",
  //     httpStatusCode.NOT_FOUND,
  //     res
  //   );
  // }
  // const followingIds = following.map((f) => f.following_id);
  // const users = await usersModel
  //   .find({
  //     _id: { $in: followingIds },
  //   })
  //   .select("-password");
  // if (!users) {
  //   return errorResponseHandler(
  //     "Users not found",
  //     httpStatusCode.NOT_FOUND,
  //     res
  //   );
  // }
  return {
    success: true,
    message: "Following user retrieved successfully",
    data: following,
  };
};
export const getAllFollowersService = async (req: any, res: Response) => {
  const { id: userId } = req.user;

  if (!userId) {
    return errorResponseHandler(
      "User not found",
      httpStatusCode.NOT_FOUND,
      res
    );
  }

  // Get all followers of the current user
  const followers = await followModel
    .find({
      following_id: userId,
      relationship_status: FollowRelationshipStatus.FOLLOWING,
      is_approved: true,
    })
    .populate("follower_id", "userName photos dob");

  // Extract follower user IDs
  const followerUserIds = followers.map((f) => f.follower_id._id);

  // Find mutual follows (where current user also follows them)
  const mutuals = await followModel.find({
    follower_id: userId,
    following_id: { $in: followerUserIds },
    relationship_status: FollowRelationshipStatus.FOLLOWING,
    is_approved: true,
  });

  // Extract IDs of users that are mutually followed
  const mutualUserIds = mutuals.map((m) => m.following_id.toString());

  // Attach flag for mutual follows
  const result = followers.map((f: any) => ({
    ...f.toObject(),
    userAlsoFollow: mutualUserIds.includes(f.follower_id._id.toString()),
  }));

  return {
    success: true,
    message: "Followers retrieved successfully",
    data: result,
  };
};

export const togglePrivacyPreferenceService = async (
  req: any,
  res: Response
) => {
  const { id: userId } = req.user;
  const { accountType } = req.body;

  // Validate input
  if (!userId) {
    return errorResponseHandler(
      "User ID is required",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }
  if (
    !accountType ||
    !["public", "matches", "follower"].includes(accountType)
  ) {
    return errorResponseHandler(
      "Invalid or missing accountType. Must be one of: public, matches, follower",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

  // Update user's accountType
  const user = await usersModel
    .findByIdAndUpdate(userId, { accountType }, { new: true })
    .select("-password ");

  if (!user) {
    return errorResponseHandler(
      "User not found",
      httpStatusCode.NOT_FOUND,
      res
    );
  }

  return {
    success: true,
    message: "Privacy preference updated successfully",
    data: {
      accountType: user.accountType,
    },
  };
};

export const getUserNotificationPreferencesService = async (
  req: any,
  res: Response
) => {
  const { id: userId } = req.user;

  // Find user by ID and select only notification fields
  const user = await usersModel
    .findById(userId)
    .select(
      "pushNotification newsLetterNotification eventsNotification chatNotification"
    );

  if (!user) {
    return errorResponseHandler(
      "User not found",
      httpStatusCode.NOT_FOUND,
      res
    );
  }

  // Return notification preferences
  return {
    success: true,
    message: "Notification preferences retrieved successfully",
    data: {
      pushNotification: user?.pushNotification,
      newsLetterNotification: user?.newsLetterNotification,
      eventsNotification: user?.eventsNotification,
      chatNotification: user?.chatNotification,
    },
  };
};
export const getUserPrivacyPreferenceService = async (
  req: any,
  res: Response
) => {
  const { id: userId } = req.user;

  // Find user by ID and select only privacy fields
  const user = await usersModel.findById(userId).select("accountType");

  if (!user) {
    return errorResponseHandler(
      "User not found",
      httpStatusCode.NOT_FOUND,
      res
    );
  }

  // Return privacy preferences
  return {
    success: true,
    message: "Privacy preferences retrieved successfully",
    data: {
      accountType: user?.accountType,
    },
  };
};

export const getUserPostsService = async (req: any, res: Response) => {
  const { id: userId } = req.user;
  // get user posts and reposts
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 10;
  const skip = (page - 1) * limit;
  const posts = await postModels
    .find({ user: userId })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .populate("user", "userName photos")
    .populate({
      path: "taggedUsers",
      select: "userName photos",
    });
  const reposts = await RepostModel.find({ user: userId })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .populate("user", "userName photos")
    .populate({
      path: "originalPost",
      populate: {
        path: "user",
        select: "userName photos",
      },
    });
  return {
    success: true,
    message: "User posts retrieved successfully",
    data: {
      posts,
      reposts,
    },
  };
};

export const getUserInfoByTokenService = async (req: any, res: Response) => {
  const { id: userId } = req.user;
  if (!userId) {
    return errorResponseHandler(
      "User id is required",
      httpStatusCode.NOT_FOUND,
      res
    );
  }

  // Fetch user information
  const user = await usersModel
    .findById(userId)
    .select("-password -token -stripeCustomerId -tempEmail -tempPhoneNumber");
  if (!user) {
    return errorResponseHandler(
      "User not found",
      httpStatusCode.NOT_FOUND,
      res
    );
  }

  const [followerCount, followingCount, eventCount] = await Promise.all([
    followModel.countDocuments({
      following_id: userId,
      relationship_status: FollowRelationshipStatus.FOLLOWING,
      is_approved: true,
    }),
    followModel.countDocuments({
      follower_id: userId,
      relationship_status: FollowRelationshipStatus.FOLLOWING,
      is_approved: true,
    }),
    eventModel.countDocuments({
      creator: userId,
    }),
  ]);

  const newObject = {
    ...user.toObject(),
    followerCount,
    followingCount,
    eventCount,
  };

  return {
    success: true,
    message: "User information retrieved successfully",
    data: newObject,
  };
};

export const getConversationsByTypeService = async (
  req: any,
  res: Response
) => {
  const userId = req.user.id;
  const { type = "all" } = req.query; // Type can be: 'all', 'individual', 'squad', 'community'
  let individualConversations: any[] = [];
  let squadConversations: any[] = [];
  let communityConversations: any[] = [];

  // Fetch individual conversations
  if (type === "all" || type === "individual") {
    const conversations = await Conversation.find({
      participants: userId,
      isActive: true,
    })
      .populate({
        path: "participants",
        select: "userName photos",
      })
      .populate({
        path: "lastMessage",
        select: "text messageType createdAt sender readBy deletedFor",
      })
      .sort({ updatedAt: -1 });

    individualConversations = await Promise.all(
      conversations.map(async (conversation) => {
        const conversationObj = conversation.toObject() as any;

        // Filter out the current user from participants array
        conversationObj.participants = conversationObj.participants.filter(
          (participant: any) => participant._id.toString() !== userId.toString()
        );

        // Add user-specific pin status
        conversationObj.isPinned = conversation.isPinned?.get(userId) || false;

        // Add user-specific background settings
        conversationObj.backgroundSettings =
          conversation.backgroundSettings?.get(userId) || {
            backgroundImage: null,
            backgroundColor: null,
            staticBackgroundImage: null,
          };

        if (
          conversationObj.lastMessage &&
          Array.isArray(conversationObj.lastMessage.deletedFor) &&
          conversationObj.lastMessage.deletedFor.some(
            (id: any) => id.toString() === userId.toString()
          )
        ) {
          conversationObj.lastMessage = null; // Hide last message
        }

        // Count unread messages for current user in this conversation
        const unreadCount = await Message.countDocuments({
          conversation: conversation._id,
          sender: { $ne: userId },
          isDeleted: false,
          "readBy.user": { $ne: userId },
        });

        conversationObj.unreadCount = unreadCount;
        conversationObj.conversationType = "individual";

        return conversationObj;
      })
    );
  }

  // Fetch squad conversations
  if (type === "all" || type === "squad") {
    // Find all squads the user is a member of
    const userSquads = await Squad.find({
      "members.user": userId,
    }).select("_id conversation title media members");

    // Get the conversation IDs
    const squadConversationIds = userSquads
      .filter((squad) => squad.conversation)
      .map((squad) => squad.conversation);

    // Get the conversations with their last messages
    const squads = await SquadConversation.find({
      _id: { $in: squadConversationIds },
    })
      .populate({
        path: "lastMessage",
        populate: {
          path: "sender",
          select: "userName photos",
        },
      })
      .populate({
        path: "squad",
        select: "title media members",
        populate: {
          path: "members.user",
          select: "userName photos",
        },
      })
      .sort({ updatedAt: -1 });

    squadConversations = (squads as any).map((conversation: any) => {
      const conversationObj: any = conversation.toObject();
      conversationObj.isPinned = conversation.isPinned.get(userId) || false;
      conversationObj.backgroundSettings = conversation.backgroundSettings.get(
        userId
      ) || {
        backgroundImage: null,
        backgroundColor: null,
      };
      conversationObj.conversationType = "squad";
      return conversationObj;
    });
  }

  // Fetch community conversations
  if (type === "all" || type === "community") {
    // Find all communities the user is a member of
    const userCommunities = await Community.find({
      "members.user": userId,
    }).select("_id conversation name media members");

    // Get the conversation IDs
    const communityConversationIds = userCommunities
      .filter((community) => community.conversation)
      .map((community) => community.conversation);

    // Get the conversations with their last messages
    const communities = await CommunityConversation.find({
      _id: { $in: communityConversationIds },
    })
      .populate({
        path: "lastMessage",
        populate: {
          path: "sender",
          select: "userName photos",
        },
      })
      .populate({
        path: "community",
        select: "name media members",
        populate: {
          path: "members.user",
          select: "userName photos",
        },
      })
      .sort({ updatedAt: -1 });

    communityConversations = communities.map((conversation) => {
      const conversationObj: any = conversation.toObject();
      conversationObj.isPinned = conversation.isPinned?.get?.(userId) || false;
      conversationObj.backgroundSettings =
        conversation.backgroundSettings?.get?.(userId) || {
          backgroundImage: null,
          backgroundColor: null,
        };
      conversationObj.conversationType = "community";
      return conversationObj;
    });
  }

  // Combine all conversations if type is 'all'
  let allConversations: any[] = [];
  if (type === "all") {
    allConversations = [
      ...individualConversations,
      ...squadConversations,
      ...communityConversations,
    ];

    // Sort by updatedAt to show most recent conversations first
    allConversations.sort((a, b) => {
      const dateA = new Date(a.updatedAt || 0).getTime();
      const dateB = new Date(b.updatedAt || 0).getTime();
      return dateB - dateA;
    });
  }

  // Prepare response based on type
  const responseData =
    type === "all"
      ? {
          all: allConversations,
          individual: individualConversations,
          squad: squadConversations,
          community: communityConversations,
          counts: {
            total: allConversations.length,
            individual: individualConversations.length,
            squad: squadConversations.length,
            community: communityConversations.length,
          },
        }
      : type === "individual"
      ? individualConversations
      : type === "squad"
      ? squadConversations
      : communityConversations;

  return {
    success: true,
    message: `${
      type.charAt(0).toUpperCase() + type.slice(1)
    } conversations retrieved successfully`,
    data: responseData,
  };
};

export const getUnchattedFollowingsService = async (
  req: any,
  res: Response
) => {
  const userId = req.user.id;

  // 🟩 Step 1: Get all users that current user follows (and follow is approved + active)
  const followingUsers = await followModel
    .find({
      follower_id: userId,
      relationship_status: FollowRelationshipStatus.FOLLOWING,
    })
    .select("following_id");

  if (!followingUsers.length) {
    return {
      success: true,
      message: "No following users found.",
      data: [],
    };
  }

  const followingIds = followingUsers.map((f) => f.following_id);

  // 🟩 Step 2: Get users involved in an existing conversation
  const existingConversations = await Conversation.find({
    participants: userId,
    isActive: true,
  }).select("participants");

  const chattedUserIds = new Set<string>();
  existingConversations.forEach((conv) => {
    conv.participants.forEach((p) => {
      if (p.toString() !== userId.toString()) {
        chattedUserIds.add(p.toString());
      }
    });
  });

  // 🟩 Step 3: Get all blocked relationships (either direction)
  const blockedDocs = await blockModel
    .find({
      $or: [{ blockedBy: userId }, { blockedUser: userId }],
    })
    .select("blockedBy blockedUser");

  const blockedUserIds = new Set<string>();
  blockedDocs.forEach((block) => {
    blockedUserIds.add(block.blockedBy.toString());
    blockedUserIds.add(block.blockedUser.toString());
  });

  // 🟩 Step 4: Filter users - remove those who are chatted or blocked
  const filteredIds = followingIds.filter(
    (id) =>
      !chattedUserIds.has(id.toString()) && !blockedUserIds.has(id.toString())
  );

  if (!filteredIds.length) {
    return {
      success: true,
      message: "No available users to start chat with.",
      data: [],
    };
  }

  // 🟩 Step 5: Return user details (you can modify fields as needed)
  const users = await usersModel
    .find({ _id: { $in: filteredIds } })
    .select("_id userName photos");

  return {
    success: true,
    message: "Users available to start chat with.",
    data: users,
  };
};

export const getUserAllDataService = async (userId: any, res: Response) => {
  // === Fetch user-created data ===
  const [events, posts, reposts, likes] = await Promise.all([
    eventModel.find({ creator: userId }).populate("creator", "userName photos"),
    postModels.find({ user: userId }).populate("user", "userName photos"),
    RepostModel.find({ user: userId })
      .populate("user", "userName photos")
      .populate({
        path: "originalPost",
        populate: { path: "user", select: "userName photos" },
      }), // user’s own reposts
    LikeModel.find({ user: userId }),
  ]);

  const eventIds = events.map((e) => e._id);
  const postIds = posts.map((p) => p._id);
  const repostIds = reposts.map((r) => r._id);

  // === Extract liked IDs ===
  const likedEventIds = likes
    .filter((l) => l.targetType === "event")
    .map((l) => l.target);
  const likedPostIds = likes
    .filter((l) => l.targetType === "posts")
    .map((l) => l.target);
  const likedRepostIds = likes
    .filter((l) => l.targetType === "reposts")
    .map((l) => l.target);

  // === Count Aggregations ===
  const [likeCounts, commentCounts, repostCounts] = await Promise.all([
    LikeModel.aggregate([
      {
        $match: {
          target: {
            $in: [
              ...eventIds,
              ...postIds,
              ...repostIds,
              ...likedEventIds,
              ...likedPostIds,
              ...likedRepostIds,
            ],
          },
          targetType: { $in: ["event", "posts", "reposts"] },
        },
      },
      { $group: { _id: "$target", count: { $sum: 1 } } },
    ]),
    Comment.aggregate([
      {
        $match: {
          $or: [
            { event: { $in: [...eventIds, ...likedEventIds] } },
            { post: { $in: [...postIds, ...likedPostIds] } },
            { repost: { $in: [...repostIds, ...likedRepostIds] } },
          ],
          isDeleted: false,
        },
      },
      {
        $group: {
          _id: {
            $ifNull: ["$event", { $ifNull: ["$post", "$repost"] }],
          },
          count: { $sum: 1 },
        },
      },
    ]),
    RepostModel.aggregate([
      { $match: { post: { $in: [...postIds, ...likedPostIds] } } },
      { $group: { _id: "$post", count: { $sum: 1 } } },
    ]),
  ]);

  // === Helpers ===
  const getCount = (arr: any[], id: any) =>
    arr.find((x) => x._id?.toString() === id.toString())?.count || 0;

  const userLikedTargets = new Set(
    likes.map((l) => `${l.targetType}_${l.target.toString()}`)
  );

  // === Enrich Events ===
  const enrichedEvents = events.map((e) => ({
    ...e.toObject(),
    likeCount: getCount(likeCounts, e._id),
    commentCount: getCount(commentCounts, e._id),
    userHasLiked: userLikedTargets.has(`event_${e._id.toString()}`),
  }));

  // === Enrich Posts (user’s posts) ===
  const enrichedPosts = posts.map((p) => ({
    ...p.toObject(),
    likeCount: getCount(likeCounts, p._id),
    commentCount: getCount(commentCounts, p._id),
    repostCount: getCount(repostCounts, p._id),
    userHasLiked: userLikedTargets.has(`posts_${p._id.toString()}`),
  }));

  // === Enrich Reposts (user’s reposts) ===
  const enrichedReposts = reposts.map((r) => ({
    ...r.toObject(),
    likeCount: getCount(likeCounts, r._id),
    commentCount: getCount(commentCounts, r._id),
    userHasLiked: userLikedTargets.has(`reposts_${r._id.toString()}`),
  }));

  // === Fetch liked items ===
  const [likedEvents, likedPosts, likedReposts] = await Promise.all([
    eventModel
      .find({ _id: { $in: likedEventIds } })
      .populate("creator", "userName photos"),
    postModels.find({ _id: { $in: likedPostIds } }),
    RepostModel.find({ _id: { $in: likedRepostIds } }).populate({
      path: "originalPost",
      populate: { path: "user", select: "userName photos" },
    }),
  ]);

  // === Enrich liked data ===
  const likedData = [
    ...likedEvents.map((e) => ({
      ...e.toObject(),
      type: "event",
      likeCount: getCount(likeCounts, e._id),
      commentCount: getCount(commentCounts, e._id),
      userHasLiked: true,
    })),
    ...likedPosts.map((p) => ({
      ...p.toObject(),
      type: "post",
      likeCount: getCount(likeCounts, p._id),
      commentCount: getCount(commentCounts, p._id),
      repostCount: getCount(repostCounts, p._id),
      userHasLiked: true,
    })),
    ...likedReposts.map((r) => ({
      ...r.toObject(),
      type: "repost",
      likeCount: getCount(likeCounts, r._id),
      commentCount: getCount(commentCounts, r._id),
      userHasLiked: true,
    })),
  ];

  // === Final structured response ===
  return {
    success: true,
    message: "User all data retrieved",
    data: {
      events: enrichedEvents,
      posts: {
        post: enrichedPosts,
        repost: enrichedReposts,
      },
      likes: likedData,
    },
  };
};
export const editMessageService = async (req: any, res: Response) => {
  const userId = req.user.id;
  const { id } = req.params;
  const { text } = req.body;
  if (!id) {
    errorResponseHandler(
      "Message ID is required",
      httpStatusCode.NOT_FOUND,
      res
    );
  }
  if (!text || text.trim() === "") {
    return errorResponseHandler(
      "Message text cannot be empty",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

  const message: any = await Message.findById(id);
  if (!message) {
    errorResponseHandler("Message not Found", httpStatusCode.NOT_FOUND, res);
  }

  if (message.messageType !== "text") {
    return errorResponseHandler(
      "Only text message is editable",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }
  if (message?.sender.toString() !== userId) {
    errorResponseHandler(
      "You are unauthorized to edit message",
      httpStatusCode.UNAUTHORIZED,
      res
    );
  }
  // Update message text and editedAt timestamp
  message.text = text.trim();
  message.editedAt = new Date();

  await message.save();

  return {
    success: true,
    message: "message updated successfully",
    data: message,
  };
};
export const searchFeedService = async (req: any) => {
  const userId = req.user?.id;

  const {
    searchText,
    // maxDistance = 50000000,
    latitude,
    longitude,
    interests,
    musicStyles,
    eventTypes,
    atmosphereVibes,
    page = 1,
    limit = 20,
    type,
  } = req.body;

  if (!latitude || !longitude) {
    throw {
      code: 400,
      message: "Latitude & Longitude are required",
    };
  }

  const skip = (Number(page) - 1) * Number(limit);

  let users: any[] = [];
  let events: any[] = [];

  // ---------------------
  // GEO POINT
  // ---------------------
  const userLocation = {
    type: "Point",
    coordinates: [Number(longitude), Number(latitude)],
  };

  // ---------------------
  // SEARCH USERS
  // ---------------------
  if (type === "people" || !type) {
    const userFilters: any = {};

    if (searchText)
      userFilters.userName = { $regex: searchText, $options: "i" };
    if (interests)
      userFilters.interestCategories = { $in: interests.split(",") };
    if (musicStyles) userFilters.musicStyles = { $in: musicStyles.split(",") };
    if (atmosphereVibes)
      userFilters.atmosphereVibes = { $in: atmosphereVibes.split(",") };

    users = await usersModel.aggregate([
      {
        $geoNear: {
          near: userLocation,
          distanceField: "distanceInMeters",
          // maxDistance: Number(maxDistance),
          spherical: true,
          query: {
            _id: { $ne: userId },
            ...userFilters,
          },
        },
      },
      { $skip: skip },
      { $limit: Number(limit) },
      {
        $project: {
          userName: 1,
          photos: 1,
          interestCategories: 1,
          musicStyles: 1,
          atmosphereVibes: 1,
          distanceKm: { $divide: ["$distanceInMeters", 1000] },
        },
      },
    ]);
  }

  // ---------------------
  // SEARCH EVENTS
  // ---------------------
  if (type === "event" || !type) {
    const eventFilters: any = {
      utcDateTime: { $gte: new Date() },
    };

    if (searchText) eventFilters.title = { $regex: searchText, $options: "i" };

    if (eventTypes)
      eventFilters["eventPreferences.eventType"] = {
        $in: eventTypes.split(","),
      };

    if (musicStyles)
      eventFilters["eventPreferences.musicType"] = {
        $in: musicStyles.split(","),
      };

    events = await eventModel.aggregate([
      {
        $geoNear: {
          near: userLocation,
          distanceField: "distanceInMeters",
          spherical: true,
          query: eventFilters,
        },
      },

      // -------------------------------
      // 1️⃣ GET TICKETS FOR THE EVENT
      // -------------------------------
      {
        $lookup: {
          from: "tickets",
          localField: "_id",
          foreignField: "event",
          as: "tickets",
        },
      },

      // -------------------------------
      // 2️⃣ GET LIKE COUNT
      // -------------------------------
      {
        $lookup: {
          from: "likes",
          let: { eventId: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$target", "$$eventId"] },
                    { $eq: ["$targetType", "event"] },
                  ],
                },
              },
            },
          ],
          as: "likes",
        },
      },
      {
        $addFields: {
          likeCount: { $size: "$likes" },
        },
      },

      // -------------------------------
      // 3️⃣ GET COMMENT COUNT
      // -------------------------------
      {
        $lookup: {
          from: "comments",
          let: { eventId: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$event", "$$eventId"] },
                    { $eq: ["$isDeleted", false] },
                  ],
                },
              },
            },
          ],
          as: "eventComments",
        },
      },
      {
        $addFields: {
          commentCount: { $size: "$eventComments" },
        },
      },

      // -------------------------------
      // PAGINATION
      // -------------------------------
      { $skip: skip },
      { $limit: Number(limit) },

      // -------------------------------
      // FINAL PROJECTION
      // -------------------------------
      {
        $project: {
          title: 1,
          media: 1,
          date: 1,
          startTime: 1,
          location: 1,
          eventPreferences: 1,
          capacity: 1,
          timezone: 1,
          utcDateTime: 1,

          // distance in km
          distanceKm: { $divide: ["$distanceInMeters", 1000] },

          // new fields
          tickets: 1,
          likeCount: 1,
          commentCount: 1,
        },
      },
    ]);
  }

  return {
    success: true,
    message: "Search feed retrieved successfully",
    data: {
      users,
      events,
    },
  };
};

export const deleteUserService = async (req: any, res: Response) => {
  const { id: userId } = req.user;

  // Validate user exists
  const user = await usersModel.findById(userId);
  if (!user) {
    return errorResponseHandler(
      "User not found",
      httpStatusCode.NOT_FOUND,
      res
    );
  }

  // Check if user is already deleted
  if (user.status === "deleted") {
    return errorResponseHandler(
      "User account is already deleted",
      httpStatusCode.BAD_REQUEST,
      res
    );
  }

  // Update user status to "deleted" (soft delete)
  const deletedUser = await usersModel
    .findByIdAndUpdate(
      userId,
      {
        status: "deleted",
        token: null,
      },
      { new: true }
    )
    .select("-password -token");

  return {
    success: true,
    message: "User account deleted successfully",
    data: {
      userId: deletedUser?._id,
      status: deletedUser?.status,
      deletedAt: new Date(),
    },
  };
};
