// backend/controllers/favoriteController.js
// Express route handlers for favorite operations.
// Extracted from app.js (Step 8).

const { admin } = require("../config/firebaseAdmin");
const FieldValue = admin.firestore.FieldValue;
const {
  favoritesDocRef,
  normalizeFavoritesData,
} = require("../repositories/favoriteRepository");

const isDevelopment = process.env.NODE_ENV === "development";

exports.getFavorites = async (req, res) => {
  try {
    res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.set("Pragma", "no-cache");
    res.set("Expires", "0");
    res.set("Surrogate-Control", "no-store");

    const snap = await favoritesDocRef(req.userId).get();
    const data = snap.exists ? snap.data() : {};
    const items = normalizeFavoritesData(data);

    res.json(items);
  } catch (error) {
    if (isDevelopment) {
      console.error("GET /api/favorites failed:", error.message);
    }

    res.status(500).json({
      message: "Failed to load favorites.",
    });
  }
};

exports.addFavorite = async (req, res) => {
  const id = String(req.params.id || "").trim();
  console.log("NEW favoriteController is running");

  if (!id) {
    return res.status(400).json({ message: "Favorite id is required." });
  }

  try {
    const ref = favoritesDocRef(req.userId);

    await ref.set(
      {
        favoritesIds: FieldValue.arrayUnion(id),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    res.status(201).json({
      message: "Favorite added.",
      id,
    });
  } catch (error) {
    if (isDevelopment) {
      console.error("POST /api/favorites/:id failed:", error.message);
    }

    res.status(500).json({
      message: "Failed to add favorite.",
    });
  }
};

exports.removeFavorite = async (req, res) => {
  const id = String(req.params.id || "").trim();

  if (!id) {
    return res.status(400).json({ message: "Favorite id is required." });
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

    res.json({
      message: "Favorite removed.",
      id,
    });
  } catch (error) {
    if (isDevelopment) {
      console.error("DELETE /api/favorites/:id failed:", error.message);
    }

    res.status(500).json({
      message: "Failed to remove favorite.",
    });
  }
};
