import { Request, Response } from "express";
import { httpStatusCode } from "src/lib/constant";
import { errorParser } from "src/lib/errors/error-response-handler";
import { UserServices } from "src/services/admin/admin-service";

export const GetAllUsers = async (req: Request, res: Response) => {
  try {
    const adminId = req.admin?.id;
    if (!adminId) throw new Error("Unauthorized");

    const { status, page, limit, search } = req.query;

    const response = await UserServices.getAllUsers({
      status: status ?? "",
      page: page ?? 1,
      limit: limit ?? 10,
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

    return res.status(httpStatusCode.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Something went wrong",
    });
  }
};

export const updateUsersBanStatus = async (req: Request, res: Response) => {
  try {
    const admin = req.admin;
    const { userIds, isBanned } = req.body;

    if (!admin) throw new Error("Unauthorized");

    if (!Array.isArray(userIds) || userIds.length === 0) {
      throw new Error("userIds must be a non-empty array");
    }

    if (typeof isBanned !== "boolean") {
      throw new Error("isBanned must be boolean");
    }

    const response = await UserServices.updateUsersBanStatus({
      admin,
      userIds,
      isBanned,
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

    return res.status(httpStatusCode.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Something went wrong",
    });
  }
};
