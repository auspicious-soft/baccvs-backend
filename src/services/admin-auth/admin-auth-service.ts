import { AdminModel } from "src/models/admin/admin-schema";
import { OtpModel } from "src/models/system/otp-schema";
import {
  generateAndSendOtp,
  hashPassword,
  verifyPassword,
} from "src/utils/admin-utils/helper";
import jwt from "jsonwebtoken";

export const adminAuth = {
  async Register(payload: any) {
    const {
      firstName,
      lastName,
      email,
      password,
      phoneNumber,
      image,
      fullName,
    } = payload;

    if (!firstName || !lastName || !email || !password || !phoneNumber) {
      throw new Error(
        "FirstName, LastName, Email, password, phoneNumber all fields are requried to register a admin"
      );
    }

    const existingEmail = await AdminModel.findOne({ email });
    if (existingEmail) {
      throw new Error("Email already registered");
    }
    const existingPhone = await AdminModel.findOne({ phoneNumber });
    if (existingPhone) {
      throw new Error("Phone number already registered");
    }

    payload.password = await hashPassword(payload.password);
    const adminData = await AdminModel.create(payload);
    const admin = adminData.toObject();
    delete admin.password;

    return { ...admin };
  },
  async Login(payload: any) {
    const { email, password } = payload;

    const checkExist = await AdminModel.findOne({
      email: email,
      authType: "EMAIL",
      isBlocked: false,
      isDeleted: false,
    }).lean();

    if (!checkExist) {
      throw new Error("Admin Not Found");
    }
    const passwordStatus = await verifyPassword(
      password,
      checkExist?.password || ""
    );
    if (!passwordStatus) {
      throw new Error("invalid Password");
    }
    delete checkExist.password;
    return { ...checkExist };
  },

  async ForgetPassword(payload: any) {
    const { email } = payload;

    if (!email) throw new Error("Email is Required");

    const checkExist = await AdminModel.findOne({
      email: payload.email,
      authType: "EMAIL",
      isDeleted: false,
      isBlocked: false,
    });

    if (!checkExist) {
      throw new Error("Admin not Found");
    }

    const OTP = await generateAndSendOtp(
      payload.email,
      "FORGOT_PASSWORD",
      "EMAIL",
      "ADMIN"
    );
    return { OTP };
  },
  async verifyForgetPasswordOTP(payload: any) {
    const checkOtp = await OtpModel.findOne({
      $or: [{ email: payload.method }, { phone: payload.method }],
      code: payload.code,
     purpose: { $in: ["FORGOT_PASSWORD", "RESEND"] },
      userType: payload.userType,
    });
    if (!checkOtp) {
      throw new Error("Invalid Otp or wrong email.");
    }
    const tokenPayload = checkOtp.toObject();
    const token = jwt.sign(tokenPayload, process.env.AUTH_SECRET as string, {
      expiresIn: "5m",
    });

    return { token };
  },

  async resendOtp(payload: any) {
    if (payload.userType == "ADMIN") {
      const isEmail = payload.value.includes("@");

      let query: any = {
        isDeleted: false,
        isBlocked: false,
      };

      if (isEmail) {
        query.email = payload.value;
      } else {
        const phoneNumber = Number(payload.value);
        if (isNaN(phoneNumber)) {
          throw new Error("Invalid phone number format");
        }
        query.phoneNumber = phoneNumber;
      }

      const checkExist = await AdminModel.findOne(query);

      if (!checkExist) {
        throw new Error("Register Again, Admin Not found.");
      }
    }

    const OTP = await generateAndSendOtp(
      payload.value,
      payload.purpose,
      "EMAIL",
      payload.userType
    );

     const checkOtp = await OtpModel.findOne({
      $or: [{ email: payload.value }, { phone: payload.value }],
       purpose: "FORGOT_PASSWORD",
      userType: payload.userType,
    });
    if(checkOtp){
      await OtpModel.deleteOne({
      $or: [{ email: payload.value }, { phone: payload.value }],
       purpose: "FORGOT_PASSWORD",
      userType: payload.userType,
    });
    }
    return { OTP };
  },

  async resetPassword(payload: any) {
  let data: any;
  try {
    data = jwt.verify(
      payload.token,
      process.env.AUTH_SECRET as string
    ) as any;
  } catch (error) {
    throw new Error("Invalid or expired token");
  }
  
  if (!data.email && !data.phone) {
    throw new Error("Missing Required Fields");
  }
  
  if (data.purpose !== "FORGOT_PASSWORD") {
    throw new Error("Invalid token purpose");
  }
   const hashedPassword = await hashPassword(payload.password);
  
  const query: any = {};
  if (data.email) {
    query.email = data.email;
  } else if (data.phone) {
    query.phoneNumber = data.phone;
  }
  
  const updated = await AdminModel.updateOne(
    { 
      ...query,
      isDeleted: false,
      isBlocked: false 
    },
    { $set: { password: hashedPassword } }
  );
  
  if (updated.matchedCount === 0) {
    throw new Error("Admin not found");
  }
  
  await OtpModel.deleteOne({
    $or: [{ email: data.email }, { phone: data.phone }],
    code: data.code,
    purpose: "FORGOT_PASSWORD",
    userType: "ADMIN",
  });
  
  return {
    success: true,
    message: "Password reset successfully"
  };
  },
};
