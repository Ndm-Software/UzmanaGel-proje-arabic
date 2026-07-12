// passwordrestGuardRoutes.js file code


const express = require("express");
const router = express.Router();
const { db } = require("../config/firebaseAdmin");

const isDevelopment = process.env.NODE_ENV === 'development';

// RATE LIMIT EKLENDI
let resetRequestCount = 0;
let resetLastResetTime = Date.now();
const RESET_RATE_LIMIT_MAX = 5;
const RESET_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;

function checkResetRateLimit() {
  const now = Date.now();
  if (now - resetLastResetTime >= RESET_RATE_LIMIT_WINDOW_MS) {
    resetRequestCount = 0;
    resetLastResetTime = now;
  }
  
  if (resetRequestCount >= RESET_RATE_LIMIT_MAX) {
    throw new Error("RATE_LIMIT_EXCEEDED");
  }
  
  resetRequestCount++;
}

function resetRateLimitMiddleware(req, res, next) {
  try {
    checkResetRateLimit();
    next();
  } catch (error) {
    return res.status(429).json({ message: "طلبات كثيرة جداً. يرجى المحاولة لاحقاً." });
  }
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function isDeletedAccountStillReserved(data) {
  if (!data || typeof data !== "object") return false;

  const pendingPermanentDeletion = data.pendingPermanentDeletion === true;
  const restorationRequested = data.restorationRequested === true;

  if (!pendingPermanentDeletion) return false;
  if (restorationRequested) return false;

  const scheduled = data.scheduledPermanentDeletionAt;
  if (!scheduled) return false;

  let scheduledDate = null;

  if (typeof scheduled.toDate === "function") {
    scheduledDate = scheduled.toDate();
  } else {
    scheduledDate = new Date(scheduled);
  }

  if (!(scheduledDate instanceof Date) || Number.isNaN(scheduledDate.getTime())) {
    return false;
  }

  return scheduledDate.getTime() > Date.now();
}

async function findActiveUserByEmail(email) {
  if (!email) return null;

  const snap = await db
    .collection("users")
    .where("email", "==", email)
    .limit(1)
    .get();

  if (snap.empty) return null;

  const docSnap = snap.docs[0];
  return {
    id: docSnap.id,
    data: docSnap.data() || {},
  };
}

async function findReservedDeletedByEmail(email) {
  if (!email) return null;

  const snap = await db
    .collection("deleted_accounts")
    .where("userData.email", "==", email)
    .get();

  if (snap.empty) return null;

  for (const docSnap of snap.docs) {
    const data = docSnap.data() || {};
    if (isDeletedAccountStillReserved(data)) {
      return {
        id: docSnap.id,
        data,
      };
    }
  }

  return null;
}

router.post("/check-password-reset-eligibility", resetRateLimitMiddleware, async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);

    if (!email) {
      return res.status(400).json({
        allowed: false,
        code: "INVALID_EMAIL",
        message: "يرجى إدخال بريد إلكتروني صالح.",
      });
    }

    const deletedConflict = await findReservedDeletedByEmail(email);
    if (deletedConflict) {
      return res.json({
        allowed: false,
        code: "DELETED_ACCOUNT_IN_RETENTION",
        message:
          "إذا كان هذا البريد الإلكتروني مرتبطاً بحساب نشط، فسيتم إرسال رابط إعادة تعيين كلمة المرور.",
      });
    }

    const activeUser = await findActiveUserByEmail(email);
    if (!activeUser) {
      return res.json({
        allowed: false,
        code: "ACTIVE_ACCOUNT_NOT_FOUND_IN_USERS",
        message:
          "إذا كان هذا البريد الإلكتروني مرتبطاً بحساب نشط، فسيتم إرسال رابط إعادة تعيين كلمة المرور.",
      });
    }

    return res.json({
      allowed: true,
      code: "RESET_ALLOWED",
      message:
        "إذا كان هذا البريد الإلكتروني مرتبطاً بحساب نشط، فسيتم إرسال رابط إعادة تعيين كلمة المرور.",
    });
  } catch (error) {
    if (isDevelopment) console.error(
      "POST /api/account/check-password-reset-eligibility failed:",
      error?.message || error
    );

    return res.status(500).json({
      allowed: false,
      code: "PASSWORD_RESET_ELIGIBILITY_FAILED",
      message: "حدث خطأ أثناء التحقق من إمكانية إعادة تعيين كلمة المرور.",
    });
  }
});

module.exports = router;
