// backend/authMiddleware.js
// COMPATIBILITY BRIDGE — do not delete until all require() calls are updated.
// The canonical implementation is now in middleware/authMiddleware.js.
//
// Files that still require("./authMiddleware"):
//   chatRoutes.js, accountRoutes.js, listingReportRoutes.js,
//   passwordResetGuardRoutes.js, authCleanupRoutes.js
//
// Files that require("../authMiddleware") (from inside routes/):
//   routes/paymentRoutes.js
//
// These will be updated to point to middleware/authMiddleware.js in Step 11.

module.exports = require("./middleware/authMiddleware");