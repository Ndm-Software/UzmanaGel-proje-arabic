// ExpertMyListingPage.jsx file code

import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "../firebase/firebaseClient";
import {
  deleteListing,
  fetchMyListings,
  updateListing,
  updateListingStatus,
} from "../services/listingsApi";
import Navbar from "../components/Navbar";
import LoadingSpinner from "../components/LoadingSpinner";
import categoryImages from "../data/categoryImages";
import DOMPurify from "dompurify";
import { getListingImageStyle } from "../utils/listingImagePresentation";
import { showAppToast } from "../utils/showAppToast";
import "../styles/ExpertMyListingsPage.css";

const isDevelopment = import.meta.env.DEV;

const sanitizeText = (text) => {
  if (!text) return "";
  return DOMPurify.sanitize(String(text));
};

const normalizeSpecialties = (raw) => {
  const arr = Array.isArray(raw) ? raw : [];
  return arr
    .map((s) => {
      if (typeof s === "string") {
        const name = String(s || "").trim();
        return name ? { name, startingPrice: 0 } : null;
      }
      const name = String(s?.name || "").trim();
      const startingPrice = Number(s?.startingPrice) || 0;
      return name ? { name, startingPrice } : null;
    })
    .filter(Boolean);
};

// 27-04 Edrees: Listing status tabs
const LISTING_STATUS = {
  ACTIVE: "ACTIVE",
  UNPUBLISHED: "UNPUBLISHED",
  DELETED: "DELETED",
};

const STATUS_TABS = [
  {
    key: LISTING_STATUS.ACTIVE,
    label: "Yayındaki İlanlar",
    description: "Şu anda yayında olan ve kullanıcılar tarafından görülebilen ilanlar.",
    icon: "fa-bullhorn",
  },
  {
    key: LISTING_STATUS.UNPUBLISHED,
    label: "Yayından Kaldırılanlar",
    description: "Yayından kaldırılmış ilanlar. Düzenleyip tekrar yayına alabilirsiniz.",
    icon: "fa-eye-slash",
  },
  {
    key: LISTING_STATUS.DELETED,
    label: "Silinenler",
    description: "Silinmiş ilanlar. Bu bölümde işlem yapılamaz.",
    icon: "fa-trash",
  },
];

const normalizeListingStatus = (item) => {
  const status = String(item?.status || "ACTIVE").trim().toUpperCase();

  if (status === LISTING_STATUS.ACTIVE) return LISTING_STATUS.ACTIVE;
  if (status === LISTING_STATUS.UNPUBLISHED) return LISTING_STATUS.UNPUBLISHED;
  if (status === LISTING_STATUS.DELETED) return LISTING_STATUS.DELETED;

  return LISTING_STATUS.ACTIVE;
};

const getStatusBadgeText = (status) => {
  if (status === LISTING_STATUS.ACTIVE) return "Yayında";
  if (status === LISTING_STATUS.UNPUBLISHED) return "Yayından Kaldırıldı";
  if (status === LISTING_STATUS.DELETED) return "Silindi";
  return "Bilinmiyor";
};

const statusChangeSuccessMessage = (nextStatus) => {
  const s = String(nextStatus || "").toUpperCase();
  if (s === LISTING_STATUS.ACTIVE) return "İlan tekrar yayına alındı.";
  if (s === LISTING_STATUS.UNPUBLISHED) return "İlan yayından kaldırıldı.";
  if (s === LISTING_STATUS.DELETED) return "İlan silindi.";
  return "İlan durumu güncellendi.";
};

const EDIT_NO_CHANGES_MSG = "Herhangi bir değişiklik yapılmadı.";

export default function ExpertMyListingsPage() {
  const navigate = useNavigate();

  const [authLoading, setAuthLoading] = useState(true);
  const [listingsLoading, setListingsLoading] = useState(false);
  const [listings, setListings] = useState([]);
  const [activeStatusTab, setActiveStatusTab] = useState(LISTING_STATUS.ACTIVE);
  const [expertUser, setExpertUser] = useState(null);

  const [deleteError, setDeleteError] = useState("");
  const [deletingId, setDeletingId] = useState(null);
  const [confirmDeleteItem, setConfirmDeleteItem] = useState(null);

  const [editingItem, setEditingItem] = useState(null);
  const [editForm, setEditForm] = useState({
    title: "",
    category: "",
    serviceSubcategory: "",
    serviceSubcategoryDetails: "",
    price: "",
    city: "",
    pricingType: "Proje Bazlı",
    description: "",
  });


  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState("");
  const [categoriesData, setCategoriesData] = useState([]);
  const [editBaseline, setEditBaseline] = useState(null);
  const [editImageMode, setEditImageMode] = useState("keep");
  const [editImageFile, setEditImageFile] = useState(null);
  const [editImagePreview, setEditImagePreview] = useState("");
  const [providerSpecialties, setProviderSpecialties] = useState([]);

  const totalLimit = 10;

  const listingsWithStatus = useMemo(() => {
    return listings.map((item) => ({
      ...item,
      normalizedStatus: normalizeListingStatus(item),
    }));
  }, [listings]);

  const MAX_DELETED_VISIBLE = 10;

  const visibleListings = useMemo(() => {
    const filtered = listingsWithStatus.filter(
      (item) => item.normalizedStatus === activeStatusTab
    );

    if (activeStatusTab === LISTING_STATUS.DELETED) {
      const sortedByDeleted = [...filtered].sort((a, b) => {
        const aMs = a.deletedAt?.toMillis ? a.deletedAt.toMillis() : 0;
        const bMs = b.deletedAt?.toMillis ? b.deletedAt.toMillis() : 0;
        return bMs - aMs;
      });

      return sortedByDeleted.slice(0, MAX_DELETED_VISIBLE);
    }

    return filtered;
  }, [listingsWithStatus, activeStatusTab]);

  const statusCounts = useMemo(() => {
    return STATUS_TABS.reduce((acc, tab) => {
      acc[tab.key] = listingsWithStatus.filter(
        (item) => item.normalizedStatus === tab.key
      ).length;
      return acc;
    }, {});
  }, [listingsWithStatus]);

  const activeCount = listingsWithStatus.filter(
    (item) => item.normalizedStatus === LISTING_STATUS.ACTIVE
  ).length;

  const isTotalLimitReached = activeCount >= totalLimit;

  const currentTabCount = statusCounts?.[activeStatusTab] ?? 0;

  useEffect(() => {
    const modalOpen = !!editingItem || !!confirmDeleteItem;
    if (!modalOpen) return;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [editingItem, confirmDeleteItem]);

  useEffect(() => {
    return () => {
      if (editImagePreview && editImagePreview.startsWith("blob:")) {
        URL.revokeObjectURL(editImagePreview);
      }
    };
  }, [editImagePreview]);

  useEffect(() => {
    let mounted = true;

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!mounted) return;

      if (!user) {
        navigate("/login", { replace: true });
        return;
      }

      try {
        const userDoc = await getDoc(doc(db, "users", user.uid));
        const userData = userDoc.exists() ? userDoc.data() : {};

        if (userData?.userType !== "PROVIDER") {
          navigate("/ilanlar", { replace: true });
          return;
        }

        setExpertUser(user);
      } catch (error) {
        if (isDevelopment) console.error("Uzman kontrolu sirasinda hata:", error.message);
        navigate("/login", { replace: true });
      } finally {
        if (mounted) setAuthLoading(false);
      }
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [navigate]);

  useEffect(() => {
    if (authLoading || !expertUser) return;

    let cancelled = false;
    setListingsLoading(true);

    fetchMyListings(expertUser)
      .then((payload) => {
        if (cancelled) return;

        const items = Array.isArray(payload?.items) ? payload.items : [];
        setListings(items);
      })
      .catch((error) => {
        if (!cancelled) {
          if (isDevelopment) console.error("Uzman ilanlari yuklenemedi:", error.message);
          setListings([]);
        }
      })
      .finally(() => {
        if (!cancelled) setListingsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [authLoading, expertUser]);

  useEffect(() => {
    if (authLoading || !expertUser) return;

    let cancelled = false;

    getDoc(doc(db, "service_providers", expertUser.uid))
      .then((snap) => {
        if (cancelled) return;

        const data = snap.exists() ? snap.data() : {};
        setProviderSpecialties(normalizeSpecialties(data?.specialties));
      })
      .catch((error) => {
        if (isDevelopment) console.error("Uzman uzmanlıkları yüklenemedi:", error.message);
        if (!cancelled) setProviderSpecialties([]);
      });

    return () => {
      cancelled = true;
    };
  }, [authLoading, expertUser]);

  useEffect(() => {
    let cancelled = false;

    async function loadCategories() {
      try {
        const response = await fetch("/expert-data.json");
        const json = await response.json();

        if (cancelled) return;

        setCategoriesData(Array.isArray(json?.categories) ? json.categories : []);
      } catch (error) {
        if (isDevelopment) console.error("Kategori verileri yüklenemedi:", error.message);
        if (!cancelled) setCategoriesData([]);
      }
    }

    loadCategories();

    return () => {
      cancelled = true;
    };
  }, []);

  const expertDisplayName = useMemo(() => {
    if (!expertUser) return "Uzman";
    return sanitizeText(expertUser.displayName || expertUser.email?.split("@")[0] || "Uzman");
  }, [expertUser]);

  const selectedSpecialtyMinPrice = useMemo(() => {
    const name = String(editForm?.serviceSubcategory || "").trim();
    if (!name) return 0;
    const match = providerSpecialties.find((s) => s?.name === name);
    return Math.max(0, Number(match?.startingPrice) || 0);
  }, [editForm?.serviceSubcategory, providerSpecialties]);

  const isFieldChanged = (fieldName) => {
    if (!editBaseline) return false;

    const currentValue = String(editForm?.[fieldName] ?? "").trim();
    const initialValue = String(editBaseline?.[fieldName] ?? "").trim();

    return currentValue !== initialValue;
  };

  const hasEditChanges = useMemo(() => {
    if (!editBaseline) return false;
    if (editImageMode !== "keep") return true;

    const textFields = [
      "title",
      "serviceSubcategoryDetails",
      "description",
      "pricingType",
    ];

    if (textFields.some((field) => isFieldChanged(field))) return true;

    const currentPrice = Number(editForm.price);
    const initialPrice = Number(editBaseline.price);
    if (
      Number.isFinite(currentPrice) &&
      Number.isFinite(initialPrice) &&
      currentPrice !== initialPrice
    ) {
      return true;
    }

    return String(editForm.price ?? "").trim() !== String(editBaseline.price ?? "").trim();
  }, [editForm, editBaseline, editImageMode]);

  useEffect(() => {
    if (hasEditChanges && editError === EDIT_NO_CHANGES_MSG) {
      setEditError("");
    }
  }, [hasEditChanges, editError]);

  const getDisplayedImagePreview = () => {
    if (editImageMode === "remove") return "";
    if (editImageMode === "replace") return editImagePreview;
    return String(editingItem?.image || "").trim();
  };

  const closeEditModal = () => {
    if (editImagePreview && editImagePreview.startsWith("blob:")) {
      URL.revokeObjectURL(editImagePreview);
    }
    setEditingItem(null);
    setEditError("");
    setEditImageFile(null);
    setEditImagePreview("");
    setEditImageMode("keep");
  };

  const openEditModal = (item) => {
    if (confirmDeleteItem) setConfirmDeleteItem(null);

    setEditingItem(item);
    setEditError("");

    const specialty = item.serviceSubcategory || "";

    setEditForm({
      title: item.title || "",
      category: item.category || "",
      serviceSubcategory: specialty,
      serviceSubcategoryDetails: item.serviceSubcategoryDetails || "",
      price: String(item.price || ""),
      city: item.city || "",
      pricingType: item.pricingType || "Proje Bazlı",
      description: item.description || "",
    });

    setEditBaseline({
      title: item.title || "",
      category: item.category || "",
      serviceSubcategory: specialty,
      serviceSubcategoryDetails: item.serviceSubcategoryDetails || "",
      price: String(item.price || ""),
      city: item.city || "",
      pricingType: item.pricingType || "Proje Bazlı",
      description: item.description || "",
    });

    setEditImageMode("keep");

    if (editImagePreview && editImagePreview.startsWith("blob:")) {
      URL.revokeObjectURL(editImagePreview);
    }

    setEditImageFile(null);
    setEditImagePreview("");
  };

  const handleChangeListingStatus = async (item, nextStatus) => {
    if (!expertUser || !item?.id) return;

    // Sadece yayındaki ilanlar 10 sınırına dahil.
    if (
      String(nextStatus || "").toUpperCase() === LISTING_STATUS.ACTIVE &&
      item?.normalizedStatus !== LISTING_STATUS.ACTIVE &&
      isTotalLimitReached
    ) {
      const msg =
        "Yayındaki ilan limitine ulaştınız (10/10). Yayına almak için önce bir ilanı yayından kaldırmalısınız.";
      setDeleteError(msg);
      showAppToast(msg, "error");
      return;
    }

    setDeleteError("");
    setDeletingId(item.id);

    try {
      await updateListingStatus(expertUser, item.id, nextStatus);

      setListings((prev) =>
        prev.map((listing) =>
          listing.id === item.id ? { ...listing, status: nextStatus } : listing
        )
      );

      setActiveStatusTab(nextStatus);
      setDeleteError("");
      showAppToast(statusChangeSuccessMessage(nextStatus), "success");
    } catch (error) {
      if (isDevelopment) console.error("Listing status update failed:", error.message);

      const code = error?.code;
      let msg =
        error.message || "İlan durumu güncellenemedi. Lütfen daha sonra tekrar deneyin.";

      if (code === "TOTAL_LISTING_LIMIT_REACHED") {
        msg =
          "Yayındaki ilan limitine ulaştınız (10/10). Yayına almak için önce bir ilanı yayından kaldırmalısınız.";
      }

      setDeleteError(msg);
      showAppToast(msg, "error");
    } finally {
      setDeletingId(null);
    }
  };

  const handleDeleteConfirmed = async (item) => {
    if (!expertUser || !item?.id) return;

    setDeleteError("");
    setDeletingId(item.id);

    try {
      await deleteListing(expertUser, item.id);

      setListings((prev) =>
        prev.map((listing) =>
          listing.id === item.id
            ? { ...listing, status: LISTING_STATUS.DELETED }
            : listing
        )
      );

      setConfirmDeleteItem(null);
      setActiveStatusTab(LISTING_STATUS.DELETED);
      setDeleteError("");
      showAppToast("İlan silindi.", "success");
    } catch (error) {
      if (isDevelopment) console.error("Listing delete failed:", error.message);
      const code = error?.code;
      let msg = "İlan silinemedi. Lütfen daha sonra tekrar deneyin.";
      if (code === "DAILY_DELETE_LIMIT_REACHED") {
        msg = error.message || "Günlük silme limitine ulaştınız. (3/3)";
      }
      setDeleteError(msg);
      showAppToast(msg, "error");
    } finally {
      setDeletingId(null);
    }
  };

  const handleEditSubmit = async (event) => {
    event.preventDefault();
    if (!expertUser || !editingItem) return;

    if (!hasEditChanges) {
      setEditError(EDIT_NO_CHANGES_MSG);
      showAppToast(EDIT_NO_CHANGES_MSG, "info");
      return;
    }

    try {
      setSavingEdit(true);
      setEditError("");

      let imagePatch = undefined;

      if (editImageMode === "remove") {
        imagePatch = null;
      }

      if (editImageMode === "replace") {
        if (!editImageFile) {
          throw new Error("Lütfen bir kapak fotoğrafı seçin (veya 'Kaldır' seçeneğini kullanın).");
        }

        if (editImageFile.size > 5 * 1024 * 1024) {
          throw new Error("Kapak fotoğrafı 5MB'dan büyük olamaz.");
        }

        const allowedTypes = ["image/jpeg", "image/png", "image/webp"];

        if (!allowedTypes.includes(editImageFile.type)) {
          throw new Error("Sadece JPEG, PNG veya WEBP formatında dosya yükleyebilirsiniz.");
        }

        const dataUrl = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result || ""));
          reader.onerror = () => reject(new Error("Kapak fotoğrafı okunamadı."));
          reader.readAsDataURL(editImageFile);
        });

        if (!dataUrl) throw new Error("Kapak fotoğrafı okunamadı.");

        imagePatch = dataUrl;
      }

      const specialty = sanitizeText(
        String(editingItem.serviceSubcategory || editForm.serviceSubcategory || "").trim()
      ).slice(0, 100);
      if (!specialty) {
        throw new Error("Uzmanlık seçmelisiniz.");
      }

      const priceNum = Number(editForm.price);
      if (!editForm.price || priceNum <= 0) {
        throw new Error("Geçerli bir ücret giriniz.");
      }
      if (selectedSpecialtyMinPrice > 0 && priceNum < selectedSpecialtyMinPrice) {
        throw new Error(
          `Ücret, seçtiğiniz uzmanlığın başlangıç fiyatından düşük olamaz (en az ${Number(selectedSpecialtyMinPrice).toLocaleString("tr-TR")} TL).`
        );
      }
      if (priceNum > 1000000) {
        throw new Error("Ücret 1.000.000 TL'den büyük olamaz.");
      }

      const payload = {
        title: sanitizeText(editForm.title.trim()).slice(0, 100),
        category: sanitizeText(editForm.category.trim()).slice(0, 100),
        serviceSubcategory: specialty,
        serviceSubcategoryDetails: sanitizeText(
          String(editForm.serviceSubcategoryDetails || "").trim()
        ).slice(0, 500),
        description: sanitizeText(editForm.description.trim()).slice(0, 2000),
        pricingType: sanitizeText(editForm.pricingType.trim()).slice(0, 50),
        city: sanitizeText(String(editingItem.city || "").trim()).slice(0, 100),
        price: priceNum,
        ...(imagePatch === undefined ? null : { image: imagePatch }),
      };

      const result = await updateListing(expertUser, editingItem.id, payload);

      setListings((prev) =>
        prev.map((it) => {
          if (it.id !== editingItem.id) return it;

          const next = { ...it, ...payload };

          if (Object.prototype.hasOwnProperty.call(result || {}, "image")) {
            next.image = result.image;
          }

          if (Object.prototype.hasOwnProperty.call(result || {}, "imageCrop")) {
            next.imageCrop = result.imageCrop;
          }

          return next;
        })
      );

      if (Object.prototype.hasOwnProperty.call(result || {}, "image")) {
        setEditingItem((prev) => (prev ? { ...prev, image: result.image } : prev));
      }

      if (Object.prototype.hasOwnProperty.call(result || {}, "imageCrop")) {
        setEditingItem((prev) => (prev ? { ...prev, imageCrop: result.imageCrop } : prev));
      }

      showAppToast("Değişiklikler kaydedildi.", "success");
      closeEditModal();
    } catch (error) {
      if (isDevelopment) console.error("Listing update failed:", error.message);

      const code = error?.code;
      let msg = error.message || "İlan güncellenemedi. Lütfen daha sonra tekrar deneyin.";

      if (code === "TOTAL_LISTING_LIMIT_REACHED") {
        msg = "Toplam ilan limitine ulaşıldı (10/10).";
      } else if (code === "SPECIALTY_LIMIT_REACHED") {
        msg = "Bu uzmanlık için limit dolu. Aynı uzmanlıktan en fazla 2 ilan verebilirsiniz.";
      }

      setEditError(msg);
      showAppToast(msg, "error");
    } finally {
      setSavingEdit(false);
    }
  };

  if (authLoading) {
    return (
      <div className="expert-my-listings-page">
        <Navbar />
        <LoadingSpinner text="Uzman paneli yukleniyor..." />
      </div>
    );
  }

  if (!expertUser) return null;

  return (
    <div className="expert-my-listings-page">
      <Navbar />

      <main className="expert-my-listings-main">
        <section className="expert-my-listings-header">
          <div>
            <p className="expert-my-listings-kicker">Uzman Paneli</p>
            <h1>İlanlarım</h1>
            <p>{expertDisplayName} hesabına ait ilanları görüntülüyorsunuz.</p>

            {deleteError ? (
              <p style={{ color: "#ef4444" }}>{sanitizeText(deleteError)}</p>
            ) : null}

            {isTotalLimitReached ? (
              <p style={{ color: "#f3d79a", marginTop: 8 }}>
                Yayındaki ilan limitine ulaştınız. Yeni ilan veremezsiniz.
              </p>
            ) : null}
          </div>

          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
            {isTotalLimitReached ? (
              <button type="button" className="expert-my-listings-create-btn" disabled>
                <i className="fas fa-ban"></i> İlan Verilemez
              </button>
            ) : (
              <Link to="/uzman/ilan-ekle" className="expert-my-listings-create-btn">
                <i className="fas fa-plus"></i> İlan Ver
              </Link>
            )}
          </div>
        </section>

        <section className="expert-my-listings-content">
          <div className="expert-my-listings-content-top">
            <div className="expert-my-listings-tabs" role="tablist" aria-label="İlan durumları">
              {STATUS_TABS.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  className={`expert-my-listings-tab ${activeStatusTab === tab.key ? "active" : ""}`}
                  onClick={() => setActiveStatusTab(tab.key)}
                >
                  <span className="expert-my-listings-tab-icon">
                    <i className={`fas ${tab.icon}`}></i>
                  </span>

                  <span className="expert-my-listings-tab-text">
                    {tab.label}
                    <small>{statusCounts[tab.key] || 0}</small>
                  </span>
                </button>
              ))}
            </div>

            <span className="expert-my-listings-limit-pill">
              {activeStatusTab === LISTING_STATUS.ACTIVE
                ? `${activeCount}/${totalLimit}`
                : `${currentTabCount}/${totalLimit}`}
            </span>
          </div>

          <p className="expert-my-listings-tab-description">
            {STATUS_TABS.find((tab) => tab.key === activeStatusTab)?.description}
          </p>

          {activeStatusTab === LISTING_STATUS.DELETED &&
          (statusCounts?.[LISTING_STATUS.DELETED] || 0) > MAX_DELETED_VISIBLE ? (
            <p style={{ color: "#94a3b8", marginTop: 8, fontSize: 13 }}>
              Son {MAX_DELETED_VISIBLE} silinen ilan gösteriliyor.
            </p>
          ) : null}

          {listingsLoading ? (
            <LoadingSpinner text="İlanlar yükleniyor..." />
          ) : visibleListings.length === 0 ? (
            <div className="expert-my-listings-empty">
              <i className="fas fa-rectangle-list"></i>
              <h3>Bu bölümde ilan yok</h3>
              <p>
                {activeStatusTab === LISTING_STATUS.ACTIVE
                  ? "Yayında olan ilanınız bulunmuyor."
                  : activeStatusTab === LISTING_STATUS.UNPUBLISHED
                    ? "Yayından kaldırılmış ilanınız bulunmuyor."
                    : "Silinmiş ilanınız bulunmuyor."}
              </p>
            </div>
          ) : (
            <div className="expert-my-listings-grid">
              {visibleListings.map((item) => (
                <article key={item.id} className="expert-my-listings-card">
                  <img
                    src={item.image || categoryImages[item.category] || "/default-listing.svg"}
                    alt={sanitizeText(item.title)}
                    style={getListingImageStyle(item)}
                    onError={(event) => {
                      event.currentTarget.onerror = null;
                      event.currentTarget.src = "/default-listing.svg";
                    }}
                  />

                  <div className="expert-my-listings-card-body">
                    <div className="expert-my-listings-badges-row">
                      <span className="expert-my-listings-category">
                        {sanitizeText(item.category)}
                      </span>

                      <span className={`expert-my-listings-status-badge status-${item.normalizedStatus.toLowerCase()}`}>
                        {getStatusBadgeText(item.normalizedStatus)}
                      </span>
                    </div>

                    <h3>{sanitizeText(item.title)}</h3>

                    {String(item.serviceSubcategory || "").trim() ? (
                      <p className="expert-my-listings-specialty">
                        <span className="expert-my-listings-specialty-label">Uzmanlık</span>
                        {": "}
                        {sanitizeText(String(item.serviceSubcategory).trim())}
                      </p>
                    ) : null}

                    <p>{sanitizeText(item.city)}</p>

                    <div className="expert-my-listings-card-footer">
                      <div className="expert-my-listings-card-footer-top">
                        <strong>TL {item.price}</strong>

                        {item.normalizedStatus !== LISTING_STATUS.DELETED ? (
                          <button type="button" onClick={() => openEditModal(item)}>
                            Düzenle
                          </button>
                        ) : null}
                      </div>

                      {item.normalizedStatus !== LISTING_STATUS.DELETED ? (
                        <div className="expert-my-listings-actions-row">
                          {item.normalizedStatus === LISTING_STATUS.ACTIVE ? (
                            <button
                              type="button"
                              className="expert-my-listings-unpublish-btn"
                              onClick={() => handleChangeListingStatus(item, LISTING_STATUS.UNPUBLISHED)}
                              disabled={deletingId === item.id}
                            >
                              {deletingId === item.id ? "İşleniyor..." : "Yayından Kaldır"}
                            </button>
                          ) : null}

                          {item.normalizedStatus === LISTING_STATUS.UNPUBLISHED ? (
                            <button
                              type="button"
                              className="expert-my-listings-republish-btn"
                              onClick={() => handleChangeListingStatus(item, LISTING_STATUS.ACTIVE)}
                              disabled={deletingId === item.id}
                            >
                              {deletingId === item.id ? "İşleniyor..." : "Tekrar Yayına Al"}
                            </button>
                          ) : null}

                          <button
                            type="button"
                            className="expert-my-listings-delete-btn"
                            onClick={() => {
                              if (editingItem) setEditingItem(null);
                              setConfirmDeleteItem(item);
                            }}
                            disabled={deletingId === item.id}
                          >
                            {deletingId === item.id ? "Siliniyor..." : "Sil"}
                          </button>
                        </div>
                      ) : (
                        <span className="expert-my-listings-deleted-note">
                          Bu ilan silinmiştir. İşlem yapılamaz.
                        </span>
                      )}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </main>

      {editingItem && (
        <div
          className="expert-my-listings-edit-overlay"
          onClick={() => {
            if (savingEdit) return;
            closeEditModal();
          }}
        >
          <section
            className="expert-my-listings-edit-card"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="expert-my-listings-edit-inner">
              <h2>İlanı Düzenle</h2>
              <p className="expert-my-listings-edit-subtitle">
                {sanitizeText(editingItem.title)}
              </p>

              <p className="expert-my-listings-edit-data-note">
                <i className="fas fa-database" aria-hidden="true"></i>
                Alanlar mevcut ilan verisinden dolduruldu. Turuncu: mevcut değer, Yeşil: değiştirilmiş değer.
              </p>

              {editError && (
                <p
                  className={
                    editError === EDIT_NO_CHANGES_MSG
                      ? "expert-my-listings-edit-info"
                      : "expert-my-listings-edit-error"
                  }
                  role="alert"
                >
                  {sanitizeText(editError)}
                </p>
              )}

              <form onSubmit={handleEditSubmit}>
                <div className="expert-my-listings-edit-image">
                  <div className="expert-my-listings-edit-image-header">
                    <span>Kapak Fotoğrafı</span>

                    <div className="expert-my-listings-edit-image-actions">
                      <button
                        type="button"
                        className={editImageMode === "keep" ? "active" : ""}
                        onClick={() => {
                          setEditImageMode("keep");

                          if (editImagePreview && editImagePreview.startsWith("blob:")) {
                            URL.revokeObjectURL(editImagePreview);
                          }

                          setEditImageFile(null);
                          setEditImagePreview("");
                        }}
                        disabled={savingEdit}
                      >
                        Mevcut
                      </button>

                      <button
                        type="button"
                        className={editImageMode === "replace" ? "active" : ""}
                        onClick={() => setEditImageMode("replace")}
                        disabled={savingEdit}
                      >
                        Değiştir
                      </button>

                      <button
                        type="button"
                        className={editImageMode === "remove" ? "active danger" : "danger"}
                        onClick={() => {
                          setEditImageMode("remove");

                          if (editImagePreview && editImagePreview.startsWith("blob:")) {
                            URL.revokeObjectURL(editImagePreview);
                          }

                          setEditImageFile(null);
                          setEditImagePreview("");
                        }}
                        disabled={savingEdit}
                      >
                        Kaldır
                      </button>
                    </div>
                  </div>

                  {editImageMode === "replace" ? (
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={(e) => {
                        const file = e.target.files?.[0] || null;

                        if (file && file.size > 5 * 1024 * 1024) {
                          setEditError("Kapak fotoğrafı 5MB'dan büyük olamaz.");
                          e.target.value = "";
                          return;
                        }

                        setEditImageFile(file);

                        if (editImagePreview && editImagePreview.startsWith("blob:")) {
                          URL.revokeObjectURL(editImagePreview);
                        }

                        setEditImagePreview(file ? URL.createObjectURL(file) : "");
                      }}
                      disabled={savingEdit}
                    />
                  ) : null}

                  <div className="expert-my-listings-edit-image-preview">
                    {getDisplayedImagePreview() ? (
                      <img
                        src={getDisplayedImagePreview()}
                        alt="Kapak"
                        style={getListingImageStyle({ imageCrop: editingItem?.imageCrop })}
                        onError={(event) => {
                          event.currentTarget.onerror = null;
                          event.currentTarget.src = "/default-listing.svg";
                        }}
                      />
                    ) : (
                      <div className="expert-my-listings-edit-image-empty">
                        <i className="fas fa-image"></i>
                        <span>Kapak fotoğrafı yok</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="expert-my-listings-edit-grid">
                  <label>
                    Başlık
                    <input
                      type="text"
                      className={isFieldChanged("title") ? "field-changed" : ""}
                      value={editForm.title}
                      onChange={(e) =>
                        setEditForm((prev) => ({
                          ...prev,
                          title: e.target.value.slice(0, 100),
                        }))
                      }
                      required
                      maxLength="100"
                    />
                  </label>

                  <label>
                    Kategori
                    <select
                      className="field-locked"
                      value={editForm.category}
                      required
                      disabled
                    >
                      <option value="">Kategori seçiniz</option>

                      {categoriesData.map((category) => (
                        <option key={category.id} value={sanitizeText(category.name)}>
                          {sanitizeText(category.name)}
                        </option>
                      ))}

                      {editForm.category &&
                        !categoriesData.some((c) => c.name === editForm.category) && (
                          <option value={sanitizeText(editForm.category)}>
                            {sanitizeText(editForm.category)}
                          </option>
                        )}
                    </select>
                  </label>
                </div>

                <div className="expert-my-listings-edit-grid">
                  <label>
                    Uzmanlık
                    <select
                      className="field-locked"
                      value={editForm.serviceSubcategory}
                      required
                      disabled
                    >
                      <option value="">Uzmanlık seçiniz</option>

                      {providerSpecialties.map((s) => (
                        <option key={s.name} value={s.name}>
                          {sanitizeText(s.name)}
                        </option>
                      ))}

                      {editForm.serviceSubcategory &&
                        !providerSpecialties.some((s) => s.name === editForm.serviceSubcategory) && (
                          <option value={sanitizeText(editForm.serviceSubcategory)}>
                            {sanitizeText(editForm.serviceSubcategory)}
                          </option>
                        )}
                    </select>
                  </label>

                  <label>
                    Ayrıntılar
                    <input
                      type="text"
                      className={isFieldChanged("serviceSubcategoryDetails") ? "field-changed" : ""}
                      value={editForm.serviceSubcategoryDetails}
                      onChange={(e) =>
                        setEditForm((prev) => ({
                          ...prev,
                          serviceSubcategoryDetails: e.target.value.slice(0, 500),
                        }))
                      }
                      placeholder="Örn: Kaç m²? Malzeme dahil mi?"
                      maxLength={500}
                    />
                  </label>
                </div>

                <div className="expert-my-listings-edit-grid">
                  <label>
                    Ücret (TL)
                    <input
                      type="number"
                      min={String(selectedSpecialtyMinPrice || 0)}
                      max="1000000"
                      step="1"
                      className={isFieldChanged("price") ? "field-changed" : ""}
                      value={editForm.price}
                      onChange={(e) => {
                        const raw = e.target.value;
                        if (raw === "") {
                          setEditForm((prev) => ({ ...prev, price: "" }));
                          return;
                        }
                        const sanitized = String(raw).replace(/[^\d]/g, "");
                        setEditForm((prev) => ({ ...prev, price: sanitized }));
                      }}
                      required
                    />
                    {selectedSpecialtyMinPrice > 0 &&
                    editForm.price &&
                    Number(editForm.price) < selectedSpecialtyMinPrice ? (
                      <small className="expert-my-listings-edit-helper expert-my-listings-edit-helper--error">
                        En az {Number(selectedSpecialtyMinPrice).toLocaleString("tr-TR")} TL olmalı (
                        {sanitizeText(String(editForm.serviceSubcategory || "").trim())} başlangıç fiyatı).
                      </small>
                    ) : selectedSpecialtyMinPrice > 0 ? (
                      <small className="expert-my-listings-edit-helper">
                        {sanitizeText(String(editForm.serviceSubcategory || "").trim())} başlangıç fiyatı:{" "}
                        {Number(selectedSpecialtyMinPrice).toLocaleString("tr-TR")} TL
                      </small>
                    ) : (
                      <small className="expert-my-listings-edit-helper expert-my-listings-edit-helper--spacer" aria-hidden="true">
                        &nbsp;
                      </small>
                    )}
                  </label>

                  <label>
                    Hizmet Tipi
                    <select
                      name="pricingType"
                      className={isFieldChanged("pricingType") ? "field-changed" : ""}
                      value={editForm.pricingType}
                      onChange={(e) =>
                        setEditForm((prev) => ({
                          ...prev,
                          pricingType: e.target.value,
                        }))
                      }
                      required
                    >
                      <option value="Proje Bazlı">Proje Bazlı</option>
                      <option value="Saatlik Ücret">Saatlik Ücret</option>
                    </select>
                    <small className="expert-my-listings-edit-helper expert-my-listings-edit-helper--spacer" aria-hidden="true">
                      &nbsp;
                    </small>
                  </label>
                </div>

                <label>
                  Şehir
                  <input
                    type="text"
                    className="field-locked"
                    value={sanitizeText(editingItem.city || "")}
                    readOnly
                    disabled
                  />
                </label>

                <label>
                  Açıklama
                  <textarea
                    rows={5}
                    className={isFieldChanged("description") ? "field-changed" : ""}
                    value={editForm.description}
                    onChange={(e) =>
                      setEditForm((prev) => ({
                        ...prev,
                        description: e.target.value.slice(0, 2000),
                      }))
                    }
                    required
                    maxLength="2000"
                  />

                  <small className="char-counter">{editForm.description.length}/2000</small>
                </label>

                <div className="expert-my-listings-edit-actions">
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => {
                      if (savingEdit) return;
                      closeEditModal();
                    }}
                    disabled={savingEdit}
                  >
                    Vazgeç
                  </button>

                  <button type="submit" className="primary" disabled={savingEdit}>
                    {savingEdit ? "Kaydediliyor..." : "Değişiklikleri Kaydet"}
                  </button>
                </div>
              </form>
            </div>
          </section>
        </div>
      )}

      {confirmDeleteItem ? (
        <div
          className="expert-my-listings-modal-overlay"
          onClick={() => setConfirmDeleteItem(null)}
        >
          <div
            className="expert-my-listings-modal"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <h3>İlan silinenler bölümüne taşınacak.</h3>
            <p>Bu ilan artık yayında görünmeyecek ve işlem yapılamaz hale gelecektir.</p>

            <div className="expert-my-listings-modal-actions">
              <button type="button" onClick={() => setConfirmDeleteItem(null)}>
                Vazgeç
              </button>

              <button
                type="button"
                className="expert-my-listings-delete-btn"
                onClick={() => handleDeleteConfirmed(confirmDeleteItem)}
                disabled={deletingId === confirmDeleteItem.id}
              >
                {deletingId === confirmDeleteItem.id ? "Siliniyor..." : "Sil"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
