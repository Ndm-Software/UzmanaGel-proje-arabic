import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, limit, doc, updateDoc, addDoc, serverTimestamp, increment, getDoc } from 'firebase/firestore';
import { db } from '../../firebase/firebaseClient';
import DOMPurify from 'dompurify';
import { useAdminOnly } from '../../hooks/useAuthGuard';
import LoadingSpinner from '../../components/LoadingSpinner';
import '../../styles/admin/AdminTokenTransactions.css';

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

const formatLargeNumber = (num) => {
  const number = safeNumber(num);
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

const formatPrice = (amount) => {
  const num = safeNumber(amount);
  return num.toLocaleString('tr-TR', { 
    minimumFractionDigits: 2, 
    maximumFractionDigits: 2 
  }) + ' ₺';
};

let addTokenAttempts = 0;
let addTokenLastAttemptTime = 0;

const isAddTokenRateLimited = () => {
  const now = Date.now();
  if (now - addTokenLastAttemptTime > 60000) {
    addTokenAttempts = 0;
    addTokenLastAttemptTime = now;
    return false;
  }
  if (addTokenAttempts >= 20) {
    return true;
  }
  return false;
};

const recordAddTokenAttempt = () => {
  const now = Date.now();
  if (now - addTokenLastAttemptTime > 60000) {
    addTokenAttempts = 1;
  } else {
    addTokenAttempts++;
  }
  addTokenLastAttemptTime = now;
};

const showToast = (message, type) => {
  const toast = document.createElement('div');
  toast.className = `admin-toast ${type}`;
  toast.innerHTML = `<i class="fas ${type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle'}"></i> ${sanitizeText(message, 100)}`;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
};

const transactionTypes = {
  LOAD: { label: 'Jeton Yükleme', color: '#10b981', icon: 'fa-shopping-cart' },
  SPEND: { label: 'Jeton Harcama', color: '#f59e0b', icon: 'fa-arrow-right' },
  REFUND: { label: 'İade', color: '#8b5cf6', icon: 'fa-undo' },
  ADMIN_ADD: { label: 'Admin Ekleme', color: '#3b82f6', icon: 'fa-plus-circle' },
  ADMIN_REMOVE: { label: 'Admin Silme', color: '#ef4444', icon: 'fa-minus-circle' },
};

export default function AdminTokenTransactions() {
  const { authorized, loading: authLoading } = useAdminOnly();
  
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalTokensLoaded: 0,
    totalTokensSpent: 0,
    totalRevenue: 0,
  });
  
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedType, setSelectedType] = useState('');
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  const [sortOrder, setSortOrder] = useState('newest');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(20);
  const [totalItems, setTotalItems] = useState(0);
  
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [addAmount, setAddAmount] = useState('');
  const [addReason, setAddReason] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [providers, setProviders] = useState([]);
  const [userSearch, setUserSearch] = useState('');

  useEffect(() => {
    if (authorized) {
      loadProviders();
    }
  }, [authorized]);

  useEffect(() => {
    if (authorized && providers.length > 0) {
      loadTransactions();
      loadStats();
    }
  }, [authorized, providers, searchTerm, selectedType, dateRange, sortOrder, currentPage]);

  const loadTransactions = async () => {
    setLoading(true);
    try {
      let allTransactions = [];
      
      // providers map'i oluştur (id -> displayName)
      const providersMap = new Map();
      providers.forEach(provider => {
        providersMap.set(provider.id, provider.displayName || provider.businessName);
      });
      
      // 1. wallet_transactions koleksiyonundan LOAD işlemlerini al
      const walletTxSnapshot = await getDocs(collection(db, 'wallet_transactions'));
      
      walletTxSnapshot.docs.forEach(doc => {
        const data = doc.data();
        const providerUid = data.providerUid;
        const providerDisplayName = providersMap.get(providerUid) || providerUid || 'Bilinmiyor';
        
        allTransactions.push({
          id: doc.id,
          ...data,
          transactionType: 'LOAD',
          createdAt: data.createdAt?.toDate?.() || new Date(data.createdAt),
          processedAt: data.createdAt,
          amountPaid: data.amount || 0,
          providerDisplayName: providerDisplayName,
          userId: providerUid,
          referenceId: data.paymentId,
          transactionNote: data.description,
          tokensInTransaction: data.tokenAmount || 0,
        });
      });
      
      // 2. wallet_history koleksiyonundan SPEND ve REFUND işlemlerini al
      const historySnapshot = await getDocs(collection(db, 'wallet_history'));
      
      historySnapshot.docs.forEach(doc => {
        const data = doc.data();
        if (data.transactionType === 'SPEND') {
          allTransactions.push({
            id: doc.id,
            ...data,
            transactionType: 'SPEND',
            createdAt: data.processedAt?.toDate?.() || new Date(data.processedAt),
          });
        } else if (data.transactionType === 'REFUND') {
          allTransactions.push({
            id: doc.id,
            ...data,
            transactionType: 'REFUND',
            createdAt: data.processedAt?.toDate?.() || new Date(data.processedAt),
          });
        } else if (data.transactionType === 'ADMIN_ADD') {
          allTransactions.push({
            id: doc.id,
            ...data,
            transactionType: 'ADMIN_ADD',
            createdAt: data.processedAt?.toDate?.() || new Date(data.processedAt),
          });
        }
      });
      
      // Filtreleme
      if (selectedType) {
        allTransactions = allTransactions.filter(t => t.transactionType === selectedType);
      }
      
      if (searchTerm && searchTerm.trim()) {
        const sanitizedTerm = sanitizeSearchTerm(searchTerm);
        const term = sanitizedTerm.toLowerCase().trim();
        allTransactions = allTransactions.filter(t =>
          (t.providerDisplayName && t.providerDisplayName.toLowerCase().includes(term)) ||
          (t.userId && t.userId.toLowerCase().includes(term)) ||
          (t.transactionNote && t.transactionNote.toLowerCase().includes(term)) ||
          (t.referenceId && t.referenceId.toLowerCase().includes(term))
        );
      }
      
      if (dateRange.start) {
        allTransactions = allTransactions.filter(t => t.createdAt >= new Date(dateRange.start));
      }
      if (dateRange.end) {
        const endDate = new Date(dateRange.end);
        endDate.setHours(23, 59, 59);
        allTransactions = allTransactions.filter(t => t.createdAt <= endDate);
      }
      
      allTransactions.sort((a, b) => {
        const dateA = new Date(a.createdAt);
        const dateB = new Date(b.createdAt);
        return sortOrder === 'newest' ? dateB - dateA : dateA - dateB;
      });
      
      setTotalItems(allTransactions.length);
      const start = (currentPage - 1) * itemsPerPage;
      setTransactions(allTransactions.slice(start, start + itemsPerPage));
    } catch (error) {
      if (isDevelopment) console.error('İşlemler yüklenirken hata:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    try {
      let loaded = 0, spent = 0, revenue = 0;
      
      // wallet_transactions'dan LOAD istatistikleri
      const walletTxSnapshot = await getDocs(collection(db, 'wallet_transactions'));
      walletTxSnapshot.docs.forEach(doc => {
        const data = doc.data();
        const tokens = safeNumber(data.tokenAmount);
        const amount = safeNumber(data.amount);
        loaded += tokens;
        revenue += amount;
      });
      
      // wallet_history'dan SPEND istatistikleri
      const historySnapshot = await getDocs(collection(db, 'wallet_history'));
      historySnapshot.docs.forEach(doc => {
        const data = doc.data();
        if (data.transactionType === 'SPEND') {
          const tokens = Math.abs(safeNumber(data.tokensInTransaction));
          spent += tokens;
        }
      });
      
      setStats({
        totalTokensLoaded: loaded,
        totalTokensSpent: spent,
        totalRevenue: revenue,
      });
    } catch (error) {
      if (isDevelopment) console.error('İstatistikler yüklenirken hata:', error);
    }
  };

  const loadProviders = async () => {
    try {
      const snapshot = await getDocs(query(collection(db, 'service_providers'), limit(500)));
      const providersList = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        displayName: sanitizeText(doc.data().displayName || doc.data().businessName, 50),
        email: sanitizeText(doc.data().email, 50),
        businessName: sanitizeText(doc.data().businessName, 50),
      }));
      setProviders(providersList);
    } catch (error) {
      if (isDevelopment) console.error('Uzmanlar yüklenirken hata:', error);
    }
  };

  const handleAddTokens = async () => {
    if (isAddTokenRateLimited()) {
      showToast('Çok fazla işlem. Lütfen 1 dakika bekleyin.', 'error');
      return;
    }
    
    const amount = parseInt(addAmount);
    if (!selectedUser || !amount || amount <= 0) {
      showToast('Lütfen geçerli bir uzman ve miktar girin', 'error');
      recordAddTokenAttempt();
      return;
    }
    
    if (amount > 1000000) {
      showToast('Maksimum jeton miktarı 1.000.000\'dir.', 'error');
      recordAddTokenAttempt();
      return;
    }
    
    const cleanReason = addReason.trim();
    if (!cleanReason) {
      showToast('Lütfen işlem nedeni girin', 'error');
      recordAddTokenAttempt();
      return;
    }
    if (cleanReason.length < 3) {
      showToast('İşlem nedeni en az 3 karakter olmalıdır', 'error');
      recordAddTokenAttempt();
      return;
    }
    if (cleanReason.length > 200) {
      showToast('İşlem nedeni en fazla 200 karakter olabilir', 'error');
      recordAddTokenAttempt();
      return;
    }
    
    setIsProcessing(true);
    try {
      const providerRef = doc(db, 'service_providers', selectedUser.id);
      const providerSnap = await getDoc(providerRef);
      
      if (!providerSnap.exists()) {
        showToast('Uzman bulunamadı!', 'error');
        return;
      }
      
      const providerData = providerSnap.data();
      const currentTokenCount = safeNumber(providerData.currentTokenCount);
      const currentSpent = safeNumber(providerData.lifetimeTotalSpend);
      
      await addDoc(collection(db, 'wallet_history'), {
        amountPaid: 0,
        cardLastFour: null,
        cardOwner: null,
        previousTokens: currentTokenCount,
        previousTotalSpent: currentSpent,
        processedAt: serverTimestamp(),
        providerDisplayName: sanitizeText(selectedUser.displayName || selectedUser.businessName, 100),
        referenceId: `ADMIN_ADD_${Date.now()}`,
        targetCustomerId: selectedUser.id,
        tokensInTransaction: amount,
        transactionNote: DOMPurify.sanitize(cleanReason),
        transactionType: 'ADMIN_ADD',
        updatedTokens: currentTokenCount + amount,
        updatedTokenSpent: currentSpent,
        userId: selectedUser.id,
      });
      
      await updateDoc(providerRef, {
        lifetimeTotalTokens: increment(amount),
        currentTokenCount: increment(amount),
        updatedAt: serverTimestamp(),
      });
      
      addTokenAttempts = 0;
      setShowAddModal(false);
      setSelectedUser(null);
      setAddAmount('');
      setAddReason('');
      loadTransactions();
      loadStats();
      showToast(`${amount} jeton başarıyla eklendi!`, 'success');
    } catch (error) {
      if (isDevelopment) console.error('Jeton eklenirken hata:', error);
      showToast('Jeton eklenirken hata oluştu', 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const getTypeBadge = (type) => {
    const t = transactionTypes[type] || { label: type, color: '#6b7280', icon: 'fa-question' };
    return (
      <span className={`type-badge ${type?.toLowerCase()}`}>
        <i className={`fas ${t.icon}`}></i> {t.label}
      </span>
    );
  };

  const totalPages = Math.ceil(totalItems / itemsPerPage);
  
  if (authLoading) return <LoadingSpinner text="Yetki kontrol ediliyor..." />;
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

  const handleTypeChange = (e) => {
    setSelectedType(e.target.value);
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

  const filteredProviders = providers.filter(provider =>
    provider.displayName?.toLowerCase().includes(userSearch.toLowerCase()) ||
    provider.businessName?.toLowerCase().includes(userSearch.toLowerCase()) ||
    provider.email?.toLowerCase().includes(userSearch.toLowerCase())
  );

  const currentSystemBalance = stats.totalTokensLoaded - stats.totalTokensSpent;

  return (
    <div className="admin-token-transactions">
      <div className="token-stats-grid">
        <div className="token-stat-card" title={`Tam değer: ${formatFullNumber(stats.totalTokensLoaded)} jeton`}>
          <div className="token-stat-icon"><i className="fas fa-coins"></i></div>
          <div className="token-stat-info">
            <h3>{formatLargeNumber(stats.totalTokensLoaded)}</h3>
            <p>Toplam Yüklenen Jeton</p>
          </div>
        </div>
        
        <div className="token-stat-card" title={`Tam değer: ${formatFullNumber(stats.totalTokensSpent)} jeton`}>
          <div className="token-stat-icon"><i className="fas fa-chart-line"></i></div>
          <div className="token-stat-info">
            <h3>{formatLargeNumber(stats.totalTokensSpent)}</h3>
            <p>Toplam Harcanan Jeton</p>
          </div>
        </div>
        
        <div className="token-stat-card" title={`Tam değer: ${formatFullNumber(currentSystemBalance)} jeton`}>
          <div className="token-stat-icon"><i className="fas fa-wallet"></i></div>
          <div className="token-stat-info">
            <h3>{formatLargeNumber(currentSystemBalance)}</h3>
            <p>Mevcut Sistem Bakiyesi</p>
          </div>
        </div>
        
        <div className="token-stat-card" title={`Tam değer: ${formatFullNumber(stats.totalRevenue)} ₺`}>
          <div className="token-stat-icon"><i className="fas fa-lira-sign"></i></div>
          <div className="token-stat-info">
            <h3>{formatLargePrice(stats.totalRevenue)}</h3>
            <p>Toplam Gelir</p>
          </div>
        </div>
      </div>

      <div className="token-action-bar">
        <button className="btn-add-token" onClick={() => setShowAddModal(true)} disabled={isProcessing}>
          <i className="fas fa-plus-circle"></i> Jeton Ekle
        </button>
      </div>

      <div className="token-filter-bar">
        <div className="filter-row">
          <div className="search-wrapper">
            <input
              type="text"
              placeholder="Uzman adı, ID veya işlem notu ile ara..."
              value={searchTerm}
              onChange={handleSearchChange}
              className="search-input"
              maxLength={100}
            />
          </div>
          
          <select value={selectedType} onChange={handleTypeChange} className="filter-select">
            <option value="">Tüm İşlem Tipleri</option>
            <option value="LOAD">Jeton Yükleme</option>
            <option value="SPEND">Jeton Harcama</option>
            <option value="REFUND">İade</option>
            <option value="ADMIN_ADD">Admin Ekleme</option>
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
        <span>Jeton yükleme işlemleri "wallet_transactions" koleksiyonundan, harcama işlemleri "wallet_history" koleksiyonundan listelenmektedir.</span>
      </div>

      {loading ? (
        <LoadingSpinner text="İşlemler yükleniyor..." />
      ) : transactions.length === 0 ? (
        <div className="no-data">
          <i className="fas fa-exchange-alt fa-3x"></i>
          <p>Henüz jeton işlemi bulunmuyor.</p>
        </div>
      ) : (
        <div className="transactions-table-wrapper">
          <table className="transactions-table">
            <thead>
              <tr>
                <th>Tarih</th>
                <th>Uzman</th>
                <th>İşlem Tipi</th>
                <th>Jeton Miktarı</th>
                <th>Ödeme Tutarı</th>
                <th>İşlem Notu</th>
                <th>Referans ID</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((transaction) => (
                <tr key={transaction.id}>
                  <td>{formatDate(transaction.processedAt || transaction.createdAt)}</td>
                  <td>
                    <div className="user-info-cell">
                      <strong>{sanitizeText(transaction.providerDisplayName, 30) || sanitizeText(transaction.userId, 30)}</strong>
                      <small>{sanitizeText(transaction.userId || transaction.providerUid, 40)}</small>
                    </div>
                  </td>
                  <td>{getTypeBadge(transaction.transactionType)}</td>
                  <td className={transaction.transactionType === 'LOAD' || transaction.transactionType === 'ADMIN_ADD' ? 'positive' : 'negative'}>
                    {transaction.transactionType === 'LOAD' || transaction.transactionType === 'ADMIN_ADD' ? '+' : '-'}
                    {Math.abs(safeNumber(transaction.tokensInTransaction || transaction.tokenAmount)).toLocaleString('tr-TR')} jeton
                   </td>
                  <td>{formatPrice(Math.abs(transaction.amountPaid || transaction.amount))}</td>
                  <td className="reason-cell">{sanitizeText(transaction.transactionNote || transaction.description, 80)}</td>
                  <td><code className="ref-id">{sanitizeText(transaction.referenceId || transaction.paymentId, 40)}</code></td>
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

      {showAddModal && (
        <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2><i className="fas fa-plus-circle"></i> Jeton Ekle</h2>
              <button className="modal-close" onClick={() => setShowAddModal(false)}>
                <i className="fas fa-times"></i>
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>Uzman Seç <span className="required">*</span></label>
                <input
                  type="text"
                  placeholder="Uzman ara..."
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value.slice(0, 100))}
                  className="form-input"
                  maxLength={100}
                />
                <div className="user-list">
                  {filteredProviders.slice(0, 10).map(provider => (
                    <div
                      key={provider.id}
                      className={`user-item ${selectedUser?.id === provider.id ? 'selected' : ''}`}
                      onClick={() => setSelectedUser(provider)}
                    >
                      <div className="user-avatar">
                        {sanitizeText((provider.displayName || provider.businessName || '?').charAt(0).toUpperCase(), 1)}
                      </div>
                      <div className="user-details">
                        <strong>{sanitizeText(provider.displayName || provider.businessName, 50)}</strong>
                        <small>{sanitizeText(provider.email, 50)}</small>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              
              <div className="form-group">
                <label>Jeton Miktarı <span className="required">*</span></label>
                <input
                  type="number"
                  value={addAmount}
                  onChange={(e) => setAddAmount(e.target.value.slice(0, 10))}
                  placeholder="Örn: 100"
                  className="form-input"
                  min="1"
                  max="1000000"
                />
                <small className="form-hint">Maksimum 1.000.000 jeton eklenebilir.</small>
              </div>
              
              <div className="form-group">
                <label>İşlem Nedeni <span className="required">*</span></label>
                <textarea
                  value={addReason}
                  onChange={(e) => setAddReason(e.target.value.slice(0, 200))}
                  placeholder="Jeton ekleme nedeni..."
                  rows="3"
                  className="form-textarea"
                  maxLength={200}
                />
                <small className="char-counter">{addReason.length}/200</small>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setShowAddModal(false)}>İptal</button>
              <button className="btn-primary" onClick={handleAddTokens} disabled={isProcessing}>
                {isProcessing ? <><i className="fas fa-spinner fa-spin"></i> Ekleniyor...</> : 'Jeton Ekle'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}