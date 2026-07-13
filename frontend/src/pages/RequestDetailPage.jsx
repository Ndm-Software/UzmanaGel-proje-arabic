// RequestDetailPage.jsx file code 
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { doc, getDoc, onSnapshot, updateDoc, collection, query, where, addDoc } from 'firebase/firestore';
import { db, auth } from '../firebase/firebaseClient';
import DOMPurify from 'dompurify';
import '../styles/RequestDetailPage.css';
import { WalletService } from '../services/WalletService';
import TokenModal from '../components/TokenModal';
import { fetchListingById } from '../services/listingsApi';
import { showAppToast } from '../utils/showAppToast';

const isDevelopment = process.env.NODE_ENV === 'development';

const sanitizeText = (text) => {
  if (!text) return '';
  return DOMPurify.sanitize(String(text));
};

const quickRejectionReasons = [
  { id: 1, text: "📍 Çok uzak konum", icon: "📍", description: "Konum hizmet alanımın dışında" },
  { id: 5, text: "📋 Hizmet dışı", icon: "📋", description: "Bu hizmeti vermiyorum" },
  { id: 6, text: "⚡ Yoğunluk", icon: "⚡", description: "Şu anda yoğunluktan dolayı kabul edemiyorum" },
  { id: 8, text: "📏 Çok uzak mesafe", icon: "📏", description: "Mesafe çok uzak, ulaşım mümkün değil" }
];

const RequestDetailPage = () => {
  const { date, id } = useParams();
  const navigate = useNavigate();

  const [allData, setAllData] = useState({});
  const [providerWorkingHours, setProviderWorkingHours] = useState(null);
  const [showDecisionModal, setShowDecisionModal] = useState(false);
  const [showRejectArea, setShowRejectArea] = useState(false);
  const [rejectNote, setRejectNote] = useState('');
  const [showDurationInput, setShowDurationInput] = useState(false);
  const [duration, setDuration] = useState('');
  const [showQuickReasons, setShowQuickReasons] = useState(false);
  const [selectedQuickReason, setSelectedQuickReason] = useState(null);
  const [comparisonAppo, setComparisonAppo] = useState(null);

  const [showNoTokenModal, setShowNoTokenModal] = useState(false);
  const [isTokenPanelOpen, setIsTokenPanelOpen] = useState(false);
  
  const dailyAppointments = Array.isArray(allData) ? allData : [];
  const targetRequest = dailyAppointments.find(app => app.id === id);

  useEffect(() => {
    const unsubscribeAuth = auth.onAuthStateChanged((user) => {
      if (user) {
        const fetchHours = async () => {
          const docRef = doc(db, 'service_providers', user.uid);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) setProviderWorkingHours(docSnap.data().workingHours);
        };
        fetchHours();

        const q = query(
          collection(db, 'appointments'),
          where('expertId', '==', user.uid),
          where('date', '==', date)
        );
        onSnapshot(q, (snapshot) => {
          const extracted = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
          setAllData(extracted);
        });
      }
    });
    return () => unsubscribeAuth();
  }, [date]);

  if (!targetRequest) {
    return (
      <div className="profile-page">
        <Navbar />
        <main className="profile-main">
          <p className="rd-loading-text">Talep yükleniyor veya bulunamadı...</p>
        </main>
      </div>
    );
  }

  const getPassedTime = () => {
    if (!targetRequest?.createdTime) return "Hesaplanıyor...";
    const diff = Date.now() - targetRequest.createdTime; 
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
    const mins = Math.floor((diff / 1000 / 60) % 60);
    
    let timeString = "";
    if (days > 0) timeString += `${days} Gün `;
    if (hours > 0) timeString += `${hours} Saat `;
    timeString += `${mins > 0 ? mins : 1} Dakika`;
    
    return timeString;
  };

  const currentDayEn = new Date(date).toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
  const todaySchedule = providerWorkingHours ? providerWorkingHours[currentDayEn] : null;

  let startH = 9;
  let endH = 18;

  if (providerWorkingHours && todaySchedule && todaySchedule.enabled) {
    startH = parseInt(todaySchedule.start.split(':')[0]);
    endH = parseInt(todaySchedule.end.split(':')[0]);
  }

  const generateDisplayBlocks = () => {
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

    const relevantApps = dailyAppointments.filter(app =>
      app.status === 'approved' || app.createdBy === 'expert' || app.id?.toString() === id
    );
    const sortedApps = [...relevantApps].sort((a, b) => getMins(a.start) - getMins(b.start));

    sortedApps.forEach(app => {
      const appStartMin = getMins(app.start);
      const appEndMin = getMins(app.end);
      if (appStartMin > currentMin) {
        let temp = currentMin;
        while (temp < appStartMin) {
          let nextHour = Math.floor(temp / 60) * 60 + 60;
          let blockEnd = Math.min(nextHour, appStartMin);
          if (blockEnd - temp >= 30) blocks.push({ type: 'free', startStr: formatTime(temp), endStr: formatTime(blockEnd) });
          temp = blockEnd;
        }
      }
      blocks.push({ type: 'appointment', startStr: formatTime(appStartMin), endStr: formatTime(appEndMin), data: app });
      currentMin = Math.max(currentMin, appEndMin);
    });

    if (currentMin < endDayMin) {
      let temp = currentMin;
      while (temp < endDayMin) {
        let nextHour = Math.floor(temp / 60) * 60 + 60;
        let blockEnd = Math.min(nextHour, endDayMin);
        if (blockEnd - temp >= 30) blocks.push({ type: 'free', startStr: formatTime(temp), endStr: formatTime(blockEnd) });
        temp = blockEnd;
      }
    }
    return blocks;
  };

  const displayBlocks = generateDisplayBlocks();

  const handleQuickReasonSelect = (reason) => {
    setSelectedQuickReason(reason);
    setRejectNote(reason.description);
    setShowQuickReasons(false);
  };

  const handleReject = async () => {
    try {
      const docRef = doc(db, 'appointments', id); 
      await updateDoc(docRef, {
        status: 'rejected',
        expertRejectNote: sanitizeText(rejectNote),
        rejectedAt: Date.now() 
      });

      if (targetRequest.clientId) {
        await addDoc(collection(db, 'notifications'), {
          userId: targetRequest.clientId,
          type: 'appointment_rejected',
          title: 'Randevu Talebiniz Reddedildi',
          message: sanitizeText(rejectNote) || 'Uzman tarafından reddedildi.',
          expertName: sanitizeText(targetRequest.expertName || 'Uzman'),
          appointmentDate: targetRequest.date || date,
          appointmentTime: targetRequest.start || '',
          read: false,
          createdAt: new Date().toISOString(),
        });
      }

      navigate('/customer-requests');
    } catch { 
      showAppToast('Hata oluştu.', 'error'); 
    }
  };

  const finalizeApproval = async () => {
    if (!duration || duration <= 0) { 
      showAppToast('Lütfen geçerli bir süre girin.', 'error'); 
      return; 
    }
    if (parseInt(duration) < 5) { 
      showAppToast('Randevu süresi en az 5 dakika olmalıdır.', 'error'); 
      return; 
    }

    try {
      const walletData = await WalletService.getProviderWalletData(auth.currentUser.uid);
      if (walletData.tokenBalance < 1) {
        setShowNoTokenModal(true); 
        return;
      }

      const [sH, sM] = targetRequest.start.split(':').map(Number);
      const startTotalMins = sH * 60 + sM;
      const endTotalMins = startTotalMins + parseInt(duration);

      const isOverlapping = dailyAppointments.some(app => {
        if (app.id?.toString() === id) return false;
        if (app.status !== 'approved' && app.createdBy !== 'expert') return false;
        const otherStart = typeof app.start === 'string'
          ? parseInt(app.start.split(':')[0]) * 60 + parseInt(app.start.split(':')[1])
          : app.start * 60;
        const otherEnd = typeof app.end === 'string'
          ? parseInt(app.end.split(':')[0]) * 60 + parseInt(app.end.split(':')[1])
          : app.end * 60;
        return startTotalMins < otherEnd && endTotalMins > otherStart;
      });

      if (isOverlapping) { 
        showAppToast('Belirlediğiniz süre takvimdeki başka bir randevu ile çakışıyor!', 'error'); 
        return; 
      }

      const dateObj = new Date(date);
      const dayEn = dateObj.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
      const todayLimit = providerWorkingHours ? providerWorkingHours[dayEn] : null;

      if (todayLimit && todayLimit.enabled) {
        const [lH, lM] = todayLimit.end.split(':').map(Number);
        if (endTotalMins > lH * 60 + lM) {
          showAppToast(`Bu işlem mesai saatinizi (${todayLimit.end}) aşıyor! Lütfen süreyi kısaltın.`, 'error');
          return;
        }
      }

      const eH = Math.floor(endTotalMins / 60);
      const eM = endTotalMins % 60;
      const endStr = `${String(eH).padStart(2, '0')}:${String(eM).padStart(2, '0')}`;

      const docRef = doc(db, 'appointments', id);
      
      await updateDoc(docRef, {
        status: 'approved',
        approvedTime: Date.now(), 
        end: endStr,
        endHour: eH
      });

      await WalletService.processTokenAction(
        auth.currentUser.uid, 
        -1,
        'SPEND', 
        { 
          description: `${sanitizeText(targetRequest.client)} isimli müşterinin randevusunu kabul etmek için 1 jeton harcandı.`,
          relatedId: id,
          targetCustomerId: targetRequest.clientId || targetRequest.userId || null
        }
      );

      if (targetRequest.clientId) {
        let listingTitle = targetRequest.listingTitle || '';

        try {
          if (!listingTitle && targetRequest.listingId) {
            const listingData = await fetchListingById(targetRequest.listingId);
            listingTitle = listingData?.title || '';
          }
        } catch (err) {
          console.error('İlan bilgisi çekilemedi:', err);
        }

        const serviceText = listingTitle
          ? `Hizmet: "${listingTitle}". `
          : '';

        await addDoc(collection(db, 'notifications'), {
          userId: targetRequest.clientId,
          type: 'appointment_approved',
          title: 'Randevu Talebiniz Onaylandı',
          message: `${targetRequest.expertName || 'Uzman'} tarafından randevunuz onaylandı. ${serviceText}Tarih: ${targetRequest.date || date}, Saat: ${targetRequest.start}, Tahmini Bitiş: ${endStr}.`,
          expertName: targetRequest.expertName || 'Uzman',

          listingId: targetRequest.listingId || null,
          listingTitle: listingTitle || '',

          providerUid: targetRequest.expertId || null,
          serviceId: targetRequest.listingId || null,

          appointmentId: id,
          appointmentDate: targetRequest.date || date,
          appointmentTime: targetRequest.start || '',
          endTime: endStr,
          read: false,
          createdAt: new Date().toISOString(),
        });
      }

      setShowDecisionModal(true);

    } catch (error) { 
      if (isDevelopment) console.error('Onaylama işlemi sırasında bir hata oluştu:', error.message); 
      showAppToast('İşlem tamamlanamadı, lütfen tekrar deneyin.', 'error');
    }
  };

  return (
    <div className="profile-page">
      <Navbar />

      <main className="profile-main rd-main">

        <div className="rd-topbar">
          <button className="settings-primary-button rd-back-btn" onClick={() => navigate('/customer-requests')}>
            <i className="fas fa-arrow-left"></i> Onay Bekleyenlere Geri Dön
          </button>
          <h2 className="rd-date-title">
            {date ? new Date(date).toLocaleDateString('tr-TR', { 
              day: 'numeric', 
              month: 'long', 
              year: 'numeric', 
              weekday: 'long' 
            }) : 'Yükleniyor...'}
          </h2>
          <div className="rd-topbar-spacer"></div>
        </div>

        <section className="profile-card-section rd-calendar-section">
          <div className="rd-calendar-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '15px' }}>
            <div>
              <h4 className="rd-calendar-title">
                <i className="fas fa-calendar-alt"></i>
                Günün Randevu Takvimi Rehberi
              </h4>
              <span className="rd-legend-badge">
                <i className="fas fa-circle rd-blink-icon"></i>
                Mor Yanıp Sönen Alan: Müşterinin Talebi
              </span>
            </div>

            <button 
              onClick={() => navigate(`/request-detail/${date}/${id}/forecast`)}
              style={{ background: 'linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)', color: 'white', padding: '10px 20px', borderRadius: '8px', border: 'none', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', boxShadow: '0 4px 15px rgba(139, 92, 246, 0.4)', transition: 'all 0.3s ease' }}
            >
              <i className="fas fa-magic"></i> Akıllı Rota ve Öngörü Raporu
            </button>
          </div>

          <div className="hours-grid">
            {startH > 0 && (
              <div className="hour-card non-working rd-hour-card">
                <div className="rd-hour-time">{`00:00 - ${startH < 10 ? `0${startH}` : startH}:00`}</div>
                <div className="rd-hour-closed">Mesai Dışı</div>
              </div>
            )}

            {displayBlocks.map((block, index) => {
              const isApp = block.type === 'appointment';
              const isTarget = isApp && block.data.id?.toString() === id;

              return (
                <div
                  key={index}
                  onClick={() => {
                    if (isApp && !isTarget) {
                      setComparisonAppo(block.data);
                    }
                  }}
                  className={`hour-card rd-hour-card ${isTarget ? 'rd-target-block pulse-preview' : isApp ? 'has-appo' : ''}`}
                  style={{ cursor: isApp && !isTarget ? 'pointer' : 'default' }}
                >
                  <div className="rd-block-time">
                    {isTarget
                      ? `${block.startStr} - (Bitiş Saatini Uzman Belirler)`
                      : `${block.startStr} - ${block.endStr}`}
                  </div>
                  <div className={`rd-block-label ${isTarget ? 'rd-block-label--target' : isApp ? 'rd-block-label--appo' : 'rd-block-label--free'}`}>
                    {isTarget ? (
                      <span className="rd-target-label"><i className="fas fa-star"></i> MÜŞTERİ TALEBİ</span>
                    ) : isApp ? sanitizeText(block.data.client) : 'Müsait'}
                  </div>
                </div>
              );
            })}

            {endH < 24 && (
              <div className="hour-card non-working rd-hour-card">
                <div className="rd-hour-time">{`${endH}:00 - 00:00`}</div>
                <div className="rd-hour-closed">Mesai Dışı</div>
              </div>
            )}
          </div>
        </section>

        <section className="profile-card-section rd-detail-section">
          <div className="rd-detail-grid">

            <div className="rd-info-col">
              
              <div className="rd-left-main-title-box">
                <h3 className="rd-left-main-title">ONAY BEKLEYEN MÜŞTERİ BİLGİLERİ</h3>
              </div>

              <div className="rd-info-field">
                <label className="rd-field-label">MÜŞTERİ ADI SOYADI</label>
                <div className="rd-field-value rd-field-value--large">{sanitizeText(targetRequest.client)}</div>
              </div>

              <div className="rd-info-row">
                <div className="rd-info-field">
                  <label className="rd-field-label">TELEFON</label>
                  <div className="rd-field-value">
                    <i className="fas fa-phone"></i> {sanitizeText(targetRequest.phone || 'Girilmedi')}
                  </div>
                </div>
                <div className="rd-info-field">
                  <label className="rd-field-label">E-POSTA</label>
                  <div className="rd-field-value">
                    <i className="fas fa-envelope"></i> {sanitizeText(targetRequest.email || 'Girilmedi')}
                  </div>
                </div>
              </div>

              <div className="rd-info-row">
                <div className="rd-info-field">
                  <label className="rd-field-label">TALEP EDİLEN TARİH</label>
                  <div className="rd-field-value">
                    <i className="fas fa-calendar-alt"></i> {sanitizeText(targetRequest.appointmentDate || date)}
                  </div>
                </div>
                <div className="rd-info-field">
                  <label className="rd-field-label">TALEP EDİLEN SAAT</label>
                  <div className="rd-field-value">
                    <i className="fas fa-clock"></i> {sanitizeText(targetRequest.start)}
                  </div>
                </div>
              </div>

              <div className="rd-info-field">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label className="rd-field-label">MÜŞTERİ LOKASYONU</label>
                  {targetRequest && (targetRequest.lat || targetRequest.address) && (
                    <a 
                      href={
                        targetRequest.lat && targetRequest.lng 
                        ? `https://www.google.com/maps/search/?api=1&query=${targetRequest.lat},${targetRequest.lng}`
                        : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(targetRequest.fullAddress || targetRequest.address)}`
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rd-mini-map-btn"
                      title="Haritada Aç"
                    >
                      <i className="fas fa-map-marked-alt"></i> Haritada Gör
                    </a>
                  )}
                </div>
                <div className="rd-field-value">
                  <i className="fas fa-map-marker-alt"></i> {sanitizeText(targetRequest.fullAddress || targetRequest.address || 'Adres belirtilmedi')}
                </div>
              </div>

              <div className="rd-info-field">
                <label className="rd-field-label">MÜŞTERİ MESAJI</label>
                <div className="rd-note-box">"{sanitizeText(targetRequest.note || 'Mesaj bırakılmadı.')}"</div>
              </div>
            </div>

        <div className="rd-action-col">
          {comparisonAppo ? (
            <div className="rd-info-col">
              
              <div className="rd-left-main-title-box">
                <h3 className="rd-left-main-title">ONAYLI MÜŞTERİ BİLGİLERİ</h3>
              </div>

              <div className="rd-info-field">
                <label className="rd-field-label">MÜŞTERİ ADI SOYADI</label>
                <div className="rd-field-value rd-field-value--large">{sanitizeText(comparisonAppo.client)}</div>
              </div>

              <div className="rd-info-row">
                <div className="rd-info-field">
                  <label className="rd-field-label">TELEFON</label>
                  <div className="rd-field-value">
                    <i className="fas fa-phone"></i> {sanitizeText(comparisonAppo.phone || 'Girilmedi')}
                  </div>
                </div>
                <div className="rd-info-field">
                  <label className="rd-field-label">E-POSTA</label>
                  <div className="rd-field-value">
                    <i className="fas fa-envelope"></i> {sanitizeText(comparisonAppo.email || 'Girilmedi')}
                  </div>
                </div>
              </div>

              <div className="rd-info-row">
                <div className="rd-info-field">
                  <label className="rd-field-label">ONAYLANAN TARİH</label>
                  <div className="rd-field-value">
                    <i className="fas fa-calendar-alt"></i> {sanitizeText(comparisonAppo.date)}
                  </div>
                </div>
                <div className="rd-info-field">
                  <label className="rd-field-label">ONAYLANAN SAAT ARALIĞI</label>
                  <div className="rd-field-value">
                    <i className="fas fa-clock"></i> {sanitizeText(comparisonAppo.start)} - {sanitizeText(comparisonAppo.end)}
                  </div>
                </div>
              </div>

              <div className="rd-info-field">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label className="rd-field-label">ONAYLANAN MÜŞTERİ LOKASYONU</label>
                  {comparisonAppo && (comparisonAppo.lat || comparisonAppo.address) && (
                    <a 
                      href={
                        comparisonAppo.lat && comparisonAppo.lng 
                        ? `https://www.google.com/maps/search/?api=1&query=${comparisonAppo.lat},${comparisonAppo.lng}`
                        : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(comparisonAppo.fullAddress || comparisonAppo.address)}`
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rd-mini-map-btn"
                      title="Haritada Aç"
                    >
                      <i className="fas fa-map-marked-alt"></i> Haritada Gör
                    </a>
                  )}
                </div>
                <div className="rd-field-value">
                  <i className="fas fa-map-marker-alt"></i> {sanitizeText(comparisonAppo.fullAddress || 'Adres belirtilmedi')}
                </div>
              </div>

              <div className="rd-info-field">
                <label className="rd-field-label">ONAYLANAN MÜŞTERİ MESAJI</label>
                <div className="rd-note-box">"{sanitizeText(comparisonAppo.note || 'Mesaj bırakılmadı.')}"</div>
              </div>

              <button className="rd-back-to-decision-btn" onClick={() => setComparisonAppo(null)}>
                <i className="fas fa-undo"></i> Karar Ekranına Dön
              </button>

            </div>
          ) : (
            <div className="rd-decision-mode animate-fade-in">
              
              {!showDurationInput ? (
                <button className="rd-btn rd-btn--approve" onClick={() => setShowDurationInput(true)}>
                  <i className="fas fa-check-circle"></i> TALEBİ ONAYLA
                </button>
              ) : (
                <div className="rd-duration-box">
                  <label className="rd-duration-label">İşlem kaç dakika sürer?</label>
                  <div className="rd-duration-row">
                    <input
                      type="number" 
                      placeholder="Örn: 45" 
                      value={duration}
                      onChange={e => setDuration(e.target.value)}
                      className="rd-duration-input"
                      min="5"
                      max="480"
                    />
                    <button className="rd-btn rd-btn--confirm" onClick={finalizeApproval}>Onayla</button>
                  </div>
                  <button className="rd-btn-text" onClick={() => setShowDurationInput(false)}>Vazgeç</button>
                </div>
              )}

                {!showRejectArea ? (
                  <button className="rd-btn rd-btn--reject" onClick={() => setShowRejectArea(true)}>
                    Talebi Reddet
                  </button>
                ) : (
                  <div className="rd-reject-box">
                    <div className="rd-reject-header">
                      <label className="rd-reject-label">Reddetme Nedeni:</label>
                      <button 
                        className="rd-quick-reasons-toggle"
                        onClick={() => setShowQuickReasons(!showQuickReasons)}
                      >
                        <i className="fas fa-bolt"></i> Hızlı Sebepler
                      </button>
                    </div>

                    {showQuickReasons && (
                      <div className="rd-quick-reasons">
                        {quickRejectionReasons.map(reason => (
                          <button
                            key={reason.id}
                            className={`rd-quick-reason ${selectedQuickReason?.id === reason.id ? 'selected' : ''}`}
                            onClick={() => handleQuickReasonSelect(reason)}
                          >
                            <span className="reason-icon">{reason.icon}</span>
                            <div className="reason-content">
                              <span className="reason-title">{sanitizeText(reason.text)}</span>
                              <span className="reason-description">{sanitizeText(reason.description)}</span>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}

                    <textarea
                      placeholder="Red sebebini detaylı yazın..."
                      value={rejectNote}
                      onChange={e => setRejectNote(e.target.value)}
                      className="rd-reject-textarea"
                      rows="4"
                    />
                    
                    <div className="rd-reject-actions">
                      <button 
                        className="rd-btn rd-btn--reject-confirm" 
                        onClick={handleReject}
                        disabled={!rejectNote.trim()}
                      >
                        Reddi Gönder
                      </button>
                      <button 
                        className="rd-btn rd-btn--cancel" 
                        onClick={() => {
                          setShowRejectArea(false);
                          setRejectNote('');
                          setSelectedQuickReason(null);
                          setShowQuickReasons(false);
                        }}
                      >
                        İptal
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
          </div>
        </section>
      </main>

      {showDecisionModal && (
        <div className="rd-modal-overlay">
          <div className="rd-modal">
            <i className="fas fa-check-circle rd-modal-icon"></i>
            <h3 className="rd-modal-title">Randevu Başarıyla Onaylandı!</h3>
            <p className="rd-modal-text">Değişikliği Randevu Takviminizde Görmek İster misiniz?</p>
            <div className="rd-modal-actions">
              <button className="rd-btn rd-btn--approve rd-btn--modal" onClick={() => navigate('/randevu-takvimi')}>
                EVET (Takvime Git)
              </button>
              <button className="rd-btn rd-btn--cancel rd-btn--modal" onClick={() => navigate('/customer-requests')}>
                HAYIR (Listeye Dön)
              </button>
            </div>
          </div>
        </div>
      )}

      {showNoTokenModal && (
        <div className="rd-modal-overlay">
          <div className="rd-modal" style={{ borderTop: '4px solid #ef4444' }}>
            <i className="fas fa-coins rd-modal-icon" style={{ color: '#ef4444' }}></i>
            <h3 className="rd-modal-title">Yetersiz Jeton!</h3>
            <p className="rd-modal-text">Bu randevuyu onaylamak için cüzdanınızda en az 1 jeton bulunmalıdır.</p>
            <div className="rd-modal-actions" style={{ flexDirection: 'column', gap: '10px' }}>
              <button 
                className="rd-btn rd-btn--approve rd-btn--modal" 
                style={{ width: '100%' }}
                onClick={() => {
                  setShowNoTokenModal(false);
                  setIsTokenPanelOpen(true);
                }}
              >
                <i className="fas fa-bolt"></i> Şimdi Yükle
              </button>
              <button 
                className="rd-btn rd-btn--cancel rd-btn--modal" 
                style={{ width: '100%' }}
                onClick={() => setShowNoTokenModal(false)}
              >
                Vazgeç
              </button>
            </div>
          </div>
        </div>
      )}

      <TokenModal 
        isOpen={isTokenPanelOpen} 
        onClose={() => setIsTokenPanelOpen(false)}
        tokenBalance={0}
      />

    </div>
  );
};

export default RequestDetailPage;