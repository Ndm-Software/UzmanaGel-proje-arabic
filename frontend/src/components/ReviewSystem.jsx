import React, { useMemo, useState, useEffect } from 'react';
import { db, auth } from '../firebase/firebaseClient';
import { collection, query, where, orderBy, onSnapshot, doc, getDoc, getDocs, addDoc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { motion } from 'framer-motion';
import { showAppToast } from '../utils/showAppToast';
import '../styles/ReviewSystem.css';

const isDevelopment = import.meta.env.DEV;

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:5000";

const SORT_OPTIONS = [
  { value: 'newest', label: 'الأحدث' },
  { value: 'oldest', label: 'الأقدم' },
  { value: 'rating_desc', label: 'الأعلى تقييماً' },
  { value: 'rating_asc', label: 'الأقل تقييماً' },
];

const REVIEW_ALREADY_SUBMITTED_MESSAGE = "تم تقييم هذه الخدمة بالفعل.";

const normalizeReviewErrorMessage = (message) => {
  const text = String(message || "").trim();
  if (!text) return "فشل إرسال التقييم.";
  const lower = text.toLowerCase();

  if (
    lower.includes("bu, şu anda geçerli olan bir durumdur") ||
    lower.includes("bu, su anda gecerli olan bir durumdur") ||
    lower.includes("şu anda geçerli") ||
    lower.includes("su anda gecerli") ||
    lower.includes("zaten değerlendirildi") ||
    lower.includes("değerlendirme") && lower.includes("zaten") ||
    lower.includes("already") && lower.includes("review")
  ) {
    return REVIEW_ALREADY_SUBMITTED_MESSAGE;
  }

  return text;
};

const getReviewTimeMs = (ts) => {
  if (!ts) return 0;
  if (typeof ts?.toMillis === 'function') return ts.toMillis();
  if (typeof ts?.toDate === 'function') return ts.toDate().getTime();
  const parsed = Date.parse(String(ts));
  return Number.isFinite(parsed) ? parsed : 0;
};

const ReviewSystem = ({
  targetId,
  targetType,
  initialVisibleCount = 5,
  enableSort = false,
  paginationMode = 'incremental', // 'incremental' | 'all' | 'pages'
  step = 5,
  pageSize = 10,
  showListingInfo = false,
  filterToActiveListings = false,
}) => {
  const [allReviews, setAllReviews] = useState([]);
  const [userNames, setUserNames] = useState({});
  const [listingTitles, setListingTitles] = useState({});
  const [loading, setLoading] = useState(true);
  const [visibleCount, setVisibleCount] = useState(Math.max(1, Number(initialVisibleCount) || 5));
  const [sortKey, setSortKey] = useState('newest');
  const [page, setPage] = useState(1);
  const [activeListingIds, setActiveListingIds] = useState(null); // Set<string> | null
  const [activeListingLoading, setActiveListingLoading] = useState(false);

  // Syria Launch Direct Review States
  const [currentUser, setCurrentUser] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (usr) => {
      setCurrentUser(usr);
      if (usr) {
        try {
          const userDoc = await getDoc(doc(db, 'users', usr.uid));
          if (userDoc.exists()) {
            setUserRole(userDoc.data()?.userType || 'CLIENT');
          }
        } catch {
          setUserRole('CLIENT');
        }
      } else {
        setUserRole(null);
      }
    });
    return () => unsubscribe();
  }, []);

  const handleWriteReviewClick = () => {
    if (!currentUser) {
      showAppToast("يرجى تسجيل الدخول أولاً لإجراء التقييم.", "error");
      return;
    }
    if (userRole === 'PROVIDER' || userRole === 'PENDING_PROVIDER') {
      showAppToast("الخبراء لا يمكنهم إجراء تقييم.", "error");
      return;
    }
    setIsModalOpen(true);
    setRating(0);
    setComment("");
  };

  const handleSubmitReview = async () => {
    if (rating < 1 || rating > 5) {
      showAppToast("يرجى اختيار تقييم بين 1 و 5 نجوم.", "error");
      return;
    }

    setSubmitting(true);
    try {
      let expertId = null;
      let listingId = null;
      let listingTitle = "";

      const isDev = process.env.NODE_ENV === 'development';

      if (targetType === 'listing') {
        listingId = targetId;
        // Fetch listing to resolve expertId and title
        const listingSnap = await getDoc(doc(db, 'services', listingId));
        if (listingSnap.exists()) {
          const data = listingSnap.data() || {};
          expertId = data.providerId || null;
          listingTitle = data.title || "";
        } else {
          throw new Error("لم يتم العثور على معلومات الخدمة.");
        }
      } else {
        expertId = targetId;
        listingId = null;
        listingTitle = null;
      }

      if (!expertId) {
        throw new Error("لم يتم العثور على معلومات الخبير.");
      }

      // Syria Arabic launch: appointment system disabled, reviews no longer create appointment records.
      const apptId = [currentUser.uid, expertId, listingId || 'expert'].filter(Boolean).join('_');

      /*
      // Check if an appointment exists
      const appointmentsRef = collection(db, 'appointments');
      let q;
      if (listingId) {
        q = query(
          appointmentsRef,
          where('clientId', '==', currentUser.uid),
          where('expertId', '==', expertId),
          where('listingId', '==', listingId)
        );
      } else {
        q = query(
          appointmentsRef,
          where('clientId', '==', currentUser.uid),
          where('expertId', '==', expertId)
        );
      }

      const querySnap = await getDocs(q);
      let apptId = null;

      if (!querySnap.empty) {
        apptId = querySnap.docs[0].id;
      } else {
        // Create a dummy approved appointment
        let clientName = currentUser.displayName || "عميل";
        try {
          const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
          if (userDoc.exists()) {
            clientName = userDoc.data().displayName || clientName;
          }
        } catch (err) {
          if (isDev) console.error("Client name load error:", err);
        }

        let expertName = "خبير";
        try {
          const expertDoc = await getDoc(doc(db, 'service_providers', expertId));
          if (expertDoc.exists()) {
            const data = expertDoc.data() || {};
            expertName = data.businessName || data.displayName || "خبير";
          }
        } catch (err) {
          if (isDev) console.error("Expert name load error:", err);
        }

        const todayStr = new Date().toLocaleDateString('sv-SE');
        const dummyAppointment = {
          clientId: currentUser.uid,
          expertId: expertId,
          listingId: listingId || null,
          listingTitle: listingTitle || null,
          expertName: expertName,
          client: clientName,
          date: todayStr,
          start: "12:00",
          end: "12:15",
          status: "approved",
          createdBy: "customer",
          createdTime: Date.now(),
          note: "بدأ التقييم المباشر",
          fullAddress: "مقابلة عبر الإنترنت",
          address: "عبر الإنترنت",
        };

        const newApptDoc = await addDoc(collection(db, 'appointments'), dummyAppointment);
        apptId = newApptDoc.id;
      }
      */

      // Execute Firebase transaction for review and stats updates
      await runTransaction(db, async (transaction) => {
        const reviewRef = doc(db, 'reviews', apptId);
        const expertRef = doc(db, 'service_providers', expertId);
        const serviceRef = listingId ? doc(db, 'services', listingId) : null;

        const existingReview = await transaction.get(reviewRef);
        if (existingReview.exists()) {
          throw new Error(REVIEW_ALREADY_SUBMITTED_MESSAGE);
        }

        const expertSnap = await transaction.get(expertRef);
        const serviceSnap = serviceRef ? await transaction.get(serviceRef) : null;

        const payload = {
          appointmentId: apptId,
          expertId: expertId,
          listingId: listingId || null,
          clientId: currentUser.uid,
          rating: rating,
          comment: comment.trim() || '',
          createdAt: serverTimestamp(),
        };

        transaction.set(reviewRef, payload);

        if (expertSnap.exists()) {
          const expert = expertSnap.data() || {};
          const prevCount = Number(expert.reviewCount || 0);
          const prevAvg = Number(expert.rating || 0);
          const newCount = prevCount + 1;
          const newAvg = Number(((prevAvg * prevCount + rating) / newCount).toFixed(2));
          transaction.update(expertRef, {
            rating: newAvg,
            reviewCount: newCount,
            updatedAt: new Date().toISOString(),
          });
        }

        if (serviceRef && serviceSnap?.exists()) {
          const service = serviceSnap.data() || {};
          const prevCount = Number(service.reviews || 0);
          const prevAvg = Number(service.rating || 0);
          const newCount = prevCount + 1;
          const newAvg = Number(((prevAvg * prevCount + rating) / newCount).toFixed(2));
          transaction.update(serviceRef, {
            rating: newAvg,
            reviews: newCount,
            updatedAt: new Date().toISOString(),
          });
        }
      });

      showAppToast("تم استلام تقييمك. شكراً لك!", "success");
      setIsModalOpen(false);
    } catch (error) {
      if (isDev) console.error("Değerlendirme hatası:", error);
      showAppToast(normalizeReviewErrorMessage(error.message), "error");
    } finally {
      setSubmitting(false);
    }
  };

  const maskName = (fullName) => {
    if (!fullName) return "مستخدم مخفي";
    return fullName
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((word) => {
        if (word.length <= 1) return word;
        return word[0] + '*'.repeat(word.length - 1);
      })
      .join(' ');
  };

  // Zaman gösterimi (bugünün tarihine göre)
  const timeAgo = (ts) => {
    if (!ts) return "";
    const now = new Date();
    const past = ts.toDate ? ts.toDate() : new Date(ts);
    const diffTime = Math.abs(now - past);
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return "(اليوم)";
    if (diffDays < 30) return `(${diffDays} يوم مضى)`;

    const months = Math.floor(diffDays / 30);
    const remainingDays = diffDays % 30;

    if (remainingDays === 0) return `(${months} شهر مضى)`;
    return `(${months} شهر و ${remainingDays} يوم مضى)`;
  };

  const formatDate = (ts) => {
    if (!ts) return "--.--.----";
    const date = ts.toDate ? ts.toDate() : new Date(ts);
    return new Intl.DateTimeFormat('ar-SY', { day: 'numeric', month: 'long', year: 'numeric' }).format(date);
  };

  useEffect(() => {
    if (!targetId) return;
    const field = targetType === 'listing' ? 'listingId' : 'expertId';
    const q = query(
      collection(db, 'reviews'),
      where(field, '==', targetId),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const reviewData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setAllReviews(reviewData);
      setPage(1);
      setVisibleCount((prev) => {
        const base = Math.max(1, Number(initialVisibleCount) || 5);
        return prev ? prev : base;
      });

      const newUserMap = { ...userNames };
      for (const rev of reviewData) {
        if (!newUserMap[rev.clientId]) {
          const userDoc = await getDoc(doc(db, 'users', rev.clientId));
          if (userDoc.exists()) {
            newUserMap[rev.clientId] = maskName(userDoc.data().displayName);
          } else {
            newUserMap[rev.clientId] = "مستخدم";
          }
        }
      }
      setUserNames(newUserMap);

      if (showListingInfo && targetType === 'expert') {
        const nextTitles = { ...(listingTitles || {}) };
        const uniqueIds = [...new Set(reviewData.map((r) => String(r?.listingId || '').trim()).filter(Boolean))];
        for (const id of uniqueIds) {
          if (nextTitles[id]) continue;
          try {
            const listingSnap = await getDoc(doc(db, 'services', id));
            if (listingSnap.exists()) {
              const data = listingSnap.data() || {};
              const t = String(data.title || data.serviceTitle || data.name || '').trim();
              if (t) {
                nextTitles[id] = t;
                continue;
              }
            } else {
              // fallback below
            }
          } catch {
            // Firestore permission / network: fallback below
          }

          // ✅ Fallback: backend public listing endpoint
          try {
            const res = await fetch(`${API_BASE_URL}/api/listings/${encodeURIComponent(id)}`, { cache: 'no-store' });
            if (res.ok) {
              const json = await res.json();
              const t2 = String(json?.title || json?.serviceTitle || json?.name || '').trim();
              if (t2) {
                nextTitles[id] = t2;
                continue;
              }
            }
          } catch {
            // ignore
          }

          nextTitles[id] = `إعلان (${id})`;
        }
        setListingTitles(nextTitles);
      }

      setLoading(false);
    });

    return () => unsubscribe();
  }, [targetId, targetType, initialVisibleCount, showListingInfo]);

  useEffect(() => {
    let cancelled = false;
    const shouldFilter = filterToActiveListings && targetType === 'expert' && String(targetId || '').trim();
    if (!shouldFilter) {
      setActiveListingIds(null);
      setActiveListingLoading(false);
      return;
    }

    const loadActive = async () => {
      setActiveListingLoading(true);
      try {
        const q = query(
          collection(db, 'services'),
          where('providerId', '==', String(targetId).trim()),
          where('status', '==', 'ACTIVE')
        );
        const snap = await getDocs(q);
        const ids = new Set(snap.docs.map((d) => d.id));
        if (!cancelled) setActiveListingIds(ids);
      } catch {
        if (!cancelled) setActiveListingIds(null);
      } finally {
        if (!cancelled) setActiveListingLoading(false);
      }
    };

    loadActive();
    return () => { cancelled = true; };
  }, [filterToActiveListings, targetType, targetId]);

  const sortedReviews = useMemo(() => {
    const list = Array.isArray(allReviews) ? [...allReviews] : [];
    switch (sortKey) {
      case 'oldest':
        list.sort((a, b) => getReviewTimeMs(a.createdAt) - getReviewTimeMs(b.createdAt));
        return list;
      case 'rating_desc':
        list.sort((a, b) => Number(b.rating || 0) - Number(a.rating || 0) || (getReviewTimeMs(b.createdAt) - getReviewTimeMs(a.createdAt)));
        return list;
      case 'rating_asc':
        list.sort((a, b) => Number(a.rating || 0) - Number(b.rating || 0) || (getReviewTimeMs(b.createdAt) - getReviewTimeMs(a.createdAt)));
        return list;
      case 'newest':
      default:
        list.sort((a, b) => getReviewTimeMs(b.createdAt) - getReviewTimeMs(a.createdAt));
        return list;
    }
  }, [allReviews, sortKey]);

  const displayReviews = useMemo(() => {
    const shouldFilter = filterToActiveListings && targetType === 'expert' && activeListingIds instanceof Set;
    if (!shouldFilter) return sortedReviews;
    return sortedReviews.filter((r) => activeListingIds.has(String(r?.listingId || '').trim()));
  }, [sortedReviews, filterToActiveListings, targetType, activeListingIds]);

  useEffect(() => {
    // Sıralama değişince ilk sayfaya dön
    setPage(1);
  }, [sortKey]);

  const effectivePageSize = Math.max(1, Math.min(50, Number(pageSize) || 10));
  const totalPages = Math.max(1, Math.ceil(displayReviews.length / effectivePageSize));
  const safePage = Math.min(Math.max(1, Number(page) || 1), totalPages);
  const pageStart = (safePage - 1) * effectivePageSize;
  const pageEnd = pageStart + effectivePageSize;
  const pagedReviews = displayReviews.slice(pageStart, pageEnd);

  const pageNumbers = useMemo(() => {
    // Basit: çok sayfa olursa da okunur kalsın
    const maxButtons = 7;
    if (totalPages <= maxButtons) return Array.from({ length: totalPages }, (_, i) => i + 1);
    const windowSize = 5;
    const start = Math.max(2, safePage - Math.floor(windowSize / 2));
    const end = Math.min(totalPages - 1, start + windowSize - 1);
    const adjustedStart = Math.max(2, end - windowSize + 1);

    const nums = [1];
    if (adjustedStart > 2) nums.push('…');
    for (let p = adjustedStart; p <= end; p++) nums.push(p);
    if (end < totalPages - 1) nums.push('…');
    nums.push(totalPages);
    return nums;
  }, [safePage, totalPages]);

  const totalAllCount = Array.isArray(allReviews) ? allReviews.length : 0;
  const isActiveListingFilterReady =
    filterToActiveListings && targetType === 'expert' && !activeListingLoading && activeListingIds instanceof Set;
  const summaryReviews = isActiveListingFilterReady ? displayReviews : allReviews;
  const totalSummaryCount = Array.isArray(summaryReviews) ? summaryReviews.length : 0;
  const averageRating = totalSummaryCount > 0
    ? (summaryReviews.reduce((acc, curr) => acc + Number(curr.rating || 0), 0) / totalSummaryCount).toFixed(1)
    : "0.0";

  if (loading) return <div className="review-loading">جاري تحميل التعليقات...</div>;

  return (
    <div className="review-section-wrapper" dir="rtl" lang="ar" translate="no">
      <div className="ld-reviews-header-wrapper">
        <div className="review-section-title-wrap">
          <h2 className="review-section-title">تقييمات العملاء</h2>
          <div className="review-section-avg">
            {averageRating} <i className="fas fa-star"></i>
          </div>
        </div>
        <div className="review-section-actions">
          {/* Write review button for clients or non-registered users */}
          <button
            type="button"
            className="review-write-btn"
            onClick={handleWriteReviewClick}
          >
            <i className="fas fa-star"></i> التقييم وكتابة تعليق
          </button>
          {enableSort && (
            <select
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value)}
              className="review-sort-select"
            >
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          )}
          <div className="ld-reviews-summary-badge">
            <i className="fas fa-comments"></i> إجمالي {isActiveListingFilterReady ? totalSummaryCount : totalAllCount} تقييم
          </div>
        </div>
      </div>

      <div className="review-list">
        {displayReviews.length > 0 ? (
          (paginationMode === 'pages' ? pagedReviews : displayReviews.slice(0, visibleCount)).map((rev) => (
            <motion.div
              key={rev.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="review-card"
            >
              <div className="review-header-row">
                <div className="review-info-item">
                  <strong className="review-label">اسم العميل:</strong>
                  <span className="review-value">{userNames[rev.clientId] || "..."}</span>
                </div>

                <div className="review-info-item review-rating-wrapper">
                  <strong className="review-label">تقييم العميل:</strong>
                  <div className="review-stars">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <i
                        key={star}
                        className={`fas fa-star ${star <= rev.rating ? "review-star-filled" : "review-star-empty"}`}
                      ></i>
                    ))}
                  </div>
                </div>

                <div className="review-info-item review-date-wrapper">
                  <strong className="review-label">تاريخ التقييم:</strong>
                  <span className="review-value">
                    {formatDate(rev.createdAt)}{" "}
                    <span className="review-date-sub">{timeAgo(rev.createdAt)}</span>
                  </span>
                </div>
              </div>

              {showListingInfo && targetType === 'expert' && String(rev?.listingId || '').trim() ? (
                <div className="review-listing-row">
                  <strong className="review-label">الإعلان:</strong>{' '}
                  <a
                    href={`/ilan/${encodeURIComponent(String(rev.listingId).trim())}`}
                    className="review-listing-link"
                  >
                    {listingTitles[String(rev.listingId).trim()] || `إعلان (${String(rev.listingId).trim()})`}
                  </a>
                </div>
              ) : null}

              <div className="review-comment-block">
                <strong className="review-label">تعليق العميل: </strong>
                <span className="review-comment-text">
                  "{rev.comment || "لم يتم ترك تعليق."}"
                </span>
              </div>
            </motion.div>
          ))
        ) : (
          <div className="review-empty">لم يتم إضافة أي تقييم بعد.</div>
        )}

        {paginationMode === 'pages' ? (
          <div className="review-pagination-wrap">
            <button
              type="button"
              className="review-pagination-btn"
              onClick={() => setPage((p) => Math.max(1, (Number(p) || 1) - 1))}
              disabled={safePage <= 1}
            >
              ‹
            </button>

            {pageNumbers.map((n, idx) => (
              typeof n === 'string' ? (
                <span key={`ellipsis-${idx}`} className="review-pagination-ellipsis">
                  {n}
                </span>
              ) : (
                <button
                  key={n}
                  type="button"
                  className={`review-pagination-btn${n === safePage ? " is-active" : ""}`}
                  onClick={() => setPage(n)}
                >
                  {n}
                </button>
              )
            ))}

            <button
              type="button"
              className="review-pagination-btn"
              onClick={() => setPage((p) => Math.min(totalPages, (Number(p) || 1) + 1))}
              disabled={safePage >= totalPages}
            >
              ›
            </button>
          </div>
        ) : (
          displayReviews.length > visibleCount && (
            paginationMode === 'all' ? (
              <button
                type="button"
                className="review-load-btn"
                onClick={() => setVisibleCount(displayReviews.length)}
              >
                عرض الكل ({displayReviews.length - visibleCount} متبقي)
              </button>
            ) : (
              <button
                type="button"
                className="review-load-btn"
                onClick={() => setVisibleCount((prev) => prev + Math.max(1, Number(step) || 5))}
              >
                عرض المزيد من التعليقات ({displayReviews.length - visibleCount} متبقي)
              </button>
            )
          )
        )}
      </div>

      {isModalOpen && (
        <div className="detail-overlay" onClick={() => !submitting && setIsModalOpen(false)} style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.65)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 16
        }}>
          <div className="confirm-modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '680px', background: '#1e293b', border: '1px solid #334155', borderRadius: '16px', padding: '24px', width: '100%' }}>
            <div className="confirm-modal-icon" style={{ color: '#fbbf24', textAlign: 'center', fontSize: '32px', marginBottom: '12px' }}>
              <i className="fas fa-star"></i>
            </div>
            <h3 style={{ color: '#f8fafc', fontSize: '20px', fontWeight: 800, textAlign: 'center', margin: '0 0 8px 0' }}>التقييم وكتابة تعليق</h3>
            <p style={{ color: '#94a3b8', marginTop: '6px', fontSize: '13px', textAlign: 'center', marginBottom: '20px' }}>
              قيم تجربتك واكتب تعليقك حول الخبير.
            </p>

            <div style={{ marginTop: '16px', padding: '14px', background: '#0f172a', border: '1px solid #334155', borderRadius: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                <div style={{ color: '#e2e8f0', fontWeight: 700 }}>التقييم</div>
                <div style={{ color: '#fbbf24', fontSize: '20px' }}>
                  {Array.from({ length: 5 }).map((_, i) => {
                    const value = i + 1;
                    const active = value <= rating;
                    return (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setRating(value)}
                        disabled={submitting}
                        style={{
                          all: 'unset',
                          cursor: submitting ? 'not-allowed' : 'pointer',
                          padding: '2px 4px',
                          opacity: active ? 1 : 0.3,
                        }}
                        aria-label={`${value} نجمة`}
                        title={`${value} نجمة`}
                      >
                        <i className="fas fa-star"></i>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div style={{ marginTop: '14px' }}>
              <label style={{ display: 'block', marginBottom: '8px', color: '#e2e8f0', fontWeight: 700 }}>
                التعليق (اختياري)
              </label>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                disabled={submitting}
                rows={5}
                style={{
                  width: '100%',
                  resize: 'vertical',
                  background: '#0f172a',
                  color: '#e2e8f0',
                  border: '1px solid #334155',
                  borderRadius: '12px',
                  padding: '12px',
                  outline: 'none',
                  fontSize: '14px',
                  lineHeight: 1.6
                }}
                placeholder="اكتب تجربتك هنا..."
                maxLength={1000}
              />
              <div style={{ marginTop: '6px', color: '#94a3b8', fontSize: '12px', textAlign: 'right' }}>
                {comment.length}/1000
              </div>
            </div>

            <div className="confirm-modal-actions" style={{ marginTop: '24px', display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button 
                type="button"
                className="confirm-btn-cancel" 
                onClick={() => setIsModalOpen(false)} 
                disabled={submitting}
                style={{
                  background: '#334155',
                  border: 'none',
                  color: '#cbd5e1',
                  padding: '10px 20px',
                  borderRadius: '8px',
                  fontWeight: 'bold',
                  cursor: 'pointer'
                }}
              >
                إلغاء
              </button>
              <button
                type="button"
                className="confirm-btn-confirm"
                onClick={handleSubmitReview}
                disabled={submitting}
                style={{ 
                  background: 'linear-gradient(135deg, #f59e0b, #f97316)', 
                  border: 'none', 
                  color: 'white',
                  padding: '10px 20px',
                  borderRadius: '8px',
                  fontWeight: 'bold',
                  cursor: submitting ? 'not-allowed' : 'pointer'
                }}
              >
                {submitting ? (
                  <><i className="fas fa-spinner fa-spin"></i> جاري الإرسال...</>
                ) : (
                  <>إرسال</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

/*
REMOVED BLOCKS FOR SYRIA LAUNCH (TURKISH FRONTEND SIMPLIFICATION):
- None (Added features to ReviewSystem.jsx without removing lines of code).
*/

export default ReviewSystem;
