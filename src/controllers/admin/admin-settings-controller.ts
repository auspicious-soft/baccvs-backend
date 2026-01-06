import { Request, Response } from "express";
import { httpStatusCode } from "src/lib/constant";
import { errorParser } from "src/lib/errors/error-response-handler";
import { admin } from "src/routes";
import { adminSettings, StaffServices } from "src/services/admin/admin-service";

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

export const ResendChangeOTP = async (req: Request, res: Response) => {
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

export const VerifyChangeOTP = async (req: Request, res: Response) => {
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

export const RequestPasswordReset = async (req: Request, res: Response) => {
  try {
    const adminId = req.admin?.id;
    const { email } = req.body;
    if (!adminId) {
      throw new Error("Unauthorized");
    }
    if (!email) throw new Error("Email is Required");
    const response = await adminSettings.requestPasswordReset({
      adminId,
      email,
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

export const ResetPasswordLink = async (req: Request, res: Response) => {
  try {
    const { token, password, confirmPassword } = req.body;

    if (!token || !password || !confirmPassword) {
      throw new Error("All fields are required");
    }

    const response = await adminSettings.resetPassword({
      token,
      password,
      confirmPassword,
    });

    return res.status(httpStatusCode.OK).json({
      success: true,
      ...response,
    });
  } catch (err: any) {
    return res.status(httpStatusCode.BAD_REQUEST).json({
      success: false,
      message: err.message || "Password reset failed",
    });
  }
};

export const updateAdminData = async (req: Request, res: Response) => {
  try {
    const adminId = req.admin?.id;
    if (!adminId) {
      throw new Error("Unauthorized");
    }
    const response = await adminSettings.updateAdminData({
      adminId,
      ...req.body,
    });

    return res.status(httpStatusCode.OK).json({
      success: true,
      ...response,
    });
  } catch (err: any) {
    if (err.message) {
      return res.status(httpStatusCode.BAD_REQUEST).json({
        success: false,
        message: err.message,
      });
    }

    const { code, message } = errorParser(err);
    return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: message || "Something went wrong",
    });
  }
};

export const inviteStaff = async (req: Request, res: Response) => {
  try {
    const adminId = req.admin?.id;
    const adminName = req.admin?.fullName;
    if (!adminId) throw new Error("Unauthorized");

    const { email, roleAccess, firstName, lastName } = req.body;

    if (!email) throw new Error("Email is required");
    if (!firstName) throw new Error("First Name is required");
    if (!Array.isArray(roleAccess) || !roleAccess.length)
      throw new Error("roleAccess is required");

    const response = await StaffServices.inviteStaff({
      adminId,
      adminName,
      lastName: lastName ? lastName : "",
      firstName,
      email,
      roleAccess,
    });
    return res.status(httpStatusCode.OK).json({
      success: true,
      ...response,
    });
  } catch (err: any) {
    if (err.message) {
      return res.status(httpStatusCode.BAD_REQUEST).json({
        success: false,
        message: err.message,
      });
    }
    const { code, message } = errorParser(err);
    return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: message || "Something went wrong",
    });
  }
};

export const AcceptInvitation = async (req: Request, res: Response) => {
  try {
    const { token, password, confirmPassword } = req.body;
    if (!token) throw new Error("Token is Required");
    if (!password || !confirmPassword)
      throw new Error("Both Password and Confirm Password is Requried");
    if (password !== confirmPassword) throw new Error("Passwords do not match");

    const response = await StaffServices.acceptInvitation({
      token,
      password,
    });
    return res.status(httpStatusCode.OK).json({
      success: true,
      ...response,
    });
  } catch (err: any) {
    if (err.message) {
      return res.status(httpStatusCode.BAD_REQUEST).json({
        success: false,
        message: err.message,
      });
    }
    const { code, message } = errorParser(err);
    return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: message || "Something went wrong",
    });
  }
};

export const GetAllStaffMembers = async (req: Request, res: Response) => {
  try {
    const adminId = req.admin?.id;
    if (!adminId) throw new Error("Unauthorized");

    const { status, page, limit, access, search } = req.query;

    const response = await StaffServices.getAllStaffMembers({
      status: status ?? "",
      page: page ?? 1,
      limit: limit ?? 10,
      access: access ?? "",
      search: search ?? "",
    });
    return res.status(httpStatusCode.OK).json({
      success: true,
      ...response,
    });
  } catch (err: any) {
    if (err.message) {
      return res.status(httpStatusCode.BAD_REQUEST).json({
        success: false,
        message: err.message,
      });
    }
    const { code, message } = errorParser(err);
    return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: message || "Something went wrong",
    });
  }
};

export const GetSingleStaffMember = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const adminId = req.admin?.id;

    if (!adminId) throw new Error("Unauthorized");

    if (!id) throw new Error("Id is required");
    const response = await StaffServices.getSingleStaffMember({
      id,
      adminId,
    });
    return res.status(httpStatusCode.OK).json({
      success: true,
      data: response,
    });
  } catch (err: any) {
    if (err.message) {
      return res.status(httpStatusCode.BAD_REQUEST).json({
        success: false,
        message: err.message,
      });
    }
    const { code, message } = errorParser(err);
    return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: message || "Something went wrong",
    });
  }
};

export const updateStaffMemberData = async (req: Request, res: Response) => {
  try {
    const adminId = req.admin?.id; // who is updating
    const { staffId, roleAccess } = req.body;

    if (!adminId) {
      throw new Error("Unauthorized");
    }

    if (!staffId) {
      throw new Error("Staff ID is required");
    }

    if (!Array.isArray(roleAccess) || roleAccess.length === 0) {
      throw new Error("roleAccess must be a non-empty array");
    }

    const response = await StaffServices.updateStaffRoleAccess({
      adminId,
      staffId,
      roleAccess,
    });
    return res.status(httpStatusCode.OK).json({
      success: true,
      ...response,
    });
  } catch (err: any) {
    if (err.message) {
      return res.status(httpStatusCode.BAD_REQUEST).json({
        success: false,
        message: err.message,
      });
    }
    const { code, message } = errorParser(err);
    return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: message || "Something went wrong",
    });
  }
};

export const removeUnRemoveStaff = async (req: Request, res: Response) => {
  try {
    const adminId = req.admin?.id;
    const { staffId } = req.body;

    if (!adminId) {
      throw new Error("Unauthorized");
    }

    if (!staffId) {
      throw new Error("Staff ID is required");
    }
    const response = await StaffServices.removeUnRemoveStaff({
      adminId,
      staffId,
    });
    return res.status(httpStatusCode.OK).json({
      success: true,
      ...response,
    });
  } catch (err: any) {
    if (err.message) {
      return res.status(httpStatusCode.BAD_REQUEST).json({
        success: false,
        message: err.message,
      });
    }
    const { code, message } = errorParser(err);
    return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: message || "Something went wrong",
    });
  }
};
