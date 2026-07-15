import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc, collection, query, where, onSnapshot } from 'firebase/firestore';
import TokenModal from './TokenModal'; 
import { auth, db } from '../firebase/firebaseClient';
import ThemeSwitch from './ThemeSwitch';
import MobilePageActions from './MobilePageActions';
import DOMPurify from 'dompurify';
import '../styles/Navbar.css';
import logo from '../assets/pictures/LogoArabicNoWriting.png';
import defaultAvatar from '../assets/pictures/LogoArabicNobackground.png';
import { fetchMyConversations } from '../services/chatApi';
// Syria Arabic launch: appointment penalty banner disabled.
// import PenaltyBanner from './PenaltyBanner';
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
  // Syria Arabic launch: appointment counters disabled.
  // const [pendingAppointmentsCount, setPendingAppointmentsCount] = useState(0);
  const [userType, setUserType] = useState(null);
  const [profilePhotoUrl, setProfilePhotoUrl] = useState(null);
  const [tokenBalance, setTokenBalance] = useState(0);
  const [showTokenTooltip, setShowTokenTooltip] = useState(false);
  const [isTokenPanelOpen, setIsTokenPanelOpen] = useState(false);
  const [profileCompleted, setProfileCompleted] = useState(false);
  const [firestoreDisplayName, setFirestoreDisplayName] = useState('');
  // const [hasTodayAppointment, setHasTodayAppointment] = useState(false);

  const location = useLocation();
  const navigate = useNavigate();

  const closeMobileMenu = () => {
    setMobileMenuOpen(false);
  };

  useEffect(() => {
    setMobileMenuOpen(false);
    setDropdownOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!mobileMenuOpen) return undefined;

    const previousOverflow = document.body.style.overflow;
    const handleEscape = (event) => {
      if (event.key === 'Escape') closeMobileMenu();
    };

    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleEscape);
    };
  }, [mobileMenuOpen]);

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
              'مستخدم'
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
        // setHasTodayAppointment(false);
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
                'تم إلغاء طلبك لأن موعد البداية أقل من 30 دقيقة. يرجى إنشاء طلب جديد بعد 30 دقيقة على الأقل.',
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

  /* Syria Arabic launch: appointment pending-count listener disabled.
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
  */

  /* Syria Arabic launch: today's appointment listener disabled.
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
  */

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
    const name = firestoreDisplayName || user?.email?.split('@')[0] || 'مستخدم';
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
          {/* Token balance badge removed for Syria Launch */}

          {/* Notification bell removed for Syria Launch */}

          <Link to="/mesajlar" className="navbar-icon-link" title="الرسائل">
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
                      <i className="fa-solid fa-user-tie"></i> ملفي الشخصي كخبير
                    </Link>
                    {/* "Randevularım" dropdown link removed for Syria Launch */}
                  </>
                ) : (
                  <Link to="/profile" onClick={() => setDropdownOpen(false)}>
                    <i className="fa-regular fa-user"></i> ملفي الشخصي
                  </Link>
                )}

                {userType !== 'CLIENT' && (
                  <Link to="/ilanlar" onClick={() => setDropdownOpen(false)}>
                    <i className="fa-solid fa-rectangle-list"></i> الإعلانات
                  </Link>
                )}

                <Link to="/favoriler" onClick={() => setDropdownOpen(false)}>
                  <i className="fa-solid fa-heart"></i> مفضلتي
                </Link>

                <Link to="/hakkımızda" onClick={() => setDropdownOpen(false)}>
                  <i className="fa-solid fa-circle-info"></i> من نحن
                </Link>

                {/* "KVKK" dropdown link removed for Syria Launch */}

                {/* "Canlı İşbaşı" dropdown link removed for Syria Launch */}

                {/* "Canlı Hizmet Takibi" dropdown links removed for Syria Launch */}

                <hr />

                <button onClick={handleLogout} className="dropdown-logout-btn">
                  <i className="fa-solid fa-power-off"></i> تسجيل الخروج
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
            <i className="fas fa-arrow-left"></i> العودة للرئيسية
          </Link>
        );
      default:
        return (
          <>
            <Link to="/register" className="nav-button nav-button--signup">إنشاء حساب</Link>
            <Link to="/login" className="nav-button nav-button--signin">تسجيل الدخول</Link>
          </>
        );
    }
  };

  return (
    <>
      <header className="navbar">
        <div className="navbar-container" dir="rtl">
          <div className="navbar-brand">
            <Link to="/" className="navbar-brand-link">
              <div className="brand-badge">
                <img className="brand-badge-img " src={logo} alt="خبير" />
              </div>
              <span className="brand-title">
                {/* خ + ب (Plus the long stretch following ب) */}
                <span className="outer-letter">
                  {"خ\u0640\u0640ب\u0640\u0640\u0640\u0640\u200D"}
                </span>
  
                {/* ي (Isolated in Orange + Its trailing stretch) */}
                <span className="inner-letters">
                  {"\u200Dي\u0640\u0640\u0640\u0640\u0640\u200D"}
                </span>
  
                {/* ر (With its leading stretch) */}
                <span className="outer-letter">
                  {"\u200D\u0640\u0640ر"}
                </span>
              </span>
            </Link>
          </div>

          <MobilePageActions showHome={false} />

          <nav className="navbar-links">
            <Link to="/" className="navbar-link">الرئيسية</Link>
            <Link to="/iletisim" className="navbar-link">اتصل بنا</Link>

            {!user && (
              <Link to="/ilanlar" className="navbar-link">الإعلانات</Link>
            )}

            {userType === 'PROVIDER' && (
              <>
                <Link to="/uzman/ilanlarim" className="navbar-link">إعلاناتي</Link>
                {/* "Randevu Takvimi" link removed for Syria Launch */}
              </>
            )}

            {userType === 'CLIENT' && (
              <>
                <Link to="/ilanlar" className="navbar-link">الإعلانات</Link>
                {/* "Randevularım" link removed for Syria Launch */}
              </>
            )}

            {userType === 'PENDING_PROVIDER' && !profileCompleted && (
              <Link to="/expert-complete-profile" className="navbar-badge pending-badge">
                <i className="fas fa-hourglass-half"></i> أكمل الملف الشخصي
              </Link>
            )}
          </nav>

          {mobileMenuOpen && (
            <>
              <div className="mobile-menu-overlay" onClick={closeMobileMenu}></div>
              <div
                id="mobile-navigation-menu"
                className="mobile-menu"
                role="dialog"
                aria-modal="true"
                aria-label="القائمة الرئيسية"
              >
                <Link to="/" onClick={closeMobileMenu}>
                  <i className="fas fa-house" aria-hidden="true"></i>
                  الرئيسية
                </Link>
                <Link to="/iletisim" onClick={closeMobileMenu}>اتصل بنا</Link>

                {!user && (
                  <Link to="/ilanlar" onClick={closeMobileMenu}>الإعلانات</Link>
                )}

                {userType === 'PROVIDER' && (
                  <>
                    <Link to="/uzman/ilanlarim" onClick={closeMobileMenu}>إعلاناتي</Link>
                    {/* "Randevu Takvimi" mobile link removed for Syria Launch */}
                  </>
                )}

                {userType === 'CLIENT' && (
                  <>
                    <Link to="/ilanlar" onClick={closeMobileMenu}>الإعلانات</Link>
                    {/* "Randevularım" link removed for Syria Launch */}
                  </>
                )}

                {userType === 'PENDING_PROVIDER' && !profileCompleted && (
                  <Link to="/expert-complete-profile" className="mobile-pending-badge" onClick={closeMobileMenu}>
                    <i className="fas fa-hourglass-half"></i> أكمل الملف الشخصي
                  </Link>
                )}

                {user && (
                  <>
                    <div className="mobile-menu-divider" aria-hidden="true"></div>

                    <Link to="/mesajlar" onClick={closeMobileMenu}>
                      <i className="fas fa-envelope" aria-hidden="true"></i>
                      <span>الرسائل</span>
                      {unreadCount > 0 && (
                        <span className="mobile-count-badge">
                          {unreadCount > 99 ? '99+' : unreadCount}
                        </span>
                      )}
                    </Link>

                    <Link
                      to={userType === 'PROVIDER' ? '/uzman-profil' : '/profile'}
                      onClick={closeMobileMenu}
                    >
                      <i className="fas fa-user" aria-hidden="true"></i>
                      الملف الشخصي
                    </Link>

                    <Link to="/favoriler" onClick={closeMobileMenu}>
                      <i className="fas fa-heart" aria-hidden="true"></i>
                      مفضلتي
                    </Link>

                    <button
                      type="button"
                      className="mobile-menu-logout"
                      onClick={handleLogout}
                    >
                      <i className="fas fa-power-off" aria-hidden="true"></i>
                      تسجيل الخروج
                    </button>
                  </>
                )}

                {!user && (
                  <div className="mobile-menu-auth">
                    <Link to="/register" className="mobile-register-btn" onClick={closeMobileMenu}>إنشاء حساب</Link>
                    <Link to="/login" className="mobile-login-btn" onClick={closeMobileMenu}>تسجيل الدخول</Link>
                  </div>
                )}
              </div>
            </>
          )}

          <div className="navbar-right">
            <ThemeSwitch />
            {renderRightContent()}
          </div>

          <button
            className={`mobile-menu-btn ${mobileMenuOpen ? 'active' : ''}`}
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label={mobileMenuOpen ? 'إغلاق القائمة' : 'فتح القائمة'}
            aria-expanded={mobileMenuOpen}
            aria-controls="mobile-navigation-menu"
          >
            <span></span>
            <span></span>
            <span></span>
          </button>
        </div>
      </header>

      {/* Syria Arabic launch: appointment penalty banner disabled.
      <PenaltyBanner />
      */}

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
7. Token Balance Badge ("saatlik ücret" / coins display on navbar)
8. Appointment Calendar ("randevu-takvimi" / جدول المواعيد) links from desktop & mobile menus
9. Live Work Center ("canli-isbasi-merkezi" / مركز العمل المباشر) dropdown link
*/

export default Navbar;
