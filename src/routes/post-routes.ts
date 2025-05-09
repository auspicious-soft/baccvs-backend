import { Router } from "express";
import { createPost, deletepost, getAllPost, getAllPostOfCurrentUser, getPostById, updatePost } from "src/controllers/post/post-controller";

const router = Router();

router.post("/",createPost)
router.get("/:id",getPostById)
router.get("/get/AllPost",getAllPost)
router.get("/get/PostOfUser",getAllPostOfCurrentUser)
router.put("/updatePost/:id",updatePost)
router.delete("/deleteById/:id",deletepost)

export { router }