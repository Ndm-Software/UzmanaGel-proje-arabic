// accountRoutes.js file code 

const express = require("express");
const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");
const { admin, db } = require("../config/firebaseAdmin");

const isDevelopment = process.env.NODE_ENV === 'development';

const FieldValue = admin.firestore.FieldValue;

// RATE LIMIT EKLENDI
let accountRequestCount = 0;
let accountLastResetTime = Date.now();
const ACCOUNT_RATE_LIMIT_MAX = 10;
const ACCOUNT_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;

function checkAccountRateLimit() {
  const now = Date.now();
  if (now - accountLastResetTime >= ACCOUNT_RATE_LIMIT_WINDOW_MS) {
    accountRequestCount = 0;
    accountLastResetTime = now;
  }
  
  if (accountRequestCount >= ACCOUNT_RATE_LIMIT_MAX) {
    throw new Error("RATE_LIMIT_EXCEEDED");
  }
  
  accountRequestCount++;
}

function accountRateLimitMiddleware(req, res, next) {
  try {
    checkAccountRateLimit();
    next();
  } catch (error) {
    return res.status(429).json({ message: "Too many requests. Please try again later." });
  }
}

function buildAuthSnapshot(authUser) {
  if (!authUser) return null;

  return {
    uid: authUser.uid,
    email: authUser.email || null,
    displayName: authUser.displayName || null,
    phoneNumber: authUser.phoneNumber || null,
    disabled: !!authUser.disabled,
    providerData: Array.isArray(authUser.providerData)
      ? authUser.providerData.map((item) => ({
          uid: item.uid || null,
          displayName: item.displayName || null,
          email: item.email || null,
          phoneNumber: item.phoneNumber || null,
          photoURL: item.photoURL || null,
          providerId: item.providerId || null,
        }))
      : [],
    metadata: {
      creationTime: authUser.metadata?.creationTime || null,
      lastSignInTime: authUser.metadata?.lastSignInTime || null,
    },
  };
}

async function getAuthUserSafely(uid, label) {
  try {
    return await admin.auth().getUser(uid);
  } catch (error) {
    if (error?.code !== "auth/user-not-found") {
      if (isDevelopment) console.warn(`${label} auth lookup failed:`, error?.message || error);
    }
    return null;
  }
}

async function disableAuthUserAndMarkDeletedRef(uid, deletedRef, label) {
  try {
    await admin.auth().updateUser(uid, { disabled: true });

    const disabledAuthUser = await getAuthUserSafely(uid, `${label} post-disable`);

    await deletedRef.set(
      {
        authDeleted: false,
        authDisabled: true,
        authDisabledAt: FieldValue.serverTimestamp(),
        authDeleteError: FieldValue.delete(),
        authDisableError: FieldValue.delete(),
        authSnapshot: buildAuthSnapshot(disabledAuthUser),
      },
      { merge: true }
    );
  } catch (authError) {
    if (isDevelopment) console.error(`${label} auth disable failed:`, authError?.message || authError);

    await deletedRef.set(
      {
        authDeleted: false,
        authDisabled: false,
        authDisableError: authError?.message || String(authError),
      },
      { merge: true }
    );

    throw new Error("AUTH_DISABLE_FAILED");
  }
}

router.post("/delete-provider", authMiddleware, accountRateLimitMiddleware, async (req, res) => {
  const uid = String(req.user?.uid || "").trim();

  if (!uid) {
    return res.status(401).json({ message: "Unauthorized." });
  }

  try {
    const userRef = db.collection("users").doc(uid);
    const providerRef = db.collection("service_providers").doc(uid);
    const deletedRef = db.collection("deleted_accounts").doc(uid);

    const [userSnap, providerSnap] = await Promise.all([
      userRef.get(),
      providerRef.get(),
    ]);

    if (!userSnap.exists) {
      return res.status(404).json({ message: "Kullanıcı verisi bulunamadı." });
    }

    const userData = userSnap.data() || {};
    const providerData = providerSnap.exists ? providerSnap.data() || {} : {};

    if (userData.userType !== "PROVIDER") {
      return res.status(403).json({
        message: "Bu işlem sadece provider hesaplar için geçerlidir.",
      });
    }

    const listingsSnap = await db
      .collection("services")
      .where("providerId", "==", uid)
      .get();

    const providerListings = listingsSnap.docs.map((docSnap) => ({
      id: docSnap.id,
      ...docSnap.data(),
    }));

    const authUser = await getAuthUserSafely(uid, "Provider");

    const deletedAccountPayload = {
      uid,
      userType: "PROVIDER",
      deleteSource: "self-service-provider-panel",
      deletedAt: FieldValue.serverTimestamp(),
      deletedBy: uid,

      retentionDays: 60,
      pendingPermanentDeletion: true,
      restorationRequested: false,
      scheduledPermanentDeletionAt: new Date(
        Date.now() + 60 * 24 * 60 * 60 * 1000
      ),

      reservedEmail: userData.email || authUser?.email || null,
      reservedPhoneNumber: userData.phoneNumber || authUser?.phoneNumber || null,

      listingsCount: providerListings.length,
      userData,
      providerData,
      deletedListings: providerListings,
      authSnapshot: buildAuthSnapshot(authUser),
    };

    await deletedRef.set(deletedAccountPayload, { merge: true });

    const batch = db.batch();

    for (const docSnap of listingsSnap.docs) {
      batch.delete(docSnap.ref);
    }

    batch.delete(providerRef);
    batch.delete(userRef);

    await batch.commit();

    // Do not delete listing images here.
    // Provider account can still be restored within 60 days.
    // Storage cleanup must happen only after the retention period expires.

    try {
      await disableAuthUserAndMarkDeletedRef(uid, deletedRef, "Provider");
    } catch (error) {
      return res.status(500).json({
        message: "Veriler taşındı ancak auth hesabı devre dışı bırakılamadı.",
      });
    }

    return res.json({
      success: true,
      message: "Provider hesabı başarıyla devre dışı bırakıldı.",
      deletedListingsCount: providerListings.length,
    });
  } catch (error) {
    if (isDevelopment) console.error("POST /api/account/delete-provider failed:", error?.message || error);
    return res.status(500).json({
      message: "Provider hesabı devre dışı bırakılırken bir hata oluştu.",
    });
  }
});

router.post("/delete-client", authMiddleware, accountRateLimitMiddleware, async (req, res) => {
  const uid = String(req.user?.uid || "").trim();

  if (!uid) {
    return res.status(401).json({ message: "Unauthorized." });
  }

  try {
    const userRef = db.collection("users").doc(uid);
    const deletedRef = db.collection("deleted_accounts").doc(uid);

    const userSnap = await userRef.get();

    if (!userSnap.exists) {
      return res.status(404).json({ message: "Kullanıcı verisi bulunamadı." });
    }

    const userData = userSnap.data() || {};

    if (userData.userType === "PROVIDER") {
      return res.status(403).json({
        message: "Provider hesaplar bu endpoint üzerinden devre dışı bırakılamaz.",
      });
    }

    const authUser = await getAuthUserSafely(uid, "Client");

    const deletedAccountPayload = {
      uid,
      userType: "CLIENT",
      deleteSource: "self-service-client-panel",
      deletedAt: FieldValue.serverTimestamp(),
      deletedBy: uid,

      retentionDays: 60,
      pendingPermanentDeletion: true,
      restorationRequested: false,
      scheduledPermanentDeletionAt: new Date(
        Date.now() + 60 * 24 * 60 * 60 * 1000
      ),

      reservedEmail: userData.email || authUser?.email || null,
      reservedPhoneNumber: userData.phoneNumber || authUser?.phoneNumber || null,

      listingsCount: 0,
      userData,
      providerData: null,
      deletedListings: [],
      authSnapshot: buildAuthSnapshot(authUser),
    };

    await deletedRef.set(deletedAccountPayload, { merge: true });

    const batch = db.batch();
    batch.delete(userRef);
    await batch.commit();

    try {
      await disableAuthUserAndMarkDeletedRef(uid, deletedRef, "Client");
    } catch (error) {
      return res.status(500).json({
        message: "Veriler taşındı ancak auth hesabı devre dışı bırakılamadı.",
      });
    }

    return res.json({
      success: true,
      message: "Kullanıcı hesabı başarıyla devre dışı bırakıldı.",
      deletedListingsCount: 0,
    });
  } catch (error) {
    if (isDevelopment) console.error("POST /api/account/delete-client failed:", error?.message || error);
    return res.status(500).json({
      message: "Kullanıcı hesabı devre dışı bırakılırken bir hata oluştu.",
    });
  }
});

module.exports = router;