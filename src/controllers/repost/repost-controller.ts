import { Request, Response } from 'express';
import { httpStatusCode } from 'src/lib/constant';
import { errorParser } from 'src/lib/errors/error-response-handler';
import {
  createRepostService,
  deleteRepostService,
  getUserRepostsService
} from 'src/services/repost/repost-service';

export const createRepost = async (req: Request, res: Response) => {
  try {
    const response = await createRepostService(req, res);
    return res.status(httpStatusCode.CREATED).json(response);
  } catch (error) {
    const { code, message } = errorParser(error);
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || 'An error occurred' });
  }
};

export const deleteRepost = async (req: Request, res: Response) => {
  try {
    const response = await deleteRepostService(req, res);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error) {
    const { code, message } = errorParser(error);
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || 'An error occurred' });
  }
};

export const getUserReposts = async (req: Request, res: Response) => {
  try {
    const response = await getUserRepostsService(req, res);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error) {
    const { code, message } = errorParser(error);
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || 'An error occurred' });
  }
};