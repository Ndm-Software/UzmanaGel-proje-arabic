import React, { useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../firebase/firebaseClient';
import { onAuthStateChanged } from 'firebase/auth';
import DOMPurify from 'dompurify';

const isDevelopment = process.env.NODE_ENV === 'development';

const sanitizeText = (text) => {
  if (!text) return '';
  return DOMPurify.sanitize(String(text));
};

const PenaltyBanner = () => {
  const [timeLeft, setTimeLeft] = useState("");
  const [isVisible, setIsVisible] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (user) {
        const userRef = doc(db, 'users', user.uid);
        const unsubscribeDoc = onSnapshot(userRef, (docSnap) => {
          if (docSnap.exists()) {
            const data = docSnap.data();
            if (data.penaltyEndDate) {
              const endDate = data.penaltyEndDate.toDate();
              startTimer(endDate);
            } else {
              setIsVisible(false);
            }
          }
        });
        return () => unsubscribeDoc();
      } else {
        setIsVisible(false);
      }
    });
    return () => unsubscribeAuth();
  }, []);

  const startTimer = (endDate) => {
    const interval = setInterval(() => {
      const now = new Date();
      const diff = endDate - now;

      if (diff <= 0) {
        setIsVisible(false);
        clearInterval(interval);
      } else {
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);
        setTimeLeft(`${hours}س ${minutes}د ${seconds}ث`);
        setIsVisible(true);
      }
    }, 1000);
    return () => clearInterval(interval);
  };

  if (!isVisible) return null;

  return (
    <>
      <div style={{
        background: 'linear-gradient(90deg, #0f172a 0%, #450a0a 50%, #0f172a 100%)',
        borderBottom: '3px solid #ef4444',
        padding: '0 40px',
        height: '90px',
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
        position: 'relative',
        zIndex: 999
      }}>
        
        <div style={{ 
          background: '#ef4444', 
          padding: '8px 16px', 
          borderRadius: '4px', 
          fontSize: '13px', 
          fontWeight: '900', 
          color: '#fff',
          boxShadow: '0 0 15px rgba(239, 68, 68, 0.3)',
          whiteSpace: 'nowrap'
        }}>
          تم تقييد حسابك مؤقتاً
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '5px' }}>
          <span style={{ color: '#eceff2', fontSize: '15px', fontWeight: '600', textAlign: 'center' }}>
            الوقت المتبقي حتى انتهاء التقييد وإعادة تفعيل إنشاء المواعيد
          </span>
          
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {timeLeft.split(' ').map((unit, index) => (
              <div key={index} style={{ 
                height: '50px', 
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'linear-gradient(180deg, rgba(239, 68, 68, 0.1) 0%, rgba(239, 68, 68, 0.2) 100%)', 
                border: '2px double #ef4444', 
                padding: '0 15px', 
                borderRadius: '8px', 
                color: '#fff', 
                fontSize: '28px', 
                fontWeight: '900',
                fontFamily: '"JetBrains Mono", monospace',
                textShadow: '0 0 10px rgba(239, 68, 68, 0.5)'
              }}>
                {sanitizeText(unit)}
              </div>
            ))}
          </div>
        </div>

        <button 
          onClick={() => setShowDetailModal(true)}
          style={{
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.1)',
            padding: '10px 15px',
            borderRadius: '6px',
            color: '#60a5fa',
            fontSize: '13px',
            cursor: 'pointer',
            fontWeight: '600',
            whiteSpace: 'nowrap',
            transition: 'all 0.3s ease'
          }}
          onMouseEnter={(e) => {
            e.target.style.background = 'rgba(96, 165, 250, 0.1)';
            e.target.style.borderColor = '#60a5fa';
          }}
          onMouseLeave={(e) => {
            e.target.style.background = 'rgba(255,255,255,0.05)';
            e.target.style.borderColor = 'rgba(255,255,255,0.1)';
          }}
        >
          <i className="fas fa-info-circle" style={{ marginRight: '8px' }}></i>
          لماذا تم تقييدي؟ ماذا يجب أن أفعل؟
        </button>
      </div>

      {showDetailModal && (
        <div className="detail-overlay" style={{ zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setShowDetailModal(false)}>
          <div className="confirm-modal-content" style={{ maxWidth: '480px', padding: '35px' }} onClick={(e) => e.stopPropagation()}>
            
            <div style={{ marginBottom: '20px' }}>
              <div style={{ background: 'rgba(239, 68, 68, 0.1)', width: '80px', height: '80px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto', border: '1px solid rgba(239, 68, 68, 0.15)' }}>
                <i className="fas fa-shield-alt" style={{ color: '#ef4444', fontSize: '36px' }}></i>
              </div>
            </div>

            <h2 style={{ color: '#a73838', marginBottom: '15px', fontSize: '26px', fontWeight: '700' }}>معلومات التقييد</h2>
            
            <p style={{ color: '#94a3b8', fontSize: '15px', marginBottom: '25px', lineHeight: '1.6', textAlign: 'center' }}>
              تم تقييد حسابك وفق قواعد النظام بسبب إلغاء موعد في اللحظات الأخيرة.
            </p>

            <div style={{ background: 'rgba(15, 23, 42, 0.7)', padding: '20px', borderRadius: '12px', textAlign: 'left', border: '1px solid rgba(255,255,255,0.05)' }}>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                <li style={{ marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '12px', fontSize: '14.5px', color: '#e2e8f0' }}>
                  <span style={{ color: '#4ade80', fontSize: '12px' }}>●</span> <strong>عند الإلغاء قبل الموعد بأكثر من 24 ساعة:</strong> لا يتم تطبيق أي عقوبة.
                </li>
                <li style={{ marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '12px', fontSize: '14.5px', color: '#e2e8f0' }}>
                  <span style={{ color: '#fbbf24', fontSize: '12px' }}>●</span> <strong>عند الإلغاء بين آخر 24 ساعة وساعتين قبل الموعد:</strong> يتم تطبيق تقييد لمدة 24 ساعة.
                </li>
                <li style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '14.5px', color: '#e2e8f0' }}>
                  <span style={{ color: '#ef4444', fontSize: '12px' }}>●</span> <strong>عند الإلغاء خلال آخر ساعتين قبل الموعد:</strong> يتم تطبيق تقييد لمدة 3 أيام بسبب تضرر الخبير.
                </li>
              </ul>
            </div>

            <div style={{ marginTop: '20px', textAlign: 'left' }}>
              <h4 style={{ color: '#a73838', marginBottom: '8px', fontSize: '16px', fontWeight: '600' }}>
                ماذا يجب أن أفعل الآن؟
              </h4>
              <p style={{ color: '#94a3b8', fontSize: '14px', lineHeight: '1.5' }}>
                لا يمكنك إنشاء موعد جديد حالياً، لكن يمكنك عرض مواعيدك الحالية ومتابعة المحادثة مع الخبراء. عند انتهاء مدة التقييد ستُفتح الميزات تلقائياً.
              </p>
            </div>

            <div className="confirm-modal-actions" style={{ marginTop: '30px' }}>
              <button 
                className="confirm-btn-cancel" 
                style={{ width: '100%', padding: '12px', borderRadius: '8px', background: 'rgba(255,255,255,0.08)', color: '#a73838', fontWeight: '600', fontSize: '15px', transition: 'all 0.2s' }} 
                onClick={() => setShowDetailModal(false)}
                onMouseEnter={(e) => e.target.style.background = 'rgba(255,255,255,0.12)'}
                onMouseLeave={(e) => e.target.style.background = 'rgba(255,255,255,0.08)'}
              >
                فهمت
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default PenaltyBanner;
