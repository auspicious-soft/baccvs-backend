import { Router } from "express";
import { createLikeProduct, getLikeProducts, updateLikeProduct } from "src/controllers/admin/admin-controller";

const router = Router();

router.post("/like-products", createLikeProduct);
router.put("/like-products/:productId", updateLikeProduct);
router.get("/like-products", getLikeProducts);

export { router };