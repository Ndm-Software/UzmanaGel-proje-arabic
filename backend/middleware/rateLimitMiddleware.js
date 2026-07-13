// backend/middleware/rateLimitMiddleware.js
// Global in-memory rate limiter extracted from server.js (lines 149-178).
//
// NOTE: This middleware is defined but NOT mounted on the app — matching the
// current state of server.js (line 180 was commented out: // app.use(globalRateLimitMiddleware)).
// To enable, add app.use(globalRateLimitMiddleware) in app.js.
//
// WARNING: This is a single-process, in-memory counter.
// It does NOT work across multiple server instances / workers.
// For production multi-instance deployments, replace with a Redis-backed
// rate limiter (e.g., express-rate-limit + rate-limit-redis).

let globalRequestCount = 0;
let globalLastResetTime = Date.now();

const GLOBAL_RATE_LIMIT_MAX = 500;
const GLOBAL_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

function checkGlobalRateLimit() {
  const now = Date.now();

  if (now - globalLastResetTime >= GLOBAL_RATE_LIMIT_WINDOW_MS) {
    globalRequestCount = 0;
    globalLastResetTime = now;
  }

  if (globalRequestCount >= GLOBAL_RATE_LIMIT_MAX) {
    throw new Error("RATE_LIMIT_EXCEEDED");
  }

  globalRequestCount++;
}

/**
 * globalRateLimitMiddleware(req, res, next)
 * Returns HTTP 429 when the per-window request count is exceeded.
 *
 * USAGE (when ready to enable):
 *   app.use(globalRateLimitMiddleware);  // add to app.js after body parsers
 */
function globalRateLimitMiddleware(req, res, next) {
  try {
    checkGlobalRateLimit();
    next();
  } catch (error) {
    return res.status(429).json({
      message: "تم تنفيذ محاولات كثيرة. يرجى المحاولة لاحقاً.",
    });
  }
}

module.exports = globalRateLimitMiddleware;
