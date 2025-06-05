import { Request, Response } from "express";
import { httpStatusCode } from "src/lib/constant";
import { errorParser } from "src/lib/errors/error-response-handler";
import { 
  createProductService,
  getAllProductsService,
  getProductByIdService,
  updateProductService,
  deleteProductService
} from "src/services/product/stripe-product-service";

/**
 * Create a new product in Stripe
 */
export const createProduct = async (req: Request, res: Response) => {
  try {
    const response = await createProductService(req, res);
    return res.status(response.success ? httpStatusCode.CREATED : httpStatusCode.BAD_REQUEST).json(response);
  } catch (error) {
    const { code, message } = errorParser(error);
    return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};

/**
 * Get all products from Stripe
 */
export const getAllProducts = async (req: Request, res: Response) => {
  try {
    const response = await getAllProductsService(req, res);
    return res.status(response.success ? httpStatusCode.OK : httpStatusCode.BAD_REQUEST).json(response);
  } catch (error) {
    const { code, message } = errorParser(error);
    return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};

/**
 * Get a single product by ID
 */
export const getProductById = async (req: Request, res: Response) => {
  try {
    const response = await getProductByIdService(req, res);
    return res.status(response.success ? httpStatusCode.OK : httpStatusCode.BAD_REQUEST).json(response);
  } catch (error) {
    const { code, message } = errorParser(error);
    return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};

/**
 * Update a product in Stripe
 */
export const updateProduct = async (req: Request, res: Response) => {
  try {
    const response = await updateProductService(req, res);
    return res.status(response.success ? httpStatusCode.OK : httpStatusCode.BAD_REQUEST).json(response);
  } catch (error) {
    const { code, message } = errorParser(error);
    return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};

/**
 * Delete a product in Stripe (archive it)
 */
export const deleteProduct = async (req: Request, res: Response) => {
  try {
    const response = await deleteProductService(req, res);
    return res.status(response.success ? httpStatusCode.OK : httpStatusCode.BAD_REQUEST).json(response);
  } catch (error) {
    const { code, message } = errorParser(error);
    return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};