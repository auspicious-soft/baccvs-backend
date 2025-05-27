import { Router } from "express";
import { checkAuth } from "src/middleware/check-auth";
import { 
  createProduct,
  getAllProducts,
  getProductById,
  updateProduct,
  deleteProduct
} from "src/controllers/product/stripe-product-controller";

const router = Router();

// Public routes
router.get("/", getAllProducts);
router.get("/:productId", getProductById);

// Protected routes (admin only)
router.post("/", checkAuth, createProduct);
router.put("/:productId", checkAuth,  updateProduct);
router.delete("/:productId", checkAuth, deleteProduct);

export { router };