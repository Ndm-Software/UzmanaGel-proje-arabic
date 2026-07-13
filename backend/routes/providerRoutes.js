// backend/routes/providerRoutes.js
// Express routes for provider operations.
// Extracted from app.js (Step 7).

const express = require("express");
const router = express.Router();

const providerController = require("../controllers/providerController");

// Mount these routes to handle `/api/providers/:id` paths.
// In app.js, this router will be mounted at `/api/providers`.
router.get("/:id", providerController.getProviderById);

module.exports = router;
