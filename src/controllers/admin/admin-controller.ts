import { Request, Response } from "express";
import { httpStatusCode } from "src/lib/constant";
import { errorParser } from "src/lib/errors/error-response-handler";
import {
  createLikeProductService,
  getLikeProductsService,
  updateLikeProductService,
  getLikeProductByIdService,
  createPromotionPlanService,
  updatePromotionPlanService,
  getPromotionPlansService,
} from "src/services/admin/admin-service";

export const createLikeProduct = async (req: Request, res: Response) => {
  try {
    const response = await createLikeProductService(req, res);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: message || "Error creating like product",
    });
  }
};

export const updateLikeProduct = async (req: Request, res: Response) => {
  try {
    const response = await updateLikeProductService(req, res);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: message || "Error updating like product",
    });
  }
};

export const getLikeProducts = async (req: Request, res: Response) => {
  try {
    const response = await getLikeProductsService(req, res);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: message || "Error fetching like products",
    });
  }
};

export const getLikeProductById = async (req: Request, res: Response) => {
  try {
    const response = await getLikeProductByIdService(req, res);
    const statusCode = response.status || httpStatusCode.OK;
    return res.status(statusCode).json(response);
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: message || "Error fetching like product",
    });
  }
};
export const createPromotionPlan = async (req: Request, res: Response) => {
  try {
    const response = await createPromotionPlanService(req, res);
    return res.status(httpStatusCode.CREATED).json(response);
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: message || "Error fetching like product",
    });
  }
};
export const updatePromotionPlan = async (req: Request, res: Response) => {
  try {
    const response = await updatePromotionPlanService(req, res);
    return res.status(httpStatusCode.CREATED).json(response);
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: message || "Error fetching like product",
    });
  }
};
export const getPromotionPlans = async (req: Request, res: Response) => {
  try {
    const response = await getPromotionPlansService(req, res);
    return res.status(httpStatusCode.CREATED).json(response);
  } catch (error: any) {
    const { code, message } = errorParser(error);
    return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: message || "Error fetching like product",
    });
  }
};