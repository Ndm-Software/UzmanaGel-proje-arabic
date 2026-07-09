import React, { useState, useEffect } from "react";
import { collection, query, where, getDocs, updateDoc, doc, orderBy, onSnapshot, addDoc, getDoc } from "firebase/firestore";
import { db } from "../../firebase/firebaseClient";
import { auth } from "../../firebase/firebaseClient";
import LoadingSpinner from "../../components/LoadingSpinner";
import DOMPurify from "dompurify";
import "../../styles/admin/AdminAddressRequests.css";

const isDevelopment = import.meta.env.DEV;
const API_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000";

const sanitizeText = (text, maxLength = 100) => {
  if (!text) return "-";
  const sanitized = DOMPurify.sanitize(String(text));
  return sanitized.length > maxLength ? sanitized.slice(0, maxLength) + "..." : sanitized;
};

const formatDate = (timestamp) => {
  if (!timestamp) return "-";
  try {
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    if (isNaN(date.getTime())) return "-";
    return date.toLocaleString("tr-TR");
  } catch {
    return "-";
  }
};

const formatShortDate = (timestamp) => {
  if (!timestamp) return "-";
  try {
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    if (isNaN(date.getTime())) return "-";
    return date.toLocaleDateString("tr-TR");
  } catch {
    return "-";
  }
};

const sanitizeSearchTerm = (term) => {
  if (!term) return "";
  return String(term).replace(/[.*+?^${}()|[\]\\]/g, "").slice(0, 100);
};

const showToast = (message, type) => {
  const toast = document.createElement("div");
  toast.className = `admin-toast ${type}`;
  toast.innerHTML = `<i class="fas ${type === "success" ? "fa-check-circle" : "fa-exclamation-circle"}"></i> ${sanitizeText(message, 100)}`;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
};

const getAuthToken = async () => {
  const user = auth.currentUser;
  if (!user) {
    return null;
  }
  try {
    return await user.getIdToken();
  } catch (error) {
    console.error("Token alınamadı:", error);
    return null;
  }
};

export default function AdminAddressRequests() {
  const [requests, setRequests] = useState([]);
  const [filteredRequests, setFilteredRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [expertNames, setExpertNames] = useState({});
  
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [dateRange, setDateRange] = useState({ start: "", end: "" });
  const [sortOrder, setSortOrder] = useState("newest");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(20);
  const [totalItems, setTotalItems] = useState(0);
  
  const [rejectModal, setRejectModal] = useState({ open: false, requestId: null, reason: "", expertId: null });
  const [stats, setStats] = useState({
    pending: 0,
    approved: 0,
    rejected: 0,
    completed: 0,
  });

  const getExpertName = async (expertId) => {
    if (expertNames[expertId]) return expertNames[expertId];
    
    try {
      const userDoc = await getDoc(doc(db, "users", expertId));
      const providerDoc = await getDoc(doc(db, "service_providers", expertId));
      
      let name = expertId.slice(0, 8) + "...";
      
      if (providerDoc.exists() && providerDoc.data().businessName) {
        name = providerDoc.data().businessName;
      } else if (userDoc.exists() && userDoc.data().displayName) {
        name = userDoc.data().displayName;
      } else if (userDoc.exists() && userDoc.data().email) {
        name = userDoc.data().email;
      }
      
      setExpertNames(prev => ({ ...prev, [expertId]: name }));
      return name;
    } catch (error) {
      if (isDevelopment) console.error("Uzman adı alınamadı:", error);
      return expertId.slice(0, 8) + "...";
    }
  };

  useEffect(() => {
    const q = query(
      collection(db, "address_change_requests"),
      orderBy("createdAt", "desc")
    );

    const unsubscribe = onSnapshot(q, 
      async (snapshot) => {
        const items = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        
        for (const item of items) {
          await getExpertName(item.expertId);
        }
        
        setRequests(items);
        
        const pending = items.filter(r => r.status === "PENDING").length;
        const approved = items.filter(r => r.status === "APPROVED").length;
        const rejected = items.filter(r => r.status === "REJECTED").length;
        const completed = items.filter(r => r.status === "COMPLETED").length;
        setStats({ pending, approved, rejected, completed });
        
        setLoading(false);
      },
      (error) => {
        if (isDevelopment) console.error("Talepler yüklenemedi:", error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    let filtered = [...requests];
    
    if (searchTerm && searchTerm.trim()) {
      const sanitizedTerm = sanitizeSearchTerm(searchTerm);
      const term = sanitizedTerm.toLowerCase().trim();
      filtered = filtered.filter(req => {
        const expertName = expertNames[req.expertId] || "";
        return expertName.toLowerCase().includes(term) ||
          req.expertId.toLowerCase().includes(term) ||
          (req.reason && req.reason.toLowerCase().includes(term));
      });
    }
    
    if (statusFilter !== "ALL") {
      filtered = filtered.filter(req => req.status === statusFilter);
    }
    
    if (dateRange.start) {
      filtered = filtered.filter(req => {
        const date = req.createdAt?.toDate ? req.createdAt.toDate() : new Date(req.createdAt);
        return date >= new Date(dateRange.start);
      });
    }
    if (dateRange.end) {
      filtered = filtered.filter(req => {
        const date = req.createdAt?.toDate ? req.createdAt.toDate() : new Date(req.createdAt);
        const endDate = new Date(dateRange.end);
        endDate.setHours(23, 59, 59);
        return date <= endDate;
      });
    }
    
    filtered.sort((a, b) => {
      const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt);
      const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt);
      return sortOrder === "newest" ? dateB - dateA : dateA - dateB;
    });
    
    setTotalItems(filtered.length);
    const start = (currentPage - 1) * itemsPerPage;
    setFilteredRequests(filtered.slice(start, start + itemsPerPage));
  }, [requests, expertNames, searchTerm, statusFilter, dateRange, sortOrder, currentPage, itemsPerPage]);

  const handleApprove = async (requestId, expertId) => {
    setProcessingId(requestId);
    try {
      const token = await getAuthToken();
      
      if (!token) {
        throw new Error("Oturum bilgisi bulunamadı. Lütfen tekrar giriş yapın.");
      }
      
      const response = await fetch(`${API_URL}/api/admin/address-requests/${requestId}/approve`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        }
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.message || "Onaylama başarısız.");
      }

      showToast(data.message || "Talep onaylandı ve uzmana bildirim gönderildi.", "success");
    } catch (error) {
      if (isDevelopment) console.error("Onaylama hatası:", error);
      showToast(error.message || "Onaylama sırasında bir hata oluştu.", "error");
    } finally {
      setProcessingId(null);
    }
  };

  const openRejectModal = (requestId, expertId) => {
    setRejectModal({ open: true, requestId, reason: "", expertId });
  };

  const handleReject = async () => {
    const { requestId, reason, expertId } = rejectModal;
    if (!reason.trim()) {
      showToast("Lütfen reddetme sebebini girin.", "error");
      return;
    }

    setProcessingId(requestId);
    try {
      const token = await getAuthToken();
      
      if (!token) {
        throw new Error("Oturum bilgisi bulunamadı. Lütfen tekrar giriş yapın.");
      }
      
      const response = await fetch(`${API_URL}/api/admin/address-requests/${requestId}/reject`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ reason: reason.trim() })
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.message || "Reddetme başarısız.");
      }

      setRejectModal({ open: false, requestId: null, reason: "", expertId: null });
      showToast(data.message || "Talep reddedildi ve uzmana bildirim gönderildi.", "success");
    } catch (error) {
      if (isDevelopment) console.error("Reddetme hatası:", error);
      showToast(error.message || "Reddetme sırasında bir hata oluştu.", "error");
    } finally {
      setProcessingId(null);
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case "PENDING":
        return <span className="status-badge pending"><i className="fas fa-hourglass-half"></i> Beklemede</span>;
      case "APPROVED":
        return <span className="status-badge approved"><i className="fas fa-check-circle"></i> Onaylandı</span>;
      case "REJECTED":
        return <span className="status-badge rejected"><i className="fas fa-times-circle"></i> Reddedildi</span>;
      case "COMPLETED":
        return <span className="status-badge completed"><i className="fas fa-check-double"></i> Tamamlandı</span>;
      default:
        return <span className="status-badge">{status}</span>;
    }
  };

  const toggleExpand = (id) => {
    setExpandedId(expandedId === id ? null : id);
  };

  const totalPages = Math.ceil(totalItems / itemsPerPage);

  const handleSearchChange = (e) => {
    setSearchTerm(e.target.value.slice(0, 100));
    setCurrentPage(1);
  };

  const handleStatusChange = (status) => {
    setStatusFilter(status);
    setCurrentPage(1);
  };

  const handleDateChange = (type, value) => {
    setDateRange(prev => ({ ...prev, [type]: value }));
    setCurrentPage(1);
  };

  const handleSortChange = (e) => {
    setSortOrder(e.target.value);
    setCurrentPage(1);
  };

  if (loading) {
    return <LoadingSpinner text="Adres talepleri yükleniyor..." />;
  }

  return (
    <div className="admin-address-requests">
      <div className="address-stats-grid">
        <div className="stat-card pending" onClick={() => handleStatusChange("PENDING")}>
          <div className="stat-icon"><i className="fas fa-hourglass-half"></i></div>
          <div className="stat-info">
            <h3>{stats.pending}</h3>
            <p>Beklemede</p>
          </div>
        </div>
        
        <div className="stat-card approved" onClick={() => handleStatusChange("APPROVED")}>
          <div className="stat-icon"><i className="fas fa-check-circle"></i></div>
          <div className="stat-info">
            <h3>{stats.approved}</h3>
            <p>Onaylandı</p>
          </div>
        </div>
        
        <div className="stat-card rejected" onClick={() => handleStatusChange("REJECTED")}>
          <div className="stat-icon"><i className="fas fa-times-circle"></i></div>
          <div className="stat-info">
            <h3>{stats.rejected}</h3>
            <p>Reddedildi</p>
          </div>
        </div>
        
        <div className="stat-card completed" onClick={() => handleStatusChange("COMPLETED")}>
          <div className="stat-icon"><i className="fas fa-check-double"></i></div>
          <div className="stat-info">
            <h3>{stats.completed}</h3>
            <p>Tamamlandı</p>
          </div>
        </div>
      </div>

      <div className="address-filter-bar">
        <div className="filter-row">
          <div className="search-wrapper">
            <input
              type="text"
              placeholder="Uzman adı, ID veya sebep ile ara..."
              value={searchTerm}
              onChange={handleSearchChange}
              className="search-input"
              maxLength={100}
            />
          </div>
          
          <div className="date-range">
            <input
              type="date"
              placeholder="Başlangıç"
              value={dateRange.start}
              onChange={(e) => handleDateChange("start", e.target.value)}
              className="date-input"
            />
            <span>—</span>
            <input
              type="date"
              placeholder="Bitiş"
              value={dateRange.end}
              onChange={(e) => handleDateChange("end", e.target.value)}
              className="date-input"
            />
          </div>

          <div className="sort-section">
            <i className="fas fa-sort-amount-down"></i>
            <select value={sortOrder} onChange={handleSortChange} className="sort-select">
              <option value="newest">En Yeni</option>
              <option value="oldest">En Eski</option>
            </select>
          </div>
        </div>
      </div>

      <div className="info-box">
        <i className="fas fa-info-circle"></i>
        <span>Adres değişiklik talepleri buradan yönetilir. Onaylanan taleplerde uzman yeni adresini girebilir.</span>
      </div>

      {filteredRequests.length === 0 ? (
        <div className="no-data">
          <i className="fas fa-inbox fa-3x"></i>
          <p>Bu kategoride adres değişiklik talebi bulunmuyor.</p>
        </div>
      ) : (
        <div className="requests-list">
          {filteredRequests.map((request) => (
            <div key={request.id} className={`request-card ${expandedId === request.id ? "expanded" : ""}`}>
              <div className="request-card-header" onClick={() => toggleExpand(request.id)}>
                <div className="request-summary">
                  <div className="request-avatar">
                    <i className="fas fa-user-circle"></i>
                  </div>
                  <div className="request-basic-info">
                    <h4>{sanitizeText(expertNames[request.expertId] || request.expertId, 40)}</h4>
                    <div className="request-meta">
                      <span className="request-date-short">
                        <i className="fas fa-calendar-alt"></i> 
                        {formatShortDate(request.createdAt)}
                      </span>
                      <span className="request-separator">•</span>
                      <span className="request-id-short">
                        <i className="fas fa-id-card"></i> 
                        ID: {request.expertId.slice(0, 8)}...
                      </span>
                      <span className="request-separator">•</span>
                      <span className="request-reason-short">
                        <i className="fas fa-comment"></i> 
                        {sanitizeText(request.reason, 60) || "Sebep belirtilmemiş"}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="request-right">
                  {getStatusBadge(request.status)}
                  <button className="expand-icon">
                    <i className={`fas fa-chevron-${expandedId === request.id ? "up" : "down"}`}></i>
                  </button>
                </div>
              </div>

              {expandedId === request.id && (
                <div className="request-card-body">
                  <div className="request-full-details">
                    <div className="detail-row">
                      <label><i className="fas fa-user"></i> Uzman Adı</label>
                      <span>{sanitizeText(expertNames[request.expertId] || request.expertId, 50)}</span>
                    </div>

                    <div className="detail-row">
                      <label><i className="fas fa-id-card"></i> Uzman ID</label>
                      <span>{sanitizeText(request.expertId, 50)}</span>
                    </div>

                    <div className="detail-row full-width">
                      <label><i className="fas fa-comment"></i> Değişiklik Sebebi</label>
                      <p>{sanitizeText(request.reason, 500) || "Belirtilmemiş"}</p>
                    </div>

                    {request.taxPlateUrl && (
                      <div className="detail-row">
                        <label><i className="fas fa-file-invoice"></i> Vergi Levhası</label>
                        <a href={request.taxPlateUrl} target="_blank" rel="noopener noreferrer" className="doc-link">
                          <i className="fas fa-external-link-alt"></i> Görüntüle
                        </a>
                      </div>
                    )}

                    {request.inspectionReportUrl && (
                      <div className="detail-row">
                        <label><i className="fas fa-clipboard-list"></i> Yoklama Fişi</label>
                        <a href={request.inspectionReportUrl} target="_blank" rel="noopener noreferrer" className="doc-link">
                          <i className="fas fa-external-link-alt"></i> Görüntüle
                        </a>
                      </div>
                    )}

                    <div className="detail-row">
                      <label><i className="fas fa-calendar-plus"></i> Talep Tarihi</label>
                      <span>{formatDate(request.createdAt)}</span>
                    </div>

                    {request.approvedAt && (
                      <div className="detail-row approved">
                        <label><i className="fas fa-check-circle"></i> Onaylanma Tarihi</label>
                        <span>{formatDate(request.approvedAt)}</span>
                      </div>
                    )}

                    {request.rejectedAt && (
                      <div className="detail-row rejected">
                        <label><i className="fas fa-times-circle"></i> Reddedilme Tarihi</label>
                        <span>{formatDate(request.rejectedAt)}</span>
                      </div>
                    )}

                    {request.rejectionReason && (
                      <div className="detail-row full-width rejection">
                        <label><i className="fas fa-ban"></i> Red Sebebi</label>
                        <p className="rejection-text">{sanitizeText(request.rejectionReason, 500)}</p>
                      </div>
                    )}
                  </div>

                  {request.status === "PENDING" && (
                    <div className="request-actions-expanded">
                      <button
                        className="btn-approve"
                        onClick={() => handleApprove(request.id, request.expertId)}
                        disabled={processingId === request.id}
                      >
                        {processingId === request.id ? (
                          <><i className="fas fa-spinner fa-spin"></i> İşleniyor...</>
                        ) : (
                          <><i className="fas fa-check"></i> Onayla</>
                        )}
                      </button>
                      <button
                        className="btn-reject"
                        onClick={() => openRejectModal(request.id, request.expertId)}
                        disabled={processingId === request.id}
                      >
                        <i className="fas fa-times"></i> Reddet
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="pagination">
          <button onClick={() => setCurrentPage(1)} disabled={currentPage === 1}>«</button>
          <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}>‹</button>
          <span>{currentPage} / {totalPages}</span>
          <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}>›</button>
          <button onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages}>»</button>
        </div>
      )}

      {rejectModal.open && (
        <div className="modal-overlay" onClick={() => setRejectModal({ open: false, requestId: null, reason: "", expertId: null })}>
          <div className="modal-content reject-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2><i className="fas fa-ban"></i> Talebi Reddet</h2>
              <button className="modal-close" onClick={() => setRejectModal({ open: false, requestId: null, reason: "", expertId: null })}>
                <i className="fas fa-times"></i>
              </button>
            </div>
            <div className="modal-body">
              <p className="modal-info-text">
                Bu talebi reddetmek istediğinize emin misiniz? Reddetme sebebini girin, uzmana bildirilecektir.
              </p>
              <div className="form-group">
                <label>Reddetme Sebebi <span className="required">*</span></label>
                <textarea
                  className="form-textarea"
                  rows="4"
                  placeholder="Örn: Belgeler eksik veya okunaksız..."
                  value={rejectModal.reason}
                  onChange={(e) => setRejectModal(prev => ({ ...prev, reason: e.target.value }))}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setRejectModal({ open: false, requestId: null, reason: "", expertId: null })}>
                İptal
              </button>
              <button className="btn-reject-modal" onClick={handleReject} disabled={processingId === rejectModal.requestId}>
                {processingId === rejectModal.requestId ? (
                  <><i className="fas fa-spinner fa-spin"></i> Reddediliyor...</>
                ) : (
                  <><i className="fas fa-check"></i> Reddet</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}