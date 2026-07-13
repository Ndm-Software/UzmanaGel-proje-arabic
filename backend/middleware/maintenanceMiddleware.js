// backend/middleware/maintenanceMiddleware.js
// Maintenance mode + registration status checks.
// Extracted from server.js (lines 183-230).
//
// NOTE: This middleware is defined but NOT mounted on the app yet —
// matching the current state of server.js where it was also not mounted.
// To enable maintenance mode, add app.use(maintenanceMiddleware) in app.js.

const { db } = require("../config/firebaseAdmin");

const isDevelopment = process.env.NODE_ENV === "development";

/**
 * Reads the maintenanceMode flag from admin_settings/site.
 * Returns false on any error so the site stays up if Firestore is unreachable.
 */
async function getMaintenanceMode() {
  try {
    const settingsRef = db.collection("admin_settings").doc("site");
    const settingsSnap = await settingsRef.get();
    if (settingsSnap.exists) {
      return settingsSnap.data().maintenanceMode === true;
    }
    return false;
  } catch (error) {
    if (isDevelopment)
      console.error("Bakım modu kontrol hatası:", error.message);
    return false;
  }
}

/**
 * Reads the registrationsOpen flag from admin_settings/site.
 * Defaults to true (open) on any error.
 */
async function getRegistrationsOpen() {
  try {
    const settingsRef = db.collection("admin_settings").doc("site");
    const settingsSnap = await settingsRef.get();
    if (settingsSnap.exists) {
      return settingsSnap.data().registrationsOpen !== false; // default true
    }
    return true;
  } catch (error) {
    if (isDevelopment)
      console.error("Kayıt durumu kontrol hatası:", error.message);
    return true;
  }
}

/**
 * maintenanceMiddleware(req, res, next)
 *
 * Returns HTTP 503 with code MAINTENANCE_MODE when maintenance is active.
 * Always allows /health and /api/payments/iyzico/callback through.
 *
 * USAGE (when ready to enable):
 *   app.use(maintenanceMiddleware);   // add to app.js AFTER CORS, BEFORE routes
 */
async function maintenanceMiddleware(req, res, next) {
  const publicPaths = ["/health", "/api/payments/iyzico/callback"];
  if (publicPaths.includes(req.path)) {
    return next();
  }

  try {
    const maintenanceMode = await getMaintenanceMode();
    if (maintenanceMode) {
      return res.status(503).json({
        error: "النظام في وضع الصيانة. يرجى المحاولة لاحقاً.",
        code: "MAINTENANCE_MODE",
      });
    }
    next();
  } catch (error) {
    // If the check itself fails, let the request through to avoid a site-wide outage.
    next();
  }
}

module.exports = maintenanceMiddleware;
module.exports.getMaintenanceMode = getMaintenanceMode;
module.exports.getRegistrationsOpen = getRegistrationsOpen;
