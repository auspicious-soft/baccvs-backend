import { Request, Response } from "express";
import {
  createCommunityService,
  getCommunitiesService,
  getUserCommunitiesService,
  getCommunityByIdService,
  joinCommunityService,
  leaveCommunityService
} from "../../services/community/community-service";

// Create a new community
export const createCommunity = async (req: any, res: Response) => {
  const result = await createCommunityService(req, res);
  if (result.success) {
    return res.status(201).json(result);
  }
  // Error is handled by the service
};

// Get all communities (with optional filters)
export const getCommunities = async (req: Request, res: Response) => {
  const result = await getCommunitiesService(req, res);
  if (result.success) {
    return res.status(200).json(result);
  }
  // Error is handled by the service
};

// Get communities the user is a member of
export const getUserCommunities = async (req: any, res: Response) => {
  const result = await getUserCommunitiesService(req, res);
  if (result.success) {
    return res.status(200).json(result);
  }
  // Error is handled by the service
};

// Get a specific community by ID
export const getCommunityById = async (req: Request, res: Response) => {
  const result = await getCommunityByIdService(req, res);
  if (result.success) {
    return res.status(200).json(result);
  }
  // Error is handled by the service
};

// Join a community
export const joinCommunity = async (req: any, res: Response) => {
  const result = await joinCommunityService(req, res);
  if (result.success) {
    return res.status(200).json(result);
  }
  // Error is handled by the service
};

// Leave a community
export const leaveCommunity = async (req: any, res: Response) => {
  const result = await leaveCommunityService(req, res);
  if (result.success) {
    return res.status(200).json(result);
  }
  // Error is handled by the service
};