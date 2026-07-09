// backend/controllers/userController.js
// Express route handlers for user and auth role operations.
// Extracted from app.js (Step 6).

const { admin, db } = require("../config/firebaseAdmin");
const FieldValue = admin.firestore.FieldValue;
const { normalizeTrPhoneToE164 } = require("../utils/phoneUtils");

const isDevelopment = process.env.NODE_ENV === "development";

exports.getMe = async (req, res) => {
  try {
    const userSnap = await db.collection("users").doc(req.userId).get();

    let authUser = null;

    try {
      authUser = await admin.auth().getUser(req.userId);
    } catch (error) {
      if (isDevelopment) {
        console.error("Firebase Auth user lookup failed:", error.message);
      }
    }

    if (!userSnap.exists) {
      return res.status(404).json({
        message: "Token geçerli ama Firestore users koleksiyonunda kullanıcı bulunamadı.",
        authUser: {
          uid: req.userId,
          email: req.userEmail,
          displayName: authUser?.displayName || null,
          phoneNumber: authUser?.phoneNumber || null,
          photoURL: authUser?.photoURL || null,
        },
        firestoreUser: null,
      });
    }

    return res.json({
      message: "Kullanıcı başarıyla getirildi.",
      authUser: {
        uid: req.userId,
        email: req.userEmail,
        displayName: authUser?.displayName || null,
        phoneNumber: authUser?.phoneNumber || null,
        photoURL: authUser?.photoURL || null,
      },
      firestoreUser: {
        id: userSnap.id,
        ...userSnap.data(),
      },
    });
  } catch (error) {
    if (isDevelopment) {
      console.error("GET /api/users/me failed:", error.message);
    }

    return res.status(500).json({
      message: "Kullanıcı bilgileri alınırken hata oluştu.",
    });
  }
};

exports.getRole = async (req, res) => {
  try {
    const userSnap = await db.collection("users").doc(req.userId).get();

    if (!userSnap.exists) {
      return res.json({ role: "user" });
    }

    const userData = userSnap.data() || {};

    if (userData.userType === "PROVIDER") {
      return res.json({ role: "provider" });
    }

    if (userData.userType === "PENDING_PROVIDER") {
      return res.json({ role: "pending_provider" });
    }

    return res.json({ role: "user" });
  } catch (error) {
    if (isDevelopment) console.error("GET /api/auth/role failed:", error.message);
    return res.status(500).json({ message: "Failed to detect user role." });
  }
};

exports.updateDisplayName = async (req, res) => {
  try {
    const firstName = String(req.body?.firstName || "").trim();
    const lastName = String(req.body?.lastName || "").trim();

    if (!firstName || !lastName) {
      return res.status(400).json({ message: "Ad ve soyad zorunludur." });
    }

    if (firstName.length < 2 || lastName.length < 2) {
      return res.status(400).json({
        message: "Ad ve soyad en az 2 karakter olmalıdır.",
      });
    }

    if (firstName.length > 50 || lastName.length > 50) {
      return res.status(400).json({
        message: "Ad ve soyad en fazla 50 karakter olmalıdır.",
      });
    }

    const displayName = `${firstName} ${lastName}`.replace(/\s+/g, " ").trim();

    if (displayName.length > 80) {
      return res.status(400).json({
        message: "Ad soyad toplamda en fazla 80 karakter olmalıdır.",
      });
    }

    await admin.auth().updateUser(req.userId, { displayName });

    await db.collection("users").doc(req.userId).set(
      {
        displayName,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return res.json({ displayName });
  } catch (error) {
    const code = error?.code || null;
    const rawMessage = error?.message || String(error || "");

    if (isDevelopment) {
      console.error("PATCH /api/users/me/display-name failed:", {
        code,
        message: rawMessage,
      });
    }

    const message =
      process.env.NODE_ENV === "production"
        ? "Ad soyad güncellenemedi."
        : rawMessage || "Ad soyad güncellenemedi.";

    return res.status(500).json({ message, code });
  }
};

exports.updatePhone = async (req, res) => {
  try {
    const raw = req.body?.phoneNumber ?? req.body?.phone ?? "";
    const phoneNumber = normalizeTrPhoneToE164(raw);

    if (!phoneNumber) {
      return res.status(400).json({
        message: "Telefon numarası 5xx xxx xx xx formatında olmalıdır.",
      });
    }

    await admin.auth().updateUser(req.userId, { phoneNumber });

    await db.collection("users").doc(req.userId).set(
      {
        phoneNumber,
        isPhoneVerified: false,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return res.json({ phoneNumber });
  } catch (error) {
    const code = error?.code || null;
    const rawMessage = error?.message || String(error || "");

    if (isDevelopment) {
      console.error("PATCH /api/users/me/phone failed:", {
        code,
        message: rawMessage,
      });
    }

    if (code === "auth/phone-number-already-exists") {
      return res.status(409).json({
        message: "Bu telefon numarası başka bir hesapta kullanılıyor.",
        code,
      });
    }

    if (code === "auth/invalid-phone-number" || code === "auth/invalid-argument") {
      return res.status(400).json({
        message: "Telefon numarası geçersiz.",
        code,
      });
    }

    if (code === "auth/operation-not-allowed") {
      return res.status(400).json({
        message: "Telefon doğrulama bu projede aktif değil.",
        code,
      });
    }

    const message =
      process.env.NODE_ENV === "production"
        ? "Telefon güncellenemedi."
        : rawMessage || "Telefon güncellenemedi.";

    return res.status(500).json({ message, code });
  }
};
