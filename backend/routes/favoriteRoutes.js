// backend/routes/favoriteRoutes.js
// Express routes for favorite operations.
// Extracted from app.js (Step 8).

const express = require("express");
const router = express.Router();

const requireAuth = require("../middleware/authMiddleware");
const favoriteController = require("../controllers/favoriteController");

// Mount these routes to handle `/api/favorites` paths.
// In app.js, this router will be mounted at `/api/favorites`.
router.get("/", requireAuth, favoriteController.getFavorites);
router.post("/:id", requireAuth, favoriteController.addFavorite);
router.delete("/:id", requireAuth, favoriteController.removeFavorite);

module.exports = router;
