// backend/middleware/authMiddleware.js
// Consolidated Firebase Auth middleware.
//
// COMPATIBILITY NOTE
// ------------------
// Two different auth implementations existed before this file:
//   1. root authMiddleware.js  → set req.user (full decoded token)
//   2. inline requireAuth() in server.js → set req.userId + req.userEmail
//
// This unified version sets ALL THREE so that every existing route handler
// continues to work without modification, regardless of which property it reads.
//
// The root authMiddleware.js is now a compatibility bridge that re-exports
// this function, so require("./authMiddleware") from any root-level route file
// continues to resolve correctly.

const { admin } = require("../config/firebaseAdmin");

const isDevelopment = process.env.NODE_ENV === "development";

/**
 * requireAuth(req, res, next)
 *
 * Verifies the Firebase ID token from the Authorization: Bearer <token> header.
 * On success sets:
 *   - req.user       — full decoded token object (used by chat/payment routes)
 *   - req.userId     — decoded.uid shorthand (used by listings/user/favorite/OCR routes)
 *   - req.userEmail  — decoded.email or null
 */
async function requireAuth(req, res, next) {
  try {
    const authHeader =
      req.headers.authorization || req.header("authorization") || "";

    const token = authHeader.startsWith("Bearer ")
      ? authHeader.slice("Bearer ".length)
      : "";

    if (!token) {
      return res.status(401).json({ message: "جلسة الدخول غير موجودة. يرجى تسجيل الدخول مرة أخرى." });
    }

    const decoded = await admin.auth().verifyIdToken(token);

    // Set all three for full backward-compatibility.
    req.user = decoded;
    req.userId = decoded.uid;
    req.userEmail = decoded.email || null;
    req.userRole = decoded.userType || null;

    next();
  } catch (error) {
    if (isDevelopment) console.error("Auth verify failed:", error.message);
    return res.status(401).json({ message: "جلسة الدخول غير صالحة. يرجى تسجيل الدخول مرة أخرى." });
  }
}

// Export as both the default function and as a named export.
// - require("./middleware/authMiddleware")          → function (default)
// - require("./middleware/authMiddleware").requireAuth → function (named)
module.exports = requireAuth;
module.exports.requireAuth = requireAuth;
