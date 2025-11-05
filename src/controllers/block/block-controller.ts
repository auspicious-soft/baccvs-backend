import { Request, Response } from "express";
import { httpStatusCode } from "src/lib/constant";
import { errorParser } from "src/lib/errors/error-response-handler";
import { 
  blockUserService, 
  unblockUserService, 
  getBlockedUsersService 
} from "src/services/block/block-service";

export const blockUser = async (req: Request, res: Response) => {
  try {
    const response = await blockUserService(req, res);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error) {
    const { code, message } = errorParser(error);
    return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ 
      success: false, 
      message: message || "An error occurred" 
    });
  }
};

export const unblockUser = async (req: Request, res: Response) => {
  try {
    const response = await unblockUserService(req, res);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error) {
    const { code, message } = errorParser(error);
    return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ 
      success: false, 
      message: message || "An error occurred" 
    });
  }
};
export const getBlockedUsers = async (req: Request, res: Response) => {
  try {
    const response = await getBlockedUsersService(req, res);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error) {
    const { code, message } = errorParser(error);
    return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ 
      success: false, 
      message: message || "An error occurred" 
    });
  }
};