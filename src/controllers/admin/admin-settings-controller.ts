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
