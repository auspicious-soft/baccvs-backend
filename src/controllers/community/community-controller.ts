import { Request, Response } from "express";
import {
  createCommunityService,
  getCommunitiesService,
  getUserCommunitiesService,
  getCommunityByIdService,
  joinCommunityService,
  leaveCommunityService,
  addMemberService,
  removeMemberService,
  changeMemberRoleService
} from "../../services/community/community-service";
import { errorParser } from "src/lib/errors/error-response-handler";
import { httpStatusCode } from "src/lib/constant";

// Create a new community
export const createCommunity = async (req: any, res: Response) => {
  try {
    const response = await createCommunityService(req, res);
       return res.status(httpStatusCode.CREATED).json(response)
  } catch (error) {
    const { code, message } = errorParser(error);
    return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message || "An error occurred" });
  }
};

// Get all communities (with optional filters)
export const getCommunities = async (req: Request, res: Response) => {
  try {
    const response = await getCommunitiesService(req, res);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error) {
    const { code, message } = errorParser(error);
    return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message || "An error occurred" });
  }
};

// Get communities the user is a member of
export const getUserCommunities = async (req: any, res: Response) => {
  try {
    const response = await getUserCommunitiesService(req, res);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error) {
    const { code, message } = errorParser(error);
    return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message || "An error occurred" });
  }
};

// Get a specific community by ID
export const getCommunityById = async (req: Request, res: Response) => {
  try {
    const response = await getCommunityByIdService(req, res);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error) {
    const { code, message } = errorParser(error);
    return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message || "An error occurred" });
  }
};

// Join a community
export const joinCommunity = async (req: any, res: Response) => {
  try {
    const response = await joinCommunityService(req, res);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error) {
    const { code, message } = errorParser(error);
    return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message || "An error occurred" });
  }
};

// Leave a community
export const leaveCommunity = async (req: any, res: Response) => {
  try {
    const response = await leaveCommunityService(req, res);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error) {
    const { code, message } = errorParser(error);
    return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message || "An error occurred" });
  }
};
export const addcommunityMember = async (req: any, res: Response) => {
  try {
    const response = await addMemberService(req, res);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error) {
    const { code, message } = errorParser(error);
    return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message || "An error occurred" });
  }
};
export const removeCommunityMember = async (req: any, res: Response) => {
  try {
    const response = await removeMemberService(req, res);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error) {
    const { code, message } = errorParser(error);
    return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message || "An error occurred" });
  }
};
export const changeCommunityMemberRole = async (req: any, res: Response) => {
  try {
    const response = await changeMemberRoleService(req, res);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error) {
    const { code, message } = errorParser(error);
    return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR).json({ success: false, message: message || "An error occurred" });
  }
};
