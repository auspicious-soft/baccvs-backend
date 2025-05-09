import { Request, Response } from 'express';
import { httpStatusCode } from 'src/lib/constant';
import { errorParser } from 'src/lib/errors/error-response-handler';
import {
  getNearbyUsersService,
  getNearbyEventsService,
  updateUserLocationService
} from 'src/services/location/location-service';

export const getNearbyUsers = async (req: Request, res: Response) => {
  try {
    const response = await getNearbyUsersService(req, res);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error) {
    const { code, message } = errorParser(error);
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || 'An error occurred' });
  }
};

export const getNearbyEvents = async (req: Request, res: Response) => {
  try {
    const response = await getNearbyEventsService(req, res);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error) {
    const { code, message } = errorParser(error);
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || 'An error occurred' });
  }
};

export const updateUserLocation = async (req: Request, res: Response) => {
  try {
    const response = await updateUserLocationService(req, res);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error) {
    const { code, message } = errorParser(error);
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || 'An error occurred' });
  }
};