import { Router } from "express";
import { checkAuth } from "src/middleware/check-auth";
import { 
  getAllProducts,
  getProductById,
  deleteProduct
} from "src/controllers/product/stripe-product-controller";

const router = Router();

// Public routes
router.get("/", getAllProducts);
router.get("/:productId", getProductById);

router.delete("/:productId", checkAuth, deleteProduct);

export { router };