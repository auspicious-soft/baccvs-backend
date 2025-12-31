import jwt from "jsonwebtoken";
import { Request, Response, NextFunction } from "express";

export const checkSettingsAuth = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const settingsToken = req.headers["x-settings-token"] as string;

    if (!settingsToken) {
      return res.status(401).json({
        success: false,
        message: "Settings verification required",
      });
    }

    const decoded = jwt.verify(
      settingsToken,
      process.env.SETTINGS_JWT_SECRET as string
    ) as any;

    if (decoded.scope !== "SETTINGS") {
      return res.status(401).json({
        success: false,
        message: "Invalid settings token",
      });
    }

    next();
  } catch (err) {
    return res.status(401).json({
      success: false,
      message: "Settings session expired",
    });
  }
};
