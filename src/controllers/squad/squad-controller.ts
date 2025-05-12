import { Request, Response } from "express";
import { httpStatusCode } from "src/lib/constant";
import { errorParser } from "src/lib/errors/error-response-handler";
import {
  createSquadService,
  getSquadByIdService,
  updateSquadService,
  deleteSquadService,
  getSquadsService,
  getUserSquadsService,
  addMemberService,
  removeMemberService,
  changeMemberRoleService,
  leaveSquadService,
  transferOwnershipService
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
 * Add member to squad
 */
export const addMember = async (req: Request, res: Response) => {
  try {
    const response = await addMemberService(req, res);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error) {
    const { code, message } = errorParser(error);
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};

/**
 * Remove member from squad
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

export const  changeMemberRole = async (req: Request, res: Response) => {
  try {
    const response = await changeMemberRoleService(req, res);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error) {
    const { code, message } = errorParser(error);
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};

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

export const transferOwnership = async (req: Request, res: Response) => {
  try {
    const response = await transferOwnershipService(req, res);
    return res.status(httpStatusCode.OK).json(response);
  } catch (error) {
    const { code, message } = errorParser(error);
    return res
      .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: message || "An error occurred" });
  }
};

