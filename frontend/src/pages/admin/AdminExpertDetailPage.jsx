// AdminExpertDetail.jsx file code

import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import Navbar from "../../components/Navbar";
import LoadingSpinner from "../../components/LoadingSpinner";
import { getExpertDetails } from "../../firebase/adminService";
import DOMPurify from "dompurify";
import { useAdminOnly } from "../../hooks/useAuthGuard";
import "../../styles/admin/AdminExpertDetailPage.css";
import { deleteExpertByAdmin } from "../../services/adminExpertService";

function toDate(value) {
  if (!value) return null;

  try {
    if (value?._seconds !== undefined) {
      return new Date(value._seconds * 1000);
    }

    if (value?.seconds !== undefined) {
      return new Date(value.seconds * 1000);
    }

    if (typeof value?.toDate === "function") {
      return value.toDate();
    }

    if (typeof value === "number") {
      return new Date(value);
    }

    if (typeof value === "string") {
      const parsed = new Date(value);
      if (!isNaN(parsed.getTime())) {
        return parsed;
      }
    }

    if (value instanceof Date && !isNaN(value.getTime())) {
      return value;
    }
  } catch {
    return null;
  }

  return null;
}

function formatDateTime(value) {
  const date = toDate(value);
  if (!date) return "-";

  try {
    return date.toLocaleString("tr-TR");
  } catch {
    return "-";
  }
}

function sanitizeText(text, maxLength = 200) {
  if (!text) return "-";

  const sanitized = DOMPurify.sanitize(String(text));

  return sanitized.length > maxLength
    ? sanitized.slice(0, maxLength) + "..."
    : sanitized;
}

function encodeForUrl(str) {
  if (!str) return "";
  return encodeURIComponent(String(str));
}

function safeNumber(value, defaultValue = 0) {
  const num = Number(value);
  return isNaN(num) ? defaultValue : num;
}

const getStatusBadge = (status, isActive = null) => {
  if (isActive !== null) {
    return isActive ? (
      <span className="status-badge approved">✅ Onaylı</span>
    ) : (
      <span className="status-badge pending">⏳ Beklemede</span>
    );
  }

  switch (status) {
    case "approved":
      return <span className="status-badge approved">✅ Onaylandı</span>;
    case "completed":
      return <span className="status-badge completed">✔️ Tamamlandı</span>;
    case "rejected":
      return <span className="status-badge rejected">❌ Reddedildi</span>;
    case "pending":
      return <span className="status-badge pending">⏳ Bekliyor</span>;
    case "cancelled":
      return <span className="status-badge cancelled">❌ İptal</span>;
    default:
      return (
        <span className="status-badge">
          {sanitizeText(status || "-", 20)}
        </span>
      );
  }
};

export default function AdminExpertDetailPage() {
  const { expertId } = useParams();
  const navigate = useNavigate();
  const { authorized, loading: authLoading } = useAdminOnly();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [payload, setPayload] = useState(null);
  const [selectedJobStatus, setSelectedJobStatus] = useState("all");
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  useEffect(() => {
    let cancelled = false;

    if (!authorized || authLoading) return;

    if (!expertId) {
      setError("Geçersiz uzman ID");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");

    getExpertDetails(expertId)
      .then((data) => {
        if (!cancelled) {
          setPayload(data || null);
          setSelectedJobStatus("all");
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(
            "Uzman detayı yüklenemedi. Lütfen daha sonra tekrar deneyin."
          );
          console.error("Uzman detay hatası:", err?.message);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [expertId, authorized, authLoading]);

  const expert = payload?.expert || null;
  const authMetadata = payload?.authMetadata || null;

  const handleDeleteExpert = async () => {
    setIsDeleting(true);
    setDeleteError("");

    try {
      await deleteExpertByAdmin(expertId);

      setShowDeleteModal(false);

      navigate("/admin", {
        state: {
          successMessage: `${sanitizeText(
            expert?.displayName || "Uzman"
          )} başarıyla silindi.`,
        },
      });
    } catch (err) {
      console.error("Silme hatası:", err);
      setDeleteError(
        err?.message || "Bir hata oluştu. Lütfen tekrar deneyin."
      );
    } finally {
      setIsDeleting(false);
    }
  };

  const appointments = useMemo(() => {
    if (Array.isArray(payload?.appointments)) return payload.appointments;
    if (Array.isArray(payload?.recentAppointments)) {
      return payload.recentAppointments;
    }
    return [];
  }, [payload]);

  const appointmentStats = useMemo(() => {
    return appointments.reduce(
      (acc, item) => {
        acc.total += 1;
        const key = item?.status || "unknown";
        acc.byStatus[key] = (acc.byStatus[key] || 0) + 1;
        return acc;
      },
      { total: 0, byStatus: {} }
    );
  }, [appointments]);

  const listings = useMemo(() => {
    const items = Array.isArray(payload?.listings) ? payload.listings : [];

    return [...items].sort((a, b) => {
      const aTime = toDate(a.createdAt)?.getTime() || 0;
      const bTime = toDate(b.createdAt)?.getTime() || 0;
      return bTime - aTime;
    });
  }, [payload]);

  const visibleAppointments = useMemo(() => {
    if (selectedJobStatus === "all") return appointments;

    return appointments.filter(
      (a) => String(a.status || "") === selectedJobStatus
    );
  }, [appointments, selectedJobStatus]);

  const statusOptions = useMemo(() => {
    const options = [
      {
        key: "all",
        label: "Tümü",
        count: appointments.length,
      },
    ];

    Object.entries(appointmentStats.byStatus).forEach(([key, count]) => {
      options.push({
        key,
        label: sanitizeText(key, 30),
        count,
      });
    });

    return options;
  }, [appointmentStats, appointments.length]);

  if (authLoading) {
    return (
      <div className="admin-expert-detail-page">
        <Navbar />
        <LoadingSpinner text="Yetki kontrol ediliyor..." />
      </div>
    );
  }

  if (!authorized) {
    return (
      <div className="admin-expert-detail-page">
        <Navbar />

        <div className="admin-expert-detail-shell">
          <div className="admin-expert-detail-top">
            <button className="aed-back" onClick={() => navigate("/admin")}>
              ← Admin Paneli
            </button>
          </div>

          <div className="aed-error">
            Bu sayfaya erişim yetkiniz yok. Sadece adminler erişebilir.
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="admin-expert-detail-page">
        <Navbar />
        <LoadingSpinner text="Uzman detayları yükleniyor..." />
      </div>
    );
  }

  if (error || !expert) {
    return (
      <div className="admin-expert-detail-page">
        <Navbar />

        <div className="admin-expert-detail-shell">
          <div className="admin-expert-detail-top">
            <button className="aed-back" onClick={() => navigate("/admin")}>
              ← Admin Paneli
            </button>
          </div>

          <div className="aed-error">
            {sanitizeText(error || "Uzman bulunamadı.", 200)}
          </div>
        </div>
      </div>
    );
  }

  const minPrice = safeNumber(expert.minPrice);
  const maxPrice = safeNumber(expert.maxPrice);
  const experienceYears = safeNumber(expert.experienceYears);
  const lat = safeNumber(expert.lat);
  const lng = safeNumber(expert.lng);
  const hasLocation = lat !== 0 && lng !== 0;

  return (
    <div className="admin-expert-detail-page">
      <Navbar />

      <div className="admin-expert-detail-shell">
        <div className="admin-expert-detail-top">
          <div className="aed-top-left">
            <button className="aed-back" onClick={() => navigate("/admin")}>
              ← Admin Paneli
            </button>

            <div className="aed-title">
              <div className="aed-avatar">
                {sanitizeText(
                  String(expert.displayName || expert.email || "?")
                    .charAt(0)
                    .toUpperCase(),
                  1
                )}
              </div>

              <div className="aed-title-text">
                <h1>{sanitizeText(expert.displayName || "Uzman", 100)}</h1>
                <p>
                  {sanitizeText(
                    expert.businessName || expert.companyName || expert.email,
                    100
                  )}
                </p>
              </div>
            </div>
          </div>

          <button
            className="aed-delete-button"
            onClick={() => {
              setDeleteError("");
              setShowDeleteModal(true);
            }}
          >
            🗑️ Uzmanı Sil
          </button>
        </div>

        <div className="aed-stats-row">
          <div className="stat-card">
            <div className="stat-icon">📋</div>
            <div className="stat-info">
              <span className="stat-value">{listings.length}</span>
              <span className="stat-label">Toplam İlan</span>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon">📅</div>
            <div className="stat-info">
              <span className="stat-value">{appointmentStats.total}</span>
              <span className="stat-label">Toplam Randevu</span>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon">⭐</div>
            <div className="stat-info">
              <span className="stat-value">{expert.rating || "Yeni"}</span>
              <span className="stat-label">Puan</span>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon">💰</div>
            <div className="stat-info">
              <span className="stat-value">
                {minPrice}₺ - {maxPrice}₺
              </span>
              <span className="stat-label">Fiyat Aralığı</span>
            </div>
          </div>
        </div>

        <div className="aed-grid">
          <div className="aed-card">
            <div className="aed-card-title">
              <span>👤</span> Kişisel Bilgiler
            </div>

            <div className="aed-kv">
              <div className="aed-info-row">
                <span className="aed-label">E-posta</span>
                <span className="aed-value">
                  {sanitizeText(expert.email, 100)}
                </span>
              </div>

              <div className="aed-info-row">
                <span className="aed-label">Telefon</span>
                <span className="aed-value">
                  {sanitizeText(expert.phoneNumber, 20)}
                </span>
              </div>

              <div className="aed-info-row">
                <span className="aed-label">Konum</span>
                <span className="aed-value">
                  {sanitizeText(expert.city, 50)}
                  {expert.district && `, ${sanitizeText(expert.district, 50)}`}
                  {expert.neighborhood &&
                    `, ${sanitizeText(expert.neighborhood, 50)}`}

                  {hasLocation && (
                    <a
                      href={`https://www.google.com/maps?q=${lat},${lng}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="aed-link"
                    >
                      📍 Haritada gör
                    </a>
                  )}
                </span>
              </div>

              <div className="aed-info-row">
                <span className="aed-label">Kategori</span>
                <span className="aed-value">
                  {Array.isArray(expert.category)
                    ? expert.category
                        .map((c) => sanitizeText(c, 50))
                        .join(", ")
                    : sanitizeText(expert.category, 100)}
                </span>
              </div>

              <div className="aed-info-row">
                <span className="aed-label">Kayıt Tarihi</span>
                <span className="aed-value">
                  {formatDateTime(expert.createdAt)}
                </span>
              </div>

              <div className="aed-info-row">
                <span className="aed-label">Son Giriş</span>
                <span className="aed-value">
                  {formatDateTime(
                    expert.lastLoginAt || authMetadata?.lastSignInTime
                  )}
                </span>
              </div>

              <div className="aed-info-row">
                <span className="aed-label">Durum</span>
                <span className="aed-value">
                  {getStatusBadge(null, expert.isActive)}
                </span>
              </div>
            </div>
          </div>

          <div className="aed-card">
            <div className="aed-card-title">
              <span>⚡</span> Uzmanlık & Deneyim
            </div>

            <div className="aed-kv">
              <div className="aed-info-row">
                <span className="aed-label">Uzmanlıklar</span>
                <span className="aed-value">
                  {Array.isArray(expert.specialties) &&
                  expert.specialties.length
                    ? expert.specialties
                        .map((s) =>
                          sanitizeText(
                            typeof s === "string" ? s : s?.name,
                            50
                          )
                        )
                        .join(", ")
                    : "-"}
                </span>
              </div>

              <div className="aed-info-row">
                <span className="aed-label">Deneyim</span>
                <span className="aed-value">{experienceYears} yıl</span>
              </div>

              <div className="aed-info-row">
                <span className="aed-label">Telefon</span>
                <span className="aed-value">
                  {expert.isPhoneVerified ? (
                    <span className="status-badge approved">
                      ✓ Doğrulandı
                    </span>
                  ) : (
                    <span className="status-badge pending">
                      ✗ Doğrulanmadı
                    </span>
                  )}
                </span>
              </div>
            </div>
          </div>

          <div className="aed-card full-width">
            <div className="aed-card-title">
              <span>📋</span> İlanlar ({listings.length})
            </div>

            {listings.length === 0 ? (
              <div className="aed-empty">Bu uzmana ait ilan bulunamadı.</div>
            ) : (
              <div className="aed-list">
                {listings.slice(0, 50).map((item) => {
                  let dateStr = "Tarih yok";
                  let hasDate = false;
                  const createdAt = item.createdAt;

                  if (createdAt) {
                    try {
                      if (createdAt._seconds !== undefined) {
                        const d = new Date(createdAt._seconds * 1000);
                        if (!isNaN(d.getTime())) {
                          dateStr = d.toLocaleDateString("tr-TR");
                          hasDate = true;
                        }
                      } else if (createdAt.seconds !== undefined) {
                        const d = new Date(createdAt.seconds * 1000);
                        if (!isNaN(d.getTime())) {
                          dateStr = d.toLocaleDateString("tr-TR");
                          hasDate = true;
                        }
                      } else if (createdAt instanceof Date) {
                        if (!isNaN(createdAt.getTime())) {
                          dateStr = createdAt.toLocaleDateString("tr-TR");
                          hasDate = true;
                        }
                      } else if (typeof createdAt === "string") {
                        const d = new Date(createdAt);
                        if (!isNaN(d.getTime())) {
                          dateStr = d.toLocaleDateString("tr-TR");
                          hasDate = true;
                        }
                      }
                    } catch (e) {
                      console.warn("Tarih hatası:", e);
                    }
                  }

                  const price = safeNumber(item.price);

                  return (
                    <div key={item.id} className="aed-item">
                      <div className="aed-item-title">
                        <Link to={`/ilan/${encodeForUrl(item.id)}`}>
                          {sanitizeText(item.title, 100) || "İsimsiz İlan"}
                        </Link>
                      </div>

                      <div className="aed-item-details">
                        <span>📂 {sanitizeText(item.category, 50) || "-"}</span>
                        <span>📍 {sanitizeText(item.city, 50) || "-"}</span>
                        <span>💰 {price}₺</span>
                        <span
                          style={{
                            color: hasDate ? "var(--primary)" : "#ef4444",
                          }}
                        >
                          📅 {dateStr}
                        </span>
                      </div>
                    </div>
                  );
                })}

                {listings.length > 50 && (
                  <div className="aed-hint">
                    Son 50 ilan gösteriliyor. Toplam: {listings.length}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="aed-card full-width">
            <div className="aed-card-title">
              <span>📅</span> Randevular ({appointmentStats.total})
            </div>

            <div className="aed-statuses">
              {statusOptions.map((opt) => (
                <button
                  key={opt.key}
                  className={`filter-pill ${
                    selectedJobStatus === opt.key ? "active" : ""
                  }`}
                  onClick={() => setSelectedJobStatus(opt.key)}
                >
                  {opt.label} ({opt.count})
                </button>
              ))}
            </div>

            {visibleAppointments.length === 0 ? (
              <div className="aed-empty">Randevu kaydı bulunamadı.</div>
            ) : (
              <div className="aed-list">
                {visibleAppointments.slice(0, 15).map((app) => (
                  <div key={app.id} className="aed-item">
                    <div className="aed-item-title">
                      {sanitizeText(app.client, 50) || "Müşteri"} •{" "}
                      {getStatusBadge(app.status)}
                    </div>

                    <div className="aed-item-details">
                      <span>📅 {sanitizeText(app.date, 20) || "-"}</span>

                      {app.start && app.end && (
                        <span>
                          🕐 {sanitizeText(app.start, 10)} -{" "}
                          {sanitizeText(app.end, 10)}
                        </span>
                      )}

                      <span>
                        📍 {sanitizeText(app.fullAddress, 50) || "-"}
                      </span>
                    </div>
                  </div>
                ))}

                {visibleAppointments.length > 15 && (
                  <div className="aed-hint">
                    Son 15 kayıt gösteriliyor. Toplam:{" "}
                    {visibleAppointments.length}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {showDeleteModal && (
        <div
          className="modal-overlay"
          onClick={() => !isDeleting && setShowDeleteModal(false)}
        >
          <div className="delete-modal" onClick={(e) => e.stopPropagation()}>
            <div className="delete-modal-header">
              <span className="delete-modal-icon">⚠️</span>
              <h3>Uzmanı Sil</h3>
            </div>

            <div className="delete-modal-body">
              <p>
                <strong>
                  {sanitizeText(expert.displayName || expert.email, 50)}
                </strong>{" "}
                adlı uzmanı ve tüm verilerini{" "}
                <strong style={{ color: "#ef4444" }}>kalıcı olarak</strong>{" "}
                silmek üzeresiniz.
              </p>

              <p className="delete-modal-warning">
                Bu uzmanı silmek istediğinizden emin misiniz? Bu hesaba ait tüm 
                veriler kalıcı olarak silinecektir.
              </p>

              <p className="delete-modal-warning">
                Bu işlem geri alınamaz!
              </p>

              {deleteError && (
                <div className="delete-modal-error">❌ {deleteError}</div>
              )}
            </div>

            <div className="delete-modal-footer">
              <button
                className="modal-cancel-btn"
                onClick={() => setShowDeleteModal(false)}
                disabled={isDeleting}
              >
                İptal
              </button>

              <button
                className="modal-delete-btn"
                onClick={handleDeleteExpert}
                disabled={isDeleting}
              >
                {isDeleting ? "Siliniyor..." : "Sil"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}