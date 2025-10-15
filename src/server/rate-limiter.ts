import type { Context, Next } from "hono";

interface RateLimitStore {
  [key: string]: {
    count: number;
    resetTime: number;
  };
}

const store: RateLimitStore = {};

function cleanupExpiredEntries() {
  const now = Date.now();
  Object.keys(store).forEach((key) => {
    if (store[key].resetTime < now) {
      delete store[key];
    }
  });
}

setInterval(cleanupExpiredEntries, 60000);

export function rateLimit(options: {
  windowMs: number;
  max: number;
  message?: string;
}) {
  const { windowMs, max, message = "Too many requests, please try again later" } = options;

  return async (c: Context, next: Next) => {
    const ip = c.req.header("x-forwarded-for") || c.req.header("x-real-ip") || "unknown";
    const key = `${ip}:${c.req.url}`;
    const now = Date.now();

    if (!store[key] || store[key].resetTime < now) {
      store[key] = {
        count: 1,
        resetTime: now + windowMs,
      };
      return next();
    }

    store[key].count++;

    if (store[key].count > max) {
      return c.json(
        {
          error: message,
          retryAfter: Math.ceil((store[key].resetTime - now) / 1000),
        },
        429
      );
    }

    return next();
  };
}
