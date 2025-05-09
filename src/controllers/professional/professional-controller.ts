import { Request, Response } from "express";
import { httpStatusCode } from "src/lib/constant";
import { errorParser } from "src/lib/errors/error-response-handler";
import { createProfessionalProfileService, deleteProfessionalProfileService, getAllProfessionalProfilesService, getProfessionalProfileByIdService, getUserAllprofessionalProfilesService, updateProfessionalProfileService } from "src/services/professional/professional-service";



export const createProfessionalProfile = async (req: Request, res: Response) => {
    try {
        const response = await createProfessionalProfileService(req, res);
        return res.status(httpStatusCode.CREATED).json(response);
    } catch (error: any) {
        const { code, message } = errorParser(error);
        return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
            .json({ success: false, message: message || "An error occurred" });
    }
}
export const getAllProfessionalProfiles = async (req: Request, res: Response) => {
    try {
        const response = await createProfessionalProfileService(req, res);
        return res.status(httpStatusCode.OK).json(response);
    } catch (error: any) {
        const { code, message } = errorParser(error);
        return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
            .json({ success: false, message: message || "An error occurred" });
    }
}
export const getProfessionalProfileById = async (req: Request, res: Response) => {
    try {
        const response = await getProfessionalProfileByIdService(req, res);
        return res.status(httpStatusCode.OK).json(response);
    } catch (error: any) {
        const { code, message } = errorParser(error);
        return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
            .json({ success: false, message: message || "An error occurred" });
    }
}
export const getUserAllprofessionalProfiles = async (req: Request, res: Response) => {
    try {
        const response = await getUserAllprofessionalProfilesService(req, res);
        return res.status(httpStatusCode.OK).json(response);
    } catch (error: any) {
        const { code, message } = errorParser(error);
        return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
            .json({ success: false, message: message || "An error occurred" });
    }
}
export const updateProfessionalProfile = async (req: Request, res: Response) => {
    try {
        const response = await updateProfessionalProfileService(req, res);
        return res.status(httpStatusCode.OK).json(response);
    } catch (error: any) {
        const { code, message } = errorParser(error);
        return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
            .json({ success: false, message: message || "An error occurred" });
    }
}
export const deleteProfessionalProfile = async (req: Request, res: Response) => {
    try {
        const response = await deleteProfessionalProfileService(req, res);
        return res.status(httpStatusCode.OK).json(response);
    } catch (error: any) {
        const { code, message } = errorParser(error);
        return res.status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
            .json({ success: false, message: message || "An error occurred" });
    }
}