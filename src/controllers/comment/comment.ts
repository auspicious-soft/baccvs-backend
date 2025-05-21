import { Request, Response } from "express"
import { httpStatusCode } from "src/lib/constant"
import { errorParser } from "src/lib/errors/error-response-handler"
import { 
  countCommentsService, 
  countPostCommentsService, 
  createCommentService, 
  deleteCommentService, 
  getCommentRepliesService, 
  getCommentService, 
  getCommentsService, 
  getPostCommentsService, 
  updateCommentService 
} from "src/services/comment/comment-service"



export const createComment = async (req: Request, res: Response) =>{
  try {
     const response: any = await createCommentService(req, res)
            return res.status(httpStatusCode.CREATED).json(response)
  } catch (error) {
      const { code, message } = errorParser(error)
          return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message || "An error occurred" })
    }
}
export const getComments = async (req: Request, res: Response) =>{
  try {
     const response: any = await getCommentsService(req, res)
            return res.status(httpStatusCode.OK).json(response)
  } catch (error) {
      const { code, message } = errorParser(error)
          return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message || "An error occurred" })
    }
}

// For backward compatibility
export const getPostComments = async (req: Request, res: Response) =>{
  try {
     const response: any = await getPostCommentsService(req, res)
            return res.status(httpStatusCode.OK).json(response)
  } catch (error) {
      const { code, message } = errorParser(error)
          return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message || "An error occurred" })
    }
}

export const getSingleComment = async (req: Request, res: Response) =>{
  try {
     const response: any = await getCommentService(req, res)
            return res.status(httpStatusCode.OK).json(response)
  } catch (error) {
      const { code, message } = errorParser(error)
          return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message || "An error occurred" })
    }
}

export const getCommentReplies = async (req: Request, res: Response) =>{
  try {
     const response: any = await getCommentRepliesService(req, res)
            return res.status(httpStatusCode.OK).json(response)
  } catch (error) {
      const { code, message } = errorParser(error)
          return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message || "An error occurred" })
    }
}

export const updateComment = async (req: Request, res: Response) =>{
  try {
     const response: any = await updateCommentService(req, res)
            return res.status(httpStatusCode.OK).json(response)
  } catch (error) {
      const { code, message } = errorParser(error)
          return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message || "An error occurred" })
    }
}
export const deleteComment = async (req: Request, res: Response) =>{
  try {
     const response: any = await deleteCommentService(req, res)
            return res.status(httpStatusCode.OK).json(response)
  } catch (error) {
      const { code, message } = errorParser(error)
          return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message || "An error occurred" })
    }
}
export const countComments = async (req: Request, res: Response) =>{
  try {
     const response: any = await countCommentsService(req, res)
            return res.status(httpStatusCode.OK).json(response)
  } catch (error) {
      const { code, message } = errorParser(error)
          return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message || "An error occurred" })
    }
}

// For backward compatibility
export const countPostComments = async (req: Request, res: Response) =>{
  try {
     const response: any = await countPostCommentsService(req, res)
            return res.status(httpStatusCode.OK).json(response)
  } catch (error) {
      const { code, message } = errorParser(error)
          return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message || "An error occurred" })
    }
}
