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
    res.status(500).json({ message: "Failed to load listings metadata." });
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
    res.status(500).json({ message: "Failed to load listings by ids." });
  }
};

exports.getMyListings = async (req, res) => {
  try {
    const userSnap = await db.collection("users").doc(req.userId).get();

    if (!userSnap.exists) {
      return res.status(403).json({ message: "User not found." });
    }

    const userData = userSnap.data() || {};

    if (userData.userType !== "PROVIDER") {
      return res.status(403).json({
        message: "Only approved experts can view their listings.",
      });
    }

    const providerSnap = await db
      .collection("service_providers")
      .doc(req.userId)
      .get();

    if (!providerSnap.exists || providerSnap.data()?.isActive !== true) {
      return res.status(403).json({ message: "Expert approval is required." });
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
    return res.status(500).json({ message: "Failed to load expert listings." });
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
    res.status(500).json({ message: "Failed to load listings." });
  }
};

exports.createListing = async (req, res) => {
  try {
    const userSnap = await db.collection("users").doc(req.userId).get();

    if (!userSnap.exists) {
      return res.status(403).json({ message: "User not found." });
    }

    const userData = userSnap.data() || {};

    if (userData.userType !== "PROVIDER") {
      return res.status(403).json({
        message: "Only approved experts can create listings.",
      });
    }

    const providerSnap = await db
      .collection("service_providers")
      .doc(req.userId)
      .get();

    if (!providerSnap.exists || providerSnap.data()?.isActive !== true) {
      return res.status(403).json({ message: "Expert approval is required." });
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
        message: "Başlık 3-100 karakter olmalıdır.",
      });
    }

    if (description.length < 10 || description.length > 2000) {
      return res.status(400).json({
        message: "Açıklama 10-2000 karakter olmalıdır.",
      });
    }

    if (!title || !category || !serviceSubcategory || !description || !city) {
      return res.status(400).json({
        message: "Missing required listing fields.",
      });
    }

    if (!Number.isFinite(price) || price <= 0) {
      return res.status(400).json({
        message: "Price must be a positive number.",
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
          message: `Yayındaki ilan limitine ulaşıldı (${activeLimit}/${activeLimit}). Yayındaki bir ilanı yayından kaldırmadan yeni ilan veremezsiniz.`,
          code: "TOTAL_LISTING_LIMIT_REACHED",
          limit: activeLimit,
        });
      }
    } catch (error) {
      if (isDevelopment) console.error("Listing active limit check failed:", error.message);
      return res.status(500).json({ message: "Failed to validate listing limits." });
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
          message: `Bu kategoride en fazla ${limitPerCategory} ilan yayınlayabilirsiniz.`,
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
        message: "Failed to validate listing limits.",
      });
    }

    const expertName =
      String(userData.displayName || "").trim() ||
      String(providerSnap.data()?.businessName || "").trim() ||
      "Uzman";

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
        ? "Listing created."
        : "Listing created (image upload failed).",
      ...(isProd || !imageUploadError ? null : { imageUploadError }),
    });
  } catch (error) {
    if (isDevelopment) console.error("POST /api/listings failed:", error.message);

    const isProd = String(process.env.NODE_ENV || "").toLowerCase() === "production";

    return res.status(500).json({
      message: "Failed to create listing.",
      ...(isProd ? null : { details: error?.message || String(error) }),
    });
  }
};

exports.getListingById = async (req, res) => {
  try {
    const item = await getListingById(db, req.params.id);

    if (!item) {
      return res.status(404).json({ message: "Listing not found." });
    }

    res.json(item);
  } catch (error) {
    if (isDevelopment) {
      console.error("GET /api/listings/:id failed:", error.message);
    }
    res.status(500).json({ message: "Failed to load listing details." });
  }
};

exports.updateListingStatus = async (req, res) => {
  const listingId = String(req.params.id || "").trim();

  if (!listingId) {
    return res.status(400).json({ message: "Listing id is required." });
  }

  if (/^\d+$/.test(listingId)) {
    return res.status(400).json({
      message: "Static listings cannot be updated.",
    });
  }

  try {
    const nextStatus = String(req.body?.status || "").trim().toUpperCase();
    const allowedStatuses = ["ACTIVE", "UNPUBLISHED", "DELETED"];

    if (!allowedStatuses.includes(nextStatus)) {
      return res.status(400).json({ message: "Invalid listing status." });
    }

    const userSnap = await db.collection("users").doc(req.userId).get();

    if (!userSnap.exists) {
      return res.status(403).json({ message: "User not found." });
    }

    const userData = userSnap.data() || {};

    if (userData.userType !== "PROVIDER") {
      return res.status(403).json({
        message: "Only approved experts can update listing status.",
      });
    }

    const providerSnap = await db
      .collection("service_providers")
      .doc(req.userId)
      .get();

    if (!providerSnap.exists || providerSnap.data()?.isActive !== true) {
      return res.status(403).json({ message: "Expert approval is required." });
    }

    const listingRef = db.collection("services").doc(listingId);
    const listingSnap = await listingRef.get();

    if (!listingSnap.exists) {
      return res.status(404).json({ message: "Listing not found." });
    }

    const listingData = listingSnap.data() || {};

    if (String(listingData.providerId || "") !== String(req.userId || "")) {
      return res.status(403).json({
        message: "You can only update your own listings.",
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
          message: `Yayındaki ilan limitine ulaşıldı (${activeLimit}/${activeLimit}). Yayına almak için önce bir ilanı yayından kaldırmalısınız.`,
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
              message: `Bu kategoride en fazla ${limitPerCategory} ilan yayınlayabilirsiniz.`,
              code: "SPECIALTY_LIMIT_REACHED",
              limit: limitPerCategory,
              category,
              serviceSubcategory,
            });
          }
        }
      } catch (error) {
        if (isDevelopment) console.error("Specialty limit check (republish) failed:", error.message);
        return res.status(500).json({ message: "Failed to validate listing limits." });
      }

      updates.republishedAt = FieldValue.serverTimestamp();
    }

    if (nextStatus === "DELETED") {
      updates.deletedAt = FieldValue.serverTimestamp();
    }

    await listingRef.update(updates);

    return res.json({
      message: "Listing status updated.",
      id: listingId,
      status: nextStatus,
    });
  } catch (error) {
    if (isDevelopment) {
      console.error("PATCH /api/listings/:id/status failed:", error.message);
    }
    return res.status(500).json({ message: "Failed to update listing status." });
  }
};

exports.updateListing = async (req, res) => {
  const listingId = String(req.params.id || "").trim();

  if (!listingId) {
    return res.status(400).json({ message: "Listing id is required." });
  }

  if (/^\d+$/.test(listingId)) {
    return res.status(400).json({
      message: "Static listings cannot be updated.",
    });
  }

  try {
    const userSnap = await db.collection("users").doc(req.userId).get();

    if (!userSnap.exists) {
      return res.status(403).json({ message: "User not found." });
    }

    const userData = userSnap.data() || {};

    if (userData.userType !== "PROVIDER") {
      return res.status(403).json({
        message: "Only approved experts can update listings.",
      });
    }

    const providerSnap = await db
      .collection("service_providers")
      .doc(req.userId)
      .get();

    if (!providerSnap.exists || providerSnap.data()?.isActive !== true) {
      return res.status(403).json({ message: "Expert approval is required." });
    }

    const listingRef = db.collection("services").doc(listingId);
    const listingSnap = await listingRef.get();

    if (!listingSnap.exists) {
      return res.status(404).json({ message: "Listing not found." });
    }

    const listingData = listingSnap.data() || {};

    if (String(listingData.providerId || "") !== String(req.userId || "")) {
      return res.status(403).json({
        message: "You can only update your own listings.",
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
        return res.status(400).json({ message: "Invalid listing status." });
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
          message: "Price must be a positive number.",
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
              message: `Bu kategoride en fazla ${limitPerCategory} ilan yayınlayabilirsiniz.`,
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
            message: "Failed to validate listing limits.",
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
            message: "Image must be a data url string or null.",
          });
        }

        if (!/^data:image\/\w+;base64,/.test(dataUrl)) {
          return res.status(400).json({
            message: "Image must be a base64 data url.",
          });
        }

        if (dataUrl.length > 5000000) {
          return res.status(413).json({
            message: "Request payload too large. Please use a smaller image.",
          });
        }
      }
    }

    if (!Object.keys(updates).length) {
      return res.status(400).json({
        message: "No valid fields to update.",
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
          message: "Image upload failed.",
        });
      }
    } else if (imageFieldPresent && imageValue === null) {
      updates.image = null;
    }

    await listingRef.update(updates);

    return res.json({
      message: "Listing updated.",
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
    return res.status(500).json({ message: "Failed to update listing." });
  }
};

exports.deleteListing = async (req, res) => {
  const listingId = String(req.params.id || "").trim();

  if (!listingId) {
    return res.status(400).json({ message: "Listing id is required." });
  }

  if (/^\d+$/.test(listingId)) {
    return res.status(400).json({
      message: "Static listings cannot be deleted.",
    });
  }

  try {
    const userSnap = await db.collection("users").doc(req.userId).get();

    if (!userSnap.exists) {
      return res.status(403).json({ message: "User not found." });
    }

    const userData = userSnap.data() || {};

    if (userData.userType !== "PROVIDER") {
      return res.status(403).json({
        message: "Only approved experts can delete listings.",
      });
    }

    const providerSnap = await db
      .collection("service_providers")
      .doc(req.userId)
      .get();

    if (!providerSnap.exists || providerSnap.data()?.isActive !== true) {
      return res.status(403).json({ message: "Expert approval is required." });
    }

    const listingRef = db.collection("services").doc(listingId);
    const listingSnap = await listingRef.get();

    if (!listingSnap.exists) {
      return res.status(404).json({ message: "Listing not found." });
    }

    const listingData = listingSnap.data() || {};

    if (String(listingData.providerId || "") !== String(req.userId || "")) {
      return res.status(403).json({
        message: "You can only delete your own listings.",
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
        const error = new Error("Günlük silme limitine ulaştınız. (3/3)");
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
      message: "Listing moved to deleted.",
      id: listingId,
      status: "DELETED",
    });
  } catch (error) {
    if (isDevelopment) {
      console.error("DELETE /api/listings/:id failed:", error.message);
    }

    if (error?.code === "DAILY_DELETE_LIMIT_REACHED") {
      return res.status(400).json({
        message: error.message || "Günlük silme limitine ulaşıldı.",
        code: "DAILY_DELETE_LIMIT_REACHED",
        limit: 3,
      });
    }

    return res.status(500).json({ message: "Failed to delete listing." });
  }
};
