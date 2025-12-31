import { IAdmin } from "src/models/admin/admin-schema";
import { TokenModel } from "src/models/system/token-schema";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { OtpModel } from "src/models/system/otp-schema";
import React from "react";
import { Resend } from "resend";
import SignupVerification from "./templates/signup-veriication";
import ForgotPasswordVerification from "./templates/forget-password-verification";
import { configDotenv } from "dotenv";


configDotenv();
const resend = new Resend(process.env.RESEND_API_KEY);

const otpPurpose = ["SIGNUP", "FORGOT_PASSWORD","RESEND", "VERIFY_PHONE","VERIFY_EMAIL"];

export async function hashPassword(password: string) {
  return await bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hashPassword: string) {
  return await bcrypt.compare(password, hashPassword);
} 

export async function generateToken(admin: IAdmin) {
  const tokenPayload = {
    id: admin._id,
    email: admin.email || null,
    fullName: `${admin.firstName} ${admin.lastName}`,
    image: admin.image,
    authType: admin.authType,
  };

  const token = jwt.sign(tokenPayload, process.env.AUTH_SECRET as string, {
    expiresIn: "60d",
  });

  const expiresAt = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);

  await TokenModel.deleteMany({ adminId: admin._id });
  await TokenModel.create({
    token,
    adminId: admin._id,
    expiresAt,
  });

  return token;
}


export async function generateAndSendOtp(
  value: string,
  purpose: string,
  type: string,
  userType: string
) {
  const otp = Math.floor(1000 + Math.random() * 9000).toString();

  if (!otpPurpose.includes(purpose) || !["EMAIL", "PHONE"].includes(type)) {
    throw new Error("Invalid Otp Purpose Or Otp Type");
  }

  const checkExist = await OtpModel.findOne({
    email: type === "EMAIL" ? value : null,
    phone: type === "EMAIL" ? null : value,
    type,
    purpose,
    userType,
  });

  if (checkExist) {
    await OtpModel.findByIdAndDelete(checkExist._id);
  }

  await OtpModel.create({
    email: type === "EMAIL" ? value : null,
    phone: type === "EMAIL" ? null : value,
    type,
    purpose,
    code: otp,
    userType,
  });

  if (type === "EMAIL") {
    const emailTemplate =
      purpose === "SIGNUP"
        ? React.createElement(SignupVerification, { otp })
        : React.createElement(ForgotPasswordVerification, { otp });

    const subject =
      purpose === "SIGNUP"
        ? "Email Verification"
        : "Reset Password";

    await resend.emails.send({
      from: process.env.COMPANY_RESEND_GMAIL_ACCOUNT as string,
      to: value,
      subject,
      react: emailTemplate,
    });

    console.log(`📧 OTP Email sent to ${value}: ${otp}`);
  } else {
    console.log(`📱 OTP sent to phone ${value}: ${otp}`);
  }

  return otp;
}