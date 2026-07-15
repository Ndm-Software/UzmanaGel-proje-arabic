// backend/middleware/adminMiddleware.js
// Admin auth + role check middleware.
//
// This file merges:
//   - adminCheck.js (root) — standalone requireAdmin that verifies token itself
//   - requireAdmin() defined in server.js — lighter check that assumed req.userId
//     was already set by requireAuth (never actually mounted on any live route)
//
// The standalone version from adminCheck.js is used here because adminRoutes.js
// calls requireAuth first (its own inline one), then requireAdmin, so we keep
// the pattern: requireAdmin checks req.userId if present, otherwise does a full
// standalone auth verify.
//
// The root adminCheck.js is now a compatibility bridge that re-exports this module.

const { admin, db } = require("../config/firebaseAdmin");

const isDevelopment = process.env.NODE_ENV === "development";

/**
 * isAdmin(userId) → boolean
 * Quick Firestore look-up — checks userType === "ADMIN".
 */
async function isAdmin(userId) {
  try {
    const userDoc = await db.collection("users").doc(userId).get();
    if (!userDoc.exists) return false;
    return userDoc.data().userType === "ADMIN";
  } catch (error) {
    if (isDevelopment) console.error("Admin check error:", error.message);
    return false;
  }
}

/**
 * requireAdmin(req, res, next)
 *
 * Standalone admin middleware — verifies token AND checks admin role.
 * Designed to be used AFTER requireAuth (reads req.userId if available)
 * but also works standalone.
 * Sets req.userId, req.user, and req.userRole on success.
 */
async function requireAdmin(req, res, next) {
  try {
    // If requireAuth already ran, req.userId is set. Otherwise do a full verify.
    let userId = req.userId || null;

    if (!userId) {
      const authHeader = req.header("authorization") || "";
      const token = authHeader.startsWith("Bearer ")
        ? authHeader.slice("Bearer ".length)
        : "";

      if (!token) {
        return res
          .status(401)
          .json({ message: "Unauthorized: No token provided" });
      }

      const decoded = await admin.auth().verifyIdToken(token);
      userId = decoded.uid;
      req.user = decoded;
    }

    if (!userId) {
      return res
        .status(401)
        .json({ message: "Unauthorized: User not found" });
    }

    const claims = req.user || {};
    if (claims.admin === true || claims.role === "ADMIN" || claims.userType === "ADMIN") {
      req.userId = userId;
      req.userRole = "ADMIN";
      return next();
    }
    const userDoc = await db.collection("users").doc(userId).get();

    if (!userDoc.exists) {
      return res
        .status(403)
        .json({ message: "Forbidden: User not found in database" });
    }

    const userType = userData.userType;
    if (userType === "ADMIN") {
      req.userId = userId;
      req.userRole = "ADMIN";
      return next();
    }

    return res.status(403).json({
      message: "Forbidden: Admin access required",
      userType,
    });
  } catch (error) {
    if (isDevelopment) console.error("Admin middleware error:", error.message);
    return res.status(500).json({ message: "Internal server error" });
  }
}

module.exports = { isAdmin, requireAdmin };
