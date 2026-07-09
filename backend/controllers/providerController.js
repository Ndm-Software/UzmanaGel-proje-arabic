// backend/controllers/providerController.js
// Express route handlers for provider operations.
// Extracted from app.js (Step 7).

const { admin, db } = require("../config/firebaseAdmin");

const isDevelopment = process.env.NODE_ENV === "development";

exports.getProviderById = async (req, res) => {
  try {
    const providerId = String(req.params.id || "").trim();

    if (!providerId) {
      return res.status(400).json({ message: "Provider id is required." });
    }

    const [userSnap, providerSnap] = await Promise.all([
      db.collection("users").doc(providerId).get(),
      db.collection("service_providers").doc(providerId).get(),
    ]);

    let authUser = null;

    if (!userSnap.exists) {
      try {
        authUser = await admin.auth().getUser(providerId);
      } catch (error) {
        const code = error?.code || "";

        if (code !== "auth/user-not-found") {
          if (isDevelopment) {
            console.warn("Provider auth lookup failed:", error.message);
          }
        }
      }
    }

    let listingFallback = null;

    if (!userSnap.exists && !providerSnap.exists && !authUser) {
      try {
        const qSnap = await db
          .collection("services")
          .where("providerId", "==", providerId)
          .limit(1)
          .get();

        if (!qSnap.empty) {
          const docSnap = qSnap.docs[0];
          listingFallback = { id: docSnap.id, ...(docSnap.data() || {}) };
        }
      } catch (error) {
        if (isDevelopment) {
          console.warn("Provider listing fallback failed:", error.message);
        }
      }
    }

    if (!userSnap.exists && !providerSnap.exists && !authUser && !listingFallback) {
      return res.status(404).json({ message: "Provider not found." });
    }

    const userData = userSnap.exists ? userSnap.data() || {} : {};
    const providerData = providerSnap.exists ? providerSnap.data() || {} : {};

    return res.json({
      providerId,
      displayName:
        userData.displayName ||
        authUser?.displayName ||
        String(listingFallback?.providerName || "").trim() ||
        "",
      photoURL: userData.photoURL || authUser?.photoURL || null,
      city:
        providerData.city ||
        userData.city ||
        String(listingFallback?.city || "").trim() ||
        "",
      category:
        providerData.category ||
        String(listingFallback?.category || "").trim() ||
        "",
      businessName: providerData.businessName || "",
      businessType: providerData.businessType || "",
      educationInfo: providerData.educationInfo || "",
      experienceYears: Number(providerData.experienceYears) || 0,
      specialties: Array.isArray(providerData.specialties)
        ? providerData.specialties
        : [],
      workingHours: providerData.workingHours || {},
      certificates: Array.isArray(providerData.certificates)
        ? providerData.certificates
        : [],
      isCertified: !!providerData.isCertified,
      minPrice: Number(providerData.minPrice) || 0,
      maxPrice: Number(providerData.maxPrice) || 0,
      pricingType: providerData.pricingType || "fixed",
      rating: Number(providerData.rating) || 0,
      reviewCount: Number(providerData.reviewCount) || 0,
      isActive: providerData.isActive === true,
      createdAt: providerData.createdAt || userData.createdAt || null,
      approvedAt: providerData.approvedAt || null,
    });
  } catch (error) {
    if (isDevelopment) {
      console.error("GET /api/providers/:id failed:", error.message);
    }

    return res.status(500).json({
      message: "Failed to load provider details.",
    });
  }
};
