// backend/routes/emailVerificationRoutes.js
// Express API endpoints for sending custom HTML verification and password reset emails.

const express = require("express");
const router = express.Router();
const { sendCustomVerificationEmail, sendCustomPasswordResetEmail } = require("../services/mailerService");

/**
 * POST /api/auth/send-verification-email
 * Body: { email, displayName }
 */
router.post("/send-verification-email", async (req, res) => {
  try {
    const { email, displayName } = req.body || {};
    if (!email || typeof email !== "string") {
      return res.status(400).json({ error: "البريد الإلكتروني مطلوب." });
    }

    const result = await sendCustomVerificationEmail({ email: email.trim(), displayName });
    return res.json({ success: true, message: "تم إرسال رابط التفعيل بالبريد الإلكتروني بنجاح.", ...result });
  } catch (error) {
    console.error("Error in /send-verification-email:", error);
    return res.status(500).json({ error: "تعذر إرسال بريد التفعيل." });
  }
});

/**
 * POST /api/auth/send-password-reset-email
 * Body: { email, displayName }
 */
router.post("/send-password-reset-email", async (req, res) => {
  try {
    const { email, displayName } = req.body || {};
    if (!email || typeof email !== "string") {
      return res.status(400).json({ error: "البريد الإلكتروني مطلوب." });
    }

    const result = await sendCustomPasswordResetEmail({ email: email.trim(), displayName });
    return res.json({ success: true, message: "تم إرسال رابط إعادة تعيين كلمة المرور بنجاح.", ...result });
  } catch (error) {
    console.error("Error in /send-password-reset-email:", error);
    return res.status(500).json({ error: "تعذر إرسال بريد إعادة تعيين كلمة المرور." });
  }
});

module.exports = router;
