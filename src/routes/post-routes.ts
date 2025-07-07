import { Router } from "express";
import { createPost, deletepost, getAllPost, getAllPostOfCurrentUser, getPostById, getPostsOfOtherUser, updatePost, uploadPostPhotos } from "src/controllers/post/post-controller";

const router = Router();

router.post("/", createPost)
router.get("/:id", getPostById)
router.get("/get/AllPost", getAllPost)
router.get("/get/PostOfUser", getAllPostOfCurrentUser)
router.get("/get/PostOfUsers/:id", getPostsOfOtherUser)
router.put("/updatePost/:id", uploadPostPhotos, updatePost)
router.delete("/deleteById/:id", deletepost)


export { router }
