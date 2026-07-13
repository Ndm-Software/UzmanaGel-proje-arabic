// backend/routes/authRoutes.js
// Express routes for auth operations (extracted during Step 6).

const express = require("express");
const router = express.Router();

const requireAuth = require("../middleware/authMiddleware");
const userController = require("../controllers/userController");

// Mounted at /api/auth in app.js
router.get("/role", requireAuth, userController.getRole);

module.exports = router;
