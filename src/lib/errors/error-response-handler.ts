import multer from "multer";
import { Response } from "express";
import { httpStatusCode } from "../constant";

export const errorResponseHandler = (message: string, code: number = 500, res: Response) => {
    throw new Error(JSON.stringify({
        success: false,
        message,
        code
    }))
}

export const errorParser = (error: any) => {
    console.log('error: ', error);

    try {
        return JSON.parse(error.message);
    } catch (e) {
        return {
            code: httpStatusCode.INTERNAL_SERVER_ERROR,
            message:error.message
        };
    }
}

export const checkMulter = (err: any, req: any, res: any, next: any) => {
    if (err instanceof multer.MulterError) {
        res.status(400).json({ success: false, message: `${err.message}` });
    } else {
        next();
    }
}

export const formatErrorResponse = (res: Response, error: any) => {
    const { code, message } = errorParser(error);
    return res
        .status(code || httpStatusCode.INTERNAL_SERVER_ERROR)
        .json({ 
            success: false, 
            message: message || "An error occurred",
            timestamp: new Date().toISOString()
        });
};