import React, { useMemo, useState, useEffect } from 'react';
import { db } from '../firebase/firebaseClient';
import { collection, query, where, orderBy, onSnapshot, doc, getDoc, getDocs } from 'firebase/firestore';
import { motion } from 'framer-motion';
import '../styles/ReviewSystem.css';

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:5000";

const SORT_OPTIONS = [
  { value: 'newest', label: 'En yeni' },
  { value: 'oldest', label: 'En eski' },
  { value: 'rating_desc', label: 'En yüksek yıldız' },
  { value: 'rating_asc', label: 'En düşük yıldız' },
];

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

  const maskName = (fullName) => {
    if (!fullName) return "Gizli Kullanıcı";
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

    if (diffDays === 0) return "(Bugün)";
    if (diffDays < 30) return `(${diffDays} Gün önce)`;

    const months = Math.floor(diffDays / 30);
    const remainingDays = diffDays % 30;

    if (remainingDays === 0) return `(${months} Ay önce)`;
    return `(${months} Ay ${remainingDays} Gün önce)`;
  };

  const formatDate = (ts) => {
    if (!ts) return "--.--.----";
    const date = ts.toDate ? ts.toDate() : new Date(ts);
    return new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' }).format(date);
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
            newUserMap[rev.clientId] = "Kullanıcı";
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

          nextTitles[id] = `İlan (${id})`;
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

  if (loading) return <div className="review-loading">Yorumlar yükleniyor...</div>;

  return (
    <div className="review-section-wrapper">
      <div className="ld-reviews-header-wrapper">
        <div className="review-section-title-wrap">
          <h2 className="review-section-title">Müşteri Yorumları</h2>
          <div className="review-section-avg">
            {averageRating} <i className="fas fa-star"></i>
          </div>
        </div>
        <div className="review-section-actions">
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
            Toplam {isActiveListingFilterReady ? totalSummaryCount : totalAllCount} Değerlendirme
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
                  <strong className="review-label">Müşteri İsim:</strong>
                  <span className="review-value">{userNames[rev.clientId] || "..."}</span>
                </div>

                <div className="review-info-item review-rating-wrapper">
                  <strong className="review-label">Müşteri Puanı:</strong>
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
                  <strong className="review-label">Değerlendirme Tarihi:</strong>
                  <span className="review-value">
                    {formatDate(rev.createdAt)}{" "}
                    <span className="review-date-sub">{timeAgo(rev.createdAt)}</span>
                  </span>
                </div>
              </div>

              {showListingInfo && targetType === 'expert' && String(rev?.listingId || '').trim() ? (
                <div className="review-listing-row">
                  <strong className="review-label">İlan:</strong>{' '}
                  <a
                    href={`/ilan/${encodeURIComponent(String(rev.listingId).trim())}`}
                    className="review-listing-link"
                  >
                    {listingTitles[String(rev.listingId).trim()] || `İlan (${String(rev.listingId).trim()})`}
                  </a>
                </div>
              ) : null}

              <div className="review-comment-block">
                <strong className="review-label">Müşteri Yorumu: </strong>
                <span className="review-comment-text">
                  "{rev.comment || "Yorum bırakılmadı."}"
                </span>
              </div>
            </motion.div>
          ))
        ) : (
          <div className="review-empty">Henüz değerlendirme yapılmamış.</div>
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
                Tümünü Gör ({displayReviews.length - visibleCount} kaldı)
              </button>
            ) : (
              <button
                type="button"
                className="review-load-btn"
                onClick={() => setVisibleCount((prev) => prev + Math.max(1, Number(step) || 5))}
              >
                Daha Fazla Yorum Gör ({displayReviews.length - visibleCount} kaldı)
              </button>
            )
          )
        )}
      </div>
    </div>
  );
};

export default ReviewSystem;