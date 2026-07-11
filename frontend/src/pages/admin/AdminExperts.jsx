import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  getPendingExperts,
  getApprovedExperts,
  getRejectedExperts,
  approveExpert,
  rejectExpert,
  deleteExpert,
} from "../../firebase/adminService";
import LoadingSpinner from "../../components/LoadingSpinner";
import ExpertCard from "../../components/admin/ExpertCard";
import RejectedExpertCard from "../../components/admin/RejectedExpertCard";
import DOMPurify from "dompurify";
import { useAdminOnly } from "../../hooks/useAuthGuard";
import "../../styles/admin/admin-common.css";
import "../../styles/admin/AdminCard.css";
import "../../styles/admin/ExpertCard.css";

const isDevelopment = process.env.NODE_ENV === "development";

const sanitizeText = (text, maxLength = 200) => {
  if (!text) return "";
  const sanitized = DOMPurify.sanitize(String(text));
  return sanitized.length > maxLength ? sanitized.slice(0, maxLength) + "..." : sanitized;
};

function encodeForUrl(str) {
  if (!str) return "";
  return encodeURIComponent(String(str));
}

export default function AdminExperts({ type }) {
  const { authorized, loading: authLoading } = useAdminOnly();
  const navigate = useNavigate();
  
  const [experts, setExperts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedCard, setExpandedCard] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortOrder, setSortOrder] = useState("newest");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(5);

  const [showRejectModal, setShowRejectModal] = useState(false);
  const [selectedExpert, setSelectedExpert] = useState(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectReasonError, setRejectReasonError] = useState("");
  const [isRejecting, setIsRejecting] = useState(false);

  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (authorized) {
      loadExperts();
    }
  }, [type, authorized]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, sortOrder]);

  const showSuccessModalFunc = (message) => {
    setSuccessMessage(sanitizeText(message, 200));
    setShowSuccessModal(true);
    setTimeout(() => setShowSuccessModal(false), 3000);
  };

  const showErrorModalFunc = (message) => {
    setErrorMessage(sanitizeText(message, 200));
    setShowErrorModal(true);
    setTimeout(() => setShowErrorModal(false), 4000);
  };

  const loadExperts = async () => {
    setLoading(true);
    try {
      let data = [];
      if (type === "pending") {
        data = await getPendingExperts();
      } else if (type === "approved") {
        data = await getApprovedExperts();
      } else if (type === "rejected") {
        data = await getRejectedExperts();
      }
      setExperts(Array.isArray(data) ? data : []);
    } catch (error) {
      if (isDevelopment) console.error("Uzmanlar yüklenirken hata:", error.message);
      showErrorModalFunc("حدث خطأ أثناء تحميل الخبراء.");
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (expert) => {
    if (!expert?.id) {
      showErrorModalFunc("معلومات خبير غير صالحة");
      return;
    }
    
    try {
      await approveExpert(expert.id);
      setExperts((prev) => prev.filter((e) => e.id !== expert.id));
      showSuccessModalFunc(`تمت الموافقة على ${sanitizeText(expert.displayName, 50)} بنجاح!`);
    } catch (error) {
      if (isDevelopment) console.error("Onaylanırken hata:", error.message);
      showErrorModalFunc("حدث خطأ أثناء الموافقة على الخبير.");
    }
  };

  const openRejectModal = (expert) => {
    setSelectedExpert(expert);
    setRejectReason("");
    setRejectReasonError("");
    setShowRejectModal(true);
  };

  const handleRejectWithReason = async () => {
    const cleanReason = rejectReason.trim();
    
    if (!cleanReason) {
      setRejectReasonError("يرجى كتابة سبب الرفض");
      return;
    }
    if (cleanReason.length < 3) {
      setRejectReasonError("يجب أن يكون سبب الرفض 3 أحرف على الأقل");
      return;
    }
    if (cleanReason.length > 500) {
      setRejectReasonError("يمكن أن يكون سبب الرفض 500 حرف كحد أقصى");
      return;
    }
    if (!selectedExpert?.id) {
      showErrorModalFunc("تم اختيار خبير غير صالح");
      setShowRejectModal(false);
      return;
    }

    setIsRejecting(true);

    try {
      await rejectExpert(selectedExpert.id, DOMPurify.sanitize(cleanReason.slice(0, 500)));
      setExperts((prev) => prev.filter((e) => e.id !== selectedExpert.id));
      setShowRejectModal(false);
      setSelectedExpert(null);
      setRejectReason("");
      showSuccessModalFunc(`تم رفض طلب ${sanitizeText(selectedExpert.displayName, 50)}!`);
    } catch (error) {
      if (isDevelopment) console.error("Reddedilirken hata:", error.message);
      showErrorModalFunc("حدث خطأ أثناء رفض الطلب.");
    } finally {
      setIsRejecting(false);
    }
  };

  const closeRejectModal = () => {
    setShowRejectModal(false);
    setSelectedExpert(null);
    setRejectReason("");
    setRejectReasonError("");
  };

  const handleDeleteExpert = async (expert) => {
    if (!expert?.id) {
      showErrorModalFunc("معلومات خبير غير صالحة");
      return;
    }
    
    const expertName = sanitizeText(expert.displayName, 50);
    if (window.confirm(`هل أنت متأكد من رغبتك في حذف الخبير ${expertName}؟`)) {
      try {
        await deleteExpert(expert.id);
        setExperts((prev) => prev.filter((e) => e.id !== expert.id));
        showSuccessModalFunc(`تم حذف ${expertName} بنجاح!`);
      } catch (error) {
        if (isDevelopment) console.error("Uzman silinirken hata:", error.message);
        showErrorModalFunc("حدث خطأ أثناء حذف الخبير.");
      }
    }
  };

  const toggleExpand = (id) => {
    setExpandedCard(expandedCard === id ? null : id);
  };

  const getFilteredAndSortedData = () => {
    let data = [...experts];

    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase().trim();
      data = data.filter(
        (item) =>
          (item.displayName && item.displayName.toLowerCase().includes(term)) ||
          (item.email && item.email.toLowerCase().includes(term)) ||
          (item.businessName && item.businessName.toLowerCase().includes(term)) ||
          (item.city && item.city.toLowerCase().includes(term))
      );
    }

    data.sort((a, b) => {
      const dateA = a.createdAt ? new Date(a.createdAt) : new Date(0);
      const dateB = b.createdAt ? new Date(b.createdAt) : new Date(0);
      return sortOrder === "newest" ? dateB - dateA : dateA - dateB;
    });

    return data;
  };

  if (authLoading) return <LoadingSpinner text="جاري التحقق من الصلاحيات..." />;
  
  if (!authorized) {
    return (
      <div className="no-data">
        <i className="fas fa-shield-alt fa-3x"></i>
        <p>ليس لديك صلاحية للوصول إلى هذه الصفحة. يمكن للمسؤولين فقط الوصول.</p>
      </div>
    );
  }

  const filteredData = getFilteredAndSortedData();
  const totalPages = Math.ceil(filteredData.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedData = filteredData.slice(startIndex, startIndex + itemsPerPage);

  const goToPage = (page) => {
    setCurrentPage(page);
    setExpandedCard(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleSearchChange = (e) => {
    setSearchTerm(e.target.value.slice(0, 100));
    setCurrentPage(1);
  };

  const clearSearch = () => {
    setSearchTerm("");
    setCurrentPage(1);
  };

  if (loading) return <LoadingSpinner text="جاري التحميل..." />;

  const isPending = type === "pending";
  const isRejected = type === "rejected";

  return (
    <div>
      <div className="search-filter-bar">
        <div className="search-wrapper">
          <input
            type="text"
            placeholder={`${
              isPending
                ? "ابحث في الخبراء بانتظار الموافقة"
                : isRejected
                ? "ابحث في الخبراء المرفوضين"
                : "ابحث في الخبراء"
            } (الاسم، البريد الإلكتروني، العمل، المدينة)...`}
            value={searchTerm}
            onChange={handleSearchChange}
            className="search-input"
            maxLength={100}
          />
          {searchTerm && (
            <button className="clear-search" onClick={clearSearch}>
              <i className="fas fa-times"></i>
            </button>
          )}
        </div>
 
        <div className="filter-group">
          <span className="filter-label">
            <i className="fas fa-sort-amount-down"></i> فرز:
          </span>
          <button
            className={`filter-btn ${sortOrder === "newest" ? "active" : ""}`}
            onClick={() => setSortOrder("newest")}
          >
            🕒 الأحدث
          </button>
          <button
            className={`filter-btn ${sortOrder === "oldest" ? "active" : ""}`}
            onClick={() => setSortOrder("oldest")}
          >
            📅 الأقدم
          </button>
        </div>
      </div>
 
      {paginatedData.length === 0 ? (
        <div className="no-data">
          <i className="fas fa-inbox fa-3x"></i>
          <p>{searchTerm ? "لم يتم العثور على نتائج تطابق بحثك." : "لا توجد سجلات."}</p>
          {searchTerm && (
            <button className="clear-filter-btn" onClick={clearSearch}>
              مسح البحث
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="cards-list">
            {paginatedData.map((expert) =>
              isRejected ? (
                <RejectedExpertCard
                  key={expert.id}
                  expert={expert}
                  isExpanded={expandedCard === expert.id}
                  onToggle={() => toggleExpand(expert.id)}
                />
              ) : (
                <ExpertCard
                  key={expert.id}
                  expert={expert}
                  onApprove={handleApprove}
                  onReject={() => openRejectModal(expert)}
                  onDelete={handleDeleteExpert}
                  onViewDetails={() => navigate(`/admin/expert/${encodeForUrl(expert.id)}`)}
                  isExpanded={expandedCard === expert.id}
                  onToggle={() => toggleExpand(expert.id)}
                  showActions={isPending}
                  showDelete={!isPending}
                  isPending={isPending}
                />
              )
            )}
          </div>

          {totalPages > 1 && (
            <div className="pagination">
              <button
                className="page-btn"
                onClick={() => goToPage(currentPage - 1)}
                disabled={currentPage === 1}
              >
                ← السابق
              </button>
              <span className="page-info">
                {currentPage} / {totalPages}
              </span>
              <button
                className="page-btn"
                onClick={() => goToPage(currentPage + 1)}
                disabled={currentPage === totalPages}
              >
                التالي →
              </button>
            </div>
          )}
        </>
      )}
 
      {showRejectModal && selectedExpert && (
        <div className="modal-overlay" onClick={closeRejectModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>رفض الطلب</h2>
              <button className="modal-close" onClick={closeRejectModal}>
                <i className="fas fa-times"></i>
              </button>
            </div>
            <div className="modal-body">
              <div className="expert-info">
                <div className="expert-avatar">
                  {sanitizeText(selectedExpert.displayName?.charAt(0).toUpperCase() || "?", 1)}
                </div>
                <div>
                  <h3>{sanitizeText(selectedExpert.displayName, 100)}</h3>
                  <p>{sanitizeText(selectedExpert.email, 100)}</p>
                  <p>{sanitizeText(selectedExpert.businessName, 100)}</p>
                </div>
              </div>
              <div className="form-group">
                <label htmlFor="rejectReason">
                  سبب الرفض <span style={{ color: "red" }}>*</span>
                </label>
                <textarea
                  id="rejectReason"
                  value={rejectReason}
                  onChange={(e) => {
                    setRejectReason(e.target.value.slice(0, 500));
                    if (rejectReasonError) setRejectReasonError("");
                  }}
                  placeholder="اكتب سبب رفض الطلب..."
                  rows="5"
                  maxLength={500}
                />
                {rejectReasonError && <p className="error-text">{rejectReasonError}</p>}
                <small className="char-counter">{rejectReason.length}/500</small>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={closeRejectModal}>
                إلغاء
              </button>
              <button className="btn-reject" onClick={handleRejectWithReason} disabled={isRejecting}>
                {isRejecting ? <><i className="fas fa-spinner fa-spin"></i> جاري الرفض...</> : "رفض"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showSuccessModal && (
        <div className="toast-modal success" onClick={() => setShowSuccessModal(false)}>
          <div className="toast-content">
            <div className="toast-icon">
              <i className="fas fa-check-circle"></i>
            </div>
            <div className="toast-message">{sanitizeText(successMessage, 100)}</div>
            <button className="toast-close" onClick={() => setShowSuccessModal(false)}>
              <i className="fas fa-times"></i>
            </button>
          </div>
        </div>
      )}

      {showErrorModal && (
        <div className="toast-modal error" onClick={() => setShowErrorModal(false)}>
          <div className="toast-content">
            <div className="toast-icon">
              <i className="fas fa-times-circle"></i>
            </div>
            <div className="toast-message">{sanitizeText(errorMessage, 100)}</div>
            <button className="toast-close" onClick={() => setShowErrorModal(false)}>
              <i className="fas fa-times"></i>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}