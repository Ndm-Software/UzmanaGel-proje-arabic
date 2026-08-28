// backend/app.js
// Express application factory.
//
// Steps 3 & 4 of the refactor:
//   - App setup, CORS, body parsers, and all middleware are now imported
//     from config/ and middleware/ instead of being defined inline.
//   - All route mounts are here.
//   - Inline route handlers (listings, users, providers, favorites, OCR, health)
//     stay here and will be extracted in Steps 5-9.
//   - Cron jobs stay here and will move to jobs/index.js in Step 10.
//
// dotenv and app.listen() live in server.js only.

const express = require("express");
const crypto = require("crypto");
const axios = require("axios");
const FormData = require("form-data");

// ── Config ────────────────────────────────────────────────────────────────────
const { admin, db } = require("./config/firebaseAdmin");
const corsMiddleware = require("./config/corsConfig");
const { upload } = require("./config/multerConfig");

// ── Middleware ────────────────────────────────────────────────────────────────
const requireAuth = require("./middleware/authMiddleware");
// requireAdmin is available from middleware/adminMiddleware if needed by future routes.
// adminRoutes.js defines its own inline requireAdmin, so we do not inject it here.
const errorMiddleware = require("./middleware/errorMiddleware");
// maintenanceMiddleware and globalRateLimitMiddleware are extracted but NOT mounted
// (matching current server.js behaviour). Uncomment below to enable them:
// const maintenanceMiddleware = require("./middleware/maintenanceMiddleware");
// const globalRateLimitMiddleware = require("./middleware/rateLimitMiddleware");

// ── Existing route modules (still at root — will move to routes/ in Step 11) ─
const paymentRoutes = require("./routes/paymentRoutes");
const chatRoutes = require("./routes/chatRoutes");
const adminRoutes = require("./routes/adminRoutes");
const accountRoutes = require("./routes/accountRoutes");
const registrationGuardRoutes = require("./routes/registrationGuardRoutes");
const passwordResetGuardRoutes = require("./routes/passwordResetGuardRoutes");
const authCleanupRoutes = require("./routes/authCleanupRoutes");
const listingReportRoutes = require("./routes/listingReportRoutes");
const listingRoutes = require("./routes/listingRoutes");
const userRoutes = require("./routes/userRoutes");
const authRoutes = require("./routes/authRoutes");
const favoriteRoutes = require("./routes/favoriteRoutes");
const ocrRoutes = require("./routes/ocrRoutes");
const providerRoutes = require("./routes/providerRoutes");
const emailVerificationRoutes = require("./routes/emailVerificationRoutes");

// ── Listings store (Step 5 extracted to repositories)

const isDevelopment = process.env.NODE_ENV === "development";

const FieldValue = admin.firestore.FieldValue;

// ── Helper utilities ──────────────────────────────────────────────────────────
// These will be extracted into utils/ and services/ in Steps 5-9.
// ── Express App ───────────────────────────────────────────────────────────────
const app = express();
app.set("etag", false);

if (String(process.env.TRUST_PROXY || "").trim() === "1") {
  app.set("trust proxy", 1);
}

// CORS — iyzico callback bypass is handled inside corsMiddleware
app.use(corsMiddleware);

// Body parsers
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: false }));

// Optional middleware (currently disabled — see server.js history):
// app.use(maintenanceMiddleware);
// app.use(globalRateLimitMiddleware);

// ── Route Mounts ──────────────────────────────────────────────────────────────

if (isDevelopment) console.log("Mounting /api/payments routes...");
app.use("/api/payments", paymentRoutes);

if (isDevelopment) console.log("Mounting /api/chat routes...");
app.use("/api/chat", chatRoutes);

if (isDevelopment) console.log("Mounting /api/listing-reports routes...");
app.use("/api/listing-reports", listingReportRoutes);

if (isDevelopment) console.log("Mounting /api/listings routes...");
app.use("/api/listings", listingRoutes);

if (isDevelopment) console.log("Mounting /api/admin routes...");
app.use("/api/admin", adminRoutes);

if (isDevelopment) console.log("Mounting /api/account routes...");
app.use("/api/account", accountRoutes);

if (isDevelopment) console.log("Mounting /api/registration routes...");
app.use("/api/registration", registrationGuardRoutes);

app.use("/api/account", passwordResetGuardRoutes);
app.use("/api/auth", authCleanupRoutes);

// ── Inline Route Handlers ─────────────────────────────────────────────────────
// These will be extracted into controllers/ in Steps 5-9.
// ⚠️  IMPORTANT: /api/listings/meta, /by-ids, /my-listings MUST be defined
//     BEFORE /api/listings/:id to prevent Express matching them as :id params.

// ── OCR (Step 9 target: ocrController.js) ────────────────────────────────────
if (isDevelopment) console.log("Mounting /api/ocr routes...");
app.use("/api/ocr", ocrRoutes);

if (isDevelopment) console.log("Mounting /api/users routes...");
app.use("/api/users", userRoutes);

if (isDevelopment) console.log("Mounting /api/auth routes...");
app.use("/api/auth", authRoutes);
app.use("/api/auth", emailVerificationRoutes);

if (isDevelopment) console.log("Mounting /api/providers routes...");
app.use("/api/providers", providerRoutes);

// ── Health Route (Step 5 target: healthController.js) ────────────────────────
app.get("/health", async (_req, res) => {
  try {
    await db.collection("_health").doc("status").set(
      {
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    res.json({ ok: true, storage: "firestore" });
  } catch (error) {
    console.error("Health check error:", error);

    res.status(500).json({
      ok: false,
      storage: "firestore",
      error: error.message,
      code: error.code,
    });
  }
});

// ── Favorite Routes (Step 8 target: favoriteController.js) ───────────────────
if (isDevelopment) console.log("Mounting /api/favorites routes...");
app.use("/api/favorites", favoriteRoutes);

// ── Global Error Handler (must be last) ──────────────────────────────────────
app.use(errorMiddleware);

module.exports = app;
