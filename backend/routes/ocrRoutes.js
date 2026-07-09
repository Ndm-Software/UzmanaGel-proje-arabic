// backend/routes/ocrRoutes.js
// Express routes for OCR operations.
// Extracted from app.js (Step 9).

const express = require("express");
const router = express.Router();

const requireAuth = require("../middleware/authMiddleware");
const { upload } = require("../config/multerConfig");
const ocrController = require("../controllers/ocrController");

// Mount these routes to handle `/api/ocr` paths.
// In app.js, this router will be mounted at `/api/ocr`.

router.post("/analyze", requireAuth, upload.single("file"), ocrController.analyzeSingle);

router.post(
  "/analyze-batch",
  requireAuth,
  upload.fields([
    { name: "identity", maxCount: 1 },
    { name: "certificates", maxCount: 10 },
    { name: "taxPlate", maxCount: 1 },
  ]),
  ocrController.analyzeBatch
);

module.exports = router;
