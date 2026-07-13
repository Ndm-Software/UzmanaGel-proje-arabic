// backend/controllers/listingController.js
// Express route handlers for listing operations.
// Extracted from app.js (Step 5).
//
// Preserves exact request/response shapes and business logic.

const { admin, db } = require("../config/firebaseAdmin");
const FieldValue = admin.firestore.FieldValue;

const { normalizeImageCropPayload } = require("../utils/imageCropUtils");
const { uploadListingImageFromDataUrl } = require("../services/storageService");

const {
  countActiveProviderListings,
  countActiveProviderListingsInSpecialtyCaseInsensitive,
  listListings,
  getListingById,
  getListingsByIds,
  getListingsMeta,
} = require("../repositories/listingRepository");

const isDevelopment = process.env.NODE_ENV === "development";

exports.getListingsMeta = async (req, res) => {
  try {
    const payload = await getListingsMeta(db);
    res.json(payload);
  } catch (error) {
    if (isDevelopment) {
      console.error("GET /api/listings/meta failed:", error.message);
    }
    res.status(500).json({ message: "تعذر تحميل بيانات الإعلانات." });
  }
};

exports.getListingsByIds = async (req, res) => {
  try {
    const idsRaw = String(req.query.ids || "").trim();

    if (!idsRaw) {
      return res.json({ items: [] });
    }

    const ids = idsRaw
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);

    const items = await getListingsByIds(db, ids);

    res.json({ items });
  } catch (error) {
    if (isDevelopment) {
      console.error("GET /api/listings/by-ids failed:", error.message);
    }
    res.status(500).json({ message: "تعذر تحميل الإعلانات المحددة." });
  }
};

exports.getMyListings = async (req, res) => {
  try {
    const userSnap = await db.collection("users").doc(req.userId).get();

    if (!userSnap.exists) {
      return res.status(403).json({ message: "لم يتم العثور على المستخدم." });
    }

    const userData = userSnap.data() || {};

    if (userData.userType !== "PROVIDER") {
      return res.status(403).json({
        message: "يمكن للخبراء الموافق عليهم فقط عرض إعلاناتهم.",
      });
    }

    const providerSnap = await db
      .collection("service_providers")
      .doc(req.userId)
      .get();

    if (!providerSnap.exists || providerSnap.data()?.isActive !== true) {
      return res.status(403).json({ message: "يجب الموافقة على حساب الخبير أولاً." });
    }

    const snap = await db
      .collection("services")
      .where("providerId", "==", req.userId)
      .get();

    const items = snap.docs
      .map((docSnap) => {
        const data = docSnap.data() || {};

        return {
          id: docSnap.id,
          title: String(data.title || "").trim(),
          category: String(data.category || "").trim(),
          serviceSubcategory: String(data.serviceSubcategory || "").trim(),
          serviceSubcategoryDetails: String(
            data.serviceSubcategoryDetails || ""
          ).trim(),
          city: String(data.city || "").trim(),
          rating: Number(data.rating) || 0,
          reviews: Number(data.reviews) || 0,
          price: Number(data.price) || 0,
          image: data.image || null,
          imageCrop: normalizeImageCropPayload(data.imageCrop),
          expertName: String(data.providerName || "").trim(),
          providerId: data.providerId || null,
          description: String(data.description || "").trim(),
          duration: String(data.duration || "").trim(),
          pricingType: String(data.pricingType || data.duration || "").trim(),
          status: String(data.status || "ACTIVE").trim().toUpperCase(),
          createdAt: data.createdAt || null,
          updatedAt: data.updatedAt || null,
        };
      })
      .sort((a, b) => {
        const aMs = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
        const bMs = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
        return bMs - aMs;
      });

    return res.json({
      items,
      total: items.length,
    });
  } catch (error) {
    if (isDevelopment) {
      console.error("GET /api/listings/my-listings failed:", error.message);
    }
    return res.status(500).json({ message: "تعذر تحميل إعلانات الخبير." });
  }
};

exports.getListings = async (req, res) => {
  try {
    const query = { ...req.query };

    if (query.lat) query.lat = parseFloat(query.lat);
    if (query.lng) query.lng = parseFloat(query.lng);

    const payload = await listListings(db, query);
    res.json(payload);
  } catch (error) {
    if (isDevelopment) console.error("GET /api/listings failed:", error.message);
    res.status(500).json({ message: "تعذر تحميل الإعلانات." });
  }
};

exports.createListing = async (req, res) => {
  try {
    const userSnap = await db.collection("users").doc(req.userId).get();

    if (!userSnap.exists) {
      return res.status(403).json({ message: "لم يتم العثور على المستخدم." });
    }

    const userData = userSnap.data() || {};

    if (userData.userType !== "PROVIDER") {
      return res.status(403).json({
        message: "يمكن للخبراء الموافق عليهم فقط إنشاء الإعلانات.",
      });
    }

    const providerSnap = await db
      .collection("service_providers")
      .doc(req.userId)
      .get();

    if (!providerSnap.exists || providerSnap.data()?.isActive !== true) {
      return res.status(403).json({ message: "يجب الموافقة على حساب الخبير أولاً." });
    }

    const body = req.body || {};
    const title = String(body.title || "").trim();
    const category = String(body.category || "").trim();
    const serviceSubcategory = String(body.serviceSubcategory || "").trim();
    const serviceSubcategoryDetails = String(
      body.serviceSubcategoryDetails || ""
    ).trim();
    const description = String(body.description || "").trim();
    const pricingType = String(
      body.pricingType || body.duration || "Proje Bazlı"
    ).trim();
    const city = String(body.city || "").trim();
    const image = String(body.image || "").trim();
    const imageCrop = normalizeImageCropPayload(body.imageCrop);
    const price = Number(body.price);

    // INPUT VALIDATION
    if (title.length < 3 || title.length > 100) {
      return res.status(400).json({
        message: "يجب أن يكون العنوان بين 3 و100 حرف.",
      });
    }

    if (description.length < 10 || description.length > 2000) {
      return res.status(400).json({
        message: "يجب أن يكون الوصف بين 10 و2000 حرف.",
      });
    }

    if (!title || !category || !serviceSubcategory || !description || !city) {
      return res.status(400).json({
        message: "بعض حقول الإعلان المطلوبة ناقصة.",
      });
    }

    if (!Number.isFinite(price) || price <= 0) {
      return res.status(400).json({
        message: "يجب أن يكون السعر رقماً موجباً.",
      });
    }

    // Only ACTIVE listings count towards 10 limit
    try {
      const activeLimit = 10;
      const activeCount = await countActiveProviderListings({
        providerId: req.userId,
        scanLimit: activeLimit + 1,
      });

      if (activeCount >= activeLimit) {
        return res.status(400).json({
          message: `تم الوصول إلى حد الإعلانات المنشورة (${activeLimit}/${activeLimit}). يجب إلغاء نشر إعلان منشور قبل إضافة إعلان جديد.`,
          code: "TOTAL_LISTING_LIMIT_REACHED",
          limit: activeLimit,
        });
      }
    } catch (error) {
      if (isDevelopment) console.error("Listing active limit check failed:", error.message);
      return res.status(500).json({ message: "تعذر التحقق من حدود الإعلانات." });
    }

    try {
      const limitPerCategory = 2;
      const matchedCount = await countActiveProviderListingsInSpecialtyCaseInsensitive({
        providerId: req.userId,
        category,
        serviceSubcategory,
        scanLimit: 200,
      });

      if (matchedCount >= limitPerCategory) {
        return res.status(400).json({
          message: `يمكنك نشر ${limitPerCategory} إعلان كحد أقصى في هذه الفئة.`,
          code: "CATEGORY_LIMIT_REACHED",
          limit: limitPerCategory,
          category,
        });
      }
    } catch (error) {
      if (isDevelopment) {
        console.error("Category limit check failed:", error.message);
      }
      return res.status(500).json({
        message: "تعذر التحقق من حدود الإعلانات.",
      });
    }

    const expertName =
      String(userData.displayName || "").trim() ||
      String(providerSnap.data()?.businessName || "").trim() ||
      "خبير";

    const docRef = await db.collection("services").add({
      title,
      category,
      serviceSubcategory,
      serviceSubcategoryDetails,
      description,
      pricingType,
      city,
      price,
      image: null,
      imageCrop,
      rating: 0,
      providerId: req.userId,
      providerName: expertName,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      status: "ACTIVE",
    });

    let imageUrl = null;
    let imageUploadError = null;

    if (image) {
      try {
        const { imageUrl: uploadedUrl } = await uploadListingImageFromDataUrl({
          listingId: docRef.id,
          dataUrl: image,
        });

        imageUrl = uploadedUrl;

        await docRef.update({
          image: imageUrl,
          imageCrop,
          updatedAt: FieldValue.serverTimestamp(),
        });
      } catch (error) {
        const baseMessage = error?.message ? String(error.message) : String(error);
        imageUploadError = baseMessage;

        if (isDevelopment) {
          console.error("Listing image upload failed:", imageUploadError);
        }
      }
    }

    const isProd = String(process.env.NODE_ENV || "").toLowerCase() === "production";

    return res.status(201).json({
      id: docRef.id,
      message: imageUrl
        ? "تم إنشاء الإعلان."
        : "تم إنشاء الإعلان، لكن فشل رفع الصورة.",
      ...(isProd || !imageUploadError ? null : { imageUploadError }),
    });
  } catch (error) {
    if (isDevelopment) console.error("POST /api/listings failed:", error.message);

    const isProd = String(process.env.NODE_ENV || "").toLowerCase() === "production";

    return res.status(500).json({
      message: "تعذر إنشاء الإعلان.",
      ...(isProd ? null : { details: error?.message || String(error) }),
    });
  }
};

exports.getListingById = async (req, res) => {
  try {
    const item = await getListingById(db, req.params.id);

    if (!item) {
      return res.status(404).json({ message: "لم يتم العثور على الإعلان." });
    }

    res.json(item);
  } catch (error) {
    if (isDevelopment) {
      console.error("GET /api/listings/:id failed:", error.message);
    }
    res.status(500).json({ message: "تعذر تحميل تفاصيل الإعلان." });
  }
};

exports.updateListingStatus = async (req, res) => {
  const listingId = String(req.params.id || "").trim();

  if (!listingId) {
    return res.status(400).json({ message: "معرف الإعلان مطلوب." });
  }

  if (/^\d+$/.test(listingId)) {
    return res.status(400).json({
      message: "لا يمكن تحديث الإعلانات الثابتة.",
    });
  }

  try {
    const nextStatus = String(req.body?.status || "").trim().toUpperCase();
    const allowedStatuses = ["ACTIVE", "UNPUBLISHED", "DELETED"];

    if (!allowedStatuses.includes(nextStatus)) {
      return res.status(400).json({ message: "حالة الإعلان غير صالحة." });
    }

    const userSnap = await db.collection("users").doc(req.userId).get();

    if (!userSnap.exists) {
      return res.status(403).json({ message: "لم يتم العثور على المستخدم." });
    }

    const userData = userSnap.data() || {};

    if (userData.userType !== "PROVIDER") {
      return res.status(403).json({
        message: "يمكن للخبراء الموافق عليهم فقط تحديث حالة الإعلان.",
      });
    }

    const providerSnap = await db
      .collection("service_providers")
      .doc(req.userId)
      .get();

    if (!providerSnap.exists || providerSnap.data()?.isActive !== true) {
      return res.status(403).json({ message: "يجب الموافقة على حساب الخبير أولاً." });
    }

    const listingRef = db.collection("services").doc(listingId);
    const listingSnap = await listingRef.get();

    if (!listingSnap.exists) {
      return res.status(404).json({ message: "لم يتم العثور على الإعلان." });
    }

    const listingData = listingSnap.data() || {};

    if (String(listingData.providerId || "") !== String(req.userId || "")) {
      return res.status(403).json({
        message: "يمكنك تحديث إعلاناتك فقط.",
      });
    }

    const updates = {
      status: nextStatus,
      updatedAt: FieldValue.serverTimestamp(),
    };

    if (nextStatus === "UNPUBLISHED") {
      updates.unpublishedAt = FieldValue.serverTimestamp();
    }

    if (nextStatus === "ACTIVE") {
      // Only ACTIVE listings count towards 10 limit
      const activeLimit = 10;
      const activeCount = await countActiveProviderListings({
        providerId: req.userId,
        excludeListingId: listingId,
        scanLimit: activeLimit + 1,
      });

      if (activeCount >= activeLimit) {
        return res.status(400).json({
          message: `تم الوصول إلى حد الإعلانات المنشورة (${activeLimit}/${activeLimit}). يجب إلغاء نشر إعلان أولاً قبل نشر إعلان جديد.`,
          code: "TOTAL_LISTING_LIMIT_REACHED",
          limit: activeLimit,
        });
      }

      // Per-category (specialty) limit (ACTIVE only)
      try {
        const limitPerCategory = 2;
        const category = String(listingData.category || "").trim();
        const serviceSubcategory = String(listingData.serviceSubcategory || "").trim();
        if (category && serviceSubcategory) {
          const matchedCount = await countActiveProviderListingsInSpecialtyCaseInsensitive({
            providerId: req.userId,
            category,
            serviceSubcategory,
            excludeListingId: listingId,
            scanLimit: 200,
          });

          if (matchedCount >= limitPerCategory) {
            return res.status(400).json({
              message: `يمكنك نشر ${limitPerCategory} إعلان كحد أقصى في هذه الفئة.`,
              code: "SPECIALTY_LIMIT_REACHED",
              limit: limitPerCategory,
              category,
              serviceSubcategory,
            });
          }
        }
      } catch (error) {
        if (isDevelopment) console.error("Specialty limit check (republish) failed:", error.message);
        return res.status(500).json({ message: "تعذر التحقق من حدود الإعلانات." });
      }

      updates.republishedAt = FieldValue.serverTimestamp();
    }

    if (nextStatus === "DELETED") {
      updates.deletedAt = FieldValue.serverTimestamp();
    }

    await listingRef.update(updates);

    return res.json({
      message: "تم تحديث حالة الإعلان.",
      id: listingId,
      status: nextStatus,
    });
  } catch (error) {
    if (isDevelopment) {
      console.error("PATCH /api/listings/:id/status failed:", error.message);
    }
    return res.status(500).json({ message: "تعذر تحديث حالة الإعلان." });
  }
};

exports.updateListing = async (req, res) => {
  const listingId = String(req.params.id || "").trim();

  if (!listingId) {
    return res.status(400).json({ message: "معرف الإعلان مطلوب." });
  }

  if (/^\d+$/.test(listingId)) {
    return res.status(400).json({
      message: "لا يمكن تحديث الإعلانات الثابتة.",
    });
  }

  try {
    const userSnap = await db.collection("users").doc(req.userId).get();

    if (!userSnap.exists) {
      return res.status(403).json({ message: "لم يتم العثور على المستخدم." });
    }

    const userData = userSnap.data() || {};

    if (userData.userType !== "PROVIDER") {
      return res.status(403).json({
        message: "يمكن للخبراء الموافق عليهم فقط تحديث الإعلانات.",
      });
    }

    const providerSnap = await db
      .collection("service_providers")
      .doc(req.userId)
      .get();

    if (!providerSnap.exists || providerSnap.data()?.isActive !== true) {
      return res.status(403).json({ message: "يجب الموافقة على حساب الخبير أولاً." });
    }

    const listingRef = db.collection("services").doc(listingId);
    const listingSnap = await listingRef.get();

    if (!listingSnap.exists) {
      return res.status(404).json({ message: "لم يتم العثور على الإعلان." });
    }

    const listingData = listingSnap.data() || {};

    if (String(listingData.providerId || "") !== String(req.userId || "")) {
      return res.status(403).json({
        message: "يمكنك تحديث إعلاناتك فقط.",
      });
    }

    const body = req.body || {};
    const updates = {};

    if (typeof body.title === "string") updates.title = body.title.trim();
    if (typeof body.category === "string") updates.category = body.category.trim();

    if (typeof body.serviceSubcategory === "string") {
      updates.serviceSubcategory = body.serviceSubcategory.trim();
    }

    if (typeof body.serviceSubcategoryDetails === "string") {
      updates.serviceSubcategoryDetails = body.serviceSubcategoryDetails.trim();
    }

    if (typeof body.description === "string") {
      updates.description = body.description.trim();
    }

    if (typeof body.pricingType === "string") {
      updates.pricingType = body.pricingType.trim();
    }

    if (typeof body.duration === "string") {
      updates.duration = body.duration.trim();
    }

    if (typeof body.city === "string") {
      updates.city = body.city.trim();
    }

    if (Object.prototype.hasOwnProperty.call(body, "imageCrop")) {
      updates.imageCrop = normalizeImageCropPayload(body.imageCrop);
    }

    if (typeof body.status === "string") {
      const nextStatus = body.status.trim().toUpperCase();
      const allowedStatuses = ["ACTIVE", "UNPUBLISHED", "DELETED"];

      if (!allowedStatuses.includes(nextStatus)) {
        return res.status(400).json({ message: "حالة الإعلان غير صالحة." });
      }

      updates.status = nextStatus;

      if (nextStatus === "UNPUBLISHED") {
        updates.unpublishedAt = FieldValue.serverTimestamp();
      }

      if (nextStatus === "ACTIVE") {
        updates.republishedAt = FieldValue.serverTimestamp();
      }

      if (nextStatus === "DELETED") {
        updates.deletedAt = FieldValue.serverTimestamp();
      }
    }

    if (body.price !== undefined) {
      const price = Number(body.price);

      if (!Number.isFinite(price) || price <= 0) {
        return res.status(400).json({
          message: "يجب أن يكون السعر رقماً موجباً.",
        });
      }

      updates.price = price;
    }

    // Category/specialty limit check on update
    if (
      typeof updates.serviceSubcategory === "string" ||
      typeof updates.category === "string"
    ) {
      const nextCategory = String(updates.category || listingData.category || "")
        .trim()
        .toLowerCase();

      const nextSpecialty = String(
        updates.serviceSubcategory || listingData.serviceSubcategory || ""
      )
        .trim()
        .toLowerCase();

      const currentCategory = String(listingData.category || "")
        .trim()
        .toLowerCase();

      const currentSpecialty = String(listingData.serviceSubcategory || "")
        .trim()
        .toLowerCase();

      if (currentCategory !== nextCategory || currentSpecialty !== nextSpecialty) {
        try {
          const limitPerCategory = 2;
          const matchedCount = await countActiveProviderListingsInSpecialtyCaseInsensitive({
            providerId: req.userId,
            category: nextCategory,
            serviceSubcategory: nextSpecialty,
            excludeListingId: listingId,
            scanLimit: 200,
          });

          if (matchedCount >= limitPerCategory) {
            return res.status(400).json({
              message: `يمكنك نشر ${limitPerCategory} إعلان كحد أقصى في هذه الفئة.`,
              code: "CATEGORY_LIMIT_REACHED",
              limit: limitPerCategory,
              category: nextCategory,
            });
          }
        } catch (error) {
          if (isDevelopment) {
            console.error(
              "Category limit check (PUT) failed:",
              error.message
            );
          }

          return res.status(500).json({
            message: "تعذر التحقق من حدود الإعلانات.",
          });
        }
      }
    }

    const imageFieldPresent = Object.prototype.hasOwnProperty.call(body, "image");
    const imageValue = body?.image;

    if (imageFieldPresent) {
      if (imageValue === null) {
        updates.image = null;
      } else {
        const dataUrl = String(imageValue || "").trim();

        if (!dataUrl) {
          return res.status(400).json({
            message: "يجب أن تكون الصورة بصيغة data URL أو فارغة.",
          });
        }

        if (!/^data:image\/\w+;base64,/.test(dataUrl)) {
          return res.status(400).json({
            message: "يجب أن تكون الصورة بصيغة base64 data URL.",
          });
        }

        if (dataUrl.length > 5000000) {
          return res.status(413).json({
            message: "حجم الطلب كبير جداً. يرجى استخدام صورة أصغر.",
          });
        }
      }
    }

    if (!Object.keys(updates).length) {
      return res.status(400).json({
        message: "لا توجد حقول صالحة للتحديث.",
      });
    }

    updates.updatedAt = FieldValue.serverTimestamp();

    if (imageFieldPresent && imageValue !== null && imageValue !== "") {
      try {
        const { imageUrl } = await uploadListingImageFromDataUrl({
          listingId,
          dataUrl: String(imageValue || "").trim(),
        });

        updates.image = imageUrl;
      } catch (error) {
        if (isDevelopment) {
          console.error(
            "PUT /api/listings/:id image upload failed:",
            error.message
          );
        }

        return res.status(500).json({
          message: "فشل رفع الصورة.",
        });
      }
    } else if (imageFieldPresent && imageValue === null) {
      updates.image = null;
    }

    await listingRef.update(updates);

    return res.json({
      message: "تم تحديث الإعلان.",
      id: listingId,
      ...(Object.prototype.hasOwnProperty.call(updates, "imageCrop")
        ? { imageCrop: updates.imageCrop }
        : null),
      ...(Object.prototype.hasOwnProperty.call(updates, "image")
        ? { image: updates.image }
        : null),
    });
  } catch (error) {
    if (isDevelopment) {
      console.error("PUT /api/listings/:id failed:", error.message);
    }
    return res.status(500).json({ message: "تعذر تحديث الإعلان." });
  }
};

exports.deleteListing = async (req, res) => {
  const listingId = String(req.params.id || "").trim();

  if (!listingId) {
    return res.status(400).json({ message: "معرف الإعلان مطلوب." });
  }

  if (/^\d+$/.test(listingId)) {
    return res.status(400).json({
      message: "لا يمكن حذف الإعلانات الثابتة.",
    });
  }

  try {
    const userSnap = await db.collection("users").doc(req.userId).get();

    if (!userSnap.exists) {
      return res.status(403).json({ message: "لم يتم العثور على المستخدم." });
    }

    const userData = userSnap.data() || {};

    if (userData.userType !== "PROVIDER") {
      return res.status(403).json({
        message: "يمكن للخبراء الموافق عليهم فقط حذف الإعلانات.",
      });
    }

    const providerSnap = await db
      .collection("service_providers")
      .doc(req.userId)
      .get();

    if (!providerSnap.exists || providerSnap.data()?.isActive !== true) {
      return res.status(403).json({ message: "يجب الموافقة على حساب الخبير أولاً." });
    }

    const listingRef = db.collection("services").doc(listingId);
    const listingSnap = await listingRef.get();

    if (!listingSnap.exists) {
      return res.status(404).json({ message: "لم يتم العثور على الإعلان." });
    }

    const listingData = listingSnap.data() || {};

    if (String(listingData.providerId || "") !== String(req.userId || "")) {
      return res.status(403).json({
        message: "يمكنك حذف إعلاناتك فقط.",
      });
    }

    // Günlük silme limiti (günde en fazla 3)
    const DAILY_DELETE_LIMIT = 3;
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    const dayKey = `${yyyy}-${mm}-${dd}`;
    const limitRef = db.collection("provider_daily_delete_limits").doc(`${req.userId}_${dayKey}`);

    await db.runTransaction(async (tx) => {
      const limitSnap = await tx.get(limitRef);
      const currentCount = Number(limitSnap.exists ? limitSnap.data()?.count : 0) || 0;

      if (currentCount >= DAILY_DELETE_LIMIT) {
        const error = new Error("تم الوصول إلى حد الحذف اليومي. (3/3)");
        error.code = "DAILY_DELETE_LIMIT_REACHED";
        throw error;
      }

      // Soft delete - sadece status DELETED olarak güncellenir
      tx.update(listingRef, {
        status: "DELETED",
        deletedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });

      tx.set(
        limitRef,
        {
          providerId: req.userId,
          dayKey,
          count: currentCount + 1,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    });

    return res.json({
      message: "تم نقل الإعلان إلى المحذوفات.",
      id: listingId,
      status: "DELETED",
    });
  } catch (error) {
    if (isDevelopment) {
      console.error("DELETE /api/listings/:id failed:", error.message);
    }

    if (error?.code === "DAILY_DELETE_LIMIT_REACHED") {
      return res.status(400).json({
        message: error.message || "تم الوصول إلى حد الحذف اليومي.",
        code: "DAILY_DELETE_LIMIT_REACHED",
        limit: 3,
      });
    }

    return res.status(500).json({ message: "تعذر حذف الإعلان." });
  }
};
