import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, limit, addDoc, serverTimestamp, increment, doc, updateDoc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase/firebaseClient';
import DOMPurify from 'dompurify';
import { useAdminOnly } from '../../hooks/useAuthGuard';
import LoadingSpinner from '../../components/LoadingSpinner';
import '../../styles/admin/AdminPaymentReports.css';

const isDevelopment = process.env.NODE_ENV === 'development';

const sanitizeText = (text, maxLength = 100) => {
  if (!text) return '-';
  const sanitized = DOMPurify.sanitize(String(text));
  return sanitized.length > maxLength ? sanitized.slice(0, maxLength) + '...' : sanitized;
};

const safeNumber = (value, defaultValue = 0) => {
  const num = Number(value);
  return isNaN(num) ? defaultValue : num;
};

const sanitizeSearchTerm = (term) => {
  if (!term) return '';
  return String(term).replace(/[.*+?^${}()|[\]\\]/g, '').slice(0, 100);
};

const formatDate = (timestamp) => {
  if (!timestamp) return '-';
  try {
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    if (isNaN(date.getTime())) return '-';
    return date.toLocaleString('tr-TR');
  } catch {
    return '-';
  }
};

const formatLargePrice = (amount) => {
  const number = safeNumber(amount);
  const absNumber = Math.abs(number);
  const sign = number < 0 ? '-' : '';
  const absValue = absNumber;
  
  if (absValue >= 1000000000) {
    return sign + (absValue / 1000000000).toFixed(1).replace(/\.0$/, '') + ' Milyar ₺';
  }
  if (absValue >= 1000000) {
    return sign + (absValue / 1000000).toFixed(1).replace(/\.0$/, '') + ' Milyon ₺';
  }
  if (absValue >= 1000) {
    return sign + (absValue / 1000).toFixed(1).replace(/\.0$/, '') + ' Bin ₺';
  }
  return sign + absValue.toLocaleString('tr-TR') + ' ₺';
};

const formatFullNumber = (num) => {
  const number = safeNumber(num);
  return number.toLocaleString('tr-TR');
};

const formatPrice = (amount) => {
  const num = safeNumber(amount);
  return num.toLocaleString('tr-TR', { 
    minimumFractionDigits: 2, 
    maximumFractionDigits: 2 
  }) + ' ₺';
};

let refundAttempts = 0;
let refundLastAttemptTime = 0;

const isRefundRateLimited = () => {
  const now = Date.now();
  if (now - refundLastAttemptTime > 60000) {
    refundAttempts = 0;
    refundLastAttemptTime = now;
    return false;
  }
  if (refundAttempts >= 10) {
    return true;
  }
  return false;
};

const recordRefundAttempt = () => {
  const now = Date.now();
  if (now - refundLastAttemptTime > 60000) {
    refundAttempts = 1;
  } else {
    refundAttempts++;
  }
  refundLastAttemptTime = now;
};

const showToast = (message, type) => {
  const toast = document.createElement('div');
  toast.className = `admin-toast ${type}`;
  toast.innerHTML = `<i class="fas ${type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle'}"></i> ${sanitizeText(message, 100)}`;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
};

const paymentStatuses = {
  PAID: { label: 'Başarılı', color: '#10b981', icon: 'fa-check-circle' },
  PENDING: { label: 'Bekliyor', color: '#f59e0b', icon: 'fa-clock' },
  FAILED: { label: 'Başarısız', color: '#ef4444', icon: 'fa-times-circle' },
  CANCELLED: { label: 'İptal Edildi', color: '#6b7280', icon: 'fa-ban' },
  EXPIRED: { label: 'Süresi Doldu', color: '#6b7280', icon: 'fa-hourglass-end' },
  REFUND: { label: 'İade Edildi', color: '#8b5cf6', icon: 'fa-undo' },
};

export default function AdminPaymentReports() {
  const { authorized, loading: authLoading } = useAdminOnly();
  
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalRevenue: 0,
    totalRefunded: 0,
    netRevenue: 0,
    totalTransactions: 0,
    totalPaid: 0,
    totalPending: 0,
    totalFailed: 0,
  });
  
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  const [sortOrder, setSortOrder] = useState('newest');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(20);
  const [totalItems, setTotalItems] = useState(0);
  
  const [showRefundModal, setShowRefundModal] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState(null);
  const [refundReason, setRefundReason] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    if (authorized) {
      loadPayments();
      loadStats();
    }
  }, [authorized]);

  useEffect(() => {
    loadPayments();
  }, [searchTerm, selectedStatus, dateRange, sortOrder, currentPage]);

  // Uzman bilgilerini almak için yardımcı fonksiyon
  const getProviderDisplayName = async (providerUid) => {
    if (!providerUid) return 'Belirsiz Uzman';
    try {
      const providerRef = doc(db, 'service_providers', providerUid);
      const providerSnap = await getDoc(providerRef);
      if (providerSnap.exists()) {
        const data = providerSnap.data();
        return sanitizeText(data.displayName || data.businessName, 50);
      }
      return 'Belirsiz Uzman';
    } catch (error) {
      return 'Belirsiz Uzman';
    }
  };

  const loadPayments = async () => {
    setLoading(true);
    try {
      let allPayments = [];
      
      // payments koleksiyonundan tüm ödemeleri al (orderBy ve where birlikte kullanma - index gerekir)
      const paymentsSnapshot = await getDocs(collection(db, 'payments'));
      
      // Her payment için provider bilgisini al
      for (const docSnap of paymentsSnapshot.docs) {
        const data = docSnap.data();
        let status = data.status || 'PENDING';
        
        // providerDisplayName'i al
        let providerDisplayName = data.providerDisplayName;
        if (!providerDisplayName && data.providerUid) {
          providerDisplayName = await getProviderDisplayName(data.providerUid);
        }
        
        allPayments.push({
          id: docSnap.id,
          ...data,
          status: status,
          createdAt: data.createdAt?.toDate?.() || new Date(data.createdAt),
          providerDisplayName: providerDisplayName || 'Belirsiz Uzman',
          amountPaid: data.totalPrice || data.amountPaid || 0,
          referenceId: data.conversationId || data.referenceId || docSnap.id,
          tokensInTransaction: data.tokenAmount || 0,
          cardLastFour: data.iyzicoCallbackResult?.lastFourDigits || null,
          cardOwner: null,
          userId: data.providerUid,
        });
      }
      
      // İade işlemlerini wallet_history'den al (REFUND) - sadece getDocs kullan
      const refundSnapshot = await getDocs(collection(db, 'wallet_history'));
      
      refundSnapshot.docs.forEach(doc => {
        const data = doc.data();
        if (data.transactionType === 'REFUND') {
          allPayments.push({
            id: doc.id,
            ...data,
            status: 'REFUND',
            createdAt: data.processedAt?.toDate?.() || new Date(data.processedAt),
            amountPaid: Math.abs(data.amountPaid || 0),
          });
        }
      });
      
      // Filtreleme
      if (selectedStatus) {
        allPayments = allPayments.filter(p => p.status === selectedStatus);
      }
      
      if (searchTerm && searchTerm.trim()) {
        const sanitizedTerm = sanitizeSearchTerm(searchTerm);
        const term = sanitizedTerm.toLowerCase().trim();
        allPayments = allPayments.filter(p =>
          (p.providerDisplayName && p.providerDisplayName.toLowerCase().includes(term)) ||
          (p.userId && p.userId.toLowerCase().includes(term)) ||
          (p.referenceId && p.referenceId.toLowerCase().includes(term)) ||
          (p.transactionNote && p.transactionNote.toLowerCase().includes(term))
        );
      }
      
      if (dateRange.start) {
        allPayments = allPayments.filter(p => p.createdAt >= new Date(dateRange.start));
      }
      if (dateRange.end) {
        const endDate = new Date(dateRange.end);
        endDate.setHours(23, 59, 59);
        allPayments = allPayments.filter(p => p.createdAt <= endDate);
      }
      
      allPayments.sort((a, b) => {
        const dateA = new Date(a.createdAt);
        const dateB = new Date(b.createdAt);
        return sortOrder === 'newest' ? dateB - dateA : dateA - dateB;
      });
      
      setTotalItems(allPayments.length);
      const start = (currentPage - 1) * itemsPerPage;
      setPayments(allPayments.slice(start, start + itemsPerPage));
    } catch (error) {
      if (isDevelopment) console.error('Ödemeler yüklenirken hata:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    try {
      // payments koleksiyonundan istatistikler
      const paymentsSnapshot = await getDocs(collection(db, 'payments'));
      let totalRevenue = 0;
      let totalPaid = 0;
      let totalPending = 0;
      let totalFailed = 0;
      
      paymentsSnapshot.docs.forEach(doc => {
        const data = doc.data();
        const amount = safeNumber(data.totalPrice || data.amountPaid);
        const status = data.status;
        
        if (status === 'PAID') {
          totalRevenue += amount;
          totalPaid++;
        } else if (status === 'PENDING') {
          totalPending++;
        } else if (status === 'FAILED' || status === 'CANCELLED' || status === 'EXPIRED') {
          totalFailed++;
        }
      });
      
      // wallet_history'den iade istatistikleri
      const historySnapshot = await getDocs(collection(db, 'wallet_history'));
      let totalRefunded = 0;
      
      historySnapshot.docs.forEach(doc => {
        const data = doc.data();
        if (data.transactionType === 'REFUND') {
          totalRefunded += Math.abs(safeNumber(data.amountPaid));
        }
      });
      
      setStats({
        totalRevenue: totalRevenue,
        totalRefunded: totalRefunded,
        netRevenue: totalRevenue - totalRefunded,
        totalTransactions: paymentsSnapshot.size,
        totalPaid,
        totalPending,
        totalFailed,
      });
    } catch (error) {
      if (isDevelopment) console.error('İstatistikler yüklenirken hata:', error);
    }
  };

  const handleRefund = async () => {
    if (isRefundRateLimited()) {
      showToast('Çok fazla iade işlemi. Lütfen 1 dakika bekleyin.', 'error');
      return;
    }
    
    const cleanReason = refundReason.trim();
    
    if (!cleanReason) {
      showToast('Lütfen iade nedeni girin', 'error');
      recordRefundAttempt();
      return;
    }
    if (cleanReason.length < 3) {
      showToast('İade nedeni en az 3 karakter olmalıdır', 'error');
      recordRefundAttempt();
      return;
    }
    if (cleanReason.length > 200) {
      showToast('İade nedeni en fazla 200 karakter olabilir', 'error');
      recordRefundAttempt();
      return;
    }
    
    const providerId = selectedPayment?.userId || selectedPayment?.providerUid || selectedPayment?.targetCustomerId;
    
    if (!providerId) {
      showToast('İade yapılamadı: Kullanıcı bilgisi bulunamadı.', 'error');
      return;
    }
    
    setIsProcessing(true);
    try {
      const providerRef = doc(db, 'service_providers', providerId);
      const providerSnap = await getDoc(providerRef);
      
      if (!providerSnap.exists()) {
        showToast('İade yapılamadı: Uzman bulunamadı.', 'error');
        return;
      }
      
      const providerData = providerSnap.data();
      const currentTokenCount = safeNumber(providerData.currentTokenCount);
      const currentSpent = safeNumber(providerData.lifetimeTotalSpend);
      
      const refundAmount = safeNumber(selectedPayment.tokenAmount || selectedPayment.tokensInTransaction);
      const refundPrice = safeNumber(selectedPayment.amountPaid || selectedPayment.totalPrice);
      
      await addDoc(collection(db, 'wallet_history'), {
        amountPaid: -Math.abs(refundPrice),
        cardLastFour: selectedPayment.cardLastFour || null,
        cardOwner: selectedPayment.cardOwner || null,
        previousTokens: currentTokenCount,
        previousTotalSpent: currentSpent,
        processedAt: serverTimestamp(),
        providerDisplayName: sanitizeText(selectedPayment.providerDisplayName, 100),
        referenceId: `REFUND_${selectedPayment.referenceId || Date.now()}`,
        targetCustomerId: providerId,
        tokensInTransaction: -refundAmount,
        transactionNote: DOMPurify.sanitize(cleanReason),
        transactionType: 'REFUND',
        updatedTokens: currentTokenCount - refundAmount,
        updatedTokenSpent: currentSpent,
        userId: providerId,
      });
      
      await updateDoc(providerRef, {
        currentTokenCount: increment(-refundAmount),
        lifetimeTotalTokens: increment(-refundAmount),
        updatedAt: serverTimestamp(),
      });
      
      // Ödemenin durumunu güncelle
      if (selectedPayment.id && !selectedPayment._collection) {
        const paymentRef = doc(db, 'payments', selectedPayment.id);
        await updateDoc(paymentRef, {
          status: 'REFUNDED',
          refundedAt: serverTimestamp(),
          refundReason: DOMPurify.sanitize(cleanReason),
          updatedAt: serverTimestamp(),
        });
      }
      
      refundAttempts = 0;
      setShowRefundModal(false);
      setSelectedPayment(null);
      setRefundReason('');
      loadPayments();
      loadStats();
      showToast('İade başarıyla işleme alındı!', 'success');
    } catch (error) {
      if (isDevelopment) console.error('İade işlemi hatası:', error);
      showToast('İade işlemi sırasında hata oluştu', 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const getStatusBadge = (status) => {
    const s = paymentStatuses[status] || { label: status, color: '#6b7280', icon: 'fa-question' };
    return (
      <span className={`payment-status-badge ${status?.toLowerCase()}`}>
        <i className={`fas ${s.icon}`}></i> {s.label}
      </span>
    );
  };

  const getPaymentMethod = (payment) => {
    if (payment.cardLastFour) {
      return `Kredi Kartı (****${sanitizeText(payment.cardLastFour, 4)})`;
    }
    return 'Kredi Kartı';
  };

  const totalPages = Math.ceil(totalItems / itemsPerPage);
  
  if (authLoading) return <LoadingSpinner text="Yetki  يتم فحصها..." />;
  if (!authorized) {
    return (
      <div className="no-data">
        <i className="fas fa-shield-alt fa-3x"></i>
        <p>Bu sayfaya erişim yetkiniz yok. Sadece adminler erişebilir.</p>
      </div>
    );
  }

  const handleSearchChange = (e) => {
    setSearchTerm(e.target.value.slice(0, 100));
    setCurrentPage(1);
  };

  const handleDateChange = (type, value) => {
    setDateRange(prev => ({ ...prev, [type]: value }));
    setCurrentPage(1);
  };

  const handleStatusChange = (e) => {
    setSelectedStatus(e.target.value);
    setCurrentPage(1);
  };

  const handleSortChange = (e) => {
    setSortOrder(e.target.value);
    setCurrentPage(1);
  };

  return (
    <div className="admin-payment-reports">
      <div className="payment-stats-grid">
        <div className="payment-stat-card" title={`Tam değer: ${formatFullNumber(stats.totalRevenue)} ₺`}>
          <div className="payment-stat-icon success"><i className="fas fa-check-circle"></i></div>
          <div className="payment-stat-info">
            <h3>{formatLargePrice(stats.totalRevenue)}</h3>
            <p>Başarılı Ödemeler</p>
            <small>{stats.totalPaid} işlem</small>
          </div>
        </div>
        
        <div className="payment-stat-card" title={`Tam değer: ${formatFullNumber(stats.totalRefunded)} ₺`}>
          <div className="payment-stat-icon refunded"><i className="fas fa-undo"></i></div>
          <div className="payment-stat-info">
            <h3>{formatLargePrice(stats.totalRefunded)}</h3>
            <p>İade Edilenler</p>
          </div>
        </div>
        
        <div className="payment-stat-card" title={`Tam değer: ${formatFullNumber(stats.netRevenue)} ₺`}>
          <div className="payment-stat-icon net"><i className="fas fa-chart-line"></i></div>
          <div className="payment-stat-info">
            <h3>{formatLargePrice(stats.netRevenue)}</h3>
            <p>Net Gelir</p>
          </div>
        </div>
        
        <div className="payment-stat-card">
          <div className="payment-stat-icon rate"><i className="fas fa-receipt"></i></div>
          <div className="payment-stat-info">
            <h3>{stats.totalTransactions.toLocaleString('tr-TR')}</h3>
            <p>Toplam İşlem</p>
          </div>
        </div>
      </div>

      <div className="payment-filter-bar">
        <div className="filter-row">
          <div className="search-wrapper">
            <input
              type="text"
              placeholder="Uzman adı, ID veya işlem referansı ile ara..."
              value={searchTerm}
              onChange={handleSearchChange}
              className="search-input"
              maxLength={100}
            />
          </div>
          
          <select value={selectedStatus} onChange={handleStatusChange} className="filter-select">
            <option value="">Tüm Durumlar</option>
            <option value="PAID">Başarılı</option>
            <option value="REFUND">İade Edilen</option>
            <option value="PENDING">Bekleyen</option>
            <option value="FAILED">Başarısız</option>
            <option value="CANCELLED">İptal Edilen</option>
            <option value="EXPIRED">Süresi Dolan</option>
          </select>

          <div className="date-range">
            <input
              type="date"
              placeholder="Başlangıç"
              value={dateRange.start}
              onChange={(e) => handleDateChange('start', e.target.value)}
              className="date-input"
            />
            <span>—</span>
            <input
              type="date"
              placeholder="Bitiş"
              value={dateRange.end}
              onChange={(e) => handleDateChange('end', e.target.value)}
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
        <span>Ödeme işlemleri "payments" koleksiyonundan, iade işlemleri "wallet_history" koleksiyonundan listelenmektedir.</span>
      </div>

      {loading ? (
        <LoadingSpinner text="Ödemeler yükleniyor..." />
      ) : payments.length === 0 ? (
        <div className="no-data">
          <i className="fas fa-credit-card fa-3x"></i>
          <p>Henüz ödeme kaydı bulunmuyor.</p>
        </div>
      ) : (
        <div className="payments-table-wrapper">
          <table className="payments-table">
            <thead>
              <tr>
                <th>Tarih</th>
                <th>Uzman</th>
                <th>İşlem ID</th>
                <th>Tutar</th>
                <th>Jeton</th>
                <th>Ödeme Yöntemi</th>
                <th>Durum</th>
                <th>İşlemler</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((payment) => (
                <tr key={payment.id}>
                  <td>{formatDate(payment.createdAt || payment.processedAt)}</td>
                  <td>
                    <div className="user-info-cell">
                      <strong>{sanitizeText(payment.providerDisplayName, 30)}</strong>
                      <small>{sanitizeText(payment.userId || payment.providerUid, 40)}</small>
                    </div>
                  </td>
                  <td>
                    <code className="transaction-id">{sanitizeText(payment.referenceId || payment.conversationId, 30)}</code>
                  </td>
                  <td className="amount">{formatPrice(payment.amountPaid || payment.totalPrice)}</td>
                  <td>{safeNumber(payment.tokenAmount || payment.tokensInTransaction).toLocaleString('tr-TR')} jeton</td>
                  <td>{getPaymentMethod(payment)}</td>
                  <td>{getStatusBadge(payment.status)}</td>
                  <td>
                    {(payment.status === 'PAID') && (
                      <button
                        className="btn-refund disabled"
                        onClick={() => {
                          showToast('İade işlemleri şu anda devre dışıdır.', 'info');
                        }}
                        title="İade işlemleri devre dışı"
                        disabled={true}
                        style={{ opacity: 0.5, cursor: 'not-allowed' }}
                      >
                        <i className="fas fa-undo"></i> İade
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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

      {showRefundModal && selectedPayment && (
        <div className="modal-overlay" onClick={() => setShowRefundModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2><i className="fas fa-undo"></i> Ödemeyi İade Et</h2>
              <button className="modal-close" onClick={() => setShowRefundModal(false)}>
                <i className="fas fa-times"></i>
              </button>
            </div>
            <div className="modal-body">
              <div className="payment-info">
                <p><strong>Uzman:</strong> {sanitizeText(selectedPayment.providerDisplayName, 50)}</p>
                <p><strong>İşlem ID:</strong> {sanitizeText(selectedPayment.referenceId || selectedPayment.conversationId, 50)}</p>
                <p><strong>İade Tutarı:</strong> {formatPrice(selectedPayment.amountPaid || selectedPayment.totalPrice)}</p>
                <p><strong>Jeton Miktarı:</strong> {safeNumber(selectedPayment.tokenAmount || selectedPayment.tokensInTransaction).toLocaleString('tr-TR')} jeton</p>
              </div>
              
              <div className="form-group">
                <label>İade Nedeni <span className="required">*</span></label>
                <textarea
                  value={refundReason}
                  onChange={(e) => setRefundReason(e.target.value.slice(0, 200))}
                  placeholder="İade nedeni..."
                  rows="3"
                  className="form-textarea"
                  maxLength={200}
                />
                <small className="char-counter">{refundReason.length}/200</small>
              </div>
              
              <div className="warning-box">
                <i className="fas fa-exclamation-triangle"></i>
                <span>Bu işlem geri alınamaz. İade yapıldığında uzmanın jeton bakiyesi düşürülecektir.</span>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setShowRefundModal(false)}>İptal</button>
              <button className="btn-refund" onClick={handleRefund} disabled={isProcessing}>
                {isProcessing ? <><i className="fas fa-spinner fa-spin"></i> İşleniyor...</> : 'İade Et'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}