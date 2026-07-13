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
 * - All other routes: enforces the allowedOrigins whitelist.
 */
function corsMiddleware(req, res, next) {
  if (req.path === "/api/payments/iyzico/callback") {
    return next();
  }

  return cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      if (allowedOrigins.has(origin)) return callback(null, true);
      return callback(new Error("CORS blocked for this origin."));
    },
  })(req, res, next);
}

module.exports = corsMiddleware;
