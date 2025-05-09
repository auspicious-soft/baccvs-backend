// import { adminModel } from "../../models/admin/admin-schema";
// import bcrypt from "bcryptjs";
// import { Response } from "express";
// import { errorResponseHandler } from "../../lib/errors/error-response-handler";
// import { httpStatusCode } from "../../lib/constant";
// import { queryBuilder } from "../../utils";
// import { sendPasswordResetEmail } from "src/utils/mails/mail";
// import { generatePasswordResetToken, getPasswordResetTokenByToken, generatePasswordResetTokenByPhone } from "src/utils/mails/token";
// import { generatePasswordResetTokenByPhoneWithTwilio } from "../../utils/sms/sms"
// import { passwordResetTokenModel } from "src/models/password-token-schema";
// import { usersModel } from "src/models/user/user-schema";

// export const loginService = async (payload: any, res: Response) => {
//     const { username, password } = payload;
//     const countryCode = "+45"; 
//     const toNumber = Number(username);
//     const isEmail = isNaN(toNumber); 
//     let user: any = null;

//     if (isEmail) {

//         user = await adminModel.findOne({ email: username }).select('+password');
//         if (!user) {
//             user = await usersModel.findOne({ email: username }).select('+password');
//         }
//     } else {

//         const formattedPhoneNumber = `${countryCode}${username}`;
//         user = await adminModel.findOne({ phoneNumber: formattedPhoneNumber }).select('+password');
//         if (!user) {
//             user = await usersModel.findOne({ phoneNumber: formattedPhoneNumber }).select('+password');
//         }
//     }

//     if (!user) return errorResponseHandler('User not found', httpStatusCode.NOT_FOUND, res);
//     const isPasswordValid = await bcrypt.compare(password, user.password);
//     if (!isPasswordValid) {
//         return errorResponseHandler('Invalid password', httpStatusCode.UNAUTHORIZED, res);
//     }
//     const userObject = user.toObject();
//     delete userObject.password;

//     return {
//         success: true,
//         message: "Login successful",
//         data: {
//             user: userObject,
//         },
//     };
// };


// export const forgotPasswordService = async (payload: any, res: Response) => {
//     const { username } = payload;
//     const countryCode = "+45";
//     const toNumber = Number(username);
//     const isEmail = isNaN(toNumber);
//     let user: any = null;
//     if (isEmail) {
   
//         user = await adminModel.findOne({ email: username }).select('+password');
//         if (!user) {
//             user = await usersModel.findOne({ email: username }).select('+password');
//         }
//         if (!user) return errorResponseHandler('User not found', httpStatusCode.NOT_FOUND, res);
     
//         const passwordResetToken = await generatePasswordResetToken(username);
//         if (passwordResetToken) {
//             await sendPasswordResetEmail(username, passwordResetToken.token);
//             return { success: true, message: "Password reset email sent with OTP" };
//         }
//     } else {
//         const formattedPhoneNumber = `${countryCode}${username}`;
//         user = await adminModel.findOne({ phoneNumber: formattedPhoneNumber }).select('+password');
//         if (!user) {
//             user = await usersModel.findOne({ phoneNumber: formattedPhoneNumber }).select('+password');
//         }
//         if (!user) return errorResponseHandler('User not found', httpStatusCode.NOT_FOUND, res);
       
//         const passwordResetTokenBySms = await generatePasswordResetTokenByPhone(formattedPhoneNumber);
//         if (passwordResetTokenBySms) {
//             await generatePasswordResetTokenByPhoneWithTwilio(formattedPhoneNumber, passwordResetTokenBySms.token);
//             return { success: true, message: "Password reset SMS sent with OTP" };
//         }
//     }

//     return errorResponseHandler('Failed to generate password reset token', httpStatusCode.INTERNAL_SERVER_ERROR, res);
// };


// export const newPassswordAfterOTPVerifiedService = async (payload: { password: string, otp: string }, res: Response) => {
//     // console.log('payload: ', payload);
//     const { password, otp } = payload

//     const existingToken = await getPasswordResetTokenByToken(otp)
//     if (!existingToken) return errorResponseHandler("Invalid OTP", httpStatusCode.BAD_REQUEST, res)

//     const hasExpired = new Date(existingToken.expires) < new Date()
//     if (hasExpired) return errorResponseHandler("OTP expired", httpStatusCode.BAD_REQUEST, res)

//         let existingAdmin:any;

//         if (existingToken.email) {
//           existingAdmin = await adminModel.findOne({ email: existingToken.email });
//         } 
//         else if (existingToken.phoneNumber) {
//           existingAdmin = await adminModel.findOne({ phoneNumber: existingToken.phoneNumber });
//         }

//     const hashedPassword = await bcrypt.hash(password, 10)
//     const response = await adminModel.findByIdAndUpdate(existingAdmin._id, { password: hashedPassword }, { new: true });
//     await passwordResetTokenModel.findByIdAndDelete(existingToken._id);

//     return {
//         success: true,
//         message: "Password updated successfully",
//         data: response
//     }
// }


// export const getAllUsersService = async (payload: any) => {
//     const page = parseInt(payload.page as string) || 1
//     const limit = parseInt(payload.limit as string) || 0
//     const offset = (page - 1) * limit
//     const { query, sort } = queryBuilder(payload, ['fullName'])
//     const totalDataCount = Object.keys(query).length < 1 ? await usersModel.countDocuments() : await usersModel.countDocuments(query)
//     const results = await usersModel.find(query).sort(sort).skip(offset).limit(limit).select("-__v")
//     if (results.length) return {
//         page,
//         limit,
//         success: true,
//         total: totalDataCount,
//         data: results
//     }
//     else {
//         return {
//             data: [],
//             page,
//             limit,
//             success: false,
//             total: 0
//         }
//     }
// }

// export const getAUserService = async (id: string, res: Response) => {
// //   const user = await usersModel.findById(id);
// //   if (!user) return errorResponseHandler("User not found", httpStatusCode.NOT_FOUND, res);

// //   const userProjects = await projectsModel.find({ userId: id }).select("-__v");

// //   return {
// //       success: true,
// //       message: "User retrieved successfully",
// //       data: {
// //           user,
// //           projects: userProjects.length > 0 ? userProjects : [],
// //       }
// //   };
// }


// export const updateAUserService = async (id: string, payload: any, res: Response) => {
//     const user = await usersModel.findById(id);
//     if (!user) return errorResponseHandler("User not found", httpStatusCode.NOT_FOUND, res);
//     const countryCode = "+45";
//     payload.phoneNumber = `${countryCode}${payload.phoneNumber}`;
//     const updateduser = await usersModel.findByIdAndUpdate(id,{ ...payload },{ new: true});

//     return {
//         success: true,
//         message: "User updated successfully",
//         data: updateduser,
//     };

// };


// export const deleteAUserService = async (id: string, res: Response) => {
//     // const user = await usersModel.findById(id);
//     // if (!user) return errorResponseHandler("User not found", httpStatusCode.NOT_FOUND, res);

//     // // Delete user projects ----
//     // const userProjects = await projectsModel.deleteMany({ userId: id })

//     // // Delete user ----
//     // await usersModel.findByIdAndDelete(id)

//     // return {
//     //     success: true,
//     //     message: "User deleted successfully",
//     //     data: {
//     //         user,
//     //         projects: userProjects
//     //     }
//     // }
// }


// // Dashboard
// export const getDashboardStatsService = async (payload: any, res: Response) => {
   
//     // const ongoingProjectCount = await projectsModel.countDocuments({status: { $ne: "1" } })
//     // const completedProjectCount = await projectsModel.countDocuments({status: "1" })
//     // const workingProjectDetails = await projectsModel.find({status: { $ne: "1" } }).select("projectName projectimageLink projectstartDate projectendDate status"); // Adjust the fields as needed

//     // const sevenDaysAgo = new Date(new Date().setDate(new Date().getDate() - 7)) 
//     // const recentProjectDetails = await projectsModel.find({createdAt: { $gte: sevenDaysAgo } }).select("projectName projectimageLink projectstartDate projectendDate"); // Adjust the fields as needed
 
//     // const response = {
//     //     success: true,
//     //     message: "Dashboard stats fetched successfully",
//     //     data: {
//     //       ongoingProjectCount,
//     //       completedProjectCount,
//     //       workingProjectDetails,
//     //       recentProjectDetails,
//     //     }
//     // }

//     // return response
// }
