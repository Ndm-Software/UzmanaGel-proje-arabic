import React, { useMemo, useRef, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { db, auth } from '../firebase/firebaseClient';
import { collection, query, where, onSnapshot, doc, getDoc } from 'firebase/firestore';
import { motion, AnimatePresence } from 'framer-motion';
import '../styles/LiveOperation.css';
import Navbar from '../components/Navbar';

const LiveServiceTracking = () => {
  const navigate = useNavigate();
  const [appointments, setAppointments] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const user = auth.currentUser;
  const [reviewPrompt, setReviewPrompt] = useState(null);
  const promptedRef = useRef(new Set());
  const prevStatusRef = useRef(new Map());

  const todayStr = new Date().toLocaleDateString('sv-SE');
  const activeJobs = appointments.filter(a => a.date === todayStr && ['expert_at_door', 'in_progress', 'finishing'].includes(a.status));
  const upcomingJobs = appointments.filter(a => a.date === todayStr && a.status === 'approved');
  const completedJobs = appointments.filter(a => a.status === 'completed');

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'reviews'), where('clientId', '==', user.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setReviews(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => unsubscribe();
  }, [user]);

  const reviewAppointmentIdSet = useMemo(() => {
    return new Set((reviews || []).map((r) => String(r?.appointmentId || r?.id || '').trim()).filter(Boolean));
  }, [reviews]);

  useEffect(() => {
    if (!user) return;

    const today = new Date().toLocaleDateString('sv-SE');
    
    const q = query(
      collection(db, 'appointments'),
      where('clientId', '==', user.uid),
      where('status', 'in', ['approved', 'expert_at_door', 'in_progress', 'finishing', 'completed'])
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (!snapshot.empty) {
        const results = snapshot.docs.map(doc => ({ 
          id: doc.id, 
          ...doc.data(),
          uniqueKey: `${doc.id}-${doc.data().status}-${Date.now()}`
        }));
        results.sort((a, b) => (a.start || "").localeCompare(b.start || ""));
        setAppointments(results);

        if (!reviewPrompt) {
          for (const appt of results) {
            const apptId = String(appt?.id || '').trim();
            if (!apptId) continue;
            const status = String(appt?.status || '').trim();
            const prev = prevStatusRef.current.get(apptId);
            prevStatusRef.current.set(apptId, status);

            const transitionedToCompleted = status === 'completed' && prev && prev !== 'completed';
            const hasReview = reviewAppointmentIdSet.has(apptId);
            const alreadyPrompted = promptedRef.current.has(apptId);

            if (transitionedToCompleted && !hasReview && !alreadyPrompted) {
              promptedRef.current.add(apptId);
              setReviewPrompt({
                appointmentId: apptId,
                expertName: appt?.expertName || 'Uzman',
              });
              break;
            }
          }
        }
      } else {
        setAppointments([]);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user, reviewAppointmentIdSet, reviewPrompt]);

  const handlePromptYes = () => {
    if (!reviewPrompt?.appointmentId) return;
    navigate('/customer-appointments?tab=completed', { state: { focusId: reviewPrompt.appointmentId } });
    setReviewPrompt(null);
  };

  const handlePromptNo = () => {
    setReviewPrompt(null);
  };

  const formatTime = (ts) => {
    if (!ts) return "--:--";
    const date = ts.toDate ? ts.toDate() : new Date(ts);
    return date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  };

  if (loading) return <div className="live-loading">Sinyal aranıyor... 📡</div>;

  if (appointments.length === 0) {
    return (
      <div className="live-empty-state">
        <i className="fas fa-calendar-day"></i>
        <h2>Bugün aktif bir hizmetiniz görünmüyor.</h2>
        <p>Randevu saati yaklaştığında burası canlanacaktır.</p>
      </div>
    );
  }

  return (
    <>
      <Navbar />
      <div className="live-tracking-wrapper">
        <AnimatePresence mode="wait">
          {reviewPrompt && (
            <motion.div
              key="review-prompt-modal"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(0,0,0,0.65)',
                zIndex: 9999,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 16,
              }}
              onClick={handlePromptNo}
            >
              <motion.div
                initial={{ y: 16, opacity: 0, scale: 0.98 }}
                animate={{ y: 0, opacity: 1, scale: 1 }}
                exit={{ y: 12, opacity: 0, scale: 0.98 }}
                transition={{ type: 'spring', stiffness: 260, damping: 22 }}
                onClick={(e) => e.stopPropagation()}
                style={{
                  width: '100%',
                  maxWidth: 520,
                  background: 'rgba(15, 23, 42, 0.92)',
                  border: '1px solid rgba(255,255,255,0.12)',
                  borderRadius: 16,
                  padding: 22,
                  boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                  <div style={{ width: 38, height: 38, borderRadius: 12, background: 'rgba(251, 191, 36, 0.14)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <i className="fas fa-star" style={{ color: '#fbbf24' }}></i>
                  </div>
                  <div>
                    <div style={{ color: '#e2e8f0', fontWeight: 900, fontSize: 18 }}>Yorum yapmak ister misiniz?</div>
                    <div style={{ color: '#94a3b8', fontSize: 13, marginTop: 2 }}>
                      {reviewPrompt.expertName} için değerlendirme yapabilirsiniz.
                    </div>
                  </div>
                </div>
                <div style={{ color: '#cbd5e1', fontSize: 14, lineHeight: 1.6, marginTop: 10 }}>
                  İsterseniz şimdi puan verip yorum yazabilirsiniz. Daha sonra da tamamlanan işlerden değerlendirme yapabilirsiniz.
                </div>
                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 18, flexWrap: 'wrap' }}>
                  <button
                    className="settings-secondary-button"
                    onClick={handlePromptNo}
                    style={{ padding: '10px 14px', fontWeight: 'bold' }}
                  >
                    Hayır
                  </button>
                  <button
                    className="settings-primary-button"
                    onClick={handlePromptYes}
                    style={{ padding: '10px 14px', fontWeight: 'bold' }}
                  >
                    Evet, değerlendir
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
        
        <div style={{ textAlign: 'center', marginBottom: '40px', width: '100%', maxWidth: '600px', margin: '0 auto 40px auto' }}>
          <h2 style={{ margin: 0 }}>📢 Canlı Hizmet Takibi ({new Intl.DateTimeFormat('tr-TR').format(new Date())})</h2>
          <p style={{ marginTop: '10px', color: '#7dd3fc', fontSize: '1.2rem', fontWeight: 'bold' }}>
            {new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', weekday: 'long' }).format(new Date())} Günündeki Hizmetleriniz
          </p>
        </div>

        <div className="tracking-content-container">
          {activeJobs.length > 0 && (
            <section key="active-section" className="tracking-section" style={{ width: '100%' }}>
              <h2 className="section-title active-title"><span className="live-dot"></span> Mevcut Hizmetler</h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))', gap: '24px', width: '100%' }}>
                {activeJobs.map((activeAppointment) => {
                  if (activeAppointment.status === 'expert_at_door') {
                    return (
                      <motion.div key={`active-${activeAppointment.id}`} className="live-card status-at-door" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
                        <div className="status-icon-wrap"><i className="fas fa-door-open"></i></div>
                        <h1>Uzman Kapınızda!</h1>
                        <p style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#4ade80', marginBottom: '10px' }}>{activeAppointment.expertName}</p>
                        <p>Güvenliğiniz için aşağıdaki 6 haneli kodu uzmanla paylaşarak işlemi başlatın:</p>
                        <div className="security-code-display">{activeAppointment.startCode}</div>
                        <div className="warning-box"><i className="fas fa-shield-alt"></i> Bu kodu paylaşmadan işlemi başlatmayın.</div>
                      </motion.div>
                    );
                  }
                  if (activeAppointment.status === 'in_progress') {
                    return (
                      <motion.div key={`active-${activeAppointment.id}`} className="live-card status-working" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                        <div className="status-icon-wrap"><i className="fas fa-tools fa-spin"></i></div>
                        <h1>Hizmet Veriliyor</h1>
                        <p style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#60a5fa', marginBottom: '10px' }}>{activeAppointment.expertName}</p>
                        <p>şu an işleminizi gerçekleştiriyor. Lütfen uzman bitiş kodunu verene kadar bekleyin.</p>
                        <div style={{background: 'rgba(59, 130, 246, 0.1)', padding: '18px', borderRadius: '15px', color: '#60a5fa', fontWeight: 'bold', fontSize: '1.1rem'}}>
                          <i className="fas fa-clock"></i> İşlem Başlangıcı: {formatTime(activeAppointment.checkInTime)}
                        </div>
                      </motion.div>
                    );
                  }
                  if (activeAppointment.status === 'finishing') {
                    return (
                      <motion.div key={`active-${activeAppointment.id}`} className="live-card status-finishing" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}>
                        <div className="status-icon-wrap" style={{color: '#8b5cf6'}}><i className="fas fa-check-double"></i></div>
                        <h1>İşlem Bitti</h1>
                        <p style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#a78bfa', marginBottom: '10px' }}>{activeAppointment.expertName}</p>
                        <p>Hizmet başarıyla tamamlandı. Uzmanın çıkış yapabilmesi için son güvenlik kodunu paylaşın:</p>
                        <div className="security-code-display" style={{borderColor: '#8b5cf6', color: '#a78bfa'}}>{activeAppointment.endCode}</div>
                        <p style={{fontSize: '0.85rem', marginTop: '10px', color: '#94a3b8'}}>Bu kod, işlemin sorunsuz bittiğini onaylar.</p>
                      </motion.div>
                    );
                  }
                  return null;
                })}
              </div>
            </section>
          )}

          {upcomingJobs.length > 0 && (
            <section key="upcoming-section" className="tracking-section" style={{ width: '100%' }}>
              <h3 className="section-title"><i className="fas fa-calendar-alt"></i> Sıradaki Randevular</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '20px', width: '100%' }}>
                {upcomingJobs.slice(0, 6).map((activeAppointment, index) => (
                  <motion.div key={`upcoming-${activeAppointment.id}`} className="live-card status-waiting" style={{ padding: '25px', margin: 0, width: '100%', maxWidth: '100%', display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'flex-start', textAlign: 'left' }} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                    <span style={{ fontSize: '1.2rem', fontWeight: 'bold', opacity: 0.8 }}>Hizmete Gelecek {index + 1}. Uzman</span>
                    <h2 style={{ fontSize: '2rem', color: '#f59e0b', margin: '5px 0' }}>{activeAppointment.expertName}</h2>
                    <p style={{ fontSize: '1.3rem', margin: '0 0 10px 0', fontWeight: 'bold' }}>Durum: Bekleniyor</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%', background: 'rgba(255,255,255,0.05)', padding: '15px', borderRadius: '10px' }}>
                      <span style={{ color: '#cbd5e1', fontSize: '1.3rem' }}><strong style={{color: '#4ade80'}}>Başlangıç Saati:</strong> {activeAppointment.start}</span>
                      <span style={{ color: '#cbd5e1', fontSize: '1.3rem' }}><strong style={{color: '#f87171'}}>Bitiş Saati:</strong> {activeAppointment.end}</span>
                    </div>
                  </motion.div>
                ))}
              </div>
            </section>
          )}

          {completedJobs.length > 0 && (
            <section key="completed-section" className="tracking-section" style={{ width: '100%', marginTop: '30px' }}>
              <h3 className="section-title"><i className="fas fa-history"></i> Tamamlanan Hizmetler</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '20px', width: '100%' }}>
                {completedJobs.slice(0, 6).map(activeAppointment => {
                  const hasReview = reviews.find(r => r.appointmentId === activeAppointment.id);
                  const formattedDate = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(activeAppointment.date));

                  return (
                    <motion.div key={`completed-${activeAppointment.id}`} className="live-card status-completed completed-service-card" style={{ margin: 0, width: '100%', maxWidth: '100%', display: 'flex', flexDirection: 'column', minHeight: '380px', textAlign: 'center' }} initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
                      <div style={{ marginBottom: '15px' }}>
                        <h2 style={{ fontSize: '1.3rem', margin: 0 }}>
                          {activeAppointment.status === 'completed' ? 'Hizmet Tamamlandı ✅' : 'Hizmet Tamamlanmadı ❌'}
                        </h2>
                      </div>
                      <p style={{ fontSize: '1.1rem', color: '#eda831ef', fontWeight: '700', margin: '5px 0' }}>
                        {activeAppointment.expertName} - {formattedDate}
                      </p>
                      <p style={{ fontSize: '1.15rem', color: '#76d34ee7', fontWeight: '500', margin: '5px 0' }}>
                        Saat: {activeAppointment.start} - {activeAppointment.end}
                      </p>
                      <div className="completed-note-box">
                        <span className="completed-note-label">Şikayetiniz:</span>
                        <p className="completed-note-text">
                          {activeAppointment.note || "Not belirtilmemiş."}
                        </p>
                      </div>
                      {hasReview ? (
                        <div style={{ marginTop: 'auto', background: 'rgba(15, 23, 42, 0.6)', padding: '15px', borderRadius: '15px', border: '1px solid rgba(251, 191, 36, 0.3)', textAlign: 'left' }}>
                          <div style={{ color: '#fbbe24dd', marginBottom: '8px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '5px' }}>
                            Verdiğiniz Puan: 
                            <div style={{ display: 'flex', gap: '4px' }}>
                              {[1, 2, 3, 4, 5].map((star) => (
                                <i key={`star-${activeAppointment.id}-${star}`} className="fas fa-star" style={{ fontSize: '0.8rem', opacity: star <= (hasReview.rating || 0) ? 1 : 0.2 }}></i>
                              ))}
                            </div>
                          </div>
                          <p style={{ color: '#cbd5e1', fontSize: '0.85rem', fontStyle: 'italic', margin: 0, lineHeight: '1.4' }}>
                            "{hasReview.comment || "Yorumsuz puanlandı"}"
                          </p>
                        </div>
                      ) : (
                        <button className="btn-cockpit-main btn-msg-blue" style={{ marginTop: 'auto' }} onClick={() => navigate('/customer-appointments?tab=completed', { state: { focusId: activeAppointment.id } })}>
                          Şimdi Değerlendir (İsteğe Bağlı)
                        </button>
                      )}
                    </motion.div>
                  );
                })}
              </div>
            </section>
          )}
        </div>
      </div>
    </>
  );
};

export default LiveServiceTracking;