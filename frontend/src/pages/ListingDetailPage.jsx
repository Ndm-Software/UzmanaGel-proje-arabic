import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Navbar from "../components/Navbar";
import LoadingSpinner from "../components/LoadingSpinner";
import ReviewSystem from "../components/ReviewSystem";
import categoryImages from "../data/categoryImages";
import { fetchListingById } from "../services/listingsApi";
import { computeRatingSummary, fetchListingReviews, fetchListingReviewStats, fetchExpertReviewStats } from "../services/reviewsApi";
import { getOrCreateConversation } from "../services/chatApi";
import { useAuthGuard } from "../hooks/useAuthGuard";
import { getProfilePhoto } from "../services/updateService";
import { getListingImageStyle } from "../utils/listingImagePresentation";
import { doc, getDoc, collection, query, where, getDocs, addDoc } from "firebase/firestore";
import { db, auth } from "../firebase/firebaseClient";
import DOMPurify from 'dompurify';
import "../styles/ListingDetailPage.css";

const isDevelopment = process.env.NODE_ENV === 'development';

const sanitizeText = (text) => {
  if (!text) return '';
  return DOMPurify.sanitize(String(text));
};

export default function ListingDetailPage() {
  const { listingId } = useParams();
  const navigate = useNavigate();
  const { isSignedIn } = useAuthGuard();

  const [listing, setListing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [chatLoading, setChatLoading] = useState(false);
  const [toast, setToast] = useState({ show: false, message: "", type: "error" });
  const [reviews, setReviews] = useState([]);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [reviewStats, setReviewStats] = useState({ avg: 0, count: 0 });
  const [expertProfilePhoto, setExpertProfilePhoto] = useState(null);
  
  const [expertRating, setExpertRating] = useState(0);
  const [expertReviewCount, setExpertReviewCount] = useState(0);

  useEffect(() => {
    const fetchExpertRating = async () => {
      if (!listing?.providerId) return;
      try {
        const providerDoc = await getDoc(doc(db, "service_providers", listing.providerId));
        if (providerDoc.exists()) {
          setExpertRating(providerDoc.data()?.rating || 0);
        }
      } catch (error) {
        if (isDevelopment) console.error("Uzman rating yüklenemedi:", error);
        setExpertRating(0);
      }
    };
    fetchExpertRating();
  }, [listing?.providerId]);

  useEffect(() => {
    const fetchExpertReviewCount = async () => {
      if (!listing?.providerId) return;
      try {
        const stats = await fetchExpertReviewStats(listing.providerId);
        setExpertReviewCount(stats?.count || 0);
      } catch (error) {
        if (isDevelopment) console.error("Uzman yorum sayısı yüklenemedi:", error);
        setExpertReviewCount(0);
      }
    };
    fetchExpertReviewCount();
  }, [listing?.providerId]);

  useEffect(() => {
    const fetchExpertPhoto = async () => {
      if (!listing?.providerId) return;
      
      try {
        let photoUrl = await getProfilePhoto(listing.providerId);
        
        if (!photoUrl) {
          const userDoc = await getDoc(doc(db, "users", listing.providerId));
          if (userDoc.exists()) {
            const userData = userDoc.data();
            photoUrl = userData.photoURL || userData.profilePhoto || userData.photoUrl || null;
          }
        }
        
        if (!photoUrl) {
          const providerDoc = await getDoc(doc(db, "service_providers", listing.providerId));
          if (providerDoc.exists()) {
            const providerData = providerDoc.data();
            photoUrl = providerData.photoURL || providerData.profilePhoto || providerData.photoUrl || null;
          }
        }
        
        setExpertProfilePhoto(photoUrl);
      } catch (error) {
        if (isDevelopment) console.error("Profil fotoğrafı yüklenemedi:", error);
        setExpertProfilePhoto(null);
      }
    };
    
    fetchExpertPhoto();
  }, [listing?.providerId]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    fetchListingById(listingId)
      .then((item) => { if (!cancelled) setListing(item || null); })
      .catch((error) => { 
        if (isDevelopment) console.error("Failed to load listing detail:", error.message);
        if (!cancelled) setListing(null); 
      })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [listingId]);

  useEffect(() => {
    if (!listingId) return;
    let cancelled = false;
    setReviewsLoading(true);

    Promise.all([
      fetchListingReviews(listingId, { pageSize: 10 }),
      fetchListingReviewStats(listingId),
    ])
      .then(([items, stats]) => {
        if (cancelled) return;
        setReviews(items || []);
        setReviewStats(stats || { avg: 0, count: 0 });
      })
      .catch(() => { if (!cancelled) setReviews([]); })
      .finally(() => { if (!cancelled) setReviewsLoading(false); });

    return () => { cancelled = true; };
  }, [listingId]);

  const showToast = (message, type = "error") => {
    setToast({ show: true, message: sanitizeText(message), type });
    setTimeout(() => setToast({ show: false, message: "", type: "error" }), 4000);
  };

  const getApprovedAppointmentIdForListing = async () => {
    const currentUser = auth.currentUser;
    if (!currentUser) return null;

    try {
      const appointmentsRef = collection(db, "appointments");
      const q = query(
        appointmentsRef,
        where("clientId", "==", currentUser.uid),
        where("listingId", "==", listingId),
        where("status", "==", "approved")
      );
      const querySnapshot = await getDocs(q);
      
      if (!querySnapshot.empty) {
        return querySnapshot.docs[0].id;
      }
      return null;
    } catch (error) {
      if (isDevelopment) console.error("Randevu kontrol hatası:", error);
      return null;
    }
  };

  const handleStartChat = async () => {
    if (!isSignedIn) {
      showToast("Mesaj göndermek için lütfen giriş yapın.", "error");
      setTimeout(() => navigate("/login"), 1500);
      return;
    }

    try {
    const currentUser = auth.currentUser;
    if (currentUser) {
      const userDoc = await getDoc(doc(db, "users", currentUser.uid));
      if (userDoc.exists()) {
        const userType = userDoc.data()?.userType;
        
        if (userType === "PENDING_PROVIDER") {
          showToast(
            "Uzman başvurunuz henüz değerlendirilme aşamasında. Onaylandıktan sonra mesaj gönderebilirsiniz.",
            "error"
          );
          return;
        }
      }
    }
  } catch (error) {
    if (isDevelopment) console.error("Kullanıcı tipi kontrol hatası:", error);
    showToast("Lütfen daha sonra tekrar deneyin.", "error");
    return;
  }

    try {
      const providerUid = String(listing?.providerId || "").trim();
      const serviceId = String(listing?.id || listingId || "").trim();
      const serviceTitle = String(listing?.title || "").trim();

      if (!providerUid) { showToast("Uzman bilgisi bulunamadı."); return; }
      if (!serviceId) { showToast("Hizmet bilgisi bulunamadı."); return; }

      setChatLoading(true);

      let approvedAppointmentId = await getApprovedAppointmentIdForListing();

      if (!approvedAppointmentId) {
        // Syria Launch: Bypass manual booking by auto-creating an approved appointment document
        try {
          const currentUser = auth.currentUser;
          let clientName = currentUser?.displayName || "Müşteri";
          try {
            const userDoc = await getDoc(doc(db, "users", currentUser.uid));
            if (userDoc.exists()) {
              clientName = userDoc.data().displayName || clientName;
            }
          } catch (err) {
            if (isDevelopment) console.error("Müşteri ismi alınamadı:", err);
          }

          const todayStr = new Date().toLocaleDateString('sv-SE');
          const dummyAppointment = {
            clientId: currentUser.uid,
            expertId: providerUid,
            listingId: serviceId,
            listingTitle: serviceTitle,
            expertName: listing?.expertName || "Uzman",
            client: clientName,
            date: todayStr,
            start: "12:00",
            end: "12:15",
            status: "approved",
            createdBy: "customer",
            createdTime: Date.now(),
            note: "Doğrudan İletişim Başlatıldı",
            fullAddress: "Çevrimiçi Görüşme",
            address: "Çevrimiçi",
          };

          const docRef = await addDoc(collection(db, "appointments"), dummyAppointment);
          approvedAppointmentId = docRef.id;
        } catch (apptErr) {
          if (isDevelopment) console.error("Otomatik randevu oluşturma hatası:", apptErr);
          showToast("İletişim başlatılamadı. Lütfen daha sonra tekrar deneyin.", "error");
          setChatLoading(false);
          return;
        }
      }

      const result = await getOrCreateConversation(providerUid, serviceId, serviceTitle, approvedAppointmentId);
      navigate(`/mesajlar?conversation=${result.conversationId}&open=true`);
    } catch (error) {
      if (isDevelopment) console.error("Chat baslatma hatasi:", error.message);
      showToast(error.message || "Mesajlaşma başlatılırken hata oluştu.");
    } finally {
      setChatLoading(false);
    }
  };

  // handleAppointmentClick removed for Syria Launch (bypassed direct chat)

  const handleExpertProfileClick = () => {
    navigate(`/uzman/${listing.providerId}`);
  };

  if (loading) {
    return (
      <div className="ld-page">
        <Navbar />
        <LoadingSpinner text="İlan yükleniyor..." />
      </div>
    );
  }

  if (!listing) {
    return (
      <div className="ld-page">
        <Navbar />
        <div className="ld-not-found">
          <i className="fas fa-file-circle-xmark"></i>
          <h2>İlan Bulunamadı</h2>
          <p>Aradığınız ilan mevcut değil veya kaldırılmış olabilir.</p>
          <button onClick={() => navigate("/ilanlar")}>
            <i className="fas fa-arrow-left"></i> İlanlara Dön
          </button>
        </div>
      </div>
    );
  }

  const imageSrc = listing.image || categoryImages[listing.category] || "/default-listing.svg";
  const canOpenProfile = !!listing.providerId;
  const formatPrice = (p) => new Intl.NumberFormat("tr-TR").format(Number(p) || 0);
  const reviewSummary = computeRatingSummary(reviews);
  const effectiveReviewCount = Number(reviewStats?.count || listing?.reviews || reviewSummary.count || 0);

  return (
    <div className="ld-page">
      <Navbar />

      <div className="ld-container">
        <div className="ld-topbar">
          <button className="ld-back-btn" onClick={() => navigate(-1)}>
            <i className="fas fa-arrow-left"></i> Geri
          </button>
        </div>

        <div className="ld-profile-header">
          <div className="ld-avatar-wrap">
            <img
              src={imageSrc}
              alt={sanitizeText(listing.title)}
              className="ld-avatar"
              style={getListingImageStyle(listing)}
              onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = "/default-listing.svg"; }}
            />
          </div>

          <div className="ld-profile-info">
            <div className="ld-title-row">
              <h1 className="ld-title">{sanitizeText(listing.title)}</h1>
              <span className="ld-category-tag">
                <i className="fas fa-tag"></i> {sanitizeText(listing.category)}
              </span>
            </div>
            <div className="ld-meta">
              <span><i className="fas fa-user-tie"></i> {sanitizeText(listing.expertName || "Uzman")}</span>
              <span><i className="fas fa-map-marker-alt"></i> {sanitizeText(listing.city || "Belirtilmemiş")}</span>
              <span className="ld-rating">
                <i className="fas fa-star"></i> {listing.rating ?? 0}
                <em>({effectiveReviewCount} yorum)</em>
              </span>
            </div>
          </div>

          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", justifyContent: "flex-end" }}>
            <button
              className="ld-appointment-btn"
              onClick={handleStartChat}
              disabled={chatLoading}
              style={chatLoading ? { opacity: 0.7, cursor: "not-allowed" } : {}}
            >
              <i className="fas fa-comments"></i> Uzmanla İletişime Geç
            </button>
          </div>
        </div>

        <div className="ld-grid">
          <div className="ld-left">
            <div className="ld-card">
              <h2 className="ld-card-title"><i className="fas fa-circle-info"></i> İlan Hakkında</h2>
              <p className="ld-desc">{sanitizeText(listing.description || "Bu ilan için henüz açıklama eklenmemiş.")}</p>
            </div>

            <div className="ld-card">
              <h2 className="ld-card-title"><i className="fas fa-list-check"></i> Hizmet Detayları</h2>
              <div className="ld-details">
                <div className="ld-detail-item">
                  <span className="ld-detail-label">Kategori</span>
                  <span className="ld-detail-value">{sanitizeText(listing.category)}</span>
                </div>
                {String(listing.serviceSubcategory || "").trim() ? (
                  <div className="ld-detail-item">
                    <span className="ld-detail-label">Uzmanlık</span>
                    <span className="ld-detail-value">{sanitizeText(String(listing.serviceSubcategory).trim())}</span>
                  </div>
                ) : null}
                {String(listing.serviceSubcategoryDetails || "").trim() ? (
                  <div className="ld-detail-item">
                    <span className="ld-detail-label">Ayrıntılar</span>
                    <span className="ld-detail-value">{sanitizeText(String(listing.serviceSubcategoryDetails).trim())}</span>
                  </div>
                ) : null}
                <div className="ld-detail-item">
                  <span className="ld-detail-label">Şehir</span>
                  <span className="ld-detail-value">{sanitizeText(listing.city || "Belirtilmemiş")}</span>
                </div>
                <div className="ld-detail-item">
                  <span className="ld-detail-label">Ücret</span>
                  <span className="ld-detail-value ld-price">₺{formatPrice(listing.price)}</span>
                </div>
                <div className="ld-detail-item">
                  <span className="ld-detail-label">Hizmet Tipi</span>
                  <span className="ld-detail-value">{sanitizeText(listing.pricingType || "Belirtilmemiş")}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="ld-right">
            <div className="ld-provider-card">
              <div className="ld-provider-top">
                <div className="ld-provider-avatar">
                  {expertProfilePhoto ? (
                    <img 
                      src={expertProfilePhoto} 
                      alt={sanitizeText(listing.expertName || "Uzman")}
                      style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%" }}
                      onError={(e) => {
                        e.currentTarget.style.display = "none";
                        e.currentTarget.parentElement.innerText = sanitizeText((listing.expertName || "U").charAt(0).toUpperCase());
                      }}
                    />
                  ) : (
                    sanitizeText((listing.expertName || "U").charAt(0).toUpperCase())
                  )}
                </div>
                <div>
                  <h3 className="ld-provider-name">{sanitizeText(listing.expertName || "Uzman")}</h3>
                  <span className="ld-provider-badge">
                    <i className="fas fa-check-circle"></i> Onaylı Uzman
                  </span>
                </div>
              </div>

              <div className="ld-provider-stats">
                <div className="ld-stat">
                  <span className="ld-stat-val"><i className="fas fa-star"></i> {expertRating}</span>
                  <span className="ld-stat-lbl">Puan</span>
                </div>
                <div className="ld-stat-sep" />
                <div className="ld-stat">
                  <span className="ld-stat-val">{expertReviewCount}</span>
                  <span className="ld-stat-lbl">Yorum</span>
                </div>
              </div>

              <button
                className="ld-profile-btn"
                onClick={handleStartChat}
                disabled={chatLoading}
                style={chatLoading ? { opacity: 0.7, cursor: "not-allowed" } : {}}
              >
                <i className="fas fa-message"></i>{" "}
                {chatLoading ? "Mesaj açılıyor..." : "Bu hizmet için mesaj at"}
              </button>

              <button
                className="ld-profile-btn"
                onClick={handleExpertProfileClick}
              >
                <i className="fas fa-id-card"></i> Uzman Profilini İncele
              </button>

              {!canOpenProfile && (
                <p className="ld-no-profile">Bu ilan için profil mevcut değil.</p>
              )}
            </div>
          </div>
        </div>

        <ReviewSystem targetId={listingId} targetType="listing" />
      </div>

      {toast.show && (
        <div style={{
          position: "fixed", bottom: "24px", right: "24px",
          background: toast.type === "error" ? "#ef4444" : "#10b981",
          color: "white", padding: "14px 20px", borderRadius: "12px",
          boxShadow: "0 4px 20px rgba(0,0,0,0.3)", display: "flex",
          alignItems: "center", gap: "10px", fontSize: "14px",
          fontWeight: "500", zIndex: 9999, maxWidth: "360px",
          animation: "slideInRight 0.3s ease",
        }}>
          <i className={`fas ${toast.type === "error" ? "fa-times-circle" : "fa-check-circle"}`}></i>
          {sanitizeText(toast.message)}
        </div>
      )}
    </div>
  );
}

/*
REMOVED BLOCKS FOR SYRIA LAUNCH (TURKISH FRONTEND SIMPLIFICATION):

1. handleAppointmentClick function:
  const handleAppointmentClick = async () => {
    if (!isSignedIn) {
      showToast("Randevu oluşturmak için lütfen giriş yapın.", "error");
      setTimeout(() => navigate("/login"), 1500);
      return;
    }

    // Kullanıcının userType'ını kontrol et
    try {
      const currentUser = auth.currentUser;
      if (currentUser) {
        const userDoc = await getDoc(doc(db, "users", currentUser.uid));
        if (userDoc.exists()) {
          const userType = userDoc.data()?.userType;
          
          // PENDING_PROVIDER ise uyarı göster ve işlemi durdur
          if (userType === "PENDING_PROVIDER") {
            showToast(
              "Uzman başvurunuz henüz değerlendirilme aşamasında. Lütfen başvurunuzun onaylanmasını veya reddedilmesini bekleyin.",
              "error"
            );
            return;
          }
        }
      }
    } catch (error) {
      if (isDevelopment) console.error("Kullanıcı tipi kontrol hatası:", error);
      // Hata durumunda devam etme, güvenlik için geri dön
      showToast("Lütfen daha sonra tekrar deneyin.", "error");
      return;
    }

    navigate(`/customer-appointment/${listing.providerId}?listingId=${listingId}`);
  };

2. Randevu Oluştur button JSX:
            <button
              className="ld-appointment-btn"
              onClick={handleAppointmentClick}
            >
              <i className="fas fa-calendar-plus"></i> Randevu Oluştur
            </button>

3. old handleStartChat check:
      const approvedAppointmentId = await getApprovedAppointmentIdForListing();

      if (!approvedAppointmentId) {
        showToast("Bu ilana dair onaylanmış bir randevunuz bulunmalıdır. Randevu oluşturup uzman onayladıktan sonra mesaj gönderebilirsiniz.", "error");
        setChatLoading(false);
        return;
      }
*/