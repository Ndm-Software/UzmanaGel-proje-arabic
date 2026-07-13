const express = require("express");
const authMiddleware = require("../middleware/authMiddleware");
const { admin, db } = require("../config/firebaseAdmin");

const router = express.Router();
const isDevelopment = process.env.NODE_ENV === "development";

const ALLOWED_REASONS = new Set(["inappropriate_photo", "inappropriate_name", "other"]);

router.post("/", authMiddleware, async (req, res) => {
  try {
    const { listingId, reasons, description } = req.body || {};
    const uid = req.user.uid;

    if (!listingId || typeof listingId !== "string" || listingId.length > 200) {
      return res.status(400).json({ message: "معلومات الإعلان غير صالحة." });
    }
    if (!Array.isArray(reasons) || reasons.length === 0) {
      return res.status(400).json({ message: "يرجى اختيار سبب واحد على الأقل للبلاغ." });
    }

    const filtered = [...new Set(reasons.map((r) => String(r)))].filter((r) =>
      ALLOWED_REASONS.has(r)
    );
    if (filtered.length === 0) {
      return res.status(400).json({ message: "سبب البلاغ غير صالح." });
    }

    const hasOther = filtered.includes("other");
    const desc = typeof description === "string" ? description.trim() : "";
    if (hasOther && desc.length < 5) {
      return res.status(400).json({
        message: "عند اختيار \"أخرى\" يجب كتابة وصف لا يقل عن 5 أحرف.",
      });
    }
    if (desc.length > 2000) {
      return res.status(400).json({ message: "يمكن أن يكون الوصف 2000 حرف كحد أقصى." });
    }

    const email = req.user.email || null;
    const displayName =
      (typeof req.user.name === "string" && req.user.name.trim()) || null;

    await db.collection("listing_reports").add({
      listingId,
      reasons: filtered,
      reason: filtered[0] || "",
      description: hasOther ? desc : "",
      reporterId: uid,
      reporterEmail: email,
      reporterDisplayName: displayName,
      adminSeen: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return res.status(201).json({ success: true });
  } catch (err) {
    if (isDevelopment) console.error("POST /api/listing-reports:", err);
    return res.status(500).json({ message: "حدث خطأ في الخادم أثناء الحفظ." });
  }
});

module.exports = router;
