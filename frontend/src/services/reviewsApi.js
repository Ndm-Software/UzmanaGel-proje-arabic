import { collection, getCountFromServer, getDocs, limit, orderBy, query, where, getDoc, doc } from "firebase/firestore";
import { db } from "../firebase/firebaseClient";

const isDevelopment = process.env.NODE_ENV === "development";

function normalizeNumber(val, fallback = 0) {
  const n = Number(val);
  return Number.isFinite(n) ? n : fallback;
}

function sortByCreatedAtDesc(items = []) {
  return [...items].sort((a, b) => {
    const aMs = a?.createdAt?.toMillis ? a.createdAt.toMillis() : Date.parse(String(a?.createdAt || "")) || 0;
    const bMs = b?.createdAt?.toMillis ? b.createdAt.toMillis() : Date.parse(String(b?.createdAt || "")) || 0;
    return bMs - aMs;
  });
}

async function getActiveListingIdsByExpert(expertId) {
  const cleanId = String(expertId || "").trim();
  if (!cleanId) return new Set();
  
  try {
    const q = query(
      collection(db, "services"),
      where("providerId", "==", cleanId),
      where("status", "==", "ACTIVE") 
    );
    const snap = await getDocs(q);
    const ids = new Set();
    snap.docs.forEach(doc => ids.add(doc.id));
    return ids;
  } catch (e) {
    if (isDevelopment) console.warn("getActiveListingIdsByExpert failed:", e?.message);
    return new Set();
  }
}

export async function fetchExpertReviews(
  expertId,
  { pageSize = 20, includeInactiveListings = false } = {}
) {
  const cleanId = String(expertId || "").trim();
  if (!cleanId) return [];

  try {
    const shouldFilterByActiveListing = !includeInactiveListings;
    // Varsayılan davranış: sadece uzmanın aktif ilanlarına ait yorumlar
    const activeListingIds = shouldFilterByActiveListing
      ? await getActiveListingIdsByExpert(expertId)
      : null;
    if (shouldFilterByActiveListing && activeListingIds.size === 0) return [];
    
    // Tüm yorumları çek
    const q = query(
      collection(db, "reviews"),
      where("expertId", "==", cleanId),
      orderBy("createdAt", "desc"),
      limit(Math.max(1, Math.min(100, Number(pageSize) || 20)))
    );

    const snap = await getDocs(q);
    const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    
    if (!shouldFilterByActiveListing) return items;

    // Sadece aktif ilanlara ait yorumları filtrele
    return items.filter((item) => activeListingIds.has(item.listingId));
  } catch (e) {
    // createdAt index yoksa fallback: sadece where + client-side sort
    if (isDevelopment) console.warn("fetchExpertReviews fallback:", e?.message);
    try {
      const shouldFilterByActiveListing = !includeInactiveListings;
      const activeListingIds = shouldFilterByActiveListing
        ? await getActiveListingIdsByExpert(expertId)
        : null;
      if (shouldFilterByActiveListing && activeListingIds.size === 0) return [];
      
      const q2 = query(
        collection(db, "reviews"),
        where("expertId", "==", cleanId),
        limit(Math.max(1, Math.min(100, Number(pageSize) || 20)))
      );
      const snap2 = await getDocs(q2);
      const items2 = snap2.docs.map((d) => ({ id: d.id, ...d.data() }));
      const sorted = sortByCreatedAtDesc(items2);
      if (!shouldFilterByActiveListing) return sorted;
      return sorted.filter((item) => activeListingIds.has(item.listingId));
    } catch {
      return [];
    }
  }
}

export async function fetchListingReviews(listingId, { pageSize = 10 } = {}) {
  const cleanId = String(listingId || "").trim();
  if (!cleanId) return [];

  try {
    // İlanın var olup olmadığını kontrol et (status ACTIVE veya UNPUBLISHED)
    const listingRef = doc(db, "services", cleanId);
    const listingSnap = await getDoc(listingRef);
    if (!listingSnap.exists()) return [];
    
    const listingData = listingSnap.data();
    const status = String(listingData?.status || "").toUpperCase();
    if (status !== "ACTIVE" && status !== "UNPUBLISHED") return [];

    const q = query(
      collection(db, "reviews"),
      where("listingId", "==", cleanId),
      orderBy("createdAt", "desc"),
      limit(Math.max(1, Math.min(50, Number(pageSize) || 10)))
    );

    const snap = await getDocs(q);
    const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    return items;
  } catch (e) {
    if (isDevelopment) console.warn("fetchListingReviews fallback:", e?.message);
    try {
      const q2 = query(
        collection(db, "reviews"),
        where("listingId", "==", cleanId),
        limit(Math.max(1, Math.min(50, Number(pageSize) || 10)))
      );
      const snap2 = await getDocs(q2);
      const items2 = snap2.docs.map((d) => ({ id: d.id, ...d.data() }));
      return sortByCreatedAtDesc(items2);
    } catch {
      return [];
    }
  }
}

export async function fetchExpertReviewStats(
  expertId,
  { includeInactiveListings = false } = {}
) {
  const cleanId = String(expertId || "").trim();
  if (!cleanId) return { count: 0, avg: 0 };

  try {
    const items = await fetchExpertReviews(cleanId, {
      pageSize: 200,
      includeInactiveListings,
    });
    const summary = computeRatingSummary(items);
    return { count: summary.count, avg: summary.avg };
  } catch {
    return { count: 0, avg: 0 };
  }
}

export async function fetchListingReviewStats(listingId) {
  const cleanId = String(listingId || "").trim();
  if (!cleanId) return { count: 0, avg: 0 };

  let count = 0;
  try {
    const countSnap = await getCountFromServer(
      query(collection(db, "reviews"), where("listingId", "==", cleanId))
    );
    count = Number(countSnap.data().count || 0);
  } catch (e) {
    if (isDevelopment) console.warn("fetchListingReviewStats count failed:", e?.message);
  }

  try {
    const items = await fetchListingReviews(cleanId, { pageSize: 50 });
    const summary = computeRatingSummary(items);
    return { count: count || summary.count, avg: summary.avg };
  } catch {
    return { count, avg: 0 };
  }
}

export async function fetchReviewCountsForListings(listingIds = []) {
  const ids = Array.isArray(listingIds)
    ? [...new Set(listingIds.map((x) => String(x || "").trim()).filter(Boolean))]
    : [];
  if (!ids.length) return {};

  const counts = {};

  const chunkSize = 10; // Firestore "in" limiti
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    try {
      const q = query(
        collection(db, "reviews"),
        where("listingId", "in", chunk)
      );
      const snap = await getDocs(q);
      snap.docs.forEach((d) => {
        const data = d.data() || {};
        const listingId = String(data.listingId || "").trim();
        if (!listingId) return;
        counts[listingId] = (counts[listingId] || 0) + 1;
      });
    } catch (e) {
      if (isDevelopment) console.warn("fetchReviewCountsForListings failed:", e?.message);
      // Sessizce geç: mevcut services.reviews değerleri kullanılsın
    }
  }

  return counts;
}

export function computeRatingSummary(reviews = []) {
  const list = Array.isArray(reviews) ? reviews : [];
  const count = list.length;
  if (!count) return { avg: 0, count: 0 };

  const sum = list.reduce((acc, r) => acc + normalizeNumber(r?.rating, 0), 0);
  const avg = Number((sum / count).toFixed(2));
  return { avg, count };
}