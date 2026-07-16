import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase/firebaseClient';

import brandImage from '../assets/pictures/LogoArabicNowriting.png';
import PolicyModal from './PolicyModal';
import LegalPolicyContent from './LegalPolicyContent';
// Syria Arabic launch: store download buttons are disabled, assets kept for future use.
// import appleLogo from '../assets/pictures/apple-logo.png';
// import googlePlayLogo from '../assets/pictures/google-play.png';

const isDevelopment = process.env.NODE_ENV === 'development';

function Footer() {
  const navigate = useNavigate();
  const [policyType, setPolicyType] = useState(null);
  
  const [siteSettings, setSiteSettings] = useState({
    contactEmail: 'info@uzmanagel.com',
    phone: '+90 555 123 4567',
    address: 'سوريا',
  });

  // Site ayarlarını Firestore'dan gerçek zamanlı dinle
  useEffect(() => {
    const settingsRef = doc(db, 'admin_settings', 'site');
    
    const unsubscribe = onSnapshot(settingsRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setSiteSettings(prev => ({
          ...prev,
          contactEmail: data.contactEmail || prev.contactEmail,
          phone: data.phone || prev.phone,
          address: data.address || prev.address,
        }));
      }
    }, (error) => {
      // ✅ GÜVENLİK: Sadece development ortamında hata logla
      if (isDevelopment) {
        console.error('Footer ayarları dinlenirken hata:', error);
      }
    });

    return () => unsubscribe();
  }, []);

  const scrollToSection = (sectionId) => {
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    } else {
      navigate('/');
      setTimeout(() => {
        const el = document.getElementById(sectionId);
        if (el) el.scrollIntoView({ behavior: 'smooth' });
      }, 300);
    }
  };

  // Telefon numarasını formatla - XSS koruması için sanitize eklendi
  const formatPhone = (phone) => {
    if (!phone || typeof phone !== 'string') return '';
    
    // Sadece rakamları al
    const cleaned = phone.replace(/\D/g, '');
    
    if (cleaned.length === 12 && cleaned.startsWith('90')) {
      const national = cleaned.slice(2);
      if (national.length === 10) {
        return `${national.slice(0, 3)} ${national.slice(3, 6)} ${national.slice(6, 8)} ${national.slice(8, 10)}`;
      }
    }
    // XSS koruması için temizle
    return String(phone).replace(/[<>]/g, '');
  };

  const displayAddress = /türkiye|turkiye|istanbul/i.test(String(siteSettings.address || ''))
    ? 'سوريا'
    : siteSettings.address;

  return (
    <>
    <section className="section-band section-band--gradient" id="footer">
      <footer className="footer">
        <div className="footer-container">
          <div className="footer-brand">
            <div className="footer-brand-row">
              <span className="footer-brand-badge" aria-hidden="true">
                <img src={brandImage} alt="شعار خبير" />
              </span>
              <span className="footer-brand-title">
                خبير
              </span>
            </div>

            <p className="footer-desc">
              خبيرك المناسب لكل خدمة، وحل أسرع لكل مشكلة.
            </p>

            {/* Syria Arabic launch: Google Play / App Store footer links disabled by request.
            <div className="store-buttons" style={{ display: 'flex', flexWrap: 'wrap', gap: '14px', marginTop: '18px' }}>
              <a
                className="store-button"
                href="#"
                aria-label="Google Play"
                rel="noopener noreferrer"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: 0,
                  borderRadius: 0,
                  textDecoration: 'none',
                  background: 'transparent',
                  border: 'none',
                  minWidth: 'unset',
                  transition: 'all 0.25s ease',
                  boxShadow: 'none',
                }}
              >
                <span className="store-icon" aria-hidden="true" style={{ width: '32px', height: '32px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, background: 'transparent', border: 'none', boxShadow: 'none', borderRadius: 0, padding: 0 }}>
                  <img src={googlePlayLogo} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block', background: 'transparent', border: 'none', boxShadow: 'none' }} />
                </span>
                <span className="store-text" style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.12 }}>
                  <small style={{ color: isLightMode ? '#64748b' : 'rgba(255,255,255,0.68)', fontSize: '11px' }}>احصل عليه من</small>
                  <b style={{ color: isLightMode ? '#0f172a' : '#ffffff', fontSize: '15px', fontWeight: 700 }}>Google Play</b>
                </span>
              </a>

              <a
                className="store-button"
                href="#"
                aria-label="App Store"
                rel="noopener noreferrer"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: 0,
                  borderRadius: 0,
                  textDecoration: 'none',
                  background: 'transparent',
                  border: 'none',
                  minWidth: 'unset',
                  transition: 'all 0.25s ease',
                  boxShadow: 'none',
                }}
              >
                <span className="store-icon" aria-hidden="true" style={{ width: '32px', height: '32px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, background: 'transparent', border: 'none', boxShadow: 'none', borderRadius: 0, padding: 0 }}>
                  <img src={appleLogo} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block', background: 'transparent', border: 'none', boxShadow: 'none', filter: isLightMode ? 'none' : 'invert(1) brightness(1.15)' }} />
                </span>
                <span className="store-text" style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.12 }}>
                  <small style={{ color: isLightMode ? '#64748b' : 'rgba(255,255,255,0.68)', fontSize: '11px' }}>حمّله من</small>
                  <b style={{ color: isLightMode ? '#0f172a' : '#ffffff', fontSize: '15px', fontWeight: 700 }}>App Store</b>
                </span>
              </a>
            </div>
            */}
          </div>

          <div className="footer-columns">
            <div className="footer-column">
              <h4 className="footer-title">روابط سريعة</h4>
              <Link className="footer-link" to="/">الرئيسية</Link>
              <button
                className="footer-link"
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, textAlign: 'left', color: 'inherit', font: 'inherit' , fontSize: '13px' }}
                onClick={() => scrollToSection('how-it-works')}
              >
                كيف يعمل؟
              </button>
              <Link className="footer-link" to="/faq">الأسئلة الشائعة</Link>
            </div>

            <div className="footer-column">
              <h4 className="footer-title">شروط الاستخدام وسياسة الخصوصية</h4>
              <button className="footer-link footer-link-button" type="button" onClick={() => setPolicyType('terms')}>
                شروط الاستخدام
              </button>
              <button className="footer-link footer-link-button" type="button" onClick={() => setPolicyType('privacy')}>
                سياسة الخصوصية
              </button>
            </div>

            <div className="footer-column">
              <h4 className="footer-title">التواصل</h4>

              <div className="footer-contact">
                <div className="footer-contact-row">
                  <span className="footer-contact-icon" aria-hidden="true">✉</span>
                  <a className="footer-link" href={`mailto:${siteSettings.contactEmail}`}>
                    {siteSettings.contactEmail}
                  </a>
                </div>

                <div className="footer-contact-row">
                  <span className="footer-contact-icon" aria-hidden="true">☎</span>

                  <a
                    className="footer-link footer-phone-number"
                    href={`tel:${siteSettings.phone.replace(/\s/g, '')}`}
                    dir="ltr"
                  >
                    <bdi>{formatPhone(siteSettings.phone)}</bdi>
                  </a>
                </div>

                <div className="footer-contact-row">
                  <span className="footer-contact-icon" aria-hidden="true">📍</span>
                  <span className="footer-muted">{displayAddress}</span>
                </div>
              </div>

              <div className="social-buttons">
                <a className="social-button" href="#" aria-label="Facebook" rel="noopener noreferrer" target="_blank">f</a>
                <a className="social-button" href="#" aria-label="Twitter" rel="noopener noreferrer" target="_blank">𝕏</a>
                <a className="social-button" href="#" aria-label="Instagram" rel="noopener noreferrer" target="_blank">◎</a>
                <a className="social-button" href="#" aria-label="LinkedIn" rel="noopener noreferrer" target="_blank">in</a>
              </div>
            </div>
          </div>
        </div>

        <div className="footer-bottom">
          <span>Developed By NDM Software</span>
          <span>© 2026 Khabiir, all rights reserved.</span>
        </div>
      </footer>
    </section>
    <PolicyModal
      open={Boolean(policyType)}
      title={policyType === 'privacy' ? 'سياسة الخصوصية' : 'شروط الاستخدام'}
      onClose={() => setPolicyType(null)}
    >
      <LegalPolicyContent type={policyType || 'terms'} />
    </PolicyModal>
    </>
  );
}

export default Footer;
