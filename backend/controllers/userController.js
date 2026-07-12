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
        message: "الرمز صالح لكن لم يتم العثور على المستخدم في قاعدة البيانات.",
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
      message: "تم جلب بيانات المستخدم بنجاح.",
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
      message: "حدث خطأ أثناء جلب بيانات المستخدم.",
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
    return res.status(500).json({ message: "تعذر تحديد دور المستخدم." });
  }
};

exports.updateDisplayName = async (req, res) => {
  try {
    const firstName = String(req.body?.firstName || "").trim();
    const lastName = String(req.body?.lastName || "").trim();

    if (!firstName || !lastName) {
      return res.status(400).json({ message: "الاسم والكنية مطلوبان." });
    }

    if (firstName.length < 2 || lastName.length < 2) {
      return res.status(400).json({
        message: "يجب أن يتكون الاسم والكنية من حرفين على الأقل.",
      });
    }

    if (firstName.length > 50 || lastName.length > 50) {
      return res.status(400).json({
        message: "يجب ألا يتجاوز الاسم والكنية 50 حرفاً.",
      });
    }

    const displayName = `${firstName} ${lastName}`.replace(/\s+/g, " ").trim();

    if (displayName.length > 80) {
      return res.status(400).json({
        message: "يجب ألا يتجاوز الاسم الكامل 80 حرفاً.",
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
        ? "تعذر تحديث الاسم الكامل."
        : rawMessage || "تعذر تحديث الاسم الكامل.";

    return res.status(500).json({ message, code });
  }
};

exports.updatePhone = async (req, res) => {
  try {
    const raw = req.body?.phoneNumber ?? req.body?.phone ?? "";
    const phoneNumber = normalizeTrPhoneToE164(raw);

    if (!phoneNumber) {
      return res.status(400).json({
        message: "يجب أن يكون رقم الهاتف بصيغة صحيحة.",
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
        message: "رقم الهاتف هذا مستخدم في حساب آخر.",
        code,
      });
    }

    if (code === "auth/invalid-phone-number" || code === "auth/invalid-argument") {
      return res.status(400).json({
        message: "رقم الهاتف غير صالح.",
        code,
      });
    }

    if (code === "auth/operation-not-allowed") {
      return res.status(400).json({
        message: "التحقق من الهاتف غير مفعل في هذا المشروع.",
        code,
      });
    }

    const message =
      process.env.NODE_ENV === "production"
        ? "تعذر تحديث رقم الهاتف."
        : rawMessage || "تعذر تحديث رقم الهاتف.";

    return res.status(500).json({ message, code });
  }
};
