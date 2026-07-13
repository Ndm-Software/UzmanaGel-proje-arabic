// backend/routes/userRoutes.js
// Express routes for users and auth roles.
// Extracted from app.js (Step 6).

const express = require("express");
const router = express.Router();

const requireAuth = require("../middleware/authMiddleware");
const userController = require("../controllers/userController");

// Mount these routes to handle `/api/users/me` paths.
// In app.js, this router will be mounted at `/api/users`.
router.get("/me", requireAuth, userController.getMe);
router.patch("/me/display-name", requireAuth, userController.updateDisplayName);
router.patch("/me/phone", requireAuth, userController.updatePhone);

// NOTE: To satisfy the exact `/api/auth/role` requirement without creating
// duplicate or incorrect paths (like /api/users/api/auth/role), we will
// directly mount `userController.getRole` to `/api/auth/role` inside app.js.

module.exports = router;
