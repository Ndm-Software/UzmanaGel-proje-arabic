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
      return res.status(400).json({ message: "Geçersiz ilan bilgisi." });
    }
    if (!Array.isArray(reasons) || reasons.length === 0) {
      return res.status(400).json({ message: "En az bir bildirim nedeni seçin." });
    }

    const filtered = [...new Set(reasons.map((r) => String(r)))].filter((r) =>
      ALLOWED_REASONS.has(r)
    );
    if (filtered.length === 0) {
      return res.status(400).json({ message: "Geçersiz bildirim nedeni." });
    }

    const hasOther = filtered.includes("other");
    const desc = typeof description === "string" ? description.trim() : "";
    if (hasOther && desc.length < 5) {
      return res.status(400).json({
        message: "“Diğer” için en az 5 karakterlik açıklama gerekli.",
      });
    }
    if (desc.length > 2000) {
      return res.status(400).json({ message: "Açıklama en fazla 2000 karakter olabilir." });
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
    return res.status(500).json({ message: "Kayıt sırasında sunucu hatası oluştu." });
  }
});

module.exports = router;
