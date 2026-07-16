import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Navbar from "../components/Navbar";
import { onAuthStateChanged } from "firebase/auth";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { auth, db } from "../firebase/firebaseClient";
import "../styles/HomePage.css";
import PageTransition from "../components/PageTransition";
import categoryImages from "../data/categoryImages";
import { getListingBackgroundStyle } from "../utils/listingImagePresentation";
import { fetchListings } from "../services/listingsApi";
import { toArabicServiceLabel } from "../utils/arabicLabels";
import { formatLatinNumber } from "../utils/localeFormat";

import HomePageLogo from "../assets/pictures/HomePageLogoArabic.png";
import AppBannerImage from "../assets/pictures/AppBanner1Arabic.png";
import handshakeImage from "../assets/pictures/handshake.png";
import costumerImage from "../assets/pictures/costumer.png";
import checkImage from "../assets/pictures/check.png";
import appleLogo from "../assets/pictures/apple-logo.png";
import googlePlayLogo from "../assets/pictures/google-play.png";
import happyFaceImage from "../assets/pictures/happy-face.png";
import badgeImage from "../assets/pictures/badge.png";
// Syria Arabic launch: completed jobs stat card is disabled.
// import completedImage from "../assets/pictures/completed.png";
import syriaImage from "../assets/pictures/syria.png";
import { fetchReviewCountsForListings } from "../services/reviewsApi";
// Syria Arabic launch: listing report actions are disabled on listing cards.
// import ListingReportButton from "../components/ListingReportButton";

const isDevelopment = process.env.NODE_ENV === 'development';

const categoryImageMap = {
  Tesisat: "https://images.pexels.com/photos/221027/pexels-photo-221027.jpeg?auto=compress&cs=tinysrgb&w=800",
  Temizlik: "https://images.pexels.com/photos/4239033/pexels-photo-4239033.jpeg?auto=compress&cs=tinysrgb&w=800",
  "Boyama & Badana": "https://images.unsplash.com/photo-1589939705384-5185137a7f0f?auto=format&fit=crop&w=800&q=80",
  "Bilgisayar & Yazılım": "https://images.unsplash.com/photo-1517694712202-14dd9538aa97?auto=format&fit=crop&w=800&q=80",
  Nakliyat: "https://images.unsplash.com/photo-1600585154526-990dced4db0d?auto=format&fit=crop&w=800&q=80",
  "Klima Servisi": "https://images.unsplash.com/photo-1621905251189-08b45d6a269e?auto=format&fit=crop&w=800&q=80",
  "Bahçe & Peyzaj": "https://images.unsplash.com/photo-1557429287-b2e26467fc2b?auto=format&fit=crop&w=800&q=80",
  "Özel Ders": "https://images.unsplash.com/photo-1503676260728-1c00da094a0b?auto=format&fit=crop&w=800&q=80",
  "Tadilat & Dekorasyon": "https://images.unsplash.com/photo-1504148455328-c376907d081c?auto=format&fit=crop&w=800&q=80",
  "Fotoğraf & Video": "https://images.unsplash.com/photo-1516035069371-29a1b244cc32?auto=format&fit=crop&w=800&q=80",
  "Web Tasarım": "https://images.unsplash.com/photo-1547658719-da2b51169166?auto=format&fit=crop&w=800&q=80",
  "Evcil Hayvan": "https://images.unsplash.com/photo-1548199973-03cce0bbc87b?auto=format&fit=crop&w=800&q=80",
  "Elektrik": "https://images.unsplash.com/photo-1621905252507-b35492cc74b4?auto=format&fit=crop&w=800&q=80",
  "Mobilya & Montaj": "https://images.unsplash.com/photo-1581539250439-c96689b516dd?auto=format&fit=crop&w=800&q=80",
  "Böcek İlaçlama": "https://images.unsplash.com/photo-1585412727339-54e4eae135c6?auto=format&fit=crop&w=800&q=80",
  "Müzik Dersi": "https://images.unsplash.com/photo-1511379938547-c1f69419868d?auto=format&fit=crop&w=800&q=80",
  "Spor & Fitness": "https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?auto=format&fit=crop&w=800&q=80",
  "Kuaför & Güzellik": "https://images.unsplash.com/photo-1560066984-13812e7c6e4e?auto=format&fit=crop&w=800&q=80",
  "Terapi & Koçluk": "https://images.unsplash.com/photo-1573497620053-ea5300f94f21?auto=format&fit=crop&w=800&q=80",
  "Organizasyon": "https://images.unsplash.com/photo-1511795409834-ef04bbd61622?auto=format&fit=crop&w=800&q=80",
  "Hukuk & Danışmanlık": "https://images.unsplash.com/photo-1589829545856-d10d557cf95f?auto=format&fit=crop&w=800&q=80",
  "Muhasebe": "https://images.unsplash.com/photo-1554224155-6726b3ff858f?auto=format&fit=crop&w=800&q=80",
  "Pazarlama": "https://images.unsplash.com/photo-1557838923-2985c318be48?auto=format&fit=crop&w=800&q=80",
  "Çeviri": "https://images.unsplash.com/photo-1456513080510-7bf3a84b82f8?auto=format&fit=crop&w=800&q=80",
  "Yemek & Catering": "https://images.unsplash.com/photo-1555244162-803834f70033?auto=format&fit=crop&w=800&q=80"
};

export default function HomePage() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [latestListings, setLatestListings] = useState([]);
  const [latestListingsLoading, setLatestListingsLoading] = useState(true);
  const [latestListingsError, setLatestListingsError] = useState("");
  const [isLightMode, setIsLightMode] = useState(false);
  const [platformStats, setPlatformStats] = useState({
    clientCount: 0,
    providerCount: 0,
    listingCount: 0,
    // Syria Arabic launch: completed jobs stat is disabled with its listener.
    // completedAppointmentsCount: 0,
  });

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const updateThemeState = () => {
      const currentTheme =
        document.documentElement.getAttribute("data-theme") || "dark";
      setIsLightMode(currentTheme === "light");
    };

    updateThemeState();

    const observer = new MutationObserver(() => {
      updateThemeState();
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadLatest = async () => {
      try {
        setLatestListingsLoading(true);
        setLatestListingsError("");

        const payload = await fetchListings({ page: 1, limit: 20 });
        const items = Array.isArray(payload?.items) ? payload.items : [];

        if (!cancelled) {
          setPlatformStats((prev) => ({
            ...prev,
            listingCount: Number(payload?.total) || 0,
          }));
        }

        const expertOnly = items.filter((item) => {
          const id = String(item?.id ?? "").trim();
          return id && !/^\d+$/.test(id);
        });

        if (!cancelled) {
          const firstPage = expertOnly.slice(0, 8);
          const counts = await fetchReviewCountsForListings(firstPage.map((x) => x.id));
          setLatestListings(
            firstPage.map((it) => ({
              ...it,
              reviews: counts?.[String(it.id)] ?? it.reviews ?? 0,
            }))
          );
        }
      } catch (error) {
        if (isDevelopment) console.error("Failed to load latest listings:", error.message);
        if (!cancelled) {
          setLatestListings([]);
          setLatestListingsError("تعذر تحميل الإعلانات.");
          setPlatformStats((prev) => ({ ...prev, listingCount: 0 }));
        }
      } finally {
        if (!cancelled) {
          setLatestListingsLoading(false);
        }
      }
    };

    loadLatest();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const unsubClients = onSnapshot(
      query(collection(db, "users"), where("userType", "==", "CLIENT")),
      (snapshot) => {
        setPlatformStats((prev) => ({
          ...prev,
          clientCount: snapshot.size,
        }));
      },
      (error) => {
        if (isDevelopment) console.error("Client count listener failed:", error);
      }
    );

    const unsubProviders = onSnapshot(
      query(collection(db, "users"), where("userType", "==", "PROVIDER")),
      (snapshot) => {
        setPlatformStats((prev) => ({ ...prev, providerCount: snapshot.size }));
      },
      (error) => {
        if (isDevelopment) console.error("Provider count listener failed:", error);
      }
    );

    /* Syria Arabic launch: completed jobs stat listener is disabled.
    let unsubCompletedAppointments = null;
    
    const setupCompletedListener = async () => {
      try {
        unsubCompletedAppointments = onSnapshot(
          query(collection(db, "appointments"), where("status", "==", "completed")),
          (snapshot) => {
            setPlatformStats((prev) => ({
              ...prev,
              completedAppointmentsCount: snapshot.size,
            }));
          },
          (error) => {
            if (isDevelopment) {
              console.error("Completed appointment count listener failed:", error);
            }
            setPlatformStats((prev) => ({ ...prev, completedAppointmentsCount: 0 }));
          }
        );
      } catch (error) {
        if (isDevelopment) console.error("Failed to setup completed listener:", error);
        setPlatformStats((prev) => ({ ...prev, completedAppointmentsCount: 0 }));
      }
    };
    
    setupCompletedListener();
    */

    return () => {
      unsubClients();
      unsubProviders();
      // Syria Arabic launch: completed jobs stat listener is disabled.
      // if (unsubCompletedAppointments) unsubCompletedAppointments();
    };
  }, []);

  const handleUzmanBulClick = () => {
    navigate("/login");
  };

  const handleUzmanOlClick = () => {
    navigate("/تسجيل-خبير");
  };

  const formatPrice = (value) => {
    const numeric = Number(value) || 0;
    return `${formatLatinNumber(numeric)} ليرة سورية جديدة`;
  };

  const formatCount = (value) =>
    formatLatinNumber(value);

  return (
    <PageTransition>
      <div className="landing-page">
        <Navbar />

        <main className="hero-section" id="home">
          <div className="hero-container">
            <section className="hero-content">
              <h1 className="hero-title">
                بكبسة زر واحدة <span className="hero-highlight">اعثر على خبيرك...</span>
                <br></br>
              سريع، سهل، آمن.
             
              </h1>

              <p className="hero-subtitle">
                تواصل مع خبراء موثقين خلال دقائق عبر منصة خبير — سريع، آمن وبدون عناء.
              </p>

              {!user && (
                <div className="hero-cta">
                  <button
                    type="button"
                    className="cta-button cta-button--primary"
                    onClick={handleUzmanBulClick}
                  >
                    ابحث عن خبير
                  </button>

                  <button
                    type="button"
                    className="cta-button cta-button--accent"
                    onClick={handleUzmanOlClick}
                  >
                    كن خبيراً
                  </button>
                </div>
              )}

              <div className="hero-features">
                <div className="feature-row">
                  <span className="status-dot" aria-hidden="true" />
                  خبراء موثقون
                </div>
                <div className="feature-row">
                  <span className="status-dot" aria-hidden="true" />
                  موعد سريع
                </div>
                <div className="feature-row">
                  <span className="status-dot" aria-hidden="true" />
                  دفع آمن
                </div>
              </div>
            </section>

            <section className="hero-media">
              <div className="hero-image-wrap">
                <img
                  className="hero-image"
                  src={HomePageLogo}
                  alt="منصة خبير"
                  loading="lazy"
                />
              </div>
            </section>
          </div>
        </main>

        <section id="mobile-app">
          <div className="app-banner">
            <div className="app-banner-image-wrap">
              <img
                src={AppBannerImage}
                alt="تطبيق خبير للجوال"
                className="app-banner-image"
                loading="lazy"
              />
            </div>

            <div className="app-banner-content">
              <h2 className="app-banner-title">حقيبة الصيانة في جيبك</h2>
              <p className="app-banner-text">
                مع تطبيق خبير للجوال، اعثر على معلم صيانة عاجل أينما كنت. التقط صورة للمشكلة وأرسلها، وتتبع وصول المعلم مباشرة من الخريطة.
              </p>

              <div className="app-banner-actions">
                <span className="app-banner-coming-soon">قريباً على هذه المنصات</span>
                <a
                  className="app-banner-button app-banner-button--apple"
                  href="#"
                  aria-label="قريباً على App Store"
                  onClick={(event) => event.preventDefault()}
                >
                  <span className="app-banner-button-icon" aria-hidden="true">
                    <img
                      src={appleLogo}
                      alt=""
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "contain",
                        display: "block",
                        filter: "brightness(0) invert(1)"
                      }}
                    />
                  </span>
                  <span>App Store</span>
                </a>

                <a
                  className="app-banner-button app-banner-button--google"
                  href="#"
                  aria-label="قريباً على Google Play"
                  onClick={(event) => event.preventDefault()}
                >
                  <span className="app-banner-button-icon" aria-hidden="true">
                    <img
                      src={googlePlayLogo}
                      alt=""
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "contain",
                        display: "block",
                      }}
                    />
                  </span>
                  <span>Google Play</span>
                </a>
              </div>
            </div>
          </div>
        </section>

        <section className="section-band section-band--gradient" id="how-it-works">
          <section className="how-section">
            <div className="how-container">
              <header className="how-header">
                <h2 className="how-title">
                  كيف <span className="how-accent">يعمل؟</span>
                </h2>
                <p className="how-subtitle">
                  احصل على الخبير الذي تحتاجه في 3 خطوات بسيطة.
                </p>
              </header>

              <div className="how-grid">
                <article className="how-card">
                  <div className="how-icon" aria-hidden="true">
                    <img
                      src={checkImage}
                      alt=""
                      style={{
                        width: "48px",
                        height: "48px",
                        objectFit: "contain",
                        display: "block",
                      }}
                    />
                  </div>
                  <h3 className="how-card-title">1. حدد احتياجك</h3>
                  <p className="how-card-text">
                    قرر ما تريد القيام به، وما هي الميزانية التي خصصتها، ومتى يجب إنجاز العمل.
                  </p>
                </article>

                <article className="how-card">
                  <div className="how-icon" aria-hidden="true">
                    <img
                      src={costumerImage}
                      alt=""
                      style={{
                        width: "48px",
                        height: "48px",
                        objectFit: "contain",
                        display: "block",
                      }}
                    />
                  </div>
                  <h3 className="how-card-title">2. اختر الخبير</h3>
                  <p className="how-card-text">
                    تصفح الإعلانات المخصصة لك. اقرأ التعليقات، شاهد التقييمات، واطلع على الأعمال السابقة ثم اختر الخبير الأنسب لك.
                  </p>
                </article>

                <article className="how-card">
                  <div className="how-icon" aria-hidden="true">
                    <img
                      src={handshakeImage}
                      alt=""
                      style={{
                        width: "48px",
                        height: "48px",
                        objectFit: "contain",
                        display: "block",
                      }}
                    />
                  </div>
                  <h3 className="how-card-title">3. اتفق بأمان</h3>
                  <p className="how-card-text">
                    اتفق من خلال المنصة، وسيتم حفظ المدفوعات في الأمانة. بعد اكتمال العمل، يتم تحويل المبلغ للخبير.
                  </p>
                </article>
              </div>
            </div>
          </section>
        </section>

        {/* Syria Arabic launch: homepage videos disabled by request, original block kept for later.
        <section className="section-band section-band--plain" id="video-showcase">
          <div className="videos-container">
            <div className="videos-header">
              <h2 className="videos-title">
                اكتشفوا <span className="videos-accent">خطوات خدماتنا عبر الفيديو</span>
              </h2>
              <p className="videos-subtitle">
                شاهدوا خطوات طلب خبير وتقديم الخدمات خطوة بخطوة
              </p>
            </div>

            <div className="videos-grid">
              <div className="video-card">
                <div className="video-wrapper">
                  <video
                    className="video-element"
                    controls
                    preload="metadata"
                  >
                    <source src="/videos/video1.mp4" type="video/mp4" />
                    Tarayıcınız video etiketini desteklemiyor.
                  </video>
                  <div className="video-overlay">
                    <div className="video-play-icon">
                      <i className="fas fa-play"></i>
                    </div>
                  </div>
                </div>
                <div className="video-info">
                  <h3 className="video-title">كيف تجد خبيراً؟</h3>
                  <p className="video-description">
                    حدد احتياجاتك، وتصفح الإعلانات المنشورة، واتفق مع الخبير الأنسب لك.
                  </p>
                </div>
              </div>

              <div className="video-card">
                <div className="video-wrapper">
                  <video
                    className="video-element"
                    controls
                    preload="metadata"
                  >
                    <source src="/videos/video2.mp4" type="video/mp4" />
                    Tarayıcınız video etiketini desteklemiyor.
                  </video>
                  <div className="video-overlay">
                    <div className="video-play-icon">
                      <i className="fas fa-play"></i>
                    </div>
                  </div>
                </div>
                <div className="video-info">
                  <h3 className="video-title">كيف تجد عميلاً؟</h3>
                  <p className="video-description">
                    انشر إعلاناً، وانتظر العروض، واتفق مع العميل الأنسب.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>
        */}

        <section className="section-band section-band--plain" id="featured-listings">
          <section className="listings-section">
            <div className="listings-container">
              <h2 className="section-title">آخر الإعلانات المضافة</h2>
              <div className="listings-grid">
                {latestListingsLoading && (
                  <div className="listing-card" role="status" aria-live="polite">
                    جاري تحميل الإعلانات...
                  </div>
                )}

                {!latestListingsLoading && latestListingsError && (
                  <div className="listing-card" role="alert">
                    {latestListingsError}
                  </div>
                )}

                {!latestListingsLoading &&
                  !latestListingsError &&
                  latestListings.length === 0 && (
                    <div className="listing-card" role="status" aria-live="polite">
                      لا توجد إعلانات منشورة بعد.
                    </div>
                  )}

                {!latestListingsLoading &&
                  !latestListingsError &&
                  latestListings.map((listing) => {
                    const imageSrc =
                      listing.image ||
                      categoryImages[listing.category] ||
                      categoryImageMap[listing.category] ||
                      HomePageLogo;

                    return (
                      <div
                        key={listing.id}
                        className="listing-card armut-card vertical"
                        onClick={() => navigate(`/إعلان/${listing.id}`)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            navigate(`/إعلان/${listing.id}`);
                          }
                        }}
                      >
                        <div
                          className="armut-hero"
                          style={getListingBackgroundStyle(listing, imageSrc)}
                        >
                          {/* Syria Arabic launch: listing report/exclamation button disabled.
                          <ListingReportButton
                            listingId={listing.id}
                            listingTitle={listing.title}
                            className="btn-listing-report--on-hero"
                          />
                          */}
                          <button
                            type="button"
                            className="reserve-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/إعلان/${listing.id}`);
                            }}
                          >
                            عرض الإعلان
                          </button>
                        </div>

                        <div className="armut-main">
                          <div className="armut-top">
                            <div className="listing-category">{toArabicServiceLabel(listing.category)}</div>
                            <div className="listing-price">{formatPrice(listing.price)}</div>
                          </div>

                          <h3 className="listing-title">{listing.title}</h3>

                          <div className="listing-meta">
                            <span>{listing.city}</span>
                            <span>•</span>
                            <span>{listing.expertName || "خبير"}</span>
                          </div>

                          <div className="armut-bottom">
                            {!!listing.rating && (
                              <span className="listing-rating">★ {listing.rating}</span>
                            )}
                            <span className="jobs-done">
                              {formatLatinNumber(listing.reviews)} تقييم
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          </section>
        </section>

        <section className="section-band section-band--plain" id="stats">
          <section className="stats-section">
            <div className="stats-container">
              <div className="stats-grid">
                <article className="stats-card">
                  <div className="stats-icon" aria-hidden="true">
                    <img src={happyFaceImage} alt="" className="stats-icon-img" />
                  </div>
                  <div className="stats-value">{formatCount(platformStats.clientCount)}</div>
                  <div className="stats-label">عدد المستخدمين</div>
                </article>

                <article className="stats-card">
                  <div className="stats-icon" aria-hidden="true">
                    <img src={badgeImage} alt="" className="stats-icon-img" />
                  </div>
                  <div className="stats-value">{formatCount(platformStats.providerCount)}</div>
                  <div className="stats-label">خبير مسجل</div>
                </article>

                {/* Syria Arabic launch: completed jobs stat card disabled with its operations.
                <article className="stats-card">
                  <div className="stats-icon" aria-hidden="true">
                    <img src={completedImage} alt="" className="stats-icon-img" />
                  </div>
                  <div className="stats-value">{formatCount(platformStats.completedAppointmentsCount)}</div>
                  <div className="stats-label">عمل مكتمل</div>
                </article>
                */}

                <article className="stats-card">
                  <div className="stats-icon" aria-hidden="true">
                    <img src={syriaImage} alt="" className="stats-icon-img" />
                  </div>
                  <div className="stats-value">{formatCount(platformStats.listingCount)}</div>
                  <div className="stats-label">خدمة في المحافظات</div>
                </article>
              </div>
            </div>
          </section>
        </section>
      </div>
    </PageTransition>
  );
}
