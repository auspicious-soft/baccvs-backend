import { Request, Response } from "express"
import { httpStatusCode } from "../../lib/constant"
import { errorParser } from "../../lib/errors/error-response-handler"
import { passswordResetSchema, verifyOtpSchema, verifyPasswordSchema } from "../../validation/client-user"
import { formatZodErrors } from "../../validation/format-zod-errors"
import { signUpService, forgotPasswordService, newPassswordAfterOTPVerifiedService, passwordResetService, getDashboardStatsService, getUserInfoService, getUserInfoByEmailService, editUserInfoService, verifyOtpPasswordResetService, verifyEmailService, verifyOtpEmailService, loginUserService, verifyCurrentPasswordService, resetPasswordWithTokenService, notificationSettingService, toggleTwoFactorAuthenticationService, getReferalCodeService, changePasswordService, getAllFollowedUsersService, togglePrivacyPreferenceService, getUserNotificationPreferencesService, getUserPrivacyPreferenceService, getUserPostsService, getUserInfoByTokenService, getFollowListService} from "../../uploads/user/user"
import { validateReferralCodeService } from "../referal/referal"
import { changeEmailSchema, changePhoneSchema } from "../../validation/client-user"
import { initiateEmailChangeService, verifyAndChangeEmailService, initiatePhoneChangeService, verifyAndChangePhoneService } from "../../uploads/user/user"
import { generateMultipleSignedUrls } from "src/configF/s3"
import { upload, uploadMultipleFilesToS3 } from "src/configF/multer";
import { get } from "http"

// Middleware for handling file uploads
export const uploadUserPhotos = upload.array('photos', 5); // Allow up to 5 photos

export const validateReferralCode = async (req: Request, res: Response) => {
    try {
        const response = await validateReferralCodeService(req, res)
        return res.status(httpStatusCode.OK).json(response)
    } catch (error) {
        const { code, message } = errorParser(error)
        return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message || "An error occurred" })
    }
  };

export const signup = async (req: Request, res: Response) => {
    try {
        const userData = req.body;
        const response: any = await signUpService(req,userData, userData.authType, res);
        return res.status(httpStatusCode.CREATED).json(response);
    }
    catch (error: any) {
        const { code, message } = errorParser(error);
        return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ 
            success: false, 
            message: message || "An error occurred" 
        });
    }
}

export const login = async (req: Request, res: Response) => {
 try {
        const response = await loginUserService(req.body, req.body.authType, res)
        return res.status(httpStatusCode.OK).json(response)
    }
    catch (error: any) {
        const { code, message } = errorParser(error)
        return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message || "An error occurred" })
    }
}

export const verifyEmail = async (req: Request, res: Response) => {
    try {
        const response = await verifyEmailService(req.body, res)
        return res.status(httpStatusCode.OK).json(response)
    }
    catch (error: any) {
        const { code, message } = errorParser(error)
        return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message || "An error occurred" })
    }
}

export const verifyingEmailOtp = async (req: Request, res: Response) => {
    try {
        const response = await verifyOtpEmailService(req.body, res)
        return res.status(httpStatusCode.OK).json(response)
    }
    catch (error: any) {
        const { code, message } = errorParser(error)
        return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message || "An error occurred" })
    }
}

export const forgotPassword = async (req: Request, res: Response) => {
   try {
        const response = await forgotPasswordService(req.body, res)
        return res.status(httpStatusCode.OK).json(response)
    }
    catch (error: any) {
        const { code, message } = errorParser(error)
        return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message || "An error occurred" })
    }
}

export const verifyOtpPasswordReset = async (req: Request, res: Response) => {
    const { otp,email } = req.body
    
    try {
        const response = await verifyOtpPasswordResetService(otp,email, res)
        return res.status(httpStatusCode.OK).json(response)
    }
    catch (error: any) {
        const { code, message } = errorParser(error)
        return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message || "An error occurred" })
    }
}

export const newPassswordAfterOTPVerified = async (req: Request, res: Response) => {
    try {
        const response = await newPassswordAfterOTPVerifiedService(req.body, res)
        return res.status(httpStatusCode.OK).json(response)
    }
    catch (error: any) {
        const { code, message } = errorParser(error)
        return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message || "An error occurred" });
    }
}

export const passwordReset = async (req: Request, res: Response) => {
    const validation = passswordResetSchema.safeParse(req.body)
    if (!validation.success) return res.status(httpStatusCode.BAD_REQUEST).json({ success: false, message: formatZodErrors(validation.error) })
    try {
        const response = await passwordResetService(req, res)
        return res.status(httpStatusCode.OK).json(response)
    } catch (error: any) {
        const { code, message } = errorParser(error)
        return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message || "An error occurred" });
    }
}


export const getUserInfo = async (req: Request, res: Response) => {
    try {
        const response = await getUserInfoService(req, res)
        return res.status(httpStatusCode.OK).json(response)
    } catch (error: any) {
        const { code, message } = errorParser(error)
        return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message || "An error occurred" });
    }
}

export const getUserInfoByEmail = async (req: Request, res: Response) => {
    try {
        const response = await getUserInfoByEmailService(req.params.email, res)
        return res.status(httpStatusCode.OK).json(response)
    } catch (error: any) {
        const { code, message } = errorParser(error)
        return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message || "An error occurred" });
    }
}

export const editUserInfo = async (req: Request, res: Response) => {
    try {
        const response = await editUserInfoService( req, res);
        return res.status(httpStatusCode.OK).json(response)
    } catch (error: any) {
        const { code, message } = errorParser(error)
        return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message || "An error occurred" });
    }
}

// Dashboard
export const getDashboardStats = async (req: Request, res: Response) => {
    try {
        const response = await getDashboardStatsService(req, res)
        return res.status(httpStatusCode.OK).json(response)
    } catch (error: any) {
        const { code, message } = errorParser(error)
        return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message || "An error occurred" });
    }
}

// First screen - Verify password
export const verifyCurrentPassword = async (req: Request, res: Response) => {
    try {
        const response = await verifyCurrentPasswordService( req, res);
        return res.status(httpStatusCode.OK).json(response);
    } catch (error: any) {
        const { code, message } = errorParser(error);
        return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
            .json({ success: false, message: message || "An error occurred" });
    }
};

// Second screen - Submit new email
export const submitNewEmail = async (req: Request, res: Response) => {
    const validation = changeEmailSchema.safeParse(req.body);
    if (!validation.success) {
        return res.status(httpStatusCode.BAD_REQUEST)
            .json({ success: false, message: formatZodErrors(validation.error) });
    }

    try {
        const response = await initiateEmailChangeService(req, res);
        return res.status(httpStatusCode.OK).json(response);
    } catch (error: any) {
        const { code, message } = errorParser(error);
        return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
            .json({ success: false, message: message || "An error occurred" });
    }
};

// Second screen - Submit new phone
export const submitNewPhone = async (req: Request, res: Response) => {
    const validation = changePhoneSchema.safeParse(req.body);
    if (!validation.success) {
        return res.status(httpStatusCode.BAD_REQUEST)
            .json({ success: false, message: formatZodErrors(validation.error) });
    }

    try {
        const response = await initiatePhoneChangeService(req, res);
        return res.status(httpStatusCode.OK).json(response);
    } catch (error: any) {
        const { code, message } = errorParser(error);
        return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
            .json({ success: false, message: message || "An error occurred" });
    }
};

// Third screen - Verify and complete email change
export const verifyAndCompleteEmailChange = async (req: Request, res: Response) => {
    const validation = verifyOtpSchema.safeParse(req.body);
    if (!validation.success) {
        return res.status(httpStatusCode.BAD_REQUEST)
            .json({ success: false, message: formatZodErrors(validation.error) });
    }

    try {
        const response = await verifyAndChangeEmailService(req, res);
        return res.status(httpStatusCode.OK).json(response);
    } catch (error: any) {
        const { code, message } = errorParser(error);
        return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
            .json({ success: false, message: message || "An error occurred" });
    }
};

// Third screen - Verify and complete phone change
export const verifyAndCompletePhoneChange = async (req: Request, res: Response) => {
    const validation = verifyOtpSchema.safeParse(req.body);
    if (!validation.success) {
        return res.status(httpStatusCode.BAD_REQUEST)
            .json({ success: false, message: formatZodErrors(validation.error) });
    }

    try {
        const response = await verifyAndChangePhoneService(req, res);
        return res.status(httpStatusCode.OK).json(response);
    } catch (error: any) {
        const { code, message } = errorParser(error);
        return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
            .json({ success: false, message: message || "An error occurred" });
    }
};

export const resetPasswordWithToken = async (req: Request, res: Response) => {
    try {
        const response = await resetPasswordWithTokenService(req, res);
        return res.status(httpStatusCode.OK).json(response);
    } catch (error: any) {
        const { code, message } = errorParser(error);
        return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
            .json({ success: false, message: message || "An error occurred" });
    }
}
export const notificationSetting = async (req: Request, res: Response) => {
    try {
        const response = await notificationSettingService(req, res);
        return res.status(httpStatusCode.OK).json(response);
    } catch (error: any) {
        const { code, message } = errorParser(error);
        return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
            .json({ success: false, message: message || "An error occurred" });
    }
}
export const toggleTwoFactorAuthentication = async (req: Request, res: Response) => {
    try {
        const response = await toggleTwoFactorAuthenticationService(req, res);
        return res.status(httpStatusCode.OK).json(response);
    } catch (error: any) {
        const { code, message } = errorParser(error);
        return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
            .json({ success: false, message: message || "An error occurred" });
    }
}
export const getReferalCode = async (req: Request, res: Response) => {
    try {
        const response = await getReferalCodeService(req, res);
        return res.status(httpStatusCode.OK).json(response);
    } catch (error: any) {
        const { code, message } = errorParser(error);
        return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
            .json({ success: false, message: message || "An error occurred" });
    }
}

export const changePassword = async (req: Request, res: Response) => {
  try {
    const response = await changePasswordService(req, res);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
}

export const getSignedUrlsForSignup = async (req: Request, res: Response) => {
    try {
        const { files, email } = req.body;
        
        if (!files || !Array.isArray(files) || !email) {
            return res.status(httpStatusCode.BAD_REQUEST).json({
                success: false,
                message: "Files array and email are required"
            });
        }
        
        const signedUrls = await generateMultipleSignedUrls(files, email);
        
        return res.status(httpStatusCode.OK).json({
            success: true,
            message: "Signed URLs generated successfully",
            data: signedUrls
        });
    } catch (error: any) {
        const { code, message } = errorParser(error);
        return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: message || "An error occurred generating signed URLs"
        });
    }
}

export const getAllFollowedUsers = async (req: Request, res: Response) => {
    try {
        const response = await getAllFollowedUsersService(req, res);
        return res.status(httpStatusCode.OK).json(response);
    } catch (error: any) {
        const { code, message } = errorParser(error);
        return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: message || "An error occurred fetching users"
        });
    }
}
export const togglePrivacyPreference = async (req: Request, res: Response) => {
    try {
        const response = await togglePrivacyPreferenceService(req, res);
        return res.status(httpStatusCode.OK).json(response);
    } catch (error: any) {
        const { code, message } = errorParser(error);
        return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: message || "An error occurred toggling privacy preference"
        });
    }
}

export const getUserNotificationPreferences = async (req: Request, res: Response) => {
    try {
        const response = await getUserNotificationPreferencesService(req, res);
        return res.status(httpStatusCode.OK).json(response);
    } catch (error: any) {
        const { code, message } = errorParser(error);
        return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: message || "An error occurred fetching notification preferences"
        });
    }
}
export const getUserPrivacyPreference = async (req: Request, res: Response) => {
    try {
        const response = await getUserPrivacyPreferenceService(req, res);
        return res.status(httpStatusCode.OK).json(response);
    } catch (error: any) {
        const { code, message } = errorParser(error);
        return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: message || "An error occurred fetching privacy preferences"
        });
    }
}
export const getUserPosts = async(req:Request, res: Response) => {
    try {
        const response = await getUserPostsService(req, res);
        return res.status(httpStatusCode.OK).json(response);
    } catch (error: any) {
        const { code, message } = errorParser(error);
        return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: message || "An error occurred fetching user posts"
        });
    }
}
export const getUserInfoByToken = async(req:Request,res:Response)=>{
    try {
        const response = await getUserInfoByTokenService(req,res)
        return res.status(httpStatusCode.OK).json(response)
    } catch (error:any) {
        const {code,message} = errorParser(error)
        return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: message || "An error occurred fetching user info"
        });
    }
}

export const getFollowList = async (req:Request,res:Response)=>{
    try {
        const response = await getFollowListService(req,res)
        return res.status(httpStatusCode.OK).json(response)
    } catch (error) {
        const {code,message} = errorParser(error)
        return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({
            success:false,
            message:message || "An error occurred fetching follow list"
        })
    }
}