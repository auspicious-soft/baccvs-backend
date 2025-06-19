import { Request, Response } from "express";
import { httpStatusCode } from "src/lib/constant";
import { errorParser } from "src/lib/errors/error-response-handler";
import {
  createResellListingService,
  getResellListingByIdService,
  getUserResellListingsService,
  getAllResellListingsService,
  updateResellListingService,
  cancelResellListingService,
} from "src/services/resell/resell-service";

export const createResellListing = async (req: Request, res: Response) => {
  try {
    const response = await createResellListingService(req, res);
    return res.status(httpStatusCode.CREATED).json(response);
  } catch (error) {
    const { code, message } = errorParser(error);
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};

export const getResellListingById = async (req: Request, res: Response) => {
  try {
    const response = await getResellListingByIdService(req, res);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error) {
    const { code, message } = errorParser(error);
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};

export const getUserResellListings = async (req: Request, res: Response) => {
  try {
    const response = await getUserResellListingsService(req, res);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error) {
    const { code, message } = errorParser(error);
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};

export const getAllResellListings = async (req: Request, res: Response) => {
  try {
    const response = await getAllResellListingsService(req, res);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error) {
    const { code, message } = errorParser(error);
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};

export const updateResellListing = async (req: Request, res: Response) => {
  try {
    const response = await updateResellListingService(req, res);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error) {
    const { code, message } = errorParser(error);
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};

export const cancelResellListing = async (req: Request, res: Response) => {
  try {
    const response = await cancelResellListingService(req, res);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error) {
    const { code, message } = errorParser(error);
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};

