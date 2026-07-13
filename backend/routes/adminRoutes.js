// adminRoutes.js file code 

const express = require("express");
const router = express.Router();
const { admin, db } = require("../config/firebaseAdmin");

const isDevelopment = process.env.NODE_ENV === 'development';

const FieldValue = admin.firestore.FieldValue;

// RATE LIMIT EKLENDI
let adminRequestCount = 0;
let adminLastResetTime = Date.now();
const ADMIN_RATE_LIMIT_MAX = 200;
const ADMIN_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;

function checkAdminRateLimit() {
  const now = Date.now();
  if (now - adminLastResetTime >= ADMIN_RATE_LIMIT_WINDOW_MS) {
    adminRequestCount = 0;
    adminLastResetTime = now;
  }
  
  if (adminRequestCount >= ADMIN_RATE_LIMIT_MAX) {
    throw new Error("RATE_LIMIT_EXCEEDED");
  }
  
  adminRequestCount++;
}

function rateLimitMiddleware(req, res, next) {
  try {
    checkAdminRateLimit();
    next();
  } catch (error) {
    return res.status(429).json({ message: "طلبات كثيرة جداً. يرجى المحاولة لاحقاً." });
  }
}

function requireAuth(req, res, next) {
  const authHeader = req.header("authorization") || "";
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length)
    : "";

  if (!token) {
    return res.status(401).json({ message: "رمز تسجيل الدخول مفقود." });
  }

  admin
    .auth()
    .verifyIdToken(token)
    .then((decoded) => {
      req.userId = decoded.uid;
      req.userEmail = decoded.email || null;
      next();
    })
    .catch((error) => {
      if (isDevelopment) console.error("Auth verify failed:", error?.message || error);
      res.status(401).json({ message: "رمز تسجيل الدخول غير صالح." });
    });
}

async function requireAdmin(req, res, next) {
  try {
    const snap = await db.collection("users").doc(req.userId).get();
    if (snap.exists && snap.data()?.userType === "ADMIN") {
      return next();
    }
    return res.status(403).json({ message: "صلاحية المدير مطلوبة." });
  } catch (error) {
    if (isDevelopment) console.error("Admin check failed:", error?.message || error);
    return res.status(500).json({ message: "فشل التحقق من الصلاحيات." });
  }
}

function makeTempPassword(length = 14) {
  const chars =
    "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  let result = "";
  for (let i = 0; i < length; i += 1) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result + "Aa1!";
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeTrPhoneToE164(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";

  let core = digits;

  if (core.length === 11 && core.startsWith("0")) {
    core = core.slice(1);
  }

  if (core.length === 12 && core.startsWith("90")) {
    core = core.slice(2);
  }

  if (core.length !== 10) return "";
  if (!core.startsWith("5")) return "";

  return `+90${core}`;
}

function isGmailAddress(email) {
  const cleanEmail = normalizeEmail(email);
  return cleanEmail.endsWith("@gmail.com");
}

function normalizeProviderKey(value) {
  const clean = String(value || "").trim().toLowerCase();

  if (!clean) return null;
  if (clean === "google.com") return "google";
  if (clean === "password") return "password";
  if (clean === "phone") return "phone";

  return clean;
}

function uniqueProviders(list = []) {
  return [
    ...new Set(
      list.map((item) => normalizeProviderKey(item)).filter(Boolean)
    ),
  ];
}

function inferPrimaryProvider(providers = []) {
  if (providers.includes("password")) return "password";
  if (providers.includes("google")) return "google";
  if (providers.includes("phone")) return "phone";
  return null;
}

function getOriginalLoginMethods(deletedData) {
  const userData = deletedData?.userData || {};
  const authSnapshot = deletedData?.authSnapshot || {};

  const fromUserProviders = Array.isArray(userData.authProviders)
    ? userData.authProviders
    : [];

  const fromPrimary = userData.authProvider ? [userData.authProvider] : [];

  const fromSnapshot = Array.isArray(authSnapshot.providerData)
    ? authSnapshot.providerData.map((item) => item?.providerId)
    : [];

  return uniqueProviders([
    ...fromUserProviders,
    ...fromPrimary,
    ...fromSnapshot,
  ]);
}

function mapDeletedAccountDoc(docSnap) {
  const data = docSnap.data() || {};

  return {
    id: docSnap.id,
    uid: data.uid || docSnap.id,
    userType: data.userType || null,
    deletedAt: data.deletedAt || null,
    reservedUntil:
      data.reservedUntil || data.scheduledPermanentDeletionAt || null,
    listingsCount: data.listingsCount || 0,
    restorationRequested: !!data.restorationRequested,
    pendingPermanentDeletion: !!data.pendingPermanentDeletion,
    userData: data.userData || {},
    providerData: data.providerData || {},
    authSnapshot: data.authSnapshot || null,
  };
}

function sortDeletedAccountsByDateDesc(items) {
  items.sort((a, b) => {
    const aTime =
      typeof a.deletedAt?.toDate === "function"
        ? a.deletedAt.toDate().getTime()
        : new Date(a.deletedAt || 0).getTime();

    const bTime =
      typeof b.deletedAt?.toDate === "function"
        ? b.deletedAt.toDate().getTime()
        : new Date(b.deletedAt || 0).getTime();

    return bTime - aTime;
  });

  return items;
}

router.use(rateLimitMiddleware);

router.get("/listing-reports/count", requireAuth, requireAdmin, async (req, res) => {
  try {
    const col = db.collection("listing_reports");
    const [totalAgg, seenAgg] = await Promise.all([
      col.count().get(),
      col.where("adminSeen", "==", true).count().get(),
    ]);
    const total = totalAgg.data().count;
    const seenTrue = seenAgg.data().count;
    const unseen = Math.max(0, total - seenTrue);
    return res.json({ count: unseen, total, unseen });
  } catch (error) {
    if (isDevelopment) console.error("GET /api/admin/listing-reports/count:", error?.message || error);
    try {
      const snap = await db.collection("listing_reports").limit(2000).get();
      let unseen = 0;
      for (const d of snap.docs) {
        if (d.data()?.adminSeen !== true) unseen += 1;
      }
      return res.json({ count: unseen, total: snap.size, unseen });
    } catch (e2) {
      return res.status(500).json({ message: "تعذر جلب عدد الإشعارات." });
    }
  }
});

router.get("/listing-reports", requireAuth, requireAdmin, async (req, res) => {
  try {
    const snap = await db
      .collection("listing_reports")
      .orderBy("createdAt", "desc")
      .limit(500)
      .get();

    const serializeService = (docSnap) => {
      if (!docSnap.exists) return null;
      const d = docSnap.data();
      const createdAt = d.createdAt?.toDate?.() || null;
      return {
        id: docSnap.id,
        providerId: d.providerId || null,
        title: d.title,
        image: d.image,
        providerName: d.providerName,
        category: d.category,
        city: d.city,
        price: d.price,
        description: d.description,
        pricingType: d.pricingType,
        serviceSubcategory: d.serviceSubcategory,
        rating: d.rating,
        status: d.status || "ACTIVE",
        hiddenReason: d.hiddenReason,
        deletedReason: d.deletedReason,
        createdAt: createdAt ? createdAt.toISOString() : null,
      };
    };

    const reports = snap.docs.map((doc) => {
      const d = doc.data();
      const createdAt = d.createdAt?.toDate?.() || null;
      const adminSeenAt = d.adminSeenAt?.toDate?.() || null;
      const adminActionAt = d.adminActionAt?.toDate?.() || null;
      return {
        id: doc.id,
        listingId: d.listingId || "",
        reasons: Array.isArray(d.reasons) && d.reasons.length
          ? d.reasons
          : d.reason
            ? [d.reason]
            : [],
        reason: d.reason || "",
        description: d.description || "",
        reporterId: d.reporterId || null,
        reporterEmail: d.reporterEmail || null,
        reporterDisplayName: d.reporterDisplayName || null,
        createdAt: createdAt ? createdAt.toISOString() : null,
        adminSeen: d.adminSeen === true,
        adminSeenAt: adminSeenAt ? adminSeenAt.toISOString() : null,
        adminActionAt: adminActionAt ? adminActionAt.toISOString() : null,
      };
    });

    const listingIds = [...new Set(reports.map((r) => r.listingId).filter(Boolean))];
    const listingMap = {};
    await Promise.all(
      listingIds.map(async (lid) => {
        try {
          const s = await db.collection("services").doc(lid).get();
          const serialized = serializeService(s);
          if (serialized) listingMap[lid] = serialized;
        } catch (e) {
          if (isDevelopment) console.error("listing-reports service fetch:", lid, e?.message);
        }
      })
    );

    const merged = reports.map((r) => ({
      ...r,
      listing: r.listingId ? listingMap[r.listingId] || null : null,
    }));

    return res.json({ reports: merged });
  } catch (error) {
    if (isDevelopment) console.error("GET /api/admin/listing-reports:", error?.message || error);
    return res.status(500).json({ message: "تعذر تحميل الإشعارات." });
  }
});

router.post(
  "/listing-reports/:reportId/mark-seen",
  requireAuth,
  requireAdmin,
  async (req, res) => {
    const reportId = String(req.params.reportId || "").trim();
    if (!reportId) {
      return res.status(400).json({ message: "معرف الإشعار مطلوب." });
    }
    try {
      const ref = db.collection("listing_reports").doc(reportId);
      const snap = await ref.get();
      if (!snap.exists) {
        return res.status(404).json({ message: "لم يتم العثور على الإشعار." });
      }
      await ref.update({
        adminSeen: true,
        adminSeenAt: FieldValue.serverTimestamp(),
      });
      return res.json({ success: true });
    } catch (error) {
      if (isDevelopment) console.error("mark-seen:", error?.message || error);
      return res.status(500).json({ message: "تعذر إكمال العملية." });
    }
  }
);

router.post(
  "/listing-reports/:reportId/mark-action",
  requireAuth,
  requireAdmin,
  async (req, res) => {
    const reportId = String(req.params.reportId || "").trim();
    if (!reportId) {
      return res.status(400).json({ message: "معرف الإشعار مطلوب." });
    }
    try {
      const ref = db.collection("listing_reports").doc(reportId);
      const snap = await ref.get();
      if (!snap.exists) {
        return res.status(404).json({ message: "لم يتم العثور على الإشعار." });
      }
      await ref.update({
        adminSeen: true,
        adminSeenAt: FieldValue.serverTimestamp(),
        adminActionAt: FieldValue.serverTimestamp(),
      });
      return res.json({ success: true });
    } catch (error) {
      if (isDevelopment) console.error("mark-action:", error?.message || error);
      return res.status(500).json({ message: "تعذر إكمال العملية." });
    }
  }
);

router.get("/experts/pending", requireAuth, requireAdmin, async (req, res) => {
  try {
    const snap = await db
      .collection("service_providers")
      .where("isActive", "==", false)
      .get();

    const result = [];
    for (const docSnap of snap.docs) {
      const providerData = docSnap.data();
      const userSnap = await db.collection("users").doc(docSnap.id).get();
      const userData = userSnap.exists ? userSnap.data() : {};
      result.push({ id: docSnap.id, ...providerData, ...userData });
    }

    return res.json(result);
  } catch (error) {
    if (isDevelopment) console.error("GET /api/admin/experts/pending failed:", error.message);
    return res.status(500).json({ message: "تعذر تحميل طلبات الموافقة المعلقة." });
  }
});

router.get("/experts/approved", requireAuth, requireAdmin, async (req, res) => {
  try {
    const snap = await db
      .collection("service_providers")
      .where("isActive", "==", true)
      .get();

    const result = [];
    for (const docSnap of snap.docs) {
      const providerData = docSnap.data();
      const userSnap = await db.collection("users").doc(docSnap.id).get();
      const userData = userSnap.exists ? userSnap.data() : {};
      result.push({ id: docSnap.id, ...providerData, ...userData });
    }

    return res.json(result);
  } catch (error) {
    if (isDevelopment) console.error("GET /api/admin/experts/approved failed:", error.message);
    return res.status(500).json({ message: "تعذر تحميل الخبراء الموافق عليهم." });
  }
});

router.get("/experts/rejected", requireAuth, requireAdmin, async (req, res) => {
  try {
    const snap = await db
      .collection("rejected_experts")
      .orderBy("rejectionInfo.rejectedAt", "desc")
      .get();

    const rejectedExperts = snap.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    return res.json(rejectedExperts);
  } catch (error) {
    if (isDevelopment) console.error("GET /api/admin/experts/rejected failed:", error.message);
    return res.status(500).json({ message: "تعذر تحميل الخبراء المرفوضين." });
  }
});

router.get("/experts/:id", requireAuth, requireAdmin, async (req, res) => {
  const expertId = String(req.params.id || "").trim();
  if (!expertId) {
    return res.status(400).json({ message: "معرف الخبير مطلوب." });
  }

  try {
    let authMetadata = null;
    try {
      const authUser = await admin.auth().getUser(expertId);
      authMetadata = {
        uid: authUser.uid,
        email: authUser.email || null,
        disabled: !!authUser.disabled,
        lastSignInTime: authUser.metadata?.lastSignInTime || null,
        creationTime: authUser.metadata?.creationTime || null,
        lastRefreshTime: authUser.metadata?.lastRefreshTime || null,
      };
    } catch (error) {
      authMetadata = null;
    }

    const [providerSnap, userSnap] = await Promise.all([
      db.collection("service_providers").doc(expertId).get(),
      db.collection("users").doc(expertId).get(),
    ]);

    if (!providerSnap.exists && !userSnap.exists) {
      return res.status(404).json({ message: "لم يتم العثور على الخبير." });
    }

    const providerData = providerSnap.exists ? providerSnap.data() : {};
    const userData = userSnap.exists ? userSnap.data() : {};

    const expert = { id: expertId, ...providerData, ...userData };

    let listings = [];
    try {
      const servicesSnap = await db
        .collection("services")
        .where("providerId", "==", expertId)
        .limit(100)
        .get();

      listings = servicesSnap.docs.map((docSnap) => {
        const data = docSnap.data() || {};
        return {
          id: docSnap.id,
          title: data.title || "",
          category: data.category || "",
          serviceSubcategory: data.serviceSubcategory || "",
          serviceSubcategoryDetails: data.serviceSubcategoryDetails || "",
          city: data.city || "",
          price: data.price ?? null,
          rating: data.rating ?? null,
          reviews: data.reviews ?? null,
          duration: data.duration || "",
          description: data.description || "",
          image: data.image || null,
          createdAt: data.createdAt || null,
          updatedAt: data.updatedAt || null,
        };
      });
    } catch (error) {
      if (isDevelopment) console.warn("GET /api/admin/experts/:id listings fetch failed:", error.message);
    }

    let appointments = [];
    try {
      let appSnap = null;
      try {
        appSnap = await db
          .collection("appointments")
          .where("expertId", "==", expertId)
          .orderBy("approvedTime", "desc")
          .limit(50)
          .get();
      } catch (orderError) {
        appSnap = await db
          .collection("appointments")
          .where("expertId", "==", expertId)
          .limit(200)
          .get();
      }

      appointments = appSnap.docs.map((docSnap) => {
        const data = docSnap.data() || {};
        return {
          id: docSnap.id,
          status: data.status || null,
          date: data.date || null,
          start: data.start || null,
          end: data.end || null,
          client: data.client || data.customerName || null,
          phone: data.phone || null,
          email: data.email || null,
          fullAddress: data.fullAddress || data.address || null,
          note: data.note || null,
          createdBy: data.createdBy || null,
          createdTime: data.createdTime || null,
          approvedTime: data.approvedTime || null,
          expertRejectNote: data.expertRejectNote || null,
        };
      });

      appointments.sort((a, b) => {
        const aTime = Number(a.approvedTime || a.createdTime || 0);
        const bTime = Number(b.approvedTime || b.createdTime || 0);
        return bTime - aTime;
      });
    } catch (error) {
      if (isDevelopment) console.warn("GET /api/admin/experts/:id appointments fetch failed:", error.message);
    }

    const appointmentStats = appointments.reduce(
      (acc, item) => {
        acc.total += 1;
        const key = String(item.status || "unknown");
        acc.byStatus[key] = (acc.byStatus[key] || 0) + 1;
        return acc;
      },
      { total: 0, byStatus: {} }
    );

    const recentApproved = appointments
      .filter((a) => a.status === "approved")
      .slice(0, 10);

    return res.json({
      expert,
      authMetadata,
      listings,
      appointments,
      recentAppointments:
        recentApproved.length > 0 ? recentApproved : appointments.slice(0, 10),
      appointmentStats,
    });
  } catch (error) {
    if (isDevelopment) console.error("GET /api/admin/experts/:id failed:", error.message);
    return res.status(500).json({ message: "تعذر تحميل تفاصيل الخبير." });
  }
});

router.get("/clients", requireAuth, requireAdmin, async (req, res) => {
  try {
    const snap = await db
      .collection("users")
      .where("userType", "==", "CLIENT")
      .get();

    const result = await Promise.all(
      snap.docs.map(async (d) => {
        const userData = d.data() || {};
        let addresses = [];

        try {
          const addressesSnap = await db
            .collection("users")
            .doc(d.id)
            .collection("addresses")
            .get();

          addresses = addressesSnap.docs.map((addressDoc) => ({
            id: addressDoc.id,
            ...addressDoc.data(),
          }));
        } catch (addressError) {
          if (isDevelopment) console.warn("GET /api/admin/clients address fetch failed:", addressError.message);
        }

        const mainAddress =
          addresses.find((a) => a.id === userData.mainAddressId) ||
          addresses.find((a) => a.isMain === true) ||
          addresses[0] ||
          null;

        return {
          id: d.id,
          ...userData,
          addresses,
          mainAddress,
        };
      })
    );

    return res.json(result);
  } catch (error) {
    if (isDevelopment) console.error("GET /api/admin/clients failed:", error.message);
    return res.status(500).json({ message: "تعذر تحميل المستخدمين." });
  }
});

router.post("/experts/:id/approve", requireAuth, requireAdmin, async (req, res) => {
  const providerId = String(req.params.id || "").trim();
  if (!providerId) {
    return res.status(400).json({ message: "معرف الخبير مطلوب." });
  }

  try {
    await db.collection("service_providers").doc(providerId).update({
      isActive: true,
      approvedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    await db.collection("users").doc(providerId).update({
      userType: "PROVIDER",
      updatedAt: new Date().toISOString(),
      lastLoginAt: new Date().toISOString(),
    });

    const userSnap = await db.collection("users").doc(providerId).get();
    const userData = userSnap.exists ? userSnap.data() : {};

    await db.collection("notifications").add({
      userId: providerId,
      userEmail: userData.email || "",
      type: "expert_approved",
      title: "تمت الموافقة على طلب الخبير! 🎉",
      message: "تهانينا! تمت الموافقة على طلبك كخبير. يمكنك الآن نشر إعلاناتك وبدء تقديم الخدمات.",
      read: false,
      createdAt: new Date().toISOString(),
    });

    return res.json({ success: true, message: "تمت الموافقة على الخبير وإرسال الإشعار." });
  } catch (error) {
    if (isDevelopment) console.error("POST /api/admin/experts/:id/approve failed:", error.message);
    return res.status(500).json({ message: "تعذرت الموافقة على الخبير." });
  }
});

router.post("/experts/:id/reject", requireAuth, requireAdmin, async (req, res) => {
  const providerId = String(req.params.id || "").trim();
  const reason = String(req.body?.reason || "").trim();

  if (!providerId) {
    return res.status(400).json({ message: "معرف الخبير مطلوب." });
  }

  if (!reason) {
    return res.status(400).json({ message: "Red nedeni zorunludur." });
  }

  const bucket = admin.storage().bucket();
  const deletedItems = [];
  const failedItems = [];

  let adminDisplayName = "Admin";
  try {
    const adminUserSnap = await db.collection("users").doc(req.userId).get();
    if (adminUserSnap.exists) {
      adminDisplayName = adminUserSnap.data()?.displayName || "Admin";
    }
  } catch (e) {
    if (isDevelopment) console.error("Admin display name alınamadı:", e.message);
  }

  try {
    try {
      const [files] = await bucket.getFiles({
        prefix: `expert_documents/${providerId}/`,
      });
      for (const file of files) {
        await file.delete();
        deletedItems.push(file.name);
      }
    } catch (storageError) {
      failedItems.push(`expert_documents: ${storageError.message}`);
    }

    try {
      const [profilePhotos] = await bucket.getFiles({
        prefix: `profile_photos/${providerId}`,
      });
      for (const file of profilePhotos) {
        await file.delete();
        deletedItems.push(file.name);
      }
    } catch (storageError) {
      failedItems.push(`profile_photos: ${storageError.message}`);
    }

    try {
      const [portfolioFiles] = await bucket.getFiles({
        prefix: `portfolio/${providerId}/`,
      });
      for (const file of portfolioFiles) {
        await file.delete();
        deletedItems.push(file.name);
      }
    } catch (storageError) {
      failedItems.push(`portfolio: ${storageError.message}`);
    }

    const listingsSnap = await db
      .collection("services")
      .where("providerId", "==", providerId)
      .get();

    for (const docSnap of listingsSnap.docs) {
      try {
        const [listingFiles] = await bucket.getFiles({
          prefix: `service_images/${docSnap.id}/`,
        });
        for (const file of listingFiles) {
          await file.delete();
          deletedItems.push(file.name);
        }
      } catch (storageError) {
        failedItems.push(`service_images/${docSnap.id}: ${storageError.message}`);
      }

      await docSnap.ref.delete();
      deletedItems.push(`services/${docSnap.id}`);
    }

    const appointmentsSnap = await db
      .collection("appointments")
      .where("providerId", "==", providerId)
      .get();

    for (const docSnap of appointmentsSnap.docs) {
      await docSnap.ref.delete();
      deletedItems.push(`appointments/${docSnap.id}`);
    }

    const messagesSnap = await db
      .collection("messages")
      .where("receiverId", "==", providerId)
      .get();

    for (const docSnap of messagesSnap.docs) {
      await docSnap.ref.delete();
      deletedItems.push(`messages/${docSnap.id}`);
    }

    await db.collection("userFavorites").doc(providerId).delete();
    deletedItems.push(`userFavorites/${providerId}`);

    try {
      const notificationsSnap = await db
        .collection("notifications")
        .where("userId", "==", providerId)
        .get();

      for (const docSnap of notificationsSnap.docs) {
        await docSnap.ref.delete();
        deletedItems.push(`notifications/${docSnap.id}`);
      }
    } catch (notifError) {
      failedItems.push(`notifications cleanup: ${notifError.message}`);
    }

    const userDoc = await db.collection("users").doc(providerId).get();
    const userData = userDoc.exists ? userDoc.data() : {};

    const providerDoc = await db
      .collection("service_providers")
      .doc(providerId)
      .get();
    const providerData = providerDoc.exists ? providerDoc.data() : {};

    await db.collection("service_providers").doc(providerId).delete();
    deletedItems.push(`service_providers/${providerId}`);

    const rejectedExpertData = {
      userId: providerId,
      email: userData.email || "",
      displayName: userData.displayName || "",
      phoneNumber: userData.phoneNumber || "",
      businessName: providerData.businessName || "",
      category: providerData.category || "",
      city: providerData.city || "",
      experienceYears: providerData.experienceYears || 0,
      specialties: providerData.specialties || [],
      educationInfo: providerData.educationInfo || "",
      workingHours: providerData.workingHours || {},
      providerType: providerData.providerType || "individual",
      taxNumber: providerData.taxNumber || "",
      address: {
        addressName: providerData.addressName || "",
        city: providerData.city || "",
        district: providerData.district || "",
        neighborhood: providerData.neighborhood || "",
        street: providerData.street || "",
        siteName: providerData.siteName || "",
        apartmentName: providerData.apartmentName || "",
        blockName: providerData.blockName || "",
        buildingNo: providerData.buildingNo || "",
        floor: providerData.floor || "",
        doorNo: providerData.doorNo || "",
        lat: providerData.lat || null,
        lng: providerData.lng || null,
        location: providerData.location || "",
      },
      ocrResults: providerData.ocrResults || {},
      profileCompleted: providerData.profileCompleted || false,
      createdAt: providerData.createdAt || new Date().toISOString(),
      rejectionInfo: {
        reason: reason,
        rejectedBy: req.userEmail || req.userId,
        rejectedAt: new Date().toISOString(),
        rejectedByName: adminDisplayName,
      },
      originalData: {
        userData: userData,
        providerData: providerData,
      },
    };

    await db.collection("rejected_experts").doc(providerId).set(rejectedExpertData);
    deletedItems.push(`rejected_experts/${providerId} (created)`);

    const rejectedAt = new Date().toISOString();
    try {
      const notifRef = await db.collection("notifications").add({
        userId: providerId,
        userEmail: userData.email || "",
        type: "expert_rejected",
        title: "تم رفض طلب الخبير",
        message: reason,
        rejectedAt: rejectedAt,
        read: false,
        createdAt: new Date().toISOString(),
      });
      deletedItems.push(`notifications/${notifRef.id} (created)`);
    } catch (notifWriteError) {
      failedItems.push(`notification write: ${notifWriteError.message}`);
    }

    await db.collection("users").doc(providerId).update({
      userType: "CLIENT",
      profileCompleted: false,
      rejectionReason: reason,
      rejectedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    deletedItems.push(`users/${providerId} (type changed to CLIENT)`);

    return res.json({
      success: true,
      message: "تم رفض الطلب وحفظه في أرشيف الخبراء المرفوضين.",
      reason,
      deleted: deletedItems,
      failed: failedItems.length > 0 ? failedItems : undefined,
    });
  } catch (error) {
    if (isDevelopment) console.error("POST /api/admin/experts/:id/reject failed:", error.message);
    return res.status(500).json({
      success: false,
      message: "تعذر رفض الطلب.",
      error: error.message,
      deleted: deletedItems,
      failed: failedItems,
    });
  }
});

// ============ PERMANENT EXPERT DELETE HELPERS ============

function uniqueClean(values) {
  return [
    ...new Set(
      values
        .map((value) => String(value || "").trim())
        .filter(Boolean)
    ),
  ];
}

function chunkArray(items, size = 30) {
  const chunks = [];

  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }

  return chunks;
}

function addDocsToMap(refMap, docs) {
  docs.forEach((docSnap) => {
    refMap.set(docSnap.ref.path, docSnap.ref);
  });
}

async function collectByField(refMap, collectionName, field, value, failedItems) {
  const cleanValue = String(value || "").trim();

  if (!cleanValue) return;

  try {
    const snap = await db
      .collection(collectionName)
      .where(field, "==", cleanValue)
      .get();

    addDocsToMap(refMap, snap.docs);
  } catch (error) {
    failedItems.push(
      `${collectionName}.${field}: ${error?.message || error}`
    );
  }
}

async function collectByFields(refMap, collectionName, fields, value, failedItems) {
  for (const field of fields) {
    await collectByField(refMap, collectionName, field, value, failedItems);
  }
}

async function collectByFieldIn(refMap, collectionName, field, values, failedItems) {
  const cleanValues = uniqueClean(values);

  if (cleanValues.length === 0) return;

  for (const chunk of chunkArray(cleanValues, 30)) {
    try {
      const snap = await db
        .collection(collectionName)
        .where(field, "in", chunk)
        .get();

      addDocsToMap(refMap, snap.docs);
    } catch (error) {
      failedItems.push(
        `${collectionName}.${field} in: ${error?.message || error}`
      );
    }
  }
}

async function collectByFieldsIn(refMap, collectionName, fields, values, failedItems) {
  for (const field of fields) {
    await collectByFieldIn(refMap, collectionName, field, values, failedItems);
  }
}

async function collectByArrayContains(refMap, collectionName, field, value, failedItems) {
  const cleanValue = String(value || "").trim();

  if (!cleanValue) return;

  try {
    const snap = await db
      .collection(collectionName)
      .where(field, "array-contains", cleanValue)
      .get();

    addDocsToMap(refMap, snap.docs);
  } catch (error) {
    failedItems.push(
      `${collectionName}.${field} array-contains: ${error?.message || error}`
    );
  }
}

async function collectByArrayContainsAny(
  refMap,
  collectionName,
  field,
  values,
  failedItems
) {
  const cleanValues = uniqueClean(values);

  if (cleanValues.length === 0) return;

  for (const chunk of chunkArray(cleanValues, 30)) {
    try {
      const snap = await db
        .collection(collectionName)
        .where(field, "array-contains-any", chunk)
        .get();

      addDocsToMap(refMap, snap.docs);
    } catch (error) {
      failedItems.push(
        `${collectionName}.${field} array-contains-any: ${
          error?.message || error
        }`
      );
    }
  }
}

async function collectByDocumentIdPrefix(
  refMap,
  collectionName,
  prefix,
  failedItems
) {
  const cleanPrefix = String(prefix || "").trim();

  if (!cleanPrefix) return;

  try {
    const FieldPath = admin.firestore.FieldPath;

    const snap = await db
      .collection(collectionName)
      .where(FieldPath.documentId(), ">=", cleanPrefix)
      .where(FieldPath.documentId(), "<", `${cleanPrefix}\uf8ff`)
      .get();

    addDocsToMap(refMap, snap.docs);
  } catch (error) {
    failedItems.push(
      `${collectionName} documentId prefix ${cleanPrefix}: ${
        error?.message || error
      }`
    );
  }
}

async function recursiveDeleteDocument(ref, deletedItems, failedItems) {
  try {
    if (typeof db.recursiveDelete === "function") {
      await db.recursiveDelete(ref);
    } else {
      const subCollections = await ref.listCollections();

      for (const subCollection of subCollections) {
        await recursiveDeleteCollection(subCollection, deletedItems, failedItems);
      }

      await ref.delete();
    }

    deletedItems.push(ref.path);
  } catch (error) {
    failedItems.push(`${ref.path}: ${error?.message || error}`);
  }
}

async function recursiveDeleteCollection(collectionRef, deletedItems, failedItems) {
  while (true) {
    const snap = await collectionRef.limit(100).get();

    if (snap.empty) break;

    for (const docSnap of snap.docs) {
      await recursiveDeleteDocument(docSnap.ref, deletedItems, failedItems);
    }

    if (snap.size < 100) break;
  }
}

async function deleteRefMapForever(refMap, deletedItems, failedItems) {
  for (const ref of refMap.values()) {
    await recursiveDeleteDocument(ref, deletedItems, failedItems);
  }
}

async function deleteStoragePrefix(bucket, prefix, deletedItems, failedItems) {
  try {
    const [files] = await bucket.getFiles({ prefix });

    for (const file of files) {
      try {
        await file.delete();
        deletedItems.push(file.name);
      } catch (error) {
        failedItems.push(`${file.name}: ${error?.message || error}`);
      }
    }

    return files.length;
  } catch (error) {
    failedItems.push(`${prefix}: ${error?.message || error}`);
    return 0;
  }
}

async function removeListingsFromAllFavorites(listingIds, deletedItems, failedItems) {
  const cleanListingIds = uniqueClean(listingIds);

  if (cleanListingIds.length === 0) return 0;

  let updatedCount = 0;

  for (const chunk of chunkArray(cleanListingIds, 30)) {
    try {
      const snap = await db
        .collection("userFavorites")
        .where("favoritesIds", "array-contains-any", chunk)
        .get();

      if (snap.empty) continue;

      const batch = db.batch();

      snap.docs.forEach((docSnap) => {
        const updates = {
          favoritesIds: FieldValue.arrayRemove(...chunk),
          updatedAt: FieldValue.serverTimestamp(),
        };

        chunk.forEach((listingId) => {
          updates[`items.${listingId}`] = FieldValue.delete();
        });

        batch.set(docSnap.ref, updates, { merge: true });
        updatedCount += 1;
      });

      await batch.commit();

      deletedItems.push(
        `userFavorites cleanup for listings: ${chunk.join(", ")}`
      );
    } catch (error) {
      failedItems.push(
        `userFavorites cleanup: ${error?.message || error}`
      );
    }
  }

  return updatedCount;
}

// ============ PERMANENT EXPERT DELETE ROUTE ============

router.delete("/experts/:id", requireAuth, requireAdmin, async (req, res) => {
  const providerId = String(req.params.id || "").trim();

  if (!providerId) {
    return res.status(400).json({ message: "معرف الخبير مطلوب." });
  }

  if (providerId === req.userId) {
    return res.status(400).json({
      message: "لا يمكن للمدير حذف حسابه بهذه العملية.",
    });
  }

  const bucket = admin.storage().bucket();

  const deletedItems = [];
  const failedItems = [];

  try {
    const userRef = db.collection("users").doc(providerId);
    const providerRef = db.collection("service_providers").doc(providerId);

    const [userSnap, providerSnap] = await Promise.all([
      userRef.get(),
      providerRef.get(),
    ]);

    if (!userSnap.exists && !providerSnap.exists) {
      return res.status(404).json({
        success: false,
        message: "لم يتم العثور على حساب الخبير.",
      });
    }

    const userData = userSnap.exists ? userSnap.data() || {} : {};
    const providerData = providerSnap.exists ? providerSnap.data() || {} : {};

    const isExpert =
      userData.userType === "PROVIDER" ||
      userData.userType === "PENDING_PROVIDER" ||
      providerSnap.exists;

    if (!isExpert) {
      return res.status(400).json({
        success: false,
        message: "الحساب المحدد ليس حساب خبير.",
      });
    }

    const email = String(userData.email || providerData.email || "").trim();
    const phoneNumber = String(
      userData.phoneNumber || providerData.phoneNumber || ""
    ).trim();

    // 1) İlanları topla
    const listingsSnap = await db
      .collection("services")
      .where("providerId", "==", providerId)
      .get();

    const listingIds = listingsSnap.docs.map((docSnap) => docSnap.id);

    const serviceRefs = new Map();
    addDocsToMap(serviceRefs, listingsSnap.docs);

    // 2) Favorilerden bu uzmanın ilanlarını kaldır
    await removeListingsFromAllFavorites(listingIds, deletedItems, failedItems);

    // 3) Conversations ve inactive_conversations topla
    const conversationFields = [
      "providerId",
      "expertId",
      "providerUid",
      "expertUid",
      "sellerUid",
      "serviceProviderId",
      "createdBy",
      "createdByUid",
      "lastSenderUid",
      "receiverUid",
      "senderUid",
      "userId",
      "uid",
    ];

    const conversationArrayFields = [
      "participants",
      "participantIds",
      "members",
      "memberIds",
      "users",
      "userIds",
    ];

    const conversationRefs = new Map();
    const inactiveConversationRefs = new Map();

    await collectByFields(
      conversationRefs,
      "conversations",
      conversationFields,
      providerId,
      failedItems
    );

    await collectByFields(
      inactiveConversationRefs,
      "inactive_conversations",
      conversationFields,
      providerId,
      failedItems
    );

    for (const field of conversationArrayFields) {
      await collectByArrayContains(
        conversationRefs,
        "conversations",
        field,
        providerId,
        failedItems
      );

      await collectByArrayContains(
        inactiveConversationRefs,
        "inactive_conversations",
        field,
        providerId,
        failedItems
      );
    }

    await collectByFieldsIn(
      conversationRefs,
      "conversations",
      ["listingId", "serviceId"],
      listingIds,
      failedItems
    );

    await collectByFieldsIn(
      inactiveConversationRefs,
      "inactive_conversations",
      ["listingId", "serviceId"],
      listingIds,
      failedItems
    );

    const conversationIds = [
      ...Array.from(conversationRefs.values()).map((ref) => ref.id),
      ...Array.from(inactiveConversationRefs.values()).map((ref) => ref.id),
    ];

    // 4) Appointments topla
    const appointmentRefs = new Map();

    await collectByFields(
      appointmentRefs,
      "appointments",
      [
        "providerId",
        "expertId",
        "providerUid",
        "expertUid",
        "serviceProviderId",
        "userId",
        "uid",
        "createdBy",
        "createdByUid",
        "receiverUid",
        "senderUid",
      ],
      providerId,
      failedItems
    );

    await collectByFieldsIn(
      appointmentRefs,
      "appointments",
      ["listingId", "serviceId"],
      listingIds,
      failedItems
    );

    await collectByFieldsIn(
      appointmentRefs,
      "appointments",
      ["conversationId"],
      conversationIds,
      failedItems
    );

    const appointmentIds = Array.from(appointmentRefs.values()).map(
      (ref) => ref.id
    );

    // 5) Notifications topla
    const notificationRefs = new Map();

    await collectByFields(
      notificationRefs,
      "notifications",
      [
        "userId",
        "uid",
        "providerId",
        "expertId",
        "providerUid",
        "expertUid",
        "receiverUid",
        "senderUid",
        "targetUid",
        "createdBy",
        "createdByUid",
      ],
      providerId,
      failedItems
    );

    if (email) {
      await collectByFields(
        notificationRefs,
        "notifications",
        ["userEmail", "email", "receiverEmail", "senderEmail"],
        email,
        failedItems
      );
    }

    await collectByFieldsIn(
      notificationRefs,
      "notifications",
      ["listingId", "serviceId"],
      listingIds,
      failedItems
    );

    await collectByFieldsIn(
      notificationRefs,
      "notifications",
      ["appointmentId"],
      appointmentIds,
      failedItems
    );

    await collectByFieldsIn(
      notificationRefs,
      "notifications",
      ["conversationId"],
      conversationIds,
      failedItems
    );

    // 6) Listing reports
    const listingReportRefs = new Map();

    await collectByFields(
      listingReportRefs,
      "listing_reports",
      [
        "providerId",
        "expertId",
        "providerUid",
        "expertUid",
        "reportedProviderId",
        "reportedExpertId",
        "reporterId",
        "reporterUid",
      ],
      providerId,
      failedItems
    );

    await collectByFieldsIn(
      listingReportRefs,
      "listing_reports",
      ["listingId", "serviceId"],
      listingIds,
      failedItems
    );

    // 7) Reviews
    const reviewRefs = new Map();

    await collectByFields(
      reviewRefs,
      "reviews",
      [
        "providerId",
        "expertId",
        "providerUid",
        "expertUid",
        "reviewedUid",
        "reviewerUid",
        "userId",
        "uid",
      ],
      providerId,
      failedItems
    );

    await collectByFieldsIn(
      reviewRefs,
      "reviews",
      ["listingId", "serviceId"],
      listingIds,
      failedItems
    );

    await collectByFieldsIn(
      reviewRefs,
      "reviews",
      ["appointmentId"],
      appointmentIds,
      failedItems
    );

    // 8) Payments
    const paymentRefs = new Map();

    await collectByFields(
      paymentRefs,
      "payments",
      [
        "uid",
        "userId",
        "providerId",
        "expertId",
        "providerUid",
        "expertUid",
        "receiverUid",
        "senderUid",
        "payerUid",
        "ownerUid",
      ],
      providerId,
      failedItems
    );

    if (email) {
      await collectByFields(
        paymentRefs,
        "payments",
        ["email", "userEmail", "payerEmail", "providerEmail", "expertEmail"],
        email,
        failedItems
      );
    }

    await collectByFieldsIn(
      paymentRefs,
      "payments",
      ["listingId", "serviceId"],
      listingIds,
      failedItems
    );

    await collectByFieldsIn(
      paymentRefs,
      "payments",
      ["appointmentId"],
      appointmentIds,
      failedItems
    );

    // 9) Wallet history
    const walletHistoryRefs = new Map();

    await collectByFields(
      walletHistoryRefs,
      "wallet_history",
      [
        "uid",
        "userId",
        "providerId",
        "expertId",
        "providerUid",
        "expertUid",
        "receiverUid",
        "senderUid",
        "ownerUid",
      ],
      providerId,
      failedItems
    );

    // 10) Wallet transactions
    const walletTransactionRefs = new Map();

    await collectByFields(
      walletTransactionRefs,
      "wallet_transactions",
      [
        "uid",
        "userId",
        "providerId",
        "expertId",
        "providerUid",
        "expertUid",
        "receiverUid",
        "senderUid",
        "ownerUid",
      ],
      providerId,
      failedItems
    );

    // 11) Address change requests
    const addressRequestRefs = new Map();

    await collectByFields(
      addressRequestRefs,
      "address_change_requests",
      [
        "expertId",
        "providerId",
        "expertUid",
        "providerUid",
        "userId",
        "uid",
        "createdBy",
        "createdByUid",
      ],
      providerId,
      failedItems
    );

    if (email) {
      await collectByFields(
        addressRequestRefs,
        "address_change_requests",
        ["email", "userEmail"],
        email,
        failedItems
      );
    }

    // 12) Contacts + contact replies
    const contactRefs = new Map();

    await collectByFields(
      contactRefs,
      "contacts",
      [
        "uid",
        "userId",
        "providerId",
        "expertId",
        "providerUid",
        "expertUid",
        "senderUid",
        "receiverUid",
      ],
      providerId,
      failedItems
    );

    if (email) {
      await collectByFields(
        contactRefs,
        "contacts",
        ["email", "userEmail", "senderEmail", "receiverEmail"],
        email,
        failedItems
      );
    }

    if (phoneNumber) {
      await collectByFields(
        contactRefs,
        "contacts",
        ["phoneNumber", "phone"],
        phoneNumber,
        failedItems
      );
    }

    const contactIds = Array.from(contactRefs.values()).map((ref) => ref.id);

    const contactReplyRefs = new Map();

    await collectByFields(
      contactReplyRefs,
      "contact_replies",
      [
        "uid",
        "userId",
        "providerId",
        "expertId",
        "providerUid",
        "expertUid",
        "senderUid",
        "receiverUid",
      ],
      providerId,
      failedItems
    );

    await collectByFieldsIn(
      contactReplyRefs,
      "contact_replies",
      ["contactId"],
      contactIds,
      failedItems
    );

    if (email) {
      await collectByFields(
        contactReplyRefs,
        "contact_replies",
        ["email", "userEmail", "senderEmail", "receiverEmail"],
        email,
        failedItems
      );
    }

    // 13) provider_daily_delete_limits
    const providerDailyLimitRefs = new Map();

    await collectByFields(
      providerDailyLimitRefs,
      "provider_daily_delete_limits",
      ["providerId", "expertId", "providerUid", "expertUid", "uid", "userId"],
      providerId,
      failedItems
    );

    await collectByDocumentIdPrefix(
      providerDailyLimitRefs,
      "provider_daily_delete_limits",
      `${providerId}_`,
      failedItems
    );

    // 14) userFavorites الخاصة بالخبير نفسه
    const userFavoriteRefs = new Map();
    userFavoriteRefs.set(
      db.collection("userFavorites").doc(providerId).path,
      db.collection("userFavorites").doc(providerId)
    );

    // 15) Storage cleanup
    let deletedFileCount = 0;

    deletedFileCount += await deleteStoragePrefix(
      bucket,
      `profile_photos/${providerId}`,
      deletedItems,
      failedItems
    );

    deletedFileCount += await deleteStoragePrefix(
      bucket,
      `expert_documents/${providerId}/`,
      deletedItems,
      failedItems
    );

    deletedFileCount += await deleteStoragePrefix(
      bucket,
      `portfolio/${providerId}/`,
      deletedItems,
      failedItems
    );

    for (const listingId of listingIds) {
      deletedFileCount += await deleteStoragePrefix(
        bucket,
        `service_images/${listingId}/`,
        deletedItems,
        failedItems
      );
    }

    for (const conversationId of uniqueClean(conversationIds)) {
      deletedFileCount += await deleteStoragePrefix(
        bucket,
        `chat_attachments/${conversationId}/`,
        deletedItems,
        failedItems
      );

      deletedFileCount += await deleteStoragePrefix(
        bucket,
        `conversation_attachments/${conversationId}/`,
        deletedItems,
        failedItems
      );
    }

    // 16) Firestore delete order
    await deleteRefMapForever(notificationRefs, deletedItems, failedItems);
    await deleteRefMapForever(contactReplyRefs, deletedItems, failedItems);
    await deleteRefMapForever(contactRefs, deletedItems, failedItems);
    await deleteRefMapForever(listingReportRefs, deletedItems, failedItems);
    await deleteRefMapForever(reviewRefs, deletedItems, failedItems);
    await deleteRefMapForever(paymentRefs, deletedItems, failedItems);
    await deleteRefMapForever(walletHistoryRefs, deletedItems, failedItems);
    await deleteRefMapForever(walletTransactionRefs, deletedItems, failedItems);
    await deleteRefMapForever(addressRequestRefs, deletedItems, failedItems);
    await deleteRefMapForever(providerDailyLimitRefs, deletedItems, failedItems);
    await deleteRefMapForever(appointmentRefs, deletedItems, failedItems);
    await deleteRefMapForever(conversationRefs, deletedItems, failedItems);
    await deleteRefMapForever(inactiveConversationRefs, deletedItems, failedItems);
    await deleteRefMapForever(userFavoriteRefs, deletedItems, failedItems);
    await deleteRefMapForever(serviceRefs, deletedItems, failedItems);

    // users/{uid} ve service_providers/{uid} recursive silinir.
    // Böylece users/{uid}/addresses gibi subcollections da gider.
    await recursiveDeleteDocument(providerRef, deletedItems, failedItems);
    await recursiveDeleteDocument(userRef, deletedItems, failedItems);

    // 17) Firebase Auth delete
    try {
      await admin.auth().deleteUser(providerId);
      deletedItems.push(`auth/${providerId}`);
    } catch (authError) {
      if (authError?.code !== "auth/user-not-found") {
        failedItems.push(`auth/${providerId}: ${authError?.message || authError}`);
      }
    }

    return res.json({
      success: true,
      message: "تم حذف الخبير وجميع البيانات المرتبطة به نهائياً.",
      summary: {
        deletedListingsCount: listingIds.length,
        deletedAppointmentsCount: appointmentRefs.size,
        deletedConversationsCount:
          conversationRefs.size + inactiveConversationRefs.size,
        deletedNotificationsCount: notificationRefs.size,
        deletedReviewsCount: reviewRefs.size,
        deletedListingReportsCount: listingReportRefs.size,
        deletedPaymentsCount: paymentRefs.size,
        deletedWalletHistoryCount: walletHistoryRefs.size,
        deletedWalletTransactionsCount: walletTransactionRefs.size,
        deletedAddressRequestsCount: addressRequestRefs.size,
        deletedContactsCount: contactRefs.size,
        deletedContactRepliesCount: contactReplyRefs.size,
        deletedProviderDailyLimitsCount: providerDailyLimitRefs.size,
        deletedFileCount,
      },
      deleted: deletedItems,
      failed: failedItems.length > 0 ? failedItems : undefined,
    });
  } catch (error) {
    if (isDevelopment) {
      console.error(
        "DELETE /api/admin/experts/:id permanent delete failed:",
        error?.message || error
      );
    }

    return res.status(500).json({
      success: false,
      message: "تعذر حذف الخبير نهائياً.",
      error: error?.message || String(error),
      deleted: deletedItems,
      failed: failedItems,
    });
  }
});

// ============ PERMANENT CLIENT DELETE ROUTE ============

router.delete("/clients/:id", requireAuth, requireAdmin, async (req, res) => {
  const clientId = String(req.params.id || "").trim();

  if (!clientId) {
    return res.status(400).json({ message: "معرف المستخدم مطلوب." });
  }

  if (clientId === req.userId) {
    return res.status(400).json({
      message: "لا يمكن للمدير حذف حسابه بهذه العملية.",
    });
  }

  const bucket = admin.storage().bucket();

  const deletedItems = [];
  const failedItems = [];

  try {
    const userRef = db.collection("users").doc(clientId);
    const providerRef = db.collection("service_providers").doc(clientId);

    const [userSnap, providerSnap] = await Promise.all([
      userRef.get(),
      providerRef.get(),
    ]);

    if (!userSnap.exists) {
      return res.status(404).json({
        success: false,
        message: "لم يتم العثور على حساب المستخدم.",
      });
    }

    const userData = userSnap.data() || {};
    const providerData = providerSnap.exists ? providerSnap.data() || {} : {};

    const isProvider =
      userData.userType === "PROVIDER" ||
      userData.userType === "PENDING_PROVIDER" ||
      providerSnap.exists;

    if (isProvider) {
      return res.status(400).json({
        success: false,
        message:
          "هذا الحساب حساب خبير. يرجى استخدام عملية حذف الخبراء.",
      });
    }

    const email = String(userData.email || "").trim();
    const phoneNumber = String(userData.phoneNumber || "").trim();

    // 1) Client kendi yanlışlıkla provider listing oluşturmuşsa yine de topla
    const serviceRefs = new Map();

    const listingsSnap = await db
      .collection("services")
      .where("providerId", "==", clientId)
      .get();

    addDocsToMap(serviceRefs, listingsSnap.docs);

    const listingIds = listingsSnap.docs.map((docSnap) => docSnap.id);

    // 2) Conversations ve inactive_conversations topla
    const conversationRefs = new Map();
    const inactiveConversationRefs = new Map();

    const conversationFields = [
      "clientId",
      "clientUid",
      "customerId",
      "customerUid",
      "userId",
      "uid",
      "createdBy",
      "createdByUid",
      "lastSenderUid",
      "receiverUid",
      "senderUid",
      "buyerUid",
      "ownerUid",
    ];

    const conversationArrayFields = [
      "participants",
      "participantIds",
      "members",
      "memberIds",
      "users",
      "userIds",
    ];

    await collectByFields(
      conversationRefs,
      "conversations",
      conversationFields,
      clientId,
      failedItems
    );

    await collectByFields(
      inactiveConversationRefs,
      "inactive_conversations",
      conversationFields,
      clientId,
      failedItems
    );

    for (const field of conversationArrayFields) {
      await collectByArrayContains(
        conversationRefs,
        "conversations",
        field,
        clientId,
        failedItems
      );

      await collectByArrayContains(
        inactiveConversationRefs,
        "inactive_conversations",
        field,
        clientId,
        failedItems
      );
    }

    const conversationIds = [
      ...Array.from(conversationRefs.values()).map((ref) => ref.id),
      ...Array.from(inactiveConversationRefs.values()).map((ref) => ref.id),
    ];

    // 3) Appointments topla
    const appointmentRefs = new Map();

    await collectByFields(
      appointmentRefs,
      "appointments",
      [
        "clientId",
        "clientUid",
        "customerId",
        "customerUid",
        "userId",
        "uid",
        "createdBy",
        "createdByUid",
        "receiverUid",
        "senderUid",
        "buyerUid",
        "ownerUid",
      ],
      clientId,
      failedItems
    );

    if (email) {
      await collectByFields(
        appointmentRefs,
        "appointments",
        ["clientEmail", "customerEmail", "email", "userEmail"],
        email,
        failedItems
      );
    }

    if (phoneNumber) {
      await collectByFields(
        appointmentRefs,
        "appointments",
        ["clientPhone", "customerPhone", "phone", "phoneNumber"],
        phoneNumber,
        failedItems
      );
    }

    await collectByFieldsIn(
      appointmentRefs,
      "appointments",
      ["conversationId"],
      conversationIds,
      failedItems
    );

    await collectByFieldsIn(
      appointmentRefs,
      "appointments",
      ["listingId", "serviceId"],
      listingIds,
      failedItems
    );

    const appointmentIds = Array.from(appointmentRefs.values()).map(
      (ref) => ref.id
    );

    // 4) Notifications topla
    const notificationRefs = new Map();

    await collectByFields(
      notificationRefs,
      "notifications",
      [
        "userId",
        "uid",
        "clientId",
        "clientUid",
        "customerId",
        "customerUid",
        "receiverUid",
        "senderUid",
        "targetUid",
        "createdBy",
        "createdByUid",
        "buyerUid",
        "ownerUid",
      ],
      clientId,
      failedItems
    );

    if (email) {
      await collectByFields(
        notificationRefs,
        "notifications",
        ["userEmail", "email", "receiverEmail", "senderEmail", "clientEmail"],
        email,
        failedItems
      );
    }

    await collectByFieldsIn(
      notificationRefs,
      "notifications",
      ["appointmentId"],
      appointmentIds,
      failedItems
    );

    await collectByFieldsIn(
      notificationRefs,
      "notifications",
      ["conversationId"],
      conversationIds,
      failedItems
    );

    await collectByFieldsIn(
      notificationRefs,
      "notifications",
      ["listingId", "serviceId"],
      listingIds,
      failedItems
    );

    // 5) Reviews topla
    const reviewRefs = new Map();

    await collectByFields(
      reviewRefs,
      "reviews",
      [
        "userId",
        "uid",
        "clientId",
        "clientUid",
        "customerId",
        "customerUid",
        "reviewerUid",
        "reviewedUid",
        "createdBy",
        "createdByUid",
      ],
      clientId,
      failedItems
    );

    await collectByFieldsIn(
      reviewRefs,
      "reviews",
      ["appointmentId"],
      appointmentIds,
      failedItems
    );

    await collectByFieldsIn(
      reviewRefs,
      "reviews",
      ["conversationId"],
      conversationIds,
      failedItems
    );

    // 6) Listing reports topla
    const listingReportRefs = new Map();

    await collectByFields(
      listingReportRefs,
      "listing_reports",
      [
        "userId",
        "uid",
        "clientId",
        "clientUid",
        "customerId",
        "customerUid",
        "reporterId",
        "reporterUid",
        "createdBy",
        "createdByUid",
      ],
      clientId,
      failedItems
    );

    if (email) {
      await collectByFields(
        listingReportRefs,
        "listing_reports",
        ["reporterEmail", "email", "userEmail"],
        email,
        failedItems
      );
    }

    // 7) Payments topla
    const paymentRefs = new Map();

    await collectByFields(
      paymentRefs,
      "payments",
      [
        "uid",
        "userId",
        "clientId",
        "clientUid",
        "customerId",
        "customerUid",
        "payerUid",
        "buyerUid",
        "ownerUid",
        "receiverUid",
        "senderUid",
      ],
      clientId,
      failedItems
    );

    if (email) {
      await collectByFields(
        paymentRefs,
        "payments",
        ["email", "userEmail", "payerEmail", "clientEmail", "customerEmail"],
        email,
        failedItems
      );
    }

    await collectByFieldsIn(
      paymentRefs,
      "payments",
      ["appointmentId"],
      appointmentIds,
      failedItems
    );

    await collectByFieldsIn(
      paymentRefs,
      "payments",
      ["conversationId"],
      conversationIds,
      failedItems
    );

    // 8) Wallet history
    const walletHistoryRefs = new Map();

    await collectByFields(
      walletHistoryRefs,
      "wallet_history",
      [
        "uid",
        "userId",
        "clientId",
        "clientUid",
        "customerId",
        "customerUid",
        "ownerUid",
        "receiverUid",
        "senderUid",
      ],
      clientId,
      failedItems
    );

    // 9) Wallet transactions
    const walletTransactionRefs = new Map();

    await collectByFields(
      walletTransactionRefs,
      "wallet_transactions",
      [
        "uid",
        "userId",
        "clientId",
        "clientUid",
        "customerId",
        "customerUid",
        "ownerUid",
        "receiverUid",
        "senderUid",
      ],
      clientId,
      failedItems
    );

    // 10) Contacts
    const contactRefs = new Map();

    await collectByFields(
      contactRefs,
      "contacts",
      [
        "uid",
        "userId",
        "clientId",
        "clientUid",
        "customerId",
        "customerUid",
        "senderUid",
        "receiverUid",
        "createdBy",
        "createdByUid",
      ],
      clientId,
      failedItems
    );

    if (email) {
      await collectByFields(
        contactRefs,
        "contacts",
        ["email", "userEmail", "senderEmail", "receiverEmail"],
        email,
        failedItems
      );
    }

    if (phoneNumber) {
      await collectByFields(
        contactRefs,
        "contacts",
        ["phoneNumber", "phone"],
        phoneNumber,
        failedItems
      );
    }

    const contactIds = Array.from(contactRefs.values()).map((ref) => ref.id);

    // 11) Contact replies
    const contactReplyRefs = new Map();

    await collectByFields(
      contactReplyRefs,
      "contact_replies",
      [
        "uid",
        "userId",
        "clientId",
        "clientUid",
        "customerId",
        "customerUid",
        "senderUid",
        "receiverUid",
        "createdBy",
        "createdByUid",
      ],
      clientId,
      failedItems
    );

    await collectByFieldsIn(
      contactReplyRefs,
      "contact_replies",
      ["contactId"],
      contactIds,
      failedItems
    );

    if (email) {
      await collectByFields(
        contactReplyRefs,
        "contact_replies",
        ["email", "userEmail", "senderEmail", "receiverEmail"],
        email,
        failedItems
      );
    }

    // 12) Address change requests
    const addressRequestRefs = new Map();

    await collectByFields(
      addressRequestRefs,
      "address_change_requests",
      [
        "uid",
        "userId",
        "clientId",
        "clientUid",
        "customerId",
        "customerUid",
        "createdBy",
        "createdByUid",
      ],
      clientId,
      failedItems
    );

    if (email) {
      await collectByFields(
        addressRequestRefs,
        "address_change_requests",
        ["email", "userEmail"],
        email,
        failedItems
      );
    }

    // 13) User favorites الخاصة بالعميل
    const userFavoriteRefs = new Map();
    userFavoriteRefs.set(
      db.collection("userFavorites").doc(clientId).path,
      db.collection("userFavorites").doc(clientId)
    );

    // 14) Storage cleanup
    let deletedFileCount = 0;

    deletedFileCount += await deleteStoragePrefix(
      bucket,
      `profile_photos/${clientId}`,
      deletedItems,
      failedItems
    );

    deletedFileCount += await deleteStoragePrefix(
      bucket,
      `user_documents/${clientId}/`,
      deletedItems,
      failedItems
    );

    deletedFileCount += await deleteStoragePrefix(
      bucket,
      `client_documents/${clientId}/`,
      deletedItems,
      failedItems
    );

    for (const conversationId of uniqueClean(conversationIds)) {
      deletedFileCount += await deleteStoragePrefix(
        bucket,
        `chat_attachments/${conversationId}/`,
        deletedItems,
        failedItems
      );

      deletedFileCount += await deleteStoragePrefix(
        bucket,
        `conversation_attachments/${conversationId}/`,
        deletedItems,
        failedItems
      );
    }

    // إذا وُجدت services بالخطأ باسم العميل، احذف صورها أيضًا
    for (const listingId of listingIds) {
      deletedFileCount += await deleteStoragePrefix(
        bucket,
        `service_images/${listingId}/`,
        deletedItems,
        failedItems
      );
    }

    // 15) Firestore delete order
    await deleteRefMapForever(notificationRefs, deletedItems, failedItems);
    await deleteRefMapForever(contactReplyRefs, deletedItems, failedItems);
    await deleteRefMapForever(contactRefs, deletedItems, failedItems);
    await deleteRefMapForever(listingReportRefs, deletedItems, failedItems);
    await deleteRefMapForever(reviewRefs, deletedItems, failedItems);
    await deleteRefMapForever(paymentRefs, deletedItems, failedItems);
    await deleteRefMapForever(walletHistoryRefs, deletedItems, failedItems);
    await deleteRefMapForever(walletTransactionRefs, deletedItems, failedItems);
    await deleteRefMapForever(addressRequestRefs, deletedItems, failedItems);
    await deleteRefMapForever(appointmentRefs, deletedItems, failedItems);
    await deleteRefMapForever(conversationRefs, deletedItems, failedItems);
    await deleteRefMapForever(inactiveConversationRefs, deletedItems, failedItems);
    await deleteRefMapForever(userFavoriteRefs, deletedItems, failedItems);
    await deleteRefMapForever(serviceRefs, deletedItems, failedItems);

    // users/{uid} recursive silinir.
    // Böylece users/{uid}/addresses gibi subcollections da gider.
    await recursiveDeleteDocument(userRef, deletedItems, failedItems);

    // Safety: لو كان عنده provider doc بالغلط، احذفه أيضًا
    if (providerSnap.exists) {
      await recursiveDeleteDocument(providerRef, deletedItems, failedItems);
    }

    // 16) Firebase Auth delete
    try {
      await admin.auth().deleteUser(clientId);
      deletedItems.push(`auth/${clientId}`);
    } catch (authError) {
      if (authError?.code !== "auth/user-not-found") {
        failedItems.push(`auth/${clientId}: ${authError?.message || authError}`);
      }
    }

    return res.json({
      success: true,
      message: "تم حذف المستخدم وجميع البيانات المرتبطة به نهائياً.",
      summary: {
        deletedAppointmentsCount: appointmentRefs.size,
        deletedConversationsCount:
          conversationRefs.size + inactiveConversationRefs.size,
        deletedNotificationsCount: notificationRefs.size,
        deletedReviewsCount: reviewRefs.size,
        deletedListingReportsCount: listingReportRefs.size,
        deletedPaymentsCount: paymentRefs.size,
        deletedWalletHistoryCount: walletHistoryRefs.size,
        deletedWalletTransactionsCount: walletTransactionRefs.size,
        deletedAddressRequestsCount: addressRequestRefs.size,
        deletedContactsCount: contactRefs.size,
        deletedContactRepliesCount: contactReplyRefs.size,
        deletedUserFavoritesCount: userFavoriteRefs.size,
        deletedAccidentalListingsCount: serviceRefs.size,
        deletedFileCount,
      },
      deleted: deletedItems,
      failed: failedItems.length > 0 ? failedItems : undefined,
    });
  } catch (error) {
    if (isDevelopment) {
      console.error(
        "DELETE /api/admin/clients/:id permanent delete failed:",
        error?.message || error
      );
    }

    return res.status(500).json({
      success: false,
      message: "تعذر حذف المستخدم نهائياً.",
      error: error?.message || String(error),
      deleted: deletedItems,
      failed: failedItems,
    });
  }
});

router.get("/deleted-accounts/providers", requireAuth, requireAdmin, async (req, res) => {
  try {
    const snap = await db
      .collection("deleted_accounts")
      .where("userType", "==", "PROVIDER")
      .get();

    const result = sortDeletedAccountsByDateDesc(
      snap.docs.map((docSnap) => mapDeletedAccountDoc(docSnap))
    );

    return res.json(result);
  } catch (error) {
    if (isDevelopment) console.error("GET /api/admin/deleted-accounts/providers failed:", error.message);
    return res.status(500).json({ message: "تعذر تحميل حسابات الخبراء المحذوفة." });
  }
});

router.get("/deleted-accounts/clients", requireAuth, requireAdmin, async (req, res) => {
  try {
    const snap = await db
      .collection("deleted_accounts")
      .where("userType", "==", "CLIENT")
      .get();

    const result = sortDeletedAccountsByDateDesc(
      snap.docs.map((docSnap) => mapDeletedAccountDoc(docSnap))
    );

    return res.json(result);
  } catch (error) {
    if (isDevelopment) console.error("GET /api/admin/deleted-accounts/clients failed:", error.message);
    return res.status(500).json({ message: "تعذر تحميل حسابات المستخدمين المحذوفة." });
  }
});

router.post("/deleted-accounts/:id/restore-provider", requireAuth, requireAdmin, async (req, res) => {
  const providerId = String(req.params.id || "").trim();

  if (!providerId) {
    return res.status(400).json({ message: "معرف الخبير مطلوب." });
  }

  try {
    const deletedRef = db.collection("deleted_accounts").doc(providerId);
    const deletedSnap = await deletedRef.get();

    if (!deletedSnap.exists) {
      return res.status(404).json({ message: "لم يتم العثور على حساب خبير مؤرشف." });
    }

    const deletedData = deletedSnap.data() || {};

    if (deletedData.userType !== "PROVIDER") {
      return res.status(400).json({ message: "هذا السجل ليس حساب خبير." });
    }

    const userData = deletedData.userData || {};
    const providerData = deletedData.providerData || {};
    const deletedListings = Array.isArray(deletedData.deletedListings)
      ? deletedData.deletedListings
      : [];
    const authSnapshot = deletedData.authSnapshot || null;
    const originalLoginMethods = getOriginalLoginMethods(deletedData);
    const hasGoogle = originalLoginMethods.includes("google");

    const userRef = db.collection("users").doc(providerId);
    const providerRef = db.collection("service_providers").doc(providerId);

    const [existingUserSnap, existingProviderSnap] = await Promise.all([
      userRef.get(),
      providerRef.get(),
    ]);

    if (existingUserSnap.exists || existingProviderSnap.exists) {
      return res.status(409).json({
        message: "يوجد بالفعل مستخدم أو خبير نشط بهذا المعرف.",
      });
    }

    const restoredEmail = normalizeEmail(
      userData.email || authSnapshot?.email || deletedData.reservedEmail || ""
    );

    const restoredPhoneNumber = normalizeTrPhoneToE164(
      userData.phoneNumber ||
        authSnapshot?.phoneNumber ||
        deletedData.reservedPhoneNumber ||
        ""
    );

    const restoredDisplayName =
      userData.displayName ||
      authSnapshot?.displayName ||
      providerData.businessName ||
      "Restored User";

    const gmailBasedRestore = isGmailAddress(restoredEmail);

    let authExists = false;
    try {
      await admin.auth().getUser(providerId);
      authExists = true;
    } catch (error) {
      if (error?.code !== "auth/user-not-found") {
        throw error;
      }
    }

    let tempPassword = null;
    let restoredLoginMethod = "";
    let pendingGoogleRelink = false;

    if (gmailBasedRestore) {
      if (!authExists) {
        return res.status(409).json({
          message: "تم ضبط حساب Gmail هذا بدون إنشاء كلمة مرور مؤقتة جديدة، لكن لم يتم العثور على سجل المصادقة الحالي. يرجى استعادته يدوياً عبر الدعم.",
        });
      }

      const updatePayload = {
        displayName: restoredDisplayName,
        disabled: false,
        emailVerified: true,
      };

      if (restoredEmail) updatePayload.email = restoredEmail;
      if (restoredPhoneNumber) updatePayload.phoneNumber = restoredPhoneNumber;

      await admin.auth().updateUser(providerId, updatePayload);

      restoredLoginMethod = "existing_credentials";
    } else {
      tempPassword = makeTempPassword();
      restoredLoginMethod = hasGoogle ? "password_recovery_for_google" : "password";
      pendingGoogleRelink = !authExists && hasGoogle;

      if (authExists) {
        const updatePayload = {
          displayName: restoredDisplayName,
          disabled: false,
          emailVerified: true,
          password: tempPassword,
        };

        if (restoredEmail) updatePayload.email = restoredEmail;
        if (restoredPhoneNumber) updatePayload.phoneNumber = restoredPhoneNumber;

        await admin.auth().updateUser(providerId, updatePayload);
      } else {
        const createPayload = {
          uid: providerId,
          email: restoredEmail || undefined,
          phoneNumber: restoredPhoneNumber || undefined,
          displayName: restoredDisplayName,
          disabled: false,
          emailVerified: true,
          password: tempPassword,
        };

        Object.keys(createPayload).forEach((key) => {
          if (createPayload[key] === undefined) {
            delete createPayload[key];
          }
        });

        await admin.auth().createUser(createPayload);
      }
    }

    const restoredUserData = {
      ...userData,
      uid: providerId,
      userType: "PROVIDER",
      email: restoredEmail || userData.email || null,
      phoneNumber: restoredPhoneNumber || userData.phoneNumber || null,
      displayName: restoredDisplayName,
      authProvider: gmailBasedRestore ? inferPrimaryProvider(originalLoginMethods) || null : "password",
      authProviders: gmailBasedRestore ? uniqueProviders(originalLoginMethods) : authExists ? uniqueProviders([...originalLoginMethods, "password"]) : ["password"],
      previousAuthProviders: !gmailBasedRestore && !authExists ? uniqueProviders(originalLoginMethods) : [],
      pendingGoogleRelink: !gmailBasedRestore && !authExists && pendingGoogleRelink,
      updatedAt: new Date().toISOString(),
      restoredAt: new Date().toISOString(),
      restoredByAdminAt: new Date().toISOString(),
    };

    const restoredProviderData = {
      ...providerData,
      isActive: typeof providerData.isActive === "boolean" ? providerData.isActive : true,
      updatedAt: new Date().toISOString(),
      restoredAt: new Date().toISOString(),
    };

    const batch = db.batch();

    batch.set(userRef, restoredUserData, { merge: true });
    batch.set(providerRef, restoredProviderData, { merge: true });

    for (const listing of deletedListings) {
      const listingId = String(listing.id || "").trim();
      if (!listingId) continue;

      const { id, ...listingData } = listing;
      const listingRef = db.collection("services").doc(listingId);

      const previousStatusBeforeRestore = String(
        listingData.status || "ACTIVE"
      ).trim().toUpperCase();

      batch.set(
        listingRef,
        {
          ...listingData,
          providerId,
          status: "UNPUBLISHED",
          previousStatusBeforeRestore,
          restoredFromDeletedAccount: true,
          unpublishedReason: "ACCOUNT_RESTORED_REVIEW_REQUIRED",
          restoredAt: FieldValue.serverTimestamp(),
          unpublishedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }

    batch.delete(deletedRef);
    await batch.commit();

    return res.json({
      success: true,
      message: "تمت استعادة حساب الخبير بنجاح.",
      restoredListingsCount: deletedListings.length,
      tempPassword,
      restoredLoginMethod,
      pendingGoogleRelink,
    });
  } catch (error) {
    if (isDevelopment) console.error("POST /api/admin/deleted-accounts/:id/restore-provider failed:", error.message);
    return res.status(500).json({
      message: "تعذرت استعادة حساب الخبير.",
    });
  }
});

router.post("/deleted-accounts/:id/restore-client", requireAuth, requireAdmin, async (req, res) => {
  const clientId = String(req.params.id || "").trim();

  if (!clientId) {
    return res.status(400).json({ message: "معرف العميل مطلوب." });
  }

  try {
    const deletedRef = db.collection("deleted_accounts").doc(clientId);
    const deletedSnap = await deletedRef.get();

    if (!deletedSnap.exists) {
      return res.status(404).json({ message: "لم يتم العثور على حساب مستخدم مؤرشف." });
    }

    const deletedData = deletedSnap.data() || {};

    if (deletedData.userType !== "CLIENT") {
      return res.status(400).json({ message: "هذا السجل ليس حساب عميل." });
    }

    const userData = deletedData.userData || {};
    const authSnapshot = deletedData.authSnapshot || null;
    const originalLoginMethods = getOriginalLoginMethods(deletedData);
    const hasGoogle = originalLoginMethods.includes("google");

    const userRef = db.collection("users").doc(clientId);
    const existingUserSnap = await userRef.get();

    if (existingUserSnap.exists) {
      return res.status(409).json({
        message: "يوجد بالفعل مستخدم نشط بهذا المعرف.",
      });
    }

    const restoredEmail = normalizeEmail(
      userData.email || authSnapshot?.email || deletedData.reservedEmail || ""
    );

    const restoredPhoneNumber = normalizeTrPhoneToE164(
      userData.phoneNumber ||
        authSnapshot?.phoneNumber ||
        deletedData.reservedPhoneNumber ||
        ""
    );

    const restoredDisplayName =
      userData.displayName ||
      authSnapshot?.displayName ||
      "Restored Client";

    const gmailBasedRestore = isGmailAddress(restoredEmail);

    let authExists = false;
    try {
      await admin.auth().getUser(clientId);
      authExists = true;
    } catch (error) {
      if (error?.code !== "auth/user-not-found") {
        throw error;
      }
    }

    let tempPassword = null;
    let restoredLoginMethod = "";
    let pendingGoogleRelink = false;

    if (gmailBasedRestore) {
      if (!authExists) {
        return res.status(409).json({
          message: "تم ضبط حساب Gmail هذا بدون إنشاء كلمة مرور مؤقتة جديدة، لكن لم يتم العثور على سجل المصادقة الحالي. يرجى استعادته يدوياً عبر الدعم.",
        });
      }

      const updatePayload = {
        displayName: restoredDisplayName,
        disabled: false,
        emailVerified: true,
      };

      if (restoredEmail) updatePayload.email = restoredEmail;
      if (restoredPhoneNumber) updatePayload.phoneNumber = restoredPhoneNumber;

      await admin.auth().updateUser(clientId, updatePayload);

      restoredLoginMethod = "existing_credentials";
    } else {
      tempPassword = makeTempPassword();
      restoredLoginMethod = hasGoogle ? "password_recovery_for_google" : "password";
      pendingGoogleRelink = !authExists && hasGoogle;

      if (authExists) {
        const updatePayload = {
          displayName: restoredDisplayName,
          disabled: false,
          emailVerified: true,
          password: tempPassword,
        };

        if (restoredEmail) updatePayload.email = restoredEmail;
        if (restoredPhoneNumber) updatePayload.phoneNumber = restoredPhoneNumber;

        await admin.auth().updateUser(clientId, updatePayload);
      } else {
        const createPayload = {
          uid: clientId,
          email: restoredEmail || undefined,
          phoneNumber: restoredPhoneNumber || undefined,
          displayName: restoredDisplayName,
          disabled: false,
          emailVerified: true,
          password: tempPassword,
        };

        Object.keys(createPayload).forEach((key) => {
          if (createPayload[key] === undefined) {
            delete createPayload[key];
          }
        });

        await admin.auth().createUser(createPayload);
      }
    }

    const restoredUserData = {
      ...userData,
      uid: clientId,
      userType: "CLIENT",
      email: restoredEmail || userData.email || null,
      phoneNumber: restoredPhoneNumber || userData.phoneNumber || null,
      displayName: restoredDisplayName,
      authProvider: gmailBasedRestore ? inferPrimaryProvider(originalLoginMethods) || null : "password",
      authProviders: gmailBasedRestore ? uniqueProviders(originalLoginMethods) : authExists ? uniqueProviders([...originalLoginMethods, "password"]) : ["password"],
      previousAuthProviders: !gmailBasedRestore && !authExists ? uniqueProviders(originalLoginMethods) : [],
      pendingGoogleRelink: !gmailBasedRestore && !authExists && pendingGoogleRelink,
      updatedAt: new Date().toISOString(),
      restoredAt: new Date().toISOString(),
      restoredByAdminAt: new Date().toISOString(),
    };

    await userRef.set(restoredUserData, { merge: true });
    await deletedRef.delete();

    return res.json({
      success: true,
      message: "تمت استعادة حساب المستخدم بنجاح.",
      restoredListingsCount: 0,
      tempPassword,
      restoredLoginMethod,
      pendingGoogleRelink,
    });
  } catch (error) {
    if (isDevelopment) console.error("POST /api/admin/deleted-accounts/:id/restore-client failed:", error.message);
    return res.status(500).json({
      message: "تعذرت استعادة حساب المستخدم.",
    });
  }
});

// ============ ADRES DEĞİŞİKLİK TALEPLERİ ROUTE'LARI ============

router.post("/address-requests/:id/approve", requireAuth, requireAdmin, async (req, res) => {
  const requestId = String(req.params.id || "").trim();
  
  if (!requestId) {
    return res.status(400).json({ message: "معرف الطلب مطلوب." });
  }

  try {
    const requestRef = db.collection("address_change_requests").doc(requestId);
    const requestSnap = await requestRef.get();

    if (!requestSnap.exists) {
      return res.status(404).json({ message: "لم يتم العثور على الطلب." });
    }

    const requestData = requestSnap.data();

    if (requestData.status !== "PENDING") {
      return res.status(400).json({ message: "تمت معالجة هذا الطلب مسبقاً." });
    }

    await requestRef.update({
      status: "APPROVED",
      approvedAt: admin.firestore.FieldValue.serverTimestamp(),
      approvedBy: req.userId,
      approvedByEmail: req.userEmail
    });

    await db.collection("notifications").add({
      userId: requestData.expertId,
      userEmail: requestData.userEmail || "",
      type: "address_change_approved",
      title: "تمت الموافقة على طلب تغيير العنوان",
      message: "تمت الموافقة على طلب تغيير العنوان من الإدارة. يمكنك تحديث عنوانك الجديد من ملفك الشخصي.",
      requestId: requestId,
      read: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    return res.json({ success: true, message: "تمت الموافقة على الطلب." });
  } catch (error) {
    if (isDevelopment) console.error("Onaylama hatası:", error);
    return res.status(500).json({ message: "حدث خطأ أثناء الموافقة." });
  }
});

router.post("/address-requests/:id/reject", requireAuth, requireAdmin, async (req, res) => {
  const requestId = String(req.params.id || "").trim();
  const { reason } = req.body;

  if (!requestId) {
    return res.status(400).json({ message: "معرف الطلب مطلوب." });
  }

  if (!reason || reason.trim().length < 3) {
    return res.status(400).json({ message: "يجب أن يكون سبب الرفض 3 أحرف على الأقل." });
  }

  try {
    const requestRef = db.collection("address_change_requests").doc(requestId);
    const requestSnap = await requestRef.get();

    if (!requestSnap.exists) {
      return res.status(404).json({ message: "لم يتم العثور على الطلب." });
    }

    const requestData = requestSnap.data();

    if (requestData.status !== "PENDING") {
      return res.status(400).json({ message: "تمت معالجة هذا الطلب مسبقاً." });
    }

    await requestRef.update({
      status: "REJECTED",
      rejectionReason: reason.trim(),
      rejectedAt: admin.firestore.FieldValue.serverTimestamp(),
      rejectedBy: req.userId,
      rejectedByEmail: req.userEmail
    });

    await db.collection("notifications").add({
      userId: requestData.expertId,
      userEmail: requestData.userEmail || "",
      type: "address_change_rejected",
      title: "تم رفض طلب تغيير العنوان",
      message: `تم رفض طلب تغيير العنوان. سبب الرفض: ${reason}`,
      requestId: requestId,
      read: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    return res.json({ success: true, message: "Talep reddedildi." });
  } catch (error) {
    if (isDevelopment) console.error("Reddetme hatası:", error);
    return res.status(500).json({ message: "حدث خطأ أثناء الرفض." });
  }
});

module.exports = router;
