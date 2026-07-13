import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "../firebase/firebaseClient";
import Navbar from "../components/Navbar";
import LoadingSpinner from "../components/LoadingSpinner";
// Syria Arabic launch: listing report actions are disabled on listing cards.
// import ListingReportButton from "../components/ListingReportButton";
import categoryImages from "../data/categoryImages";
import "../styles/AdPage.css";
import {
  fetchFavorites,
  addFavorite,
  removeFavorite,
} from "../services/favoritesApi";
import {
  fetchListings,
  fetchListingsMeta,
} from "../services/listingsApi";
import { fetchReviewCountsForListings } from "../services/reviewsApi";
import { getListingImageStyle } from "../utils/listingImagePresentation";
import { showAppToast } from "../utils/showAppToast";
import { toArabicServiceLabel } from "../utils/arabicLabels";
import { formatLatinNumber } from "../utils/localeFormat";

const isDevelopment = process.env.NODE_ENV === "development";

const ALL_CATEGORIES = "جميع الفئات";
const ALL_SPECIALTIES = "جميع التخصصات";
const ALL_CITIES = "جميع المحافظات";
const DEFAULT_SORT = "السعر: الأعلى أولاً";

const SYRIA_GOVERNORATES = [
  "دمشق",
  "ريف دمشق",
  "حلب",
  "حمص",
  "حماة",
  "اللاذقية",
  "طرطوس",
  "إدلب",
  "دير الزور",
  "الرقة",
  "الحسكة",
  "درعا",
  "السويداء",
  "القنيطرة",
];

const SORT_OPTIONS = [
  { label: DEFAULT_SORT, value: "price_desc" },
  { label: "السعر: الأقل أولاً", value: "price_asc" },
  { label: "تاريخ نشر الإعلان: الأحدث أولاً", value: "created_desc" },
  { label: "تاريخ نشر الإعلان: الأقدم أولاً", value: "created_asc" },
  { label: "العنوان: من أ إلى ي", value: "address_az" },
  { label: "العنوان: من ي إلى أ", value: "address_za" },
];

const FILTER_SENTINEL_LABELS = new Set([
  ALL_CATEGORIES,
  ALL_SPECIALTIES,
  ALL_CITIES,
  "جميع المدن",
  "Tüm Kategoriler",
  "Tüm Uzmanlıklar",
  "Tüm Şehirler",
]);

function sortCodeFromLabel(label) {
  const found = SORT_OPTIONS.find((option) => option.label === label);
  return found ? found.value : "default";
}

function specialtyNameFromEntry(entry) {
  if (entry == null) return "";

  if (typeof entry === "string") {
    return entry.trim();
  }

  if (typeof entry === "object") {
    const name = entry.name ?? entry.label ?? entry.title;
    if (name != null) return String(name).trim();
  }

  return "";
}

function normalizeSpecialtyList(raw) {
  return [
    ...new Set(
      (Array.isArray(raw) ? raw : [])
        .map(specialtyNameFromEntry)
        .filter((name) => name && !FILTER_SENTINEL_LABELS.has(name))
    ),
  ].sort((a, b) => a.localeCompare(b, "ar"));
}

function normalizeSpecialtiesByCategory(map) {
  if (!map || typeof map !== "object") return {};

  return Object.fromEntries(
    Object.entries(map).map(([category, list]) => [
      String(category).trim().toLowerCase(),
      normalizeSpecialtyList(list),
    ])
  );
}

const VoiceModal = ({ isOpen, onClose, status, onStop }) => {
  if (!isOpen) return null;

  return (
    <div className="voice-modal active">
      <div className="voice-modal-content">
        <div className="voice-header">
          <h3>البحث الصوتي</h3>
          <button
            type="button"
            className="close-btn"
            onClick={onClose}
            aria-label="إغلاق نافذة البحث الصوتي"
          >
            &times;
          </button>
        </div>

        <div className="voice-body">
          <div className="wave-animation" aria-hidden="true">
            <span></span>
            <span></span>
            <span></span>
            <span></span>
            <span></span>
          </div>

          <p className="voice-text">{status}</p>

          <button type="button" className="stop-voice-btn" onClick={onStop}>
            <i className="fas fa-stop"></i> إيقاف
          </button>
        </div>
      </div>
    </div>
  );
};

function readListingsPageFromUrl() {
  try {
    const raw = new URLSearchParams(window.location.search).get("sayfa");
    const page = parseInt(raw || "1", 10);
    return Number.isFinite(page) && page >= 1 ? page : 1;
  } catch {
    return 1;
  }
}

const AdPage = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [listingsLoading, setListingsLoading] = useState(false);

  const [searchText, setSearchText] = useState("");
  const [showVoiceModal, setShowVoiceModal] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState("جاري الاستماع...");

  const [filteredListings, setFilteredListings] = useState([]);
  const [totalListings, setTotalListings] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [currentPage, setCurrentPage] = useState(readListingsPageFromUrl);

  const [tempCategory, setTempCategory] = useState(ALL_CATEGORIES);
  const [tempSpecialty, setTempSpecialty] = useState(ALL_SPECIALTIES);
  const [tempMinPrice, setTempMinPrice] = useState("");
  const [tempMaxPrice, setTempMaxPrice] = useState("");
  const [tempCity, setTempCity] = useState(ALL_CITIES);
  const [tempSortBy, setTempSortBy] = useState(DEFAULT_SORT);

  const [activeCategory, setActiveCategory] = useState(ALL_CATEGORIES);
  const [activeSpecialty, setActiveSpecialty] = useState(ALL_SPECIALTIES);
  const [activeMinPrice, setActiveMinPrice] = useState("");
  const [activeMaxPrice, setActiveMaxPrice] = useState("");
  const [activeCity, setActiveCity] = useState(ALL_CITIES);
  const [activeSortBy, setActiveSortBy] = useState(DEFAULT_SORT);

  const [categoryOptions, setCategoryOptions] = useState([ALL_CATEGORIES]);
  const [specialtyOptions, setSpecialtyOptions] = useState([
    ALL_SPECIALTIES,
  ]);
  const [cityOptions, setCityOptions] = useState([
    ALL_CITIES,
    ...SYRIA_GOVERNORATES,
  ]);
  const [specialtiesByCategory, setSpecialtiesByCategory] = useState({});

  const [showProfileWarning, setShowProfileWarning] = useState(false);
  const [warningType, setWarningType] = useState("incomplete");
  const [expertName, setExpertName] = useState("");
  const [favorites, setFavorites] = useState({});
  const [firestoreDisplayName, setFirestoreDisplayName] = useState("");

  const updateListingsPageParam = useCallback(
    (page) => {
      setSearchParams(
        (previousParams) => {
          const nextParams = new URLSearchParams(previousParams);

          if (page <= 1) {
            nextParams.delete("sayfa");
          } else {
            nextParams.set("sayfa", String(page));
          }

          return nextParams;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  useEffect(() => {
    const raw = searchParams.get("sayfa");
    const page = Math.max(1, parseInt(raw || "1", 10) || 1);

    setCurrentPage((previousPage) =>
      previousPage === page ? previousPage : page
    );
  }, [searchParams]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);

      if (currentUser) {
        try {
          const userDocument = await getDoc(
            doc(db, "users", currentUser.uid)
          );

          if (userDocument.exists()) {
            const userData = userDocument.data();
            const finalDisplayName =
              userData.displayName ||
              userData.email?.split("@")[0] ||
              currentUser.email?.split("@")[0] ||
              "مستخدم";

            setFirestoreDisplayName(finalDisplayName);

            if (
              userData.userType === "PENDING_PROVIDER" &&
              !userData.profileCompleted
            ) {
              setExpertName(finalDisplayName || "خبير");
              setShowProfileWarning(true);
              setWarningType("incomplete");
            } else if (
              userData.userType === "PENDING_PROVIDER" &&
              userData.profileCompleted
            ) {
              setExpertName(finalDisplayName || "خبير");
              setShowProfileWarning(true);
              setWarningType("pending_approval");
            } else {
              setShowProfileWarning(false);
            }
          } else {
            setFirestoreDisplayName(
              currentUser.email?.split("@")[0] || "مستخدم"
            );
            setShowProfileWarning(false);
          }
        } catch (error) {
          if (isDevelopment) {
            console.error(
              "Kullanıcı durumu kontrol edilirken hata:",
              error.message
            );
          }

          setFirestoreDisplayName(
            currentUser.email?.split("@")[0] || "مستخدم"
          );
        }
      } else {
        setFirestoreDisplayName("");
        setShowProfileWarning(false);
        setFavorites({});
      }

      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return undefined;

    let cancelled = false;

    fetchFavorites(user)
      .then((remoteFavorites) => {
        if (!cancelled) setFavorites(remoteFavorites || {});
      })
      .catch((error) => {
        if (isDevelopment) {
          console.error("Failed to load favorites:", error.message);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    let cancelled = false;

    fetchListingsMeta()
      .then((meta) => {
        if (cancelled) return;

        const categories = Array.isArray(meta?.categories)
          ? meta.categories
          : [];
        const specialties = normalizeSpecialtyList(meta?.specialties);

        setCategoryOptions([ALL_CATEGORIES, ...categories]);
        setSpecialtyOptions([ALL_SPECIALTIES, ...specialties]);
        setCityOptions([ALL_CITIES, ...SYRIA_GOVERNORATES]);
        setSpecialtiesByCategory(
          normalizeSpecialtiesByCategory(meta?.specialtiesByCategory)
        );
      })
      .catch((error) => {
        if (isDevelopment) {
          console.error("Failed to load listing metadata:", error.message);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const selectedCategory =
      tempCategory && tempCategory !== ALL_CATEGORIES ? tempCategory : null;

    const selectedCategoryKey = selectedCategory
      ? String(selectedCategory).trim().toLowerCase()
      : null;

    const scopedSpecialties = selectedCategoryKey
      ? specialtiesByCategory[selectedCategoryKey]
      : null;

    const scopedNames = normalizeSpecialtyList(scopedSpecialties);

    if (scopedNames.length > 0) {
      setSpecialtyOptions([ALL_SPECIALTIES, ...scopedNames]);

      if (
        tempSpecialty !== ALL_SPECIALTIES &&
        !scopedNames.includes(tempSpecialty)
      ) {
        setTempSpecialty(ALL_SPECIALTIES);
      }

      return;
    }

    if (selectedCategoryKey) {
      setSpecialtyOptions([ALL_SPECIALTIES]);

      if (tempSpecialty !== ALL_SPECIALTIES) {
        setTempSpecialty(ALL_SPECIALTIES);
      }

      return;
    }

    const allSpecialties = normalizeSpecialtyList(
      Object.values(specialtiesByCategory).flatMap((item) =>
        Array.isArray(item) ? item : []
      )
    );

    setSpecialtyOptions([ALL_SPECIALTIES, ...allSpecialties]);
  }, [tempCategory, tempSpecialty, specialtiesByCategory]);

  useEffect(() => {
    let cancelled = false;
    setListingsLoading(true);

    const params = {
      page: currentPage,
      limit: 6,
      q: searchText.trim() || undefined,
      category:
        activeCategory !== ALL_CATEGORIES ? activeCategory : undefined,
      serviceSubcategory:
        activeSpecialty !== ALL_SPECIALTIES ? activeSpecialty : undefined,
      minPrice: activeMinPrice || undefined,
      maxPrice: activeMaxPrice || undefined,
      city: activeCity !== ALL_CITIES ? activeCity : undefined,
      sort: sortCodeFromLabel(activeSortBy),
    };

    fetchListings(params)
      .then(async (payload) => {
        if (cancelled) return;

        let items = payload?.items || [];

        try {
          const listingIds = items.map((item) => item.id);
          const reviewCounts = await fetchReviewCountsForListings(listingIds);

          if (cancelled) return;

          items = items.map((item) => ({
            ...item,
            reviews:
              reviewCounts?.[String(item.id)] ?? item.reviews ?? 0,
          }));
        } catch (error) {
          if (isDevelopment) {
            console.error("Failed to refresh review counts:", error.message);
          }
        }

        if (cancelled) return;

        setFilteredListings(items);
        setTotalListings(payload?.total || 0);

        const nextTotalPages = Math.max(
          1,
          Number(payload?.totalPages) || 1
        );

        setTotalPages(nextTotalPages);
        setCurrentPage((previousPage) => {
          if (previousPage <= nextTotalPages) return previousPage;

          updateListingsPageParam(nextTotalPages);
          return nextTotalPages;
        });
      })
      .catch((error) => {
        if (cancelled) return;

        if (isDevelopment) {
          console.error("Failed to load listings:", error.message);
        }

        setFilteredListings([]);
        setTotalListings(0);
        setTotalPages(1);
        setCurrentPage((previousPage) => {
          if (previousPage <= 1) return previousPage;

          updateListingsPageParam(1);
          return 1;
        });
      })
      .finally(() => {
        if (!cancelled) setListingsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    currentPage,
    searchText,
    activeCategory,
    activeSpecialty,
    activeMinPrice,
    activeMaxPrice,
    activeCity,
    activeSortBy,
    updateListingsPageParam,
  ]);

  const getUserDisplayName = () => {
    if (firestoreDisplayName) return firestoreDisplayName;
    if (user?.email) return user.email.split("@")[0];
    return "زائر";
  };

  const handleSearch = (text) => {
    setSearchText(text);
    setCurrentPage(1);
    updateListingsPageParam(1);
  };

  const closeVoiceSearch = () => {
    setShowVoiceModal(false);
  };

  const startVoiceSearch = () => {
    setShowVoiceModal(true);
    setVoiceStatus("جاري الاستماع...");

    if (
      "webkitSpeechRecognition" in window ||
      "SpeechRecognition" in window
    ) {
      const SpeechRecognition =
        window.SpeechRecognition || window.webkitSpeechRecognition;
      const recognition = new SpeechRecognition();

      recognition.lang = "ar-SY";
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.start();

      recognition.onresult = (event) => {
        let transcript = event.results[0][0].transcript;
        transcript = transcript.replace(/[.,!?،؟]/g, "").trim();

        setVoiceStatus(`"${transcript}"`);
        handleSearch(transcript);
        setTimeout(closeVoiceSearch, 1500);
      };

      recognition.onerror = () => {
        setVoiceStatus("لم يتم الفهم، يرجى المحاولة مرة أخرى");
        setTimeout(closeVoiceSearch, 1500);
      };

      recognition.onend = () => {
        setTimeout(closeVoiceSearch, 1500);
      };
    } else {
      setVoiceStatus("متصفحك لا يدعم البحث الصوتي");
      setTimeout(closeVoiceSearch, 2000);
    }
  };

  const toggleFavorite = async (listingId) => {
    if (!user) {
      showAppToast("يرجى تسجيل الدخول لإضافة الإعلان للمفضلة.", "error");
      navigate("/login");
      return;
    }

    const previousFavorites = favorites;
    const isCurrentlyFavorite = Boolean(favorites[listingId]);

    setFavorites((currentFavorites) => ({
      ...currentFavorites,
      [listingId]: !isCurrentlyFavorite,
    }));

    try {
      if (isCurrentlyFavorite) {
        await removeFavorite(listingId, user);
      } else {
        await addFavorite(listingId, user);
        showAppToast("تمت إضافة الإعلان إلى المفضلة.", "success");
      }
    } catch (error) {
      setFavorites(previousFavorites);

      if (isDevelopment) {
        console.error("Failed to update favorite:", error.message);
      }

      showAppToast("تعذر تحديث المفضلة. يرجى المحاولة مرة أخرى.", "error");
    }
  };

  const applyFilters = () => {
    setActiveCategory(tempCategory);
    setActiveSpecialty(tempSpecialty);
    setActiveMinPrice(tempMinPrice);
    setActiveMaxPrice(tempMaxPrice);
    setActiveCity(tempCity);
    setActiveSortBy(tempSortBy);
    setCurrentPage(1);
    updateListingsPageParam(1);
  };

  const resetFilters = () => {
    setTempCategory(ALL_CATEGORIES);
    setTempSpecialty(ALL_SPECIALTIES);
    setTempMinPrice("");
    setTempMaxPrice("");
    setTempCity(ALL_CITIES);
    setTempSortBy(DEFAULT_SORT);

    setActiveCategory(ALL_CATEGORIES);
    setActiveSpecialty(ALL_SPECIALTIES);
    setActiveMinPrice("");
    setActiveMaxPrice("");
    setActiveCity(ALL_CITIES);
    setActiveSortBy(DEFAULT_SORT);

    setSearchText("");
    setCurrentPage(1);
    updateListingsPageParam(1);
  };

  const goToListingsPage = (page) => {
    const nextPage = Math.max(1, Math.min(totalPages, page));
    setCurrentPage(nextPage);
    updateListingsPageParam(nextPage);
  };

  const pageInfo = useMemo(
    () => `${formatLatinNumber(currentPage)}/${formatLatinNumber(totalPages)}`,
    [currentPage, totalPages]
  );

  if (loading) {
    return (
      <div className="ad-page">
        <Navbar />
        <LoadingSpinner text="جاري تحميل الصفحة، يرجى الانتظار..." />
      </div>
    );
  }

  return (
    <div className="ad-page">
      <Navbar />

      <div className="welcome-banner">
        <h1>
          مرحباً بك،{" "}
          <span className="highlight-text">{getUserDisplayName()}</span>
        </h1>
        <p>في أي مجال تحتاج خبيراً اليوم؟</p>
      </div>

      <div className="search-section">
        <div className="search-container">
          <div className="search-wrapper">
            <input
              type="text"
              className="search-input"
              value={searchText}
              onChange={(event) => handleSearch(event.target.value)}
              placeholder="ابحث عن خدمة، خبير، أو فئة..."
            />

            <button
              type="button"
              className="voice-btn"
              onClick={startVoiceSearch}
              aria-label="البحث الصوتي"
            >
              <i className="fas fa-microphone"></i>
            </button>
          </div>
        </div>
      </div>

      <div className="ad-content">
        <aside className="sidebar-filters">
          {showProfileWarning && user && (
            <>
              {warningType === "incomplete" && (
                <div className="sidebar-warning sidebar-warning-incomplete">
                  <div className="sidebar-warning-header">
                    <i className="fas fa-exclamation-circle"></i>
                    <h4>طلبك غير مكتمل!</h4>
                  </div>

                  <p>
                    مرحباً {expertName}، يرجى إكمال ملفك الشخصي لإتمام طلب
                    انضمامك كخبير.
                  </p>

                  <button
                    type="button"
                    className="sidebar-warning-button"
                    onClick={() => navigate("/expert-complete-profile")}
                  >
                    أكمل الملف الشخصي <i className="fas fa-arrow-right"></i>
                  </button>
                </div>
              )}

              {warningType === "pending_approval" && (
                <div className="sidebar-warning sidebar-warning-pending">
                  <div className="sidebar-warning-header">
                    <i className="fas fa-hourglass-end"></i>
                    <h4>بانتظار الموافقة</h4>
                  </div>

                  <p>
                    مرحباً {expertName}، تم إكمال ملفك الشخصي بنجاح وبانتظار
                    موافقة الإدارة.
                  </p>

                  <p className="sidebar-warning-subtext">
                    سيتم إبلاغك عبر رسالة SMS فور اكتمال عملية الموافقة.
                  </p>

                  <div className="pending-info">
                    <div className="pending-item">
                      <i className="fas fa-check-circle"></i>
                      <span>تم إكمال الملف الشخصي</span>
                    </div>

                    <div className="pending-item">
                      <i className="fas fa-clock"></i>
                      <span>بانتظار موافقة الإدارة</span>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          <div className="filter-header">
            <h3>تصفية وترتيب</h3>
          </div>

          <div className="filter-group">
            <label htmlFor="category-filter">
              <i className="fa-solid fa-border-all"></i> الفئة
            </label>

            <select
              id="category-filter"
              value={tempCategory}
              onChange={(event) => setTempCategory(event.target.value)}
            >
              {categoryOptions.map((category) => (
                <option key={category} value={category}>
                  {toArabicServiceLabel(category)}
                </option>
              ))}
            </select>
          </div>

          <div className="filter-group">
            <label htmlFor="specialty-filter">
              <i className="fa-solid fa-wand-magic-sparkles"></i> التخصص
            </label>

            <select
              id="specialty-filter"
              value={tempSpecialty}
              onChange={(event) => setTempSpecialty(event.target.value)}
            >
              {specialtyOptions.map((specialty) => {
                const specialtyName =
                  typeof specialty === "string"
                    ? specialty
                    : specialtyNameFromEntry(specialty);

                return (
                  <option key={specialtyName} value={specialtyName}>
                    {toArabicServiceLabel(specialtyName)}
                  </option>
                );
              })}
            </select>
          </div>

          <div className="filter-group">
            <label htmlFor="city-filter">
              <i className="fa-solid fa-location-dot"></i> المحافظة
            </label>

            <select
              id="city-filter"
              value={tempCity}
              onChange={(event) => setTempCity(event.target.value)}
            >
              {cityOptions.map((city) => (
                <option key={city} value={city}>
                  {city}
                </option>
              ))}
            </select>
          </div>

          <div className="filter-group">
            <label>
              <i className="fa-solid fa-money-bill-wave"></i> نطاق السعر
            </label>

            <div className="price-inputs">
              <input
                type="number"
                placeholder="الحد الأدنى ل.س"
                value={tempMinPrice}
                onChange={(event) => setTempMinPrice(event.target.value)}
                min="0"
                aria-label="الحد الأدنى للسعر"
              />

              <span>-</span>

              <input
                type="number"
                placeholder="الحد الأقصى ل.س"
                value={tempMaxPrice}
                onChange={(event) => setTempMaxPrice(event.target.value)}
                min="0"
                aria-label="الحد الأقصى للسعر"
              />
            </div>
          </div>

          <div className="filter-group">
            <label htmlFor="sort-filter">
              <i className="fa-solid fa-arrow-down-short-wide"></i> الترتيب
            </label>

            <select
              id="sort-filter"
              value={tempSortBy}
              onChange={(event) => setTempSortBy(event.target.value)}
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.label}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            className="btn-apply-filter"
            onClick={applyFilters}
          >
            تطبيق
          </button>

          <button
            type="button"
            className="btn-clear-filter"
            onClick={resetFilters}
          >
            إعادة تعيين
          </button>
        </aside>

        <main className="experts-list">
          {listingsLoading ? (
            <LoadingSpinner text="جاري تحميل الإعلانات..." />
          ) : filteredListings.length === 0 ? (
            <div className="no-results">
              <i className="fas fa-search"></i>
              <p>لم يتم العثور على إعلانات تطابق المعايير المحددة.</p>
              <button
                type="button"
                className="btn-clear-filter"
                onClick={resetFilters}
              >
                مسح التصفية
              </button>
            </div>
          ) : (
            <>
              {filteredListings.map((item) => (
                <div key={item.id} className="expert-card">
                  <img
                    src={
                      item.image ||
                      categoryImages[item.category] ||
                      "/default-listing.svg"
                    }
                    alt={item.title}
                    className="expert-avatar"
                    style={getListingImageStyle(item)}
                    onError={(event) => {
                      event.currentTarget.onerror = null;
                      event.currentTarget.src = "/default-listing.svg";
                    }}
                  />

                  <div className="expert-info-wrapper">
                    <div className="expert-info-content">
                      <h3 className="expert-title">{item.title}</h3>

                      <p className="expert-category">
                        <span className="expert-name-badge">
                          {item.expertName}
                        </span>

                        {item.category && (
                          <span className="category-separator">•</span>
                        )}

                        {item.category && (
                          <span>{toArabicServiceLabel(item.category)}</span>
                        )}

                        {item.serviceSubcategory && (
                          <>
                            <span className="category-separator">•</span>
                            <span className="expert-specialty-text">
                              {toArabicServiceLabel(item.serviceSubcategory)}
                            </span>
                          </>
                        )}
                      </p>

                      <div className="expert-stats">
                        <span className="rating">
                          <i className="fa-solid fa-star"></i>{" "}
                          {formatLatinNumber(item.rating)} ({formatLatinNumber(item.reviews)} تقييم)
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="expert-price-action">
                    <div className="expert-card-actions-top">
                      <button
                        type="button"
                        className={`btn-favorite ${
                          user && favorites[item.id] ? "active" : ""
                        }`}
                        onClick={() => toggleFavorite(item.id)}
                        aria-label="إضافة الإعلان إلى المفضلة"
                      >
                        <i
                          className={`fa-${
                            user && favorites[item.id] ? "solid" : "regular"
                          } fa-heart`}
                        ></i>
                      </button>

                      {/* Syria Arabic launch: listing report/exclamation button disabled.
                      <ListingReportButton
                        listingId={item.id}
                        listingTitle={item.title}
                      />
                      */}
                    </div>

                    <div className="price">
                      <strong>{formatLatinNumber(item.price)} ل.س</strong>
                      <span className="price-text">تبدأ من</span>
                    </div>

                    <button
                      type="button"
                      className="btn-view-profile"
                      onClick={() => navigate(`/ilan/${item.id}`)}
                    >
                      عرض الإعلان
                    </button>
                  </div>
                </div>
              ))}

              {totalPages > 1 && (
                <div className="pagination-controls">
                  <button
                    type="button"
                    className="btn-clear-filter"
                    disabled={currentPage <= 1}
                    onClick={() => goToListingsPage(currentPage - 1)}
                  >
                    السابق
                  </button>

                  <button
                    type="button"
                    className="btn-apply-filter pagination-info"
                    disabled
                  >
                    صفحة {pageInfo} - الإجمالي {formatLatinNumber(totalListings)}
                  </button>

                  <button
                    type="button"
                    className="btn-clear-filter"
                    disabled={currentPage >= totalPages}
                    onClick={() => goToListingsPage(currentPage + 1)}
                  >
                    التالي
                  </button>
                </div>
              )}
            </>
          )}
        </main>
      </div>

      <VoiceModal
        isOpen={showVoiceModal}
        onClose={closeVoiceSearch}
        status={voiceStatus}
        onStop={closeVoiceSearch}
      />
    </div>
  );
};

export default AdPage;

// ============================================================================
// REMOVED FRONTEND-ONLY LOCATION / CITY / DISTANCE CODE
// The code below is archived as comments and is not executed.
// ============================================================================

// Removed import:
// import { collection, getDocs } from "firebase/firestore";
// import { turkeyData } from "../data/turkeyData";

// Removed distance sort option:
// { label: "الأقرب (المسافة)", value: "distance_asc" },

// Removed states:
// const [selectedLocation, setSelectedLocation] = useState({
//   city: "",
//   district: "",
//   lat: null,
//   lng: null,
// });
// const [showLocationModal, setShowLocationModal] = useState(false);
// const [cities, setCities] = useState([]);
// const [tempCity, setTempCity] = useState("جميع المدن");
// const [activeCity, setActiveCity] = useState("جميع المدن");
// const [cityOptions, setCityOptions] = useState(["جميع المدن"]);
// const [userAddresses, setUserAddresses] = useState([]);

// Removed distance helper:
// function haversineDistance(lat1, lon1, lat2, lon2) {
//   const R = 6371;
//   const dLat = ((lat2 - lat1) * Math.PI) / 180;
//   const dLon = ((lon2 - lon1) * Math.PI) / 180;
//   const a =
//     Math.sin(dLat / 2) * Math.sin(dLat / 2) +
//     Math.cos((lat1 * Math.PI) / 180) *
//       Math.cos((lat2 * Math.PI) / 180) *
//       Math.sin(dLon / 2) *
//       Math.sin(dLon / 2);
//   const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
//   return R * c;
// }

// Removed city coordinates helper:
// function getCityCoords(cityName) {
//   if (!cityName) return null;
//   const normalized = cityName.replace("İ", "I").replace("ı", "i");
//   const cityData = turkeyData[cityName] || turkeyData[normalized];
//   if (!cityData || !Array.isArray(cityData) || cityData.length === 0) {
//     return null;
//   }
//   const total = cityData.reduce(
//     (accumulator, district) => ({
//       lat: accumulator.lat + district.lat,
//       lng: accumulator.lng + district.lng,
//       count: accumulator.count + 1,
//     }),
//     { lat: 0, lng: 0, count: 0 }
//   );
//   return {
//     lat: total.lat / total.count,
//     lng: total.lng / total.count,
//   };
// }

// Removed LocationModal component:
// const LocationModal = ({
//   isOpen,
//   onClose,
//   userAddresses,
//   onLocationSelect,
//   currentLocation,
//   navigate,
// }) => {
//   if (!isOpen) return null;
//
//   const handleAddressSelect = (address) => {
//     onLocationSelect(address.lat, address.lng, address.city, address.district);
//     onClose();
//   };
//
//   return (
//     <div className="location-modal active">
//       <div className="modal-header">
//         <h4>
//           <i className="fas fa-map-marker-alt"></i> اختر موقعاً
//         </h4>
//         <button className="close-btn" onClick={onClose}>
//           &times;
//         </button>
//       </div>
//
//       {userAddresses.length === 0 ? (
//         <div className="no-addresses">
//           <div className="no-addresses-icon">
//             <i className="fas fa-home"></i>
//           </div>
//           <p>ليس لديك أي عناوين مسجلة.</p>
//           <p className="no-addresses-subtext">
//             يمكنك تحديد موقعك عن طريق إضافة عنوان من صفحة ملفك الشخصي.
//           </p>
//           <button
//             className="btn-secondary"
//             onClick={() => {
//               onClose();
//               navigate("/profile");
//             }}
//           >
//             الذهاب لصفحة الملف الشخصي
//             <i className="fas fa-arrow-right"></i>
//           </button>
//         </div>
//       ) : (
//         <div className="saved-addresses">
//           <div className="addresses-header">
//             <i className="fas fa-address-book"></i>
//             <span>عناوينك المسجلة</span>
//           </div>
//           <div className="addresses-list">
//             {userAddresses.map((address) => (
//               <button
//                 key={address.id}
//                 className="location-btn-option"
//                 onClick={() => handleAddressSelect(address)}
//               >
//                 <div className="address-icon">
//                   <i className="fas fa-location-dot"></i>
//                 </div>
//                 <div className="address-details">
//                   <div className="address-name">
//                     {address.addressName || "عنواني"}
//                   </div>
//                   <div className="address-full">
//                     {address.neighborhood && `${address.neighborhood}, `}
//                     {address.district}, {address.city}
//                   </div>
//                 </div>
//                 <i className="fas fa-chevron-right"></i>
//               </button>
//             ))}
//           </div>
//         </div>
//       )}
//     </div>
//   );
// };

// Removed address loading effect:
// useEffect(() => {
//   if (!user) return;
//   const fetchAddresses = async () => {
//     try {
//       const addressesRef = collection(db, "users", user.uid, "addresses");
//       const snapshot = await getDocs(addressesRef);
//       const addresses = snapshot.docs.map((addressDocument) => ({
//         id: addressDocument.id,
//         ...addressDocument.data(),
//       }));
//       setUserAddresses(addresses);
//     } catch (error) {
//       if (isDevelopment) {
//         console.error("Adresler çekilirken hata:", error.message);
//       }
//     }
//   };
//   fetchAddresses();
// }, [user]);

// Removed automatic address selection effect:
// useEffect(() => {
//   if (
//     userAddresses.length > 0 &&
//     !selectedLocation.lat &&
//     !selectedLocation.lng
//   ) {
//     const firstAddress = userAddresses[0];
//     setSelectedLocation({
//       lat: firstAddress.lat,
//       lng: firstAddress.lng,
//       city: firstAddress.city,
//       district: firstAddress.district,
//     });
//   }
// }, [userAddresses, selectedLocation.lat, selectedLocation.lng]);

// Removed city loading effect:
// useEffect(() => {
//   const loadCities = async () => {
//     try {
//       const response = await fetch("/cities.json");
//       const data = await response.json();
//       setCities(data.cities);
//       setCityOptions(["جميع المدن", ...data.cities.map((city) => city.name)]);
//     } catch {
//       const fallback = [
//         { id: 34, name: "Istanbul", districts: ["Kadikoy", "Besiktas"] },
//         { id: 6, name: "Ankara", districts: ["Cankaya", "Kecioren"] },
//         { id: 35, name: "Izmir", districts: ["Konak", "Karsiyaka"] },
//       ];
//       setCities(fallback);
//       setCityOptions(["جميع المدن", ...fallback.map((city) => city.name)]);
//     }
//   };
//   loadCities();
// }, []);

// Removed request parameters:
// city: activeCity !== "جميع المدن" ? activeCity : undefined,
// lat: selectedLocation.lat,
// lng: selectedLocation.lng,

// Removed filter update lines:
// setActiveCity(tempCity);
// setTempCity("جميع المدن");
// setActiveCity("جميع المدن");

// Removed location button and modal JSX:
// <div className="location-container">
//   <button
//     className="location-btn"
//     onClick={() => setShowLocationModal(true)}
//   >
//     <i className="fas fa-map-marker-alt location-icon"></i>
//     <div className="location-info">
//       <span className="location-label">موقعك</span>
//       <span className="location-value">
//         {selectedLocation.city
//           ? selectedLocation.district
//             ? `${selectedLocation.district}, ${selectedLocation.city}`
//             : selectedLocation.city
//           : "اختر موقعاً"}
//       </span>
//     </div>
//     <i className="fas fa-chevron-down"></i>
//   </button>
//
//   <LocationModal
//     isOpen={showLocationModal}
//     onClose={() => setShowLocationModal(false)}
//     userAddresses={userAddresses}
//     onLocationSelect={(lat, lng, city, district) => {
//       setSelectedLocation({ lat, lng, city, district });
//       setShowLocationModal(false);
//     }}
//     currentLocation={selectedLocation}
//     navigate={navigate}
//   />
// </div>

// Removed city filter JSX:
// <div className="filter-group">
//   <label>
//     <i className="fa-solid fa-location-dot"></i> المدينة
//   </label>
//   <select
//     value={tempCity}
//     onChange={(event) => setTempCity(event.target.value)}
//   >
//     {cityOptions.map((city) => (
//       <option key={city} value={city}>
//         {city}
//       </option>
//     ))}
//   </select>
// </div>

// Removed distance display JSX:
// <span className="distance">
//   <i className="fa-solid fa-location-arrow"></i>
//   {item.distanceKm
//     ? `${item.distanceKm.toFixed(1)} كم`
//     : "المسافة غير معروفة"}
// </span>
