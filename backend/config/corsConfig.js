// backend/config/corsConfig.js
// CORS middleware extracted from server.js.
// The iyzico callback bypass MUST remain here — iyzico POSTs from their own
// servers, so their origin is never in our allowed list.

const cors = require("cors");

const defaultAllowedOrigins = [
  "http://localhost:5173",
  "http://localhost:5174",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:5174",
  "https://localhost:5173",
  "https://localhost:5174",
  "https://127.0.0.1:5173",
  "https://127.0.0.1:5174",

  // iyzico Sandbox ödeme sayfası
  "https://sandbox-cpp.iyzipay.com",
  "https://sandbox-api.iyzipay.com",
  "https://sandbox-merchant.iyzipay.com",
];

const envOrigins = (process.env.CORS_ORIGIN || "")
  .split(",")
  .map((x) => x.trim())
  .filter(Boolean);

const allowedOrigins = new Set([...defaultAllowedOrigins, ...envOrigins]);

/**
 * Express middleware.
 * - /api/payments/iyzico/callback: bypasses CORS entirely (iyzico server-to-server).
 * - All other routes: enforces allowedOrigins whitelist.
 */
function corsMiddleware(req, res, next) {
  if (req.path === "/api/payments/iyzico/callback") {
    return next();
  }

  return cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);

      const cleanOrigin = origin.replace(/\/$/, "");

      const isAllowed =
        allowedOrigins.has(cleanOrigin) ||
        allowedOrigins.has(origin) ||
        /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(cleanOrigin);

      if (isAllowed) {
        return callback(null, true);
      }

      console.warn(`[CORS] Blocked request from origin: ${origin}`);
      return callback(null, false);
    },
    credentials: true,
  })(req, res, next);
}

module.exports = corsMiddleware;


