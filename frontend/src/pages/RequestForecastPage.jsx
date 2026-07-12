import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db, auth } from '../firebase/firebaseClient';
import Navbar from '../components/Navbar';
import { motion } from 'framer-motion';
import { showAppToast } from '../utils/showAppToast';
import '../styles/RequestForecastPage.css';

const getMins = (timeStr) => {
  if (!timeStr) return 0;
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
};

const formatTime = (totalMins) => {
  const h = Math.floor(totalMins / 60) % 24;
  const m = Math.floor(totalMins % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

const RequestForecastPage = () => {
  const { date, id } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [targetApp, setTargetApp] = useState(null);
  const [prevApp, setPrevApp] = useState(null);
  const [nextApp, setNextApp] = useState(null);

  const [inputDuration, setInputDuration] = useState(30);
  const [appliedDuration, setAppliedDuration] = useState(30);

  const [simData, setSimData] = useState({
    prevRoute: null,
    nextRoute: null,
  });

  useEffect(() => {
    const unsubscribeAuth = auth.onAuthStateChanged((user) => {
      if (user) {
        const q = query(
          collection(db, 'appointments'),
          where('expertId', '==', user.uid),
          where('date', '==', date)
        );

        onSnapshot(q, (snapshot) => {
          const apps = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
          const target = apps.find(a => a.id === id);
          
          if (target) {
            setTargetApp(target);
            const validApps = apps.filter(a => (a.status === 'approved' || a.createdBy === 'expert') && a.id !== id);
            validApps.sort((a, b) => getMins(a.start) - getMins(b.start));

            const targetStartMins = getMins(target.start);
            let previous = null;
            let next = null;

            for (let i = 0; i < validApps.length; i++) {
              if (getMins(validApps[i].start) < targetStartMins) {
                previous = validApps[i];
              } else if (getMins(validApps[i].start) > targetStartMins && !next) {
                next = validApps[i];
              }
            }
            setPrevApp(previous);
            setNextApp(next);
            setLoading(false);
          }
        });
      }
    });
    return () => unsubscribeAuth();
  }, [date, id]);

  useEffect(() => {
    if (loading || !targetApp) return;

    const calculateRoutes = async () => {
      let tempPrevRoute = null;
      let tempNextRoute = null;
      

      const fetchRoute = async (p1, p2) => {
        if (!p1.lat || !p1.lng || !p2.lat || !p2.lng) return { distance: 5, duration: 15 };
        try {
          const url = `https://router.project-osrm.org/route/v1/driving/${p1.lng},${p1.lat};${p2.lng},${p2.lat}?overview=false`;
          const response = await fetch(url);
          const data = await response.json();
          if (data.code === 'Ok') {
            return {
              distance: data.routes[0].distance / 1000,
              duration: Math.ceil(data.routes[0].duration / 60)
            };
          }
        } catch (error) { console.error("OSRM Error:", error); }
        return { distance: 5, duration: 15 };
      };

      if (prevApp) {
        const route = await fetchRoute(prevApp, targetApp);
        const prevEndMins = getMins(prevApp.end);
        const arrivalMins = prevEndMins + route.duration;
        const targetStartMins = getMins(targetApp.start);
        tempPrevRoute = { ...route, arrivalTime: formatTime(arrivalMins), isLate: arrivalMins > targetStartMins, lateMins: arrivalMins > targetStartMins ? arrivalMins - targetStartMins : 0 };
      }

      if (nextApp) {
        const route = await fetchRoute(targetApp, nextApp);
        const targetStartMins = getMins(targetApp.start);
        const targetEndMins = targetStartMins + parseInt(appliedDuration);
        const arrivalMins = targetEndMins + route.duration;
        const nextStartMins = getMins(nextApp.start);
        tempNextRoute = { ...route, arrivalTime: formatTime(arrivalMins), isLate: arrivalMins > nextStartMins, lateMins: arrivalMins > nextStartMins ? arrivalMins - nextStartMins : 0 };
      }

      setSimData({
        prevRoute: tempPrevRoute,
        nextRoute: tempNextRoute
      });

    };

    calculateRoutes();
  }, [targetApp, prevApp, nextApp, appliedDuration, loading]);

  const handleCalculate = () => {
    if (inputDuration < 5) {
      showAppToast("İşlem süresi en az 5 dakika olmalıdır.", "error");
      return;
    }
    setAppliedDuration(inputDuration);
  };

  if (loading) return <div className="forecast-loading">Yapay Zeka Rota Simülasyonu Yükleniyor... 🧠🚗</div>;

  return (
    <div className="forecast-page-wrapper">
      <Navbar />
      
      <main className="forecast-main">
        
        <div className="forecast-header">
          <button onClick={() => navigate(-1)} className="forecast-back-btn">
            <i className="fas fa-arrow-left"></i> Randevuya Geri Dön
          </button>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.8rem' }}>Akıllı Rota ve Öngörü Merkezi</h1>
            <p className="forecast-subtitle">İşlem süresini girin ve hesapla butonuna basarak lojistik analizi görün.</p>
          </div>
        </div>

        <div className="forecast-control-panel">
          <div className="fc-time-box">
            <span className="fc-label">Başlangıç Saati</span>
            <span className="fc-value-start">{targetApp.start}</span>
          </div>

          <div className="fc-input-area">
            <span className="fc-label">Tahmini İşlem Süresi (Dakika)</span>
            <div className="fc-input-group">
              <input 
                type="number" 
                className="fc-input"
                value={inputDuration}
                onChange={(e) => setInputDuration(e.target.value)}
                min="5" max="480"
              />
              <button className="fc-calc-btn" onClick={handleCalculate}>
                <i className="fas fa-sync-alt"></i> Hesapla
              </button>
            </div>
          </div>

          <div className="fc-time-box">
            <span className="fc-label">Hedef İşlem Bitişi</span>
            <span className="fc-value-end">
              {formatTime(getMins(targetApp.start) + parseInt(appliedDuration))}
            </span>
          </div>
        </div>

        {prevApp && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="forecast-scenario-row">
            <div className="fc-card">
              <h4 className="fc-card-header">Önceki Müşteri</h4>
              <h3 className="fc-card-name">{prevApp.client}</h3>
              <p className="fc-card-time"><i className="fas fa-clock"></i> {prevApp.start} - {prevApp.end}</p>
              <p className="fc-card-dist"><i className="fas fa-map-marker-alt"></i> {prevApp.district} / {prevApp.neighborhood}</p>
            </div>

            {simData.prevRoute && (
              <div className="fc-arrow-container">
                <div className={`fc-arrow-line ${simData.prevRoute.isLate ? 'danger' : 'safe'}`}>
                  <div className="fc-arrow-badge">
                    <div className="fc-badge-label">Tahmini Yolculuk Süresi</div>
                    <div className="fc-badge-value">
                      {Math.max(0, simData.prevRoute.duration - 10)} - {simData.prevRoute.duration + 10} dakika arası
                    </div>
                  </div>
                </div>
                
                {simData.prevRoute.isLate ? (
                  <div className="fc-warning-box danger">
                    <strong><i className="fas fa-exclamation-triangle"></i> Geç Kalma Riski!</strong>
                    <p style={{margin: '8px 0 0 0'}}>
                      {prevApp.client} isimli müşteriden {prevApp.end} saatinde çıktığınızda yolculuğun {simData.prevRoute.duration} dakika sürmesi ve tahmini {simData.prevRoute.arrivalTime} saatinde hedefe varmanız öngörülmekte. Fakat yeni müşterinizin randevusu {targetApp.start} saatinde başlamakta. 
                      <br/><br/><span className="fc-danger-text">Yaklaşık {simData.prevRoute.lateMins} dakika GEÇ KALACAKSINIZ.</span>
                    </p>
                  </div>
                ) : (
                  <div className="fc-warning-box safe">
                    <strong><i className="fas fa-check-circle"></i> Güvenli Zamanlama</strong>
                    <p style={{margin: '8px 0 0 0'}}>Tahmini varış: {simData.prevRoute.arrivalTime}. Rahatça yetişebiliyorsunuz.</p>
                  </div>
                )}

                <div className={`fc-arrow-line ${simData.prevRoute.isLate ? 'danger' : 'safe'}`} style={{ marginTop: '15px' }}>
                  <div className="fc-arrow-badge">
                    <div className="fc-badge-label">Tahmini Uzaklık Mesafesi</div>
                    <div className="fc-badge-value">
                      {Math.max(0, simData.prevRoute.distance - 10).toFixed(1)} Km - {(simData.prevRoute.distance + 10).toFixed(1)} Km arası
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="fc-card target">
              <h4 className="fc-card-header"><i className="fas fa-star pulse-preview"></i> İNCELENEN TALEP</h4>
              <h3 className="fc-card-name">{targetApp.client}</h3>
              <p className="fc-card-time"><i className="fas fa-clock"></i> Başlangıç: {targetApp.start}</p>
              <p className="fc-card-dist"><i className="fas fa-map-marker-alt"></i> {targetApp.district} / {targetApp.neighborhood}</p>
            </div>
          </motion.div>
        )}

        {nextApp && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="forecast-scenario-row">
            <div className="fc-card target">
              <h4 className="fc-card-header"><i className="fas fa-star pulse-preview"></i> İNCELENEN TALEP</h4>
              <h3 className="fc-card-name">{targetApp.client}</h3>
              <p className="fc-card-time"><i className="fas fa-clock"></i> Başlangıç: {targetApp.start}</p>
              <p className="fc-card-dist"><i className="fas fa-map-marker-alt"></i> {targetApp.district} / {targetApp.neighborhood}</p>
            </div>

            {nextApp && simData.nextRoute && (
              <div className="fc-arrow-container">
                <div className={`fc-arrow-line ${simData.nextRoute.isLate ? 'danger' : 'safe'}`}>
                  <div className="fc-arrow-badge">
                    <div className="fc-badge-label">Tahmini Yolculuk Süresi</div>
                    <div className="fc-badge-value">
                      {Math.max(0, simData.nextRoute.duration - 10)} - {simData.nextRoute.duration + 10} dakika arası
                    </div>
                  </div>
                </div>
                
                {simData.nextRoute.isLate ? (
                  <div className="fc-warning-box danger">
                    <strong><i className="fas fa-exclamation-triangle"></i> Sonraki İş İçin Risk!</strong>
                    <p style={{margin: '8px 0 0 0'}}>
                      {targetApp.client} isimli müşteriden {formatTime(getMins(targetApp.start) + parseInt(appliedDuration))} saatinde çıktığınızda yolculuğun {simData.nextRoute.duration} dakika sürmesi ve tahmini {simData.nextRoute.arrivalTime} saatinde hedefe varmanız öngörülmekte.
                      <br/><br/><span className="fc-danger-text">Sonraki randevunuza {simData.nextRoute.lateMins} dakika GEÇ KALACAKSINIZ.</span>
                    </p>
                  </div>
                ) : (
                  <div className="fc-warning-box safe">
                    <strong><i className="fas fa-check-circle"></i> Güvenli Zamanlama</strong>
                    <p style={{margin: '8px 0 0 0'}}>Tahmini varış: {simData.nextRoute.arrivalTime}. Sonraki işe rahatça yetişebiliyorsunuz.</p>
                  </div>
                )}

                <div className={`fc-arrow-line ${simData.nextRoute.isLate ? 'danger' : 'safe'}`}>
                  <div className="fc-arrow-badge">
                    <div className="fc-badge-label">Tahmini Uzaklık Mesafesi</div>
                    <div className="fc-badge-value">
                      {Math.max(0, simData.nextRoute.distance - 10).toFixed(1)} Km - {(simData.nextRoute.distance + 10).toFixed(1)} Km arası
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="fc-card">
              <h4 className="fc-card-header">Sonraki Müşteri</h4>
              <h3 className="fc-card-name">{nextApp.client}</h3>
              <p className="fc-card-time"><i className="fas fa-clock"></i> {nextApp.start} - {nextApp.end}</p>
              <p className="fc-card-dist"><i className="fas fa-map-marker-alt"></i> {nextApp.district} / {nextApp.neighborhood}</p>
            </div>
          </motion.div>
        )}

        {!prevApp && !nextApp && (
          <div className="forecast-empty-state">
            <i className="fas fa-calendar-check" style={{fontSize: '3rem', color: '#10b981', marginBottom: '15px'}}></i>
            <h3>Gününüz Müsait</h3>
            <p className="forecast-empty-text">لا يوجد موعد آخر قد يتعارض قبل هذا الموعد أو بعده.</p>
          </div>
        )}

      </main>
    </div>
  );
};

export default RequestForecastPage;
