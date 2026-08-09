import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        username: string;
        email: string;
      };
    }
  }
}

const JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'voxly_secret_access_token_sign_key_987654321';

export const authenticate = (req: Request, res: Response, next: NextFunction): void => {
  let token: string | undefined;

  // 1. Check cookies first
  if (req.cookies && req.cookies.accessToken) {
    token = req.cookies.accessToken;
  } 
  // 2. Check Authorization header
  else if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    res.status(401).json({
      success: false,
      error: { message: 'Authentication required. No token provided.' }
    });
    return;
  }

  try {
    const decoded = jwt.verify(token, JWT_ACCESS_SECRET) as {
      id: string;
      username: string;
      email: string;
    };
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({
      success: false,
      error: { message: 'Unauthorized. Invalid or expired token.' }
    });
  }
};
