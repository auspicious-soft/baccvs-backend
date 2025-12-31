import { Request, Response } from "express";
import { httpStatusCode } from "src/lib/constant";
import { errorParser } from "src/lib/errors/error-response-handler";
import { adminSettings } from "src/services/admin/admin-service";

export const VerifyAdminPassword = async (req: Request, res: Response) => {
  try {
    if (!req.admin?.id) {
      throw new Error("Unauthorized");
    }
    const { password } = req.body;
    if (!password) throw new Error("Password is Required");
    const response = await adminSettings.verifyAdminPassword({
      adminId: req.admin.id,
      password,
    });
    return res.status(httpStatusCode.OK).json({ success: true, ...response });
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

export const SubmitChangeRequest = async (req: Request, res: Response) => {
  try {
    if (!req.admin?.id) {
      throw new Error("Unauthorized");
    }
    const { oldValue, newValue, type } = req.body;

    if (!type) {
      throw new Error("Type is Requried.");
    }

    if (!oldValue || !newValue) {
      throw new Error(
        `Old ${type.toLowerCase()} and new ${type.toLowerCase()} are required`
      );
    }

    if (oldValue === newValue)
      throw new Error(`New  ${type.toLowerCase()} cant be same as old one.`);
    const response = await adminSettings.submitChangeRequest({
      adminId: req.admin.id,
      oldValue,
      newValue,
      type,
    });
    return res.status(httpStatusCode.OK).json({ success: true, ...response });
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

export const ResendChangeOTP  = async (req: Request, res: Response) => {
  try {
    const adminId = req.admin?.id;
    const { newValue, type } = req.body;

    if (!adminId) {
      throw new Error("Unauthorized");
    }
    if (!type) {
      throw new Error("Type is Requried.");
    }

    if (!newValue) {
      throw new Error(`New ${type.toLowerCase()} is Required.`);
    }
    const response = await adminSettings.resendChangeOtp({
      adminId,
      newValue,
      type,
    });
    return res.status(httpStatusCode.OK).json({ success: true, ...response });
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

export const VerifyChangeOTP  = async (req: Request, res: Response) => {
  try {
    const adminId = req.admin?.id;
    const { newValue, otp, type } = req.body;
    if (!adminId) {
      throw new Error("Unauthorized");
    }
      if (!type) {
      throw new Error("Type is Requried.");
    }
    if (!newValue || !otp) {
      throw new Error(`New ${type.toLowerCase()} and otp both are Required.`);
    }
    const response = await adminSettings.verifyChangeOtp({
      adminId,
      newValue,
      otp,
      type,
    });
    return res.status(httpStatusCode.OK).json({ success: true, ...response });
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
