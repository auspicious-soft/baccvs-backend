import { Request, Response, NextFunction } from "express";
import jwt, { JwtPayload } from "jsonwebtoken";
import { AdminModel } from "src/models/admin/admin-schema";
import { httpStatusCode } from "src/lib/constant";

declare global {
  namespace Express {
    interface Request {
      admin?: {
        id: string;
        role?: string;
        fullName?:string;
        roleAccess?: Array<string>;
      };
    }
  }
}

export const checkAdminAuth = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    // 1️⃣ Extract token
    const authHeader = req.headers.authorization;
    const token =
      authHeader && authHeader.startsWith("Bearer ")
        ? authHeader.split(" ")[1]
        : null;

    if (!token) {
      return res.status(httpStatusCode.UNAUTHORIZED).json({
        success: false,
        message: "Authorization token missing",
      });
    }

    // 2️⃣ Verify JWT (USING AUTH_SECRET)
    const decoded = jwt.verify(
      token,
      process.env.AUTH_SECRET as string
    ) as JwtPayload;

    if (!decoded || !decoded.id) {
      return res.status(httpStatusCode.UNAUTHORIZED).json({
        success: false,
        message: "Invalid or expired token",
      });
    }

    // 3️⃣ Validate admin state
    const admin = await AdminModel.findOne({
      _id: decoded.id,
      isDeleted: false,
      isBlocked: false,
    }).select("_id role fullName roleAccess");

    if (!admin) {
      return res.status(httpStatusCode.UNAUTHORIZED).json({
        success: false,
        message: "Admin access revoked",
      });
    }

    req.admin = {
      id: admin.id,
      role: admin.role,
      fullName: admin.fullName,
      roleAccess:admin.roleAccess || [],
    };

    next();
  } catch (error) {
    return res.status(httpStatusCode.UNAUTHORIZED).json({
      success: false,
      message: "Unauthorized",
    });
  }
};

