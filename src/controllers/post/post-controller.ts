import { Request, Response } from "express"
import { httpStatusCode } from "src/lib/constant"
import { errorParser } from "src/lib/errors/error-response-handler"
import { createPostService, deletePostService, getAllPostOfCurrentUserService, getAllPostsService, getPostByIdService, getPostsOfOtherUserService, updatePostService } from "src/services/post/post-service"
import { upload, uploadMultipleFilesToS3, handleMobileAppPhotos } from "src/configF/multer"

// Middleware for handling file uploads for posts
export const uploadPostPhotos = upload.array('photos', 10); // Allow up to 10 photos

export const createPost = async (req: Request, res: Response) =>{
  try {
     const response: any = await createPostService(req, res)
     return res.status(httpStatusCode.CREATED).json(response)
  } catch (error) {
      const { code, message } = errorParser(error)
      return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message || "An error occurred" })
  }
}
export const getAllPost = async (req: Request, res: Response) =>{
  try {
     const response: any = await getAllPostsService(req, res)
            return res.status(httpStatusCode.OK).json(response)
  } catch (error) {
      const { code, message } = errorParser(error)
          return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message || "An error occurred" })
    }
}
export const getPostById = async (req: Request, res: Response) =>{
  try {
     const response: any = await getPostByIdService(req, res)
            return res.status(httpStatusCode.OK).json(response)
  } catch (error) {
      const { code, message } = errorParser(error)
          return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message || "An error occurred" })
    }
}
export const updatePost = async (req: Request, res: Response) =>{
  try {
     // Handle file uploads if files exist
     if (req.files && Array.isArray(req.files) && req.files.length > 0) {
        // Upload files to S3
        const user = req.user as { email?: string } | undefined;
        const filePaths = await uploadMultipleFilesToS3(req.files, user?.email ?? "");
        
        // Add file paths to post data
        req.body.photos = filePaths;
     } else if (req.body.photos && Array.isArray(req.body.photos)) {
        // Handle case where photos are sent as JSON strings from mobile app
        try {
          // Parse each photo object if it's a string
          const parsedPhotos = req.body.photos.map((photo: string) => {
            if (typeof photo === 'string') {
              return JSON.parse(photo);
            }
            return photo;
          });
          
          // Process mobile app photo objects
          const user = req.user as { email?: string } | undefined;
          const filePaths = await handleMobileAppPhotos(parsedPhotos, user?.email ?? "");
          
          // Add file paths to post data
          req.body.photos = filePaths;
        } catch (parseError) {
          console.error("Error processing mobile photos:", parseError);
          // If there's an error, continue without photos
          req.body.photos = [];
        }
     }
     
     const response: any = await updatePostService(req, res)
     return res.status(httpStatusCode.OK).json(response)
  } catch (error) {
      const { code, message } = errorParser(error)
      return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message || "An error occurred" })
  }
}
export const deletepost = async (req: Request, res: Response) =>{
  try {
     const response: any = await deletePostService(req, res)
            return res.status(httpStatusCode.OK).json(response)
  } catch (error) {
      const { code, message } = errorParser(error)
          return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message || "An error occurred" })
    }
}
export const getAllPostOfCurrentUser = async (req: Request, res: Response) =>{
  try {
     const response: any = await getAllPostOfCurrentUserService(req, res)
            return res.status(httpStatusCode.OK).json(response)
  } catch (error) {
      const { code, message } = errorParser(error)
          return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message || "An error occurred" })
    }
}
export const getPostsOfOtherUser = async (req: Request, res: Response) =>{
  try {
     const response: any = await getPostsOfOtherUserService(req, res)
            return res.status(httpStatusCode.OK).json(response)
  } catch (error) {
      const { code, message } = errorParser(error)
          return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message || "An error occurred" })
    }
}
