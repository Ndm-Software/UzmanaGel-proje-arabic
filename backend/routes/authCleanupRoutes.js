const express = require("express");
const router = express.Router();
const { admin, db } = require("../config/firebaseAdmin");

const isDevelopment = process.env.NODE_ENV === 'development';

// RATE LIMIT EKLENDI
let cleanupRequestCount = 0;
let cleanupLastResetTime = Date.now();
const CLEANUP_RATE_LIMIT_MAX = 5;
const CLEANUP_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;

function checkCleanupRateLimit() {
  const now = Date.now();
  if (now - cleanupLastResetTime >= CLEANUP_RATE_LIMIT_WINDOW_MS) {
    cleanupRequestCount = 0;
    cleanupLastResetTime = now;
  }
  
  if (cleanupRequestCount >= CLEANUP_RATE_LIMIT_MAX) {
    throw new Error("RATE_LIMIT_EXCEEDED");
  }
  
  cleanupRequestCount++;
}

function cleanupRateLimitMiddleware(req, res, next) {
  try {
    checkCleanupRateLimit();
    next();
  } catch (error) {
    return res.status(429).json({ message: "Too many requests. Please try again later." });
  }
}

async function verifyAuthTokenFromHeader(req) {
  const authHeader = req.headers.authorization || "";
  if (!authHeader.startsWith("Bearer ")) {
    throw new Error("AUTH_HEADER_MISSING");
  }

  const idToken = authHeader.slice("Bearer ".length).trim();
  if (!idToken) {
    throw new Error("ID_TOKEN_MISSING");
  }

  return await admin.auth().verifyIdToken(idToken);
}

router.post("/cleanup-blocked-google-user", cleanupRateLimitMiddleware, async (req, res) => {
  try {
    const decoded = await verifyAuthTokenFromHeader(req);
    const uid = decoded.uid;
    const emailFromToken = String(decoded.email || "").trim().toLowerCase();
    const requestedEmail = String(req.body?.email || "").trim().toLowerCase();

    // INPUT VALIDATION EKLENDI
    if (!uid || typeof uid !== "string" || uid.length > 128) {
      return res.status(400).json({
        success: false,
        code: "UID_INVALID",
        message: "Geçersiz kullanıcı kimliği.",
      });
    }

    if (requestedEmail && emailFromToken && requestedEmail !== emailFromToken) {
      return res.status(400).json({
        success: false,
        code: "EMAIL_MISMATCH",
        message: "E-posta doğrulaması başarısız oldu.",
      });
    }

    const userRecord = await admin.auth().getUser(uid);
    const providerIds = Array.isArray(userRecord.providerData)
      ? userRecord.providerData.map((p) => p.providerId).filter(Boolean)
      : [];

    if (!providerIds.includes("google.com")) {
      return res.json({
        success: true,
        deletedAuthUser: false,
        deletedFirestoreUser: false,
        message: "Google sağlayıcılı geçici kullanıcı bulunamadı.",
      });
    }

    await admin.auth().deleteUser(uid);

    let deletedFirestoreUser = false;
    const userDocRef = db.collection("users").doc(uid);
    const userDocSnap = await userDocRef.get();

    if (userDocSnap.exists) {
      const userData = userDocSnap.data() || {};
      const firestoreEmail = String(userData.email || "").trim().toLowerCase();
      const authProvider = String(userData.authProvider || "").trim().toLowerCase();

      if (
        firestoreEmail === emailFromToken &&
        authProvider === "google"
      ) {
        await userDocRef.delete();
        deletedFirestoreUser = true;
      }
    }

    return res.json({
      success: true,
      deletedAuthUser: true,
      deletedFirestoreUser,
      message: "Engellenen geçici Google kullanıcısı temizlendi.",
    });
  } catch (error) {
    if (isDevelopment) console.error("POST /api/auth/cleanup-blocked-google-user failed:", error?.message || error);

    return res.status(500).json({
      success: false,
      code: "GOOGLE_CLEANUP_FAILED",
      message: "Geçici Google kullanıcısı temizlenemedi.",
    });
  }
});

module.exports = router;