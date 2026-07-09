import { auth } from "../firebase/firebaseClient";
import { db } from "../firebase/firebaseClient";
import { collection, query, where, getDocs, writeBatch, doc } from "firebase/firestore";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000";

// Production'da VITE_API_BASE_URL tanımlı değilse uyar
if (!import.meta.env.VITE_API_BASE_URL && process.env.NODE_ENV === 'production') {
  console.warn('⚠️ VITE_API_BASE_URL is not defined in production! Using fallback may cause issues.');
}

const isDevelopment = process.env.NODE_ENV === 'development';

function toQuery(params = {}) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    search.set(key, String(value));
  });
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

async function safeJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function extractErrorMessage(response, fallback) {
  const json = await safeJson(response);
  if (json?.message) return json.message;

  try {
    const text = await response.text();
    if (text && text.trim()) return text.trim().slice(0, 220);
  } catch {
    // noop
  }

  return fallback;
}

async function extractErrorPayload(response, fallbackMessage) {
  const json = await safeJson(response);
  if (json && typeof json === "object") {
    return {
      message: json.message || fallbackMessage,
      code: json.code,
      limit: json.limit,
      serviceSubcategory: json.serviceSubcategory,
    };
  }
  return { message: fallbackMessage };
}

export async function fetchListings(params = {}) {
  const query = toQuery(params);
  const response = await fetch(`${API_BASE_URL}/api/listings${query}`, {
    method: "GET",
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(await extractErrorMessage(response, "Failed to fetch listings."));
  }

  return response.json();
}

export async function fetchListingById(id) {
  const response = await fetch(`${API_BASE_URL}/api/listings/${id}`, {
    method: "GET",
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(await extractErrorMessage(response, "Failed to fetch listing details."));
  }

  return response.json();
}

export async function fetchListingsByIds(ids = []) {
  if (!ids.length) return { items: [] };

  const response = await fetch(
    `${API_BASE_URL}/api/listings/by-ids?${toQuery({ ids: ids.join(",") }).slice(1)}`,
    {
      method: "GET",
      cache: "no-store",
    }
  );

  if (!response.ok) {
    throw new Error(await extractErrorMessage(response, "Failed to fetch listings by ids."));
  }

  return response.json();
}

export async function fetchListingsMeta() {
  const response = await fetch(`${API_BASE_URL}/api/listings/meta`, {
    method: "GET",
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(await extractErrorMessage(response, "Failed to fetch listings metadata."));
  }

  return response.json();
}

export async function updateListing(user, id, payload = {}) {
  if (!user) {
    throw new Error("No authenticated user.");
  }

  const token = await user.getIdToken();
  const response = await fetch(`${API_BASE_URL}/api/listings/${id}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const err = await extractErrorPayload(response, "İlan güncellenemedi.");
    throw Object.assign(new Error(err.message), err);
  }

  return response.json();
}

export async function createListing(user, payload = {}) {
  if (!user) {
    throw new Error("No authenticated user.");
  }

  const token = await user.getIdToken();
  const response = await fetch(`${API_BASE_URL}/api/listings`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const err = await extractErrorPayload(response, "İlan oluşturulamadı.");
    throw Object.assign(new Error(err.message), err);
  }

  return response.json();
}

export async function fetchProviderById(id) {
  const response = await fetch(`${API_BASE_URL}/api/providers/${id}`, {
    method: "GET",
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(await extractErrorMessage(response, "Failed to fetch provider details."));
  }

  return response.json();
}

export async function deleteListing(user, id) {
  if (!user) {
    throw new Error("No authenticated user.");
  }

  const token = await user.getIdToken();
  
  // 1️⃣ İlanı backend üzerinden soft delete yap
  const response = await fetch(`${API_BASE_URL}/api/listings/${id}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const err = await extractErrorPayload(response, "Failed to delete listing.");
    throw Object.assign(new Error(err.message), err);
  }

  // 2️⃣ İlana ait yorumları deleted_reviews koleksiyonuna taşı (listingId ile)
  try {
    const reviewsQuery = query(
      collection(db, 'reviews'),
      where('listingId', '==', id)
    );
    const reviewsSnap = await getDocs(reviewsQuery);
    
    if (!reviewsSnap.empty) {
      const batch = writeBatch(db);
      
      reviewsSnap.forEach((reviewDoc) => {
        const reviewData = reviewDoc.data();
        
        // Yorumu deleted_reviews koleksiyonuna ekle
        const deletedReviewRef = doc(collection(db, 'deleted_reviews'));
        batch.set(deletedReviewRef, {
          ...reviewData,
          originalId: reviewDoc.id,
          deletedAt: new Date().toISOString(),
          deletedBy: user.uid,
          deletedListingId: id
        });
        
        // Orijinal yorumu sil
        batch.delete(reviewDoc.ref);
      });
      
      await batch.commit();
      if (isDevelopment) console.log(`✅ ${reviewsSnap.size} yorum deleted_reviews'e taşındı.`);
    } else {
      if (isDevelopment) console.log(`ℹ️ Bu ilana ait yorum bulunamadı.`);
    }
  } catch (reviewError) {
    if (isDevelopment) console.warn("Yorumlar taşınamadı:", reviewError.message);
    // Yorum taşıma başarısız olsa bile ilan silindiği için devam et
  }

  return response.json();
}

export async function updateListingStatus(user, id, status) {
  if (!user) {
    throw new Error("No authenticated user.");
  }

  const token = await user.getIdToken();

  const response = await fetch(`${API_BASE_URL}/api/listings/${id}/status`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ status }),
  });

  if (!response.ok) {
    const err = await extractErrorPayload(response, "İlan durumu güncellenemedi.");
    throw Object.assign(new Error(err.message), err);
  }

  // ✅ YENİ: Eğer status ACTIVE ise, silinmiş yorumları geri getir
  if (status === "ACTIVE") {
    try {
      const deletedReviewsQuery = query(
        collection(db, 'deleted_reviews'),
        where('deletedListingId', '==', id)
      );
      const deletedReviewsSnap = await getDocs(deletedReviewsQuery);
      
      if (!deletedReviewsSnap.empty) {
        const batch = writeBatch(db);
        
        deletedReviewsSnap.forEach((deletedReviewDoc) => {
          const reviewData = deletedReviewDoc.data();
          
          // Yorumu reviews koleksiyonuna geri ekle
          const restoredReviewRef = doc(collection(db, 'reviews'), reviewData.originalId);
          batch.set(restoredReviewRef, {
            appointmentId: reviewData.appointmentId,
            expertId: reviewData.expertId,
            listingId: reviewData.listingId,
            clientId: reviewData.clientId,
            rating: reviewData.rating,
            comment: reviewData.comment,
            createdAt: reviewData.createdAt
          });
          
          // deleted_reviews'den sil
          batch.delete(deletedReviewDoc.ref);
        });
        
        await batch.commit();
        if (isDevelopment) console.log(`✅ ${deletedReviewsSnap.size} yorum geri getirildi.`);
      }
    } catch (restoreError) {
      if (isDevelopment) console.warn("Yorumlar geri getirilemedi:", restoreError.message);
    }
  }

  return response.json();
}

export async function fetchMyListings(user) {
  if (!user) {
    throw new Error("No authenticated user.");
  }

  const token = await user.getIdToken();

  const response = await fetch(`${API_BASE_URL}/api/listings/my-listings`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(await extractErrorMessage(response, "Uzman ilanları yüklenemedi."));
  }

  return response.json();
}