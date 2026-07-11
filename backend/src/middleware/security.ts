import { Request, Response, NextFunction } from 'express';
import { rateLimit } from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import { getRedisClient } from '../config/redis';

/**
 * Robust helper to obtain Redis-backed store for express-rate-limit.
 * Falls back safely to memory store if Redis is unavailable or during startup.
 */
const getRateLimitStore = () => {
  try {
    const client = getRedisClient();
    if (client && client.isOpen) {
      return new RedisStore({
        // Redis v4 client helper
        sendCommand: async (...args: string[]) => {
          return await client.sendCommand(args);
        },
      });
    }
  } catch (error) {
    console.warn('Redis rate limit store failed, falling back to MemoryStore:', error);
  }
  return undefined;
};

// 1. General API Route Rate Limiter (Max 100 requests per 15 mins)
export const generalRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  store: getRateLimitStore(),
  message: {
    error: 'Too many requests from this IP, please try again after 15 minutes',
  },
});

// 2. Financial & Auth Route Rate Limiter (Max 5 requests per 1 minute)
export const strictRateLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  store: getRateLimitStore(),
  message: {
    error: 'Too many attempts. Action rate-limited to 5 requests per minute.',
  },
});

/**
 * 3. Regex-based input sanitization middleware.
 * Traverses body, query, and params to block NoSQL injection and XSS scripts.
 */
const hasNoSqlKeywords = (obj: any): boolean => {
  if (!obj || typeof obj !== 'object') return false;

  for (const key in obj) {
    // Detect keys starting with $ (MongoDB query operators used in injections)
    if (key.startsWith('$')) {
      return true;
    }
    if (typeof obj[key] === 'object') {
      if (hasNoSqlKeywords(obj[key])) {
        return true;
      }
    }
  }
  return false;
};

const cleanXssString = (val: string): string => {
  // Regex to neutralize <script> tags and standard HTML elements
  return val
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<[^>]*>/g, '');
};

const sanitizeValue = (val: any): any => {
  if (typeof val === 'string') {
    return cleanXssString(val);
  }
  if (Array.isArray(val)) {
    return val.map(sanitizeValue);
  }
  if (typeof val === 'object' && val !== null) {
    const cleaned: any = {};
    for (const key in val) {
      cleaned[key] = sanitizeValue(val[key]);
    }
    return cleaned;
  }
  return val;
};

export const sanitizeInputMiddleware = (req: Request, res: Response, next: NextFunction) => {
  // A. Block NoSQL Injection attempts
  if (hasNoSqlKeywords(req.body) || hasNoSqlKeywords(req.query) || hasNoSqlKeywords(req.params)) {
    return res.status(400).json({
      error: 'Security Alert: Malicious query parameters detected and blocked.',
    });
  }

  // B. Sanitize XSS strings recursively
  req.body = sanitizeValue(req.body);
  req.query = sanitizeValue(req.query);
  req.params = sanitizeValue(req.params);

  return next();
};
