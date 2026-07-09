// backend/firebaseAdmin.js
// COMPATIBILITY BRIDGE — do not delete until all require() calls are updated.
// The canonical implementation is now in config/firebaseAdmin.js.
//
// Files that still require("./firebaseAdmin") or require("../firebaseAdmin"):
//   adminRoutes.js, accountRoutes.js, registrationGuardRoutes.js,
//   listingReportRoutes.js, cleanupDeletedAccounts.js,
//   cleanupDeletedConversations.js, resetStaleCustomerConversations.js,
//   passwordResetGuardRoutes.js, authCleanupRoutes.js, listingsStore.js,
//   services/iyzicoService.js
//
// These will be updated to point to config/firebaseAdmin.js in Step 11.

module.exports = require("./config/firebaseAdmin");