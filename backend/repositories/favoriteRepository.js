// backend/repositories/favoriteRepository.js
// Database access logic and helpers for favorite operations.
// Extracted during Step 8.

const { db } = require("../config/firebaseAdmin");

function favoritesDocRef(uid) {
  return db.collection("userFavorites").doc(uid);
}

function normalizeFavoritesData(data) {
  if (!data || typeof data !== "object") return {};

  const result = {};

  if (Array.isArray(data.favoritesIds)) {
    data.favoritesIds.forEach((id) => {
      if (id !== null && id !== undefined && String(id).trim()) {
        result[String(id)] = true;
      }
    });

    return result;
  }

  if (data.items && typeof data.items === "object") {
    Object.entries(data.items).forEach(([key, value]) => {
      if (value) result[String(key)] = true;
    });
  }

  Object.entries(data).forEach(([key, value]) => {
    if (key.startsWith("items.") && value) {
      const id = key.slice("items.".length);
      if (id) result[id] = true;
    }
  });

  return result;
}

module.exports = {
  favoritesDocRef,
  normalizeFavoritesData,
};
