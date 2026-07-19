import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { getRedisClient } from '../config/redis';

export const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_jwt_key';

export interface AuthenticatedRequest extends Request {
  user?: {
    userId: string;
    username: string;
    role?: string;
    isAdmin?: boolean;
  };
  token?: string;
}

/**
 * Express Middleware to verify JWT and check for Redis blacklisting on every request.
 */
export const authenticateJWT = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Access token is required' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const redis = getRedisClient();
    if (redis && redis.isOpen) {
      // Check if token exists in the Redis blacklist
      const isBlacklisted = await redis.get(`blacklist:${token}`);
      if (isBlacklisted) {
        return res.status(401).json({ error: 'Token is invalid or has logged out' });
      }
    }

    // Verify token validity
    const decoded = jwt.verify(token, JWT_SECRET) as {
      userId: string;
      username: string;
      role?: string;
      isAdmin?: boolean;
      exp?: number;
    };
    req.user = {
      userId: decoded.userId,
      username: decoded.username,
      role: decoded.role,
      isAdmin: decoded.isAdmin,
    };
    req.token = token;

    return next();
  } catch (error) {
    console.error('JWT verification error:', error);
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};

/**
 * Express Middleware to enforce Super-Admin access restriction.
 */
export const requireSuperAdmin = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  if (!req.user || (req.user.role !== 'SUPER_ADMIN' && !req.user.isAdmin)) {
    return res.status(403).json({ error: 'Forbidden: Super-Admin authorization required' });
  }
  return next();
};

/**
 * Asynchronously commits active JWT token to Redis blacklist with exact TTL expiry.
 */
export const blacklistToken = async (token: string): Promise<void> => {
  const redis = getRedisClient();
  if (!redis || !redis.isOpen) return;

  try {
    const decoded = jwt.decode(token) as { exp?: number };
    if (decoded && decoded.exp) {
      const nowInSeconds = Math.floor(Date.now() / 1000);
      const ttl = decoded.exp - nowInSeconds;

      if (ttl > 0) {
        // Blacklist token string in Redis with Time-To-Live (TTL) expiration matching life
        await redis.set(`blacklist:${token}`, '1', {
          EX: ttl,
        });
        console.log(`Token blacklisted for ${ttl} seconds`);
      }
    }
  } catch (err) {
    console.error('Failed to blacklist JWT token:', err);
  }
};
