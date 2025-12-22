import { Router } from "express";
import {
  createLikeProduct,
  getLikeProducts,
  updateLikeProduct,
  getLikeProductById,
} from "src/controllers/admin/admin-controller";

const router = Router();

router.post("/like-products", createLikeProduct);
router.get("/like-products", getLikeProducts);
router.get("/like-products/:productId", getLikeProductById);
router.put("/like-products/:productId", updateLikeProduct);

export { router };
