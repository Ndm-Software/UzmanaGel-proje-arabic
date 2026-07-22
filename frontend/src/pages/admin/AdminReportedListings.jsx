import React, { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import {
  collection,
  addDoc,
  doc,
  updateDoc,
  serverTimestamp,
  getDoc,
} from "firebase/firestore";
import { db } from "../../firebase/firebaseClient";
import {
  getAdminListingReports,
  markAdminListingReportSeen,
  markAdminListingReportAction,
} from "../../firebase/adminService";
import DOMPurify from "dompurify";
import { useAdminOnly } from "../../hooks/useAuthGuard";
import LoadingSpinner from "../../components/LoadingSpinner";
import "../../styles/admin/AdminListings.css";
import { toArabicServiceLabel } from "../../utils/arabicLabels";

const isDevelopment = process.env.NODE_ENV === "development";

const sanitizeText = (text, maxLength = 200) => {
  if (!text) return "-";
  const sanitized = DOMPurify.sanitize(String(text));
  return sanitized.length > maxLength
    ? sanitized.slice(0, maxLength) + "..."
    : sanitized;
};

const safeNumber = (value, defaultValue = 0) => {
  const num = Number(value);
  return Number.isNaN(num) ? defaultValue : num;
};

const REASON_LABELS = {
  inappropriate_photo: "Uygunsuz görsel",
  inappropriate_name: "Uygunsuz isim",
  other: "Diğer",
};

const formatReasonLabelsList = (row) => {
  const arr = Array.isArray(row.reasons) && row.reasons.length
    ? row.reasons
    : row.reason
      ? [row.reason]
      : [];
  return arr.map((r) => REASON_LABELS[r] || sanitizeText(r, 80));
};

const formatLargeNumber = (num) => {
  const n = safeNumber(num);
  return n.toLocaleString("tr-TR");
};

const formatFullNumber = (num) => {
  const n = safeNumber(num);
  return n.toLocaleString("tr-TR");
};

const formatPrice = (price) => {
  const num = safeNumber(price);
  return num.toLocaleString("tr-TR") + " ₺";
};

const formatDate = (date) => {
  if (!date) return "";
  try {
    const dateObj = date instanceof Date ? date : new Date(date);
    if (Number.isNaN(dateObj.getTime())) return "";
    const diff = Date.now() - dateObj.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    if (days === 0) return "Bugün";
    if (days === 1) return "Dün";
    if (days < 7) return `${days} gün önce`;
    return dateObj.toLocaleDateString("tr-TR");
  } catch {
    return "";
  }
};

const getImageUrl = (imagePath) => {
  if (!imagePath) return null;
  const safePath = String(imagePath).trim();
  if (safePath.startsWith("https://") || safePath.startsWith("http://")) {
    return safePath;
  }
  return null;
};

const getStatusBadge = (status) => {
  switch (status) {
    case "ACTIVE":
      return (
        <span className="status-badge active">
          <i className="fas fa-check-circle"></i> Aktif
        </span>
      );
    case "UNPUBLISHED":
      return (
        <span className="status-badge unpublished">
          <i className="fas fa-eye-slash"></i> Yayında Değil
        </span>
      );
    case "DELETED":
      return (
        <span className="status-badge deleted">
          <i className="fas fa-trash-alt"></i> Silinmiş
        </span>
      );
    default:
      return <span className="status-badge">-</span>;
  }
};

let actionAttempts = 0;
let actionLastAttemptTime = 0;

const isActionRateLimited = () => {
  const now = Date.now();
  if (now - actionLastAttemptTime > 60000) {
    actionAttempts = 0;
    actionLastAttemptTime = now;
    return false;
  }
  if (actionAttempts >= 20) return true;
  return false;
};

const recordActionAttempt = () => {
  const now = Date.now();
  if (now - actionLastAttemptTime > 60000) {
    actionAttempts = 1;
  } else {
    actionAttempts += 1;
  }
  actionLastAttemptTime = now;
};

/** API cevabında providerId eksikse Firestore'dan tamamla */
async function fetchServiceProviderId(serviceId) {
  const id = String(serviceId || "").trim();
  if (!id) return null;
  try {
    const snap = await getDoc(doc(db, "services", id));
    if (!snap.exists()) return null;
    const raw = snap.data()?.providerId;
    const pid = raw != null ? String(raw).trim() : "";
    return pid || null;
  } catch (e) {
    if (isDevelopment) console.error("services providerId okunamadı:", e);
    return null;
  }
}

const listingForModal = (listing, listingIdFromReport) => {
  if (!listing) return null;
  const id = String(listing.id || listingIdFromReport || "").trim();
  return { ...listing, id };
};

export default function AdminReportedListings({ onSidebarCountsRefresh }) {
  const { authorized, loading: authLoading } = useAdminOnly();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);

  const [showModal, setShowModal] = useState(false);
  const [selectedListing, setSelectedListing] = useState(null);
  const [selectedReportId, setSelectedReportId] = useState(null);
  const [modalAction, setModalAction] = useState(null);
  const [reasonText, setReasonText] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(6);

  const [sortOrder, setSortOrder] = useState("newest");
  const [viewFilter, setViewFilter] = useState("all");
  const [actionFilter, setActionFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");

  const loadReports = async () => {
    try {
      setLoading(true);
      setError(null);

      const payload = await getAdminListingReports();
      const raw = Array.isArray(payload?.reports) ? payload.reports : [];

      const merged = raw.map((r) => ({
        id: r.id,
        listingId: r.listingId || "",
        reasons: Array.isArray(r.reasons) && r.reasons.length
          ? r.reasons
          : r.reason
            ? [r.reason]
            : [],
        reason: r.reason || "",
        description: r.description || "",
        reporterId: r.reporterId || null,
        reporterEmail: r.reporterEmail || null,
        reporterDisplayName: r.reporterDisplayName || null,
        createdAt: r.createdAt ? new Date(r.createdAt) : new Date(0),
        adminSeen: r.adminSeen === true,
        adminSeenAt: r.adminSeenAt ? new Date(r.adminSeenAt) : null,
        adminActionAt: r.adminActionAt ? new Date(r.adminActionAt) : null,
        listing: r.listing
          ? {
            ...r.listing,
            createdAt: r.listing.createdAt ? new Date(r.listing.createdAt) : null,
          }
          : null,
      }));

      setRows(merged);
      onSidebarCountsRefresh?.();
    } catch (err) {
      if (isDevelopment) console.error("Bildirimler yüklenirken hata:", err);
      setError(err.message || "Bildirimler yüklenirken bir hata oluştu");
    } finally {
      setLoading(false);
    }
  };

  const openModal = (listing, action, reportId = null) => {
    setError(null);
    setSelectedListing(listing);
    setModalAction(action);
    setSelectedReportId(reportId || null);
    setReasonText("");
    setShowModal(true);
  };

  const closeModal = (clearError = true) => {
    setShowModal(false);
    setSelectedListing(null);
    setSelectedReportId(null);
    setModalAction(null);
    setReasonText("");
    if (clearError) setError(null);
  };

  const handleCardHeaderActivate = (row) => {
    const id = row.id;
    const closing = expandedId === id;
    setExpandedId(closing ? null : id);
    if (!closing && row.adminSeen !== true) {
      void markAdminListingReportSeen(id)
        .then(() => {
          setRows((prev) =>
            prev.map((r) => (r.id === id ? { ...r, adminSeen: true, adminSeenAt: new Date() } : r))
          );
          onSidebarCountsRefresh?.();
        })
        .catch((err) => {
          if (isDevelopment) console.error("mark-seen:", err);
        });
    }
  };

  const resetReportFilters = () => {
    setSearchTerm("");
    setViewFilter("all");
    setActionFilter("all");
    setSortOrder("newest");
    setCurrentPage(1);
    setExpandedId(null);
  };

  const handleHide = async () => {
    if (isActionRateLimited()) {
      setError("عمليات كثيرة جداً. يرجى الانتظار دقيقة واحدة.");
      return;
    }
    const serviceId = String(selectedListing?.id || "").trim();
    if (!serviceId) {
      setError("تعذر العثور على معرف الإعلان.");
      closeModal(false);
      return;
    }
    let providerId = selectedListing?.providerId
      ? String(selectedListing.providerId).trim()
      : "";
    if (!providerId) {
      providerId = (await fetchServiceProviderId(serviceId)) || "";
    }
    if (!providerId) {
      setError("تعذر العثور على معلومات الخبير لإلغاء النشر.");
      closeModal(false);
      return;
    }
    if (!reasonText.trim()) {
      setError("يرجى تحديد سبب إلغاء النشر.");
      recordActionAttempt();
      return;
    }
    if (reasonText.trim().length < 3) {
      setError("يجب أن يكون السبب 3 أحرف على الأقل.");
      recordActionAttempt();
      return;
    }

    setIsProcessing(true);
    try {
      await updateDoc(doc(db, "services", serviceId), {
        status: "UNPUBLISHED",
        hiddenAt: new Date().toISOString(),
        hiddenReason: sanitizeText(reasonText, 500),
        updatedAt: serverTimestamp(),
      });

      await addDoc(collection(db, "notifications"), {
        userId: providerId,
        title: " تم إلغاء نشر إعلانك",
        message: `تم إلغاء نشر إعلانك المسمى "${sanitizeText(selectedListing.title, 100)}" من قبل المسؤول.\n\nالسبب: ${sanitizeText(reasonText, 200)}\n\nيمكنك تعديل إعلانك ونشره مرة أخرى.`,
        type: "listing_hidden",
        read: false,
        listingId: serviceId,
        listingTitle: sanitizeText(selectedListing.title, 100),
        newStatus: "UNPUBLISHED",
        reason: sanitizeText(reasonText, 200),
        canRepublish: true,
        createdAt: serverTimestamp(),
      });

      const reportIdForMark = selectedReportId;
      actionAttempts = 0;
      if (reportIdForMark) {
        try {
          await markAdminListingReportAction(reportIdForMark);
        } catch (e) {
          if (isDevelopment) console.error(e);
        }
      }
      await loadReports();
      onSidebarCountsRefresh?.();
      closeModal();
    } catch (err) {
      if (isDevelopment) console.error("Yayından kaldırma hatası:", err);
      setError("حدث خطأ أثناء إلغاء نشر الإعلان.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDelete = async () => {
    if (isActionRateLimited()) {
      setError("عمليات كثيرة جداً. يرجى الانتظار دقيقة واحدة.");
      return;
    }
    const serviceId = String(selectedListing?.id || "").trim();
    if (!serviceId) {
      setError("تعذر العثور على معرف الإعلان.");
      closeModal(false);
      return;
    }
    let providerId = selectedListing?.providerId
      ? String(selectedListing.providerId).trim()
      : "";
    if (!providerId) {
      providerId = (await fetchServiceProviderId(serviceId)) || "";
    }
    if (!providerId) {
      setError("تعذر العثور على معلومات الخبير لعملية الحذف.");
      closeModal(false);
      return;
    }
    if (!reasonText.trim()) {
      setError("يرجى تحديد سبب الحذف.");
      recordActionAttempt();
      return;
    }
    if (reasonText.trim().length < 3) {
      setError("يجب أن يكون السبب 3 أحرف على الأقل.");
      recordActionAttempt();
      return;
    }

    setIsProcessing(true);
    try {
      await updateDoc(doc(db, "services", serviceId), {
        status: "DELETED",
        deletedAt: new Date().toISOString(),
        deletedReason: sanitizeText(reasonText, 500),
        updatedAt: serverTimestamp(),
      });

      await addDoc(collection(db, "notifications"), {
        userId: providerId,
        title: "تم حذف إعلانك نهائياً",
        message: `تم حذف إعلانك المسمى "${sanitizeText(selectedListing.title, 100)}" نهائياً من قبل المسؤول.\n\nالسبب: ${sanitizeText(reasonText, 200)}\n\nلا يمكن التراجع عن هذا الإجراء.`,
        type: "listing_deleted",
        read: false,
        listingId: serviceId,
        listingTitle: sanitizeText(selectedListing.title, 100),
        newStatus: "DELETED",
        reason: sanitizeText(reasonText, 200),
        permanent: true,
        createdAt: serverTimestamp(),
      });

      const reportIdForMark = selectedReportId;
      actionAttempts = 0;
      if (reportIdForMark) {
        try {
          await markAdminListingReportAction(reportIdForMark);
        } catch (e) {
          if (isDevelopment) console.error(e);
        }
      }
      await loadReports();
      onSidebarCountsRefresh?.();
      closeModal();
    } catch (err) {
      if (isDevelopment) console.error("Silme hatası:", err);
      setError("حدث خطأ أثناء حذف الإعلان.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRestore = async () => {
    if (isActionRateLimited()) {
      setError("عمليات كثيرة جداً. يرجى الانتظار دقيقة واحدة.");
      return;
    }
    const serviceId = String(selectedListing?.id || "").trim();
    if (!serviceId) {
      setError("تعذر العثور على معرف الإعلان.");
      closeModal(false);
      return;
    }
    let providerId = selectedListing?.providerId
      ? String(selectedListing.providerId).trim()
      : "";
    if (!providerId) {
      providerId = (await fetchServiceProviderId(serviceId)) || "";
    }
    if (!providerId) {
      setError("تعذر العثور على معلومات الخبير لإعادة النشر.");
      closeModal(false);
      return;
    }

    setIsProcessing(true);
    try {
      await updateDoc(doc(db, "services", serviceId), {
        status: "ACTIVE",
        hiddenAt: null,
        hiddenReason: null,
        updatedAt: serverTimestamp(),
      });

      await addDoc(collection(db, "notifications"), {
        userId: providerId,
        title: "✅ تم إعادة نشر إعلانك",
        message: `تم إعادة نشر إعلانك المسمى "${sanitizeText(selectedListing.title, 100)}" من قبل المسؤول. إعلانك الآن نشط ومرئي للجميع.`,
        type: "listing_restored",
        read: false,
        listingId: serviceId,
        listingTitle: sanitizeText(selectedListing.title, 100),
        newStatus: "ACTIVE",
        createdAt: serverTimestamp(),
      });

      const reportIdForMark = selectedReportId;
      actionAttempts = 0;
      if (reportIdForMark) {
        try {
          await markAdminListingReportAction(reportIdForMark);
        } catch (e) {
          if (isDevelopment) console.error(e);
        }
      }
      await loadReports();
      onSidebarCountsRefresh?.();
      closeModal();
    } catch (err) {
      if (isDevelopment) console.error("Geri alma hatası:", err);
      setError("حدث خطأ أثناء استعادة الإعلان.");
    } finally {
      setIsProcessing(false);
    }
  };

  useEffect(() => {
    if (authorized) {
      loadReports();
    }
  }, [authorized]);

  const filteredRows = useMemo(() => {
    let list = [...rows];
    const q = String(searchTerm || "")
      .trim()
      .toLowerCase()
      .replace(/[<>]/g, "");
    if (q) {
      list = list.filter((r) => {
        const L = r.listing;
        const blob = [
          r.listingId,
          L?.title,
          L?.providerName,
          L?.category,
          L?.city,
          r.description,
          r.reporterEmail,
          r.reporterDisplayName,
          ...(Array.isArray(r.reasons) ? r.reasons : []),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return blob.includes(q);
      });
    }
    if (viewFilter === "unseen") list = list.filter((r) => !r.adminSeen);
    else if (viewFilter === "seen") list = list.filter((r) => r.adminSeen);
    if (actionFilter === "none") list = list.filter((r) => !r.adminActionAt);
    else if (actionFilter === "done") list = list.filter((r) => !!r.adminActionAt);
    list.sort((a, b) => {
      const ta = a.createdAt instanceof Date ? a.createdAt.getTime() : 0;
      const tb = b.createdAt instanceof Date ? b.createdAt.getTime() : 0;
      return sortOrder === "newest" ? tb - ta : ta - tb;
    });
    return list;
  }, [rows, searchTerm, viewFilter, actionFilter, sortOrder]);

  useEffect(() => {
    setCurrentPage(1);
  }, [viewFilter, actionFilter, sortOrder, searchTerm]);

  const totalPages = Math.ceil(filteredRows.length / itemsPerPage) || 1;

  useEffect(() => {
    setCurrentPage((p) => Math.min(p, totalPages));
  }, [totalPages]);

  const paginated = filteredRows.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  useEffect(() => {
    if (!imagePreview) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e) => {
      if (e.key === "Escape") setImagePreview(null);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [imagePreview]);

  if (authLoading) {
    return <LoadingSpinner text="Yetki kontrol ediliyor..." />;
  }

  if (!authorized) {
    return (
      <div className="no-data">
        <i className="fas fa-shield-alt fa-3x"></i>
        <p>Bu sayfaya erişim yetkiniz yok. Sadece adminler erişebilir.</p>
      </div>
    );
  }

  if (loading) {
    return <LoadingSpinner text="Bildirilen ilanlar yükleniyor..." />;
  }

  if (error && !showModal) {
    return (
      <div className="error-state">
        <i className="fas fa-exclamation-triangle"></i>
        <p>{sanitizeText(error, 200)}</p>
        <button type="button" className="retry-btn" onClick={loadReports}>
          Tekrar Dene
        </button>
      </div>
    );
  }

  const unseenCount = rows.reduce((n, r) => n + (r.adminSeen ? 0 : 1), 0);
  const actionDoneCount = rows.reduce((n, r) => n + (r.adminActionAt ? 1 : 0), 0);

  return (
    <>
      <div className="admin-listings">
        <div className="filter-bar">
          <div className="search-wrapper">
            <input
              type="text"
              placeholder="İlan veya uzman adı ile ara..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value.replace(/[<>]/g, "").slice(0, 100))}
              onKeyPress={(e) => e.key === "Enter" && setCurrentPage(1)}
              maxLength={100}
            />
            <button
              type="button"
              className="search-btn"
              onClick={() => setCurrentPage(1)}
            >
              🔍 Ara
            </button>
          </div>
          <div className="filter-group">
            <select
              value={viewFilter}
              onChange={(e) => setViewFilter(e.target.value)}
              aria-label="Görülme filtresi"
            >
              <option value="all">📋 Tüm bildirimler</option>
              <option value="unseen">👁️ Görülmemiş</option>
              <option value="seen">✅ Görüldü</option>
            </select>
            <select
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              aria-label="İşlem filtresi"
            >
              <option value="all">⚙️ Tüm işlemler</option>
              <option value="none">⏳ İşlem yok</option>
              <option value="done">✔️ İşlem yapıldı</option>
            </select>
            <div className="sort-buttons">
              <button
                type="button"
                className={sortOrder === "newest" ? "active" : ""}
                onClick={() => setSortOrder("newest")}
              >
                🕒 En Yeni
              </button>
              <button
                type="button"
                className={sortOrder === "oldest" ? "active" : ""}
                onClick={() => setSortOrder("oldest")}
              >
                📅 En Eski
              </button>
            </div>
            <button type="button" className="reset-btn" onClick={resetReportFilters}>
              Sıfırla
            </button>
          </div>
        </div>

        <div className="stats-info stats-info--reported-listings">
          <div
            className="stat-item"
            title={`Filtre ve arama sonrası: ${formatFullNumber(filteredRows.length)} kayıt`}
          >
            <i className="fas fa-filter" aria-hidden="true" />
            <span>Filtreli: {formatLargeNumber(filteredRows.length)}</span>
          </div>
          <div
            className="stat-item"
            title={`Kenar çubuğu rozeti: ${formatFullNumber(unseenCount)} görülmemiş`}
          >
            <i className="fas fa-eye-slash" aria-hidden="true" />
            <span>Görülmemiş: {formatLargeNumber(unseenCount)}</span>
          </div>
          <div
            className="stat-item"
            title={`İşlem yapılmış bildirim: ${formatFullNumber(actionDoneCount)}`}
          >
            <i className="fas fa-check-double" aria-hidden="true" />
            <span>İşlem yapılmış: {formatLargeNumber(actionDoneCount)}</span>
          </div>
          <div className="stat-item" title={`Tam değer: ${formatFullNumber(rows.length)} toplam bildirim`}>
            <i className="fas fa-chart-line" aria-hidden="true" />
            <span>Toplam: {formatLargeNumber(rows.length)}</span>
          </div>
        </div>

        <div className="cards-list">
          {paginated.length === 0 ? (
            <div className="no-data">
              <i className="fas fa-box-open" aria-hidden="true" />
              <p>
                {rows.length === 0
                  ? "Henüz bildirim yok."
                  : "Seçili filtrelere uygun bildirim yok. Filtreleri sıfırlayın veya sıralamayı değiştirin."}
              </p>
            </div>
          ) : (
            paginated.map((row) => {
              const listing = row.listing;
              const imageUrl = listing ? getImageUrl(listing.image) : null;
              const title = listing
                ? sanitizeText(listing.title, 100)
                : `İlan ID: ${sanitizeText(row.listingId, 40)}`;
              const providerName = listing
                ? sanitizeText(listing.providerName, 50)
                : "İlan bulunamadı";
              const category = listing ? sanitizeText(toArabicServiceLabel(listing.category), 50) : "-";
              const city = listing ? sanitizeText(listing.city, 50) : "-";
              const description = listing
                ? sanitizeText(listing.description, 300)
                : "-";
              const pricingType = listing ? sanitizeText(listing.pricingType, 30) : "-";
              const serviceSubcategory = listing
                ? sanitizeText(toArabicServiceLabel(listing.serviceSubcategory), 50)
                : "-";
              const rating = listing ? safeNumber(listing.rating) : 0;
              const status = listing?.status || "UNKNOWN";
              const reasonLabels = formatReasonLabelsList(row);

              return (
                <div
                  key={row.id}
                  className={`data-card ${expandedId === row.id ? "expanded" : ""} status-${String(status).toLowerCase()}`}
                >
                  <div
                    className="card-header"
                    onClick={() => handleCardHeaderActivate(row)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        handleCardHeaderActivate(row);
                      }
                    }}
                    role="button"
                    tabIndex={0}
                  >
                    <div className="card-summary">
                      <div className="card-image">
                        {imageUrl ? (
                          <img
                            src={imageUrl}
                            alt=""
                            className="admin-reported-listing-thumb"
                            tabIndex={0}
                            role="button"
                            aria-label="Görseli büyüt"
                            onClick={(e) => {
                              e.stopPropagation();
                              const cap = String(listing?.title || row.listingId || "").trim();
                              setImagePreview({
                                src: imageUrl,
                                caption: cap ? sanitizeText(cap, 200) : "İlan görseli",
                              });
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                e.stopPropagation();
                                const cap = String(listing?.title || row.listingId || "").trim();
                                setImagePreview({
                                  src: imageUrl,
                                  caption: cap ? sanitizeText(cap, 200) : "İlan görseli",
                                });
                              }
                            }}
                            onError={(e) => {
                              e.target.style.display = "none";
                            }}
                            loading="lazy"
                          />
                        ) : (
                          <div className="image-placeholder">
                            <i className="fas fa-image"></i>
                          </div>
                        )}
                      </div>
                      <div className="card-info">
                        <div className="card-title-row">
                          <h3>{title}</h3>
                          {!row.adminSeen && (
                            <span className="status-badge unpublished admin-report-unseen-pill" title="Henüz açılmadı">
                              <i className="fas fa-eye-slash" aria-hidden="true" /> Yeni
                            </span>
                          )}
                          {listing ? getStatusBadge(listing.status) : (
                            <span className="status-badge deleted">
                              <i className="fas fa-question-circle"></i> Kayıt yok
                            </span>
                          )}
                        </div>
                        <div className="card-meta">
                          <span>
                            <i className="fas fa-user"></i> {providerName}
                          </span>
                          <span>
                            <i className="fas fa-tag"></i> {category}
                          </span>
                          <span>
                            <i className="fas fa-map-marker-alt"></i> {city}
                          </span>
                          {listing && (
                            <span className="price">{formatPrice(listing.price)}</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="card-actions">
                      {listing && listing.status === "ACTIVE" && (
                        <>
                          <button
                            type="button"
                            className="hide"
                            onClick={(e) => {
                              e.stopPropagation();
                              openModal(listingForModal(listing, row.listingId), "hide", row.id);
                            }}
                            title="Yayından Kaldır"
                            disabled={isProcessing}
                          >
                            <i className="fas fa-eye-slash" aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            className="delete"
                            onClick={(e) => {
                              e.stopPropagation();
                              openModal(listingForModal(listing, row.listingId), "delete", row.id);
                            }}
                            title="Kalıcı Sil"
                            disabled={isProcessing}
                          >
                            <i className="fas fa-trash-alt" aria-hidden="true" />
                          </button>
                        </>
                      )}
                      {listing && listing.status === "UNPUBLISHED" && (
                        <>
                          <button
                            type="button"
                            className="restore"
                            onClick={(e) => {
                              e.stopPropagation();
                              openModal(listingForModal(listing, row.listingId), "restore", row.id);
                            }}
                            title="Tekrar Yayına Al"
                            disabled={isProcessing}
                          >
                            <i className="fas fa-undo-alt" aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            className="delete"
                            onClick={(e) => {
                              e.stopPropagation();
                              openModal(listingForModal(listing, row.listingId), "delete", row.id);
                            }}
                            title="Kalıcı Sil"
                            disabled={isProcessing}
                          >
                            <i className="fas fa-trash-alt" aria-hidden="true" />
                          </button>
                        </>
                      )}
                      {listing && listing.status === "DELETED" && (
                        <button
                          type="button"
                          className="delete-permanent"
                          onClick={(e) => {
                            e.stopPropagation();
                          }}
                          title="Kalıcı Olarak Silinmiş"
                          disabled
                        >
                          <i className="fas fa-ban" aria-hidden="true" />
                        </button>
                      )}
                      <div className="expand-icon">
                        <i
                          className={`fas fa-chevron-${expandedId === row.id ? "up" : "down"}`}
                        />
                      </div>
                    </div>
                  </div>

                  {expandedId === row.id && (
                    <div className="card-details card-details--reported-expand">
                      <div className="detail-row warning">
                        <div className="detail-label">Bildirilme nedeni</div>
                        <div className="detail-value">
                          {reasonLabels.length ? (
                            <ul className="admin-listing-report-reasons">
                              {reasonLabels.map((text, i) => (
                                <li key={`${row.id}-r-${i}`}>{text}</li>
                              ))}
                            </ul>
                          ) : (
                            "Belirtilmemiş"
                          )}
                        </div>
                      </div>
                      <div className="detail-row warning">
                        <div className="detail-label">Bildiren açıklaması</div>
                        <div className="detail-value">
                          {row.description?.trim()
                            ? sanitizeText(row.description, 2000)
                            : "Açıklama girilmemiş."}
                        </div>
                      </div>

                      <div className="reported-detail-meta-grid">
                        <div className="detail-row">
                          <div className="detail-label">Bildirim tarihi</div>
                          <div className="detail-value">{formatDate(row.createdAt)}</div>
                        </div>
                        <div className="detail-row">
                          <div className="detail-label">İlan ID</div>
                          <div className="detail-value">{sanitizeText(row.listingId, 120)}</div>
                        </div>

                        {(row.reporterId || row.reporterEmail || row.reporterDisplayName) && (
                          <>
                            <div className="detail-row">
                              <div className="detail-label">Bildiren (ad)</div>
                              <div className="detail-value">
                                {row.reporterDisplayName
                                  ? sanitizeText(row.reporterDisplayName, 120)
                                  : "—"}
                              </div>
                            </div>
                            <div className="detail-row">
                              <div className="detail-label">Bildiren (e-posta)</div>
                              <div className="detail-value">
                                {row.reporterEmail ? sanitizeText(row.reporterEmail, 120) : "—"}
                              </div>
                            </div>
                            <div className="detail-row reported-detail-span-2">
                              <div className="detail-label">Bildiren (kullanıcı ID)</div>
                              <div className="detail-value">
                                {row.reporterId ? sanitizeText(row.reporterId, 120) : "—"}
                              </div>
                            </div>
                          </>
                        )}

                        {listing ? (
                          <>
                            <div className="detail-row reported-detail-span-2">
                              <div className="detail-label">İlan açıklaması</div>
                              <div className="detail-value">{description}</div>
                            </div>
                            <div className="detail-row">
                              <div className="detail-label">Fiyat tipi</div>
                              <div className="detail-value">{pricingType}</div>
                            </div>
                            <div className="detail-row">
                              <div className="detail-label">Alt kategori</div>
                              <div className="detail-value">{serviceSubcategory}</div>
                            </div>
                            <div className="detail-row">
                              <div className="detail-label">Puan</div>
                              <div className="detail-value">{rating} / 5</div>
                            </div>
                            <div className="detail-row">
                              <div className="detail-label">İlan oluşturulma</div>
                              <div className="detail-value">{formatDate(listing.createdAt)}</div>
                            </div>
                            {listing.status === "UNPUBLISHED" && listing.hiddenReason && (
                              <div className="detail-row warning reported-detail-span-2">
                                <div className="detail-label">Yayından kaldırılma sebebi</div>
                                <div className="detail-value">
                                  {sanitizeText(listing.hiddenReason, 200)}
                                </div>
                              </div>
                            )}
                            {listing.status === "DELETED" && listing.deletedReason && (
                              <div className="detail-row error reported-detail-span-2">
                                <div className="detail-label">Silinme sebebi</div>
                                <div className="detail-value">
                                  {sanitizeText(listing.deletedReason, 200)}
                                </div>
                              </div>
                            )}
                          </>
                        ) : (
                          <div className="detail-row error reported-detail-span-2">
                            <div className="detail-label">İlan</div>
                            <div className="detail-value">
                              Bu ID ile eşleşen ilan bulunamadı (silinmiş veya taşınmış olabilir).
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {totalPages > 1 && (
          <div className="pagination">
            <button
              type="button"
              onClick={() => setCurrentPage(1)}
              disabled={currentPage === 1 || isProcessing}
            >
              «
            </button>
            <button
              type="button"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1 || isProcessing}
            >
              ‹
            </button>
            <span>
              Sayfa {currentPage} / {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages || isProcessing}
            >
              ›
            </button>
            <button
              type="button"
              onClick={() => setCurrentPage(totalPages)}
              disabled={currentPage === totalPages || isProcessing}
            >
              »
            </button>
          </div>
        )}
      </div>

      {showModal &&
        selectedListing &&
        createPortal(
          <div
            className="modal-overlay modal-overlay-root-portal"
            onClick={() => closeModal(true)}
            role="presentation"
          >
            <div
              className="confirm-modal"
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
            >
              <div className="confirm-icon">
                {modalAction === "hide" && "👁️"}
                {modalAction === "delete" && "🗑️"}
                {modalAction === "restore" && "✅"}
              </div>
              <h3>
                {modalAction === "hide" && "İlanı Yayından Kaldır"}
                {modalAction === "delete" && "İlanı Kalıcı Sil"}
                {modalAction === "restore" && "İlanı Tekrar Yayına Al"}
              </h3>
              <p>
                {modalAction === "hide" &&
                  `"${sanitizeText(selectedListing.title, 100)}" ilanını yayından kaldırmak istediğinize emin misiniz?`}
                {modalAction === "delete" &&
                  `"${sanitizeText(selectedListing.title, 100)}" ilanını kalıcı olarak silmek istediğinize emin misiniz? Bu işlem geri alınamaz!`}
                {modalAction === "restore" &&
                  `"${sanitizeText(selectedListing.title, 100)}" ilanını tekrar yayına almak istediğinize emin misiniz?`}
              </p>
              {error ? (
                <p className="confirm-modal-inline-error" role="alert">
                  {DOMPurify.sanitize(String(error)).slice(0, 500)}
                </p>
              ) : null}
              {(modalAction === "hide" || modalAction === "delete") && (
                <div className="reason-input-group">
                  <label htmlFor="reason-reported-listing">
                    İşlem Sebebi <span className="required">*</span>
                  </label>
                  <textarea
                    id="reason-reported-listing"
                    value={reasonText}
                    onChange={(e) => {
                      setReasonText(e.target.value.slice(0, 500));
                      if (error) setError(null);
                    }}
                    placeholder={
                      modalAction === "hide"
                        ? "Yayından kaldırma sebebini belirtin (örn: uygunsuz içerik, eksik bilgi, vb.)"
                        : "Silme sebebini belirtin (örn: kullanıcı şikayeti, sahte içerik, vb.)"
                    }
                    rows={4}
                    maxLength={500}
                    autoFocus
                  />
                  <small>{reasonText.length}/500 karakter</small>
                </div>
              )}
              <div className="confirm-buttons">
                <button
                  type="button"
                  className="cancel"
                  onClick={() => closeModal(true)}
                  disabled={isProcessing}
                >
                  İptal
                </button>
                <button
                  type="button"
                  className={`confirm ${modalAction}`}
                  onClick={
                    modalAction === "hide"
                      ? handleHide
                      : modalAction === "delete"
                        ? handleDelete
                        : handleRestore
                  }
                  disabled={
                    isProcessing ||
                    ((modalAction === "hide" || modalAction === "delete") && !reasonText.trim())
                  }
                >
                  {isProcessing ? (
                    <>
                      <i className="fas fa-spinner fa-spin" aria-hidden="true" /> İşleniyor...
                    </>
                  ) : modalAction === "hide" ? (
                    "Evet, Yayından Kaldır"
                  ) : modalAction === "delete" ? (
                    "Evet, Kalıcı Sil"
                  ) : (
                    "Evet, Yayına Al"
                  )}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {imagePreview &&
        createPortal(
          <div
            className="admin-image-lightbox-overlay"
            onClick={() => setImagePreview(null)}
            role="presentation"
          >
            <div
              className="admin-image-lightbox-dialog"
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-label="Büyük görsel"
            >
              <button
                type="button"
                className="admin-image-lightbox-close"
                onClick={() => setImagePreview(null)}
                aria-label="Kapat"
              >
                <i className="fas fa-times" aria-hidden="true" />
              </button>
              {imagePreview.caption ? (
                <p className="admin-image-lightbox-caption">{imagePreview.caption}</p>
              ) : null}
              <img src={imagePreview.src} alt="" className="admin-image-lightbox-img" />
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
