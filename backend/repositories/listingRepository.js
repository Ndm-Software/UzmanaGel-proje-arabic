// backend/repositories/listingRepository.js
// Low-level Firestore access for the listings (services collection).
// Extracted from app.js (Step 5).
//
// This file contains:
//   1. Provider listing count helpers (active-limit checks used by POST/PATCH/PUT)
//   2. Re-exports of listingsStore.js functions (listListings, getListingById,
//      getListingsByIds, getListingsMeta) for the controller to import from one place.
//
// The root listingsStore.js remains as a compatibility bridge.

const { db } = require("../config/firebaseAdmin");

// ── Provider listing count helpers ────────────────────────────────────────────

/**
 * countProviderListingsInCategoryCaseInsensitive
 * All statuses — used only where total (not just active) count matters.
 */
async function countProviderListingsInCategoryCaseInsensitive({
  providerId,
  category,
  excludeListingId = null,
  scanLimit = 200,
}) {
  const normalized = String(category || "").trim().toLowerCase();
  if (!providerId || !normalized) return 0;

  const snap = await db
    .collection("services")
    .where("providerId", "==", providerId)
    .limit(scanLimit)
    .get();

  return snap.docs.reduce((acc, docSnap) => {
    if (excludeListingId && docSnap.id === excludeListingId) return acc;
    const docCategory = String(docSnap.data()?.category || "")
      .trim()
      .toLowerCase();
    return docCategory === normalized ? acc + 1 : acc;
  }, 0);
}

/**
 * countActiveProviderListingsInCategoryCaseInsensitive
 * ACTIVE listings only — category match.
 */
async function countActiveProviderListingsInCategoryCaseInsensitive({
  providerId,
  category,
  excludeListingId = null,
  scanLimit = 200,
}) {
  const normalized = String(category || "").trim().toLowerCase();
  if (!providerId || !normalized) return 0;

  const snap = await db
    .collection("services")
    .where("providerId", "==", providerId)
    .where("status", "==", "ACTIVE")
    .limit(scanLimit)
    .get();

  return snap.docs.reduce((acc, docSnap) => {
    if (excludeListingId && docSnap.id === excludeListingId) return acc;
    const docCategory = String(docSnap.data()?.category || "")
      .trim()
      .toLowerCase();
    return docCategory === normalized ? acc + 1 : acc;
  }, 0);
}

/**
 * countActiveProviderListingsInSpecialtyCaseInsensitive
 * ACTIVE listings only — category + serviceSubcategory match.
 * Used for the per-specialty limit (max 2 active per specialty).
 */
async function countActiveProviderListingsInSpecialtyCaseInsensitive({
  providerId,
  category,
  serviceSubcategory,
  excludeListingId = null,
  scanLimit = 200,
}) {
  const normalizedCategory = String(category || "").trim().toLowerCase();
  const normalizedSpecialty = String(serviceSubcategory || "").trim().toLowerCase();
  if (!providerId || !normalizedCategory || !normalizedSpecialty) return 0;

  const snap = await db
    .collection("services")
    .where("providerId", "==", providerId)
    .where("status", "==", "ACTIVE")
    .limit(scanLimit)
    .get();

  return snap.docs.reduce((acc, docSnap) => {
    if (excludeListingId && docSnap.id === excludeListingId) return acc;
    const data = docSnap.data() || {};
    const docCategory = String(data.category || "").trim().toLowerCase();
    const docSpecialty = String(data.serviceSubcategory || "")
      .trim()
      .toLowerCase();
    return docCategory === normalizedCategory && docSpecialty === normalizedSpecialty
      ? acc + 1
      : acc;
  }, 0);
}

/**
 * countActiveProviderListings
 * Total ACTIVE listings for a provider — used for the 10-listing cap.
 */
async function countActiveProviderListings({
  providerId,
  excludeListingId = null,
  scanLimit = 11,
}) {
  if (!providerId) return 0;

  const snap = await db
    .collection("services")
    .where("providerId", "==", providerId)
    .where("status", "==", "ACTIVE")
    .limit(scanLimit)
    .get();

  return snap.docs.reduce((acc, docSnap) => {
    if (excludeListingId && docSnap.id === excludeListingId) return acc;
    return acc + 1;
  }, 0);
}

// ── Re-export listingsStore functions ─────────────────────────────────────────
// listingsStore.js handles the combined Firestore + static-JSON query logic.
// The controller imports everything from here so it has a single import point.
const {
  listListings,
  getListingById,
  getListingsByIds,
  getListingsMeta,
} = require("../listingsStore");

module.exports = {
  // Count helpers
  countProviderListingsInCategoryCaseInsensitive,
  countActiveProviderListingsInCategoryCaseInsensitive,
  countActiveProviderListingsInSpecialtyCaseInsensitive,
  countActiveProviderListings,
  // Query functions (delegated to listingsStore)
  listListings,
  getListingById,
  getListingsByIds,
  getListingsMeta,
};
