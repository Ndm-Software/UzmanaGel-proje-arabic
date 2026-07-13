import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { collection, query, where, getDocs, doc, updateDoc, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase/firebaseClient';
import DOMPurify from 'dompurify';
import { useAdminOnly } from '../../hooks/useAuthGuard';
import LoadingSpinner from '../../components/LoadingSpinner';
import '../../styles/admin/AdminListings.css';

const isDevelopment = process.env.NODE_ENV === 'development';

const sanitizeText = (text, maxLength = 200) => {
  if (!text) return '-';
  const sanitized = DOMPurify.sanitize(String(text));
  return sanitized.length > maxLength ? sanitized.slice(0, maxLength) + '...' : sanitized;
};

const safeNumber = (value, defaultValue = 0) => {
  const num = Number(value);
  return isNaN(num) ? defaultValue : num;
};

// NoSQL Injection koruması için search term temizleme
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
    return sign + (absValue / 1000000000).toFixed(1).replace(/\.0$/, '') + ' مليار';
  }
  if (absValue >= 1000000) {
    return sign + (absValue / 1000000).toFixed(1).replace(/\.0$/, '') + ' مليون';
  }
  if (absValue >= 1000) {
    return sign + (absValue / 1000).toFixed(1).replace(/\.0$/, '') + ' ألف';
  }
  return sign + absValue.toLocaleString('ar-SY');
};

const formatFullNumber = (num) => {
  const number = safeNumber(num);
  return number.toLocaleString('ar-SY');
};

// Rate limiting için değişkenler
let actionAttempts = 0;
let actionLastAttemptTime = 0;

const isActionRateLimited = () => {
  const now = Date.now();
  if (now - actionLastAttemptTime > 60000) {
    actionAttempts = 0;
    actionLastAttemptTime = now;
    return false;
  }
  if (actionAttempts >= 20) {
    return true;
  }
  return false;
};

const recordActionAttempt = () => {
  const now = Date.now();
  if (now - actionLastAttemptTime > 60000) {
    actionAttempts = 1;
  } else {
    actionAttempts++;
  }
  actionLastAttemptTime = now;
};

const AdminListings = () => {
  const { authorized, loading: authLoading } = useAdminOnly();
  
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedCard, setExpandedCard] = useState(null);
  
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedCity, setSelectedCity] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('ACTIVE');
  const [sortOrder, setSortOrder] = useState('newest');
  
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(6);
  
  const [categories, setCategories] = useState([]);
  const [cities, setCities] = useState([]);
  const [loadingData, setLoadingData] = useState(true);
  
  const [showModal, setShowModal] = useState(false);
  const [selectedListing, setSelectedListing] = useState(null);
  const [modalAction, setModalAction] = useState(null);
  const [reasonText, setReasonText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [imagePreview, setImagePreview] = useState(null);

  useEffect(() => {
    const loadJsonData = async () => {
      try {
        const [categoriesRes, citiesRes] = await Promise.all([
          fetch('/expert-data.json'),
          fetch('/cities.json')
        ]);
        
        const categoriesJson = await categoriesRes.json();
        const citiesJson = await citiesRes.json();
        
        setCategories(categoriesJson.categories || []);
        setCities(citiesJson.cities || []);
      } catch (err) {
        if (isDevelopment) console.error('JSON verileri yüklenirken hata:', err);
        setCategories([
          { id: 'temizlik', name: 'Temizlik', expertise: [] },
          { id: 'boya-badana', name: 'Boya & Badana', expertise: [] }
        ]);
        setCities([{ id: 1, name: 'İstanbul', districts: [] }]);
      } finally {
        setLoadingData(false);
      }
    };
    
    loadJsonData();
  }, []);

  useEffect(() => {
    if (authorized && !loadingData) {
      loadListings();
    }
  }, [selectedCategory, selectedCity, selectedStatus, sortOrder, searchTerm, authorized, loadingData]);

  const loadListings = async () => {
    try {
      setLoading(true);
      setError(null);
      
      let constraints = [];
      if (selectedCategory) constraints.push(where('category', '==', selectedCategory));
      if (selectedCity) constraints.push(where('city', '==', selectedCity));
      
      if (selectedStatus === 'ACTIVE') {
        constraints.push(where('status', '==', 'ACTIVE'));
      } else if (selectedStatus === 'UNPUBLISHED') {
        constraints.push(where('status', '==', 'UNPUBLISHED'));
      } else if (selectedStatus === 'DELETED') {
        constraints.push(where('status', '==', 'DELETED'));
      }
      
      const q = query(collection(db, 'services'), ...constraints);
      const snapshot = await getDocs(q);
      
      let allListings = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        status: doc.data().status || 'ACTIVE',
        createdAt: doc.data().createdAt?.toDate?.() || new Date(doc.data().createdAt),
        hiddenAt: doc.data().hiddenAt || null,
        deletedAt: doc.data().deletedAt || null,
        hiddenReason: doc.data().hiddenReason || null,
        deletedReason: doc.data().deletedReason || null,
      }));
      
      allListings.sort((a, b) => {
        const dateA = new Date(a.createdAt);
        const dateB = new Date(b.createdAt);
        return sortOrder === 'newest' ? dateB - dateA : dateA - dateB;
      });
      
      if (searchTerm && searchTerm.trim()) {
        const sanitizedTerm = sanitizeSearchTerm(searchTerm);
        const term = sanitizedTerm.toLowerCase().trim();
        allListings = allListings.filter(item =>
          (item.title && item.title.toLowerCase().includes(term)) ||
          (item.providerName && item.providerName.toLowerCase().includes(term))
        );
      }
      
      allListings = allListings.slice(0, 500);
      
      setListings(allListings);
    } catch (err) {
      if (isDevelopment) console.error('İlanlar yüklenirken hata:', err);
      setError(err.message || 'İlanlar yüklenirken bir hata oluştu');
    } finally {
      setLoading(false);
    }
  };

  const handleHide = async () => {
    if (isActionRateLimited()) {
      setError('عمليات كثيرة جداً. يرجى الانتظار دقيقة واحدة.');
      return;
    }
    
    if (!selectedListing?.id) return;
    if (!selectedListing?.providerId) {
      setError('تعذر العثور على معلومات الخبير لإلغاء النشر.');
      closeModal();
      return;
    }
    
    if (!reasonText.trim()) {
      setError('يرجى تحديد سبب إلغاء النشر.');
      recordActionAttempt();
      return;
    }
    
    if (reasonText.trim().length < 3) {
      setError('يجب أن يكون السبب 3 أحرف على الأقل.');
      recordActionAttempt();
      return;
    }
    
    setIsProcessing(true);
    try {
      await updateDoc(doc(db, 'services', selectedListing.id), { 
        status: 'UNPUBLISHED',
        hiddenAt: new Date().toISOString(),
        hiddenReason: sanitizeText(reasonText, 500),
        updatedAt: serverTimestamp()
      });
      
      await addDoc(collection(db, 'notifications'), {
        userId: selectedListing.providerId,
        title: '📢 تم إلغاء نشر إعلانك',
        message: `تم إلغاء نشر إعلانك المسمى "${sanitizeText(selectedListing.title, 100)}" من قبل المسؤول.\n\nالسبب: ${sanitizeText(reasonText, 200)}\n\nيمكنك تعديل إعلانك ونشره مرة أخرى.`,
        type: 'listing_hidden',
        read: false,
        listingId: selectedListing.id,
        listingTitle: sanitizeText(selectedListing.title, 100),
        newStatus: 'UNPUBLISHED',
        reason: sanitizeText(reasonText, 200),
        canRepublish: true,
        createdAt: serverTimestamp(),
      });
      
      actionAttempts = 0;
      await loadListings();
      closeModal();
    } catch (err) {
      if (isDevelopment) console.error('Yayından kaldırma hatası:', err);
      setError('حدث خطأ أثناء إلغاء نشر الإعلان');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDelete = async () => {
    if (isActionRateLimited()) {
      setError('عمليات كثيرة جداً. يرجى الانتظار دقيقة واحدة.');
      return;
    }
    
    if (!selectedListing?.id) return;
    if (!selectedListing?.providerId) {
      setError('تعذر العثور على معلومات الخبير لعملية الحذف.');
      closeModal();
      return;
    }
    
    if (!reasonText.trim()) {
      setError('يرجى تحديد سبب الحذف.');
      recordActionAttempt();
      return;
    }
    
    if (reasonText.trim().length < 3) {
      setError('يجب أن يكون السبب 3 أحرف على الأقل.');
      recordActionAttempt();
      return;
    }
    
    setIsProcessing(true);
    try {
      await updateDoc(doc(db, 'services', selectedListing.id), { 
        status: 'DELETED',
        deletedAt: new Date().toISOString(),
        deletedReason: sanitizeText(reasonText, 500),
        updatedAt: serverTimestamp()
      });
      
      await addDoc(collection(db, 'notifications'), {
        userId: selectedListing.providerId,
        title: '🗑️ تم حذف إعلانك نهائياً',
        message: `تم حذف إعلانك المسمى "${sanitizeText(selectedListing.title, 100)}" نهائياً من قبل المسؤول.\n\nالسبب: ${sanitizeText(reasonText, 200)}\n\nلا يمكن التراجع عن هذا الإجراء.`,
        type: 'listing_deleted',
        read: false,
        listingId: selectedListing.id,
        listingTitle: sanitizeText(selectedListing.title, 100),
        newStatus: 'DELETED',
        reason: sanitizeText(reasonText, 200),
        permanent: true,
        createdAt: serverTimestamp(),
      });
      
      actionAttempts = 0;
      await loadListings();
      closeModal();
    } catch (err) {
      if (isDevelopment) console.error('Silme hatası:', err);
      setError('حدث خطأ أثناء حذف الإعلان');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRestore = async () => {
    if (isActionRateLimited()) {
      setError('عمليات كثيرة جداً. يرجى الانتظار دقيقة واحدة.');
      return;
    }
    
    if (!selectedListing?.id) return;
    if (!selectedListing?.providerId) {
      setError('تعذر العثور على معلومات الخبير لإعادة النشر.');
      closeModal();
      return;
    }
    
    setIsProcessing(true);
    try {
      await updateDoc(doc(db, 'services', selectedListing.id), { 
        status: 'ACTIVE',
        hiddenAt: null,
        hiddenReason: null,
        updatedAt: serverTimestamp()
      });
      
      await addDoc(collection(db, 'notifications'), {
        userId: selectedListing.providerId,
        title: '✅ تم إعادة نشر إعلانك',
        message: `تم إعادة نشر إعلانك المسمى "${sanitizeText(selectedListing.title, 100)}" من قبل المسؤول. إعلانك الآن نشط ومرئي للجميع.`,
        type: 'listing_restored',
        read: false,
        listingId: selectedListing.id,
        listingTitle: sanitizeText(selectedListing.title, 100),
        newStatus: 'ACTIVE',
        createdAt: serverTimestamp(),
      });
      
      actionAttempts = 0;
      await loadListings();
      closeModal();
    } catch (err) {
      if (isDevelopment) console.error('Geri alma hatası:', err);
      setError('حدث خطأ أثناء استعادة الإعلان');
    } finally {
      setIsProcessing(false);
    }
  };

  const openModal = (listing, action) => {
    setSelectedListing(listing);
    setModalAction(action);
    setReasonText('');
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setSelectedListing(null);
    setModalAction(null);
    setReasonText('');
    setError(null);
  };

  const formatPrice = (price) => {
    const num = safeNumber(price);
    return num.toLocaleString('ar-SY') + ' ل.س';
  };
  
  const formatDate = (date) => {
    if (!date) return '';
    try {
      const dateObj = date instanceof Date ? date : new Date(date);
      if (isNaN(dateObj.getTime())) return '';
      const diff = new Date() - dateObj;
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      if (days === 0) return 'اليوم';
      if (days === 1) return 'أمس';
      if (days < 7) return `قبل ${days} أيام`;
      return dateObj.toLocaleDateString('ar-SY');
    } catch {
      return '';
    }
  };

  const getImageUrl = (imagePath) => {
    if (!imagePath) return null;
    const safePath = String(imagePath).trim();
    if (safePath.startsWith('https://') || safePath.startsWith('http://')) {
      return safePath;
    }
    return null;
  };

  const getStatusBadge = (status) => {
    switch(status) {
      case 'ACTIVE':
        return <span className="status-badge active"><i className="fas fa-check-circle"></i> نشط</span>;
      case 'UNPUBLISHED':
        return <span className="status-badge unpublished"><i className="fas fa-eye-slash"></i> غير منشور</span>;
      case 'DELETED':
        return <span className="status-badge deleted"><i className="fas fa-trash-alt"></i> محذوف</span>;
      default:
        return <span className="status-badge">-</span>;
    }
  };

  const totalPages = Math.ceil(listings.length / itemsPerPage);
  const paginatedListings = listings.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
  const toggleExpand = (id) => setExpandedCard(expandedCard === id ? null : id);

  const handleSearchChange = (e) => {
    setSearchTerm(e.target.value.slice(0, 100));
  };

  const handleCategoryChange = (e) => {
    setSelectedCategory(e.target.value);
    setCurrentPage(1);
  };

  const handleCityChange = (e) => {
    setSelectedCity(e.target.value);
    setCurrentPage(1);
  };

  const handleStatusChange = (e) => {
    setSelectedStatus(e.target.value);
    setCurrentPage(1);
  };

  const resetFilters = () => {
    setSearchTerm(''); 
    setSelectedCategory(''); 
    setSelectedCity(''); 
    setSelectedStatus('ACTIVE');
    setSortOrder('newest'); 
    setCurrentPage(1);
  };

  useEffect(() => {
    if (authorized && !loadingData) {
      loadListings();
    }
  }, [selectedCategory, selectedCity, selectedStatus, sortOrder, searchTerm]);

  useEffect(() => {
    if (!imagePreview) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => {
      if (e.key === 'Escape') setImagePreview(null);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [imagePreview]);

  const openListingImagePreview = (imageUrl, listingTitle) => {
    const cap = String(listingTitle || '').trim();
    setImagePreview({
      src: imageUrl,
      caption: cap ? sanitizeText(cap, 200) : 'صورة الإعلان',
    });
  };

  if (authLoading) {
    return <LoadingSpinner text="جاري التحقق من الصلاحيات..." />;
  }

  if (!authorized) {
    return (
      <div className="no-data">
        <i className="fas fa-shield-alt fa-3x"></i>
        <p>ليس لديك صلاحية للوصول إلى هذه الصفحة. يمكن للمسؤولين فقط الوصول.</p>
      </div>
    );
  }

  if (loadingData || loading) {
    return <LoadingSpinner text="İlanlar yükleniyor..." />;
  }

  if (error && !showModal) {
    return (
      <div className="error-state">
        <i className="fas fa-exclamation-triangle"></i>
        <p>{sanitizeText(error, 200)}</p>
        <button className="retry-btn" onClick={loadListings}>Tekrar Dene</button>
      </div>
    );
  }

  const activeCount = listings.filter(l => l.status === 'ACTIVE').length;
  const unpublishedCount = listings.filter(l => l.status === 'UNPUBLISHED').length;
  const deletedCount = listings.filter(l => l.status === 'DELETED').length;
  const totalCount = listings.length;

  return (
    <>
    <div className="admin-listings">
      <div className="filter-bar">
        <div className="search-wrapper">
          <input 
            type="text" 
            placeholder="ابحث باسم الإعلان أو الخبير..." 
            value={searchTerm} 
            onChange={handleSearchChange} 
            onKeyPress={(e) => e.key === 'Enter' && loadListings()}
            maxLength={100}
          />
          <button className="search-btn" onClick={loadListings}>🔍 بحث</button>
        </div>
        <div className="filter-group">
          <select value={selectedCategory} onChange={handleCategoryChange}>
            <option value="">جميع الفئات</option>
            {categories.map(cat => (
              <option key={cat.id} value={cat.name}>{sanitizeText(cat.name, 50)}</option>
            ))}
          </select>
          
          <select value={selectedCity} onChange={handleCityChange}>
            <option value="">جميع المدن</option>
            {cities.map(city => (
              <option key={city.id} value={city.name}>{sanitizeText(city.name, 50)}</option>
            ))}
          </select>
 
          <select value={selectedStatus} onChange={handleStatusChange}>
            <option value="ACTIVE">✅ الإعلانات النشطة</option>
            <option value="UNPUBLISHED">👁️ الإعلانات الملغى نشرها</option>
            <option value="DELETED">🗑️ المحذوفة</option>
            <option value="ALL">📋 جميع الإعلانات</option>
          </select>
          
          <div className="sort-buttons">
            <button className={sortOrder === 'newest' ? 'active' : ''} onClick={() => setSortOrder('newest')}>🕒 الأحدث</button>
            <button className={sortOrder === 'oldest' ? 'active' : ''} onClick={() => setSortOrder('oldest')}>📅 الأقدم</button>
          </div>
          <button className="reset-btn" onClick={resetFilters}>إعادة تعيين</button>
        </div>
      </div>
 
      <div className="stats-info">
        <div className="stat-item" title={`العدد الفعلي: ${formatFullNumber(activeCount)} إعلان نشط`}>
          <i className="fas fa-check-circle"></i>
          <span>نشط: {formatLargeNumber(activeCount)}</span>
        </div>
        <div className="stat-item" title={`العدد الفعلي: ${formatFullNumber(unpublishedCount)} إعلان ملغى نشره`}>
          <i className="fas fa-eye-slash"></i>
          <span>الملغى نشرها: {formatLargeNumber(unpublishedCount)}</span>
        </div>
        <div className="stat-item" title={`العدد الفعلي: ${formatFullNumber(deletedCount)} إعلان محذوف`}>
          <i className="fas fa-trash-alt"></i>
          <span>المحذوفة: {formatLargeNumber(deletedCount)}</span>
        </div>
        <div className="stat-item" title={`العدد الفعلي: ${formatFullNumber(totalCount)} إجمالي الإعلانات`}>
          <i className="fas fa-chart-line"></i>
          <span>الإجمالي: {formatLargeNumber(totalCount)}</span>
        </div>
      </div>
 
      <div className="cards-list">
        {paginatedListings.length === 0 ? (
          <div className="no-data">
            <i className="fas fa-box-open"></i>
            <p>لا توجد إعلانات في هذه الفئة.</p>
          </div>
        ) : (
          paginatedListings.map(listing => {
            const imageUrl = getImageUrl(listing.image);
            const title = sanitizeText(listing.title, 100);
            const providerName = sanitizeText(listing.providerName, 50);
            const category = sanitizeText(listing.category, 50);
            const city = sanitizeText(listing.city, 50);
            const description = sanitizeText(listing.description, 300);
            const pricingType = sanitizeText(listing.pricingType, 30);
            const serviceSubcategory = sanitizeText(listing.serviceSubcategory, 50);
            const rating = safeNumber(listing.rating);
            
            return (
              <div key={listing.id} className={`data-card ${expandedCard === listing.id ? 'expanded' : ''} status-${listing.status?.toLowerCase()}`}>
                <div className="card-header" onClick={() => toggleExpand(listing.id)}>
                  <div className="card-summary">
                    <div className="card-image">
                      {imageUrl ? (
                        <img
                          src={imageUrl}
                          alt=""
                          className="admin-reported-listing-thumb"
                          tabIndex={0}
                          role="button"
                          aria-label="تكبير الصورة"
                          onClick={(e) => {
                            e.stopPropagation();
                            openListingImagePreview(imageUrl, listing.title);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              e.stopPropagation();
                              openListingImagePreview(imageUrl, listing.title);
                            }
                          }}
                          onError={(e) => {
                            e.target.style.display = 'none';
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
                        {getStatusBadge(listing.status)}
                      </div>
                      <div className="card-meta">
                        <span><i className="fas fa-user"></i> {providerName || 'غير معروف'}</span>
                        <span><i className="fas fa-tag"></i> {category || 'أخرى'}</span>
                        <span><i className="fas fa-map-marker-alt"></i> {city || '-'}</span>
                        <span className="price">{formatPrice(listing.price)}</span>
                      </div>
                    </div>
                  </div>
                  <div className="card-actions">
                    {listing.status === 'ACTIVE' && (
                      <>
                        <button 
                          className="hide" 
                          onClick={(e) => { e.stopPropagation(); openModal(listing, 'hide'); }} 
                          title="إلغاء النشر"
                          disabled={isProcessing}
                        >
                          <i className="fas fa-eye-slash"></i>
                        </button>
                        <button 
                          className="delete" 
                          onClick={(e) => { e.stopPropagation(); openModal(listing, 'delete'); }} 
                          title="حذف نهائي"
                          disabled={isProcessing}
                        >
                          <i className="fas fa-trash-alt"></i>
                        </button>
                      </>
                    )}
                    
                    {listing.status === 'UNPUBLISHED' && (
                      <>
                        <button 
                          className="restore" 
                          onClick={(e) => { e.stopPropagation(); openModal(listing, 'restore'); }} 
                          title="إعادة نشر"
                          disabled={isProcessing}
                        >
                          <i className="fas fa-undo-alt"></i>
                        </button>
                        <button 
                          className="delete" 
                          onClick={(e) => { e.stopPropagation(); openModal(listing, 'delete'); }} 
                          title="حذف نهائي"
                          disabled={isProcessing}
                        >
                          <i className="fas fa-trash-alt"></i>
                        </button>
                      </>
                    )}
                    
                    {listing.status === 'DELETED' && (
                      <button 
                        className="delete-permanent" 
                        onClick={(e) => { e.stopPropagation(); }} 
                        title="محذوف نهائياً"
                        disabled
                      >
                        <i className="fas fa-ban"></i>
                      </button>
                    )}
                    
                    <div className="expand-icon">
                      <i className={`fas fa-chevron-${expandedCard === listing.id ? 'up' : 'down'}`}></i>
                    </div>
                  </div>
                </div>
 
                {expandedCard === listing.id && (
                  <div className="card-details">
                    <div className="detail-row">
                      <div className="detail-label">📝 الوصف:</div>
                      <div className="detail-value">{description || 'لا يوجد وصف'}</div>
                    </div>
                    <div className="detail-row">
                      <div className="detail-label">💰 نوع السعر:</div>
                      <div className="detail-value">{pricingType || 'غير محدد'}</div>
                    </div>
                    <div className="detail-row">
                      <div className="detail-label">📂 الفئة الفرعية:</div>
                      <div className="detail-value">{serviceSubcategory || 'غير محدد'}</div>
                    </div>
                    <div className="detail-row">
                      <div className="detail-label">⭐ التقييم:</div>
                      <div className="detail-value">{rating} / 5</div>
                    </div>
                    <div className="detail-row">
                      <div className="detail-label">📅 تاريخ الإنشاء:</div>
                      <div className="detail-value">{formatDate(listing.createdAt)}</div>
                    </div>
                    
                    {listing.status === 'UNPUBLISHED' && listing.hiddenReason && (
                      <div className="detail-row warning">
                        <div className="detail-label">⚠️ سبب إلغاء النشر:</div>
                        <div className="detail-value">{sanitizeText(listing.hiddenReason, 200)}</div>
                      </div>
                    )}
                    
                    {listing.status === 'DELETED' && listing.deletedReason && (
                      <div className="detail-row error">
                        <div className="detail-label">🗑️ سبب الحذف:</div>
                        <div className="detail-value">{sanitizeText(listing.deletedReason, 200)}</div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
 
      {totalPages > 1 && (
        <div className="pagination">
          <button onClick={() => setCurrentPage(1)} disabled={currentPage === 1 || isProcessing}>«</button>
          <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1 || isProcessing}>‹</button>
          <span>الصفحة {currentPage} / {totalPages}</span>
          <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages || isProcessing}>›</button>
          <button onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages || isProcessing}>»</button>
        </div>
      )}
 
      {showModal && selectedListing && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="confirm-modal" onClick={e => e.stopPropagation()}>
            <div className="confirm-icon">
              {modalAction === 'hide' && '👁️'}
              {modalAction === 'delete' && '🗑️'}
              {modalAction === 'restore' && '✅'}
            </div>
            <h3>
              {modalAction === 'hide' && 'إلغاء نشر الإعلان'}
              {modalAction === 'delete' && 'حذف الإعلان نهائياً'}
              {modalAction === 'restore' && 'إعادة نشر الإعلان'}
            </h3>
            
            <p>
              {modalAction === 'hide' && `هل أنت متأكد من رغبتك في إلغاء نشر الإعلان "${sanitizeText(selectedListing.title, 100)}"؟`}
              {modalAction === 'delete' && `هل أنت متأكد من رغبتك في حذف الإعلان "${sanitizeText(selectedListing.title, 100)}" نهائياً؟ هذا الإجراء لا يمكن التراجع عنه!`}
              {modalAction === 'restore' && `هل أنت متأكد من رغبتك في إعادة نشر الإعلان "${sanitizeText(selectedListing.title, 100)}"؟`}
            </p>
 
            {(modalAction === 'hide' || modalAction === 'delete') && (
              <div className="reason-input-group">
                <label htmlFor="reason">سبب الإجراء <span className="required">*</span></label>
                <textarea
                  id="reason"
                  value={reasonText}
                  onChange={(e) => setReasonText(e.target.value.slice(0, 500))}
                  placeholder={modalAction === 'hide' 
                    ? "حدد سبب إلغاء النشر (مثال: محتوى غير لائق، معلومات ناقصة، إلخ)" 
                    : "حدد سبب الحذف (مثال: شكوى مستخدم، محتوى زائف، إلخ)"
                  }
                  rows={4}
                  maxLength={500}
                  autoFocus
                />
                <small>{reasonText.length}/500 حرف</small>
              </div>
            )}
            
            <div className="confirm-buttons">
              <button className="cancel" onClick={closeModal} disabled={isProcessing}>إلغاء</button>
              <button 
                className={`confirm ${modalAction}`} 
                onClick={
                  modalAction === 'hide' ? handleHide : 
                  modalAction === 'delete' ? handleDelete : 
                  handleRestore
                }
                disabled={isProcessing || ((modalAction === 'hide' || modalAction === 'delete') && !reasonText.trim())}
              >
                {isProcessing ? (
                  <><i className="fas fa-spinner fa-spin"></i> جاري المعالجة...</>
                ) : (
                  modalAction === 'hide' ? 'نعم، إلغاء النشر' :
                  modalAction === 'delete' ? 'نعم، حذف نهائي' :
                  'نعم، إعادة النشر'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>

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
};

export default AdminListings;