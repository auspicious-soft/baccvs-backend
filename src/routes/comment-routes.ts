import {Router} from "express"
import { 
  countComments, 
  countPostComments, 
  createComment, 
  deleteComment, 
  getCommentReplies, 
  getComments, 
  getPostComments, 
  getSingleComment, 
  updateComment 
} from "src/controllers/comment/comment"
import { checkAuth } from "src/middleware/check-auth"

const router = Router()

// Create a new comment (for both posts and reposts)
router.post("/", checkAuth, createComment)

// Get comments for a post or repost
router.get("/:targetType/:targetId", getComments)

// Get comment count for a post or repost
router.get("/:targetType/:targetId/count", countComments)

// Get comments for a specific post
router.get("/post/:postId", getPostComments)

// Get comment count for a specific post
router.get("/post/:postId/count", countPostComments)

// Get a single comment by ID
router.get("/:commentId", getSingleComment)

// Update or delete a comment
router.route("/:commentId")
  .put(checkAuth, updateComment)
  .delete(checkAuth, deleteComment)


export {router}
