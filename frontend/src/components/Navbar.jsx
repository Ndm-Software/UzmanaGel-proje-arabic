import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc, collection, query, where, onSnapshot } from 'firebase/firestore';
import TokenModal from './TokenModal'; 
import { auth, db } from '../firebase/firebaseClient';
import ThemeSwitch from './ThemeSwitch';
import DOMPurify from 'dompurify';
import '../styles/Navbar.css';
import logo from '../assets/pictures/logo.png';
import defaultAvatar from '../assets/pictures/logo.png';
import { fetchMyConversations } from '../services/chatApi';
import PenaltyBanner from './PenaltyBanner';
import { showAppToast } from '../utils/showAppToast';

const isDevelopment = process.env.NODE_ENV === 'development';

const sanitizeText = (text) => {
  if (!text) return '';
  return DOMPurify.sanitize(String(text));
};

const Navbar = () => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [unreadNotificationsCount, setUnreadNotificationsCount] = useState(0);
  const [pendingAppointmentsCount, setPendingAppointmentsCount] = useState(0);
  const [userType, setUserType] = useState(null);
  const [profilePhotoUrl, setProfilePhotoUrl] = useState(null);
  const [tokenBalance, setTokenBalance] = useState(0);
  const [showTokenTooltip, setShowTokenTooltip] = useState(false);
  const [isTokenPanelOpen, setIsTokenPanelOpen] = useState(false);
  const [profileCompleted, setProfileCompleted] = useState(false);
  const [firestoreDisplayName, setFirestoreDisplayName] = useState('');
  const [hasTodayAppointment, setHasTodayAppointment] = useState(false);

  const location = useLocation();
  const navigate = useNavigate();

  const closeMobileMenu = () => {
    setMobileMenuOpen(false);
  };

  const getUnreadTotalFromConversations = (conversations, currentUid) => {
    return conversations.reduce((sum, conversation) => {
      if (conversation.clientUid === currentUid) {
        return sum + (conversation.unreadCountClient || 0);
      }
      if (conversation.providerUid === currentUid) {
        return sum + (conversation.unreadCountProvider || 0);
      }
      return sum;
    }, 0);
  };

  useEffect(() => {
    let unsubscribeUser = () => {};

    const unsubscribeAuth = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        const userRef = doc(db, 'users', currentUser.uid);
        unsubscribeUser = onSnapshot(userRef, (docSnap) => {
          if (docSnap.exists()) {
            const userData = docSnap.data();
            setUserType(userData.userType || null);
            setProfileCompleted(userData.profileCompleted || false);
            setProfilePhotoUrl(userData.profilePhotoUrl || null);
            setFirestoreDisplayName(
              userData.displayName ||
              userData.email?.split('@')[0] ||
              'Kullanıcı'
            );
          } else {
            setUserType(null);
            setProfileCompleted(false);
            setProfilePhotoUrl(null);
            setFirestoreDisplayName('');
          }
          setLoading(false);
        }, (error) => {
          if (isDevelopment) console.error('Navbar kullanıcı verisi dinleme hatası:', error.message);
          setLoading(false);
        });
      } else {
        setUserType(null);
        setProfileCompleted(false);
        setProfilePhotoUrl(null);
        setFirestoreDisplayName('');
        setHasTodayAppointment(false);
        setLoading(false);
      }
    });

    return () => {
      unsubscribeAuth();
      unsubscribeUser();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let intervalId = null;

    async function loadUnreadCount() {
      try {
        if (!user) {
          if (!cancelled) setUnreadCount(0);
          return;
        }
        const conversations = await fetchMyConversations();
        if (cancelled) return;
        const total = getUnreadTotalFromConversations(conversations || [], user.uid);
        if (!cancelled) setUnreadCount(total);
      } catch {
        if (!cancelled) setUnreadCount(0);
      }
    }

    loadUnreadCount();
    intervalId = setInterval(loadUnreadCount, 3000);

    return () => {
      cancelled = true;
      if (intervalId) clearInterval(intervalId);
    };
  }, [user]);

  useEffect(() => {
    if (!user?.uid) {
      setTokenBalance(0);
      return;
    }

    const unsubscribe = onSnapshot(doc(db, "service_providers", user.uid), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        const guncelJeton = data.currentTokenCount !== undefined ? data.currentTokenCount : data.tokenBalance;
        setTokenBalance(guncelJeton || 0);
      }
    }, (error) => {
      if (isDevelopment) console.error("Navbar jeton dinleme hatası:", error.message);
    });

    return () => unsubscribe();
  }, [user?.uid]);

  useEffect(() => {
    if (!user?.uid) {
      setUnreadNotificationsCount(0);
      return;
    }

    const uid = user.uid;
    let isInitialSnapshot = true;

    const notifsUnsub = onSnapshot(
      query(collection(db, 'notifications'), where('userId', '==', uid), where('read', '==', false)),
      (snapshot) => {
        if (isInitialSnapshot) {
          isInitialSnapshot = false;
          setUnreadNotificationsCount(snapshot.size);
          return;
        }

        snapshot.docChanges().forEach((change) => {
          if (change.type !== 'added') return;
          const data = change.doc.data();
          if (data?.type === 'appointment_auto_cancelled') {
            showAppToast(
              data.message ||
                'Randevu talebiniz, başlangıç saatine 30 dakikadan az süre kaldığı için iptal edildi. Lütfen en az 30 dakika sonrası için yeni bir talep oluşturun.',
              'error'
            );
          }
        });

        setUnreadNotificationsCount(snapshot.size);
      },
      (error) => { 
        if (isDevelopment) console.debug('Bildirimler okunamıyor:', error?.message);
      }
    );

    return () => {
      notifsUnsub();
    };
  }, [user?.uid]);

  useEffect(() => {
    if (!user?.uid || userType !== 'PROVIDER') {
      setPendingAppointmentsCount(0);
      return;
    }

    const uid = user.uid;

    const q = query(
      collection(db, 'appointments'),
      where('expertId', '==', uid),
      where('status', 'in', ['pending', 'reschedule_pending'])
    );

    const unsub = onSnapshot(
      q,
      (snapshot) => {
        setPendingAppointmentsCount(snapshot.size);
      },
      () => setPendingAppointmentsCount(0)
    );

    return () => unsub();
  }, [user?.uid, userType]);

  useEffect(() => {
    if (!user?.uid || userType !== 'PROVIDER') {
      setHasTodayAppointment(false);
      return;
    }

    const today = new Date().toISOString().split('T')[0];
    
    const q = query(
      collection(db, 'appointments'),
      where('clientId', '==', user.uid),
      where('createdBy', '==', 'expert_request'),
      where('status', '==', 'approved'),
      where('date', '==', today)
    );

    const unsub = onSnapshot(q, (snapshot) => {
      setHasTodayAppointment(snapshot.size > 0);
    }, (error) => {
      if (isDevelopment) console.error('Bugünkü randevu kontrol hatası:', error);
      setHasTodayAppointment(false);
    });

    return () => unsub();
  }, [user?.uid, userType]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (!event.target.closest('.user-profile-menu')) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setDropdownOpen(false);
      setMobileMenuOpen(false);
      navigate('/');
    } catch {}
  };

  const PAGE_TYPES = {
    PUBLIC: 'public',
    ADS: 'ads',
    AD_DETAIL: 'adDetail',
    AUTH: 'auth',
    USER: 'user',
    DASHBOARD: 'dashboard',
    ADMIN: 'admin',
    EXPERT: 'expert',
  };

  const getPageType = () => {
    const path = location.pathname;
    if (path.startsWith('/admin')) return PAGE_TYPES.ADMIN;
    if (path.startsWith('/dashboard')) return PAGE_TYPES.DASHBOARD;
    if (path.startsWith('/ilan/')) return PAGE_TYPES.AD_DETAIL;
    if (path === '/ilanlar') return PAGE_TYPES.ADS;
    if (path === '/login' || path === '/register' || path === '/sifremi-unuttum') {
      return PAGE_TYPES.AUTH;
    }
    if (
      path.startsWith('/profile') ||
      path.startsWith('/mesajlar') ||
      path.startsWith('/bildirimler')
    ) {
      return PAGE_TYPES.USER;
    }
    return PAGE_TYPES.PUBLIC;
  };

  const pageType = getPageType();

  const getUserDisplayName = () => {
    const name = firestoreDisplayName || user?.email?.split('@')[0] || 'Kullanıcı';
    return sanitizeText(name);
  };

  const getUserAvatar = () => {
    if (profilePhotoUrl) return profilePhotoUrl;
    return defaultAvatar;
  };

  const renderRightContent = () => {
    if (loading) return null;

    if (user) {
      const showExpertTokens = userType === 'PROVIDER';

      return (
        <>
          {showExpertTokens && (
            <div
              className="navbar-token-wrapper"
              onMouseEnter={() => setShowTokenTooltip(true)}
              onMouseLeave={() => setShowTokenTooltip(false)}
            >
              <button
                type="button"
                className="navbar-token-badge"
                onClick={() => {
                  setIsTokenPanelOpen(true);
                }}
              >
                <span className="token-icon-circle">
                  <i className="fas fa-coins"></i>
                </span>
                <span className="token-amount-value">{tokenBalance}</span>
                <span className="token-plus-icon">+</span>
              </button>

              {showTokenTooltip && (
                <button
                  type="button"
                  className="token-tooltip-button"
                  onClick={() => setIsTokenPanelOpen(true)}
                >
                  Jeton Yükle
                </button>
              )}
            </div>
          )}

          {/* Notification bell removed for Syria Launch */}

          <Link to="/mesajlar" className="navbar-icon-link" title="Mesajlar">
            <i className="fas fa-envelope"></i>
            {unreadCount > 0 && (
              <span className="notification-badge">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </Link>

          <div className="user-profile-menu">
            <div
              className="user-profile-trigger"
              onClick={() => setDropdownOpen(!dropdownOpen)}
            >
              <img
                src={getUserAvatar()}
                alt={getUserDisplayName()}
                className="user-avatar-small"
                onError={(e) => { e.currentTarget.src = defaultAvatar; }}
              />
              <span className="user-name-text">{getUserDisplayName()}</span>
              <i className={`fas fa-chevron-${dropdownOpen ? 'up' : 'down'}`}></i>
            </div>

            {dropdownOpen && (
              <div className="dropdown-content">
                {userType === 'PROVIDER' ? (
                  <>
                    <Link to="/uzman-profil" onClick={() => setDropdownOpen(false)}>
                      <i className="fa-solid fa-user-tie"></i> Uzman Profilim
                    </Link>
                    {/* "Randevularım" dropdown link removed for Syria Launch */}
                  </>
                ) : (
                  <Link to="/profile" onClick={() => setDropdownOpen(false)}>
                    <i className="fa-regular fa-user"></i> Profilim
                  </Link>
                )}

                {userType !== 'CLIENT' && (
                  <Link to="/ilanlar" onClick={() => setDropdownOpen(false)}>
                    <i className="fa-solid fa-rectangle-list"></i> İlanlar
                  </Link>
                )}

                <Link to="/favoriler" onClick={() => setDropdownOpen(false)}>
                  <i className="fa-solid fa-heart"></i> Favorilerim
                </Link>

                <Link to="/hakkımızda" onClick={() => setDropdownOpen(false)}>
                  <i className="fa-solid fa-circle-info"></i> Hakkımızda
                </Link>

                {/* "KVKK" dropdown link removed for Syria Launch */}

                {userType === 'PROVIDER' && (
                  <Link to="/canli-isbasi-merkezi" onClick={() => setDropdownOpen(false)} style={{ fontWeight: 'bold' }}>
                    <i className="fas fa-satellite-dish" style={{ color: '#4ade80' }}></i> Canlı İşbaşı Merkezi
                  </Link>
                )}

                {/* "Canlı Hizmet Takibi" dropdown links removed for Syria Launch */}

                <hr />

                <button onClick={handleLogout} className="dropdown-logout-btn">
                  <i className="fa-solid fa-power-off"></i> Çıkış Yap
                </button>
              </div>
            )}
          </div>
        </>
      );
    }

    switch (pageType) {
      case PAGE_TYPES.AUTH:
        return (
          <Link to="/" className="navbar-link">
            <i className="fas fa-arrow-left"></i> Ana Sayfaya Dön
          </Link>
        );
      default:
        return (
          <>
            <Link to="/register" className="nav-button nav-button--signup">Kayıt Ol</Link>
            <Link to="/login" className="nav-button nav-button--signin">Giriş Yap</Link>
          </>
        );
    }
  };

  return (
    <>
      <header className="navbar">
        <div className="navbar-container">
          <div className="navbar-brand">
            <Link to="/" className="navbar-brand-link">
              <div className="brand-badge">
                <img className="brand-badge-img" src={logo} alt="UzmanaGel" />
              </div>
              <span className="brand-title">
                Uzmana<span className="highlight">Gel</span>
              </span>
            </Link>
          </div>

          <button 
            className={`mobile-menu-btn ${mobileMenuOpen ? 'active' : ''}`}
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Menü"
          >
            <span></span>
            <span></span>
            <span></span>
          </button>

          <nav className="navbar-links">
            <Link to="/" className="navbar-link">Ana Sayfa</Link>
            <Link to="/iletisim" className="navbar-link">İletişim</Link>

            {!user && (
              <Link to="/ilanlar" className="navbar-link">İlanlar</Link>
            )}

            {userType === 'PROVIDER' && (
              <>
                <Link to="/uzman/ilanlarim" className="navbar-link">İlanlarım</Link>
                <Link to="/randevu-takvimi" className="navbar-link">
                  Randevu Takvimi
                  {pendingAppointmentsCount > 0 && (
                    <span className="nav-count-badge" aria-label={`Bekleyen randevu sayısı: ${pendingAppointmentsCount}`}>
                      {pendingAppointmentsCount > 99 ? '99+' : pendingAppointmentsCount}
                    </span>
                  )}
                </Link>
              </>
            )}

            {userType === 'CLIENT' && (
              <>
                <Link to="/ilanlar" className="navbar-link">İlanlar</Link>
                {/* "Randevularım" link removed for Syria Launch */}
              </>
            )}

            {userType === 'PENDING_PROVIDER' && (
              !profileCompleted ? (
                <Link to="/expert-complete-profile" className="navbar-badge pending-badge">
                  <i className="fas fa-hourglass-half"></i> Profili Tamamla
                </Link>
              ) : (
                <span className="navbar-badge pending-badge" style={{ cursor: 'default', opacity: 0.7 }}>
                  <i className="fas fa-hourglass-half"></i> Onay Bekliyor
                </span>
              )
            )}
          </nav>

          {mobileMenuOpen && (
            <>
              <div className="mobile-menu-overlay" onClick={closeMobileMenu}></div>
              <div className="mobile-menu">
                <Link to="/" onClick={closeMobileMenu}>Ana Sayfa</Link>
                <Link to="/iletisim" onClick={closeMobileMenu}>İletişim</Link>

                {!user && (
                  <Link to="/ilanlar" onClick={closeMobileMenu}>İlanlar</Link>
                )}

                {userType === 'PROVIDER' && (
                  <>
                    <Link to="/uzman/ilanlarim" onClick={closeMobileMenu}>İlanlarım</Link>
                    <Link to="/randevu-takvimi" onClick={closeMobileMenu} className="mobile-menu-link-with-badge">
                      <span>Randevu Takvimi</span>
                      {pendingAppointmentsCount > 0 && (
                        <span className="mobile-count-badge" aria-label={`Bekleyen randevu sayısı: ${pendingAppointmentsCount}`}>
                          {pendingAppointmentsCount > 99 ? '99+' : pendingAppointmentsCount}
                        </span>
                      )}
                    </Link>
                  </>
                )}

                {userType === 'CLIENT' && (
                  <>
                    <Link to="/ilanlar" onClick={closeMobileMenu}>İlanlar</Link>
                    {/* "Randevularım" link removed for Syria Launch */}
                  </>
                )}

                {userType === 'PENDING_PROVIDER' && (
                  !profileCompleted ? (
                    <Link to="/expert-complete-profile" className="mobile-pending-badge" onClick={closeMobileMenu}>
                      <i className="fas fa-hourglass-half"></i> Profili Tamamla
                    </Link>
                  ) : (
                    <span className="mobile-pending-badge" style={{ cursor: 'default', opacity: 0.7 }}>
                      <i className="fas fa-hourglass-half"></i> Onay Bekliyor
                    </span>
                  )
                )}

                {!user && (
                  <div className="mobile-menu-auth">
                    <Link to="/register" className="mobile-register-btn" onClick={closeMobileMenu}>Kayıt Ol</Link>
                    <Link to="/login" className="mobile-login-btn" onClick={closeMobileMenu}>Giriş Yap</Link>
                  </div>
                )}
              </div>
            </>
          )}

          <div className="navbar-right">
            <ThemeSwitch />
            {renderRightContent()}
          </div>
        </div>
      </header>

      <PenaltyBanner />

      <TokenModal 
        isOpen={isTokenPanelOpen} 
        onClose={() => {
          setIsTokenPanelOpen(false);
        }}
        tokenBalance={tokenBalance} 
      />
    </>
  );
};

/*
REMOVED BLOCKS FOR SYRIA LAUNCH (TURKISH FRONTEND SIMPLIFICATION):

1. Notification Bell:
          <Link to="/bildirimler" className="navbar-icon-link" title="Bildirimler">
            <i className="fas fa-bell"></i>
            {unreadNotificationsCount > 0 && (
              <span className="notification-badge">
                {unreadNotificationsCount > 99 ? '99+' : unreadNotificationsCount}
              </span>
            )}
          </Link>

2. "Randevularım" in Dropdown:
                    <Link to="/customer-appointments" onClick={() => setDropdownOpen(false)}>
                      <i className="fas fa-calendar-check"></i> Randevularım
                    </Link>

3. "KVKK" in Dropdown:
                <Link to="/kvkk" onClick={() => setDropdownOpen(false)}>
                  <i className="fa-solid fa-shield-halved"></i> KVKK
                </Link>

4. "Canlı Hizmet Takibi" in Dropdown:
                {userType === 'CLIENT' ? (
                  <Link to="/canli-hizmet-takibi" onClick={() => setDropdownOpen(false)} style={{ fontWeight: 'bold' }}>
                    <i className="fas fa-broadcast-tower" style={{ color: '#60a5fa' }}></i> Canlı Hizmet Takibi
                  </Link>
                ) : hasTodayAppointment && (
                  <Link to="/canli-hizmet-takibi" onClick={() => setDropdownOpen(false)} style={{ fontWeight: 'bold' }}>
                    <i className="fas fa-broadcast-tower" style={{ color: '#60a5fa' }}></i> Canlı Hizmet Takibi
                  </Link>
                )}

5. "Randevularım" Desktop Navbar Link:
                <Link to="/customer-appointments" className="navbar-link">Randevularım</Link>

6. "Randevularım" Mobile Navbar Link:
                    <Link to="/customer-appointments" onClick={closeMobileMenu}>Randevularım</Link>
*/

export default Navbar;