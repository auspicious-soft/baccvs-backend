import {Router} from "express"
import { countPostComments, createComment, deleteComment, getComments, getPostComments, getUserComments, updateComment } from "src/controllers/comment/comment"
import { checkAuth } from "src/middleware/check-auth"

const router = Router()

router.post("/",checkAuth,createComment)
router.get("/post/:postId",getPostComments)
router.get("/post/:postId/count",countPostComments)
router.get("/:commentId",getComments)
router.route("/:commentId").put(checkAuth,updateComment).delete(checkAuth,deleteComment)
router.get("/comment",checkAuth,getUserComments)

export {router}