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
import { toArabicServiceLabel } from "../../utils/arabicLabels";

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
    return date.toLocaleString("ar-SY");
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
      <span className="status-badge approved">✅ مقبول</span>
    ) : (
      <span className="status-badge pending">⏳ معلق</span>
    );
  }

  switch (status) {
    case "approved":
      return <span className="status-badge approved">✅ مقبول</span>;
    case "completed":
      return <span className="status-badge completed">✔️ مكتمل</span>;
    case "rejected":
      return <span className="status-badge rejected">❌ مرفوض</span>;
    case "pending":
      return <span className="status-badge pending">⏳ ينتظر الموافقة</span>;
    case "cancelled":
      return <span className="status-badge cancelled">❌ ملغي</span>;
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
      setError("معرف خبير غير صالح");
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
            "تعذر تحميل تفاصيل الخبير. يرجى المحاولة مرة أخرى لاحقاً."
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
          successMessage: `تم حذف ${sanitizeText(
            expert?.displayName || "خبير"
          )} بنجاح.`,
        },
      });
    } catch (err) {
      console.error("Silme hatası:", err);
      setDeleteError(
        err?.message || "حدث خطأ. يرجى المحاولة مرة أخرى."
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
        label: "الكل",
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
        <LoadingSpinner text="جاري التحقق من الصلاحيات..." />
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
              ← لوحة التحكم للأدمن
            </button>
          </div>

          <div className="aed-error">
            ليس لديك صلاحية للوصول إلى هذه الصفحة. يمكن للمسؤولين فقط الوصول.
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="admin-expert-detail-page">
        <Navbar />
        <LoadingSpinner text="جاري تحميل تفاصيل الخبير..." />
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
              ← لوحة التحكم للأدمن
            </button>
          </div>

          <div className="aed-error">
            {sanitizeText(error || "الخبير غير موجود.", 200)}
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
              ← لوحة التحكم للأدمن
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
                <h1>{sanitizeText(expert.displayName || "خبير", 100)}</h1>
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
            🗑️ حذف الخبير
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
              <span className="stat-value">{expert.rating || "جديد"}</span>
              <span className="stat-label">التقييم</span>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon">💰</div>
            <div className="stat-info">
              <span className="stat-value">
                {minPrice} ل.س - {maxPrice} ل.س
              </span>
              <span className="stat-label">نطاق السعر</span>
            </div>
          </div>
        </div>

        <div className="aed-grid">
          <div className="aed-card">
            <div className="aed-card-title">
              <span>👤</span> المعلومات الشخصية
            </div>

            <div className="aed-kv">
              <div className="aed-info-row">
                <span className="aed-label">البريد الإلكتروني</span>
                <span className="aed-value">
                  {sanitizeText(expert.email, 100)}
                </span>
              </div>

              <div className="aed-info-row">
                <span className="aed-label">الهاتف</span>
                <span className="aed-value">
                  {sanitizeText(expert.phoneNumber, 20)}
                </span>
              </div>

              <div className="aed-info-row">
                <span className="aed-label">الموقع</span>
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
                      📍 عرض على الخريطة
                    </a>
                  )}
                </span>
              </div>

              <div className="aed-info-row">
                <span className="aed-label">الفئة</span>
                <span className="aed-value">
                  {Array.isArray(expert.category)
                    ? expert.category
                        .map((c) => sanitizeText(toArabicServiceLabel(c), 50))
                        .join(", ")
                    : sanitizeText(toArabicServiceLabel(expert.category), 100)}
                </span>
              </div>

              <div className="aed-info-row">
                <span className="aed-label">تاريخ التسجيل</span>
                <span className="aed-value">
                  {formatDateTime(expert.createdAt)}
                </span>
              </div>

              <div className="aed-info-row">
                <span className="aed-label">آخر دخول</span>
                <span className="aed-value">
                  {formatDateTime(
                    expert.lastLoginAt || authMetadata?.lastSignInTime
                  )}
                </span>
              </div>

              <div className="aed-info-row">
                <span className="aed-label">الحالة</span>
                <span className="aed-value">
                  {getStatusBadge(null, expert.isActive)}
                </span>
              </div>
            </div>
          </div>

          <div className="aed-card">
            <div className="aed-card-title">
              <span>⚡</span> التخصص والخبرة
            </div>

            <div className="aed-kv">
              <div className="aed-info-row">
                <span className="aed-label">التخصصات</span>
                <span className="aed-value">
                  {Array.isArray(expert.specialties) &&
                  expert.specialties.length
                    ? expert.specialties
                        .map((s) =>
                          sanitizeText(
                            toArabicServiceLabel(typeof s === "string" ? s : s?.name),
                            50
                          )
                        )
                        .join(", ")
                    : "-"}
                </span>
              </div>

              <div className="aed-info-row">
                <span className="aed-label">الخبرة</span>
                <span className="aed-value">خبرة {experienceYears} سنوات</span>
              </div>

              <div className="aed-info-row">
                <span className="aed-label">الهاتف</span>
                <span className="aed-value">
                  {expert.isPhoneVerified ? (
                    <span className="status-badge approved">
                      ✓ تم التحقق
                    </span>
                  ) : (
                    <span className="status-badge pending">
                      ✗ لم يتم التحقق
                    </span>
                  )}
                </span>
              </div>
            </div>
          </div>

          <div className="aed-card full-width">
            <div className="aed-card-title">
              <span>📋</span> الإعلانات ({listings.length})
            </div>

            {listings.length === 0 ? (
              <div className="aed-empty">لم يتم العثور على إعلانات لهذا الخبير.</div>
            ) : (
              <div className="aed-list">
                {listings.slice(0, 50).map((item) => {
                  let dateStr = "لا يوجد تاريخ";
                  let hasDate = false;
                  const createdAt = item.createdAt;

                  if (createdAt) {
                    try {
                      if (createdAt._seconds !== undefined) {
                        const d = new Date(createdAt._seconds * 1000);
                        if (!isNaN(d.getTime())) {
                          dateStr = d.toLocaleDateString("ar-SY");
                          hasDate = true;
                        }
                      } else if (createdAt.seconds !== undefined) {
                        const d = new Date(createdAt.seconds * 1000);
                        if (!isNaN(d.getTime())) {
                          dateStr = d.toLocaleDateString("ar-SY");
                          hasDate = true;
                        }
                      } else if (createdAt instanceof Date) {
                        if (!isNaN(createdAt.getTime())) {
                          dateStr = createdAt.toLocaleDateString("ar-SY");
                          hasDate = true;
                        }
                      } else if (typeof createdAt === "string") {
                        const d = new Date(createdAt);
                        if (!isNaN(d.getTime())) {
                          dateStr = d.toLocaleDateString("ar-SY");
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
                          {sanitizeText(item.title, 100) || "إعلان بدون اسم"}
                        </Link>
                      </div>

                      <div className="aed-item-details">
                        <span>📂 {sanitizeText(toArabicServiceLabel(item.category), 50) || "-"}</span>
                        <span>📍 {sanitizeText(item.city, 50) || "-"}</span>
                        <span>💰 {price} ل.س</span>
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
                    يتم عرض آخر 50 إعلاناً. الإجمالي: {listings.length}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="aed-card full-width">
            <div className="aed-card-title">
              <span>📅</span> المواعيد ({appointmentStats.total})
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
              <div className="aed-empty">لم يتم العثور على سجل مواعيد.</div>
            ) : (
              <div className="aed-list">
                {visibleAppointments.slice(0, 15).map((app) => (
                  <div key={app.id} className="aed-item">
                    <div className="aed-item-title">
                      {sanitizeText(app.client, 50) || "العميل"} •{" "}
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
                    يتم عرض آخر 15 سجلاً. الإجمالي:{" "}
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
              <h3>حذف الخبير</h3>
            </div>

            <div className="delete-modal-body">
              <p>
                أنت على وشك حذف الخبير{" "}
                <strong>
                  {sanitizeText(expert.displayName || expert.email, 50)}
                </strong>{" "}
                وجميع بياناته <strong style={{ color: "#ef4444" }}>نهائياً</strong>.
              </p>

              <p className="delete-modal-warning">
                هل أنت متأكد من رغبتك في حذف هذا الخبير؟ سيتم حذف جميع البيانات المرتبطة بهذا الحساب نهائياً.
              </p>

              <p className="delete-modal-warning">
                هذا الإجراء لا يمكن التراجع عنه!
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
                إلغاء
              </button>

              <button
                className="modal-delete-btn"
                onClick={handleDeleteExpert}
                disabled={isDeleting}
              >
                {isDeleting ? "جاري الحذف..." : "حذف"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}