import { Request, Response, NextFunction } from "express";
import { httpStatusCode } from "src/lib/constant";

export const authorizeAccess = (requiredAccess: string) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const admin = req.admin;

      if (!admin) {
        return res.status(httpStatusCode.UNAUTHORIZED).json({
          success: false,
          message: "Unauthorized",
        });
      }
      
      if (admin.role === "SUPERADMIN" || admin.role === "ADMIN") {
        return next();
      }

      if (admin.role === "STAFF") {
        const roleAccess = admin.roleAccess || [];

        if (!roleAccess.includes(requiredAccess)) {
          return res.status(httpStatusCode.FORBIDDEN).json({
            success: false,
            message: "You do not have permission to access this resource",
          });
        }

        return next();
      }

      return res.status(httpStatusCode.FORBIDDEN).json({
        success: false,
        message: "Access denied",
      });
    } catch (error) {
      return res.status(httpStatusCode.FORBIDDEN).json({
        success: false,
        message: "Authorization failed",
      });
    }
  };
};
