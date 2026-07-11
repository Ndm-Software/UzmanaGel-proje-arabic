import React, { useState, useEffect } from 'react';
import { db } from '../../firebase/firebaseClient';
import { 
  collection, 
  query, 
  orderBy, 
  onSnapshot,
  doc,
  updateDoc,
  deleteDoc,
  addDoc,
  serverTimestamp,
  where,
  getDocs
} from 'firebase/firestore';
import DOMPurify from 'dompurify';
import PageTransition from '../../components/PageTransition';
import LoadingSpinner from '../../components/LoadingSpinner';
import { useAdminOnly } from '../../hooks/useAuthGuard';
import '../../styles/admin/AdminMessages.css';

const isDevelopment = process.env.NODE_ENV === 'development';

const sanitizeText = (text, maxLength = 200) => {
  if (!text) return '-';
  const sanitized = DOMPurify.sanitize(String(text));
  return sanitized.length > maxLength ? sanitized.slice(0, maxLength) + '...' : sanitized;
};

const encodeForUrl = (str) => {
  if (!str) return '';
  return encodeURIComponent(String(str));
};

const getUserTypeBadge = (userType, userRole) => {
  if (userType === 'REGISTERED_USER') {
    if (userRole === 'ADMIN') {
      return {
        icon: '👑',
        label: 'مسؤول',
        className: 'admin-badge',
        bgColor: 'rgba(212, 175, 55, 0.15)',
        color: '#d4af37'
      };
    } else if (userRole === 'PROVIDER') {
      return {
        icon: '🔧',
        label: 'خبير',
        className: 'provider-badge',
        bgColor: 'rgba(59, 130, 246, 0.15)',
        color: '#3b82f6'
      };
    } else if (userRole === 'CLIENT') {
      return {
        icon: '👤',
        label: 'عميل',
        className: 'client-badge',
        bgColor: 'rgba(16, 185, 129, 0.15)',
        color: '#10b981'
      };
    }
  }
  
  return {
    icon: '👤',
    label: 'مسجل',
    className: 'unknown-badge',
    bgColor: 'rgba(100, 100, 100, 0.15)',
    color: '#64748b'
  };
};

const AdminMessages = () => {
  const { authorized, loading: authLoading } = useAdminOnly();
  
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedMessage, setSelectedMessage] = useState(null);
  const [replyText, setReplyText] = useState('');
  const [sendingReply, setSendingReply] = useState(false);
  const [activeTab, setActiveTab] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [showReplyModal, setShowReplyModal] = useState(false);
  
  const [sortOrder, setSortOrder] = useState('newest');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);
  
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [modalConfig, setModalConfig] = useState({
    title: '',
    message: '',
    confirmText: 'نعم',
    cancelText: 'إلغاء',
    onConfirm: null,
    type: 'warning'
  });
  
  const [showSuccessToast, setShowSuccessToast] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [showErrorToast, setShowErrorToast] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  
  const [stats, setStats] = useState({
    total: 0,
    replied: 0,
    pending: 0,
    registered: 0,
    clients: 0,
    providers: 0
  });

  useEffect(() => {
    if (!authorized) return;
    
    const q = query(
      collection(db, "contacts"),
      orderBy("createdAt", "desc")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const messagesData = [];
      let repliedCount = 0;
      let registeredCount = 0;
      let clientCount = 0;
      let providerCount = 0;

      snapshot.forEach((doc) => {
        const data = doc.data();
        const message = {
          id: doc.id,
          ...data,
          createdAt: data.createdAt?.toDate() || new Date(),
          userType: data.userType || 'REGISTERED_USER',
          userRole: data.userRole || null,
          source: data.source || 'registered'
        };
        
        messagesData.push(message);
        if (data.status === 'replied') repliedCount++;
        if (message.userType === 'REGISTERED_USER') registeredCount++;
        if (message.userRole === 'CLIENT') clientCount++;
        if (message.userRole === 'PROVIDER') providerCount++;
      });

      setMessages(messagesData);
      setStats({
        total: messagesData.length,
        replied: repliedCount,
        pending: messagesData.length - repliedCount,
        registered: registeredCount,
        clients: clientCount,
        providers: providerCount
      });
      setLoading(false);
    }, (error) => {
      if (isDevelopment) console.error("Mesajlar yüklenirken hata:", error.message);
      showErrorToastFunc("حدث خطأ أثناء تحميل الرسائل.");
      setLoading(false);
    });

    return () => unsubscribe();
  }, [authorized]);

  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab, searchTerm, sortOrder]);

  const showConfirmModalFunc = (title, message, onConfirm, confirmText = 'نعم', cancelText = 'إلغاء', type = 'warning') => {
    setModalConfig({
      title: sanitizeText(title, 100),
      message: sanitizeText(message, 500),
      confirmText,
      cancelText,
      onConfirm: () => {
        onConfirm();
        setShowConfirmModal(false);
      },
      type
    });
    setShowConfirmModal(true);
  };

  const showSuccessToastFunc = (message) => {
    setSuccessMessage(sanitizeText(message, 200));
    setShowSuccessToast(true);
    setTimeout(() => setShowSuccessToast(false), 3000);
  };

  const showErrorToastFunc = (message) => {
    setErrorMessage(sanitizeText(message, 200));
    setShowErrorToast(true);
    setTimeout(() => setShowErrorToast(false), 4000);
  };

  const handleDeleteMessage = async (messageId) => {
    if (!messageId || typeof messageId !== 'string' || messageId.length > 128) {
      showErrorToastFunc("معرف الرسالة غير صالح.");
      return;
    }

    showConfirmModalFunc(
      'حذف الرسالة',
      'هل أنت متأكد من رغبتك في حذف هذه الرسالة؟\n\nلا يمكن التراجع عن هذا الإجراء!\n\nملاحظة: سيتم حذف الردود المرتبطة بهذه الرسالة أيضاً.',
      async () => {
        try {
          await deleteDoc(doc(db, "contacts", messageId));
          
          const repliesQuery = query(
            collection(db, "contact_replies"), 
            where("messageId", "==", messageId)
          );
          const repliesSnapshot = await getDocs(repliesQuery);
          
          const replyDeletions = repliesSnapshot.docs.map(docSnap => 
            deleteDoc(doc(db, "contact_replies", docSnap.id))
          );
          await Promise.all(replyDeletions);
          
          if (selectedMessage?.id === messageId) {
            setSelectedMessage(null);
          }
          
          showSuccessToastFunc(`تم حذف الرسالة و ${replyDeletions.length} من الردود بنجاح!`);
        } catch (error) {
          if (isDevelopment) console.error("Hata:", error.message);
          showErrorToastFunc("حدث خطأ أثناء حذف الرسالة.");
        }
      },
      'نعم، احذف',
      'إلغاء',
      'danger'
    );
  };

  const validateEmail = (email) => {
    if (!email) return false;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(String(email).trim().slice(0, 254));
  };

  const handleSendReply = async () => {
    const cleanReply = replyText.trim();
    if (!cleanReply) {
      showErrorToastFunc("يرجى كتابة رد.");
      return;
    }
    if (cleanReply.length < 3) {
      showErrorToastFunc("يجب أن يتكون الرد من 3 أحرف على الأقل.");
      return;
    }
    if (cleanReply.length > 2000) {
      showErrorToastFunc("يمكن أن يكون الرد 2000 حرف كحد أقصى.");
      return;
    }

    if (!selectedMessage?.email) {
      showErrorToastFunc("معلومات رسالة غير صالحة.");
      return;
    }

    setSendingReply(true);
    try {
      const userEmail = selectedMessage.email;
      
      if (!validateEmail(userEmail)) {
        showErrorToastFunc("عنوان بريد إلكتروني غير صالح.");
        return;
      }
      
      const userEmailLowerCase = userEmail.toLowerCase().trim();
      const sanitizedReply = DOMPurify.sanitize(cleanReply.slice(0, 2000));
      const sanitizedName = DOMPurify.sanitize((selectedMessage.fullName || '').slice(0, 100));
      const sanitizedOriginal = DOMPurify.sanitize((selectedMessage.message || '').slice(0, 5000));
      const targetUserId = selectedMessage.userId || null;
      
      const replyData = {
        userId: targetUserId,
        userEmail: userEmailLowerCase,
        userEmailOriginal: userEmail,
        userName: sanitizedName,
        message: sanitizedReply,
        originalMessage: sanitizedOriginal,
        replyDate: serverTimestamp(),
        createdAt: serverTimestamp(),
        read: false,
        messageId: selectedMessage.id,
        status: 'sent'
      };
      
      await addDoc(collection(db, "contact_replies"), replyData);

      if (targetUserId) {
        const notificationData = {
          userId: targetUserId,
          type: 'admin_reply',
          title: 'تم الرد على طلب الدعم الخاص بك ✉️',
          message: sanitizedReply,
          originalMessage: sanitizedOriginal,
          userEmail: userEmailLowerCase,
          createdAt: serverTimestamp(),
          read: false,
          messageId: selectedMessage.id
        };
        await addDoc(collection(db, "notifications"), notificationData);
      }
      
      await updateDoc(doc(db, "contacts", selectedMessage.id), {
        status: "replied",
        repliedAt: serverTimestamp(),
        reply: sanitizedReply
      });

      setShowReplyModal(false);
      setSelectedMessage(null);
      setReplyText('');
      
      showSuccessToastFunc("تم إرسال الرد بنجاح!");
      
    } catch (error) {
      if (isDevelopment) console.error("Hata:", error.message);
      showErrorToastFunc("حدث خطأ أثناء إرسال الرد.");
    } finally {
      setSendingReply(false);
    }
  };

  const getFilteredAndSortedMessages = () => {
    let filtered = messages;

    if (activeTab === 'pending') {
      filtered = filtered.filter(msg => msg.status !== 'replied');
    } else if (activeTab === 'replied') {
      filtered = filtered.filter(msg => msg.status === 'replied');
    } else if (activeTab === 'registered') {
      filtered = filtered.filter(msg => msg.userType === 'REGISTERED_USER');
    } else if (activeTab === 'clients') {
      filtered = filtered.filter(msg => msg.userRole === 'CLIENT');
    } else if (activeTab === 'providers') {
      filtered = filtered.filter(msg => msg.userRole === 'PROVIDER');
    }

    if (searchTerm && searchTerm.trim()) {
      const term = searchTerm.toLowerCase().trim();
      filtered = filtered.filter(msg => 
        (msg.fullName && msg.fullName.toLowerCase().includes(term)) ||
        (msg.email && msg.email.toLowerCase().includes(term)) ||
        (msg.message && msg.message.toLowerCase().includes(term)) ||
        (msg.userRole && msg.userRole.toLowerCase().includes(term))
      );
    }

    filtered.sort((a, b) => {
      const dateA = a.createdAt ? new Date(a.createdAt) : new Date(0);
      const dateB = b.createdAt ? new Date(b.createdAt) : new Date(0);
      if (sortOrder === 'newest') {
        return dateB - dateA;
      } else {
        return dateA - dateB;
      }
    });

    return filtered;
  };

  const renderUserTypeLabel = (userType, userRole) => {
    const typeInfo = getUserTypeBadge(userType, userRole);
    return (
      <span 
        className="user-type-badge" 
        style={{ 
          background: typeInfo.bgColor, 
          color: typeInfo.color,
          border: `1px solid ${typeInfo.color}40`
        }}
      >
        {typeInfo.icon} {typeInfo.label}
      </span>
    );
  };

  if (authLoading) return <LoadingSpinner text="جاري التحقق من الصلاحيات..." />;
  
  if (!authorized) {
    return (
      <div className="no-messages-new">
        <div className="empty-icon-new">🔒</div>
        <h3>تم رفض الوصول</h3>
        <p>ليس لديك صلاحية للوصول إلى هذه الصفحة. يمكن للمسؤولين فقط الوصول.</p>
      </div>
    );
  }

  const filteredMessages = getFilteredAndSortedMessages();
  const totalPages = Math.ceil(filteredMessages.length / itemsPerPage);
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentMessages = filteredMessages.slice(indexOfFirstItem, indexOfLastItem);

  const goToPage = (pageNumber) => {
    setCurrentPage(pageNumber);
    setSelectedMessage(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSelectMessage = (message) => {
    setSelectedMessage(prev => prev?.id === message.id ? null : message);
  };

  const formatDate = (date) => {
    if (!date) return '-';
    try {
      const d = new Date(date);
      if (isNaN(d.getTime())) return '-';
      return d.toLocaleString('ar-SY', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return '-';
    }
  };

  const getStatusBadge = (status) => {
    switch(status) {
      case 'replied':
        return <span className="status-badge replied"> تم الرد</span>;
      default:
        return <span className="status-badge pending"> في انتظار الرد</span>;
    }
  };

  if (loading) return <LoadingSpinner text="جاري تحميل الرسائل..." />;

  return (
    <PageTransition>
      <div className="admin-messages-page">
        
        <div className="messages-container-new">
          
          <div className="stats-header">
            <div className={`stat-card-horizontal ${activeTab === 'all' ? 'active' : ''}`} onClick={() => { setActiveTab('all'); setCurrentPage(1); }}>
              <span className="stat-emoji">📬</span>
              <div className="stat-info">
                <span className="stat-number">{stats.total}</span>
                <span className="stat-label">الكل</span>
              </div>
            </div>
            
            <div className={`stat-card-horizontal ${activeTab === 'pending' ? 'active' : ''}`} onClick={() => { setActiveTab('pending'); setCurrentPage(1); }}>
              <span className="stat-emoji">⏳</span>
              <div className="stat-info">
                <span className="stat-number">{stats.pending}</span>
                <span className="stat-label">في انتظار الرد</span>
              </div>
            </div>
            
            <div className={`stat-card-horizontal ${activeTab === 'replied' ? 'active' : ''}`} onClick={() => { setActiveTab('replied'); setCurrentPage(1); }}>
              <span className="stat-emoji">✅</span>
              <div className="stat-info">
                <span className="stat-number">{stats.replied}</span>
                <span className="stat-label">تم الرد عليها</span>
              </div>
            </div>
            
            <div className={`stat-card-horizontal ${activeTab === 'clients' ? 'active' : ''}`} onClick={() => { setActiveTab('clients'); setCurrentPage(1); }}>
              <span className="stat-emoji">👥</span>
              <div className="stat-info">
                <span className="stat-number">{stats.clients || 0}</span>
                <span className="stat-label">عميل</span>
              </div>
            </div>
            
            <div className={`stat-card-horizontal ${activeTab === 'providers' ? 'active' : ''}`} onClick={() => { setActiveTab('providers'); setCurrentPage(1); }}>
              <span className="stat-emoji">🔧</span>
              <div className="stat-info">
                <span className="stat-number">{stats.providers || 0}</span>
                <span className="stat-label">خبير</span>
              </div>
            </div>
          </div>

          <div className="search-filter-container">
            <div className="search-wrapper-new">
              <span className="search-icon-new">🔍</span>
              <input
                type="text"
                placeholder="ابحث بالاسم، البريد الإلكتروني أو محتوى الرسالة..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value.slice(0, 100));
                  setCurrentPage(1);
                }}
                className="search-input-new"
                maxLength="100"
              />
              {searchTerm && (
                <button className="clear-search-new" onClick={() => setSearchTerm('')}>
                  ✕
                </button>
              )}
            </div>

            <div className="filter-group-messages">
              <span className="filter-label-messages">
                <i className="fas fa-sort-amount-down"></i> فرز:
              </span>
              <button 
                className={`filter-btn-messages ${sortOrder === 'newest' ? 'active' : ''}`}
                onClick={() => setSortOrder('newest')}
              >
                🕒 الأحدث
              </button>
              <button 
                className={`filter-btn-messages ${sortOrder === 'oldest' ? 'active' : ''}`}
                onClick={() => setSortOrder('oldest')}
              >
                📅 الأقدم
              </button>
            </div>
          </div>

          {currentMessages.length === 0 ? (
            <div className="no-messages-new">
              <div className="empty-icon-new">📭</div>
              <h3>لم يتم العثور على رسائل</h3>
              <p>{searchTerm ? 'لم يتم العثور على رسائل تطابق بحثك.' : 'لا توجد رسائل في هذه الفئة بعد.'}</p>
              {searchTerm && (
                <button className="clear-filter-btn-new" onClick={() => setSearchTerm('')}>
                  مسح البحث
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="messages-list-new">
                {currentMessages.map(message => (
                  <div 
                    key={message.id} 
                    className={`message-item-new ${message.status === 'replied' ? 'replied' : 'pending'} ${selectedMessage?.id === message.id ? 'selected' : ''}`}
                  >
                    <div className="message-summary" onClick={() => handleSelectMessage(message)}>
                      <div className="summary-left">
                        <div className="sender-avatar-new">
                          {sanitizeText(message.fullName?.charAt(0).toUpperCase() || '?', 1)}
                        </div>
                        <div className="summary-info">
                          <div className="summary-name">
                            <strong>{sanitizeText(message.fullName || 'بدون اسم', 50)}</strong>
                            {getStatusBadge(message.status)}
                            {renderUserTypeLabel(message.userType, message.userRole)}
                          </div>
                          <div className="summary-contact">
                            <span>📧 {sanitizeText(message.email, 100)}</span>
                            {message.phone && <span>📞 {sanitizeText(message.phone, 20)}</span>}
                            {message.userId && (
                              <span className="user-id-hint" title={`Kullanıcı ID: ${sanitizeText(message.userId, 50)}`}>
                                🆔 مستخدم مسجل
                              </span>
                            )}
                          </div>
                          <p className="summary-preview">
                            {sanitizeText(message.message, 100)}
                          </p>
                        </div>
                      </div>
                      <div className="summary-right">
                        <span className="message-date-new">{formatDate(message.createdAt)}</span>
                        <div className="expand-arrow">
                          {selectedMessage?.id === message.id ? '▲' : '▼'}
                        </div>
                      </div>
                    </div>

                    {selectedMessage?.id === message.id && (
                      <div className="message-detail-new">
                        <div className="detail-card-new">
                          <h4>📝 تفاصيل الرسالة</h4>
                          <p className="full-message-new">{sanitizeText(message.message, 2000)}</p>
                        </div>

                        {message.reply && (
                          <div className="detail-card-new reply-card-new">
                            <h4>✅ ردك</h4>
                            <p className="reply-message-new">{sanitizeText(message.reply, 2000)}</p>
                            <small>{message.repliedAt && formatDate(message.repliedAt)}</small>
                          </div>
                        )}

                        <div className="message-actions-new">
                          <button 
                            className="action-btn-new reply-btn-new"
                            onClick={() => setShowReplyModal(true)}
                          >
                            ✉️ رد
                          </button>
                          
                          <button 
                            className="action-btn-new delete-btn-new"
                            onClick={() => handleDeleteMessage(message.id)}
                          >
                            🗑️ حذف
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {totalPages > 1 && (
                <div className="pagination-new">
                  <button className="page-btn" onClick={() => goToPage(currentPage - 1)} disabled={currentPage === 1}>
                    ← السابق
                  </button>
                  
                  <div className="page-numbers">
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
                        <button key={pageNum} className={`page-num ${currentPage === pageNum ? 'active' : ''}`} onClick={() => goToPage(pageNum)}>
                          {pageNum}
                        </button>
                      );
                    })}
                  </div>
                  
                  <button className="page-btn" onClick={() => goToPage(currentPage + 1)} disabled={currentPage === totalPages}>
                    التالي →
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {showReplyModal && selectedMessage && (
          <div className="reply-modal-overlay-new" onClick={() => setShowReplyModal(false)}>
            <div className="reply-modal-new" onClick={(e) => e.stopPropagation()}>
              <div className="reply-modal-header">
                <h3>✉️ الرد على الرسالة</h3>
                <button className="close-modal-btn" onClick={() => setShowReplyModal(false)}>✕</button>
              </div>

              <div className="reply-modal-body">
                <div className="original-message-new">
                  <h4>📩 الرسالة الأصلية</h4>
                  <div className="original-meta-new">
                    <span><strong>المرسل:</strong> {sanitizeText(selectedMessage.fullName, 50)}</span>
                    <span><strong>البريد الإلكتروني:</strong> {sanitizeText(selectedMessage.email, 100)}</span>
                    <span><strong>التاريخ:</strong> {formatDate(selectedMessage.createdAt)}</span>
                  </div>
                  <div className="original-content-new">{sanitizeText(selectedMessage.message, 2000)}</div>
                </div>

                <div className="reply-form-new">
                  <h4>✍️ ردك</h4>
                  <textarea
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value.slice(0, 2000))}
                    placeholder="اكتب ردك هنا..."
                    rows="6"
                    maxLength="2000"
                    autoFocus
                  />
                  <div className="char-counter">{replyText.length}/2000</div>
                </div>
              </div>

              <div className="reply-modal-footer">
                <button className="cancel-reply-btn" onClick={() => setShowReplyModal(false)}>إلغاء</button>
                <button className="send-reply-btn" onClick={handleSendReply} disabled={sendingReply || !replyText.trim()}>
                  {sendingReply ? <>⏳ جاري الإرسال...</> : <>📤 إرسال الرد</>}
                </button>
              </div>
            </div>
          </div>
        )}

        {showConfirmModal && (
          <div className="modal-overlay-new-confirm" onClick={() => setShowConfirmModal(false)}>
            <div className={`confirm-modal-new ${modalConfig.type}`} onClick={(e) => e.stopPropagation()}>
              <div className="confirm-modal-icon-new">
                {modalConfig.type === 'danger' && <i className="fas fa-exclamation-triangle"></i>}
                {modalConfig.type === 'warning' && <i className="fas fa-exclamation-circle"></i>}
              </div>
              <h3>{sanitizeText(modalConfig.title, 100)}</h3>
              <p className="confirm-modal-message-new">{sanitizeText(modalConfig.message, 300)}</p>
              <div className="confirm-modal-actions-new">
                <button className="confirm-btn-new cancel" onClick={() => setShowConfirmModal(false)}>{modalConfig.cancelText}</button>
                <button className={`confirm-btn-new ${modalConfig.type === 'danger' ? 'delete' : 'confirm'}`} onClick={modalConfig.onConfirm}>
                  {modalConfig.confirmText}
                </button>
              </div>
            </div>
          </div>
        )}

        {showSuccessToast && (
          <div className="toast-modal-new success" onClick={() => setShowSuccessToast(false)}>
            <div className="toast-content-new">
              <div className="toast-icon-new"><i className="fas fa-check-circle"></i></div>
              <div className="toast-message-new">{sanitizeText(successMessage, 100)}</div>
              <button className="toast-close-new" onClick={() => setShowSuccessToast(false)}><i className="fas fa-times"></i></button>
            </div>
          </div>
        )}

        {showErrorToast && (
          <div className="toast-modal-new error" onClick={() => setShowErrorToast(false)}>
            <div className="toast-content-new">
              <div className="toast-icon-new"><i className="fas fa-times-circle"></i></div>
              <div className="toast-message-new">{sanitizeText(errorMessage, 100)}</div>
              <button className="toast-close-new" onClick={() => setShowErrorToast(false)}><i className="fas fa-times"></i></button>
            </div>
          </div>
        )}
      </div>
    </PageTransition>
  );
};

export default AdminMessages;