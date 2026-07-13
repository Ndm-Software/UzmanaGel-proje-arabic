// listingStore.js file code 

const fs = require("fs");
const path = require("path");
const { getDistanceFromLatLonInKm, sortByDistance } = require("./utils/distanceUtils");
const { getDrivingRouteInfo } = require("./utils/routeUtils");

const isDevelopment = process.env.NODE_ENV === 'development';

const expertDataPath = path.resolve(
  __dirname,
  "..",
  "frontend",
  "public",
  "expert-data.json"
);

function loadExpertData() {
  try {
    const source = fs.readFileSync(expertDataPath, "utf8");
    const data = JSON.parse(source);
    return data;
  } catch (error) {
    if (isDevelopment) console.error("expert-data.json okunamadı:", error.message);
    return { categories: [], listings: [] };
  }
}

function specialtyNameFromEntry(entry) {
  if (entry == null) return "";
  if (typeof entry === "string") return String(entry).trim();
  if (typeof entry === "object") {
    const name = entry.name ?? entry.label ?? entry.title;
    if (name != null) return String(name).trim();
  }
  return "";
}

function loadCategoriesFromExpertData() {
  const data = loadExpertData();
  if (Array.isArray(data.categories)) {
    return data.categories.map(cat => cat.name);
  }
  return [];
}

/** Kategori adı (küçük harf) → uzmanlık adları; expert-data.json kaynak listesi */
function loadSpecialtiesByCategoryFromExpertData() {
  const data = loadExpertData();
  if (!Array.isArray(data.categories)) return {};

  return data.categories.reduce((acc, cat) => {
    const categoryKey = String(cat?.name || "").trim().toLowerCase();
    const expertise = Array.isArray(cat?.expertise) ? cat.expertise : [];
    if (!categoryKey) return acc;

    acc[categoryKey] = new Set(
      expertise.map((entry) => specialtyNameFromEntry(entry)).filter(Boolean)
    );
    return acc;
  }, {});
}

function mergeSpecialtySets(...sources) {
  const merged = {};
  for (const source of sources) {
    if (!source || typeof source !== "object") continue;
    for (const [category, values] of Object.entries(source)) {
      const key = String(category || "").trim().toLowerCase();
      if (!key) continue;
      if (!merged[key]) merged[key] = new Set();
      const iterable = values instanceof Set ? values : Array.isArray(values) ? values : [];
      for (const entry of iterable) {
        const name = specialtyNameFromEntry(entry);
        if (name) merged[key].add(name);
      }
    }
  }
  return merged;
}

function loadRawListings() {
  const data = loadExpertData();
  if (Array.isArray(data.listings)) {
    return data.listings;
  }
  return [];
}

function normalizeNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toMillis(value) {
  if (!value) return null;
  if (typeof value?.toMillis === "function") return value.toMillis();
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeString(value) {
  return String(value || "").trim();
}

function normalizeImageCrop(value) {
  const raw = value && typeof value === "object" ? value : {};
  const x = Number(raw.x);
  const y = Number(raw.y);
  const scale = Number(raw.scale);

  return {
    x: Number.isFinite(x) ? Math.min(100, Math.max(0, x)) : 50,
    y: Number.isFinite(y) ? Math.min(100, Math.max(0, y)) : 50,
    scale: Number.isFinite(scale) ? Math.min(2.5, Math.max(1, scale)) : 1,
  };
}

function listingWithSortSeed(item, sortSeed) {
  return {
    ...item,
    _sortSeed: sortSeed,
    _createdAtMs: toMillis(item.createdAt) || null,
  };
}

function toListingSummary(item) {
  return {
    id: item.id,
    title: item.title,
    category: item.category,
    serviceSubcategory: item.serviceSubcategory || "",
    serviceSubcategoryDetails: item.serviceSubcategoryDetails || "",
    city: item.city || "",
    rating: item.rating,
    reviews: item.reviews,
    price: item.price,
    image: item.image,
    imageCrop: normalizeImageCrop(item.imageCrop),
    expertName: item.expertName,
    providerId: item.providerId || null,
    description: item.description || "",
    duration: item.duration || "",
    pricingType: item.pricingType || item.duration || "",
    distanceKm: item.distanceKm ?? null,
    driveDurationMin: item.driveDurationMin ?? null,
    providerLat: item.providerLat ?? null,
    providerLng: item.providerLng ?? null,
    status: item.status || "ACTIVE",
  };
}

async function mapWithConcurrency(items, mapper, maxConcurrency = 6) {
  const safeConcurrency = Math.max(1, Math.min(20, Number(maxConcurrency) || 6));
  const results = new Array(items.length);
  let nextIndex = 0;

  const workers = Array.from({ length: Math.min(safeConcurrency, items.length) }, async () => {
    while (true) {
      const i = nextIndex++;
      if (i >= items.length) return;
      results[i] = await mapper(items[i], i);
    }
  });

  await Promise.all(workers);
  return results;
}

function hasCoords(item) {
  const lat = Number(item?.providerLat ?? item?.lat);
  const lng = Number(item?.providerLng ?? item?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

async function attachDrivingDistance(items, userLat, userLng) {
  const lat = Number(userLat);
  const lng = Number(userLng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return items.map((item) => ({ ...item, distanceKm: null, driveDurationMin: null }));
  }

  return mapWithConcurrency(items, async (item) => {
    const coords = hasCoords(item);
    if (!coords) return { ...item, distanceKm: null, driveDurationMin: null };

    const route = await getDrivingRouteInfo(lat, lng, coords.lat, coords.lng);
    if (route) {
      return {
        ...item,
        providerLat: item.providerLat ?? coords.lat,
        providerLng: item.providerLng ?? coords.lng,
        distanceKm: route.distanceKm,
        driveDurationMin: route.durationMin,
      };
    }

    const fallbackKm = getDistanceFromLatLonInKm(lat, lng, coords.lat, coords.lng);
    return {
      ...item,
      providerLat: item.providerLat ?? coords.lat,
      providerLng: item.providerLng ?? coords.lng,
      distanceKm: fallbackKm,
      driveDurationMin: null,
    };
  });
}

function applyFilters(items, query) {
  const q = String(query.q || "").trim().toLowerCase();
  const category = String(query.category || "").trim().toLowerCase();
  const serviceSubcategory = String(query.serviceSubcategory || "").trim().toLowerCase();
  const city = String(query.city || "").trim().toLowerCase();
  const minPrice = normalizeNumber(query.minPrice);
  const maxPrice = normalizeNumber(query.maxPrice);

  let result = [...items];

  if (q) {
    result = result.filter((item) => {
      return (
        String(item.title || "").toLowerCase().includes(q) ||
        String(item.category || "").toLowerCase().includes(q) ||
        String(item.serviceSubcategory || "").toLowerCase().includes(q) ||
        String(item.city || "").toLowerCase().includes(q) ||
        String(item.expertName || "").toLowerCase().includes(q) ||
        String(item.description || "").toLowerCase().includes(q)
      );
    });
  }

  if (category) {
    result = result.filter(
      (item) => String(item.category || "").toLowerCase() === category
    );
  }

  if (serviceSubcategory) {
    result = result.filter(
      (item) => String(item.serviceSubcategory || "").trim().toLowerCase() === serviceSubcategory
    );
  }

  if (city) {
    result = result.filter((item) =>
      String(item.city || "").toLowerCase().includes(city)
    );
  }

  if (minPrice !== null) {
    result = result.filter((item) => Number(item.price) >= minPrice);
  }

  if (maxPrice !== null) {
    result = result.filter((item) => Number(item.price) <= maxPrice);
  }

  return result;
}

function applySort(items, sort) {
  const sorted = [...items];
  const addressText = (item) =>
    [item.city, item.serviceSubcategory, item.title]
      .map((part) => String(part || "").trim())
      .filter(Boolean)
      .join(" ");

  switch (sort) {
    case "price_asc":
      sorted.sort((a, b) => Number(a.price) - Number(b.price));
      break;
    case "price_desc":
      sorted.sort((a, b) => Number(b.price) - Number(a.price));
      break;
    case "created_asc":
      sorted.sort((a, b) => Number(a._createdAtMs || 0) - Number(b._createdAtMs || 0));
      break;
    case "created_desc":
      sorted.sort((a, b) => Number(b._createdAtMs || 0) - Number(a._createdAtMs || 0));
      break;
    case "address_az":
      sorted.sort((a, b) => addressText(a).localeCompare(addressText(b), "ar"));
      break;
    case "address_za":
      sorted.sort((a, b) => addressText(b).localeCompare(addressText(a), "ar"));
      break;
    case "rating_desc":
      sorted.sort((a, b) => Number(b.rating) - Number(a.rating));
      break;
    case "reviews_desc":
      sorted.sort((a, b) => Number(b.reviews) - Number(a.reviews));
      break;
    case "distance_asc":
      return sortByDistance(sorted, 'asc');
    case "distance_desc":
      return sortByDistance(sorted, 'desc');
    default:
      sorted.sort((a, b) => Number(a._sortSeed || 0) - Number(b._sortSeed || 0));
  }
  return sorted;
}

async function loadFirestoreListings(db, userLat = null, userLng = null) {
  const servicesSnap = await db.collection("services").get();
  const providersSnap = await db.collection("service_providers").get();
  const providerMap = new Map();

  providersSnap.forEach((docSnap) => {
    const data = docSnap.data() || {};
    providerMap.set(docSnap.id, {
      lat: normalizeNumber(data.lat),
      lng: normalizeNumber(data.lng),
    });
  });

  const items = [];

  for (const docSnap of servicesSnap.docs) {
    const data = docSnap.data() || {};
    const providerId = data.providerId;
    const providerCoords = providerMap.get(providerId) || { lat: null, lng: null };

    items.push({
      id: docSnap.id,
      title: normalizeString(data.title),
      category: normalizeString(data.category),
      serviceSubcategory: normalizeString(data.serviceSubcategory),
      serviceSubcategoryDetails: normalizeString(data.serviceSubcategoryDetails),
      city: normalizeString(data.city),
      rating: normalizeNumber(data.rating) ?? 0,
      reviews: normalizeNumber(data.reviews) ?? 0,
      price: normalizeNumber(data.price) ?? 0,
      image: normalizeString(data.image) || null,
      imageCrop: normalizeImageCrop(data.imageCrop),
      expertName: normalizeString(data.providerName),
      providerId: providerId || null,
      description: normalizeString(data.description),
      duration: normalizeString(data.duration),
      pricingType: normalizeString(data.pricingType) || normalizeString(data.duration),
      providerLat: providerCoords.lat,
      providerLng: providerCoords.lng,
      lat: providerCoords.lat,
      lng: providerCoords.lng,
      createdAt: data.createdAt || null,
      _createdAtMs: toMillis(data.createdAt) || 0,
      status: normalizeString(data.status) || "ACTIVE",
    });
  }

  items.sort((a, b) => (b._createdAtMs || 0) - (a._createdAtMs || 0));
  return items;
}

// RATE LIMIT
let requestCount = 0;
let lastResetTime = Date.now();
const RATE_LIMIT_MAX = 100;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;

function checkRateLimit() {
  const now = Date.now();
  if (now - lastResetTime >= RATE_LIMIT_WINDOW_MS) {
    requestCount = 0;
    lastResetTime = now;
  }
  
  if (requestCount >= RATE_LIMIT_MAX) {
    throw new Error("RATE_LIMIT_EXCEEDED");
  }
  
  requestCount++;
}

async function listListings(db, query = {}) {
  checkRateLimit();
  
  const userLat = query.lat ? parseFloat(query.lat) : null;
  const userLng = query.lng ? parseFloat(query.lng) : null;

  const staticListings = loadRawListings().map((item, index) =>
    listingWithSortSeed(item, 100000 + index)
  );
  const firestoreListings = (await loadFirestoreListings(db, userLat, userLng)).map((item, index) =>
    listingWithSortSeed(item, index)
  );
  const all = [...firestoreListings, ...staticListings];

  const visibleForPublic = all.filter((item) => {
    const status = String(item.status || "ACTIVE").toUpperCase();
    return status === "ACTIVE";
  });

  const filtered = applyFilters(visibleForPublic, query);

  const page = Math.max(1, parseInt(query.page || "1", 10));
  const limit = Math.max(1, Math.min(50, parseInt(query.limit || "12", 10)));

  const sort = String(query.sort || "");
  const isDistanceSort = sort === "distance_asc" || sort === "distance_desc";

  let sorted = filtered;

  if (isDistanceSort) {
    const enriched = await attachDrivingDistance(filtered, userLat, userLng);
    sorted = applySort(enriched, sort);
  } else {
    sorted = applySort(filtered, sort);
  }

  const total = sorted.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * limit;
  const end = start + limit;

  const pageItems = sorted.slice(start, end);
  const finalItems = isDistanceSort ? pageItems : await attachDrivingDistance(pageItems, userLat, userLng);
  const items = finalItems.map(toListingSummary);

  return {
    items,
    page: safePage,
    limit,
    total,
    totalPages,
  };
}

// ✅ DÜZELTİLMİŞ getListingById FONKSİYONU
async function getListingById(db, id) {
  checkRateLimit();
  
  const rawId = String(id || "").trim();
  if (!rawId) return null;

  // Firestore'dan services koleksiyonunda ara (tek koleksiyon)
  try {
    const snap = await db.collection("services").doc(rawId).get();
    
    if (snap.exists) {
      const data = snap.data() || {};
      return {
        id: snap.id,
        title: normalizeString(data.title),
        category: normalizeString(data.category),
        serviceSubcategory: normalizeString(data.serviceSubcategory),
        serviceSubcategoryDetails: normalizeString(data.serviceSubcategoryDetails),
        city: normalizeString(data.city),
        rating: normalizeNumber(data.rating) ?? 0,
        reviews: normalizeNumber(data.reviews) ?? 0,
        price: normalizeNumber(data.price) ?? 0,
        image: normalizeString(data.image) || null,
        imageCrop: normalizeImageCrop(data.imageCrop),
        expertName: normalizeString(data.providerName),
        providerId: normalizeString(data.providerId) || null,
        description: normalizeString(data.description),
        duration: normalizeString(data.duration),
        pricingType: normalizeString(data.pricingType) || normalizeString(data.duration),
        status: normalizeString(data.status) || "ACTIVE",
        createdAt: data.createdAt || null,
        updatedAt: data.updatedAt || null,
        unpublishedAt: data.unpublishedAt || null,
        deletedAt: data.deletedAt || null,
      };
    }
  } catch (error) {
    if (isDevelopment) console.error("getListingById Firestore hatası:", error.message);
  }

  // Static JSON'dan ara (sayısal ID'ler için - eski sistem)
  if (/^\d+$/.test(rawId)) {
    const numericId = Number(rawId);
    const all = loadRawListings();
    const found = all.find((item) => Number(item.id) === numericId);
    if (found) return found;
  }

  return null;
}

async function getListingsByIds(db, ids) {
  checkRateLimit();
  
  const uniqueIds = [...new Set(ids.map((id) => String(id).trim()).filter(Boolean))];
  if (!uniqueIds.length) return [];

  const staticIds = uniqueIds.filter((id) => /^\d+$/.test(id)).map((id) => Number(id));
  const firestoreIds = uniqueIds.filter((id) => !/^\d+$/.test(id));

  const staticAll = loadRawListings();
  const staticMap = new Map(staticAll.map((item) => [Number(item.id), toListingSummary(item)]));
  const staticItems = staticIds.map((id) => staticMap.get(id)).filter(Boolean);

  const firestoreItems = [];
  for (const id of firestoreIds) {
    const item = await getListingById(db, id);
    if (item) firestoreItems.push(toListingSummary(item));
  }

  const resultMap = new Map();
  [...firestoreItems, ...staticItems].forEach((item) => {
    resultMap.set(String(item.id), item);
  });
  return uniqueIds.map((id) => resultMap.get(String(id))).filter(Boolean);
}

async function getListingsMeta(db) {
  checkRateLimit();
  
  const categories = loadCategoriesFromExpertData();
  
  const staticAll = loadRawListings();
  const firestoreAll = await loadFirestoreListings(db);
  const all = [...firestoreAll, ...staticAll];
  const cities = [...new Set(all.map((item) => item.city).filter(Boolean))].sort();
  
  const fromExpertData = loadSpecialtiesByCategoryFromExpertData();

  const providersSnap = await db.collection("service_providers").get();
  const fromProviders = providersSnap.docs.reduce((acc, docSnap) => {
    const data = docSnap.data() || {};
    const rawCategory = String(data?.category || "").trim();
    const category = rawCategory.split(",")[0]?.trim().toLowerCase();
    const specialties = Array.isArray(data?.specialties) ? data.specialties : [];
    if (!category) return acc;
    for (const s of specialties) {
      const specialty = specialtyNameFromEntry(s);
      if (!specialty) continue;
      if (!acc[category]) acc[category] = new Set();
      acc[category].add(specialty);
    }
    return acc;
  }, {});

  const fromListings = {};
  all.forEach((item) => {
    const category = String(item?.category || "").trim().toLowerCase();
    const specialty = String(item?.serviceSubcategory || "").trim();
    if (!category || !specialty) return;
    if (!fromListings[category]) fromListings[category] = new Set();
    fromListings[category].add(specialty);
  });

  const specialtiesByCategory = mergeSpecialtySets(
    fromExpertData,
    fromProviders,
    fromListings
  );

  const specialtiesByCategoryObject = Object.fromEntries(
    Object.entries(specialtiesByCategory).map(([cat, set]) => [
      cat,
      [...set].sort(),
    ])
  );
  const specialties = [...new Set(Object.values(specialtiesByCategoryObject).flat())].sort();

  return {
    categories,
    specialties,
    specialtiesByCategory: specialtiesByCategoryObject,
    cities,
    total: all.length,
  };
}

module.exports = {
  listListings,
  getListingById,
  getListingsByIds,
  getListingsMeta,
};
