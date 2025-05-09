import { Request, Response } from "express";
import { httpStatusCode } from "src/lib/constant";
import { errorParser } from "src/lib/errors/error-response-handler";
import { userLikeService, userDislikeService, getUserMatchesService, getUserFeedService, getUserMatchStatsService } from "src/services/userMatch/userMatch-service";

/**
 * Controller for handling user likes (regular, superlike, boost)
 */
export const userLikeController = async (req: Request, res: Response) => {
  try {
    const response = await userLikeService(req, res);
    return res.status(httpStatusCode.CREATED).json(response);
  } catch (error) {
    const { code, message } = errorParser(error);
           return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
               .json({ success: false, message: message || "An error occurred" });
       }
};

/**
 * Controller for handling user dislikes
 */
export const userDislikeController = async (req: Request, res: Response) => {
  try {
    const response = await userDislikeService(req, res);
    return res.status(httpStatusCode.CREATED).json(response);
  } catch (error) {
    const { code, message } = errorParser(error);
           return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
               .json({ success: false, message: message || "An error occurred" });
       } 
};

/**
 * Controller to get user's matches
 */
export const getUserMatchesController = async (req: Request, res: Response) => {
  try {
    const response = await getUserMatchesService(req, res);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error) {
    const { code, message } = errorParser(error);
           return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
               .json({ success: false, message: message || "An error occurred" });
       }
};

/**
 * Controller to get user feed (potential matches)
 */
export const getUserFeedController = async (req: Request, res: Response) => {
  try {
    const response = await getUserFeedService(req, res);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error) {
    const { code, message } = errorParser(error);
    return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
        .json({ success: false, message: message || "An error occurred" });
}
};

/**
 * Controller to get user match statistics
 */
export const getUserMatchStatsController = async (req: Request, res: Response) => {
  try {
    const response = await getUserMatchStatsService(req, res);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error) {
    const { code, message } = errorParser(error);
    return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
        .json({ success: false, message: message || "An error occurred" });
}
};