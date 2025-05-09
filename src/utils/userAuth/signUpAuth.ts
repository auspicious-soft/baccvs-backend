import { httpStatusCode } from "src/lib/constant";
import { errorResponseHandler } from "src/lib/errors/error-response-handler";
import {  usersModel } from "src/models/user/user-schema";
// import { generateAndSendOTP } from "src/services/user/user-service";
import { Response } from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { configDotenv } from "dotenv";
import { ReferralCodeModel } from "src/models/referalcode/referal-schema";
configDotenv();

export const generateUserToken = (user: any) => {
  const tokenPayload = {
    id: user._id,
    email: user.email || undefined,
    phoneNumber: user.phoneNumber || undefined,
  };

  return jwt.sign(tokenPayload, process.env.JWT_SECRET as string);
};

export const getSignUpQueryByAuthType = (userData: any, authType: string) => {
  if (["Email", "Google", "Apple", "Facebook","Twitter"].includes(authType)) {  
    return { email: userData.email?.toLowerCase() };
  }
  return {};
}

export const handleExistingUser = (existingUser: any, authType: string, res: Response) => {
  if (existingUser) {
    const message =`Email already registered, try logging in with ${existingUser?.authType}`;
    return errorResponseHandler(message, httpStatusCode.BAD_REQUEST, res);
  }
};

export const hashPasswordIfEmailAuth = async (userData: any, authType: string) => {
  if (authType === "Email") {
    if (!userData.password) {
      throw new Error("Password is required for Email authentication");
    }
    return await bcrypt.hash(userData.password, 10);
  }
  return userData.password;
};

// export const getReferralCodeCreator = async (userData: any,res: Response) => {
// console.log("referal userdata",userData);
//   if (!userData.referralCode) {
//     return errorResponseHandler("referral code is required", httpStatusCode.UNAUTHORIZED, res)
//     };

//   // Find the referral code document
//   const referralCodeDocument = await ReferralCodeModel.findOne({ code: userData.referralCode,used:false });
//   console.log('referralCodeDocument:', referralCodeDocument);
//   if (!referralCodeDocument) {
//    return errorResponseHandler("referal code is Invalid", httpStatusCode.BAD_REQUEST, res)
//   }
//   if (referralCodeDocument.used) {
//     return errorResponseHandler("referal code is already used", httpStatusCode.NOT_FOUND, res)
//   }
//     return referralCodeDocument?._id 
//     console.log('referralCodeDocument?._id:', referralCodeDocument?._id);
    
// };

export const getReferralCodeCreator = async (userData: any, res: Response) => {
  console.log("Referral userData:", userData);

  if (!userData.referralCode) {
    return errorResponseHandler("Referral code is required", httpStatusCode.UNAUTHORIZED, res);
  }

  // Find the referral code document
  const referralCodeDocument = await ReferralCodeModel.findOne({ code: userData.referralCode, used: false });
  console.log("Referral Code Document:", referralCodeDocument);

  if (!referralCodeDocument) {
    return errorResponseHandler("Referral code is invalid", httpStatusCode.BAD_REQUEST, res);
  }

  if (referralCodeDocument.used) {
    return errorResponseHandler("Referral code is already used", httpStatusCode.NOT_FOUND, res);
  }

  console.log("Referral Code Document ID:", referralCodeDocument._id);
  return referralCodeDocument._id;
};


export const createReferralCodeService = async (userId: any, res: Response) => {
    // Check if the user exists
    const user = await usersModel.findById(userId);
    if (!user) {
      return errorResponseHandler("User not found while creating referral", httpStatusCode.NOT_FOUND, res);
    }

    // Check if the user already has referral codes
    const existingCodesCount = await ReferralCodeModel.countDocuments({
      codeCreatedBy: userId,
    });

    // Calculate how many codes to create (up to 5 total)
    const codesToCreate = Math.max(0, 5 - existingCodesCount);
    
    if (codesToCreate <= 0) {
      return; // User already has 5 or more codes
    }

    // Create multiple referral codes
    const referralCodes = [];
    for (let i = 0; i < codesToCreate; i++) {
      referralCodes.push({
        codeCreatedBy: userId,
      });
    }

    // Bulk insert the codes
    const createdCodes = await ReferralCodeModel.insertMany(referralCodes);
    console.log(`Created ${createdCodes.length} referral codes for user:`, userId);

    return createdCodes;
};

// export const sendOTPIfNeeded = async (userData: UserDocument, authType: string) => {
//   if (["Email", "Whatsapp"].includes(authType)) {
//     await generateAndSendOTP(authType === "Email" ? { email: userData.email } : { phoneNumber: `${userData.countryCode}${userData.phoneNumber}` });
//   }
// };

export const validateUserForLogin = async (user: any, authType: string, userData: any, res: Response) => {
  if (authType !== user.authType) {
    return errorResponseHandler(`Wrong Login method!!, Try login from ${user.authType}`, httpStatusCode.BAD_REQUEST, res);
  }
  if (authType === "Email" && (!user.password || !userData.password)) {
    return errorResponseHandler("Password is required for Email login", httpStatusCode.BAD_REQUEST, res);
  }
  return null;
};


export const validatePassword = async (user: any, userPassword: string, res: Response) => {
  if (!user.password) {
    return errorResponseHandler("User password is missing", httpStatusCode.BAD_REQUEST, res);
  }
  const isPasswordValid = await bcrypt.compare(user.password, userPassword);
  if (!isPasswordValid) {
    return errorResponseHandler("Invalid login credential", httpStatusCode.BAD_REQUEST, res);
  }
  return null;
};
