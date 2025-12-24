import { Router } from "express";
import {
  createLikeProduct,
  getLikeProducts,
  updateLikeProduct,
  getLikeProductById,
  createPromotionPlan,
  updatePromotionPlan,
} from "src/controllers/admin/admin-controller";

const router = Router();

router.post("/like-products", createLikeProduct);
router.get("/like-products", getLikeProducts);
router.get("/like-products/:productId", getLikeProductById);
router.put("/like-products/:productId", updateLikeProduct);

// Promotion Plan Routes
router.post("/promotion-plans", createPromotionPlan);
router.patch("/promotion-plans/:planId", updatePromotionPlan);

export { router };
