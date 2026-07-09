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
    primaryText: 'Tamam'
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
    title = 'Bilgilendirme',
    message = '',
    primaryText = 'Tamam'
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
      setError('Bildirimler yüklenirken bir hata oluştu');
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
        title: 'İşlem Tamamlanamadı',
        message: 'Bildirimler güncellenirken bir hata oluştu. Lütfen tekrar deneyin.'
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
        title: 'Silme İşlemi Başarısız',
        message: 'Bildirim silinirken bir hata oluştu. Lütfen tekrar deneyin.'
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

    if (diffMinutes < 1) return 'Şimdi';
    if (diffMinutes < 60) return `${diffMinutes} dakika önce`;
    if (diffHours < 24) return `${diffHours} saat önce`;
    if (diffDays === 1) return 'Dün';
    if (diffDays < 7) return `${diffDays} gün önce`;
    
    return date.toLocaleDateString('tr-TR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
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
      const { providerUid, serviceId, appointmentId } = chatData;

      if (!providerUid) {
        openNoticeModal({
          type: 'warning',
          title: 'Sohbet Başlatılamıyor',
          message: 'Bu bildirimde uzman bilgisi eksik. Lütfen yeni bir test yapın.'
        });
        return;
      }

      if (!serviceId) {
        openNoticeModal({
          type: 'warning',
          title: 'Sohbet Başlatılamıyor',
          message: 'Bu bildirimde hizmet bilgisi eksik. Lütfen yeni bir test yapın.'
        });
        return;
      }

      if (!appointmentId) {
        openNoticeModal({
          type: 'warning',
          title: 'Sohbet Başlatılamıyor',
          message: 'Bu bildirimde randevu bilgisi eksik. Lütfen randevular sayfasından sohbeti açmayı deneyin.'
        });
        return;
      }

      const acceptedBefore = hasAcceptedChatTerms({
        currentUid: auth.currentUser?.uid,
        providerUid,
        serviceId,
        appointmentId,
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
        title: 'Sohbet Başlatılamıyor',
        message: error.message || 'Uzmanla sohbet açılamadı.'
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
      const { providerUid, serviceId, serviceTitle, appointmentId } = chatData;

      const result = await getOrCreateConversation(
        providerUid,
        serviceId,
        serviceTitle,
        appointmentId
      );

      saveChatTermsAccepted({
        currentUid: auth.currentUser?.uid,
        providerUid,
        serviceId,
        appointmentId,
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
        title: 'Sohbet Başlatılamıyor',
        message: error.message || 'Uzmanla sohbet açılamadı.'
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
          <LoadingSpinner text="Bildirimler yükleniyor..." />
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
            <h3>Bir Hata Oluştu</h3>
            <p>{error}</p>
            <button onClick={refreshNotifications} className="retry-btn">
              <i className="fas fa-sync-alt"></i>
              Tekrar Dene
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
                <h1>Bildirimler</h1>
              </div>
              {unreadCount > 0 && (
                <span className="unread-badge">{unreadCount} okunmamış</span>
              )}
            </div>

            <div className="notifications-actions">
              <div className="filter-buttons">
                <button 
                  className={`filter-btn ${filter === 'all' ? 'active' : ''}`}
                  onClick={() => setFilter('all')}
                >
                  Tümü <span className="filter-count">{notifications.length}</span>
                </button>
                <button 
                  className={`filter-btn ${filter === 'unread' ? 'active' : ''}`}
                  onClick={() => setFilter('unread')}
                >
                  Okunmamış <span className="filter-count">{unreadCount}</span>
                </button>
                <button 
                  className={`filter-btn ${filter === 'read' ? 'active' : ''}`}
                  onClick={() => setFilter('read')}
                >
                  Okunmuş <span className="filter-count">{notifications.length - unreadCount}</span>
                </button>
              </div>

              <div className="action-buttons">
                {unreadCount > 0 && (
                  <button 
                    className="mark-all-read-btn"
                    onClick={markAllAsRead}
                    title="Tümünü okundu işaretle"
                  >
                    <i className="fas fa-check-double"></i>
                    <span className="btn-text">Tümünü Okundu İşaretle</span>
                  </button>
                )}
                
                <button 
                  className="refresh-btn"
                  onClick={refreshNotifications}
                  title="Yenile"
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
                <h3>Bildirim bulunmuyor</h3>
                <p>Henüz hiç bildiriminiz yok.</p>
                {filter !== 'all' && (
                  <button 
                    className="clear-filter-btn"
                    onClick={() => setFilter('all')}
                  >
                    Tüm bildirimleri göster
                  </button>
                )}
                <Link to="/iletisim" className="contact-link">
                  <i className="fas fa-envelope"></i> Bize Ulaşın
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
                          notification.type === 'reschedule_request' ? `${notification.expertName || 'Uzman'} Vakit Değişikliği İstedi 🕒` :
                          notification.type === 'appointment_cancelled_by_expert' ? 'Randevunuz İptal Edildi ⚠️' :
                          notification.type === 'expert_approved' ? 'Uzman Başvurunuz Onaylandı 🎉' :
                          notification.type === 'expert_rejected' ? 'Uzman Başvurunuz Reddedildi' :
                          notification.type === 'appointment_approved' ? 'Randevunuz Onaylandı ✅' :
                          notification.type === 'appointment_rejected' ? 'Randevunuz Reddedildi ❌' :
                          notification.type === 'reschedule_rejected' ? 'Randevu Tarihi Değişikliği Talebiniz Müşteri Tarafından Reddedildi' :
                          notification.type === 'reschedule_approved' ? 'Randevu Tarihi Değişikliği Talebiniz Müşteri Tarafından Kabul Edildi' :
                          notification.type === 'address_change_approved' ? 'Adres Değişiklik Talebiniz Onaylandı ✅' :
                          notification.type === 'address_change_rejected' ? 'Adres Değişiklik Talebiniz Reddedildi ❌' :
                          notification.type === 'listing_hidden' ? (notification.title || 'İlanınız yayından kaldırıldı') :
                          notification.type === 'listing_deleted' ? (notification.title || 'İlanınız kalıcı olarak silindi') :
                          notification.type === 'listing_restored' ? (notification.title || 'İlanınız tekrar yayına alındı') :
                          notification.type === 'appointment_auto_cancelled' ? notification.title :
                          notification.type === 'appointment_min_lead_blocked' ? notification.title :
                          (notification.title || 'Bildirim')
                        }</h3>
                        {!notification.read && (
                          <span className="unread-badge-small">Yeni</span>
                        )}
                      </div>
                      <span className="notification-time">
                        <i className="far fa-clock"></i>
                        {formatDate(notification.createdAt)}
                      </span>
                    </div>
                    
                    <p className="notification-preview">
                      {(!notification.type || notification.type === 'admin_reply') 
                        ? 'Destek ekibimiz mesajınızı yanıtladı. Detayları okumak için aşağıdaki butona tıklayabilirsiniz.'
                        : DOMPurify.sanitize(notification.message)
                      }
                    </p>

                    {notification.type === 'appointment_approved' && notification.listingTitle && (
                      <div className="notification-preview-text">
                        <i className="fas fa-briefcase"></i>
                        <span>Hizmet: {notification.listingTitle}</span>
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
                              navigate('/customer-appointments?tab=approved');
                            }}
                          >
                            <i className="fas fa-external-link-alt"></i> Randevu Detayına Git
                          </button>

                          <button
                            className="notif-detail-btn"
                            style={{ marginTop: '10px', background: 'rgba(16, 185, 129, 0.12)', border: '1px solid #10b981', color: '#10b981', padding: '5px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' }}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleTalkToExpert(notification);
                            }}
                          >
                            <i className="fas fa-comments"></i> Uzmana Konuş
                          </button>
                        </>
                      )}

                      {notification.type === 'reschedule_approved' && (
                        <button 
                          className="notif-detail-btn"
                          style={{ marginTop: '10px', background: 'rgba(99, 102, 241, 0.1)', border: '1px solid #6366f1', color: '#6366f1', padding: '5px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '5px' }}
                          onClick={(e) => {
                            e.stopPropagation();
                            
                            if (!notification.appointmentId) {
                              openNoticeModal({
                                type: 'warning',
                                title: 'Randevu Bilgisi Eksik',
                                message: "Bu bildirimin içinde randevu ID'si yok. Lütfen yeni bir test yapın."
                              });
                              return;
                            }

                            const targetUrl = `/randevu-takvimi?autoOpenId=${notification.appointmentId}&autoOpenDate=${notification.appointmentDate}`;
                            navigate(targetUrl);
                          }}
                        >
                          <i className="fas fa-external-link-alt"></i> Randevu Detayına Git
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
                          Talebi İncele ve Yeni Vakit Seç <i className="fas fa-calendar-alt"></i>
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
                          <i className="fas fa-list-alt"></i> İlanlarıma Git
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
                          Randevu Detayına Git <i className="fas fa-external-link-alt"></i>
                        </button>
                      )}

                      {(!notification.type || notification.type === 'admin_reply') && (
                        <button 
                          className="notif-go-detail-btn"
                          style={{ background: '#fbbf24', color: '#111', border: 'none', padding: '8px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 'bold', cursor: 'pointer', transition: '0.2s', display: 'flex', alignItems: 'center', gap: '6px' }}
                          onClick={() => openModal(notification)}
                        >
                          Mesajı Oku <i className="fas fa-envelope-open"></i>
                        </button>
                      )}
                    </div>
                  </div>

                  <button 
                    className="delete-notification-btn" 
                    onClick={(e) => confirmDelete(notification, e)}
                    title="Sil"
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
                      selectedNotification.type === 'appointment_auto_cancelled' ? 'Zaman Aşımı / İptal' : 
                      selectedNotification.type === 'appointment_min_lead_blocked' ? 'Randevu Talebi Oluşturulamadı' :
                      selectedNotification.type === 'expert_rejected' ? 'Başvuru Reddedildi'
                      : selectedNotification.type === 'appointment_approved' ? 'Randevu Onaylandı'
                      : selectedNotification.type === 'appointment_rejected' ? 'Randevu Reddedildi'
                      : selectedNotification.type === 'address_change_approved' ? 'Adres Değişikliği Onaylandı'
                      : selectedNotification.type === 'address_change_rejected' ? 'Adres Değişikliği Reddedildi'
                      : 'Admin Yanıtı'
                    }</h2>
                    <div className="modal-meta">
                      <span className="modal-date">
                        <i className="far fa-calendar-alt"></i>
                        {selectedNotification.createdAt?.toLocaleDateString('tr-TR', {
                          day: 'numeric',
                          month: 'long',
                          year: 'numeric'
                        })}
                      </span>
                      <span className="modal-time">
                        <i className="far fa-clock"></i>
                        {selectedNotification.createdAt?.toLocaleTimeString('tr-TR', {
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
                        <span>E-posta</span>
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
                              selectedNotification.type === 'appointment_approved' ? 'Onay Bilgisi'
                              : selectedNotification.type === 'address_change_approved' ? 'Adres Değişiklik Onayı'
                              : selectedNotification.type === 'address_change_rejected' ? 'Adres Değişiklik Reddi'
                              : 'Red Nedeni'
                            }</span>
                            {(selectedNotification.rejectedAt || selectedNotification.createdAt) && (
                              <span className="sender-time">
                                {new Date(selectedNotification.rejectedAt || selectedNotification.createdAt).toLocaleString('tr-TR')}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="message-card-body admin-message">
                        <p>{DOMPurify.sanitize(selectedNotification.message)}</p>

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
                            <i className="fas fa-map-marker-alt"></i> Adresimi Güncelle
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
                              const targetData = { 
                                autoOpenId: selectedNotification.appointmentId, 
                                autoOpenDate: selectedNotification.appointmentDate 
                              };

                              if (!targetData.autoOpenId) {
                                openNoticeModal({
                                  type: 'warning',
                                  title: 'Randevu Bilgisi Eksik',
                                  message: "Bu bildirimin içinde randevu ID'si yok. Eski bir bildirim olabilir."
                                });
                                return;
                              }

                              navigate('/randevu-takvimi', { state: targetData });
                            }}
                          >
                            <i className="fas fa-external-link-alt"></i> Randevuyu Takvimde Göster ve Adrese Git
                          </button>
                        )}

                        {selectedNotification.appointmentDate && (
                          <p style={{ marginTop: 8, fontSize: 13, opacity: 0.8 }}>
                            <i className="fas fa-calendar-alt"></i> {selectedNotification.appointmentDate}
                            {selectedNotification.appointmentTime && ` - Saat: ${selectedNotification.appointmentTime}`}
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
                                <span className="sender-name">Sizin Mesajınız</span>
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
                              <span className="sender-name">Admin Yanıtı</span>
                            </div>
                          </div>
                        </div>
                        <div className="message-card-body admin-message">
                          <p>{DOMPurify.sanitize(selectedNotification.message)}</p>
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
                    Bildirimi Sil
                  </button>
                </div>
                
                <div className="footer-right">
                  <Link 
                    to="/iletisim" 
                    className="footer-btn secondary"
                    onClick={closeModal}
                  >
                    <i className="fas fa-reply"></i>
                    Yeni Mesaj Gönder
                  </Link>
                  <button 
                    className="footer-btn primary"
                    onClick={closeModal}
                  >
                    <i className="fas fa-check"></i>
                    Kapat
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
              <h3>Bildirimi Sil</h3>
              <p>Bu bildirimi silmek istediğinize emin misiniz?</p>
              <p className="confirm-modal-subtext">Bu işlem geri alınamaz.</p>
              
              <div className="confirm-modal-actions">
                <button 
                  className="confirm-btn cancel"
                  onClick={cancelDelete}
                >
                  İptal
                </button>
                <button 
                  className="confirm-btn delete"
                  onClick={deleteNotification}
                >
                  <i className="fas fa-trash-alt"></i>
                  Sil
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