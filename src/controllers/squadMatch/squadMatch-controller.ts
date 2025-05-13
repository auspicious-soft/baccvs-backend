import { Request, Response } from "express";
import { httpStatusCode } from "src/lib/constant";
import { errorParser } from "src/lib/errors/error-response-handler";
import { 
  userLikeSquadService, 
  userDislikeSquadService,
  approveSquadJoinRequestService,
  rejectSquadJoinRequestService,
  getSquadJoinRequestsService
} from "src/services/squadMatch/squadMatch-service";

/**
 * Like a squad (request to join)
 */
export const userLikeSquadController = async (req: Request, res: Response) => {
  try {
    const response = await userLikeSquadService(req, res);
     return res.status(httpStatusCode.OK).json(response);
  } catch (error) {
    const { code, message } = errorParser(error);
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};

/**
 * Dislike a squad
 */
export const userDislikeSquadController = async (req: Request, res: Response) => {
  try {
    const response = await userDislikeSquadService(req, res);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error) {
    const { code, message } = errorParser(error);
     return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};
