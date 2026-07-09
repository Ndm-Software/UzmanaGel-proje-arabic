import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase/firebaseClient';

import brandImage from '../assets/pictures/Logo.png';
import appleLogo from '../assets/pictures/apple-logo.png';
import googlePlayLogo from '../assets/pictures/google-play.png';

const isDevelopment = process.env.NODE_ENV === 'development';

function Footer() {
  const navigate = useNavigate();
  const [isLightMode, setIsLightMode] = useState(false);
  
  const [siteSettings, setSiteSettings] = useState({
    contactEmail: 'info@uzmanagel.com',
    phone: '+90 555 123 4567',
    address: 'İstanbul, Türkiye',
  });

  useEffect(() => {
    const updateThemeState = () => {
      const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
      setIsLightMode(currentTheme === 'light');
    };

    updateThemeState();

    const observer = new MutationObserver(() => {
      updateThemeState();
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });

    return () => observer.disconnect();
  }, []);

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

  return (
    <section className="section-band section-band--gradient" id="footer">
      <footer className="footer">
        <div className="footer-container">
          <div className="footer-brand">
            <div className="footer-brand-row">
              <span className="footer-brand-badge" aria-hidden="true">
                <img src={brandImage} alt="UzmanaGel Logo" />
              </span>
              <span className="footer-brand-title">
                Uzmana<span className="highlight">Gel</span>
              </span>
            </div>

            <p className="footer-desc">
              Her işin ustası, her sorunun çözümü burada!
            </p>

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
                  <small style={{ color: isLightMode ? '#64748b' : 'rgba(255,255,255,0.68)', fontSize: '11px' }}>Get it on</small>
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
                  <small style={{ color: isLightMode ? '#64748b' : 'rgba(255,255,255,0.68)', fontSize: '11px' }}>Download on the</small>
                  <b style={{ color: isLightMode ? '#0f172a' : '#ffffff', fontSize: '15px', fontWeight: 700 }}>App Store</b>
                </span>
              </a>
            </div>
          </div>

          <div className="footer-columns">
            <div className="footer-column">
              <h4 className="footer-title">Hızlı Linkler</h4>
              <Link className="footer-link" to="/">Ana Sayfa</Link>
              <button
                className="footer-link"
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, textAlign: 'left' }}
                onClick={() => scrollToSection('how-it-works')}
              >
                Nasıl Çalışır?
              </button>
              <span className="footer-link" style={{ opacity: 0.4, cursor: 'not-allowed' }}>Sıkça Sorulan Sorular</span>
              <span className="footer-link" style={{ opacity: 0.4, cursor: 'not-allowed' }}>Blog</span>
            </div>

            <div className="footer-column">
              <h4 className="footer-title">Yasal</h4>
              <a className="footer-link" href="#" rel="noopener noreferrer">Kullanım Koşulları</a>
              <a className="footer-link" href="#" rel="noopener noreferrer">Gizlilik Politikası</a>
              <a className="footer-link" href="#" rel="noopener noreferrer">Çerez Politikası</a>
              <Link className="footer-link" to="/kvkk">KVKK</Link>
            </div>

            <div className="footer-column">
              <h4 className="footer-title">İletişim</h4>

              <div className="footer-contact">
                <div className="footer-contact-row">
                  <span className="footer-contact-icon" aria-hidden="true">✉</span>
                  <a className="footer-link" href={`mailto:${siteSettings.contactEmail}`}>
                    {siteSettings.contactEmail}
                  </a>
                </div>

                <div className="footer-contact-row">
                  <span className="footer-contact-icon" aria-hidden="true">☎</span>
                  <a className="footer-link" href={`tel:${siteSettings.phone.replace(/\s/g, '')}`}>
                    {formatPhone(siteSettings.phone)}
                  </a>
                </div>

                <div className="footer-contact-row">
                  <span className="footer-contact-icon" aria-hidden="true">📍</span>
                  <span className="footer-muted">{siteSettings.address}</span>
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
          <span>© {new Date().getFullYear()} UzmanaGel. Tüm hakları saklıdır.</span>
        </div>
      </footer>
    </section>
  );
}

export default Footer;