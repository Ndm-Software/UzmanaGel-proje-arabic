import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { collection, onSnapshot, query, where, doc, getDoc, writeBatch } from 'firebase/firestore';
import { db, auth } from '../firebase/firebaseClient';
import DOMPurify from 'dompurify';
import { showAppToast } from '../utils/showAppToast';
import '../styles/CustomerRequests.css';

const isDevelopment = process.env.NODE_ENV === 'development';

const sanitizeText = (text) => {
  if (!text) return '';
  return DOMPurify.sanitize(String(text));
};

const calculateWaitTime = (createdAt) => {
  const diff = Date.now() - createdAt;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days} Gün ${hours % 24} Saat`;
  if (hours > 0) return `${hours} Saat ${minutes % 60} dakika`;
  return `${minutes <= 0 ? 1 : minutes} dakika`;
};

const getRequestSourceLabel = (createdBy) => {
  if (createdBy === 'customer') return 'Müşteri';
  if (createdBy === 'expert_request') return 'Uzman';
  return 'Bilinmiyor';
};

const CustomerRequests = () => {
  const navigate = useNavigate();
  const [allData, setAllData] = useState([]);
  const [activeTab, setActiveTab] = useState('pending');
  const [sortBy, setSortBy] = useState('created_desc');
  const [loading, setLoading] = useState(true);
  const [currentUserRole, setCurrentUserRole] = useState(null);

  useEffect(() => {
    const unsubscribeAuth = auth.onAuthStateChanged(async (user) => {
      if (user) {
        try {
          const userDoc = await getDoc(doc(db, 'users', user.uid));
          if (userDoc.exists()) {
            setCurrentUserRole(userDoc.data().userType);
          }
        } catch (error) {
          if (isDevelopment) console.error('Kullanıcı rolü alınamadı:', error);
        }

        const q = query(
          collection(db, 'appointments'),
          where('expertId', '==', user.uid)
        );

        const unsubscribeAppos = onSnapshot(q, async (snapshot) => {
          const extracted = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          }));

          const batch = writeBatch(db);
          let hasExpired = false;
          const now = Date.now();
          const THIRTY_MINUTES = 30 * 60 * 1000;

          extracted.forEach(app => {
            if (app.status === 'pending') {
              const appointmentStartTime = new Date(`${app.date}T${app.start}:00`).getTime();
              
              if (appointmentStartTime - now < THIRTY_MINUTES) {
                hasExpired = true;
                const docRef = doc(db, 'appointments', app.id);
                
                batch.update(docRef, {
                  status: 'rejected',
                  expertRejectNote: 'Randevu başlangıç vaktine 30 dakikadan az süre kaldığı için sistem tarafından otomatik olarak iptal edildi.',
                  rejectedAt: now,
                  rejectedBySystem: true
                });

                const expertNotifRef = doc(collection(db, 'notifications'));
                batch.set(expertNotifRef, {
                  userId: app.expertId,
                  type: 'appointment_auto_cancelled',
                  title: 'Zaman Aşımı: Sistem Tarafından İptal ⏱️',
                  message: `"${app.client || 'Müşteri'}" adlı kişinin ${app.date} - ${app.start} saatindeki randevusuna belirtilen sürede yanıt vermediğiniz için talep sistem tarafından otomatik olarak iptal edilmiştir.`,
                  createdAt: new Date().toISOString(),
                  read: false,
                  appointmentId: app.id
                });

                if (app.clientId) {
                  const clientNotifRef = doc(collection(db, 'notifications'));
                  batch.set(clientNotifRef, {
                    userId: app.clientId,
                    type: 'appointment_auto_cancelled',
                    title: 'Randevu Talebiniz İptal Edildi ⏱️',
                    message: `${app.date} - ${app.start} tarihli randevu talebiniz, başlangıç saatine 30 dakikadan az süre kaldığı için sistem tarafından otomatik olarak iptal edildi. Lütfen en az 30 dakika sonrası için yeni bir talep oluşturun.`,
                    createdAt: new Date().toISOString(),
                    read: false,
                    appointmentId: app.id
                  });
                }
              }
            }
          });

          if (hasExpired) {
            try {
              await batch.commit();
            } catch (err) {
              console.error("Otomatik iptal hatası:", err);
            }
          }
          
          setAllData(extracted);
          setLoading(false);
        }, (error) => {
          if (isDevelopment) console.error('Randevu sorgu hatası:', error);
          setLoading(false);
        });
        
        return () => unsubscribeAppos();
      } else {
        setLoading(false);
      }
    });
    return () => unsubscribeAuth();
  }, []);

  const now = Date.now();
  const today = new Date().toISOString().split('T')[0];
  const THIRTY_MINUTES = 30 * 60 * 1000;

  const requests = Array.isArray(allData) 
    ? allData.filter(app => {
        const isValidSource = app.createdBy === 'customer' || app.createdBy === 'expert_request';
        
        const appointmentStartTime = new Date(`${app.date}T${app.start}:00`).getTime();
        const isExpired = (appointmentStartTime - now < THIRTY_MINUTES);

        if (activeTab === 'pending') {
          return isValidSource && app.status === 'pending' && !isExpired;
        }

        if (activeTab === 'rejected') {
          const isRejectedByStatus = app.status === 'rejected';
          return isValidSource && (isRejectedByStatus || (app.status === 'pending' && isExpired)) && app.date === today;
        }

        return isValidSource && app.status === activeTab;
      })
    : [];
  
  const sortedRequests = [...requests].sort((a, b) => {
    if (sortBy === 'date_asc') return (a.date || "").localeCompare(b.date || "");
    if (sortBy === 'date_desc') return (b.date || "").localeCompare(a.date || "");
    
    if (sortBy === 'created_desc') return (b.createdTime || 0) - (a.createdTime || 0);
    if (sortBy === 'created_asc') return (a.createdTime || 0) - (b.createdTime || 0);
    
    return 0;
  });

  const pendingCount = requests.filter(r => (r.status || 'pending') === 'pending').length;

  if (loading) {
    return (
      <div className="profile-page">
        <Navbar />
        <main className="profile-main cr-main">
          <div className="cr-loading">
            <div className="cr-spinner"></div>
            <p>Talepler yükleniyor...</p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="profile-page">
      <Navbar />
      <main className="profile-main cr-main">

        <div className="cr-topnav">
          <div className="cr-topnav-content">
            <button className="cr-back-btn" onClick={() => navigate('/randevu-takvimi')}>
              <i className="fas fa-arrow-left"></i>
              Uzman Randevu Takvimine Geri Dön
            </button>
            <h2 className="cr-page-title">Gelen Talepler</h2>
            <div style={{ width: '40px' }}></div>
          </div>
        </div>

        <div className="cr-tabs">
          <button
            className={`cr-tab-btn ${activeTab === 'pending' ? 'cr-tab-btn--active-gold' : ''}`}
            onClick={() => setActiveTab('pending')}
          >
            <i className="fas fa-hourglass-half"></i>
            Onay Bekleyenler ({pendingCount})
          </button>
          <button
            className={`cr-tab-btn ${activeTab === 'rejected' ? 'cr-tab-btn--active-red' : ''}`}
            onClick={() => setActiveTab('rejected')}
          >
            <i className="fas fa-times-circle"></i>
            Reddedilenler
          </button>
        </div>

        <div className="cr-sort-wrap">
          <div className="cr-sort-box">
            <span className="cr-sort-label">
              <i className="fas fa-filter"></i> Sıralama:
            </span>
            <select className="cr-sort-select" value={sortBy} onChange={e => setSortBy(e.target.value)}>
              <option value="date_asc">📅 Randevu Tarihi (Yakın → Uzak)</option>
              <option value="date_desc">📅 Randevu Tarihi (Uzak → Yakın)</option>
              <option value="created_desc">🆕 En Yeni Talepler</option>
              <option value="created_asc">📆 En Eski Talepler</option>
            </select>
            <i className="fas fa-chevron-down cr-sort-arrow"></i>
          </div>
        </div>

        <div className="cr-list">
          {sortedRequests.length > 0 ? sortedRequests.map((req, index) => (
            <div
              key={req.id}
              className={`cr-card ${activeTab === 'rejected' ? 'cr-card--static' : ''}`}
              style={{ '--card-index': index }}
              onClick={activeTab === 'pending' ? () => {
                const appointmentStartTime = new Date(`${req.date}T${req.start}:00`).getTime();
                if (appointmentStartTime - Date.now() < THIRTY_MINUTES) {
                  showAppToast("Bu randevunun onay süresi dolmuştur.", "error");
                  return;
                }
                navigate(`/request-detail/${req.date}/${req.id}`);
              } : undefined}
            >
              <div className="cr-card-body">

                {activeTab === 'pending' && (
                  <div className="cr-wait-badge">
                    <i className="fas fa-clock"></i>
                    {calculateWaitTime(req.createdTime)}dir sizin onay veya reddinizi beklemede
                  </div>
                )}

                {activeTab === 'rejected' && req.rejectedAt && (
                  <div className="cr-wait-badge" style={{ backgroundColor: 'rgba(255, 77, 77, 0.15)', color: '#ff4d4d', border: '1px solid rgba(255, 77, 77, 0.3)' }}>
                    <i className="fas fa-user-times"></i>
                    {calculateWaitTime(req.rejectedAt)} önce bu talebi reddettiniz
                  </div>
                )}

                <div className="cr-row cr-row--client">
                  <span className="cr-label">Talep Eden</span>
                  <span className="cr-client-name">
                    {sanitizeText(req.client)}
                    <span className="cr-source-badge" style={{
                      marginLeft: '8px',
                      fontSize: '10px',
                      padding: '2px 6px',
                      borderRadius: '12px',
                      background: req.createdBy === 'customer' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(59, 130, 246, 0.15)',
                      color: req.createdBy === 'customer' ? '#10b981' : '#3b82f6'
                    }}>
                      {getRequestSourceLabel(req.createdBy)}
                    </span>
                  </span>
                </div>

                <div className="cr-row--datetime">
                  <div>
                    <span className="cr-label">{activeTab === 'pending' ? 'Randevu Tarihi' : 'Talep Edilen Tarih'}</span>
                    <div>
                      <i className="fas fa-calendar-alt"></i>
                      <span className="cr-date-val">{sanitizeText(req.date)}</span>
                    </div>
                  </div>
                  <div>
                    <span className="cr-label">{activeTab === 'pending' ? 'Randevu Saati' : 'Talep Edilen Saat'}</span>
                    <div>
                      <i className="fas fa-clock"></i>
                      <span className="cr-time-val">{sanitizeText(req.start)}</span>
                      {activeTab === 'pending' && <span className="cr-time-note"> (Bitiş saati uzman tarafından belirlenir)</span>}
                    </div>
                  </div>
                </div>

                {activeTab === 'pending' && (
                  <div className="cr-row--location">
                    <span className="cr-label">Randevu Lokasyonu</span>
                    <div className="cr-location-val">
                      <i className="fas fa-map-marker-alt cr-map-icon"></i>
                      {sanitizeText(req.fullAddress) || 'Adres belirtilmedi'}
                    </div>
                  </div>
                )}

                {activeTab === 'pending' ? (
                  <div className="cr-note-box">
                    <span className="cr-note-title">Talep Notu</span>
                    <span className="cr-note-text">"{sanitizeText(req.note) || 'Açıklama eklenmedi.'}"</span>
                  </div>
                ) : (
                  <div className="cr-note-box" style={{ borderLeft: '3px solid #ff4d4d', background: 'rgba(255, 77, 77, 0.05)' }}>
                    <span className="cr-note-title" style={{ color: '#ff4d4d' }}>Reddetme Sebebiniz</span>
                    <span className="cr-note-text">"{sanitizeText(req.expertRejectNote) || 'Bir sebep belirtilmedi.'}"</span>
                  </div>
                )}
              </div>

              {activeTab === 'pending' && (
                <div className="cr-card-action">
                  <span className="cr-action-label">
                    Detayları İncele 
                    <i className="fas fa-arrow-right"></i>
                  </span>
                </div>
              )}
            </div>
          )) : (
            <div className="cr-empty">
              <i className="fas fa-inbox"></i>
              <p>✨ Henüz {activeTab === 'pending' ? 'bekleyen' : 'reddedilen'} bir talep bulunmuyor</p>
              <small style={{ color: 'var(--text-secondary)', marginTop: '0.5rem', display: 'block' }}>
                Müşterilerden veya diğer uzmanlardan gelen talepler burada görünecek
              </small>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default CustomerRequests;