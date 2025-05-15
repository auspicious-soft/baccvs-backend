import { Socket } from "socket.io";
import jwt from "jsonwebtoken";

// Extend the Socket interface to include a 'user' property
declare module "socket.io" {
  interface Socket {
    user?: any;
  }
}

export const socketAuthMiddleware = (socket: Socket, next: (err?: Error) => void) => {
const authHeader = socket.handshake.headers.authorization;
  let token;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1]; // Extract token from "Bearer <token>"
  } else {
    // Fallback to query parameter or auth object if needed
    token = socket.handshake.query.token || socket.handshake.auth.token;
  }

  if (!token) {
    return next(new Error('Authentication error: No token provided'));
  }

  try {
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      return next(new Error("Authentication error: JWT secret not configured"));
    }
    const decoded = jwt.verify(token, jwtSecret);
    socket.user = decoded; // Attach user data (e.g., { id, email, phoneNumber }) to socket
    next();
  } catch (error) {
    next(new Error("Authentication error: Invalid token"));
  }
};