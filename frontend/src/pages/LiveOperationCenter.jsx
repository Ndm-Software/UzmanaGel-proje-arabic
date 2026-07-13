import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { db, auth } from '../firebase/firebaseClient';
import { collection, query, where, onSnapshot, doc, updateDoc, serverTimestamp, getDocs } from 'firebase/firestore';
import { motion, AnimatePresence } from 'framer-motion';
import Navbar from '../components/Navbar';
import '../styles/LiveOperation.css';
import { showAppToast } from '../utils/showAppToast';

import ChatTermsModal from '../components/ChatTermsModal';
import {
  hasAcceptedChatTerms,
  saveChatTermsAccepted
} from '../utils/chatTermsStorage';
import { getOrCreateConversation } from '../services/chatApi';

const LiveOperationCenter = () => {
  const navigate = useNavigate();
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedAppId, setSelectedAppId] = useState(null);
  const [inputCodes, setInputCodes] = useState({});
  const [currentTime, setCurrentTime] = useState(new Date());
  const user = auth.currentUser;
  const [expertCoords, setExpertCoords] = useState(null);

  const [showAddressWarning, setShowAddressWarning] = useState(false);
  const [pendingNavMode, setPendingNavMode] = useState('work');

  const [chatTermsModal, setChatTermsModal] = useState({
    open: false,
    accepted: false,
    loading: false,
    chatData: null,
  });
  
  const navigateToGoogleMaps = (mode) => {
    const clientLat = selectedApp?.lat;
    const clientLng = selectedApp?.lng;

    if (!clientLat || !clientLng) {
      showAppToast("Konum bilgisi eksik!", "error");
      return;
    }

    let url = "";
    if (mode === 'work') {
      const origin = `${expertCoords?.lat},${expertCoords?.lng}`;
      url = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${clientLat},${clientLng}`;
    } else {
      url = `https://www.google.com/maps/dir/?api=1&destination=${clientLat},${clientLng}`;
    }

    window.open(url, '_blank');
    setShowAddressWarning(false);
  };

  const handleRouteSelection = (mode) => {
    if (!selectedApp) return;
    setPendingNavMode(mode);

    if (selectedApp.coordSource === 'API_District') {
      setShowAddressWarning(true);
    } else {
      navigateToGoogleMaps(mode);
    }
  };
  
  useEffect(() => {
    if (!user) return;
    const fetchExpertCoords = async () => {
      try {
        const { getDoc, doc } = await import('firebase/firestore');
        const expertSnap = await getDoc(doc(db, 'service_providers', user.uid));
        if (expertSnap.exists()) {
          const data = expertSnap.data();
          setExpertCoords({ lat: data.lat, lng: data.lng });
        }
      } catch (err) { console.error("Uzman konumu çekilemedi:", err); }
    };
    fetchExpertCoords();
  }, [user]);

  const handleWorkToCustomer = () => {
    if (!selectedApp) return;

    if (selectedApp.coordSource === 'API_District') {
      setShowAddressWarning(true);
    } else {
      navigateToGoogleMaps('work');
    }
  };

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearTimeout(timer);
  }, []);

  const getRemainingTime = (dateStr, timeStr) => {
    if (!dateStr || !timeStr) return "";
    const targetDate = new Date(`${dateStr}T${timeStr}:00`);
    const diff = targetDate - currentTime;
    if (diff <= 0) return "Süre Doldu / İşlem Vakti";
    const hours = Math.floor((diff / (1000 * 60 * 60)));
    const minutes = Math.floor((diff / 1000 / 60) % 60);
    const seconds = Math.floor((diff / 1000) % 60);
    return `${hours} Saat ${minutes} Dakika ${seconds} Saniye`;
  };

  useEffect(() => {
    if (!user) return;
    const today = new Date().toLocaleDateString('sv-SE');
    const q = query(
    collection(db, 'appointments'),
    where('expertId', '==', user.uid),
    where('date', '==', today),
    where('status', 'in', ['approved', 'expert_at_door', 'in_progress', 'finishing', 'completed'])
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      const sorted = docs.sort((a, b) => (a.start || "").localeCompare(b.start || ""));
      setAppointments(sorted);
      setLoading(false);
    });
    return () => unsubscribe();
  }, [user]);

  const checkTimeWindow = (startTime) => {
    if (!startTime) return 'passive';
    const now = new Date();
    const [hours, minutes] = startTime.split(':').map(Number);
    
    const appTime = new Date();
    appTime.setHours(hours, minutes, 0, 0);

    const diffHours = (now.getTime() - appTime.getTime()) / (1000 * 60 * 60);

    if (diffHours > 5) return 'expired';
    if (diffHours < -5) return 'passive';
    return 'active';
  };

  const generateSecurityCode = () => Math.floor(100000 + Math.random() * 900000).toString();

  const handleStartJob = async (appId) => {
    const startCode = generateSecurityCode();
    const appRef = doc(db, 'appointments', appId);
    try {
      await updateDoc(appRef, { status: 'expert_at_door', startCode: startCode });
    } catch (err) { console.error("Hata:", err); }
  };

  const handleVerifyStartCode = async (appId, realCode) => {
    if (inputCodes[appId] === realCode) {
      const appRef = doc(db, 'appointments', appId);
      try {
        await updateDoc(appRef, {
          status: 'in_progress',
          checkInTime: serverTimestamp()
        });
      } catch (err) { console.error("Başlatma Hatası:", err); }
    } else {
      showAppToast("Hatalı Kod! Lütfen müşteriden tekrar isteyin.", "error");
    }
  };

  const handleFinishStep = async (appId) => {
    const endCode = generateSecurityCode();
    const appRef = doc(db, 'appointments', appId);
    await updateDoc(appRef, { status: 'finishing', endCode: endCode });
    showAppToast("Müşteriye çıkış kodu gönderildi! Kapatmak için kodu isteyin.", "info");
  };

  const handleVerifyEndCode = async (appId, realCode) => {
    if (inputCodes[`end_${appId}`] === realCode) {
      const appRef = doc(db, 'appointments', appId);
      
      try {
        await updateDoc(appRef, {
          status: 'completed',
          checkOutTime: serverTimestamp(),
          isFinished: true,
          reviewStatus: 'pending',
          startCode: null, 
          endCode: null 
        });

        showAppToast("Operasyon Başarıyla Tamamlandı! İşlem mühürlendi.", "success");
        setSelectedAppId(null);
      } catch (err) {
        console.error("Kapanış Hatası:", err);
      }
    } else {
      showAppToast("Hatalı Kod! Lütfen çıkış kodunu kontrol edin.", "error");
    }
  };

  const getElapsedTime = (checkInTime) => {
    if (!checkInTime) return "00:00:00";
    
    const startTime = checkInTime.toDate ? checkInTime.toDate() : new Date(checkInTime);
    
    const diff = currentTime - startTime; 
    if (diff <= 0) return "00:00:00";
    
    const hours = Math.floor((diff / (1000 * 60 * 60)));
    const minutes = Math.floor((diff / 1000 / 60) % 60);
    const seconds = Math.floor((diff / 1000) % 60);
    
    const pad = (num) => num.toString().padStart(2, '0');
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  };

  const selectedApp = appointments.find(a => a.id === selectedAppId);

  const resetChatTermsModal = () => {
    setChatTermsModal({
      open: false,
      accepted: false,
      loading: false,
      chatData: null,
    });
  };

  const closeChatTermsModal = () => {
    if (chatTermsModal.loading) return;

    resetChatTermsModal();
    document.body.classList.remove('modal-open');
  };

  const getSelectedAppChatData = () => {
  if (!selectedApp) {
    throw new Error('Randevu seçilmedi.');
  }

  const otherUserUid = String(
    selectedApp.clientId ||
    selectedApp.clientUid ||
    ''
  ).trim();

  const actualProviderUid = String(
    selectedApp.expertId ||
    selectedApp.providerUid ||
    user?.uid ||
    ''
  ).trim();

  const serviceId = String(
    selectedApp.listingId ||
    selectedApp.serviceId ||
    selectedApp.ilanId ||
    selectedApp.adId ||
    ''
  ).trim();

  const serviceTitle = String(
    selectedApp.listingTitle ||
    selectedApp.serviceTitle ||
    selectedApp.serviceName ||
    selectedApp.title ||
    'Randevu'
  ).trim();

  const appointmentId = String(
    selectedApp.appointmentId ||
    selectedApp.id ||
    ''
  ).trim();

  if (!otherUserUid) {
    throw new Error('Müşteri bilgisi eksik. Sohbet başlatılamıyor.');
  }

  if (!actualProviderUid) {
    throw new Error('Uzman bilgisi eksik. Sohbet başlatılamıyor.');
  }

  if (user?.uid && actualProviderUid !== user.uid) {
    throw new Error('Bu randevu giriş yapan uzmana ait değil.');
  }

  if (!serviceId) {
    throw new Error('Hizmet / ilan bilgisi eksik. Sohbet başlatılamıyor.');
  }

  if (!appointmentId) {
    throw new Error('Randevu ID eksik. Sohbet başlatılamıyor.');
  }

  return {
    providerUid: otherUserUid,
    clientUid: otherUserUid,
    actualProviderUid,
    serviceId,
    serviceTitle,
    appointmentId,
  };
};

const continueToChatFromLiveOperation = async (directChatData = null) => {
  const chatData = directChatData || chatTermsModal.chatData;
  if (!chatData) return;

  try {
    setChatTermsModal((prev) => ({
      ...prev,
      loading: true,
    }));

    const { providerUid, serviceId, serviceTitle, appointmentId } = chatData;

    const result = await getOrCreateConversation(
      providerUid,
      serviceId,
      serviceTitle || 'Randevu',
      appointmentId
    );

    if (!result?.conversationId) {
      throw new Error('Sohbet ID alınamadı.');
    }

    saveChatTermsAccepted({
      currentUid: user?.uid,
      providerUid,
      serviceId,
      appointmentId,
    });

    resetChatTermsModal();
    document.body.classList.remove('modal-open');

    navigate(`/mesajlar?conversation=${encodeURIComponent(result.conversationId)}&open=true`);
  } catch (error) {
    console.error('Uzman tarafı sohbet açma hatası:', error);

    resetChatTermsModal();
    document.body.classList.remove('modal-open');

    showAppToast(error?.message || 'Sohbet açılamadı.', 'error');
  }
};

const handleMessageFromLiveOperation = async (event) => {
  event?.stopPropagation();

  try {
    const chatData = getSelectedAppChatData();
    const { providerUid, serviceId, appointmentId } = chatData;

    const acceptedBefore = hasAcceptedChatTerms({
      currentUid: user?.uid,
      providerUid,
      serviceId,
      appointmentId,
    });

    if (acceptedBefore) {
      await continueToChatFromLiveOperation(chatData);
      return;
    }

    setChatTermsModal({
      open: true,
      accepted: false,
      loading: false,
      chatData,
    });

    document.body.classList.add('modal-open');
  } catch (error) {
    showAppToast(error?.message || 'Sohbet açılamadı.', 'error');
  }
};

if (loading) return <div className="live-loading">Görevler yükleniyor... 🛠️</div>;

  return (
    <>
      <Navbar />
      <div className="live-operation-wrapper" style={{ paddingTop: '40px', paddingLeft: '20px', paddingRight: '20px' }}>
        
        <div style={{ textAlign: 'center', marginBottom: '30px' }}>
          <h2 style={{ margin: 0 }}>📢 Canlı İşbaşı Merkezi ({new Intl.DateTimeFormat('tr-TR').format(new Date())})</h2>
          <p style={{ marginTop: '10px', color: '#7dd3fc', fontSize: '1.3rem', fontWeight: 'bold' }}>
            {new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', weekday: 'long' }).format(new Date())} Günündeki Randevularınız
          </p>
        </div>
        
        {appointments.length === 0 ? (
          <div style={{ 
            position: 'fixed', 
            top: '50%', 
            left: '50%', 
            transform: 'translate(-50%, -50%)', 
            width: '90%', 
            maxWidth: '700px',
            zIndex: 1
          }}>
            <div style={{
              padding: '60px 50px', 
              borderRadius: '28px',
              background: 'linear-gradient(145deg, rgba(15,23,42,0.98), rgba(30,41,59,0.95))',
              border: '1px solid rgba(148,163,184,0.18)', 
              boxShadow: '0 24px 60px rgba(2,6,23,0.45)',
              display: 'flex', 
              flexDirection: 'column', 
              alignItems: 'center', 
              gap: '24px', 
              textAlign: 'center'
            }}>
              <div style={{ width: '72px', height: '72px', borderRadius: '22px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, rgba(37,99,235,0.25), rgba(16,185,129,0.22))', border: '1px solid rgba(96,165,250,0.3)', color: '#93c5fd', fontSize: '1.9rem' }}>
                <i className="fas fa-satellite-dish"></i>
              </div>
              <div>
                <span style={{ color: '#7dd3fc', fontSize: '0.78rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase' }}>Bugün için operasyon yok</span>
                <p style={{ margin: '12px 0 0', color: '#cbd5e1', lineHeight: 1.7, fontSize: '1rem' }}>
                  Yeni bir randevu onaylandığında görev kartları burada otomatik olarak görüntülenecek.
                </p>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', width: '100%' }}>
                <div style={{ padding: '18px 20px', borderRadius: '18px', background: 'rgba(15,23,42,0.76)', border: '1px solid rgba(148,163,184,0.14)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <span style={{ color: '#7dd3fc', fontSize: '0.78rem', fontWeight: 700, textTransform: 'uppercase' }}>Bugün</span>
                  <strong style={{ color: '#f8fafc' }}>{new Intl.DateTimeFormat('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())}</strong>
                </div>
                <div style={{ padding: '18px 20px', borderRadius: '18px', background: 'rgba(15,23,42,0.76)', border: '1px solid rgba(148,163,184,0.14)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <span style={{ color: '#7dd3fc', fontSize: '0.78rem', fontWeight: 700, textTransform: 'uppercase' }}>Durum</span>
                  <strong style={{ color: '#f8fafc' }}>Bekleyen aktif görev yok</strong>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', justifyContent: 'center' }}>
                <button onClick={() => navigate('/randevu-takvimi')} style={{ minHeight: '50px', padding: '0 18px', borderRadius: '14px', border: 'none', background: 'linear-gradient(135deg, #2563eb, #0ea5e9)', color: '#fff', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <i className="fas fa-calendar-alt"></i> Randevu Takvimine Git
                </button>
                <button onClick={() => navigate('/bildirimler')} style={{ minHeight: '50px', padding: '0 18px', borderRadius: '14px', border: '1px solid rgba(148,163,184,0.18)', background: 'rgba(30,41,59,0.9)', color: '#e2e8f0', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <i className="fas fa-bell"></i> Bildirimleri Kontrol Et
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="expert-grid">
            {appointments.map((app, index) => {
              let cardClass = "operation-card";
              let statusText = "Beklemede";
              let badgeClass = "badge-passive";
              let badgeText = "Pasif (Zamanı Gelmedi)";
              let isClickable = false;

              const timeWindow = checkTimeWindow(app.start);

              if (app.status === 'completed') {
                cardClass += " status-blue";
                statusText = "Tamamlandı ✅";
                badgeClass = "badge-completed";
                badgeText = "İşlem Tamamlandı";
              } else if (timeWindow === 'expired' && app.status === 'approved') {
                cardClass += " status-red";
                statusText = "Süresi Geçti ❌";
                badgeClass = "badge-expired";
                badgeText = "Süresi Geçti";
              } else if (timeWindow === 'passive' && app.status === 'approved') {
                cardClass += " status-gray";
                statusText = "Saati Bekleniyor ⏳";
                badgeClass = "badge-passive";
                badgeText = "Pasif (Beklemede)";
              } else {
                isClickable = true;
                badgeClass = "badge-active";
                badgeText = "Aktif - Kokpiti Aç 🚀";
                
                if (app.status === 'approved') {
                  cardClass += " status-green pulse-border";
                  statusText = "Hemen İşlem Yapılabilir";
                } else {
                  cardClass += " status-green-active";
                  statusText = "İşlem Devam Ediyor...";
                }
              }

              return (
                <motion.div 
                  key={app.id} 
                  whileHover={isClickable ? { scale: 1.02 } : {}}
                  className={cardClass}
                  onClick={() => isClickable && setSelectedAppId(app.id)}
                  style={{ cursor: isClickable ? 'pointer' : 'not-allowed' }}
                >
                  <span className="customer-number" style={{ fontSize: '1rem', opacity: 0.9, margin: 0 }}>{index + 1}. Müşteri</span>

                  <div style={{ display: 'flex', gap: '10px', fontSize: '1.4rem', fontWeight: '600', margin: 0 }}>
                    <span style={{ color: '#4ade80dd' }}>{app.start}</span>
                    <span style={{ color: '#94a3b8', opacity: 0.5 }}>-</span>
                    <span style={{ color: '#3ddae8da' }}>{app.end}</span>
                  </div>

                  <h3 className="customer-name" style={{ color: '#fbbe24e1', fontSize: '1.6rem', margin: 0 }}>{app.client}</h3>

                  <p style={{ fontSize: '1rem', color: '#4c8ee9', margin: 0, lineHeight: 1.8 }}>
                    <i className="fas fa-map-marker-alt" style={{ marginRight: '6px' }}></i>
                    {app.city || "Bartın"} / {app.district} / {app.neighborhood}
                  </p>
                  
                  <div style={{ width: '100%' }}>
                    <p className="app-status-label" style={{ marginBottom: '12px' }}>{statusText}</p>
                    <div className={`status-info-badge ${badgeClass}`} style={{ margin: 0 }}>
                      {badgeText}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      <AnimatePresence>
        {selectedApp && (
          <motion.div 
            className="cockpit-overlay"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          >
            <motion.div 
              className="cockpit-modal"
              initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
              transition={{ type: 'tween', duration: 0.3 }}
            >
              <div className="cockpit-nav-header">
                <button className="btn-back-nav" onClick={() => setSelectedAppId(null)}>
                  <i className="fas fa-chevron-left"></i> Geri Dön
                </button>
              </div>

              {selectedApp.createdBy === 'expert' ? (
                <div className="cockpit-header" style={{ width: '100%', maxWidth: '500px' }}>
                  
                  <div style={{ textAlign: 'center', marginBottom: '15px', padding: '12px', background: 'rgba(59, 130, 246, 0.1)', borderRadius: '12px', border: '1px solid rgba(59, 130, 246, 0.3)' }}>
                    <p style={{ color: '#94a3b8', fontSize: '0.85rem', marginBottom: '5px', fontWeight: 'bold', textTransform: 'uppercase' }}>Buluşmaya Kalan Süre</p>
                    <p style={{ color: '#60a5fa', fontSize: '1.2rem', fontWeight: 'bold' }}>
                      <i className="fas fa-hourglass-half fa-spin" style={{ marginRight: '8px' }}></i>
                      {getRemainingTime(selectedApp.date, selectedApp.start)}
                    </p>
                  </div>

                  <details className="info-accordion" open>
                    <summary className="info-summary">
                      <i className="fas fa-user-circle"></i> Müşteri Bilgilerini Gizle / Göster
                    </summary>
                    <div className="info-content">
                      <p><strong>Ad Soyad:</strong> {selectedApp.client}</p>
                      <p><strong>Telefon:</strong> {selectedApp.phone}</p>
                      <p><strong>E-Posta:</strong> {selectedApp.email}</p>
                      <p><strong>Adres:</strong> {selectedApp.fullAddress || `${selectedApp.district} / ${selectedApp.neighborhood}`}</p>
                      <p><strong>Not:</strong> {selectedApp.note || "Belirtilmemiş"}</p>
                    </div>
                  </details>

                  <div className="contact-grid-system" style={{ marginTop: '20px' }}>
                    <details className="map-dropdown">
                      <summary className="btn-cockpit-main btn-map-green" style={{ justifyContent: 'center', gap: '15px' }}>
                        <span><i className="fas fa-map-marked-alt"></i> Yol Tarifi Al</span>
                        <i className="fas fa-chevron-down" style={{ fontSize: '0.8rem', opacity: 0.8 }}></i>
                      </summary>
                      <div className="map-options">
                        <button className="map-opt-btn" onClick={() => handleRouteSelection('work')}>
                          <div className="opt-main"><i className="fas fa-building"></i> İşyerimden</div>
                        </button>
                        <button className="map-opt-btn" onClick={() => handleRouteSelection('live')}>
                          <div className="opt-main"><i className="fas fa-location-arrow"></i> Canlı Konumumdan</div>
                        </button>
                      </div>
                    </details>
                  </div>
                </div>
              ) : ( 
                <>
                  <div className="cockpit-header" style={{ width: '100%', maxWidth: '500px' }}>
                    
                    {selectedApp.status === 'in_progress' || selectedApp.status === 'finishing' ? (
                      <div style={{ textAlign: 'center', marginBottom: '15px', padding: '15px', background: 'rgba(16, 185, 129, 0.1)', borderRadius: '12px', border: '1px solid #10b981' }}>
                        <p style={{ color: '#94a3b8', fontSize: '0.85rem', marginBottom: '8px', fontWeight: 'bold', textTransform: 'uppercase' }}>⚠️ Operasyon Aktif (Geçen Süre)</p>
                        <p style={{ color: '#10b981', fontSize: '1.8rem', fontWeight: 'bold', letterSpacing: '3px' }}>
                          <i className="fas fa-stopwatch fa-spin" style={{ marginRight: '10px' }}></i>
                          {getElapsedTime(selectedApp.checkInTime)}
                        </p>
                      </div>
                    ) : (
                      <div style={{ textAlign: 'center', marginBottom: '15px', padding: '12px', background: 'rgba(59, 130, 246, 0.1)', borderRadius: '12px', border: '1px solid rgba(59, 130, 246, 0.3)' }}>
                        <p style={{ color: '#94a3b8', fontSize: '0.85rem', marginBottom: '5px', fontWeight: 'bold', textTransform: 'uppercase' }}>Buluşmaya Kalan Süre</p>
                        <p style={{ color: '#60a5fa', fontSize: '1.2rem', fontWeight: 'bold' }}>
                          <i className="fas fa-hourglass-half fa-spin" style={{ marginRight: '8px' }}></i>
                          {getRemainingTime(selectedApp.date, selectedApp.start)}
                        </p>
                      </div>
                    )}

                    <details className="info-accordion" open>
                      <summary className="info-summary">
                        <i className="fas fa-user-circle"></i> Müşteri Bilgilerini Gizle / Göster
                      </summary>
                      <div className="info-content">
                        <p><strong>Ad Soyad:</strong> {selectedApp.client}</p>
                        <p><strong>Telefon:</strong> {selectedApp.phone}</p>
                        <p><strong>E-Posta:</strong> {selectedApp.email}</p>
                        <p><strong>Buluşma Tarihi:</strong> {selectedApp.date}</p>
                        <p><strong>Başlangıç Saati:</strong> {selectedApp.start}   |   <strong>Bitiş Saati:</strong> {selectedApp.end}</p>
                        <p><strong>Adres:</strong> {selectedApp.fullAddress || `${selectedApp.district} / ${selectedApp.neighborhood}`}</p>
                        <p><strong>Not:</strong> {selectedApp.note || "Belirtilmemiş"}</p>
                      </div>
                    </details>

                    {selectedApp.status !== 'in_progress' && selectedApp.status !== 'finishing' && (
                      <>
                        <hr className="cockpit-divider" />
                        <div className="contact-grid-system" style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '20px' }}>
                          <button 
                            className="btn-cockpit-main btn-msg-blue" 
                            style={{ background: '#2563eb', width: '100%' }}
                            onClick={handleMessageFromLiveOperation}
                            disabled={chatTermsModal.loading}
                          >
                            <i className="fas fa-comment-alt"></i> Mesaj At
                          </button>

                          <details className="map-dropdown">
                            <summary className="btn-cockpit-main btn-map-green" style={{ justifyContent: 'center', gap: '15px' }}>
                              <span><i className="fas fa-map-marked-alt"></i> Yol Tarifi Al</span>
                              <i className="fas fa-chevron-down" style={{ fontSize: '0.8rem', opacity: 0.8 }}></i>
                            </summary>
                            <div className="map-options">
                              <button className="map-opt-btn" onClick={() => handleRouteSelection('work')}>
                                <div className="opt-main"><i className="fas fa-building"></i> İşyerimden</div>
                              </button>
                              <button className="map-opt-btn" onClick={() => handleRouteSelection('live')}>
                                <div className="opt-main"><i className="fas fa-location-arrow"></i> Canlı Konumumdan</div>
                              </button>

                            </div>
                          </details>
                        </div>
                         
                        {showAddressWarning && (
                          <div 
                            className="cockpit-overlay" 
                            style={{ background: 'rgba(0,0,0,0.95)', zIndex: 10000 }}
                            onClick={() => setShowAddressWarning(false)}
                          >
                            <div 
                              className="operation-card" 
                              style={{ maxWidth: '450px', textAlign: 'center', border: '2px solid #ef4444', position: 'relative' }}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <button 
                                onClick={() => setShowAddressWarning(false)}
                                style={{ position: 'absolute', top: '15px', right: '15px', background: 'none', border: 'none', color: '#94a3b8', fontSize: '1.2rem', cursor: 'pointer', padding: '5px' }}
                              >
                                <i className="fas fa-times"></i>
                              </button>
                              <i className="fas fa-exclamation-triangle" style={{ fontSize: '3rem', color: '#ef4444', marginBottom: '20px' }}></i>
                              <h2 style={{ color: 'white', marginBottom: '15px' }}>Düşük Konum Doğruluğu!</h2>
                              <p style={{ color: '#cbd5e1', lineHeight: '1.6', fontSize: '0.95rem' }}>
                                <b>Dikkat:</b> Müşteri sadece ilçe merkezi olarak konum bildirmiştir. Bu adres sizi <b>ilçe merkezine</b> götürecektir, tam adrese değil.
                                <br /><br />
                                Randevu adresini müşteriden teyit etmeniz önerilir.
                              </p>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '25px' }}>
                                <button 
                                  className="btn-massive-start" 
                                  style={{ fontSize: '1rem', padding: '15px' }}
                                  onClick={() => navigateToGoogleMaps(pendingNavMode)}
                                >
                                  Yine de ilçe merkezine git
                                </button>
                                <button className="btn-back-nav" style={{ justifyContent: 'center' }} onClick={() => setShowAddressWarning(false)}>
                                  Vazgeç, müşteriyle iletişime geçeyim
                                </button>
                              </div>
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  <div className="action-area" style={{ width: '100%', maxWidth: '500px', marginTop: '15px' }}>
                    
                    {selectedApp.status === 'approved' && (
                      <button className="btn-massive-start" onClick={() => handleStartJob(selectedApp.id)}>
                        🚀 İşe Başla
                      </button>
                    )}

                    {selectedApp.status === 'expert_at_door' && (
                      <div className="input-code-area">
                        <p style={{color: '#4ade80', marginBottom: '10px'}}>Müşteride beliren Başlangıç Kodunu girin:</p>
                        <input 
                          type="text" maxLength="6" placeholder="000000" className="code-input-large"
                          value={inputCodes[selectedApp.id] || ''}
                          onChange={(e) => setInputCodes({...inputCodes, [selectedApp.id]: e.target.value})}
                        />
                        <button 
                          className="btn-massive-verify" 
                          onClick={() => handleVerifyStartCode(selectedApp.id, selectedApp.startCode)}
                          disabled={inputCodes[selectedApp.id]?.length !== 6}
                        >
                          Doğrula ve Başlat
                        </button>
                      </div>
                    )}

                    {selectedApp.status === 'in_progress' && (
                      <button className="btn-massive-finish" style={{ background: '#f43f5e' }} onClick={() => handleFinishStep(selectedApp.id)}>
                        ✅ İşi Bitir (Çıkış Kodu Gönder)
                      </button>
                    )}

                    {selectedApp.status === 'finishing' && (
                      <div className="input-code-area">
                        <p style={{color: '#60a5fa', marginBottom: '10px', textAlign: 'center'}}>Müşteride beliren Çıkış Kodunu girin:</p>
                        <input 
                          type="text" maxLength="6" placeholder="000000" className="code-input-large" style={{ borderColor: '#60a5fa', color: '#60a5fa' }}
                          value={inputCodes[`end_${selectedApp.id}`] || ''}
                          onChange={(e) => setInputCodes({...inputCodes, [`end_${selectedApp.id}`]: e.target.value})}
                        />
                        <button 
                          className="btn-massive-verify" style={{ background: '#8b5cf6' }}
                          onClick={() => handleVerifyEndCode(selectedApp.id, selectedApp.endCode)}
                          disabled={inputCodes[`end_${selectedApp.id}`]?.length !== 6}
                        >
                          Çıkışı Doğrula ve İşi Tamamla
                        </button>
                      </div>
                    )}
                  </div>
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

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
        onConfirm={() => continueToChatFromLiveOperation()}
      />
    </>
  );
};

export default LiveOperationCenter;