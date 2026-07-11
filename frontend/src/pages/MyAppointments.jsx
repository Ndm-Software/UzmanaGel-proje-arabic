import React, { useState, useEffect } from 'react';
import Navbar from '../components/Navbar';
import { useNavigate, useLocation } from 'react-router-dom';
import '../styles/MyAppointments.css';
import {
  collection, onSnapshot, query, where, deleteDoc, doc,
  getDocs, getDoc, limit, runTransaction, serverTimestamp,
  increment, updateDoc, addDoc
} from 'firebase/firestore';
import { db, auth } from '../firebase/firebaseClient';
import { getOrCreateConversation } from '../services/chatApi';
import SharedCalendar from '../components/SharedCalendar';
import DOMPurify from 'dompurify';
import { showAppToast } from '../utils/showAppToast';
import ConfirmModal from '../components/ConfirmModal';

import ChatTermsModal from '../components/ChatTermsModal';
import {
  hasAcceptedChatTerms,
  saveChatTermsAccepted
} from '../utils/chatTermsStorage';

const isDevelopment = process.env.NODE_ENV === 'development';

const sanitizeText = (text) => {
  if (!text) return '';
  return DOMPurify.sanitize(String(text));
};

const statusConfig = {
  pending: { color: '#fbbf24', bg: 'rgba(251,191,36,0.1)', border: '#fbbf24', icon: 'fa-clock', label: 'Onay Bekliyor' },
  approved: { color: '#10b981', bg: 'rgba(16,185,129,0.1)', border: '#10b981', icon: 'fa-check', label: 'Onaylandı' },
  expired: { color: '#94a3b8', bg: 'rgba(148,163,184,0.1)', border: '#94a3b8', icon: 'fa-history', label: 'Geçmiş Randevu' },
  completed: { color: '#3b82f6', bg: 'rgba(59,130,246,0.1)', border: '#3b82f6', icon: 'fa-flag-checkered', label: 'Tamamlandı' },
  rejected: { color: '#f87171', bg: 'rgba(248,113,113,0.1)', border: '#f87171', icon: 'fa-times', label: 'Reddedildi' },
  cancelled_by_customer: { color: '#94a3b8', bg: 'rgba(148,163,184,0.1)', border: '#94a3b8', icon: 'fa-user-slash', label: 'İptal Ettiklerim' },
  cancelled_by_expert: { color: '#ef4444', bg: 'rgba(239,68,68,0.1)', border: '#ef4444', icon: 'fa-exclamation-circle', label: 'Uzman İptali' },
  reschedule_pending: { color: '#6366f1', bg: 'rgba(99,102,241,0.1)', border: '#6366f1', icon: 'fa-business-time', label: 'Vakit Değişikliği' },
  reschedule_rejected_by_customer: { color: '#f87171', bg: 'rgba(248,113,113,0.1)', border: '#f87171', icon: 'fa-user-times', label: 'Ertelemeyi Reddettiklerim' }
};

const MyAppointments = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [myRequests, setMyRequests] = useState([]);
  const [activeTab, setActiveTab] = useState('pending');
  const [loading, setLoading] = useState(true);

  const [selectedDate, setSelectedDate] = useState(null);
  const [rescheduleTime, setRescheduleTime] = useState('');

  const [expertWorkingHours, setExpertWorkingHours] = useState(null);
  const [dayAppointments, setDayAppointments] = useState([]);
  const [loadingSchedule, setLoadingSchedule] = useState(false);

  const [expandedId, setExpandedId] = useState(null);

  const [sortOrder, setSortOrder] = useState('newest');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(5);

  const [withdrawingId, setWithdrawingId] = useState(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [selectedRequestId, setSelectedRequestId] = useState(null);

  const [messagingId, setMessagingId] = useState(null);

  const [chatTermsModal, setChatTermsModal] = useState({
    open: false,
    accepted: false,
    loading: false,
    request: null,
    chatData: null,
  });

  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [withdrawRequestId, setWithdrawRequestId] = useState(null);
  const [showDeleteConfirmModal, setShowDeleteConfirmModal] = useState(false);
  const [deleteRequestId, setDeleteRequestId] = useState(null);
  const [showRejectRescheduleConfirm, setShowRejectRescheduleConfirm] = useState(false);
  const [rejectRescheduleReq, setRejectRescheduleReq] = useState(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tabParam = params.get('tab');
    if (tabParam === 'reschedule_requests') {
      setActiveTab('reschedule_pending');
    } else if (tabParam && statusConfig[tabParam]) {
      setActiveTab(tabParam);
    }
  }, [window.location.search]);

  useEffect(() => {
    let unsubscribeAppos = null;

    const unsubscribeAuth = auth.onAuthStateChanged((user) => {
      if (unsubscribeAppos) {
        unsubscribeAppos();
        unsubscribeAppos = null;
      }

      if (user) {
        const clientId = user.uid;

        const q = query(
          collection(db, 'appointments'),
          where('clientId', '==', clientId)
        );

        unsubscribeAppos = onSnapshot(q, (snapshot) => {
          const extracted = [];
          snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            extracted.push({
              id: docSnap.id,
              ...data,
              appointmentDate: data.date
            });
          });

          extracted.sort((a, b) => new Date(b.appointmentDate) - new Date(a.appointmentDate));

          const now = new Date();
          const toExpire = extracted.filter(r => {
            if (r.status !== 'approved') return false;
            const endStr = r.end || '23:59';
            const endTime = new Date(`${r.date}T${endStr}`);
            return now >= endTime;
          });
          toExpire.forEach(r => {
            updateDoc(doc(db, 'appointments', r.id), { status: 'expired' }).catch(() => { });
          });

          setMyRequests(extracted);
          setLoading(false);

          const focusId = location?.state?.focusId;
          if (focusId && extracted.some((x) => x.id === focusId)) {
            setExpandedId(focusId);
            window.history.replaceState({}, document.title);
          }
        }, (error) => {
          if (isDevelopment) console.error("Randevular çekilirken hata:", error.message);
          setLoading(false);
        });
      } else {
        setMyRequests([]);
        setLoading(false);
      }
    });

    return () => {
      if (unsubscribeAppos) {
        unsubscribeAppos();
      }
      unsubscribeAuth();
    };
  }, [navigate, location?.state]);

  useEffect(() => {
    if (!expandedId) return;
    const req = myRequests.find((r) => r.id === expandedId);
    if (req?.status === 'completed' || req?.status === 'approved' || req?.status === 'expired') {
      ensureReviewLoaded(expandedId);
    }
  }, [expandedId, myRequests]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tabParam = params.get('tab');
    if (tabParam && statusConfig[tabParam]) {
      setActiveTab(tabParam);
    }
  }, [window.location.search]);

  useEffect(() => {
    if (!showConfirmModal || !selectedRequestId || !selectedDate) return;

    const fetchExpertSchedule = async () => {
      setLoadingSchedule(true);
      const req = myRequests.find(r => r.id === selectedRequestId);
      if (!req || !req.expertId) {
        setLoadingSchedule(false);
        return;
      }

      try {
        const expertRef = doc(db, 'service_providers', req.expertId);
        const expertSnap = await getDoc(expertRef);
        if (expertSnap.exists()) {
          setExpertWorkingHours(expertSnap.data().workingHours || null);
        }

        const dateKey = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}-${String(selectedDate.getDate()).padStart(2, '0')}`;

        const apptsQuery = query(
          collection(db, 'appointments'),
          where('expertId', '==', req.expertId),
          where('status', '==', 'approved')
        );

        const apptSnap = await getDocs(apptsQuery);
        const appts = [];
        apptSnap.forEach(d => {
          const data = d.data();
          if (data.date === dateKey) {
            appts.push({ id: d.id, ...data });
          }
        });

        setDayAppointments(appts);

      } catch (error) {
        if (isDevelopment) console.error("Saatler çekilirken hata:", error.message);
      } finally {
        setLoadingSchedule(false);
      }
    };

    fetchExpertSchedule();
  }, [showConfirmModal, selectedRequestId, selectedDate, myRequests]);

  const getFilteredAndSortedRequests = () => {
    let filtered = myRequests.filter(req => req.status === activeTab);
    const sorted = [...filtered].sort((a, b) => {
      const dateA = new Date(a.appointmentDate);
      const dateB = new Date(b.appointmentDate);
      if (sortOrder === 'newest') {
        return dateB - dateA;
      } else {
        return dateA - dateB;
      }
    });
    return sorted;
  };

  const sortedRequests = getFilteredAndSortedRequests();
  const totalPages = Math.ceil(sortedRequests.length / itemsPerPage);
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentRequests = sortedRequests.slice(indexOfFirstItem, indexOfLastItem);

  const goToPage = (pageNumber) => {
    setCurrentPage(pageNumber);
    setExpandedId(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSortChange = (newOrder) => {
    setSortOrder(newOrder);
    setCurrentPage(1);
    setExpandedId(null);
  };

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setCurrentPage(1);
    setExpandedId(null);
  };

  const toggleExpand = (id) => {
    const next = expandedId === id ? null : id;
    setExpandedId(next);

    if (next) {
      const req = myRequests.find((r) => r.id === next);
      if (req?.status === 'completed' || req?.status === 'approved' || req?.status === 'expired') {
        ensureReviewLoaded(next);
      }
    }
  };

  const openWithdrawModal = (requestId) => {
    setWithdrawRequestId(requestId);
    setShowWithdrawModal(true);
  };

  const handleWithdrawRequest = async () => {
    if (!withdrawRequestId) return;

    setWithdrawingId(withdrawRequestId);
    setShowWithdrawModal(false);

    try {
      await deleteDoc(doc(db, 'appointments', withdrawRequestId));
      showAppToast('Randevu talebiniz başarıyla geri çekildi.', 'success');
    } catch (error) {
      if (isDevelopment) console.error('Talep geri çekilirken hata:', error.message);
      showAppToast('Talep geri çekilirken bir hata oluştu.', 'error');
    } finally {
      setWithdrawingId(null);
      setWithdrawRequestId(null);
    }
  };

  const openDeleteConfirmModal = (requestId) => {
    setDeleteRequestId(requestId);
    setShowDeleteConfirmModal(true);
  };

  const confirmDeleteRecord = async () => {
    if (!deleteRequestId) return;

    try {
      await deleteDoc(doc(db, 'appointments', deleteRequestId));
      setShowConfirmModal(false);
      setDeleteRequestId(null);
      setShowDeleteConfirmModal(false);
      showAppToast('Kayıt başarıyla silindi.', 'success');
    } catch (error) {
      showAppToast('Silme işlemi başarısız oldu.', 'error');
    }
  };

  const resetChatTermsModal = () => {
    setChatTermsModal({
      open: false,
      accepted: false,
      loading: false,
      request: null,
      chatData: null,
    });
  };

  const closeChatTermsModal = () => {
    if (chatTermsModal.loading) return;

    resetChatTermsModal();
    document.body.classList.remove('modal-open');
  };

  const getRequestChatData = async (req) => {
    const providerUid = String(
      req.providerUid ||
      req.expertUid ||
      req.expertId ||
      req.providerId ||
      ''
    ).trim();

    let serviceId = String(
      req.serviceId ||
      req.listingId ||
      req.ilanId ||
      req.adId ||
      ''
    ).trim();

    let serviceTitle = String(
      req.serviceTitle ||
      req.serviceName ||
      req.listingTitle ||
      req.listingName ||
      req.title ||
      req.note ||
      'Hizmet'
    ).trim();

    const appointmentId = String(req.id || '').trim();

    if (!providerUid) {
      throw new Error('Bu randevuda uzman bilgisi eksik. Lütfen yeni bir test randevusu oluşturun.');
    }

    if (!appointmentId) {
      throw new Error('Bu randevuda appointmentId eksik. Lütfen yeni bir test randevusu oluşturun.');
    }

    if (!serviceId) {
      const possibleProviderFields = ['providerUid', 'providerId', 'expertId', 'uid'];

      for (const fieldName of possibleProviderFields) {
        const servicesSnap = await getDocs(
          query(
            collection(db, 'services'),
            where(fieldName, '==', providerUid),
            limit(1)
          )
        );

        if (!servicesSnap.empty) {
          const serviceDoc = servicesSnap.docs[0];
          const serviceData = serviceDoc.data();

          serviceId = serviceDoc.id;
          serviceTitle = String(
            serviceData.title ||
            serviceData.serviceName ||
            serviceData.listingTitle ||
            serviceTitle ||
            'Hizmet'
          ).trim();

          break;
        }
      }
    }

    if (!serviceId) {
      throw new Error(
        'Bu randevuda hizmet/ilan bilgisi eksik. Randevu oluşturulurken serviceId veya listingId kaydedilmelidir.'
      );
    }

    return {
      providerUid,
      serviceId,
      serviceTitle,
      appointmentId,
    };
  };

  const handleMessage = async (req) => {
    try {
      const chatData = await getRequestChatData(req);
      const { providerUid, serviceId, appointmentId } = chatData;

      const acceptedBefore = hasAcceptedChatTerms({
        currentUid: auth.currentUser?.uid,
        providerUid,
        serviceId,
        appointmentId,
      });

      if (acceptedBefore) {
        await continueToChatFromRequest(req, chatData);
        return;
      }

      setChatTermsModal({
        open: true,
        accepted: false,
        loading: false,
        request: req,
        chatData,
      });

      document.body.classList.add('modal-open');
    } catch (error) {
      showAppToast(error?.message || 'Uzmanla sohbet açılamadı.', 'error');
    }
  };

  const continueToChatFromRequest = async (
    directReq = null,
    directChatData = null
  ) => {
    const req = directReq || chatTermsModal.request;
    const chatData = directChatData || chatTermsModal.chatData;

    if (!req || !chatData) return;

    const requestId = req?.id;
    setMessagingId(requestId);

    try {
      setChatTermsModal((prev) => ({
        ...prev,
        loading: true,
      }));

      const { providerUid, serviceId, serviceTitle, appointmentId } = chatData;

      const result = await getOrCreateConversation(
        providerUid,
        serviceId,
        serviceTitle || 'Hizmet',
        appointmentId
      );

      if (!result?.conversationId) {
        throw new Error('Sohbet ID alınamadı.');
      }

      saveChatTermsAccepted({
        currentUid: auth.currentUser?.uid,
        providerUid,
        serviceId,
        appointmentId,
      });

      resetChatTermsModal();
      document.body.classList.remove('modal-open');

      navigate(`/mesajlar?conversation=${encodeURIComponent(result.conversationId)}&open=true`);
    } catch (error) {
      if (isDevelopment) {
        console.error('Randevudan sohbet açma hatası:', error);
      }

      resetChatTermsModal();
      document.body.classList.remove('modal-open');

      showAppToast(error?.message || 'Uzmanla sohbet açılamadı.', 'error');
    } finally {
      setMessagingId(null);
    }
  };

  const closeConfirmModal = () => {
    setShowConfirmModal(false);
    setSelectedRequestId(null);
  };

  const [showPolicyInfo, setShowPolicyInfo] = useState(false);
  const [cancelModal, setCancelModal] = useState({ isOpen: false, req: null, penaltyType: null });

  const [reviewModal, setReviewModal] = useState({
    isOpen: false,
    req: null,
  });
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewComment, setReviewComment] = useState('');
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [reviewsByAppointmentId, setReviewsByAppointmentId] = useState({});
  const [reviewCheckedByAppointmentId, setReviewCheckedByAppointmentId] = useState({});

  const clampRating = (val) => {
    const n = Number(val);
    if (!Number.isFinite(n)) return 0;
    return Math.max(1, Math.min(5, Math.round(n)));
  };

  const ensureReviewLoaded = async (appointmentId) => {
    const id = String(appointmentId || '').trim();
    if (!id) return null;
    if (reviewCheckedByAppointmentId?.[id]) return reviewsByAppointmentId?.[id] || null;

    try {
      const snap = await getDoc(doc(db, 'reviews', id));
      if (snap.exists()) {
        const data = snap.data() || {};
        setReviewsByAppointmentId((prev) => ({ ...prev, [id]: { id: snap.id, ...data } }));
        return { id: snap.id, ...data };
      }
      return null;
    } catch (e) {
      if (isDevelopment) console.error('Review kontrol edilemedi:', e?.message);
      return null;
    } finally {
      setReviewCheckedByAppointmentId((prev) => ({ ...prev, [id]: true }));
    }
  };

  const openReviewModal = async (req) => {
    const existing = await ensureReviewLoaded(req?.id);
    if (existing) {
      showAppToast('Bu randevu zaten değerlendirilmiş.', 'info');
      return;
    }

    setReviewModal({ isOpen: true, req });
    setReviewRating(0);
    setReviewComment('');

    try {
      setReviewLoading(true);
      const cached = reviewsByAppointmentId?.[req.id];
      if (cached) {
        setReviewRating(Number(cached.rating) || 0);
        setReviewComment(cached.comment || '');
        return;
      }

      const snap = await getDoc(doc(db, 'reviews', req.id));
      if (snap.exists()) {
        const data = snap.data() || {};
        setReviewsByAppointmentId((prev) => ({ ...prev, [req.id]: { id: snap.id, ...data } }));
        setReviewCheckedByAppointmentId((prev) => ({ ...prev, [req.id]: true }));
        setReviewRating(Number(data.rating) || 0);
        setReviewComment(data.comment || '');
      } else {
        setReviewCheckedByAppointmentId((prev) => ({ ...prev, [req.id]: true }));
      }
    } catch (e) {
      if (isDevelopment) console.error('Review getirilemedi:', e?.message);
    } finally {
      setReviewLoading(false);
    }
  };

  const closeReviewModal = () => {
    if (reviewSubmitting) return;
    setReviewModal({ isOpen: false, req: null });
    setReviewRating(0);
    setReviewComment('');
  };

  const submitReview = async () => {
    const req = reviewModal?.req;
    if (!req?.id) return;
    if (!auth.currentUser?.uid) {
      showAppToast('Lütfen önce giriş yapın.', 'error');
      return;
    }
    const rating = clampRating(reviewRating);
    if (!rating) {
      showAppToast('Lütfen 1-5 arası bir puan seçin.', 'error');
      return;
    }

    const commentClean = sanitizeText(reviewComment || '').trim().slice(0, 1000);

    setReviewSubmitting(true);
    try {
      await runTransaction(db, async (transaction) => {
        const reviewRef = doc(db, 'reviews', req.id);
        const apptRef = doc(db, 'appointments', req.id);

        const existingReview = await transaction.get(reviewRef);
        const apptSnap = await transaction.get(apptRef);

        if (existingReview.exists()) {
          throw new Error('Bu randevu zaten değerlendirilmiş.');
        }

        if (!apptSnap.exists()) throw new Error('Randevu bulunamadı.');
        const appt = apptSnap.data() || {};
        const allowedStatuses = ['completed', 'approved', 'expired'];
        if (!allowedStatuses.includes(appt.status)) throw new Error('Sadece onaylanmış, tamamlanmış veya geçmiş randevular değerlendirilebilir.');
        if (appt.clientId !== auth.currentUser.uid) throw new Error('Bu randevuyu sadece sahibi değerlendirebilir.');

        const expertId = appt.expertId || req.expertId || null;
        const listingId = appt.listingId || appt.serviceId || req.listingId || req.serviceId || null;

        const expertRef = expertId ? doc(db, 'service_providers', expertId) : null;
        const serviceRef = listingId ? doc(db, 'services', listingId) : null;

        const expertSnap = expertRef ? await transaction.get(expertRef) : null;
        const serviceSnap = serviceRef ? await transaction.get(serviceRef) : null;

        const payload = {
          appointmentId: req.id,
          expertId: expertId || null,
          listingId: listingId || null,
          clientId: auth.currentUser.uid,
          rating: rating,
          comment: commentClean || '',
          createdAt: serverTimestamp(),
        };

        transaction.set(reviewRef, payload);

        if (expertRef && expertSnap?.exists()) {
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

      setReviewsByAppointmentId((prev) => ({
        ...prev,
        [req.id]: {
          id: req.id,
          appointmentId: req.id,
          rating: clampRating(reviewRating),
          comment: sanitizeText(reviewComment || '').trim().slice(0, 1000)
        }
      }));

      showAppToast('Değerlendirmeniz alındı. Teşekkürler!', 'success');
      closeReviewModal();
    } catch (e) {
      const msg = e?.message || 'Değerlendirme gönderilemedi.';
      showAppToast(msg, 'error');
    } finally {
      setReviewSubmitting(false);
    }
  };

  const handleCancelClick = (req) => {
    const now = new Date();
    const apptDate = new Date(`${req.appointmentDate}T${req.start}`);
    const diffMs = apptDate - now;
    const diffHours = diffMs / (1000 * 60 * 60);

    let pType = 'NO_PENALTY';
    if (diffHours < 2) pType = 'CRITICAL_PENALTY';
    else if (diffHours < 24) pType = 'DAILY_PENALTY';

    setCancelModal({ isOpen: true, req, penaltyType: pType });
  };

  const executeFirebaseTransaction = async () => {
    const { req, penaltyType } = cancelModal;
    if (!req) return;

    try {
      let penaltyDate = null;
      const nowMs = Date.now();

      if (penaltyType === 'DAILY_PENALTY') {
        penaltyDate = new Date(nowMs + 24 * 60 * 60 * 1000);
      } else if (penaltyType === 'CRITICAL_PENALTY') {
        penaltyDate = new Date(nowMs + 72 * 60 * 60 * 1000);
      }

      await runTransaction(db, async (transaction) => {
        const apptRef = doc(db, 'appointments', req.id);
        const expertRef = doc(db, 'service_providers', req.expertId);
        const customerRef = doc(db, 'users', auth.currentUser.uid);
        const walletRef = doc(collection(db, 'wallet_history'));

        const expertSnap = await transaction.get(expertRef);
        if (!expertSnap.exists()) throw "Uzman bulunamadı!";

        const expertData = expertSnap.data();
        const prevTokens = expertData.currentTokenCount || 0;

        transaction.update(apptRef, {
          status: 'cancelled_by_customer',
          cancelledAt: serverTimestamp()
        });

        transaction.update(expertRef, {
          currentTokenCount: prevTokens + 1
        });

        transaction.update(customerRef, {
          penaltyEndDate: penaltyDate,
          cancellationStrikes: increment(1)
        });

        transaction.set(walletRef, {
          transactionType: 'REFUND',
          amountPaid: 0,
          tokensInTransaction: 1,
          previousTokens: prevTokens,
          updatedTokens: prevTokens + 1,
          previousTotalSpent: expertData.lifetimeTotalSpend || 0,
          updatedTotalSpent: expertData.lifetimeTotalSpend || 0,
          processedAt: serverTimestamp(),
          providerDisplayName: sanitizeText(expertData.businessName || expertData.displayName || "Uzman"),
          referenceId: req.id,
          targetCustomerId: auth.currentUser.uid,
          userId: req.expertId,
          transactionNote: `${sanitizeText(req.client)} isimli müşterinin iptali nedeniyle jeton iade edildi.`,
          cardLastFour: null,
          cardOwner: null
        });
      });

      await addDoc(collection(db, "notifications"), {
        userId: req.expertId,
        title: "Randevu İptal Edildi ❌",
        message: `Sayın ${sanitizeText(req.expertName || 'Uzman')}, ${sanitizeText(req.client)} isimli müşteriniz "${sanitizeText(req.note) || 'Genel Hizmet'}" konulu ${req.appointmentDate} tarihli, saat ${req.start} başlangıçlı randevunuzu iptal etti. İptal nedeniyle harcadığınız 1 jeton hesabınıza iade edilmiştir.`,
        type: "appointment_cancelled_by_customer",
        appointmentId: req.id,
        appointmentDate: req.appointmentDate,
        customerName: sanitizeText(req.client),
        customerId: auth.currentUser.uid,
        link: "/expert-appointments?tab=cancelled_by_customer",
        createdAt: serverTimestamp(),
        read: false
      });

      setCancelModal({ isOpen: false, req: null, penaltyType: null });
      showAppToast("Randevunuz başarıyla iptal edildi.", "success");

    } catch (error) {
      if (isDevelopment) console.error("Hata Detayı:", error.message);
      showAppToast("İşlem başarısız oldu.", "error");
    }
  };

  const openRejectRescheduleConfirm = (req) => {
    setRejectRescheduleReq(req);
    setShowRejectRescheduleConfirm(true);
  };

  const handleRejectReschedule = async () => {
    const req = rejectRescheduleReq;
    if (!req) return;

    try {
      const appRef = doc(db, 'appointments', req.id);

      await updateDoc(appRef, {
        status: 'cancelled_by_expert',
        isCancelledByRescheduleRejection: true,
        rejectedAt: serverTimestamp()
      });

      await addDoc(collection(db, "notifications"), {
        userId: req.expertId,
        title: "Vakit Değişikliği Reddedildi ❌",
        message: `Müşteriniz ${sanitizeText(req.client)}, vakit değişikliği talebinizi reddetti. "${sanitizeText(req.note) || 'Genel Hizmet'}" konulu randevunuz ${req.appointmentDate} tarihinde saat ${req.start} itibarıyla başlayacaktı. Saat ve tarih değişikliği talebini siz attığınız için jetonunuz geri iade edilmedi. Lütfen Müşterileri onaylarken sizin konum, saat vb şartlarınıza uygun olduğunu çok iyi kontrol edin. İleride müşteriyi iptal etmek veya ertelemek zorunda kalmayın.`,
        appointmentId: req.id,
        type: "reschedule_rejected",
        link: "/expert-appointments",
        createdAt: serverTimestamp(),
        read: false
      });

      showAppToast("Talebi reddettiniz. Randevu uzman iptali olarak işaretlendi ve jeton iadesi yapılmadı.", "info");
    } catch (error) {
      if (isDevelopment) console.error("Reddetme Hatası:", error);
      showAppToast("İşlem sırasında bir hata oluştu.", "error");
    } finally {
      setShowRejectRescheduleConfirm(false);
      setRejectRescheduleReq(null);
    }
  };

  const tabs = [
    { key: 'pending', label: 'Onay Bekleyenler' },
    { key: 'reschedule_pending', label: 'Vakit Değişikliği Talepleri' },
    { key: 'approved', label: 'Onaylananlar' },
    { key: 'expired', label: 'Geçmiş Randevularım' },
    { key: 'cancelled_by_expert', label: 'Uzman İptali' },
    { key: 'cancelled_by_customer', label: 'İptal Ettiklerim' },
    { key: 'completed', label: 'Tamamlananlar' },
  ];

  if (loading) {
    return (
      <div className="profile-page">
        <Navbar />
        <div className="ma-loading">
          <h2><i className="fas fa-spinner fa-spin"></i> Yükleniyor...</h2>
        </div>
      </div>
    );
  }

  const renderScheduleGrid = () => {
    if (loadingSchedule) {
      return (
        <div style={{ color: '#64748b', textAlign: 'center', marginTop: '40px' }}>
          <i className="fas fa-spinner fa-spin fa-3x" style={{ marginBottom: '15px', opacity: 0.5 }}></i>
          <p style={{ fontSize: '14px' }}>Seçili günün doluluk bilgisi yükleniyor...</p>
        </div>
      );
    }

    if (!selectedDate) return null;

    const currentDayEn = selectedDate.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
    const todaySchedule = expertWorkingHours ? expertWorkingHours[currentDayEn] : null;

    let isDayClosed = true;
    let startH = 9;
    let endH = 18;

    if (expertWorkingHours) {
      if (todaySchedule && todaySchedule.enabled) {
        isDayClosed = false;
        startH = parseInt(todaySchedule.start.split(':')[0]);
        endH = parseInt(todaySchedule.end.split(':')[0]);
      }
    } else {
      isDayClosed = false;
    }

    if (isDayClosed) {
      return (
        <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '12px', padding: '20px', textAlign: 'center', marginTop: '20px' }}>
          <span style={{ color: '#ef4444', fontWeight: 'bold' }}>Uzman bu gün hizmet vermemektedir (Mesai Dışı)</span>
        </div>
      );
    }

    let blocks = [];
    let currentMin = startH * 60;
    const endDayMin = endH * 60;

    const getMins = (timeStr) => {
      if (typeof timeStr !== 'string') return timeStr * 60;
      const [h, m] = timeStr.split(':').map(Number);
      return h * 60 + m;
    };

    const formatTime = (mins) => {
      const h = Math.floor(mins / 60);
      const m = mins % 60;
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    };

    const approvedApps = dayAppointments.filter(app => app.status === 'approved' || app.createdBy === 'expert');
    const sortedApps = [...approvedApps].sort((a, b) => getMins(a.start) - getMins(b.start));

    const addFreeBlocks = (freeStart, freeEnd) => {
      let current = freeStart;
      while (current < freeEnd) {
        let nextHour = Math.floor(current / 60) * 60 + 60;
        let blockEnd = Math.min(nextHour, freeEnd);
        if (blockEnd - current >= 30) {
          blocks.push({ type: 'free', startStr: formatTime(current), endStr: formatTime(blockEnd) });
        }
        current = blockEnd;
      }
    };

    sortedApps.forEach(app => {
      const appStartMin = getMins(app.start);
      const appEndMin = getMins(app.end);
      if (appStartMin > currentMin) addFreeBlocks(currentMin, appStartMin);
      blocks.push({ type: 'appointment', startStr: formatTime(appStartMin), endStr: formatTime(appEndMin), data: app });
      currentMin = Math.max(currentMin, appEndMin);
    });

    if (currentMin < endDayMin) addFreeBlocks(currentMin, endDayMin);

    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '12px', marginTop: '15px', overflowY: 'auto', paddingRight: '5px' }}>
        {startH > 0 && (
          <div style={{ background: 'rgba(239, 68, 68, 0.05)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: '10px', padding: '12px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ color: '#fff', fontSize: '14px', fontWeight: 'bold' }}>{`00:00 - ${startH < 10 ? `0${startH}` : startH}:00`}</div>
            <div style={{ color: '#ef4444', fontSize: '12px', marginTop: '6px' }}>Mesai Dışı</div>
          </div>
        )}

        {blocks.map((block, idx) => {
          const isApp = block.type === 'appointment';
          return (
            <div key={idx} style={{
              background: isApp ? 'rgba(251, 191, 36, 0.1)' : 'rgba(16, 185, 129, 0.05)',
              border: `1.5px solid ${isApp ? 'rgba(251, 191, 36, 0.4)' : 'rgba(16, 185, 129, 0.3)'}`,
              borderRadius: '10px',
              padding: '12px',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#94a3b8' }}>
                <span>Başlangıç:</span>
                <span style={{ color: isApp ? '#fbbf24' : '#10b981', fontWeight: 'bold' }}>{block.startStr}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#94a3b8' }}>
                <span>Bitiş:</span>
                <span style={{ color: isApp ? '#fbbf24' : '#10b981', fontWeight: 'bold' }}>{block.endStr}</span>
              </div>
              <div style={{ textAlign: 'center', marginTop: '6px', fontSize: '13px', fontWeight: 'bold', color: isApp ? '#fbbf24' : '#10b981' }}>
                {isApp ? 'DOLU' : 'Müsait'}
              </div>
            </div>
          );
        })}

        {endH < 24 && (
          <div style={{ background: 'rgba(239, 68, 68, 0.05)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: '10px', padding: '12px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ color: '#fff', fontSize: '14px', fontWeight: 'bold' }}>{`${endH}:00 - 00:00`}</div>
            <div style={{ color: '#ef4444', fontSize: '12px', marginTop: '6px' }}>Mesai Dışı</div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="profile-page">
      <Navbar />
      <main className="profile-main ma-main">

        <div className="ma-header">
          <h2 className="ma-title">
            <i className="fas fa-calendar-check ma-title-icon"></i>
            Randevularım
          </h2>
        </div>

        <div className="ma-sort-bar">
          <div className="ma-sort-label">
            <i className="fas fa-sort-amount-down"></i> Sırala:
          </div>
          <div className="ma-sort-buttons">
            <button
              className={`ma-sort-btn ${sortOrder === 'newest' ? 'active' : ''}`}
              onClick={() => handleSortChange('newest')}
            >
              🕒 En Yeni
            </button>
            <button
              className={`ma-sort-btn ${sortOrder === 'oldest' ? 'active' : ''}`}
              onClick={() => handleSortChange('oldest')}
            >
              📅 En Eski
            </button>
          </div>
        </div>

        <div className="ma-tabs">
          {tabs.map(tab => {
            const count = myRequests.filter(r => r.status === tab.key).length;
            const cfg = statusConfig[tab.key];
            const isActive = activeTab === tab.key;
            return (
              <div key={tab.key} className="ma-tab-wrap">
                <button
                  className={`ma-tab-btn ${isActive ? 'ma-tab-btn--active' : ''}`}
                  style={isActive ? { color: cfg.color, borderBottomColor: cfg.color } : {}}
                  onClick={() => handleTabChange(tab.key)}
                >
                  {tab.label} ({count})
                </button>
              </div>
            );
          })}
        </div>

        <div className="ma-list">
          {currentRequests.length > 0 ? currentRequests.map((req) => {
            const cfg = statusConfig[req.status] || statusConfig.pending;
            const isExpanded = expandedId === req.id;
            const isWithdrawing = withdrawingId === req.id;
            const isRejected = req.status === 'rejected';
            const isApproved = req.status === 'approved';
            const isCompleted = req.status === 'completed';

            return (
              <div key={req.id} className={`ma-card ${isExpanded ? 'expanded' : ''}`}>

                <div className="ma-card-summary" onClick={() => toggleExpand(req.id)}>
                  <div className="ma-summary-left">
                    <div className="ma-expert-info">
                      <span className="ma-label">Uzman:</span>
                      <span className="ma-expert-name">{sanitizeText(req.expertName || 'İsimsiz Uzman')}</span>
                    </div>
                    <div className="ma-basic-info">
                      <span className="ma-date">{sanitizeText(req.appointmentDate)}</span>
                      <span className="ma-time">{sanitizeText(req.start)}</span>
                    </div>
                  </div>

                  <div className="ma-summary-right">
                    <div
                      className="ma-status-badge"
                      style={{ background: cfg.bg, color: cfg.color, borderColor: cfg.border }}
                    >
                      <i className={`fas ${cfg.icon}`}></i> {cfg.label}
                    </div>
                    <div className="ma-expand-icon">
                      <i className={`fas fa-chevron-${isExpanded ? 'up' : 'down'}`}></i>
                    </div>
                  </div>
                </div>

                {isExpanded && (
                  <div className="ma-card-detail">

                    <div className="ma-detail-section">
                      <div className="ma-detail-title">
                        <i className="fas fa-map-marker-alt"></i> Adres Bilgileri
                      </div>
                      <div className="ma-detail-content">
                        {sanitizeText(req.fullAddress || req.address || 'Adres belirtilmedi')}
                      </div>
                    </div>

                    <div className="ma-detail-section">
                      <div className="ma-detail-title">
                        <i className="fas fa-pen-alt"></i> İş Detayı / Not
                      </div>
                      <div className="ma-detail-content note">
                        "{sanitizeText(req.note || 'Not eklenmemiş.')}"
                      </div>
                    </div>

                    {(req.phone || req.email) && (
                      <div className="ma-detail-section">
                        <div className="ma-detail-title">
                          <i className="fas fa-address-card"></i> İletişim Bilgileri
                        </div>
                        <div className="ma-contact-row">
                          {req.phone && (
                            <span className="ma-contact-item">
                              <i className="fas fa-phone"></i> {sanitizeText(req.phone)}
                            </span>
                          )}
                          {req.email && (
                            <span className="ma-contact-item">
                              <i className="fas fa-envelope"></i> {sanitizeText(req.email)}
                            </span>
                          )}
                        </div>
                      </div>
                    )}

                    {req.status === 'reschedule_pending' && (
                      <div className="ma-reschedule-panel" style={{ marginTop: '20px', padding: '20px', background: 'rgba(99, 102, 241, 0.05)', borderRadius: '12px', border: '1px solid #334155' }}>

                        <div style={{ marginBottom: '20px' }}>
                          <h4 style={{ color: '#6366f1', fontSize: '14px', marginBottom: '8px' }}>
                            <i className="fas fa-comment-dots"></i> UZMANIN MAZERETİ VE TALEBİ:
                          </h4>
                          <p style={{ color: '#fff', fontStyle: 'italic', background: 'rgba(0,0,0,0.2)', padding: '15px', borderRadius: '12px', borderLeft: '4px solid #6366f1', fontSize: '15px' }}>
                            "{sanitizeText(req.rescheduleReason)}"
                          </p>
                        </div>

                        <div style={{ display: 'flex', gap: '15px' }}>
                          <button
                            className="ma-btn"
                            style={{ flex: 1, background: '#334155', border: '1px solid #ef4444', color: '#ef4444' }}
                            onClick={() => openRejectRescheduleConfirm(req)}
                          >
                            <i className="fas fa-times-circle"></i> Talebi Reddet
                          </button>

                          <button
                            className="ma-btn"
                            style={{ flex: 2, background: 'linear-gradient(135deg, #6366f1, #4f46e5)', boxShadow: '0 4px 15px rgba(99, 102, 241, 0.4)' }}
                            onClick={() => {
                              setSelectedRequestId(req.id);
                              if (req.rescheduleAllowedDates && req.rescheduleAllowedDates.length > 0) {
                                setSelectedDate(new Date(req.rescheduleAllowedDates[0]));
                              }
                              setShowConfirmModal(true);
                            }}
                          >
                            <i className="fas fa-calendar-check"></i> Uzmanın Önerdiği Tarihlerden Seç <i className="fas fa-arrow-right" style={{ marginLeft: '10px' }}></i>
                          </button>
                        </div>
                      </div>
                    )}

                    {isRejected && req.expertRejectNote && (
                      <div className="ma-detail-section rejected">
                        <div className="ma-detail-title">
                          <i className="fas fa-exclamation-circle"></i> Uzmanın Red Nedeni
                        </div>
                        <div className="ma-detail-content reject-note">
                          {sanitizeText(req.expertRejectNote)}
                        </div>
                      </div>
                    )}

                    <div className="ma-detail-actions">
                      {req.status === 'pending' ? (
                        <button
                          className="ma-btn ma-btn--withdraw"
                          onClick={() => openWithdrawModal(req.id)}
                          disabled={isWithdrawing}
                        >
                          {isWithdrawing ? (
                            <><i className="fas fa-spinner fa-spin"></i> İptal Ediliyor...</>
                          ) : (
                            <><i className="fas fa-undo-alt"></i> Talebi Geri Çek</>
                          )}
                        </button>
                      ) : req.status === 'rejected' ? (
                        <>
                          <button
                            className="ma-btn ma-btn--delete"
                            onClick={() => openDeleteConfirmModal(req.id)}
                          >
                            <i className="fas fa-trash-alt"></i> Kaydı Sil
                          </button>
                          <button
                            className="ma-btn ma-btn--rebook"
                            onClick={() => navigate(`/customer-appointment/${req.expertId}`)}
                          >
                            <i className="fas fa-calendar-plus"></i> Yeni Randevu İste
                          </button>
                        </>
                      ) : req.status === 'approved' ? (
                        <>
                          <button
                            className="ma-btn ma-btn--chat"
                            onClick={() => handleMessage(req)}
                            disabled={messagingId === req.id}
                          >
                            {messagingId === req.id ? (
                              <>
                                <i className="fas fa-spinner fa-spin"></i> Sohbet Açılıyor...
                              </>
                            ) : (
                              <>
                                <i className="fas fa-comments"></i> Uzmana Konuş
                              </>
                            )}
                          </button>

                          <button
                            className="ma-btn ma-btn--delete"
                            onClick={() => handleCancelClick(req)}
                          >
                            <i className="fas fa-calendar-times"></i> Randevuyu İptal Et
                          </button>

                          {cancelModal.isOpen && cancelModal.req.id === req.id && (
                            <div className="detail-overlay" onClick={() => setCancelModal({ ...cancelModal, isOpen: false })}>
                              <div className="confirm-modal-content" onClick={(e) => e.stopPropagation()}>
                                <div className="confirm-modal-icon" style={{ color: cancelModal.penaltyType === 'NO_PENALTY' ? '#fbbf24' : '#ef4444' }}>
                                  <i className="fas fa-exclamation-triangle"></i>
                                </div>
                                <h3>Randevu İptali</h3>

                                <div style={{ background: '#1e293b', padding: '10px', borderRadius: '8px', marginBottom: '15px', border: '1px solid #334155' }}>
                                  <span style={{ fontSize: '13px', color: '#94a3b8', display: 'block' }}>Uzmanın gelmesine kalan süre:</span>
                                  <strong style={{ color: '#f8fafc', fontSize: '16px' }}>
                                    {(() => {
                                      const apptDate = new Date(`${cancelModal.req.appointmentDate}T${cancelModal.req.start}`);
                                      const diff = apptDate - new Date();
                                      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
                                      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
                                      const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
                                      return `${days > 0 ? days + ' Gün ' : ''}${hours} Saat ${mins} Dakika`;
                                    })()}
                                  </strong>
                                </div>

                                <div style={{ marginBottom: '15px', textAlign: 'left' }}>
                                  <div
                                    onClick={() => setShowPolicyInfo(!showPolicyInfo)}
                                    style={{ cursor: 'pointer', color: '#60a5fa', fontSize: '13px', fontWeight: '600', textDecoration: 'underline' }}
                                  >
                                    <i className={`fas fa-chevron-${showPolicyInfo ? 'down' : 'right'}`} style={{ marginRight: '5px' }}></i>
                                    İptal etme ve Cezai İşlemler Hakkında
                                  </div>

                                  {showPolicyInfo && (
                                    <div style={{ background: '#0f172a', padding: '16px', borderRadius: '8px', marginTop: '10px', color: '#cbd5e1', border: '1px solid #334155' }}>
                                      <div style={{ textAlign: 'center', marginBottom: '15px' }}>
                                        <h4 style={{ color: '#f8fafc', marginBottom: '8px', fontSize: '15px' }}>Neden Ceza Alıyorum?</h4>
                                        <p style={{ fontSize: '12.5px', color: '#d9dfe7', lineHeight: '1.5' }}>
                                          Uzmanlarımız hazırlıklarını ve tüm günlük planlarını size göre yapar. Son dakika yapılan iptaller, uzmanlarımızın hem zaman hem de kazanç kaybı yaşamasına neden olur.
                                        </p>
                                      </div>
                                      <div style={{ textAlign: 'center', borderTop: '1px solid #334155', paddingTop: '15px' }}>
                                        <h4 style={{ color: '#f8fafc', marginBottom: '12px', fontSize: '15px' }}>Cezaların Çalışma Mantığı Nasıl?</h4>
                                        <div style={{ textAlign: 'left', fontSize: '12.5px', lineHeight: '1.6' }}>
                                          <div style={{ marginBottom: '8px' }}>• <strong>24 Saatten Fazla Varsa:</strong> Ceza yok.</div>
                                          <div style={{ marginBottom: '8px' }}>• <strong>2 - 24 Saat Kalmışsa:</strong> 1 gün kısıtlama.</div>
                                          <div>• <strong>2 Saatten Az Kalmışsa:</strong> 3 gün kısıtlama.</div>
                                        </div>
                                      </div>
                                    </div>
                                  )}
                                </div>

                                <p style={{ fontSize: '14.5px', lineHeight: '1.5' }}>
                                  {cancelModal.penaltyType === 'NO_PENALTY' && "Bu randevuyu cezasız iptal edebilirsiniz."}
                                  {cancelModal.penaltyType === 'DAILY_PENALTY' && <span><strong>⚠️ DİKKAT!</strong> İptal ederseniz <strong>24 saat</strong> yeni randevu alamazsınız.</span>}
                                  {cancelModal.penaltyType === 'CRITICAL_PENALTY' && <span><strong>🚨 KRİTİK!</strong> İptal ederseniz <strong>3 gün</strong> randevu alamazsınız.</span>}
                                </p>

                                <div className="confirm-modal-actions" style={{ marginTop: '20px' }}>
                                  <button className="confirm-btn-cancel" onClick={() => setCancelModal({ ...cancelModal, isOpen: false })}>Vazgeç</button>
                                  <button className="confirm-btn-confirm" style={{ background: '#ef4444' }} onClick={executeFirebaseTransaction}>
                                    Cezayı Kabul Et ve İptal Et
                                  </button>
                                </div>
                              </div>
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="ma-info-message" style={{
                          color: statusConfig[req.status]?.color,
                          background: statusConfig[req.status]?.bg,
                          padding: '12px', borderRadius: '8px',
                          border: `1.5px solid ${statusConfig[req.status]?.border}`,
                          marginTop: '10px', display: 'flex', alignItems: 'center', gap: '8px'
                        }}>
                          <i className={`fas ${statusConfig[req.status]?.icon}`}></i>
                          <strong>
                            {req.status === 'completed' && "Bu randevu başarıyla tamamlandı."}
                            {req.status === 'cancelled_by_customer' && "Bu randevuyu siz iptal ettiniz."}
                            {req.status === 'cancelled_by_expert' && "Bu randevu uzman tarafından iptal edildi."}
                          </strong>
                        </div>
                      )}

                      {(isCompleted || isApproved || req.status === 'expired') && (
                        <div style={{ marginTop: '12px' }}>
                          {reviewsByAppointmentId?.[req.id] ? (
                            <div style={{
                              background: 'rgba(16, 185, 129, 0.06)',
                              border: '1px solid rgba(16, 185, 129, 0.25)',
                              borderRadius: '10px',
                              padding: '12px'
                            }}>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
                                <div style={{ color: '#10b981', fontWeight: 700 }}>
                                  <i className="fas fa-star"></i> Değerlendirildi
                                </div>
                                <div style={{ color: '#fbbf24', fontWeight: 800 }}>
                                  {Array.from({ length: 5 }).map((_, i) => (
                                    <i
                                      key={i}
                                      className={`fas fa-star`}
                                      style={{ opacity: i < Number(reviewsByAppointmentId[req.id]?.rating || 0) ? 1 : 0.25, marginLeft: '2px' }}
                                    />
                                  ))}
                                </div>
                              </div>
                              {reviewsByAppointmentId[req.id]?.comment ? (
                                <div style={{ marginTop: '10px', color: '#cbd5e1', fontSize: '14px', lineHeight: 1.6 }}>
                                  "{sanitizeText(reviewsByAppointmentId[req.id]?.comment)}"
                                </div>
                              ) : (
                                <div style={{ marginTop: '10px', color: '#94a3b8', fontSize: '13px' }}>
                                  Yorum eklenmedi.
                                </div>
                              )}
                            </div>
                          ) : reviewCheckedByAppointmentId?.[req.id] ? (
                            <button
                              className="ma-btn ma-btn--message"
                              style={{ width: '100%', background: 'linear-gradient(135deg, #f59e0b, #f97316)', border: 'none' }}
                              onClick={() => openReviewModal(req)}
                            >
                              <i className="fas fa-star"></i> Değerlendir ve Yorumla
                            </button>
                          ) : (
                            <button
                              className="ma-btn ma-btn--message"
                              style={{ width: '100%', background: '#334155', border: '1px solid #475569', cursor: 'not-allowed', opacity: 0.9 }}
                              disabled
                            >
                              <i className="fas fa-spinner fa-spin"></i> Değerlendirme kontrol ediliyor...
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          }) : (
            <div className="ma-empty">
              <i className="fas fa-box-open ma-empty-icon"></i>
              <h3 className="ma-empty-title">Kayıt Bulunamadı</h3>
              <p className="ma-empty-text">Bu sekmede henüz gösterilecek bir randevu işleminiz bulunmuyor.</p>
            </div>
          )}
        </div>

        {totalPages > 1 && (
          <div className="ma-pagination">
            <button className="ma-page-btn" onClick={() => goToPage(currentPage - 1)} disabled={currentPage === 1}>
              ← Önceki
            </button>
            <div className="ma-page-numbers">
              {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                let pageNum;
                if (totalPages <= 5) {
                  pageNum = i + 1;
                } else if (currentPage <= 3) {
                  pageNum = i + 1;
                } else if (currentPage >= totalPages - 2) {
                  pageNum = totalPages - 4 + i;
                } else {
                  pageNum = currentPage - 2 + i;
                }
                return (
                  <button key={pageNum} className={`ma-page-num ${currentPage === pageNum ? 'active' : ''}`} onClick={() => goToPage(pageNum)}>
                    {pageNum}
                  </button>
                );
              })}
            </div>
            <button className="ma-page-btn" onClick={() => goToPage(currentPage + 1)} disabled={currentPage === totalPages}>
              Sonraki →
            </button>
          </div>
        )}
      </main>

      <ChatTermsModal
        isOpen={chatTermsModal.open}
        accepted={chatTermsModal.accepted}
        loading={chatTermsModal.loading}
        onAcceptedChange={(checked) =>
          setChatTermsModal((prev) => ({
            ...prev,
            accepted: checked,
          }))
        }
        onCancel={closeChatTermsModal}
        onConfirm={() => continueToChatFromRequest()}
      />

      {showWithdrawModal && (
        <div className="detail-overlay" onClick={() => setShowWithdrawModal(false)}>
          <div className="confirm-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="confirm-modal-icon" style={{ color: '#f59e0b' }}>
              <i className="fas fa-exclamation-triangle"></i>
            </div>
            <h3>Talebi Geri Çek</h3>
            <p>
              Bu randevu talebini geri çekmek istediğinize emin misiniz?<br />
              Uzman henüz onaylamadığı için herhangi bir ceza yansımaz.
            </p>
            <div className="confirm-modal-actions">
              <button className="confirm-btn-cancel" onClick={() => setShowWithdrawModal(false)}>
                Vazgeç
              </button>
              <button className="confirm-btn-confirm" onClick={handleWithdrawRequest} style={{ background: '#f59e0b' }}>
                Geri Çek
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={showDeleteConfirmModal}
        onClose={() => {
          setShowDeleteConfirmModal(false);
          setDeleteRequestId(null);
        }}
        onConfirm={confirmDeleteRecord}
        title="Kaydı Sil"
        message="Bu kaydı silmek istediğinize emin misiniz? Bu işlem geri alınamaz."
        confirmText="Evet, Sil"
        cancelText="Vazgeç"
        type="danger"
      />

      <ConfirmModal
        isOpen={showRejectRescheduleConfirm}
        onClose={() => {
          setShowRejectRescheduleConfirm(false);
          setRejectRescheduleReq(null);
        }}
        onConfirm={handleRejectReschedule}
        title="Talebi Reddet"
        message="Bu vakit değişikliği talebini reddederseniz randevu iptal edilecektir. Onaylıyor musunuz?"
        confirmText="Evet, Reddet"
        cancelText="Vazgeç"
        type="warning"
      />

      {showConfirmModal && selectedRequestId && (
        <div className="detail-overlay" onClick={() => { setShowConfirmModal(false); setSelectedRequestId(null); }}>
          <div className="appointment-modal-form" onClick={e => e.stopPropagation()} style={{ width: '95vw', height: '95vh', maxWidth: '1800px', display: 'flex', flexDirection: 'column', padding: '30px' }}>

            <div className="appo-form-header" style={{ flexShrink: 0 }}>
              <h3 className="appo-form-title">Yeni Randevu Vaktinizi Belirleyin</h3>
              <div className="appo-form-title-line"></div>
              <p style={{ color: '#94a3b8', fontSize: '14px', marginTop: '10px' }}>Uzmanımız sadece aşağıda parlayan günlerde müsaittir.</p>
            </div>

            <div style={{ display: 'flex', gap: '30px', flex: 1, overflow: 'hidden', marginTop: '20px' }}>

              <div style={{ flex: '1.3', background: 'rgba(15, 23, 42, 0.5)', padding: '20px', borderRadius: '16px', border: '1px dashed #334155', overflowY: 'auto' }}>
                <SharedCalendar
                  mode="CUSTOMER"
                  selectedDate={selectedDate}
                  onDateSelect={setSelectedDate}
                  enabledDates={myRequests.find(r => r.id === selectedRequestId)?.rescheduleAllowedDates}
                />
              </div>

              <div style={{ flex: '1', display: 'flex', flexDirection: 'column', gap: '20px', overflowY: 'auto' }}>

                <div style={{ background: '#1e293b', borderRadius: '16px', padding: '25px', flex: 1, border: '1px solid #334155', display: 'flex', flexDirection: 'column' }}>
                  <label className="appointment-input-label" style={{ color: '#ffcc00', fontSize: '14px', marginBottom: '15px' }}>
                    <i className="fas fa-clock"></i> {selectedDate?.toLocaleDateString('tr-TR')} GÜNÜ UZMAN PROGRAMI
                  </label>

                  <div style={{ padding: '15px', background: 'rgba(59, 130, 246, 0.1)', borderRadius: '10px', border: '1px solid #3b82f6', fontSize: '13px', lineHeight: '1.6', color: '#cbd5e1' }}>
                    💡 <strong>Nasıl Seçerim?</strong> Lütfen uzmanın boş saatlerini dikkate alarak uygun bir başlangıç saati belirleyin ve aşağıdaki kutuya yazın.
                  </div>

                  {renderScheduleGrid()}
                </div>

                <div style={{ background: '#0f172a', padding: '25px', borderRadius: '16px', border: '2px solid #6366f1', flexShrink: 0 }}>
                  {(() => {
                    const req = myRequests.find(r => r.id === selectedRequestId);
                    const duration = req?.appointmentDuration || 30;
                    let calculatedEndTimeStr = "--:--";

                    if (rescheduleTime) {
                      const [h, m] = rescheduleTime.split(':').map(Number);
                      const endMin = (h * 60) + m + duration;
                      calculatedEndTimeStr = `${String(Math.floor(endMin / 60)).padStart(2, '0')}:${String(endMin % 60).padStart(2, '0')}`;
                    }

                    return (
                      <>
                        <label className="appointment-input-label" style={{ color: '#fff', fontSize: '13px' }}>
                          YENİ SAATİNİZİ BELİRLEYİN: <span style={{ color: '#f59e0b' }}>(İşlem Süresi: {duration} Dk)</span>
                        </label>

                        <div style={{ display: 'flex', gap: '15px', marginTop: '10px', alignItems: 'flex-end' }}>

                          <div style={{ flex: 1 }}>
                            <span style={{ color: '#94a3b8', fontSize: '12px', display: 'block', marginBottom: '5px' }}>Başlangıç Saati</span>
                            <input
                              type="time"
                              className="appointment-input-field"
                              style={{ width: '100%', fontSize: '20px', fontWeight: 'bold', textAlign: 'center', height: '55px', margin: 0, border: '1px solid #6366f1' }}
                              onChange={(e) => setRescheduleTime(e.target.value)}
                            />
                          </div>

                          <div style={{ color: '#64748b', display: 'flex', alignItems: 'center', height: '55px' }}>
                            <i className="fas fa-arrow-right"></i>
                          </div>

                          <div style={{ flex: 1 }}>
                            <span style={{ color: '#94a3b8', fontSize: '12px', display: 'block', marginBottom: '5px' }}>Bitiş (Otomatik)</span>
                            <input
                              type="text"
                              disabled
                              value={calculatedEndTimeStr}
                              className="appointment-input-field"
                              style={{ width: '100%', fontSize: '20px', fontWeight: 'bold', textAlign: 'center', height: '55px', margin: 0, background: '#1e293b', color: '#64748b', cursor: 'not-allowed', border: '1px solid #334155' }}
                            />
                          </div>

                          <button
                            className="btn-form-submit"
                            style={{ flex: 1.5, height: '55px', margin: 0, background: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', fontSize: '15px' }}
                            onClick={async () => {
                              if (!rescheduleTime) { showAppToast("Lütfen bir başlangıç saati giriniz!", "error"); return; }

                              const req = myRequests.find(r => r.id === selectedRequestId);
                              const duration = req?.appointmentDuration || 30;
                              const toMinutes = (t) => t.split(':').reduce((h, m) => h * 60 + (+m));

                              const reqStartMin = toMinutes(rescheduleTime);
                              const reqEndMin = reqStartMin + duration;

                              const newEndStr = `${Math.floor(reqEndMin / 60).toString().padStart(2, '0')}:${(reqEndMin % 60).toString().padStart(2, '0')}`;

                              const currentDayEn = selectedDate.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
                              const todaySchedule = expertWorkingHours ? expertWorkingHours[currentDayEn] : null;

                              if (!todaySchedule || !todaySchedule.enabled) {
                                showAppToast("Seçtiğiniz gün uzman mesai dışındadır.", "error"); return;
                              }

                              const workStartMin = toMinutes(todaySchedule.start);
                              const workEndMin = toMinutes(todaySchedule.end);

                              if (reqStartMin < workStartMin || reqEndMin > workEndMin) {
                                showAppToast(`HATA: Seçtiğiniz saat aralığı, uzmanın mesai saatleri (${todaySchedule.start} - ${todaySchedule.end}) dışına taşıyor.`, "error"); return;
                              }

                              const approvedApps = dayAppointments.filter(app => (app.status === 'approved' || app.createdBy === 'expert') && app.id !== req.id);

                              for (let app of approvedApps) {
                                const existStartMin = toMinutes(app.start);
                                const existEndMin = toMinutes(app.end);

                                if (reqStartMin < existEndMin + 10 && reqEndMin > existStartMin - 10) {
                                  showAppToast(`UYARI: Seçtiğiniz saat, uzmanın başka bir randevusu ile çakışıyor veya çok yakın.\n\nHizmetin aksamaması için lütfen diğer randevularla aranızda en az 10 dakika "Tampon Süre" bırakın.`, "error");
                                  return;
                                }
                              }

                              try {
                                const year = selectedDate.getFullYear();
                                const month = String(selectedDate.getMonth() + 1).padStart(2, '0');
                                const day = String(selectedDate.getDate()).padStart(2, '0');
                                const correctDateStr = `${year}-${month}-${day}`;

                                await updateDoc(doc(db, 'appointments', req.id), {
                                  status: 'approved',
                                  date: correctDateStr,
                                  start: rescheduleTime,
                                  end: newEndStr,
                                  startHour: Math.floor(reqStartMin / 60),
                                  endHour: Math.floor(reqEndMin / 60),
                                  approvedTime: Date.now()
                                });

                                await addDoc(collection(db, "notifications"), {
                                  userId: req.expertId,
                                  title: "Vakit Değişikliği Onaylandı ✅",
                                  message: `Müşteriniz ${sanitizeText(req.client)}, vakit değişikliği talebinizi kabul etti. "${sanitizeText(req.note) || 'Genel Hizmet'}" konulu randevunuz ${correctDateStr} tarihinde saat ${rescheduleTime} itibarıyla başlayacak şekilde güncellenmiştir. (Konum: ${sanitizeText(req.district)} / ${sanitizeText(req.city)})`,
                                  appointmentId: req.id,
                                  appointmentDate: correctDateStr,
                                  type: "reschedule_approved",
                                  link: "/expert-appointments",
                                  createdAt: serverTimestamp(),
                                  read: false
                                });

                                setShowConfirmModal(false);
                                showAppToast("İşlem Başarılı! Randevunuz güncellendi ve uzmana bildirim gönderildi. ✅", "success");
                              } catch (err) {
                                if (isDevelopment) console.error("Firebase Hatası:", err.message);
                                showAppToast("Bildirim gönderilirken bir hata oluştu.", "error");
                              }
                            }}
                          >
                            Vakti Onayla <i className="fas fa-check-double"></i>
                          </button>
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '25px', flexShrink: 0 }}>
              <button
                type="button"
                className="btn-form-cancel"
                style={{ margin: 0, padding: '12px 30px', width: 'auto' }}
                onClick={() => setShowConfirmModal(false)}
              >
                Vazgeç ve Kapat
              </button>
            </div>

          </div>
        </div>
      )}

      {reviewModal.isOpen && reviewModal.req && (
        <div className="detail-overlay" onClick={closeReviewModal}>
          <div className="confirm-modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '680px' }}>
            <div className="confirm-modal-icon" style={{ color: '#fbbf24' }}>
              <i className="fas fa-star"></i>
            </div>
            <h3>Değerlendir ve Yorumla</h3>
            <p style={{ color: '#94a3b8', marginTop: '6px', fontSize: '13px' }}>
              {sanitizeText(reviewModal.req.expertName || 'Uzman')} için puan verin ve isterseniz yorum ekleyin.
            </p>

            {reviewLoading ? (
              <div style={{ color: '#94a3b8', padding: '16px', textAlign: 'center' }}>
                <i className="fas fa-spinner fa-spin"></i> Yükleniyor...
              </div>
            ) : (
              <>
                <div style={{ marginTop: '16px', padding: '14px', background: '#0f172a', border: '1px solid #334155', borderRadius: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                    <div style={{ color: '#e2e8f0', fontWeight: 700 }}>Puan</div>
                    <div style={{ color: '#fbbf24', fontSize: '20px' }}>
                      {Array.from({ length: 5 }).map((_, i) => {
                        const value = i + 1;
                        const active = value <= Number(reviewRating || 0);
                        return (
                          <button
                            key={value}
                            type="button"
                            onClick={() => setReviewRating(value)}
                            disabled={reviewSubmitting}
                            style={{
                              all: 'unset',
                              cursor: reviewSubmitting ? 'not-allowed' : 'pointer',
                              padding: '2px 4px',
                              opacity: active ? 1 : 0.3,
                            }}
                            aria-label={`${value} yıldız`}
                            title={`${value} yıldız`}
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
                    Yorum (opsiyonel)
                  </label>
                  <textarea
                    value={reviewComment}
                    onChange={(e) => setReviewComment(e.target.value)}
                    disabled={reviewSubmitting}
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
                    placeholder="Deneyiminizi yazın..."
                    maxLength={1000}
                  />
                  <div style={{ marginTop: '6px', color: '#94a3b8', fontSize: '12px', textAlign: 'right' }}>
                    {String(reviewComment || '').length}/1000
                  </div>
                </div>
              </>
            )}

            <div className="confirm-modal-actions" style={{ marginTop: '18px' }}>
              <button className="confirm-btn-cancel" onClick={closeReviewModal} disabled={reviewSubmitting}>
                Vazgeç
              </button>
              <button
                className="confirm-btn-confirm"
                onClick={submitReview}
                disabled={reviewSubmitting || reviewLoading}
                style={{ background: 'linear-gradient(135deg, #f59e0b, #f97316)' }}
              >
                {reviewSubmitting ? (
                  <><i className="fas fa-spinner fa-spin"></i> Gönderiliyor...</>
                ) : (
                  <>Gönder</>
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

1. expandedId check in useEffect:
    if (req?.status === 'completed') {
      ensureReviewLoaded(expandedId);
    }

2. next check in toggleExpand:
      if (req?.status === 'completed') {
        ensureReviewLoaded(next);
      }

3. appt.status check in submitReview transaction:
        if (appt.status !== 'completed') throw new Error('Sadece tamamlanmış randevular değerlendirilebilir.');

4. isCompleted check in UI:
                      {isCompleted && (
*/

export default MyAppointments;