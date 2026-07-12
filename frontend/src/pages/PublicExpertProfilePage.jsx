import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { doc, getDoc, collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase/firebaseClient';
import { getPortfolioPhotos } from '../firebase/authService';
import { getProfilePhoto } from '../services/updateService';
import { fetchExpertReviewStats } from '../services/reviewsApi';
import ReviewSystem from '../components/ReviewSystem';
import Navbar from '../components/Navbar';
import LoadingSpinner from '../components/LoadingSpinner';
import DOMPurify from 'dompurify';
import '../styles/ExpertProfilePage.css';

const isDevelopment = process.env.NODE_ENV === 'development';

const sanitizeText = (text) => {
  if (!text) return '';
  return DOMPurify.sanitize(String(text));
};

const normalizeSpecialties = (raw) => {
  const arr = Array.isArray(raw) ? raw : [];
  return arr
    .map((s) => {
      if (typeof s === "string") {
        const name = String(s || "").trim();
        return name ? { name, startingPrice: 0 } : null;
      }
      const name = String(s?.name || "").trim();
      const startingPrice = Number(s?.startingPrice) || 0;
      return name ? { name, startingPrice } : null;
    })
    .filter(Boolean);
};

/* ─── Lightbox ─── */
const Lightbox = ({ images, startIndex, onClose }) => {
  const [current, setCurrent] = useState(startIndex);
  const prev = useCallback(() => setCurrent(i => (i - 1 + images.length) % images.length), [images.length]);
  const next = useCallback(() => setCurrent(i => (i + 1) % images.length), [images.length]);

  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') prev();
      if (e.key === 'ArrowRight') next();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose, prev, next]);

  return (
    <div className="lightbox-overlay" onClick={onClose}>
      <button className="lightbox-close" onClick={onClose}><i className="fas fa-times"></i></button>
      {images.length > 1 && (
        <button className="lightbox-prev" onClick={e => { e.stopPropagation(); prev(); }}>
          <i className="fas fa-chevron-left"></i>
        </button>
      )}
      <img className="lightbox-image" src={images[current]} alt={`صورة ${current + 1}`} onClick={e => e.stopPropagation()} />
      {images.length > 1 && (
        <button className="lightbox-next" onClick={e => { e.stopPropagation(); next(); }}>
          <i className="fas fa-chevron-right"></i>
        </button>
      )}
      {images.length > 1 && <span className="lightbox-counter">{current + 1} / {images.length}</span>}
    </div>
  );
};

/* ─── Helpers ─── */
const isPdf = (url) => {
  try { return new URL(url).pathname.toLowerCase().endsWith('.pdf'); }
  catch { return url.toLowerCase().includes('.pdf'); }
};
const imageUrlsOnly = (urls) => urls.filter(u => !isPdf(u));

const getTurkishDayName = (day) => ({
  monday: 'الإثنين', tuesday: 'الثلاثاء', wednesday: 'الأربعاء',
  thursday: 'الخميس', friday: 'الجمعة', saturday: 'السبت', sunday: 'الأحد'
})[day] || day;

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

/* ─── PhotoThumb (sadece görüntüleme) ─── */
const PhotoThumb = ({ url, index, allUrls, size = 120, height = 120 }) => {
  const [lightbox, setLightbox] = useState(false);
  const pdf = isPdf(url);
  const imageUrls = imageUrlsOnly(allUrls);
  const imageIndex = imageUrls.indexOf(url);

  return (
    <>
      <div className="photo-thumb" style={{ width: `${size}px`, height: `${height}px` }}>
        {pdf ? (
          <div className="photo-thumb__pdf" onClick={() => window.open(url, '_blank', 'noopener,noreferrer')}>
            <i className="fas fa-file-pdf photo-thumb__pdf-icon"></i>
            <span className="photo-thumb__pdf-label">مستند PDF</span>
            <span className="photo-thumb__pdf-open"><i className="fas fa-external-link-alt"></i> فتح</span>
          </div>
        ) : (
          <>
            <img className="photo-thumb__img" src={url} alt={`صورة ${index + 1}`} onClick={() => setLightbox(true)} />
            <div className="photo-thumb__overlay" onClick={() => setLightbox(true)}>
              <i className="fas fa-search-plus photo-thumb__zoom-icon"></i>
            </div>
          </>
        )}
      </div>
      {lightbox && !pdf && imageIndex !== -1 && (
        <Lightbox images={imageUrls} startIndex={imageIndex} onClose={() => setLightbox(false)} />
      )}
    </>
  );
};

/* ─── Ana Sayfa ─── */
const PublicExpertProfilePage = () => {
  const { providerId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [expertData, setExpertData] = useState(null);
  const [portfolioUrls, setPortfolioUrls] = useState([]);
  const [baGallery, setBaGallery] = useState([]);
  const [baLoading, setBaLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('info');
  const [profilePhotoUrl, setProfilePhotoUrl] = useState(null);
  const [activeListingReviewStats, setActiveListingReviewStats] = useState({ avg: 0, count: 0 });
  const [activeListingReviewLoading, setActiveListingReviewLoading] = useState(false);

  // Profil fotoğrafını çek
  useEffect(() => {
    const fetchProfilePhoto = async () => {
      if (!providerId) return;
      try {
        const photo = await getProfilePhoto(providerId);
        setProfilePhotoUrl(photo);
      } catch (error) {
        if (isDevelopment) console.error("Profil fotoğrafı yüklenemedi:", error);
        setProfilePhotoUrl(null);
      }
    };
    fetchProfilePhoto();
  }, [providerId]);

  useEffect(() => {
    if (!providerId) { setNotFound(true); setLoading(false); return; }

    const loadData = async () => {
      try {
        const expertDoc = await getDoc(doc(db, 'service_providers', providerId));
        
        if (!expertDoc.exists()) { 
          setNotFound(true); 
          return; 
        }
        
        const expertData = expertDoc.data();
        setExpertData(expertData);

        try {
          const urls = await getPortfolioPhotos(providerId);
          setPortfolioUrls(urls);
        } catch { 
          setPortfolioUrls([]); 
        }

        try {
          setBaLoading(true);
          const querySnapshot = await getDocs(collection(db, "users", providerId, "beforeAfterGallery"));
          const data = querySnapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
          const sortedData = data.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
          setBaGallery(sortedData);
        } catch (error) {
          if (isDevelopment) console.error("Öncesi/sonrası galeri çekme hatası:", error.message);
          setBaGallery([]);
        } finally {
          setBaLoading(false);
        }

      } catch (err) {
        if (isDevelopment) console.error('Profil yüklenirken hata:', err.message);
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [providerId]);

  useEffect(() => {
    const tab = String(searchParams.get('tab') || '').trim().toLowerCase();
    if (!tab) return;
    if (tab === 'reviews') setActiveTab('reviews');
    else if (tab === 'portfolio') setActiveTab('portfolio');
    else setActiveTab('info');
  }, [searchParams]);

  useEffect(() => {
    const cleanId = String(providerId || '').trim();
    if (!cleanId) {
      setActiveListingReviewStats({ avg: 0, count: 0 });
      setActiveListingReviewLoading(false);
      return;
    }

    let cancelled = false;
    const loadStats = async () => {
      setActiveListingReviewLoading(true);
      try {
        const stats = await fetchExpertReviewStats(cleanId, { includeInactiveListings: false });
        if (!cancelled) {
          setActiveListingReviewStats({ avg: Number(stats?.avg || 0), count: Number(stats?.count || 0) });
        }
      } finally {
        if (!cancelled) setActiveListingReviewLoading(false);
      }
    };

    loadStats();
    return () => { cancelled = true; };
  }, [providerId]);

  const getDisplayName = () => sanitizeText(expertData?.displayName || expertData?.businessName || 'الخبير');
  const getFirstName = () => {
    const name = getDisplayName();
    return name.split(' ')[0] || 'غير محدد';
  };
  const getLastName = () => {
    const name = getDisplayName();
    const parts = name.split(' ');
    return parts.length > 1 ? parts.slice(1).join(' ') : 'غير محدد';
  };
  const getUserInitials = () => {
    const name = getDisplayName();
    return name.substring(0, 2).toUpperCase();
  };

  // ExpertProfilePage ile aynı mantık
  const fixedAvg = Number(expertData?.rating || 0);
  const activeReviewCount = activeListingReviewLoading
    ? Number(expertData?.reviewCount || 0)
    : (activeListingReviewStats?.count || 0);

  if (loading) return (
    <div className="profile-page">
      <Navbar />
      <LoadingSpinner text="جاري تحميل الملف الشخصي..." />
    </div>
  );

  if (notFound) return (
    <div className="profile-page">
      <Navbar />
      <div style={{ textAlign: 'center', padding: '80px 20px', color: 'var(--text-muted)' }}>
        <i className="fas fa-user-slash" style={{ fontSize: '48px', marginBottom: '16px', display: 'block' }}></i>
        <p style={{ fontSize: '18px', marginBottom: '20px' }}>لم يتم العثور على ملف الخبير الشخصي.</p>
        <button className="settings-secondary-button" onClick={() => navigate('/ilanlar')}>
          العودة للإعلانات
        </button>
      </div>
    </div>
  );

  const certificates = expertData?.certificates || [];
  const providerType = expertData?.providerType || '';

  const isCompany = providerType === 'Şirket' || providerType === 'company';
  const taxDoc = isCompany && certificates.length > 0 ? certificates[certificates.length - 1] : null;
  const certDocs = certificates.slice(0, taxDoc ? certificates.length - 1 : certificates.length);

  const docList = [
    ...certDocs.map((_, i) => ({ label: certDocs.length > 1 ? `شهادة ${i + 1}` : 'شهادة', icon: 'fa-certificate' })),
    ...(taxDoc ? [{ label: 'اللوحة الضريبية', icon: 'fa-file-invoice' }] : []),
  ];

  return (
    <div className="profile-page">
      <Navbar />

      <main className="profile-main">

        {/* ÜST PROFİL KARTI */}
        <div className="profile-header-card">
          <div className="profile-header-left">
            <div className="profile-avatar-large">
              {profilePhotoUrl ? (
                <img 
                  src={profilePhotoUrl} 
                  alt="Profil" 
                  style={{ 
                    width: '80px', 
                    height: '80px', 
                    borderRadius: '50%', 
                    objectFit: 'cover', 
                    border: '3px solid var(--card-border)', 
                    display: 'block' 
                  }} 
                />
              ) : (
                <div className="avatar-circle-large">
                  <span className="avatar-initials-large">{getUserInitials()}</span>
                </div>
              )}
            </div>
            <div className="profile-header-info">
              <div className="profile-header-meta">
                <h1 className="profile-header-name">{sanitizeText(expertData?.businessName || 'غير محدد')}</h1>
                {String(expertData?.profession || '').trim() ? (
                  <span className="profile-header-sub profile-header-sub--profession">
                    {sanitizeText(String(expertData.profession).trim())}
                  </span>
                ) : String(expertData?.category || '').trim() ? (
                  <span className="profile-header-sub profile-header-sub--profession">
                    {sanitizeText(String(expertData.category).split(',')[0].trim())}
                  </span>
                ) : null}
                <span className="profile-header-sub">{getDisplayName()}</span>
              </div>

              <div className="profile-header-contact">
                <span><i className="fas fa-map-marker-alt"></i> {sanitizeText(expertData?.city || 'غير محدد')}</span>
                <span><i className="fas fa-briefcase"></i> {sanitizeText(expertData?.category || 'غير محدد')}</span>
              </div>

              <div className="profile-header-meta">
                <span className="profile-badge-approved">
                  <i className="fas fa-check-circle"></i> خبير موثق
                </span>
                <span className="profile-badge-since">
                  <i className="fas fa-calendar-alt"></i>
                  {expertData?.createdAt ? `عضو منذ عام ${new Date(expertData.createdAt).getFullYear()}` : ''}
                </span>
              </div>
            </div>
          </div>

          <div className="profile-header-right">
            <div className="profile-header-stats">
              <div className="header-stat-item">
                <span className="header-stat-value">{fixedAvg} <i className="fas fa-star"></i></span>
                <span className="header-stat-label">تقييم العملاء</span>
                <span className="profile-stat-sub">({activeReviewCount} تقييمات)</span>
              </div>
            </div>
          </div>
        </div>

        {/* TAB MENÜ - aynı kalır */}
        <div className="expert-tabs">
          <button className={`tab-btn ${activeTab === 'info' ? 'active' : ''}`} onClick={() => setActiveTab('info')}>
            <i className="fas fa-user-circle"></i> معلومات الملف الشخصي
          </button>
          <button className={`tab-btn ${activeTab === 'portfolio' ? 'active' : ''}`} onClick={() => setActiveTab('portfolio')}>
            <i className="fas fa-images"></i> المعرض والوثائق
          </button>
          <button className={`tab-btn ${activeTab === 'reviews' ? 'active' : ''}`} onClick={() => setActiveTab('reviews')}>
            <i className="fas fa-star"></i> التعليقات
          </button>
        </div>

        {/* GERİ KALAN KISIM (info, portfolio, reviews, hours) - AYNI KALIR */}
        <section className="profile-card-section profile-settings-detail">

          {/* PROFİL BİLGİLERİ */}
          {activeTab === 'info' && (
            <div className="settings-combined-container">
              <h4 className="settings-section-title">معلومات شخصية</h4>
              <div className="settings-detail-grid" style={{ marginBottom: '25px' }}>
                <div className="settings-field-group">
                  <span className="settings-field-label">الاسم</span>
                  <span className="settings-field-value">{sanitizeText(getFirstName())}</span>
                </div>
                <div className="settings-field-group">
                  <span className="settings-field-label">الكنية</span>
                  <span className="settings-field-value">{sanitizeText(getLastName())}</span>
                </div>
                <div className="settings-field-group">
                  <span className="settings-field-label">اسم العمل</span>
                  <span className="settings-field-value">{sanitizeText(expertData?.businessName || 'غير محدد')}</span>
                </div>
              </div>

              <h4 className="settings-section-title">التعليم والخبرة</h4>
              <div className="settings-detail-grid" style={{ marginBottom: '25px' }}>
                <div className="settings-field-group">
                  <span className="settings-field-label">الخبرة</span>
                  <span className="settings-field-value">{expertData?.experienceYears ? `${sanitizeText(expertData.experienceYears)} سنوات` : 'غير محدد'}</span>
                </div>
                <div className="settings-field-group">
                  <span className="settings-field-label">التعليم</span>
                  <span className="settings-field-value">{sanitizeText(expertData?.educationInfo || 'غير محدد')}</span>
                </div>
              </div>

              <h4 className="settings-section-title">التخصصات</h4>
              {normalizeSpecialties(expertData?.specialties).length > 0 ? (
                <div className="specialties-price-table">
                  <div className="specialties-price-row specialties-price-head">
                    <div>التخصص</div>
                    <div>السعر</div>
                    <div></div>
                  </div>
                  {normalizeSpecialties(expertData?.specialties).map((s, i) => (
                    <div key={`${s.name}-${i}`} className="specialties-price-row">
                      <div className="specialties-price-name">{sanitizeText(s.name)}</div>
                      <div className="specialties-price-price">
                        {Number(s.startingPrice || 0).toLocaleString("tr-TR")} ل.س{" "}
                        <span className="specialties-price-muted">تبدأ من</span>
                      </div>
                      <div></div>
                    </div>
                  ))}
                </div>
              ) : (
                <span className="specialties-empty">غير محدد</span>
              )}
            </div>
          )}

          {/* PORTFOLİO & SERTİFİKALAR */}
          {activeTab === 'portfolio' && (
            <div className="settings-security">
              <div className="settings-security-item portfolio-section">
                <div className="portfolio-section-header cert-section-head">
                  <div>
                    <div className="settings-security-title">الوثائق الرسمية</div>
                    <div className="settings-security-subtitle">الوثائق المعتمدة.</div>
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {docList.length === 0 && <span className="portfolio-empty">لا توجد وثائق.</span>}
                  {docList.map((doc, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'var(--input-bg)', padding: '10px 14px', borderRadius: '10px', fontSize: '14px' }}>
                      <i className={`fas ${doc.icon}`} style={{ color: 'var(--primary)' }}></i>
                      <span>{doc.label}</span>
                      <span style={{ marginLeft: 'auto', color: '#10b981', fontSize: '13px', fontWeight: '600' }}>
                        <i className="fas fa-check-circle"></i> معتمد
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="settings-security-item portfolio-section">
                <div className="portfolio-section-header">
                  <div>
                    <div className="settings-security-title">معرض الأعمال</div>
                    <div className="settings-security-subtitle">صور من الأعمال المكتملة.</div>
                  </div>
                </div>
                <div className="portfolio-thumbs">
                  {portfolioUrls.length > 0
                    ? portfolioUrls.map((url, i) => (
                        <PhotoThumb key={i} url={url} index={i} allUrls={portfolioUrls} size={120} height={120} />
                      ))
                    : <span className="portfolio-empty">لم يتم إضافة صور للمعرض بعد.</span>
                  }
                </div>
              </div>

              <div className="settings-security-item portfolio-section ba-section-wrapper">
                <div className="portfolio-section-header">
                  <div>
                    <div className="settings-security-title">معرض قبل وبعد</div>
                    <div className="settings-security-subtitle">
                      أظهر التغير في عملك ({baGallery.length} / 5 مجموعات)
                    </div>
                  </div>
                </div>

                {baLoading ? (
                  <span className="settings-helper-text">
                    <i className="fas fa-spinner fa-spin"></i> جاري التحميل...
                  </span>
                ) : (
                  <div className="ba-grid-container">
                    {baGallery.map((pair) => (
                      <div key={pair.id} className="ba-main-card">
                        <div className="ba-card-header-title">{sanitizeText(pair.title || "العمل")}</div>
                        <div className="ba-card-media">
                          <img
                            src={pair.beforeUrl}
                            className="ba-img-before"
                            alt="قبل"
                            onClick={() => pair.beforeUrl && window.open(pair.beforeUrl, "_blank", "noopener,noreferrer")}
                          />
                          <img
                            src={pair.afterUrl}
                            className="ba-img-after"
                            alt="بعد"
                            onClick={() => pair.afterUrl && window.open(pair.afterUrl, "_blank", "noopener,noreferrer")}
                          />
                        </div>
                        <div className="ba-card-footer-labels">
                          <span className="label-eski">قبل</span>
                          <span className="label-yeni">بعد</span>
                        </div>
                      </div>
                    ))}
                    {baGallery.length === 0 && (
                      <span className="portfolio-empty">لم يتم إضافة أعمال قبل/بعد بعد.</span>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* YORUMLAR */}
          {activeTab === 'reviews' && (
            <div className="settings-combined-container" style={{ background: 'transparent', border: 'none', padding: 0 }}>
              <ReviewSystem
                targetId={providerId}
                targetType="expert"
                initialVisibleCount={10}
                enableSort={true}
                paginationMode="pages"
                pageSize={10}
                showListingInfo={true}
                filterToActiveListings={true}
              />
            </div>
          )}

        </section>

        {/* GERİ DÖN BUTONU */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '40px' }}>
          <button className="settings-secondary-button" style={{ padding: '12px 30px' }} onClick={() => navigate(-1)}>
            <i className="fas fa-arrow-left"></i> الرجوع
          </button>
        </div>

      </main>
    </div>
  );
};

export default PublicExpertProfilePage;

/*
REMOVED BLOCKS FOR SYRIA LAUNCH:
1. ID Document ("الهوية" / "identityDoc") from certificates list display (it is now treated as a regular certificate).
*/
