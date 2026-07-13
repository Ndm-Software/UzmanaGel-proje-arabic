import React, { useState, useEffect } from 'react';
import { collection, query, getDocs, doc, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase/firebaseClient';
import DOMPurify from 'dompurify';
import { useAdminOnly } from '../../hooks/useAuthGuard';
import LoadingSpinner from '../../components/LoadingSpinner';
import '../../styles/admin/AdminAppointments.css';

const isDevelopment = process.env.NODE_ENV === 'development';

const sanitizeText = (text, maxLength = 200) => {
  if (!text) return '-';
  const sanitized = DOMPurify.sanitize(String(text));
  return sanitized.length > maxLength ? sanitized.slice(0, maxLength) + '...' : sanitized;
};

// NoSQL Injection koruması için search term temizleme
const sanitizeSearchTerm = (term) => {
  if (!term) return '';
  return String(term).replace(/[.*+?^${}()|[\]\\]/g, '').slice(0, 100);
};

const safeFormatDate = (timestamp) => {
  if (!timestamp) return '-';
  try {
    if (typeof timestamp === 'string') {
      const date = new Date(timestamp);
      if (isNaN(date.getTime())) return '-';
      return date.toLocaleDateString('tr-TR');
    }
    const date = new Date(timestamp);
    if (isNaN(date.getTime())) return '-';
    return date.toLocaleDateString('tr-TR');
  } catch {
    return '-';
  }
};

const safeFormatTime = (hour) => {
  if (hour === undefined || hour === null) return '-';
  try {
    const num = Number(hour);
    if (isNaN(num)) return '-';
    return `${num.toString().padStart(2, '0')}:00`;
  } catch {
    return '-';
  }
};

const safeFormatFullDateTime = (date, startHour) => {
  if (!date) return '-';
  return `${safeFormatDate(date)} ${safeFormatTime(startHour)}`;
};

const formatLargeNumber = (num) => {
  const number = Number(num) || 0;
  const absNumber = Math.abs(number);
  const sign = number < 0 ? '-' : '';
  const absValue = absNumber;
  
  if (absValue >= 1000000000) {
    return sign + (absValue / 1000000000).toFixed(1).replace(/\.0$/, '') + ' Milyar';
  }
  if (absValue >= 1000000) {
    return sign + (absValue / 1000000).toFixed(1).replace(/\.0$/, '') + ' Milyon';
  }
  if (absValue >= 1000) {
    return sign + (absValue / 1000).toFixed(1).replace(/\.0$/, '') + ' Bin';
  }
  return sign + absValue.toLocaleString('tr-TR');
};

const formatFullNumber = (num) => {
  const number = Number(num) || 0;
  return number.toLocaleString('tr-TR');
};

let rejectAttempts = 0;
let rejectLastAttemptTime = 0;

const isRejectRateLimited = () => {
  const now = Date.now();
  if (now - rejectLastAttemptTime > 60000) {
    rejectAttempts = 0;
    rejectLastAttemptTime = now;
    return false;
  }
  if (rejectAttempts >= 10) {
    return true;
  }
  return false;
};

const recordRejectAttempt = () => {
  const now = Date.now();
  if (now - rejectLastAttemptTime > 60000) {
    rejectAttempts = 1;
  } else {
    rejectAttempts++;
  }
  rejectLastAttemptTime = now;
};

const AdminAppointments = ({ initialFilter = null }) => {
  const { authorized, loading: authLoading, errorMessage: authError } = useAdminOnly();
  
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedCard, setExpandedCard] = useState(null);
  
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStatus, setSelectedStatus] = useState(initialFilter === 'completed' ? 'completed' : '');
  const [selectedCity, setSelectedCity] = useState('');
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  const [sortOrder, setSortOrder] = useState('newest');
  
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);
  const [totalItems, setTotalItems] = useState(0);
  const [allData, setAllData] = useState([]);
  
  const [cities, setCities] = useState([]);
  const [loadingCities, setLoadingCities] = useState(true);
  
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectReasonError, setRejectReasonError] = useState('');
  const [isRejecting, setIsRejecting] = useState(false);

  useEffect(() => {
    if (initialFilter === 'completed') {
      setSelectedStatus('completed');
      setCurrentPage(1);
    }
  }, [initialFilter]);

  const statusOptions = [
    { value: 'pending', label: 'Bekliyor', color: '#f59e0b' },
    { value: 'approved', label: 'Onaylandı', color: '#10b981' },
    { value: 'rejected', label: 'Reddedildi', color: '#ef4444' },
    { value: 'completed', label: 'Tamamlandı', color: '#3b82f6' },
    { value: 'expired', label: 'Süresi Doldu', color: '#6b7280' },
  ];

  useEffect(() => {
    const loadCities = async () => {
      try {
        const response = await fetch('/cities.json');
        const data = await response.json();
        setCities(Array.isArray(data.cities) ? data.cities : []);
      } catch (err) {
        if (isDevelopment) console.error('Şehirler yüklenirken hata:', err);
        setCities([]);
      } finally {
        setLoadingCities(false);
      }
    };
    loadCities();
  }, []);

  useEffect(() => {
    if (authorized) {
      loadAllAppointments();
    }
  }, [authorized]);

  useEffect(() => {
    if (authorized) {
      applyFiltersAndPagination();
    }
  }, [allData, searchTerm, selectedStatus, selectedCity, dateRange, sortOrder, currentPage, authorized]);

  const loadAllAppointments = async () => {
    try {
      setLoading(true);
      const q = query(collection(db, 'appointments'));
      const snapshot = await getDocs(q);
      
      const allAppointments = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdTime: doc.data().createdTime,
        date: doc.data().date,
        startHour: doc.data().startHour,
        endHour: doc.data().endHour,
      }));
      
      setAllData(allAppointments);
      setError(null);
    } catch (err) {
      if (isDevelopment) console.error('Randevular yüklenirken hata:', err);
      setError(err.message || 'Randevular yüklenirken bir hata oluştu');
    } finally {
      setLoading(false);
    }
  };

  const applyFiltersAndPagination = () => {
    let filtered = [...allData];
    
    if (selectedStatus) {
      filtered = filtered.filter(item => item.status === selectedStatus);
    }
    
    if (selectedCity) {
      filtered = filtered.filter(item => item.city === selectedCity);
    }
    
    if (searchTerm && searchTerm.trim()) {
      const sanitizedTerm = sanitizeSearchTerm(searchTerm);
      const term = sanitizedTerm.toLowerCase().trim();
      filtered = filtered.filter(item =>
        (item.client && item.client.toLowerCase().includes(term)) ||
        (item.expertName && item.expertName.toLowerCase().includes(term)) ||
        (item.email && item.email.toLowerCase().includes(term)) ||
        (item.phone && item.phone.includes(term))
      );
    }
    
    if (dateRange.start) {
      filtered = filtered.filter(item => item.date && item.date >= dateRange.start);
    }
    if (dateRange.end) {
      filtered = filtered.filter(item => item.date && item.date <= dateRange.end);
    }
    
    filtered.sort((a, b) => {
      const timeA = a.createdTime || 0;
      const timeB = b.createdTime || 0;
      return sortOrder === 'newest' ? timeB - timeA : timeA - timeB;
    });
    
    setTotalItems(filtered.length);
    const start = (currentPage - 1) * itemsPerPage;
    setAppointments(filtered.slice(start, start + itemsPerPage));
  };

  const showToast = (message, type) => {
    const toast = document.createElement('div');
    toast.className = `toast-notification ${type}`;
    toast.innerHTML = `<i class="fas ${type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle'}"></i> ${sanitizeText(message, 100)}`;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  };

  const handleRejectAppointment = async () => {
    if (isRejectRateLimited()) {
      setRejectReasonError('Çok fazla reddetme işlemi. Lütfen 1 dakika bekleyin.');
      return;
    }
    
    const cleanReason = rejectReason.trim();
    
    if (!cleanReason) {
      setRejectReasonError('Reddetme nedeni boş olamaz');
      recordRejectAttempt();
      return;
    }
    
    if (cleanReason.length < 3) {
      setRejectReasonError('Reddetme nedeni en az 3 karakter olmalıdır');
      recordRejectAttempt();
      return;
    }
    
    if (cleanReason.length > 500) {
      setRejectReasonError('Reddetme nedeni en fazla 500 karakter olabilir');
      recordRejectAttempt();
      return;
    }
    
    if (!selectedAppointment?.id) {
      showToast('تم اختيار موعد غير صالح.', 'error');
      setShowRejectModal(false);
      return;
    }
    
    setIsRejecting(true);
    
    try {
      const appointmentRef = doc(db, 'appointments', selectedAppointment.id);
      await updateDoc(appointmentRef, {
        status: 'rejected',
        rejectedAt: Date.now(),
        rejectedBy: 'admin',
        expertRejectNote: DOMPurify.sanitize(cleanReason.slice(0, 500)),
      });
      
      setAllData(prev => prev.map(item => 
        item.id === selectedAppointment.id 
          ? { ...item, status: 'rejected', expertRejectNote: cleanReason.slice(0, 500) }
          : item
      ));
      
      setShowRejectModal(false);
      setRejectReason('');
      setRejectReasonError('');
      rejectAttempts = 0;
      showToast('Talep reddedildi', 'success');
    } catch (error) {
      if (isDevelopment) console.error('Reddetme hatası:', error);
      showToast('Reddedilemedi: ' + (error.message || 'Bilinmeyen hata'), 'error');
    } finally {
      setIsRejecting(false);
    }
  };

  const getStatusBadge = (status) => {
    const option = statusOptions.find(s => s.value === status);
    if (!option) return <span className="status-badge">{sanitizeText(status || '-', 20)}</span>;
    return (
      <span className="status-badge" style={{ background: `${option.color}15`, color: option.color }}>
        {option.label}
      </span>
    );
  };

  const resetFilters = () => {
    setSearchTerm('');
    setSelectedStatus('');
    setSelectedCity('');
    setDateRange({ start: '', end: '' });
    setSortOrder('newest');
    setCurrentPage(1);
  };

  const totalPages = Math.ceil(totalItems / itemsPerPage);
  const toggleExpand = (id) => setExpandedCard(expandedCard === id ? null : id);

  if (authLoading) {
    return <LoadingSpinner text="Yetki kontrol ediliyor..." />;
  }

  if (loadingCities) {
    return <LoadingSpinner text="Şehirler yükleniyor..." />;
  }

  if (!authorized) {
    return (
      <div className="no-data">
        <i className="fas fa-shield-alt fa-3x"></i>
        <p>{authError || 'Bu sayfaya erişim yetkiniz yok.'}</p>
      </div>
    );
  }

  if (loading) {
    return <LoadingSpinner text="Randevular yükleniyor..." />;
  }

  return (
    <div className="admin-appointments">
      <div className="filter-bar">
        <div className="filter-row">
          <div className="search-wrapper">
            <input
              type="text"
              placeholder="Müşteri, uzman, email veya telefon ile ara..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value.slice(0, 100))}
              className="search-input"
              maxLength={100}
            />
          </div>
          <div className="filter-actions">
            <button className="apply-filters-btn" onClick={() => { setCurrentPage(1); applyFiltersAndPagination(); }}>
              <i className="fas fa-filter"></i> Filtrele
            </button>
            <button className="reset-filters-btn" onClick={resetFilters}>
              <i className="fas fa-sync-alt"></i> Sıfırla
            </button>
          </div>
        </div>

        <div className="filter-row">
          <select value={selectedStatus} onChange={(e) => setSelectedStatus(e.target.value)} className="filter-select">
            <option value="">Tüm Durumlar</option>
            {statusOptions.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>

          <select value={selectedCity} onChange={(e) => setSelectedCity(e.target.value)} className="filter-select">
            <option value="">Tüm Şehirler</option>
            {cities.map(city => (
              <option key={city.id} value={city.name}>{city.name}</option>
            ))}
          </select>

          <div className="date-range">
            <input
              type="date"
              placeholder="Başlangıç"
              value={dateRange.start}
              onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
              className="date-input"
            />
            <span>—</span>
            <input
              type="date"
              placeholder="Bitiş"
              value={dateRange.end}
              onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
              className="date-input"
            />
          </div>

          <div className="sort-section">
            <i className="fas fa-sort-amount-down"></i>
            <select value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} className="sort-select">
              <option value="newest">En Yeni</option>
              <option value="oldest">En Eski</option>
            </select>
          </div>
        </div>
      </div>

      <div className="results-info">
        <div className="results-count" title={`Toplam ${formatFullNumber(totalItems)} talep`}>
          <i className="fas fa-chart-line"></i> 
          <span>{formatLargeNumber(totalItems)}</span> talep
        </div>
      </div>

      {error ? (
        <div className="error-state">
          <i className="fas fa-exclamation-triangle"></i>
          <p>{sanitizeText(error, 200)}</p>
          <button onClick={loadAllAppointments} className="retry-btn">Tekrar Dene</button>
        </div>
      ) : appointments.length === 0 ? (
        <div className="no-data">
          <i className="fas fa-calendar-day"></i>
          <p>Henüz talep bulunmuyor.</p>
          {(searchTerm || selectedStatus || selectedCity || dateRange.start || dateRange.end) && (
            <button className="clear-filter-btn" onClick={resetFilters}>Filtreleri Temizle</button>
          )}
        </div>
      ) : (
        <div className="cards-list">
          {appointments.map(appointment => (
            <div key={appointment.id} className={`data-card ${expandedCard === appointment.id ? 'expanded' : ''}`}>
              <div className="card-header" onClick={() => toggleExpand(appointment.id)}>
                <div className="card-summary">
                  <div className="card-avatar">
                    {appointment.status === 'pending' ? '⏳' : 
                     appointment.status === 'approved' ? '✅' :
                     appointment.status === 'rejected' ? '❌' : 
                     appointment.status === 'expired' ? '⌛' : '📋'}
                  </div>
                  <div className="card-info">
                    <div className="card-title-row">
                      <h3>{sanitizeText(appointment.client || 'İsimsiz Müşteri', 50)}</h3>
                      {getStatusBadge(appointment.status)}
                    </div>
                    <div className="card-meta">
                      <span><i className="fas fa-user-cog"></i> {sanitizeText(appointment.expertName || 'Bilinmiyor', 50)}</span>
                      <span><i className="fas fa-calendar"></i> {safeFormatFullDateTime(appointment.date, appointment.startHour)}</span>
                      <span><i className="fas fa-map-marker-alt"></i> {sanitizeText(appointment.city || '-', 50)}</span>
                    </div>
                  </div>
                </div>
                <div className="card-actions">
                  {appointment.status === 'pending' && (
                    <button 
                      className="reject-btn" 
                      onClick={(e) => { e.stopPropagation(); setSelectedAppointment(appointment); setShowRejectModal(true); }}
                      title="Reddet"
                    >
                      <i className="fas fa-times-circle"></i>
                    </button>
                  )}
                  <div className="expand-icon">
                    <i className={`fas fa-chevron-${expandedCard === appointment.id ? 'up' : 'down'}`}></i>
                  </div>
                </div>
              </div>

              {expandedCard === appointment.id && (
                <div className="card-details">
                  <div className="detail-section">
                    <h4><i className="fas fa-user"></i> Müşteri</h4>
                    <div className="detail-grid">
                      <div className="detail-item">
                        <span className="detail-label">Ad Soyad:</span>
                        <span className="detail-value">{sanitizeText(appointment.client || '-', 100)}</span>
                      </div>
                      <div className="detail-item">
                        <span className="detail-label">E-posta:</span>
                        <span className="detail-value">{sanitizeText(appointment.email || '-', 100)}</span>
                      </div>
                      <div className="detail-item">
                        <span className="detail-label">Telefon:</span>
                        <span className="detail-value">{sanitizeText(appointment.phone || '-', 20)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="detail-section">
                    <h4><i className="fas fa-briefcase"></i> Uzman</h4>
                    <div className="detail-grid">
                      <div className="detail-item">
                        <span className="detail-label">Uzman Adı:</span>
                        <span className="detail-value">{sanitizeText(appointment.expertName || '-', 100)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="detail-section">
                    <h4><i className="fas fa-clock"></i> Randevu</h4>
                    <div className="detail-grid">
                      <div className="detail-item">
                        <span className="detail-label">Tarih:</span>
                        <span className="detail-value">{safeFormatDate(appointment.date)}</span>
                      </div>
                      <div className="detail-item">
                        <span className="detail-label">Başlangıç:</span>
                        <span className="detail-value">{safeFormatTime(appointment.startHour)}</span>
                      </div>
                      <div className="detail-item">
                        <span className="detail-label">Bitiş:</span>
                        <span className="detail-value">{safeFormatTime(appointment.endHour)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="detail-section">
                    <h4><i className="fas fa-map-marker-alt"></i> Adres</h4>
                    <div className="detail-grid">
                      <div className="detail-item full-width">
                        <span className="detail-label">Adres:</span>
                        <span className="detail-value">{sanitizeText(appointment.fullAddress || appointment.address || '-', 200)}</span>
                      </div>
                      <div className="detail-item">
                        <span className="detail-label">Şehir:</span>
                        <span className="detail-value">{sanitizeText(appointment.city || '-', 50)}</span>
                      </div>
                      <div className="detail-item">
                        <span className="detail-label">İlçe:</span>
                        <span className="detail-value">{sanitizeText(appointment.district || '-', 50)}</span>
                      </div>
                    </div>
                  </div>

                  {appointment.note && (
                    <div className="detail-section">
                      <h4><i className="fas fa-sticky-note"></i> Müşteri Notu</h4>
                      <div className="note-content">{sanitizeText(appointment.note, 500)}</div>
                    </div>
                  )}

                  {appointment.status === 'rejected' && appointment.expertRejectNote && (
                    <div className="detail-section rejected-note">
                      <h4><i className="fas fa-exclamation-triangle"></i> Reddedilme Nedeni</h4>
                      <div className="note-content">{sanitizeText(appointment.expertRejectNote, 500)}</div>
                    </div>
                  )}

                  {appointment.status === 'expired' && (
                    <div className="detail-section expired-note">
                      <h4><i className="fas fa-hourglass-end"></i> Randevu Süresi Doldu</h4>
                      <div className="note-content">Bu randevunun süresi dolmuştur. Randevu tarihi geçtiği için tamamlanamadı olarak işaretlenmiştir.</div>
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

      {showRejectModal && selectedAppointment && (
        <div className="modal-overlay" onClick={() => setShowRejectModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2><i className="fas fa-times-circle"></i> Talebi Reddet</h2>
              <button className="modal-close" onClick={() => setShowRejectModal(false)}>
                <i className="fas fa-times"></i>
              </button>
            </div>
            <div className="modal-body">
              <div className="appointment-info">
                <p><strong>Müşteri:</strong> {sanitizeText(selectedAppointment.client, 50)}</p>
                <p><strong>Uzman:</strong> {sanitizeText(selectedAppointment.expertName, 50)}</p>
                <p><strong>Tarih:</strong> {safeFormatFullDateTime(selectedAppointment.date, selectedAppointment.startHour)}</p>
              </div>
              <div className="form-group">
                <label>Reddetme Nedeni <span className="required">*</span></label>
                <textarea
                  value={rejectReason}
                  onChange={(e) => {
                    setRejectReason(e.target.value.slice(0, 500));
                    if (rejectReasonError) setRejectReasonError('');
                  }}
                  placeholder="Talebin neden reddedildiğini yazın..."
                  rows="4"
                  maxLength={500}
                />
                {rejectReasonError && <p className="error-text">{rejectReasonError}</p>}
                <small className="char-counter">{rejectReason.length}/500</small>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setShowRejectModal(false)}>Vazgeç</button>
              <button className="btn-reject" onClick={handleRejectAppointment} disabled={isRejecting}>
                {isRejecting ? <><i className="fas fa-spinner fa-spin"></i> Reddediliyor...</> : 'Reddet'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminAppointments;
