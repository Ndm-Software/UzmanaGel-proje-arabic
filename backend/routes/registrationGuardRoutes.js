// registrationGuardRoutes.js file code

const express = require("express");
const router = express.Router();
const { db } = require("../config/firebaseAdmin");

const {
  normalizeEmail,
  normalizeTrPhoneToE164,
  findReservedDeletedAccountByEmail,
  findReservedDeletedAccountByPhone,
} = require("../middleware/deletedAccountReservationGuard");

const isDevelopment = process.env.NODE_ENV === "development";

// RATE LIMIT EKLENDI
let registrationRequestCount = 0;
let registrationLastResetTime = Date.now();

const REGISTRATION_RATE_LIMIT_MAX = 10;
const REGISTRATION_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;

function checkRegistrationRateLimit() {
  const now = Date.now();

  if (now - registrationLastResetTime >= REGISTRATION_RATE_LIMIT_WINDOW_MS) {
    registrationRequestCount = 0;
    registrationLastResetTime = now;
  }

  if (registrationRequestCount >= REGISTRATION_RATE_LIMIT_MAX) {
    throw new Error("RATE_LIMIT_EXCEEDED");
  }

  registrationRequestCount++;
}

function registrationRateLimitMiddleware(req, res, next) {
  try {
    checkRegistrationRateLimit();
    next();
  } catch (error) {
    return res.status(429).json({
      allowed: false,
      code: "RATE_LIMIT_EXCEEDED",
      message: "Too many requests. Please try again later.",
    });
  }
}

async function findActiveUserConflictByEmail(email) {
  if (!email) return null;

  const snap = await db
    .collection("users")
    .where("email", "==", email)
    .limit(1)
    .get();

  if (snap.empty) return null;

  const docSnap = snap.docs[0];

  return {
    source: "users",
    type: "email",
    id: docSnap.id,
    data: docSnap.data() || {},
  };
}

async function findActiveUserConflictByPhone(phoneNumber) {
  if (!phoneNumber) return null;

  const snap = await db
    .collection("users")
    .where("phoneNumber", "==", phoneNumber)
    .limit(1)
    .get();

  if (snap.empty) return null;

  const docSnap = snap.docs[0];

  return {
    source: "users",
    type: "phone",
    id: docSnap.id,
    data: docSnap.data() || {},
  };
}

/**
 * Google/social login guard
 * يمنع Google login إذا كان نفس الإيميل محجوزًا داخل deleted_accounts خلال فترة 60 يوم.
 */
router.post(
  "/check-social-login-eligibility",
  registrationRateLimitMiddleware,
  async (req, res) => {
    try {
      const email = normalizeEmail(req.body?.email);
      const provider = String(req.body?.provider || "google")
        .trim()
        .toLowerCase();

      if (!email) {
        return res.status(400).json({
          allowed: false,
          field: "email",
          code: "INVALID_EMAIL",
          provider,
          message: "Geçerli bir e-posta adresi gereklidir.",
        });
      }

      const deletedEmailConflict =
        await findReservedDeletedAccountByEmail(email);

      if (deletedEmailConflict) {
        return res.status(409).json({
          allowed: false,
          field: "email",
          code: "DELETED_ACCOUNT_IN_RETENTION",
          provider,
          message:
            "Bu hesap silinmiş durumda ve geri yükleme süresi devam ediyor. Lütfen hesabınızı geri yükleyin veya destek ile iletişime geçin.",
        });
      }

      return res.json({
        allowed: true,
        provider,
        normalized: {
          email,
        },
      });
    } catch (error) {
      if (isDevelopment) {
        console.error(
          "POST /api/registration/check-social-login-eligibility failed:",
          error?.message || error
        );
      }

      return res.status(500).json({
        allowed: false,
        code: "SOCIAL_LOGIN_ELIGIBILITY_FAILED",
        message: "Sosyal giriş uygunluk kontrolü sırasında bir hata oluştu.",
      });
    }
  }
);

/**
 * Email/password login guard
 * يمنع login إذا كان نفس الإيميل موجودًا داخل deleted_accounts خلال فترة 60 يوم.
 */
router.post(
  "/check-login-eligibility",
  registrationRateLimitMiddleware,
  async (req, res) => {
    try {
      const email = normalizeEmail(req.body?.email);

      if (!email) {
        return res.status(400).json({
          allowed: false,
          field: "email",
          code: "INVALID_EMAIL",
          message: "Geçerli bir e-posta adresi gereklidir.",
        });
      }

      const deletedEmailConflict =
        await findReservedDeletedAccountByEmail(email);

      if (deletedEmailConflict) {
        return res.status(409).json({
          allowed: false,
          field: "email",
          code: "DELETED_ACCOUNT_IN_RETENTION",
          message:
            "Bu hesap silinmiş durumda ve 60 günlük geri yükleme süresi devam ediyor.",
        });
      }

      return res.json({
        allowed: true,
        normalized: {
          email,
        },
      });
    } catch (error) {
      if (isDevelopment) {
        console.error(
          "POST /api/registration/check-login-eligibility failed:",
          error?.message || error
        );
      }

      return res.status(500).json({
        allowed: false,
        code: "LOGIN_ELIGIBILITY_FAILED",
        message: "Giriş uygunluğu kontrol edilirken hata oluştu.",
      });
    }
  }
);

/**
 * Registration guard
 * يمنع إنشاء حساب جديد إذا:
 * 1. الإيميل مستخدم في users
 * 2. الهاتف مستخدم في users
 * 3. الإيميل محجوز داخل deleted_accounts خلال 60 يوم
 * 4. الهاتف محجوز داخل deleted_accounts خلال 60 يوم
 */
router.post(
  "/check-registration-eligibility",
  registrationRateLimitMiddleware,
  async (req, res) => {
    try {
      const email = normalizeEmail(req.body?.email);
      const phoneNumber = normalizeTrPhoneToE164(
        req.body?.phoneNumber || req.body?.phone
      );

      if (!email) {
        return res.status(400).json({
          allowed: false,
          field: "email",
          code: "INVALID_EMAIL",
          message: "Geçerli bir e-posta adresi gereklidir.",
        });
      }

      if (!phoneNumber) {
        return res.status(400).json({
          allowed: false,
          field: "phoneNumber",
          code: "INVALID_PHONE_NUMBER",
          message: "Geçerli bir telefon numarası gereklidir.",
        });
      }

      const activeEmailConflict = await findActiveUserConflictByEmail(email);

      if (activeEmailConflict) {
        return res.status(409).json({
          allowed: false,
          field: "email",
          code: "ACTIVE_EMAIL_IN_USE",
          message: "Bu e-posta adresi zaten aktif bir hesapta kullanılıyor.",
        });
      }

      const activePhoneConflict =
        await findActiveUserConflictByPhone(phoneNumber);

      if (activePhoneConflict) {
        return res.status(409).json({
          allowed: false,
          field: "phoneNumber",
          code: "ACTIVE_PHONE_IN_USE",
          message: "Bu telefon numarası zaten aktif bir hesapta kullanılıyor.",
        });
      }

      const deletedEmailConflict =
        await findReservedDeletedAccountByEmail(email);

      if (deletedEmailConflict) {
        return res.status(409).json({
          allowed: false,
          field: "email",
          code: "DELETED_EMAIL_RESERVED",
          message:
            "Bu e-posta, silinmiş ancak geri yükleme süresi devam eden bir hesaba aittir.",
        });
      }

      const deletedPhoneConflict =
        await findReservedDeletedAccountByPhone(phoneNumber);

      if (deletedPhoneConflict) {
        return res.status(409).json({
          allowed: false,
          field: "phoneNumber",
          code: "DELETED_PHONE_RESERVED",
          message:
            "Bu telefon numarası, silinmiş ancak geri yükleme süresi devam eden bir hesaba aittir.",
        });
      }

      return res.json({
        allowed: true,
        normalized: {
          email,
          phoneNumber,
        },
      });
    } catch (error) {
      if (isDevelopment) {
        console.error(
          "POST /api/registration/check-registration-eligibility failed:",
          error?.message || error
        );
      }

      return res.status(500).json({
        allowed: false,
        code: "REGISTRATION_ELIGIBILITY_FAILED",
        message: "Kayıt uygunluk kontrolü sırasında bir hata oluştu.",
      });
    }
  }
);

module.exports = router;