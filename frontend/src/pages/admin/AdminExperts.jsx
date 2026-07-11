// AdminExperts.jsx file code 

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
      showErrorModalFunc("Uzmanlar yüklenirken hata oluştu.");
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (expert) => {
    if (!expert?.id) {
      showErrorModalFunc("Geçersiz uzman bilgisi");
      return;
    }
    
    try {
      await approveExpert(expert.id);
      setExperts((prev) => prev.filter((e) => e.id !== expert.id));
      showSuccessModalFunc(`${sanitizeText(expert.displayName, 50)} başarıyla onaylandı!`);
    } catch (error) {
      if (isDevelopment) console.error("Onaylanırken hata:", error.message);
      showErrorModalFunc("Uzman onaylanırken hata oluştu.");
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
      setRejectReasonError("Lütfen reddetme nedeninizi yazın");
      return;
    }
    if (cleanReason.length < 3) {
      setRejectReasonError("Reddetme nedeni en az 3 karakter olmalıdır");
      return;
    }
    if (cleanReason.length > 500) {
      setRejectReasonError("Reddetme nedeni en fazla 500 karakter olabilir");
      return;
    }
    if (!selectedExpert?.id) {
      showErrorModalFunc("Geçersiz uzman seçildi");
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
      showSuccessModalFunc(`${sanitizeText(selectedExpert.displayName, 50)} başvurusu reddedildi!`);
    } catch (error) {
      if (isDevelopment) console.error("Reddedilirken hata:", error.message);
      showErrorModalFunc("Başvuru reddedilirken hata oluştu.");
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
      showErrorModalFunc("Geçersiz uzman bilgisi");
      return;
    }
    
    const expertName = sanitizeText(expert.displayName, 50);
    if (window.confirm(`${expertName} adlı uzmanı silmek istediğinize emin misiniz?`)) {
      try {
        await deleteExpert(expert.id);
        setExperts((prev) => prev.filter((e) => e.id !== expert.id));
        showSuccessModalFunc(`${expertName} başarıyla silindi!`);
      } catch (error) {
        if (isDevelopment) console.error("Uzman silinirken hata:", error.message);
        showErrorModalFunc("Uzman silinirken hata oluştu.");
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

  if (authLoading) return <LoadingSpinner text="Yetki kontrol ediliyor..." />;
  
  if (!authorized) {
    return (
      <div className="no-data">
        <i className="fas fa-shield-alt fa-3x"></i>
        <p>Bu sayfaya erişim yetkiniz yok. Sadece adminler erişebilir.</p>
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

  if (loading) return <LoadingSpinner text="Yükleniyor..." />;

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
                ? "Onay bekleyen uzmanlarda ara"
                : isRejected
                ? "Reddedilen uzmanlarda ara"
                : "Uzmanlarda ara"
            } (isim, email, işletme, şehir)...`}
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
            <i className="fas fa-sort-amount-down"></i> Sırala:
          </span>
          <button
            className={`filter-btn ${sortOrder === "newest" ? "active" : ""}`}
            onClick={() => setSortOrder("newest")}
          >
            🕒 En Yeni
          </button>
          <button
            className={`filter-btn ${sortOrder === "oldest" ? "active" : ""}`}
            onClick={() => setSortOrder("oldest")}
          >
            📅 En Eski
          </button>
        </div>
      </div>

      {paginatedData.length === 0 ? (
        <div className="no-data">
          <i className="fas fa-inbox fa-3x"></i>
          <p>{searchTerm ? "Aramanıza uygun sonuç bulunamadı." : "Kayıt bulunmuyor."}</p>
          {searchTerm && (
            <button className="clear-filter-btn" onClick={clearSearch}>
              Aramayı Temizle
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
                ← Önceki
              </button>
              <span className="page-info">
                {currentPage} / {totalPages}
              </span>
              <button
                className="page-btn"
                onClick={() => goToPage(currentPage + 1)}
                disabled={currentPage === totalPages}
              >
                Sonraki →
              </button>
            </div>
          )}
        </>
      )}

      {showRejectModal && selectedExpert && (
        <div className="modal-overlay" onClick={closeRejectModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Başvuruyu Reddet</h2>
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
                  Reddetme Nedeni <span style={{ color: "red" }}>*</span>
                </label>
                <textarea
                  id="rejectReason"
                  value={rejectReason}
                  onChange={(e) => {
                    setRejectReason(e.target.value.slice(0, 500));
                    if (rejectReasonError) setRejectReasonError("");
                  }}
                  placeholder="Başvurunun neden reddedildiğini yazın..."
                  rows="5"
                  maxLength={500}
                />
                {rejectReasonError && <p className="error-text">{rejectReasonError}</p>}
                <small className="char-counter">{rejectReason.length}/500</small>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={closeRejectModal}>
                İptal
              </button>
              <button className="btn-reject" onClick={handleRejectWithReason} disabled={isRejecting}>
                {isRejecting ? <><i className="fas fa-spinner fa-spin"></i> Reddediliyor...</> : "Reddet"}
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