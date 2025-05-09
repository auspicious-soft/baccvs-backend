import { Request, Response } from "express";
import { httpStatusCode } from "src/lib/constant"
import { errorParser } from "src/lib/errors/error-response-handler"
import {   followUserService, getFollowRelationshipService, getFollowStatsService,  } from "src/services/follow/follow-service"

export const followUser = async (req: Request, res: Response) =>{
  try {
     const response: any = await followUserService(req, res)
            return res.status(httpStatusCode.CREATED).json(response)
  } catch (error) {
      const { code, message } = errorParser(error)
          return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message || "An error occurred" })
    }
}
export const getFollowStats = async (req: Request, res: Response) =>{
  try {
     const response: any = await getFollowStatsService(req, res)
            return res.status(httpStatusCode.OK).json(response)
  } catch (error) {
      const { code, message } = errorParser(error)
          return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message || "An error occurred" })
    }
}
export const getFollowRelationship = async (req: Request, res: Response) =>{
  try {
     const response: any = await getFollowRelationshipService(req, res)
            return res.status(httpStatusCode.OK).json(response)
  } catch (error) {
      const { code, message } = errorParser(error)
          return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message || "An error occurred" })
    }
}

// export const getPendingFollowRequest = async (req: Request, res: Response) =>{
//   try {
//      const response: any = await getPendingFollowRequestsService(req, res)
//             return res.status(httpStatusCode.OK).json(response)
//   } catch (error) {
//     console.log('error:', error);
//       const { code, message } = errorParser(error)
//       console.log('message:', message);
//           return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message || "An error occurred" })
//     }
// }
// export const handleFollowRequest = async (req: Request, res: Response) => {
//     try {
//         const response = await handleFollowRequestService(req, res);
//         return res.status(httpStatusCode.OK).json(response);
//     } catch (error) {
//         const { code, message } = errorParser(error);
//         return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
//             .json({ success: false, message: message || "An error occurred" });
//     }
// };
// export const cancelFollowRequest = async (req: Request, res: Response) =>{
//     try {
//        const response: any = await cancelFollowRequestService(req, res)
//               return res.status(httpStatusCode.OK).json(response)
//     } catch (error) {
//         const { code, message } = errorParser(error)
//             return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message || "An error occurred" })
//       }
// }

// export const unfollowUser = async (req: Request, res: Response) =>{
//   try {
//      const response: any = await unfollowUserService(req, res)
//             return res.status(httpStatusCode.OK).json(response)
//   } catch (error) {
//       const { code, message } = errorParser(error)
//           return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message || "An error occurred" })
//     }
// }