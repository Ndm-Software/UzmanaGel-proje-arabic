import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { onAuthStateChanged } from "firebase/auth";
import Navbar from "../components/Navbar";
import LoadingSpinner from "../components/LoadingSpinner";
import { auth } from "../firebase/firebaseClient";
import categoryImages from "../data/categoryImages";
import { fetchFavorites, addFavorite, removeFavorite } from "../services/favoritesApi";
import { fetchListingsByIds } from "../services/listingsApi";
import DOMPurify from 'dompurify';
import { getListingImageStyle } from "../utils/listingImagePresentation";
import "../styles/AdPage.css";
import "../styles/FavoritesPage.css";

const isDevelopment = process.env.NODE_ENV === 'development';

const sanitizeText = (text) => {
  if (!text) return '';
  return DOMPurify.sanitize(String(text));
};

export default function FavoritesPage() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [favorites, setFavorites] = useState({});
  const [favoriteItems, setFavoriteItems] = useState([]);
  const [errorText, setErrorText] = useState("");

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (!currentUser) {
        navigate("/login");
      } else {
        setUser(currentUser);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [navigate]);

  useEffect(() => {
    if (!user) return;

    let cancelled = false;
    const loadFavorites = async () => {
      try {
        const remoteFavorites = await fetchFavorites(user);
        if (!cancelled) {
          setFavorites(remoteFavorites || {});
          setErrorText("");
        }
      } catch (error) {
        if (isDevelopment) console.error("Failed to load favorites:", error.message);
        if (!cancelled) {
          setErrorText("تعذر تحميل المفضلة. يرجى المحاولة مرة أخرى.");
        }
      }
    };

    loadFavorites();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const favoriteIds = useMemo(
    () =>
      Object.entries(favorites)
        .filter(([, isFav]) => !!isFav)
        .map(([id]) => id),
    [favorites]
  );

  useEffect(() => {
    if (!favoriteIds.length) {
      setFavoriteItems([]);
      return;
    }

    let cancelled = false;
    fetchListingsByIds(favoriteIds)
      .then((payload) => {
        if (!cancelled) {
          setFavoriteItems(payload?.items || []);
        }
      })
      .catch((error) => {
        if (isDevelopment) console.error("Failed to load favorite listing cards:", error.message);
        if (!cancelled) {
          setFavoriteItems([]);
          setErrorText("تعذر تحميل الإعلانات المفضلة. يرجى المحاولة مرة أخرى.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [favoriteIds]);

  const toggle = async (id) => {
    if (!user) return;

    const prev = favorites;
    const active = !!favorites[id];
    setFavorites({ ...favorites, [id]: !active });

    try {
      if (active) {
        await removeFavorite(id, user);
      } else {
        await addFavorite(id, user);
      }
      setErrorText("");
    } catch (error) {
      setFavorites(prev);
      if (isDevelopment) console.error("Failed to update favorite:", error.message);
      setErrorText("تعذر تحديث المفضلة. يرجى المحاولة مرة أخرى.");
    }
  };

  if (loading) {
    return (
      <div className="favorites-page">
        <Navbar />
        <LoadingSpinner text="جاري تحميل المفضلة..." />
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="favorites-page">
      <Navbar />
      <div className="welcome-banner">
        <h1>مفضلتي</h1>
        <p>الإعلانات التي أضفتها إلى المفضلة تظهر هنا.</p>
        {errorText ? <p>{sanitizeText(errorText)}</p> : null}
      </div>

      <div className="favorites-content">
        <main className="experts-list favorites-list">
          {favoriteItems.length === 0 ? (
            <div className="no-results">
              <i className="fas fa-heart"></i>
              <p>لم تقم بإضافة أي إعلان للمفضلة بعد.</p>
            </div>
          ) : (
            favoriteItems.map((item) => (
              <div key={item.id} className="expert-card">
                <img
                  src={item.image || categoryImages[item.category] || "/default-listing.svg"}
                  alt={sanitizeText(item.title)}
                  className="expert-avatar"
                  style={getListingImageStyle(item)}
                  onError={(e) => {
                    e.currentTarget.onerror = null;
                    e.currentTarget.src = "/default-listing.svg";
                  }}
                />

                <div className="expert-info-wrapper">
                  <div className="expert-info-content">
                    <h3 className="expert-title">{sanitizeText(item.title)}</h3>
                    <p className="expert-category">
                      <span className="expert-name-badge">{sanitizeText(item.expertName)}</span>
                      {item.category && <span className="category-separator">•</span>}
                      {item.category && <span>{sanitizeText(item.category)}</span>}
                      {item.serviceSubcategory && (
                        <>
                          <span className="category-separator">•</span>
                          <span className="expert-specialty-text">{sanitizeText(item.serviceSubcategory)}</span>
                        </>
                      )}
                    </p>
                    <div className="expert-stats">
                      <span className="rating">
                        <i className="fa-solid fa-star"></i> {item.rating ?? 0} ({item.reviews ?? 0} تقييم)
                      </span>
                      {item.distanceKm != null && (
                        <span className="distance">
                          <i className="fa-solid fa-location-arrow"></i>
                          {`${Number(item.distanceKm).toFixed(1)} km`}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="expert-price-action">
                  <div className="expert-card-actions-top">
                    <button
                      type="button"
                      className={`btn-favorite ${favorites[item.id] ? "active" : ""}`}
                      onClick={() => toggle(item.id)}
                      aria-label="إزالة من المفضلة"
                    >
                      <i className={`fa-${favorites[item.id] ? "solid" : "regular"} fa-heart`}></i>
                    </button>
                  </div>
                  <div className="price">
                    <strong>₺{item.price}</strong>
                    <span className="price-text">تبدأ من</span>
                  </div>
                  <button type="button" className="btn-view-profile" onClick={() => navigate(`/ilan/${item.id}`)}>
                    عرض الإعلان
                  </button>
                </div>
              </div>
            ))
          )}
        </main>
      </div>
    </div>
  );
}
