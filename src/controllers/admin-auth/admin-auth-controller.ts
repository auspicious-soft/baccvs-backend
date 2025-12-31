import { Request, Response } from "express";
import { httpStatusCode } from "src/lib/constant";
import { errorParser } from "src/lib/errors/error-response-handler";
import { admin } from "src/routes";
import { adminAuth } from "src/services/admin-auth/admin-auth-service";
import { generateToken } from "src/utils/admin-utils/helper";

export const RegisterAdmin = async (req: Request, res: Response) => {
  try {
    const {
      firstName,
      lastName,
      email,
      password,
      phoneNumber,
      image,
      confirmPassword,
    } = req.body;

    if (
      !firstName ||
      !lastName ||
      !email ||
      !password ||
      !confirmPassword ||
      !phoneNumber
    ) {
      throw new Error(
        "FirstName, LastName, Email, password, phoneNumber all fields are requried to register a admin"
      );
    }

    if (password !== confirmPassword) {
      throw new Error("noPasswordMatch");
    }

    const admin = await adminAuth.Register({
      firstName,
      lastName,
      email,
      password,
      phoneNumber,
      image: image || "",
      fullName: `${firstName} ${lastName}`,
    });
    return res.status(httpStatusCode.CREATED).json(admin);
  } catch (err: any) {
    if (err.message) {
      return res
        .status(httpStatusCode.BAD_REQUEST)
        .json({ success: false, message: err.message });
    }
    const { code, message } = errorParser(err);
    return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: message || "An error occurred",
    });
  }
};

export const LoginAdmin = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      throw new Error("Email and Password are required to Login");
    }

    const response = await adminAuth.Login({
      email,
      password,
      authType: "EMAIL",
    });

    const token = await generateToken(response);
    return res.status(httpStatusCode.OK).json({ ...response, token });
  } catch (err: any) {
    if (err.message) {
      return res
        .status(httpStatusCode.BAD_REQUEST)
        .json({ success: false, message: err.message });
    }
    const { code, message } = errorParser(err);
    return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: message || "An error occurred",
    });
  }
};

export const ForgetPassword = async (req: Request, res: Response) => {
  try {
    const { email } = req.body;

    if (!email) {
      throw new Error("Email is required");
    }

    const response = await adminAuth.ForgetPassword({
      email,
    });
    return res.status(httpStatusCode.OK).json(response);
  } catch (err: any) {
    if (err.message) {
      return res
        .status(httpStatusCode.BAD_REQUEST)
        .json({ success: false, message: err.message });
    }
    const { code, message } = errorParser(err);
    return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: message || "An error occurred",
    });
  }
};


export const VerifyResetPasswordOtp = async(req:Request, res:Response) =>{
    try {
        const { code, method } = req.body;
    if (!method) {
      throw new Error("Email Required");
    }
    const response = await adminAuth.verifyForgetPasswordOTP({
      code,
      method,
      userType: "ADMIN",
    });
     return res.status(httpStatusCode.OK).json(response);
  } catch (err: any) {
    if (err.message) {
      return res
        .status(httpStatusCode.BAD_REQUEST)
        .json({ success: false, message: err.message });
    }
    const { code, message } = errorParser(err);
    return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: message || "An error occurred",
    });
  }
};

export const ResendOtp = async (req: Request, res: Response) => {
  try {
    const { value } = req.body;
    if (!value) {
      throw new Error("Method required is required");
    }
    const response = await adminAuth.resendOtp({
      purpose:"RESEND",
      value,
      userType: "ADMIN",
    });
    return res.status(httpStatusCode.OK).json(response);
  } catch (err: any) {
    if (err.message) {
      return res
        .status(httpStatusCode.BAD_REQUEST)
        .json({ success: false, message: err.message });
    }
    const { code, message } = errorParser(err);
    return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: message || "An error occurred",
    });
  }
};

export const ResetPassword = async (req:Request, res:Response) => {
 try {
    const { password, token } = req.body;
    if (!password) {
      throw new Error("Pasword is Required");
    }
    if (!token) {
      throw new Error("unauthorized");
    }
    const response = await adminAuth.resetPassword({
      password,
      token,
    });
      return res.status(httpStatusCode.OK).json(response);
  } catch (err: any) {
    if (err.message) {
      return res
        .status(httpStatusCode.BAD_REQUEST)
        .json({ success: false, message: err.message });
    }
    const { code, message } = errorParser(err);
    return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: message || "An error occurred",
    });
  }
};

