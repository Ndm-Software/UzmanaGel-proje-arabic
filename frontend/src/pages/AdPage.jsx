
// AdAPge.jsx file code 
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, collection, getDocs } from 'firebase/firestore';
import { auth, db } from "../firebase/firebaseClient";
import Navbar from "../components/Navbar";
import LoadingSpinner from "../components/LoadingSpinner";
import ListingReportButton from "../components/ListingReportButton";
import categoryImages from "../data/categoryImages";
import { turkeyData } from "../data/turkeyData";
import "../styles/AdPage.css";
import { fetchFavorites, addFavorite, removeFavorite } from "../services/favoritesApi";
import { fetchListings, fetchListingsMeta } from "../services/listingsApi";
import { fetchReviewCountsForListings } from "../services/reviewsApi";
import { getListingImageStyle } from "../utils/listingImagePresentation";
import { showAppToast } from "../utils/showAppToast";

const isDevelopment = process.env.NODE_ENV === 'development';

const SORT_OPTIONS = [
  { label: "الافتراضي", value: "default" },
  { label: "الأقرب (المسافة)", value: "distance_asc" },
  { label: "السعر: من الأقل إلى الأعلى", value: "price_asc" },
  { label: "السعر: من الأعلى إلى الأقل", value: "price_desc" },
  { label: "حسب التقييم (الأعلى)", value: "rating_desc" },
  { label: "حسب عدد التعليقات (الأكثر)", value: "reviews_desc" },
];

function sortCodeFromLabel(label) {
  const found = SORT_OPTIONS.find((x) => x.label === label);
  return found ? found.value : "default";
}

const FILTER_SENTINEL_LABELS = new Set(["جميع التخصصات", "جميع المدن", "جميع الفئات"]);

function specialtyNameFromEntry(entry) {
  if (entry == null) return "";
  if (typeof entry === "string") return String(entry).trim();
  if (typeof entry === "object") {
    const name = entry.name ?? entry.label ?? entry.title;
    if (name != null) return String(name).trim();
  }
  return "";
}

function normalizeSpecialtyList(raw) {
  return [...new Set(
    (Array.isArray(raw) ? raw : [])
      .map(specialtyNameFromEntry)
      .filter((name) => name && !FILTER_SENTINEL_LABELS.has(name))
  )].sort((a, b) => a.localeCompare(b, "tr"));
}

function normalizeSpecialtiesByCategory(map) {
  if (!map || typeof map !== "object") return {};
  return Object.fromEntries(
    Object.entries(map).map(([cat, list]) => [cat, normalizeSpecialtyList(list)])
  );
}

function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function getCityCoords(cityName) {
  if (!cityName) return null;
  const normalized = cityName.replace('İ', 'I').replace('ı', 'i');
  const cityData = turkeyData[cityName] || turkeyData[normalized];
  if (!cityData || !Array.isArray(cityData) || cityData.length === 0) return null;
  const total = cityData.reduce((acc, district) => ({
    lat: acc.lat + district.lat,
    lng: acc.lng + district.lng,
    count: acc.count + 1
  }), { lat: 0, lng: 0, count: 0 });
  return {
    lat: total.lat / total.count,
    lng: total.lng / total.count
  };
}

/* ── Location Modal ── */
const LocationModal = ({ isOpen, onClose, userAddresses, onLocationSelect, currentLocation, navigate }) => {
  if (!isOpen) return null;

  const handleAddressSelect = (address) => {
    onLocationSelect(address.lat, address.lng, address.city, address.district);
    onClose();
  };

  return (
    <div className="location-modal active">
      <div className="modal-header">
        <h4><i className="fas fa-map-marker-alt"></i> اختر موقعاً</h4>
        <button className="close-btn" onClick={onClose}>&times;</button>
      </div>

      {userAddresses.length === 0 ? (
        <div className="no-addresses">
          <div className="no-addresses-icon">
            <i className="fas fa-home"></i>
          </div>
          <p>ليس لديك أي عناوين مسجلة.</p>
          <p className="no-addresses-subtext">يمكنك تحديد موقعك عن طريق إضافة عنوان من صفحة ملفك الشخصي.</p>
          <button className="btn-secondary" onClick={() => { onClose(); navigate("/profile"); }}>
            الذهاب لصفحة الملف الشخصي <i className="fas fa-arrow-right"></i>
          </button>
        </div>
      ) : (
        <div className="saved-addresses">
          <div className="addresses-header">
            <i className="fas fa-address-book"></i>
            <span>عناوينك المسجلة</span>
          </div>
          <div className="addresses-list">
            {userAddresses.map(address => (
              <button key={address.id} className="location-btn-option" onClick={() => handleAddressSelect(address)}>
                <div className="address-icon">
                  <i className="fas fa-location-dot"></i>
                </div>
                <div className="address-details">
                  <div className="address-name">{address.addressName || "عنواني"}</div>
                  <div className="address-full">
                    {address.neighborhood && `${address.neighborhood}, `}
                    {address.district}, {address.city}
                  </div>
                </div>
                <i className="fas fa-chevron-right"></i>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

/* ── Voice Modal ── */
const VoiceModal = ({ isOpen, onClose, status, onStop }) => {
  if (!isOpen) return null;
  return (
    <div className="voice-modal active">
      <div className="voice-modal-content">
        <div className="voice-header">
          <h3>البحث الصوتي</h3>
          <button className="close-btn" onClick={onClose}>&times;</button>
        </div>
        <div className="voice-body">
          <div className="wave-animation">
            <span></span><span></span><span></span><span></span><span></span>
          </div>
          <p className="voice-text">{status}</p>
          <button className="stop-voice-btn" onClick={onStop}>
            <i className="fas fa-stop"></i> إيقاف
          </button>
        </div>
      </div>
    </div>
  );
};

/* ── Ana Sayfa ── */
function readListingsPageFromUrl() {
  try {
    const raw = new URLSearchParams(window.location.search).get("sayfa");
    const p = parseInt(raw || "1", 10);
    return Number.isFinite(p) && p >= 1 ? p : 1;
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
  const [selectedLocation, setSelectedLocation] = useState({ city: "", district: "", lat: null, lng: null });
  const [searchText, setSearchText] = useState("");
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [showVoiceModal, setShowVoiceModal] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState("Dinliyorum...");
  const [cities, setCities] = useState([]);
  const [filteredListings, setFilteredListings] = useState([]);
  const [totalListings, setTotalListings] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [currentPage, setCurrentPage] = useState(readListingsPageFromUrl);
  const [tempCategory, setTempCategory] = useState("Tüm Kategoriler");
  const [tempSpecialty, setTempSpecialty] = useState("Tüm Uzmanlıklar");
  const [tempCity, setTempCity] = useState("Tüm Şehirler");
  const [tempMinPrice, setTempMinPrice] = useState("");
  const [tempMaxPrice, setTempMaxPrice] = useState("");
  const [tempSortBy, setTempSortBy] = useState("Varsayılan");

  const [activeCategory, setActiveCategory] = useState("Tüm Kategoriler");
  const [activeSpecialty, setActiveSpecialty] = useState("Tüm Uzmanlıklar");
  const [activeCity, setActiveCity] = useState("Tüm Şehirler");
  const [activeMinPrice, setActiveMinPrice] = useState("");
  const [activeMaxPrice, setActiveMaxPrice] = useState("");
  const [activeSortBy, setActiveSortBy] = useState("Varsayılan");
  const [categoryOptions, setCategoryOptions] = useState(["Tüm Kategoriler"]);
  const [specialtyOptions, setSpecialtyOptions] = useState(["Tüm Uzmanlıklar"]);
  const [specialtiesByCategory, setSpecialtiesByCategory] = useState({});
  const [cityOptions, setCityOptions] = useState(["Tüm Şehirler"]);

  const [showProfileWarning, setShowProfileWarning] = useState(false);
  const [warningType, setWarningType] = useState('incomplete');
  const [expertName, setExpertName] = useState('');
  const [favorites, setFavorites] = useState({});
  const [userAddresses, setUserAddresses] = useState([]);

  const [firestoreDisplayName, setFirestoreDisplayName] = useState("");

  const updateListingsPageParam = useCallback(
    (page) => {
      setSearchParams(
        (prev) => {
          const n = new URLSearchParams(prev);
          if (page <= 1) n.delete("sayfa");
          else n.set("sayfa", String(page));
          return n;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  useEffect(() => {
    const raw = searchParams.get("sayfa");
    const p = Math.max(1, parseInt(raw || "1", 10) || 1);
    setCurrentPage((prev) => (prev === p ? prev : p));
  }, [searchParams]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      
      if (currentUser) {
        try {
          const userDoc = await getDoc(doc(db, "users", currentUser.uid));
          if (userDoc.exists()) {
            const userData = userDoc.data();
            const finalDisplayName = userData.displayName || userData.email?.split("@")[0] || currentUser.email?.split("@")[0] || "Kullanici";
            setFirestoreDisplayName(finalDisplayName);

            if (userData.userType === 'PENDING_PROVIDER' && !userData.profileCompleted) {
              setExpertName(finalDisplayName || 'Uzman');
              setShowProfileWarning(true);
              setWarningType('incomplete');
            } else if (userData.userType === 'PENDING_PROVIDER' && userData.profileCompleted) {
              setExpertName(finalDisplayName || 'Uzman');
              setShowProfileWarning(true);
              setWarningType('pending_approval');
            } else {
              setShowProfileWarning(false);
            }
          } else {
            setFirestoreDisplayName(currentUser.email?.split("@")[0] || "Kullanici");
            setShowProfileWarning(false);
          }
        } catch (error) {
          if (isDevelopment) console.error("Kullanıcı durumu kontrol edilirken hata:", error.message);
          setFirestoreDisplayName(currentUser.email?.split("@")[0] || "Kullanici");
        }
      } else {
        setFirestoreDisplayName("");
        setShowProfileWarning(false);
        setFavorites({});
      }
      
      setLoading(false);
    });
    return () => unsubscribe();
  }, [navigate]);

  useEffect(() => {
    if (!user) return;
    const fetchAddresses = async () => {
      try {
        const addressesRef = collection(db, "users", user.uid, "addresses");
        const snapshot = await getDocs(addressesRef);
        const addresses = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setUserAddresses(addresses);
      } catch (error) {
        if (isDevelopment) console.error("Adresler çekilirken hata:", error.message);
      }
    };
    fetchAddresses();
  }, [user]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    fetchFavorites(user)
      .then((remoteFavorites) => { if (!cancelled) setFavorites(remoteFavorites || {}); })
      .catch((error) => { if (isDevelopment) console.error("Failed to load favorites:", error.message); });
    return () => { cancelled = true; };
  }, [user]);

  useEffect(() => {
    if (userAddresses.length > 0 && !selectedLocation.lat && !selectedLocation.lng) {
      const firstAddress = userAddresses[0];
      setSelectedLocation({
        lat: firstAddress.lat,
        lng: firstAddress.lng,
        city: firstAddress.city,
        district: firstAddress.district
      });
    }
  }, [userAddresses, selectedLocation.lat, selectedLocation.lng]);

  useEffect(() => {
    const loadCities = async () => {
      try {
        const response = await fetch("/cities.json");
        const data = await response.json();
        setCities(data.cities);
        setCityOptions(["Tüm Şehirler", ...data.cities.map((city) => city.name)]);
      } catch {
        const fallback = [
          { id: 34, name: "Istanbul", districts: ["Kadikoy", "Besiktas", "Uskudar"] },
          { id: 6, name: "Ankara", districts: ["Cankaya", "Kecioren"] },
          { id: 35, name: "Izmir", districts: ["Konak", "Karsiyaka"] },
        ];
        setCities(fallback);
        setCityOptions(["Tüm Şehirler", ...fallback.map((city) => city.name)]);
      }
    };
    loadCities();
  }, []);

  useEffect(() => {
    fetchListingsMeta()
      .then((meta) => {
        const categories = Array.isArray(meta?.categories) ? meta.categories : [];
        setCategoryOptions(["Tüm Kategoriler", ...categories]);
        const specialties = normalizeSpecialtyList(meta?.specialties);
        setSpecialtyOptions(["Tüm Uzmanlıklar", ...specialties]);
        setSpecialtiesByCategory(normalizeSpecialtiesByCategory(meta?.specialtiesByCategory));
      })
      .catch((error) => { if (isDevelopment) console.error("Failed to load listing metadata:", error.message); });
  }, []);

  useEffect(() => {
    const selected = tempCategory && tempCategory !== "Tüm Kategoriler" ? tempCategory : null;
    const selectedKey = selected ? String(selected).trim().toLowerCase() : null;
    const scoped = selectedKey ? specialtiesByCategory?.[selectedKey] : null;
    const scopedNames = normalizeSpecialtyList(scoped);
    if (scopedNames.length) {
      setSpecialtyOptions(["Tüm Uzmanlıklar", ...scopedNames]);
      if (tempSpecialty !== "Tüm Uzmanlıklar" && !scopedNames.includes(tempSpecialty)) {
        setTempSpecialty("Tüm Uzmanlıklar");
      }
      return;
    }

    if (selectedKey) {
      setSpecialtyOptions(["Tüm Uzmanlıklar"]);
      if (tempSpecialty !== "Tüm Uzmanlıklar") setTempSpecialty("Tüm Uzmanlıklar");
      return;
    }

    const allSpecialties = normalizeSpecialtyList(
      Object.values(specialtiesByCategory).flatMap((x) => (Array.isArray(x) ? x : []))
    );
    setSpecialtyOptions(["Tüm Uzmanlıklar", ...allSpecialties]);
  }, [tempCategory, tempSpecialty, specialtiesByCategory]);

  useEffect(() => {
    let cancelled = false;
    setListingsLoading(true);
    
    const params = {
      page: currentPage,
      limit: 6,
      q: searchText.trim() || undefined,
      category: activeCategory !== "Tüm Kategoriler" ? activeCategory : undefined,
      serviceSubcategory: activeSpecialty !== "Tüm Uzmanlıklar" ? activeSpecialty : undefined,
      city: activeCity !== "Tüm Şehirler" ? activeCity : undefined,
      minPrice: activeMinPrice || undefined,
      maxPrice: activeMaxPrice || undefined,
      sort: sortCodeFromLabel(activeSortBy),
      lat: selectedLocation.lat,
      lng: selectedLocation.lng,
    };
    
    fetchListings(params)
      .then(async (payload) => {
        if (cancelled) return;
        let items = payload?.items || [];
        items = items.map(item => {
          let distance = null;
          if (selectedLocation.lat && selectedLocation.lng) {
            const providerLat = Number(item.providerLat);
            const providerLng = Number(item.providerLng);
            if (providerLat && providerLng) {
              const dist = haversineDistance(selectedLocation.lat, selectedLocation.lng, providerLat, providerLng);
              distance = dist.toFixed(1);
            } else if (item.city) {
              const providerCoords = getCityCoords(item.city);
              if (providerCoords) {
                const dist = haversineDistance(selectedLocation.lat, selectedLocation.lng, providerCoords.lat, providerCoords.lng);
                distance = dist.toFixed(1);
              }
            }
          }
          return { ...item, distanceKm: distance ? parseFloat(distance) : null };
        });

        // reviews sayısı bazen geride kalabiliyor (geçmiş veriler); gerçek sayıyı reviews koleksiyonundan çekip override ediyoruz
        try {
          const ids = items.map((x) => x.id);
          const counts = await fetchReviewCountsForListings(ids);
          items = items.map((it) => ({
            ...it,
            reviews: counts?.[String(it.id)] ?? it.reviews ?? 0,
          }));
        } catch (_) {
          // noop
        }

        setFilteredListings(items);
        setTotalListings(payload?.total || 0);
        const tp = Math.max(1, Number(payload?.totalPages) || 1);
        setTotalPages(tp);
        setCurrentPage((prev) => {
          if (prev <= tp) return prev;
          updateListingsPageParam(tp);
          return tp;
        });
      })
      .catch((error) => {
        if (!cancelled) {
          if (isDevelopment) console.error("Failed to load listings:", error.message);
          setFilteredListings([]);
          setTotalListings(0);
          setTotalPages(1);
          setCurrentPage((prev) => {
            if (prev <= 1) return prev;
            updateListingsPageParam(1);
            return 1;
          });
        }
      })
      .finally(() => { if (!cancelled) setListingsLoading(false); });
    return () => { cancelled = true; };
  }, [currentPage, searchText, activeCategory, activeSpecialty, activeCity, activeMinPrice, activeMaxPrice, activeSortBy, selectedLocation, updateListingsPageParam]);

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

  const startVoiceSearch = () => {
    setShowVoiceModal(true);
    setVoiceStatus("جاري الاستماع...");
    if ("webkitSpeechRecognition" in window || "SpeechRecognition" in window) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      const recognition = new SpeechRecognition();
      recognition.lang = "tr-TR";
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.start();
      recognition.onresult = (event) => {
        let transcript = event.results[0][0].transcript;
        transcript = transcript.replace(/[.,!?]/g, "").trim();
        setVoiceStatus(`"${transcript}"`);
        handleSearch(transcript);
        setTimeout(() => setShowVoiceModal(false), 1500);
      };
      recognition.onerror = () => {
        setVoiceStatus("لم يتم الفهم، يرجى المحاولة مرة أخرى");
        setTimeout(() => setShowVoiceModal(false), 1500);
      };
      recognition.onend = () => { setTimeout(() => setShowVoiceModal(false), 1500); };
    } else {
      setVoiceStatus("متصفحك لا يدعم البحث الصوتي");
      setTimeout(() => setShowVoiceModal(false), 2000);
    }
  };

  const toggleFavorite = async (id) => {
    if (!user) {
      showAppToast("يرجى تسجيل الدخول لإضافة الإعلان للمفضلة.", "error");
      navigate("/login");
      return;
    }
    const prevFavorites = favorites;
    const isCurrentlyFavorite = !!favorites[id];
    setFavorites({ ...favorites, [id]: !isCurrentlyFavorite });
    try {
      if (isCurrentlyFavorite) {
        await removeFavorite(id, user);
      } else {
        await addFavorite(id, user);
        showAppToast("تم إضافة الإعلان إلى المفضلة.", "success");
      }
    } catch (error) {
      setFavorites(prevFavorites);
      if (isDevelopment) console.error("Failed to update favorite:", error.message);
      showAppToast("تعذر تحديث المفضلة. يرجى المحاولة مرة أخرى.", "error");
    }
  };

  const applyFilters = () => {
    setActiveCategory(tempCategory);
    setActiveSpecialty(tempSpecialty);
    setActiveCity(tempCity);
    setActiveMinPrice(tempMinPrice);
    setActiveMaxPrice(tempMaxPrice);
    setActiveSortBy(tempSortBy);
    setCurrentPage(1);
    updateListingsPageParam(1);
  };

  const resetFilters = () => {
    setTempCategory("جميع الفئات");
    setTempSpecialty("جميع التخصصات");
    setTempCity("جميع المدن");
    setTempMinPrice("");
    setTempMaxPrice("");
    setTempSortBy("الافتراضي");
    setSearchText("");
    setActiveCategory("جميع الفئات");
    setActiveSpecialty("جميع التخصصات");
    setActiveCity("جميع المدن");
    setActiveMinPrice("");
    setActiveMaxPrice("");
    setActiveSortBy("الافتراضي");
    setCurrentPage(1);
    updateListingsPageParam(1);
  };

  const goToListingsPage = (p) => {
    const next = Math.max(1, Math.min(totalPages, p));
    setCurrentPage(next);
    updateListingsPageParam(next);
  };

  const pageInfo = useMemo(() => `${currentPage}/${totalPages}`, [currentPage, totalPages]);

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
        <h1>مرحباً بك، <span className="highlight-text">{getUserDisplayName()}</span></h1>
        <p>في أي مجال تحتاج خبيراً اليوم؟</p>
      </div>

      <div className="search-section">
        <div className="search-container">
          <div className="search-wrapper">
            <input
              type="text"
              className="search-input"
              value={searchText}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="ابحث عن خدمة، خبير، أو فئة..."
            />
            <button className="voice-btn" onClick={startVoiceSearch}>
              <i className="fas fa-microphone"></i>
            </button>
          </div>
        </div>

        <div className="location-container">
          <button className="location-btn" onClick={() => setShowLocationModal(true)}>
            <i className="fas fa-map-marker-alt location-icon"></i>
            <div className="location-info">
              <span className="location-label">موقعك</span>
              <span className="location-value">
                {selectedLocation.city
                  ? selectedLocation.district
                    ? `${selectedLocation.district}, ${selectedLocation.city}`
                    : selectedLocation.city
                  : "اختر موقعاً"}
              </span>
            </div>
            <i className="fas fa-chevron-down"></i>
          </button>

          <LocationModal
            isOpen={showLocationModal}
            onClose={() => setShowLocationModal(false)}
            userAddresses={userAddresses}
            onLocationSelect={(lat, lng, city, district) => {
              setSelectedLocation({ lat, lng, city, district });
              setShowLocationModal(false);
            }}
            currentLocation={selectedLocation}
            navigate={navigate}
          />
        </div>
      </div>

      <div className="ad-content">
        <aside className="sidebar-filters">
          {showProfileWarning && user && (
            <>
              {warningType === 'incomplete' && (
                <div className="sidebar-warning sidebar-warning-incomplete">
                  <div className="sidebar-warning-header">
                    <i className="fas fa-exclamation-circle"></i>
                    <h4>طلبك غير مكتمل!</h4>
                  </div>
                  <p>مرحباً {expertName}، يرجى إكمال ملفك الشخصي لإتمام طلب انضمامك كخبير.</p>
                  <button className="sidebar-warning-button" onClick={() => navigate('/expert-complete-profile')}>
                    أكمل الملف الشخصي <i className="fas fa-arrow-right"></i>
                  </button>
                </div>
              )}
              {warningType === 'pending_approval' && (
                <div className="sidebar-warning sidebar-warning-pending">
                  <div className="sidebar-warning-header">
                    <i className="fas fa-hourglass-end"></i>
                    <h4>بانتظار الموافقة</h4>
                  </div>
                  <p>مرحباً {expertName}، تم إكمال ملفك الشخصي بنجاح وبانتظار موافقة الإدارة.</p>
                  <p className="sidebar-warning-subtext">سيتم إبلاغك عبر رسالة SMS فور اكتمال عملية الموافقة.</p>
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
            <label><i className="fa-solid fa-border-all"></i> الفئة</label>
            <select value={tempCategory} onChange={(e) => setTempCategory(e.target.value)}>
              {categoryOptions.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
            </select>
          </div>

          <div className="filter-group">
            <label><i className="fa-solid fa-wand-magic-sparkles"></i> التخصص</label>
            <select value={tempSpecialty} onChange={(e) => setTempSpecialty(e.target.value)}>
              {specialtyOptions.map((s) => (
                <option key={s} value={s}>{typeof s === "string" ? s : specialtyNameFromEntry(s)}</option>
              ))}
            </select>
          </div>

          <div className="filter-group">
            <label><i className="fa-solid fa-location-dot"></i> المدينة</label>
            <select value={tempCity} onChange={(e) => setTempCity(e.target.value)}>
              {cityOptions.map((city) => <option key={city} value={city}>{city}</option>)}
            </select>
          </div>

          <div className="filter-group">
            <label><i className="fa-solid fa-money-bill-wave"></i> نطاق السعر</label>
            <div className="price-inputs">
              <input type="number" placeholder="الحد الأدنى ل.س" value={tempMinPrice} onChange={(e) => setTempMinPrice(e.target.value)} min="0" />
              <span>-</span>
              <input type="number" placeholder="الحد الأقصى ل.س" value={tempMaxPrice} onChange={(e) => setTempMaxPrice(e.target.value)} min="0" />
            </div>
          </div>

          <div className="filter-group">
            <label><i className="fa-solid fa-arrow-down-short-wide"></i> الترتيب</label>
            <select value={tempSortBy} onChange={(e) => setTempSortBy(e.target.value)}>
              {SORT_OPTIONS.map((opt) => <option key={opt.value} value={opt.label}>{opt.label}</option>)}
            </select>
          </div>

          <button className="btn-apply-filter" onClick={applyFilters}>تطبيق</button>
          <button className="btn-clear-filter" onClick={resetFilters}>إعادة تعيين</button>
        </aside>

        <main className="experts-list">
          {listingsLoading ? (
            <LoadingSpinner text="جاري تحميل الإعلانات..." />
          ) : filteredListings.length === 0 ? (
            <div className="no-results">
              <i className="fas fa-search"></i>
              <p>لم يتم العثور على إعلانات تطابق المعايير المحددة.</p>
              <button className="btn-clear-filter" onClick={resetFilters}>مسح التصفية</button>
            </div>
          ) : (
            <>
              {filteredListings.map((item) => (
                <div key={item.id} className="expert-card">
                  <img
                    src={item.image || categoryImages[item.category] || "/default-listing.svg"}
                    alt={item.title}
                    className="expert-avatar"
                    style={getListingImageStyle(item)}
                    onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = "/default-listing.svg"; }}
                  />
                  <div className="expert-info-wrapper">
                    <div className="expert-info-content">
                      <h3 className="expert-title">{item.title}</h3>
                      <p className="expert-category">
                        <span className="expert-name-badge">{item.expertName}</span>
                        {item.category && <span className="category-separator">•</span>}
                        {item.category && <span>{item.category}</span>}
                        {item.serviceSubcategory && (
                          <>
                            <span className="category-separator">•</span>
                            <span className="expert-specialty-text">{item.serviceSubcategory}</span>
                          </>
                        )}
                      </p>
                      <div className="expert-stats">
                        <span className="rating"><i className="fa-solid fa-star"></i> {item.rating} ({item.reviews} تقييم)</span>
                        <span className="distance">
                          <i className="fa-solid fa-location-arrow"></i> 
                          {item.distanceKm ? `${item.distanceKm.toFixed(1)} كم` : "المسافة غير معروفة"}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="expert-price-action">
                    <div className="expert-card-actions-top">
                      <button
                        type="button"
                        className={`btn-favorite ${user && favorites[item.id] ? "active" : ""}`}
                        onClick={() => toggleFavorite(item.id)}
                      >
                        <i className={`fa-${user && favorites[item.id] ? "solid" : "regular"} fa-heart`}></i>
                      </button>
                      <ListingReportButton listingId={item.id} listingTitle={item.title} />
                    </div>
                    <div className="price">
                      <strong>₺{item.price}</strong>
                      <span className="price-text">تبدأ من</span>
                    </div>
                    <button className="btn-view-profile" onClick={() => navigate(`/ilan/${item.id}`)}>
                      عرض الإعلان
                    </button>
                  </div>
                </div>
              ))}

              {totalPages > 1 && (
                <div style={{ display: "flex", gap: "8px", marginTop: "16px", justifyContent: "center" }}>
                  <button className="btn-clear-filter" disabled={currentPage <= 1} onClick={() => goToListingsPage(currentPage - 1)}>السابق</button>
                  <button className="btn-apply-filter" style={{ cursor: "default" }}>صفحة {pageInfo} - الإجمالي {totalListings}</button>
                  <button className="btn-clear-filter" disabled={currentPage >= totalPages} onClick={() => goToListingsPage(currentPage + 1)}>التالي</button>
                </div>
              )}
            </>
          )}
        </main>
      </div>

      <VoiceModal
        isOpen={showVoiceModal}
        onClose={() => setShowVoiceModal(false)}
        status={voiceStatus}
        onStop={() => setShowVoiceModal(false)}
      />
    </div>
  );
};

export default AdPage;
