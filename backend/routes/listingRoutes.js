// backend/routes/listingRoutes.js
// Express routes for listings.
// Extracted from app.js (Step 5).

const express = require("express");
const router = express.Router();

const requireAuth = require("../middleware/authMiddleware");
const listingController = require("../controllers/listingController");

// ⚠️ IMPORTANT: Specific sub-paths MUST come before /:id
// to avoid matching as parameters.

router.get("/meta", listingController.getListingsMeta);
router.get("/by-ids", listingController.getListingsByIds);
router.get("/my-listings", requireAuth, listingController.getMyListings);

router.get("/", listingController.getListings);
router.post("/", requireAuth, listingController.createListing);

router.get("/:id", listingController.getListingById);
router.patch("/:id/status", requireAuth, listingController.updateListingStatus);
router.put("/:id", requireAuth, listingController.updateListing);
router.delete("/:id", requireAuth, listingController.deleteListing);

module.exports = router;
