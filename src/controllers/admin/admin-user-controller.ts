import { Request, Response } from "express";
import { httpStatusCode } from "src/lib/constant";
import { errorParser } from "src/lib/errors/error-response-handler";
import { adminEventAndTicketingServices, adminReferalServices, UserServices } from "src/services/admin/admin-service";

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

export const deleteMultipleUsers = async (req: Request, res: Response) => {
  try {
    const admin = req.admin;
    const { userIds } = req.body;

    if (!admin) throw new Error("Unauthorized");

    if (!Array.isArray(userIds) || userIds.length === 0) {
      throw new Error("userIds must be a non-empty array");
    }

    const response = await UserServices.deleteMultipleUsers({
      admin,
      userIds,
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


export const getSingleUserDetails = async (req: Request, res: Response) => {
  try {
    const admin = req.admin;
    const { userId } = req.query;

    if (!admin) {
      throw new Error("Unauthorized");
    }

    if (!userId) {
      throw new Error("User ID is required");
    }

    const response = await UserServices.getSingleUserDetails({
      admin,
      userId,
    });

    return res.status(200).json({
      success: true,
      data: response,
    });
  } catch (error: any) {
    return res.status(400).json({
      success: false,
      message: error.message || "Something went wrong",
    });
  }
};
export const getEventStats = async (req: Request, res: Response) => {
  try {
    const admin = req.admin;
    const { startDate,endDate,revenueFilter,search,eventFilter, } = req.query;

    if (!admin) {
      throw new Error("Unauthorized");
    }


    const response = await adminEventAndTicketingServices.getEventStats({
      admin,
      startDate,
      endDate,
      revenueFilter,
      search,
      eventFilter,
    });

    return res.status(200).json({
      success: true,
      data: response,
    });
  } catch (error: any) {
    return res.status(400).json({
      success: false,
      message: error.message || "Something went wrong",
    });
  }
};
export const getEventByIdAdmin = async (req: Request, res: Response) => {
  try {
    const admin = req.admin;
    const { eventId } = req.params;
    const {  revenueFilter, startDate, endDate } = req.query;

    if (!admin) {
      throw new Error("Unauthorized");
    }


    const response = await adminEventAndTicketingServices.getEventById({
      admin,
      eventId,
      startDate,
      endDate,
      revenueFilter,
    });

    return res.status(200).json({
      success: true,
      data: response,
    });
  } catch (error: any) {
    return res.status(400).json({
      success: false,
      message: error.message || "Something went wrong",
    });
  }
};
export const refundEventAdmin = async (req: Request, res: Response) => {
  try {
    const admin = req.admin;
    const { eventId,reason } = req.body;

    if (!admin) {
      throw new Error("Unauthorized");
    }


    const response = await adminEventAndTicketingServices.refundAllEventPurchases({
      admin,
      eventId,
      reason
    });

    return res.status(200).json({
      success: true,
      data: response,
    });
  } catch (error: any) {
    return res.status(400).json({
      success: false,
      message: error.message || "Something went wrong",
    });
  }
};
export const deleteEventById = async (req: Request, res: Response) => {
  try {
    const admin = req.admin;
    const { eventId } = req.params;

    if (!admin) {
      throw new Error("Unauthorized");
    }


    const response = await adminEventAndTicketingServices.deleteEventById(
      eventId
    );

    return res.status(200).json({
      success: true,
      data: response,
    });
  } catch (error: any) {
    return res.status(400).json({
      success: false,
      message: error.message || "Something went wrong",
    });
  }
};
export const getReferalStats = async (req: Request, res: Response) => {
  try {
    const admin = req.admin;
    if (!admin) {
      throw new Error("Unauthorized");
    }


    const response = await adminReferalServices.getReferalStats(
      req.query
    );

    return res.status(200).json({
      success: true,
      data: response,
    });
  } catch (error: any) {
    return res.status(400).json({
      success: false,
      message: error.message || "Something went wrong",
    });
  }
};