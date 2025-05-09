import { Request, Response } from "express";
import { httpStatusCode } from "src/lib/constant";
import { errorParser } from "src/lib/errors/error-response-handler";
import {
  createSquadService,
  getSquadByIdService,
  updateSquadService,
  deleteSquadService,
  joinSquadService,
  leaveSquadService,
  getSquadMembersService,
  inviteMemberService,
  removeMemberService,
  getSquadsService,
  getUserSquadsService,
  updateSquadMediaService,
  getSquadsByLocationService,
  likeSquadService,
  getSquadMatchesService
} from "src/services/squad/squad-service";

/**
 * Create a new squad
 */
export const createSquad = async (req: Request, res: Response) => {
  try {
    const response = await createSquadService(req, res);
    return res.status(httpStatusCode.CREATED).json(response);
  } catch (error) {
    const { code, message } = errorParser(error);
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};

/**
 * Get a squad by ID
 */
export const getSquadById = async (req: Request, res: Response) => {
  try {
    const response = await getSquadByIdService(req, res);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error) {
    const { code, message } = errorParser(error);
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};

/**
 * Update a squad
 */
export const updateSquad = async (req: Request, res: Response) => {
  try {
    const response = await updateSquadService(req, res);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error) {
    const { code, message } = errorParser(error);
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};

/**
 * Delete a squad
 */
export const deleteSquad = async (req: Request, res: Response) => {
  try {
    const response = await deleteSquadService(req, res);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error) {
    const { code, message } = errorParser(error);
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};

/**
 * Join a squad using invitation code
 */
export const joinSquad = async (req: Request, res: Response) => {
  try {
    const response = await joinSquadService(req, res);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error) {
    const { code, message } = errorParser(error);
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};

/**
 * Leave a squad
 */
export const leaveSquad = async (req: Request, res: Response) => {
  try {
    const response = await leaveSquadService(req, res);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error) {
    const { code, message } = errorParser(error);
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};

/**
 * Get squad members
 */
export const getSquadMembers = async (req: Request, res: Response) => {
  try {
    const response = await getSquadMembersService(req, res);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error) {
    const { code, message } = errorParser(error);
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};

/**
 * Invite a member to a squad
 */
export const inviteMember = async (req: Request, res: Response) => {
  try {
    const response = await inviteMemberService(req, res);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error) {
    const { code, message } = errorParser(error);
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};

/**
 * Remove a member from a squad
 */
export const removeMember = async (req: Request, res: Response) => {
  try {
    const response = await removeMemberService(req, res);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error) {
    const { code, message } = errorParser(error);
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};

/**
 * Get all squads (with pagination and filters)
 */
export const getSquads = async (req: Request, res: Response) => {
  try {
    const response = await getSquadsService(req, res);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error) {
    const { code, message } = errorParser(error);
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};

/**
 * Get squads for the current user
 */
export const getUserSquads = async (req: Request, res: Response) => {
  try {
    const response = await getUserSquadsService(req, res);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error) {
    const { code, message } = errorParser(error);
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};

/**
 * Update squad media (add/remove photos)
 */
export const updateSquadMedia = async (req: Request, res: Response) => {
  try {
    const response = await updateSquadMediaService(req, res);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error) {
    const { code, message } = errorParser(error);
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};

/**
 * Get squads by location (for discovery)
 */
export const getSquadsByLocation = async (req: Request, res: Response) => {
  try {
    const response = await getSquadsByLocationService(req, res);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error) {
    const { code, message } = errorParser(error);
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};

/**
 * Like a squad (for squad matching)
 */
export const likeSquad = async (req: Request, res: Response) => {
  try {
    const response = await likeSquadService(req, res);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error) {
    const { code, message } = errorParser(error);
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};

/**
 * Get squad matches
 */
export const getSquadMatches = async (req: Request, res: Response) => {
  try {
    const response = await getSquadMatchesService(req, res);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error) {
    const { code, message } = errorParser(error);
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};