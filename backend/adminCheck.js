// backend/adminCheck.js
// COMPATIBILITY BRIDGE — do not delete until all require() calls are updated.
// The canonical implementation is now in middleware/adminMiddleware.js.
//
// Files that still require("./adminCheck"):
//   (none currently — adminRoutes.js has its own inline requireAdmin)
//
// This bridge is kept for safety in case any future code references it.
// Will be removed in Step 11.

module.exports = require("./middleware/adminMiddleware");