// backend/controllers/favoriteController.js

const { admin, db } = require("../config/firebaseAdmin");

const FieldValue = admin.firestore.FieldValue;

const {
  favoritesDocRef,
  normalizeFavoritesData,
} = require("../repositories/favoriteRepository");

const isDevelopment = process.env.NODE_ENV === "development";

const LISTINGS_COLLECTION = "userFavorites";
const ACTIVE_STATUS = "ACTIVE";

function normalizeListingStatus(status) {
  // نحافظ على توافق الإعلانات القديمة التي لا تحتوي على status
  return String(status || ACTIVE_STATUS).trim().toUpperCase();
}

/**
 * ترجع فقط معرّفات الإعلانات الموجودة والنشطة.
 */
async function getActiveListingIds(ids) {
  const uniqueIds = [
    ...new Set(
      ids
        .map((id) => String(id || "").trim())
        .filter(Boolean)
    ),
  ];

  if (uniqueIds.length === 0) {
    return [];
  }

  const activeIds = new Set();
  const chunkSize = 100;

  // تقسيم الطلبات لتجنب إرسال عدد كبير من DocumentReferences دفعة واحدة.
  for (let index = 0; index < uniqueIds.length; index += chunkSize) {
    const currentIds = uniqueIds.slice(index, index + chunkSize);

    const refs = currentIds.map((id) =>
      db.collection(LISTINGS_COLLECTION).doc(id)
    );

    const snapshots = await db.getAll(...refs);

    snapshots.forEach((snapshot) => {
      if (!snapshot.exists) return;

      const listingData = snapshot.data() || {};
      const status = normalizeListingStatus(listingData.status);

      if (status === ACTIVE_STATUS) {
        activeIds.add(snapshot.id);
      }
    });
  }

  // نحافظ على ترتيب المفضلة الأصلي.
  return uniqueIds.filter((id) => activeIds.has(id));
}

exports.getFavorites = async (req, res) => {
  try {
    res.set(
      "Cache-Control",
      "no-store, no-cache, must-revalidate, proxy-revalidate"
    );
    res.set("Pragma", "no-cache");
    res.set("Expires", "0");
    res.set("Surrogate-Control", "no-store");

    const ref = favoritesDocRef(req.userId);
    const snap = await ref.get();

    const data = snap.exists ? snap.data() : {};
    const normalizedFavorites = normalizeFavoritesData(data);

    const favoriteIds = Object.keys(normalizedFavorites);
    const activeFavoriteIds = await getActiveListingIds(favoriteIds);

    /*
     * إزالة الإعلانات المخفية أو المحذوفة أو غير الموجودة
     * من favoritesIds داخل Firestore.
     */
    if (activeFavoriteIds.length !== favoriteIds.length) {
      await ref.set(
        {
          favoritesIds: activeFavoriteIds,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }

    const response = {};

    activeFavoriteIds.forEach((id) => {
      response[id] = true;
    });

    res.json(response);
  } catch (error) {
    if (isDevelopment) {
      console.error("GET /api/favorites failed:", error.message);
    }

    res.status(500).json({
      message: "تعذر تحميل المفضلة.",
    });
  }
};

exports.addFavorite = async (req, res) => {
  const id = String(req.params.id || "").trim();

  if (!id) {
    return res.status(400).json({
      message: "معرف الإعلان مطلوب.",
    });
  }

  try {
    /*
     * لا نسمح بإضافة إعلان مخفي أو محذوف إلى المفضلة،
     * حتى إذا تم إرسال الطلب يدويًا من Postman أو DevTools.
     */
    const listingRef = db.collection(LISTINGS_COLLECTION).doc(id);
    const listingSnapshot = await listingRef.get();

    if (!listingSnapshot.exists) {
      return res.status(404).json({
        code: "LISTING_NOT_FOUND",
        message: "الإعلان غير موجود.",
      });
    }

    const listingData = listingSnapshot.data() || {};
    const listingStatus = normalizeListingStatus(listingData.status);

    if (listingStatus !== ACTIVE_STATUS) {
      return res.status(409).json({
        code: "LISTING_NOT_ACTIVE",
        message: "لا يمكن إضافة إعلان غير منشور إلى المفضلة.",
      });
    }

    const ref = favoritesDocRef(req.userId);

    await ref.set(
      {
        favoritesIds: FieldValue.arrayUnion(id),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return res.status(201).json({
      message: "تمت إضافة الإعلان إلى المفضلة.",
      id,
    });
  } catch (error) {
    if (isDevelopment) {
      console.error("POST /api/favorites/:id failed:", error.message);
    }

    return res.status(500).json({
      message: "تعذر إضافة الإعلان إلى المفضلة.",
    });
  }
};

exports.removeFavorite = async (req, res) => {
  const id = String(req.params.id || "").trim();

  if (!id) {
    return res.status(400).json({
      message: "معرف الإعلان مطلوب.",
    });
  }

  try {
    const ref = favoritesDocRef(req.userId);

    await ref.set(
      {
        favoritesIds: FieldValue.arrayRemove(id),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return res.json({
      message: "تمت إزالة الإعلان من المفضلة.",
      id,
    });
  } catch (error) {
    if (isDevelopment) {
      console.error("DELETE /api/favorites/:id failed:", error.message);
    }

    return res.status(500).json({
      message: "تعذر إزالة الإعلان من المفضلة.",
    });
  }
};