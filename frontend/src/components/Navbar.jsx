// frontend/src/components/Navbar.jsx

import React, { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import {
  doc,
  collection,
  query,
  where,
  onSnapshot,
} from 'firebase/firestore';

import TokenModal from './TokenModal';
import { auth, db } from '../firebase/firebaseClient';
import ThemeSwitch from './ThemeSwitch';
import DOMPurify from 'dompurify';

import '../styles/Navbar.css';

import logo from '../assets/pictures/logoArabicNoWriting.png';
import defaultAvatar from '../assets/pictures/logoArabicNoBackground.png';

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

  const [
    unreadNotificationsCount,
    setUnreadNotificationsCount,
  ] = useState(0);

  // Syria Arabic launch: appointment counters disabled.
  // const [pendingAppointmentsCount, setPendingAppointmentsCount] =
  //   useState(0);

  const [userType, setUserType] = useState(null);
  const [profilePhotoUrl, setProfilePhotoUrl] = useState(null);

  const [tokenBalance, setTokenBalance] = useState(0);

  const [isTokenPanelOpen, setIsTokenPanelOpen] = useState(false);

  const [profileCompleted, setProfileCompleted] = useState(false);

  const [
    firestoreDisplayName,
    setFirestoreDisplayName,
  ] = useState('');

  // const [hasTodayAppointment, setHasTodayAppointment] = useState(false);

  const location = useLocation();
  const navigate = useNavigate();

  const closeMobileMenu = () => {
    setMobileMenuOpen(false);
  };

  /*
    إغلاق القوائم المفتوحة عند الانتقال إلى صفحة أخرى.
  */
  useEffect(() => {
    setMobileMenuOpen(false);
    setDropdownOpen(false);
  }, [location.pathname]);

  /*
    منع تمرير الصفحة عندما تكون قائمة الهاتف مفتوحة،
    مع دعم إغلاقها بزر Escape.
  */
  useEffect(() => {
    if (!mobileMenuOpen) return undefined;

    const previousOverflow = document.body.style.overflow;

    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        closeMobileMenu();
      }
    };

    document.body.style.overflow = 'hidden';

    document.addEventListener('keydown', handleEscape);

    return () => {
      document.body.style.overflow = previousOverflow;

      document.removeEventListener('keydown', handleEscape);
    };
  }, [mobileMenuOpen]);

  const getUnreadTotalFromConversations = (
    conversations,
    currentUid
  ) => {
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

  /*
    مراقبة تسجيل الدخول وبيانات المستخدم.
  */
  useEffect(() => {
    let unsubscribeUser = () => {};

    const unsubscribeAuth = onAuthStateChanged(
      auth,
      (currentUser) => {
        setUser(currentUser);

        if (currentUser) {
          const userRef = doc(db, 'users', currentUser.uid);

          unsubscribeUser = onSnapshot(
            userRef,
            (docSnap) => {
              if (docSnap.exists()) {
                const userData = docSnap.data();

                setUserType(userData.userType || null);

                setProfileCompleted(
                  userData.profileCompleted || false
                );

                setProfilePhotoUrl(
                  userData.profilePhotoUrl || null
                );

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
            },
            (error) => {
              if (isDevelopment) {
                console.error(
                  'حدث خطأ أثناء قراءة بيانات المستخدم في شريط التنقل:',
                  error.message
                );
              }

              setLoading(false);
            }
          );
        } else {
          setUserType(null);
          setProfileCompleted(false);
          setProfilePhotoUrl(null);
          setFirestoreDisplayName('');

          // setHasTodayAppointment(false);

          setLoading(false);
        }
      }
    );

    return () => {
      unsubscribeAuth();
      unsubscribeUser();
    };
  }, []);

  /*
    تحميل عدد الرسائل غير المقروءة.
  */
  useEffect(() => {
    let cancelled = false;
    let intervalId = null;

    async function loadUnreadCount() {
      try {
        if (!user) {
          if (!cancelled) {
            setUnreadCount(0);
          }

          return;
        }

        const conversations = await fetchMyConversations();

        if (cancelled) return;

        const total = getUnreadTotalFromConversations(
          conversations || [],
          user.uid
        );

        if (!cancelled) {
          setUnreadCount(total);
        }
      } catch {
        if (!cancelled) {
          setUnreadCount(0);
        }
      }
    }

    loadUnreadCount();

    intervalId = setInterval(loadUnreadCount, 3000);

    return () => {
      cancelled = true;

      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [user]);

  /*
    مراقبة رصيد الرموز الخاص بالخبير.
  */
  useEffect(() => {
    if (!user?.uid) {
      setTokenBalance(0);
      return undefined;
    }

    const providerRef = doc(
      db,
      'service_providers',
      user.uid
    );

    const unsubscribe = onSnapshot(
      providerRef,
      (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();

          const currentTokenValue =
            data.currentTokenCount !== undefined
              ? data.currentTokenCount
              : data.tokenBalance;

          setTokenBalance(currentTokenValue || 0);
        } else {
          setTokenBalance(0);
        }
      },
      (error) => {
        if (isDevelopment) {
          console.error(
            'حدث خطأ أثناء قراءة رصيد الرموز في شريط التنقل:',
            error.message
          );
        }
      }
    );

    return () => unsubscribe();
  }, [user?.uid]);

  /*
    مراقبة الإشعارات غير المقروءة.
    جرس الإشعارات مخفي حالياً، لكن المراقبة محفوظة
    لاستخدام الإشعارات الداخلية.
  */
  useEffect(() => {
    if (!user?.uid) {
      setUnreadNotificationsCount(0);
      return undefined;
    }

    const uid = user.uid;

    let isInitialSnapshot = true;

    const notificationsQuery = query(
      collection(db, 'notifications'),
      where('userId', '==', uid),
      where('read', '==', false)
    );

    const notificationsUnsubscribe = onSnapshot(
      notificationsQuery,
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
        if (isDevelopment) {
          console.debug(
            'تعذرت قراءة الإشعارات:',
            error?.message
          );
        }
      }
    );

    return () => {
      notificationsUnsubscribe();
    };
  }, [user?.uid]);

  /*
    Syria Arabic launch:
    appointment pending-count listener disabled.

    useEffect(() => {
      if (!user?.uid || userType !== 'PROVIDER') {
        setPendingAppointmentsCount(0);
        return;
      }

      const uid = user.uid;

      const appointmentsQuery = query(
        collection(db, 'appointments'),
        where('expertId', '==', uid),
        where('status', 'in', [
          'pending',
          'reschedule_pending',
        ])
      );

      const unsubscribe = onSnapshot(
        appointmentsQuery,
        (snapshot) => {
          setPendingAppointmentsCount(snapshot.size);
        },
        () => setPendingAppointmentsCount(0)
      );

      return () => unsubscribe();
    }, [user?.uid, userType]);
  */

  /*
    Syria Arabic launch:
    today's appointment listener disabled.

    useEffect(() => {
      if (!user?.uid || userType !== 'PROVIDER') {
        setHasTodayAppointment(false);
        return;
      }

      const today = new Date().toISOString().split('T')[0];

      const appointmentsQuery = query(
        collection(db, 'appointments'),
        where('clientId', '==', user.uid),
        where('createdBy', '==', 'expert_request'),
        where('status', '==', 'approved'),
        where('date', '==', today)
      );

      const unsubscribe = onSnapshot(
        appointmentsQuery,
        (snapshot) => {
          setHasTodayAppointment(snapshot.size > 0);
        },
        (error) => {
          if (isDevelopment) {
            console.error(
              'حدث خطأ أثناء التحقق من مواعيد اليوم:',
              error
            );
          }

          setHasTodayAppointment(false);
        }
      );

      return () => unsubscribe();
    }, [user?.uid, userType]);
  */

  /*
    إغلاق قائمة المستخدم عند الضغط خارجها.
  */
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (!event.target.closest('.user-profile-menu')) {
        setDropdownOpen(false);
      }
    };

    document.addEventListener(
      'mousedown',
      handleClickOutside
    );

    return () => {
      document.removeEventListener(
        'mousedown',
        handleClickOutside
      );
    };
  }, []);

  const handleLogout = async () => {
    try {
      await signOut(auth);

      setDropdownOpen(false);
      setMobileMenuOpen(false);

      navigate('/');
    } catch (error) {
      if (isDevelopment) {
        console.error(
          'حدث خطأ أثناء تسجيل الخروج:',
          error
        );
      }
    }
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

  /*
    تحديد نوع الصفحة اعتماداً على المسارات العربية الجديدة.
  */
  const getPageType = () => {
    const path = location.pathname;

    if (path.startsWith('/admin')) {
      return PAGE_TYPES.ADMIN;
    }

    if (path.startsWith('/dashboard')) {
      return PAGE_TYPES.DASHBOARD;
    }

    if (path.startsWith('/إعلان/')) {
      return PAGE_TYPES.AD_DETAIL;
    }

    if (path === '/الإعلانات') {
      return PAGE_TYPES.ADS;
    }

    if (
      path === '/login' ||
      path === '/register' ||
      path === '/نسيت-كلمة-المرور'
    ) {
      return PAGE_TYPES.AUTH;
    }

    if (
      path.startsWith('/profile') ||
      path.startsWith('/الرسائل') ||
      path.startsWith('/الإشعارات')
    ) {
      return PAGE_TYPES.USER;
    }

    if (
      path.startsWith('/ملف-الخبير') ||
      path.startsWith('/خبير/')
    ) {
      return PAGE_TYPES.EXPERT;
    }

    return PAGE_TYPES.PUBLIC;
  };

  const pageType = getPageType();

  const getUserDisplayName = () => {
    const name =
      firestoreDisplayName ||
      user?.email?.split('@')[0] ||
      'مستخدم';

    return sanitizeText(name);
  };

  const getUserAvatar = () => {
    if (profilePhotoUrl) {
      return profilePhotoUrl;
    }

    return defaultAvatar;
  };

  const renderRightContent = () => {
    if (loading) return null;

    if (user) {
      return (
        <>
          {/* Token balance badge removed for Syria launch. */}

          <Link
            to="/الإشعارات"
            className="navbar-icon-link"
            title="الإشعارات"
          >
            <i className="fas fa-bell"></i>

            {unreadNotificationsCount > 0 && (
              <span className="notification-badge">
                {unreadNotificationsCount > 99 ? '99+' : unreadNotificationsCount}
              </span>
            )}
          </Link>

          <Link
            to="/الرسائل"
            className="navbar-icon-link"
            title="الرسائل"
          >
            <i className="fas fa-envelope"></i>

            {unreadCount > 0 && (
              <span className="notification-badge">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </Link>

          <div className="user-profile-menu">
            <button
              type="button"
              className="user-profile-trigger"
              onClick={() => {
                setDropdownOpen((previousValue) => {
                  return !previousValue;
                });
              }}
              aria-expanded={dropdownOpen}
              aria-haspopup="menu"
            >
              <img
                src={getUserAvatar()}
                alt={getUserDisplayName()}
                className="user-avatar-small"
                onError={(event) => {
                  event.currentTarget.src = defaultAvatar;
                }}
              />

              <span className="user-name-text">
                {getUserDisplayName()}
              </span>

              <i
                className={`fas fa-chevron-${
                  dropdownOpen ? 'up' : 'down'
                }`}
                aria-hidden="true"
              ></i>
            </button>

            {dropdownOpen && (
              <div
                className="dropdown-content"
                role="menu"
              >
                {userType === 'PROVIDER' ? (
                  <>
                    <Link
                      to="/ملف-الخبير"
                      onClick={() => setDropdownOpen(false)}
                    >
                      <i className="fa-solid fa-user-tie"></i>

                      <span>ملفي الشخصي كخبير</span>
                    </Link>

                    {/*
                      رابط المواعيد أزيل من النسخة السورية.
                    */}
                  </>
                ) : (
                  <Link
                    to="/ملفي"
                    onClick={() => setDropdownOpen(false)}
                  >
                    <i className="fa-regular fa-user"></i>

                    <span>ملفي الشخصي</span>
                  </Link>
                )}

                {userType !== 'CLIENT' && (
                  <Link
                    to="/الإعلانات"
                    onClick={() => setDropdownOpen(false)}
                  >
                    <i className="fa-solid fa-rectangle-list"></i>

                    <span>الإعلانات</span>
                  </Link>
                )}

                <Link
                  to="/المفضلة"
                  onClick={() => setDropdownOpen(false)}
                >
                  <i className="fa-solid fa-heart"></i>

                  <span>مفضلتي</span>
                </Link>

                <Link
                  to="/الإشعارات"
                  onClick={() => setDropdownOpen(false)}
                >
                  <i className="fa-solid fa-bell"></i>

                  <span>الإشعارات</span>
                </Link>

                <Link
                  to="/من-نحن"
                  onClick={() => setDropdownOpen(false)}
                >
                  <i className="fa-solid fa-circle-info"></i>

                  <span>من نحن</span>
                </Link>

                {/*
                  رابط سياسة الخصوصية أزيل من القائمة
                  في النسخة السورية.
                */}

                <hr />

                <button
                  type="button"
                  onClick={handleLogout}
                  className="dropdown-logout-btn"
                >
                  <i className="fa-solid fa-power-off"></i>

                  <span>تسجيل الخروج</span>
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
            <i className="fas fa-arrow-left"></i>

            <span>العودة للرئيسية</span>
          </Link>
        );

      default:
        return (
          <>
            <Link
              to="/register"
              className="nav-button nav-button--signup"
            >
              إنشاء حساب
            </Link>

            <Link
              to="/login"
              className="nav-button nav-button--signin"
            >
              تسجيل الدخول
            </Link>
          </>
        );
    }
  };

  return (
    <>
      <header className="navbar">
        <div
          className="navbar-container"
          dir="rtl"
        >
          <div className="navbar-brand">
            <Link
              to="/"
              className="navbar-brand-link"
            >
              <div className="brand-badge">
                <img
                  className="brand-badge-img"
                  src={logo}
                  alt="خبير"
                />
              </div>

              <span className="brand-title">
                {/* خ + ب مع الامتداد */}

                <span className="outer-letter">
                  {'خ\u0640\u0640ب\u0640\u0640\u0640\u0640\u200D'}
                </span>

                {/* حرف ي باللون البرتقالي */}

                <span className="inner-letters">
                  {'\u200Dي\u0640\u0640\u0640\u0640\u0640\u200D'}
                </span>

                {/* حرف ر */}

                <span className="outer-letter">
                  {'\u200D\u0640\u0640ر'}
                </span>
              </span>
            </Link>
          </div>

          <nav className="navbar-links">
            <Link
              to="/"
              className="navbar-link"
            >
              الرئيسية
            </Link>

            <Link
              to="/اتصل-بنا"
              className="navbar-link"
            >
              اتصل بنا
            </Link>

            {!user && (
              <Link
                to="/الإعلانات"
                className="navbar-link"
              >
                الإعلانات
              </Link>
            )}

            {userType === 'PROVIDER' && (
              <>
                <Link
                  to="/خبير/إعلاناتي"
                  className="navbar-link"
                >
                  إعلاناتي
                </Link>

                {/*
                  رابط تقويم المواعيد أزيل من النسخة السورية.
                */}
              </>
            )}

            {userType === 'CLIENT' && (
              <>
                <Link
                  to="/الإعلانات"
                  className="navbar-link"
                >
                  الإعلانات
                </Link>

                {/*
                  رابط المواعيد أزيل من النسخة السورية.
                */}
              </>
            )}

            {userType === 'PENDING_PROVIDER' &&
              !profileCompleted && (
                <Link
                  to="/إكمال-ملف-الخبير"
                  className="navbar-badge pending-badge"
                >
                  <i className="fas fa-hourglass-half"></i>

                  <span>أكمل الملف الشخصي</span>
                </Link>
              )}
          </nav>

          {mobileMenuOpen && (
            <>
              <div
                className="mobile-menu-overlay"
                onClick={closeMobileMenu}
                role="presentation"
              ></div>

              <div
                id="mobile-navigation-menu"
                className="mobile-menu"
                role="dialog"
                aria-modal="true"
                aria-label="القائمة الرئيسية"
              >
                <Link
                  to="/"
                  onClick={closeMobileMenu}
                >
                  <i
                    className="fas fa-house"
                    aria-hidden="true"
                  ></i>

                  <span>الرئيسية</span>
                </Link>

                <Link
                  to="/اتصل-بنا"
                  onClick={closeMobileMenu}
                >
                  اتصل بنا
                </Link>

                {!user && (
                  <Link
                    to="/الإعلانات"
                    onClick={closeMobileMenu}
                  >
                    الإعلانات
                  </Link>
                )}

                {userType === 'PROVIDER' && (
                  <>
                    <Link
                      to="/خبير/إعلاناتي"
                      onClick={closeMobileMenu}
                    >
                      إعلاناتي
                    </Link>

                    {/*
                      رابط تقويم المواعيد أزيل
                      من قائمة الهاتف.
                    */}
                  </>
                )}

                {userType === 'CLIENT' && (
                  <>
                    <Link
                      to="/الإعلانات"
                      onClick={closeMobileMenu}
                    >
                      الإعلانات
                    </Link>
                  </>
                )}

                {userType === 'PENDING_PROVIDER' &&
                  !profileCompleted && (
                    <Link
                      to="/إكمال-ملف-الخبير"
                      className="mobile-pending-badge"
                      onClick={closeMobileMenu}
                    >
                      <i className="fas fa-hourglass-half"></i>

                      <span>أكمل الملف الشخصي</span>
                    </Link>
                  )}

                {user && (
                  <>
                    <div
                      className="mobile-menu-divider"
                      aria-hidden="true"
                    ></div>

                    <Link
                      to="/الرسائل"
                      onClick={closeMobileMenu}
                    >
                      <i
                        className="fas fa-envelope"
                        aria-hidden="true"
                      ></i>

                      <span>الرسائل</span>

                      {unreadCount > 0 && (
                        <span className="mobile-count-badge">
                          {unreadCount > 99
                            ? '99+'
                            : unreadCount}
                        </span>
                      )}
                    </Link>

                    <Link
                      to="/الإشعارات"
                      onClick={closeMobileMenu}
                    >
                      <i
                        className="fas fa-bell"
                        aria-hidden="true"
                      ></i>

                      <span>الإشعارات</span>

                      {unreadNotificationsCount > 0 && (
                        <span className="mobile-count-badge">
                          {unreadNotificationsCount > 99
                            ? '99+'
                            : unreadNotificationsCount}
                        </span>
                      )}
                    </Link>

                    <Link
                      to={
                        userType === 'PROVIDER'
                          ? '/ملف-الخبير'
                          : '/ملفي'
                      }
                      onClick={closeMobileMenu}
                    >
                      <i
                        className="fas fa-user"
                        aria-hidden="true"
                      ></i>

                      <span>الملف الشخصي</span>
                    </Link>

                    <Link
                      to="/المفضلة"
                      onClick={closeMobileMenu}
                    >
                      <i
                        className="fas fa-heart"
                        aria-hidden="true"
                      ></i>

                      <span>مفضلتي</span>
                    </Link>

                    <Link
                      to="/من-نحن"
                      onClick={closeMobileMenu}
                    >
                      <i
                        className="fas fa-circle-info"
                        aria-hidden="true"
                      ></i>

                      <span>من نحن</span>
                    </Link>

                    <button
                      type="button"
                      className="mobile-menu-logout"
                      onClick={handleLogout}
                    >
                      <i
                        className="fas fa-power-off"
                        aria-hidden="true"
                      ></i>

                      <span>تسجيل الخروج</span>
                    </button>
                  </>
                )}

                {!user && (
                  <div className="mobile-menu-auth">
                    <Link
                      to="/register"
                      className="mobile-register-btn"
                      onClick={closeMobileMenu}
                    >
                      إنشاء حساب
                    </Link>

                    <Link
                      to="/login"
                      className="mobile-login-btn"
                      onClick={closeMobileMenu}
                    >
                      تسجيل الدخول
                    </Link>
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
            type="button"
            className={`mobile-menu-btn ${
              mobileMenuOpen ? 'active' : ''
            }`}
            onClick={() => {
              setMobileMenuOpen((previousValue) => {
                return !previousValue;
              });
            }}
            aria-label={
              mobileMenuOpen
                ? 'إغلاق القائمة'
                : 'فتح القائمة'
            }
            aria-expanded={mobileMenuOpen}
            aria-controls="mobile-navigation-menu"
          >
            <span></span>
            <span></span>
            <span></span>
          </button>
        </div>
      </header>

      {/*
        Syria Arabic launch:
        appointment penalty banner disabled.

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
  الأجزاء المعطلة في النسخة السورية:

  1. جرس الإشعارات.
  2. روابط المواعيد.
  3. رابط KVKK داخل القائمة.
  4. التتبع المباشر للخدمة.
  5. رصيد الرموز في شريط التنقل.
  6. تقويم المواعيد.
  7. مركز العمل المباشر.
*/

export default Navbar;
