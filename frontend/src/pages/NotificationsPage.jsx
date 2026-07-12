import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { 
  collection, 
  query, 
  getDocs, 
  updateDoc, 
  doc, 
  deleteDoc,
  where
} from 'firebase/firestore';
import { auth, db } from '../firebase/firebaseClient';
import Navbar from '../components/Navbar';
import PageTransition from '../components/PageTransition';
import LoadingSpinner from '../components/LoadingSpinner';
import DOMPurify from 'dompurify';
import '../styles/NotificationsPage.css';
import { getOrCreateConversation } from '../services/chatApi';
import ChatTermsModal from '../components/ChatTermsModal';
import {
  hasAcceptedChatTerms,
  saveChatTermsAccepted
} from '../utils/chatTermsStorage';
import { ARABIC_LATIN_LOCALE, formatLatinNumber } from '../utils/localeFormat';

const NotificationsPage = () => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notifications, setNotifications] = useState([]);
  const [filter, setFilter] = useState('all');
  const [selectedNotification, setSelectedNotification] = useState(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [error, setError] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [notificationToDelete, setNotificationToDelete] = useState(null);

  const [noticeModal, setNoticeModal] = useState({
    open: false,
    type: 'warning',
    title: '',
    message: '',
    primaryText: 'حسناً'
  });

  const [chatTermsModal, setChatTermsModal] = useState({
    open: false,
    accepted: false,
    loading: false,
    notification: null,
  });

  const navigate = useNavigate();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (!currentUser) {
        navigate('/login');
        return;
      }
      setUser(currentUser);
      loadNotifications();
    });

    return () => unsubscribe();
  }, [navigate]);

  useEffect(() => {
    return () => {
      document.body.classList.remove('modal-open');
    };
  }, []);

  const openNoticeModal = ({
    type = 'warning',
    title = 'تنبيه',
    message = '',
    primaryText = 'حسناً'
  }) => {
    setNoticeModal({
      open: true,
      type,
      title,
      message,
      primaryText
    });
    document.body.classList.add('modal-open');
  };

  const closeNoticeModal = () => {
    setNoticeModal((prev) => ({
      ...prev,
      open: false
    }));

    if (!showDetailModal && !showDeleteConfirm) {
      document.body.classList.remove('modal-open');
    }
  };

  const loadNotifications = async () => {
    try {
      setLoading(true);
      setError(null);

      const currentUser = auth.currentUser;
      if (!currentUser) return;

      let replies = [];
      let notifs = [];

      try {
        const repliesSnap = await getDocs(query(
          collection(db, 'contact_replies'),
          where('userId', '==', currentUser.uid)
        ));

        replies = repliesSnap.docs.map(doc => {
          const data = doc.data();
          return { 
            id: doc.id, 
            ...data, 
            createdAt: data.createdAt?.toDate() || new Date(), 
            read: data.read || false, 
            _collection: 'contact_replies' 
          };
        });
      } catch (e) {
        if (process.env.NODE_ENV === 'development') {
          console.warn('contact_replies sorgu hatası:', e);
        }
      }

      if (currentUser) {
        try {
          const notifsSnap = await getDocs(query(
            collection(db, 'notifications'),
            where('userId', '==', currentUser.uid)
          ));

          notifs = notifsSnap.docs.map(doc => {
            const data = doc.data();

            let createdAt;
            if (data.createdAt?.toDate) {
              createdAt = data.createdAt.toDate();
            } else if (data.createdAt) {
              createdAt = new Date(data.createdAt);
            } else {
              createdAt = new Date();
            }

            return { 
              id: doc.id, 
              ...data, 
              createdAt, 
              read: data.read || false, 
              _collection: 'notifications' 
            };
          });
        } catch (e) {
          if (process.env.NODE_ENV === 'development') {
            console.warn('notifications sorgu hatası:', e);
          }
        }
      }

      const adminReplyMessageIds = new Set(
        notifs
          .filter(n => n.type === 'admin_reply' && n.messageId)
          .map(n => n.messageId)
      );

      const filteredReplies = replies.filter(r => {
        if (!r.messageId) return true;
        return !adminReplyMessageIds.has(r.messageId);
      });

      const merged = [...filteredReplies, ...notifs].sort((a, b) => b.createdAt - a.createdAt);
      setNotifications(merged);
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Bildirimler yüklenirken hata:', error);
      }
      setError('حدث خطأ أثناء تحميل الإشعارات.');
    } finally {
      setLoading(false);
    }
  };

  const markAllAsRead = async () => {
    try {
      const unreadNotifications = notifications.filter(n => !n.read);
      
      for (const notification of unreadNotifications) {
        const colName = notification._collection || 'contact_replies';
        await updateDoc(doc(db, colName, notification.id), { read: true });
      }

      setNotifications(notifications.map(n => ({ ...n, read: true })));
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Hata:', error);
      }

      openNoticeModal({
        type: 'error',
        title: 'تعذر إكمال العملية',
        message: 'حدث خطأ أثناء تحديث الإشعارات. يرجى المحاولة مرة أخرى.'
      });
    }
  };

  const markAsRead = async (notificationId) => {
    try {
      const notif = notifications.find(n => n.id === notificationId);
      const colName = notif?._collection || 'contact_replies';

      await updateDoc(doc(db, colName, notificationId), { read: true });

      setNotifications(notifications.map(n =>
        n.id === notificationId ? { ...n, read: true } : n
      ));
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Hata:', error);
      }
    }
  };

  const confirmDelete = (notification, e) => {
    e.stopPropagation();
    setNotificationToDelete(notification);
    setShowDeleteConfirm(true);
    document.body.classList.add('modal-open');
  };

  const deleteNotification = async () => {
    if (!notificationToDelete) return;
    
    try {
      const colName = notificationToDelete._collection || 'contact_replies';
      await deleteDoc(doc(db, colName, notificationToDelete.id));
      
      setNotifications(notifications.filter(n => n.id !== notificationToDelete.id));
      
      if (selectedNotification?.id === notificationToDelete.id) {
        setShowDetailModal(false);
      }
      
      setShowDeleteConfirm(false);
      setNotificationToDelete(null);
      document.body.classList.remove('modal-open');
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Hata:', error);
      }

      openNoticeModal({
        type: 'error',
        title: 'فشلت عملية الحذف',
        message: 'حدث خطأ أثناء حذف الإشعار. يرجى المحاولة مرة أخرى.'
      });
    }
  };

  const cancelDelete = () => {
    setShowDeleteConfirm(false);
    setNotificationToDelete(null);

    if (!noticeModal.open && !showDetailModal) {
      document.body.classList.remove('modal-open');
    }
  };

  const openModal = (notification) => {
    setSelectedNotification(notification);
    setShowDetailModal(true);
    document.body.classList.add('modal-open');
    
    if (!notification.read) {
      markAsRead(notification.id);
    }
  };

  const closeModal = () => {
    setShowDetailModal(false);

    if (!noticeModal.open && !showDeleteConfirm) {
      document.body.classList.remove('modal-open');
    }
  };

  const getFilteredNotifications = () => {
    switch (filter) {
      case 'unread':
        return notifications.filter(n => !n.read);
      case 'read':
        return notifications.filter(n => n.read);
      default:
        return notifications;
    }
  };

  const unreadCount = notifications.filter(n => !n.read).length;
  const filteredNotifications = getFilteredNotifications();

  const formatDate = (date) => {
    if (!date) return '';
    
    const now = new Date();
    const diff = now - date;
    const diffMinutes = Math.floor(diff / (1000 * 60));
    const diffHours = Math.floor(diff / (1000 * 60 * 60));
    const diffDays = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (diffMinutes < 1) return 'الآن';
    if (diffMinutes < 60) return `منذ ${formatLatinNumber(diffMinutes)} دقيقة`;
    if (diffHours < 24) return `منذ ${formatLatinNumber(diffHours)} ساعة`;
    if (diffDays === 1) return 'أمس';
    if (diffDays < 7) return `منذ ${formatLatinNumber(diffDays)} أيام`;
    
    return date.toLocaleDateString(ARABIC_LATIN_LOCALE, {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const normalizeNotificationText = (value) => {
    const text = String(value || '').trim();
    if (!text) return '';

    const lower = text.toLowerCase();
    const replacements = [
      ['randevu talebiniz onaylandı', 'تمت الموافقة على طلب الموعد.'],
      ['randevu talebiniz reddedildi', 'تم رفض طلب الموعد.'],
      ['randevu talebiniz iptal edildi', 'تم إلغاء طلب الموعد.'],
      ['randevunuz iptal edildi', 'تم إلغاء الموعد.'],
      ['randevu talebi oluşturulamadı', 'تعذر إنشاء طلب الموعد.'],
      ['adres değişiklik talebiniz admin tarafından onaylandı', 'تمت الموافقة على طلب تغيير العنوان.'],
      ['adres değişiklik talebiniz reddedildi', 'تم رفض طلب تغيير العنوان.'],
      ['ilanınız yayından kaldırıldı', 'تم إيقاف نشر إعلانك.'],
      ['ilanınız kalıcı olarak silindi', 'تم حذف إعلانك نهائياً.'],
      ['ilanınız tekrar yayına alındı', 'تمت إعادة نشر إعلانك.'],
      ['bu, bir sorundur', 'حدثت مشكلة. يرجى المحاولة مرة أخرى.'],
      ['bu, şu anda geçerli olan bir durumdur', 'تم تنفيذ هذه العملية مسبقاً.'],
    ];

    const matched = replacements.find(([needle]) => lower.includes(needle));
    return matched ? matched[1] : text;
  };

  const refreshNotifications = () => {
    loadNotifications();
  };

  const getNotificationChatData = (notification) => {
      const providerUid = String(
        notification.providerUid || notification.expertId || ''
      ).trim();

      const serviceId = String(
        notification.serviceId || notification.listingId || ''
      ).trim();

      const serviceTitle = String(
        notification.listingTitle || ''
      ).trim();

      const appointmentId = String(
        notification.appointmentId || ''
      ).trim();

    return {
      providerUid,
      serviceId,
      serviceTitle,
      appointmentId,
    };
  };

  const resetChatTermsModal = () => {
    setChatTermsModal({
      open: false,
      accepted: false,
      loading: false,
      notification: null,
    });
  };

  const closeChatTermsModal = () => {
    if (chatTermsModal.loading) return;

    resetChatTermsModal();

    if (!noticeModal.open && !showDetailModal && !showDeleteConfirm) {
      document.body.classList.remove('modal-open');
    }
  };

  const handleTalkToExpert = async (notification) => {
    try {
      const chatData = getNotificationChatData(notification);
      const { providerUid, serviceId } = chatData;

      if (!providerUid) {
        openNoticeModal({
          type: 'warning',
          title: 'تعذر بدء المحادثة',
          message: 'معلومات الخبير ناقصة في هذا الإشعار. يرجى المحاولة مرة أخرى.'
        });
        return;
      }

      if (!serviceId) {
        openNoticeModal({
          type: 'warning',
          title: 'تعذر بدء المحادثة',
          message: 'معلومات الخدمة ناقصة في هذا الإشعار. يرجى المحاولة مرة أخرى.'
        });
        return;
      }

      const acceptedBefore = hasAcceptedChatTerms({
        currentUid: auth.currentUser?.uid,
        providerUid,
        serviceId,
        appointmentId: 'direct',
      });

      if (acceptedBefore) {
        await continueToChatFromNotification(notification);
        return;
      }

      setChatTermsModal({
        open: true,
        accepted: false,
        loading: false,
        notification,
      });

      document.body.classList.add('modal-open');
    } catch (error) {
      openNoticeModal({
        type: 'warning',
        title: 'تعذر بدء المحادثة',
        message: error.message || 'تعذر فتح المحادثة مع الخبير.'
      });
    }
  };

  const continueToChatFromNotification = async (directNotification = null) => {
    const notification = directNotification || chatTermsModal.notification;
    if (!notification) return;

    try {
      setChatTermsModal((prev) => ({
        ...prev,
        loading: true,
      }));

      const chatData = getNotificationChatData(notification);
      const { providerUid, serviceId, serviceTitle } = chatData;

      const result = await getOrCreateConversation(
        providerUid,
        serviceId,
        serviceTitle
      );

      saveChatTermsAccepted({
        currentUid: auth.currentUser?.uid,
        providerUid,
        serviceId,
        appointmentId: 'direct',
      });

      markAsRead(notification.id);

      resetChatTermsModal();
      document.body.classList.remove('modal-open');

      navigate(`/mesajlar?conversation=${encodeURIComponent(result.conversationId)}&open=true`);
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Sohbet açma hatası:', error);
      }

      resetChatTermsModal();
      document.body.classList.remove('modal-open');

      openNoticeModal({
        type: 'warning',
        title: 'تعذر بدء المحادثة',
        message: error.message || 'تعذر فتح المحادثة مع الخبير.'
      });
    }
  };

  const getNoticeIcon = () => {
    if (noticeModal.type === 'success') return 'fa-check-circle';
    if (noticeModal.type === 'error') return 'fa-times-circle';
    if (noticeModal.type === 'info') return 'fa-info-circle';
    return 'fa-exclamation-triangle';
  };

  if (loading) {
    return (
      <PageTransition>
        <div className="notifications-page">
          <Navbar />
          <LoadingSpinner text="جاري تحميل الإشعارات..." />
        </div>
      </PageTransition>
    );
  }

  if (error) {
    return (
      <PageTransition>
        <div className="notifications-page">
          <Navbar />
          <div className="notifications-error">
            <i className="fas fa-exclamation-circle error-icon"></i>
            <h3>حدث خطأ</h3>
            <p>{error}</p>
            <button onClick={refreshNotifications} className="retry-btn">
              <i className="fas fa-sync-alt"></i>
              حاول مرة أخرى
            </button>
          </div>
        </div>
      </PageTransition>
    );
  }

  return (
    <PageTransition>
      <div className="notifications-page">
        <Navbar />
        
        <main className="notifications-container">
          <div className="notifications-header">
            <div className="notifications-title-section">
              <div className="title-with-icon">
                <i className="fas fa-bell"></i>
                <h1>الإشعارات</h1>
              </div>
              {unreadCount > 0 && (
                <span className="unread-badge">{unreadCount} غير مقروء</span>
              )}
            </div>

            <div className="notifications-actions">
              <div className="filter-buttons">
                <button 
                  className={`filter-btn ${filter === 'all' ? 'active' : ''}`}
                  onClick={() => setFilter('all')}
                >
                  الكل <span className="filter-count">{notifications.length}</span>
                </button>
                <button 
                  className={`filter-btn ${filter === 'unread' ? 'active' : ''}`}
                  onClick={() => setFilter('unread')}
                >
                  غير مقروء <span className="filter-count">{unreadCount}</span>
                </button>
                <button 
                  className={`filter-btn ${filter === 'read' ? 'active' : ''}`}
                  onClick={() => setFilter('read')}
                >
                  مقروء <span className="filter-count">{notifications.length - unreadCount}</span>
                </button>
              </div>

              <div className="action-buttons">
                {unreadCount > 0 && (
                  <button 
                    className="mark-all-read-btn"
                    onClick={markAllAsRead}
                    title="تحديد الكل كمقروء"
                  >
                    <i className="fas fa-check-double"></i>
                    <span className="btn-text">تحديد الكل كمقروء</span>
                  </button>
                )}
                
                <button 
                  className="refresh-btn"
                  onClick={refreshNotifications}
                  title="تحديث"
                >
                  <i className="fas fa-sync-alt"></i>
                </button>
              </div>
            </div>
          </div>

          <div className="notifications-list">
            {filteredNotifications.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">
                  <i className="fas fa-bell-slash"></i>
                </div>
                <h3>لا توجد إشعارات</h3>
                <p>لا توجد لديك إشعارات بعد.</p>
                {filter !== 'all' && (
                  <button 
                    className="clear-filter-btn"
                    onClick={() => setFilter('all')}
                  >
                    عرض جميع الإشعارات
                  </button>
                )}
                <Link to="/iletisim" className="contact-link">
                  <i className="fas fa-envelope"></i> تواصل معنا
                </Link>
              </div>
            ) : (
              filteredNotifications.map((notification, index) => (
                <div 
                  key={notification.id} 
                  className={`notification-card ${!notification.read ? 'unread' : ''}`} 
                  style={{ animationDelay: `${index * 0.05}s`, cursor: 'default' }}
                >
                  <div className="notification-status">
                    {!notification.read && <span className="status-dot"></span>}
                  </div>
                  
                  <div className="notification-icon-wrapper">
                    <div className="notification-icon">
                      <i
                        className={`fas ${
                          notification.type === 'reschedule_request' ? 'fa-business-time' : 
                          notification.type === 'appointment_cancelled_by_expert' ? 'fa-exclamation-triangle' : 
                          notification.type === 'appointment_auto_cancelled' ? 'fa-history' :
                          notification.type === 'appointment_min_lead_blocked' ? 'fa-history' :
                          notification.type === 'expert_approved' ? 'fa-check-circle' :
                          notification.type === 'expert_rejected' ? 'fa-times-circle' : 
                          notification.type === 'appointment_approved' ? 'fa-check-circle' : 
                          notification.type === 'appointment_rejected' ? 'fa-calendar-times' : 
                          notification.type === 'reschedule_rejected' ? 'fa-user-times' :
                          notification.type === 'reschedule_approved' ? 'fa-calendar-check' :
                          notification.type === 'address_change_approved' ? 'fa-check-circle' :
                          notification.type === 'address_change_rejected' ? 'fa-times-circle' :
                          notification.type === 'listing_hidden' ? 'fa-eye-slash' :
                          notification.type === 'listing_deleted' ? 'fa-trash-alt' :
                          notification.type === 'listing_restored' ? 'fa-undo-alt' :
                          'fa-reply'
                        }`}
                        style={{ 
                          color: (
                            notification.type === 'appointment_cancelled_by_expert' ||
                            notification.type === 'reschedule_rejected' ||
                            notification.type === 'address_change_rejected' ||
                            notification.type === 'appointment_auto_cancelled' ||
                            notification.type === 'appointment_min_lead_blocked' ||
                            notification.type === 'listing_deleted'
                          ) ? '#ef4444' : (
                            notification.type === 'reschedule_request' ||
                            notification.type === 'reschedule_approved'
                          ) ? '#6366f1' : (
                            notification.type === 'expert_approved' ||
                            notification.type === 'address_change_approved' ||
                            notification.type === 'listing_restored'
                          ) ? '#10b981' : (
                            notification.type === 'listing_hidden'
                          ) ? '#f59e0b' : 'inherit'
                        }}
                      ></i>
                    </div>
                  </div>
                  
                  <div className="notification-content">
                    <div className="notification-header">
                      <div className="notification-title">
                        <h3>{
                          notification.type === 'reschedule_request' ? `${notification.expertName || 'الخبير'} طلب تغيير الوقت 🕒` :
                          notification.type === 'appointment_cancelled_by_expert' ? 'تم إلغاء موعدك ⚠️' :
                          notification.type === 'expert_approved' ? 'تمت الموافقة على طلب الخبير 🎉' :
                          notification.type === 'expert_rejected' ? 'تم رفض طلب الخبير' :
                          notification.type === 'appointment_approved' ? 'تمت الموافقة على موعدك ✅' :
                          notification.type === 'appointment_rejected' ? 'تم رفض موعدك ❌' :
                          notification.type === 'reschedule_rejected' ? 'تم رفض طلب تغيير وقت الموعد من قبل العميل' :
                          notification.type === 'reschedule_approved' ? 'تم قبول طلب تغيير وقت الموعد من قبل العميل' :
                          notification.type === 'address_change_approved' ? 'تمت الموافقة على طلب تغيير العنوان ✅' :
                          notification.type === 'address_change_rejected' ? 'تم رفض طلب تغيير العنوان ❌' :
                          notification.type === 'listing_hidden' ? (notification.title || 'تم إخفاء إعلانك') :
                          notification.type === 'listing_deleted' ? (notification.title || 'تم حذف إعلانك نهائياً') :
                          notification.type === 'listing_restored' ? (notification.title || 'تمت إعادة نشر إعلانك') :
                          notification.type === 'appointment_auto_cancelled' ? notification.title :
                          notification.type === 'appointment_min_lead_blocked' ? notification.title :
                          (notification.title || 'إشعار')
                        }</h3>
                        {!notification.read && (
                          <span className="unread-badge-small">جديد</span>
                        )}
                      </div>
                      <span className="notification-time">
                        <i className="far fa-clock"></i>
                        {formatDate(notification.createdAt)}
                      </span>
                    </div>
                    
                    <p className="notification-preview">
                      {(!notification.type || notification.type === 'admin_reply') 
                        ? 'قام فريق الدعم بالرد على رسالتك. يمكنك قراءة التفاصيل من الزر أدناه.'
                        : DOMPurify.sanitize(normalizeNotificationText(notification.message))
                      }
                    </p>

                    {notification.type === 'appointment_approved' && notification.listingTitle && (
                      <div className="notification-preview-text">
                        <i className="fas fa-briefcase"></i>
                        <span>الخدمة: {notification.listingTitle}</span>
                      </div>
                    )}

                    <div className="notif-action-wrapper" style={{ display: 'flex', gap: '10px', marginTop: '12px', flexWrap: 'wrap' }}>
                      {notification.type === 'appointment_approved' && (
                        <>
                          <button 
                            className="notif-detail-btn"
                            style={{ marginTop: '10px', background: 'rgba(99, 102, 241, 0.1)', border: '1px solid #6366f1', color: '#6366f1', padding: '5px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' }}
                            onClick={(e) => {
                              e.stopPropagation();
                              openNoticeModal({
                                type: 'info',
                                title: 'نظام المواعيد غير مفعل',
                                message: 'تم تعطيل تفاصيل المواعيد في هذه النسخة. يمكنك التواصل مع الخبير مباشرة من زر المحادثة.'
                              });
                            }}
                          >
                            <i className="fas fa-external-link-alt"></i> عرض تفاصيل الموعد
                          </button>

                          <button
                            className="notif-detail-btn"
                            style={{ marginTop: '10px', background: 'rgba(16, 185, 129, 0.12)', border: '1px solid #10b981', color: '#10b981', padding: '5px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' }}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleTalkToExpert(notification);
                            }}
                          >
                            <i className="fas fa-comments"></i> تواصل مع الخبير
                          </button>
                        </>
                      )}

                      {notification.type === 'reschedule_approved' && (
                        <button 
                          className="notif-detail-btn"
                          style={{ marginTop: '10px', background: 'rgba(99, 102, 241, 0.1)', border: '1px solid #6366f1', color: '#6366f1', padding: '5px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '5px' }}
                          onClick={(e) => {
                            e.stopPropagation();
                            openNoticeModal({
                              type: 'info',
                              title: 'نظام المواعيد غير مفعل',
                              message: 'تم تعطيل تغيير مواعيد الزيارات في هذه النسخة.'
                            });
                          }}
                        >
                          <i className="fas fa-external-link-alt"></i> عرض تفاصيل الموعد
                        </button>
                      )}
                      
                      {notification.type === 'reschedule_request' && notification.link && (
                        <button 
                          className="notif-go-detail-btn"
                          style={{ background: '#6366f1', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: '10px', fontSize: '13px', fontWeight: 'bold', cursor: 'pointer', transition: '0.2s', display: 'flex', alignItems: 'center', gap: '8px', boxShadow: '0 4px 15px rgba(99, 102, 241, 0.3)' }}
                          onClick={() => {
                            markAsRead(notification.id);
                            navigate(notification.link);
                          }}
                        >
                          مراجعة الطلب واختيار وقت جديد <i className="fas fa-calendar-alt"></i>
                        </button>
                      )}

                      {(notification.type === 'listing_hidden' ||
                        notification.type === 'listing_restored' ||
                        notification.type === 'listing_deleted') && (
                        <button
                          type="button"
                          className="notif-detail-btn"
                          style={{
                            marginTop: '10px',
                            background: 'rgba(212, 175, 55, 0.12)',
                            border: '1px solid #d4af37',
                            color: '#d4af37',
                            padding: '5px 12px',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontSize: '12px',
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            markAsRead(notification.id);
                            navigate('/uzman/ilanlarim');
                          }}
                        >
                          <i className="fas fa-list-alt"></i> الذهاب إلى إعلاناتي
                        </button>
                      )}
                      {notification.type === 'appointment_cancelled_by_expert' && notification.link && (
                        <button 
                          className="notif-go-detail-btn"
                          style={{ background: '#3b82f6', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 'bold', cursor: 'pointer', transition: '0.2s', display: 'flex', alignItems: 'center', gap: '6px' }}
                          onClick={() => {
                            markAsRead(notification.id);
                            navigate(notification.link);
                          }}
                        >
                          عرض تفاصيل الموعد <i className="fas fa-external-link-alt"></i>
                        </button>
                      )}

                      {(!notification.type || notification.type === 'admin_reply') && (
                        <button 
                          className="notif-go-detail-btn"
                          style={{ background: '#fbbf24', color: '#111', border: 'none', padding: '8px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 'bold', cursor: 'pointer', transition: '0.2s', display: 'flex', alignItems: 'center', gap: '6px' }}
                          onClick={() => openModal(notification)}
                        >
                          قراءة الرسالة <i className="fas fa-envelope-open"></i>
                        </button>
                      )}
                    </div>
                  </div>

                  <button 
                    className="delete-notification-btn" 
                    onClick={(e) => confirmDelete(notification, e)}
                    title="حذف"
                  >
                    <i className="fas fa-trash-alt"></i>
                  </button>
                </div>
              ))
            )}
          </div>
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
          onConfirm={() => continueToChatFromNotification()}
        />

        {showDetailModal && selectedNotification && (
          <div className="modal-overlay" onClick={closeModal}>
            <div 
              className="notification-modal"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="modal-header">
                <div className="modal-header-left">
                  <div className="modal-icon">
                    <i className={`fas ${
                      selectedNotification.type === 'appointment_auto_cancelled' ? 'fa-history' : 
                      selectedNotification.type === 'appointment_min_lead_blocked' ? 'fa-history' :
                      selectedNotification.type === 'expert_rejected' ||
                      selectedNotification.type === 'address_change_rejected'
                        ? 'fa-times-circle'
                        : selectedNotification.type === 'appointment_approved' ||
                          selectedNotification.type === 'address_change_approved'
                          ? 'fa-check-circle'
                          : selectedNotification.type === 'appointment_rejected'
                            ? 'fa-calendar-times'
                            : 'fa-reply'
                    }`}></i>
                  </div>
                  <div className="modal-title">
                    <h2>{
                      selectedNotification.type === 'appointment_auto_cancelled' ? 'انتهت المهلة / إلغاء' :
                      selectedNotification.type === 'appointment_min_lead_blocked' ? 'تعذر إنشاء طلب الموعد' :
                      selectedNotification.type === 'expert_rejected' ? 'تم رفض الطلب'
                      : selectedNotification.type === 'appointment_approved' ? 'تمت الموافقة على الموعد'
                      : selectedNotification.type === 'appointment_rejected' ? 'تم رفض الموعد'
                      : selectedNotification.type === 'address_change_approved' ? 'تمت الموافقة على تغيير العنوان'
                      : selectedNotification.type === 'address_change_rejected' ? 'تم رفض تغيير العنوان'
                      : 'رد الإدارة'
                    }</h2>
                    <div className="modal-meta">
                      <span className="modal-date">
                        <i className="far fa-calendar-alt"></i>
                        {selectedNotification.createdAt?.toLocaleDateString(ARABIC_LATIN_LOCALE, {
                          day: 'numeric',
                          month: 'long',
                          year: 'numeric'
                        })}
                      </span>
                      <span className="modal-time">
                        <i className="far fa-clock"></i>
                        {selectedNotification.createdAt?.toLocaleTimeString(ARABIC_LATIN_LOCALE, {
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </span>
                    </div>
                  </div>
                </div>
                <button className="modal-close-btn" onClick={closeModal}>
                  <i className="fas fa-times"></i>
                </button>
              </div>

              <div className="modal-body">
                <div className="user-info-section">
                  <div className="info-card">
                    <div className="info-row">
                      <div className="info-label">
                        <i className="fas fa-envelope"></i>
                        <span>البريد الإلكتروني</span>
                      </div>
                      <div className="info-value">{selectedNotification.userEmail}</div>
                    </div>
                  </div>
                </div>

                <div className="messages-section">
                  {(
                    selectedNotification.type === 'expert_rejected' ||
                    selectedNotification.type === 'appointment_approved' ||
                    selectedNotification.type === 'appointment_rejected' ||
                    selectedNotification.type === 'address_change_approved' ||
                    selectedNotification.type === 'address_change_rejected'
                  ) ? (
                    <div className="message-card admin">
                      <div className="message-card-header">
                        <div className="message-sender">
                          <div className="sender-avatar admin">
                            <i className={`fas ${
                              selectedNotification.type === 'appointment_approved' ||
                              selectedNotification.type === 'address_change_approved'
                                ? 'fa-check-circle'
                                : 'fa-times-circle'
                            }`}></i>
                          </div>
                          <div className="sender-info">
                            <span className="sender-name">{
                              selectedNotification.type === 'appointment_approved' ? 'معلومات الموافقة'
                              : selectedNotification.type === 'address_change_approved' ? 'موافقة تغيير العنوان'
                              : selectedNotification.type === 'address_change_rejected' ? 'رفض تغيير العنوان'
                              : 'سبب الرفض'
                            }</span>
                            {(selectedNotification.rejectedAt || selectedNotification.createdAt) && (
                              <span className="sender-time">
                                {new Date(selectedNotification.rejectedAt || selectedNotification.createdAt).toLocaleString(ARABIC_LATIN_LOCALE)}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="message-card-body admin-message">
                        <p>{DOMPurify.sanitize(normalizeNotificationText(selectedNotification.message))}</p>

                        {selectedNotification.type === 'address_change_approved' && (
                          <button 
                            className="modal-action-btn"
                            style={{ 
                              marginTop: '15px',
                              background: '#10b981',
                              color: '#fff',
                              border: 'none', 
                              padding: '10px 20px',
                              borderRadius: '8px',
                              cursor: 'pointer',
                              width: '100%',
                              fontWeight: 'bold',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '8px'
                            }}
                            onClick={() => {
                              markAsRead(selectedNotification.id);
                              navigate('/profilim/uzman?tab=address');
                              closeModal();
                            }}
                          >
                            <i className="fas fa-map-marker-alt"></i> تحديث عنواني
                          </button>
                        )}

                        {(
                          selectedNotification.type === 'appointment_approved' ||
                          selectedNotification.type === 'appointment_rejected'
                        ) && (
                          <button 
                            className="modal-action-btn"
                            style={{ 
                              marginTop: '15px',
                              background: '#6366f1',
                              color: '#fff',
                              border: 'none', 
                              padding: '10px 20px',
                              borderRadius: '8px',
                              cursor: 'pointer',
                              width: '100%',
                              fontWeight: 'bold',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '8px'
                            }}
                            onClick={() => {
                              openNoticeModal({
                                type: 'info',
                                title: 'نظام المواعيد غير مفعل',
                                message: 'تم تعطيل تفاصيل المواعيد والتقويم في هذه النسخة. يمكن للعميل والخبير التواصل مباشرة عبر الرسائل.'
                              });
                            }}
                          >
                            <i className="fas fa-external-link-alt"></i> عرض الموعد في التقويم والذهاب إلى العنوان
                          </button>
                        )}

                        {selectedNotification.appointmentDate && (
                          <p style={{ marginTop: 8, fontSize: 13, opacity: 0.8 }}>
                            <i className="fas fa-calendar-alt"></i> {selectedNotification.appointmentDate}
                            {selectedNotification.appointmentTime && ` - الساعة: ${selectedNotification.appointmentTime}`}
                          </p>
                        )}
                      </div>
                    </div>
                  ) : (
                    <>
                      {selectedNotification.originalMessage && (
                        <div className="message-card original">
                          <div className="message-card-header">
                            <div className="message-sender">
                              <div className="sender-avatar user">
                                <i className="fas fa-user"></i>
                              </div>
                              <div className="sender-info">
                                <span className="sender-name">رسالتك</span>
                              </div>
                            </div>
                          </div>
                          <div className="message-card-body">
                            <p>{DOMPurify.sanitize(selectedNotification.originalMessage)}</p>
                          </div>
                        </div>
                      )}

                      <div className="message-card admin">
                        <div className="message-card-header">
                          <div className="message-sender">
                            <div className="sender-avatar admin">
                              <i className="fas fa-shield-alt"></i>
                            </div>
                            <div className="sender-info">
                              <span className="sender-name">رد الإدارة</span>
                            </div>
                          </div>
                        </div>
                        <div className="message-card-body admin-message">
                          <p>{DOMPurify.sanitize(normalizeNotificationText(selectedNotification.message))}</p>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>

              <div className="modal-footer">
                <div className="footer-left">
                  <button 
                    className="footer-btn danger"
                    onClick={() => {
                      closeModal();
                      confirmDelete(selectedNotification, new Event('click'));
                    }}
                  >
                    <i className="fas fa-trash-alt"></i>
                    حذف الإشعار
                  </button>
                </div>
                
                <div className="footer-right">
                  <Link 
                    to="/iletisim" 
                    className="footer-btn secondary"
                    onClick={closeModal}
                  >
                    <i className="fas fa-reply"></i>
                    إرسال رسالة جديدة
                  </Link>
                  <button 
                    className="footer-btn primary"
                    onClick={closeModal}
                  >
                    <i className="fas fa-check"></i>
                    إغلاق
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {showDeleteConfirm && notificationToDelete && (
          <div className="modal-overlay" onClick={cancelDelete}>
            <div 
              className="confirm-modal"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="confirm-modal-icon">
                <i className="fas fa-exclamation-triangle"></i>
              </div>
              <h3>حذف الإشعار</h3>
              <p>هل أنت متأكد أنك تريد حذف هذا الإشعار؟</p>
              <p className="confirm-modal-subtext">لا يمكن التراجع عن هذه العملية.</p>
              
              <div className="confirm-modal-actions">
                <button 
                  className="confirm-btn cancel"
                  onClick={cancelDelete}
                >
                  إلغاء
                </button>
                <button 
                  className="confirm-btn delete"
                  onClick={deleteNotification}
                >
                  <i className="fas fa-trash-alt"></i>
                  حذف
                </button>
              </div>
            </div>
          </div>
        )}

        {noticeModal.open && (
          <div className="modal-overlay" onClick={closeNoticeModal}>
            <div 
              className={`professional-notice-modal ${noticeModal.type}`}
              onClick={(e) => e.stopPropagation()}
            >
              <button className="notice-close-btn" onClick={closeNoticeModal}>
                <i className="fas fa-times"></i>
              </button>

              <div className="notice-modal-icon">
                <i className={`fas ${getNoticeIcon()}`}></i>
              </div>

              <div className="notice-modal-content">
                <h3>{noticeModal.title}</h3>
                <p>{noticeModal.message}</p>
              </div>

              <div className="notice-modal-actions">
                <button className="notice-primary-btn" onClick={closeNoticeModal}>
                  {noticeModal.primaryText}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </PageTransition>
  );
};

export default NotificationsPage;
