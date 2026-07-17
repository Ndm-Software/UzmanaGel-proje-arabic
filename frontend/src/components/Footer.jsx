import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { doc, onSnapshot } from 'firebase/firestore';

import { db } from '../firebase/firebaseClient';

import brandImage from '../assets/pictures/LogoArabicNowriting.png';
import PolicyModal from './PolicyModal';
import LegalPolicyContent from './LegalPolicyContent';

// Mobil uygulama hazır olduğunda mağaza bağlantıları yeniden etkinleştirilebilir.
// import appleLogo from '../assets/pictures/apple-logo.png';
// import googlePlayLogo from '../assets/pictures/google-play.png';

const isDevelopment = import.meta.env.DEV;

function Footer() {
  const navigate = useNavigate();
  const [policyType, setPolicyType] = useState(null);
  const [siteSettings, setSiteSettings] = useState({
    contactEmail: 'info@uzmanagel.com',
    phone: '+90 555 123 4567',
    address: 'سوريا',
  });

  const closePolicyModal = () => {
    setPolicyType(null);
  };

  // Firestore'daki site ayarlarını gerçek zamanlı dinle.
  useEffect(() => {
    const settingsRef = doc(db, 'admin_settings', 'site');

    const unsubscribe = onSnapshot(
      settingsRef,
      (docSnap) => {
        if (!docSnap.exists()) {
          return;
        }

        const data = docSnap.data();

        setSiteSettings((previousSettings) => ({
          ...previousSettings,
          contactEmail:
            data.contactEmail || previousSettings.contactEmail,
          phone: data.phone || previousSettings.phone,
          address: data.address || previousSettings.address,
        }));
      },
      (error) => {
        // Güvenlik nedeniyle hata yalnızca geliştirme ortamında gösterilir.
        if (isDevelopment) {
          console.error('Footer ayarları dinlenirken hata:', error);
        }
      }
    );

    return () => {
      unsubscribe();
    };
  }, []);

  const scrollToSection = (sectionId) => {
    const element = document.getElementById(sectionId);

    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
      return;
    }

    navigate('/');

    window.setTimeout(() => {
      const targetElement = document.getElementById(sectionId);

      if (targetElement) {
        targetElement.scrollIntoView({ behavior: 'smooth' });
      }
    }, 300);
  };

  const formatPhone = (phone) => {
    if (!phone || typeof phone !== 'string') {
      return '';
    }

    const cleanedPhone = phone.replace(/\D/g, '');

    // Türkiye numarası: XXX XXX XX XX
    if (
      cleanedPhone.length === 12 &&
      cleanedPhone.startsWith('90')
    ) {
      const nationalNumber = cleanedPhone.slice(2);

      return [
        nationalNumber.slice(0, 3),
        nationalNumber.slice(3, 6),
        nationalNumber.slice(6, 8),
        nationalNumber.slice(8, 10),
      ].join(' ');
    }

    // Suriye numarası: XXX XXX XXX
    if (
      cleanedPhone.length === 12 &&
      cleanedPhone.startsWith('963')
    ) {
      const nationalNumber = cleanedPhone.slice(3);

      return [
        nationalNumber.slice(0, 3),
        nationalNumber.slice(3, 6),
        nationalNumber.slice(6, 9),
      ].join(' ');
    }

    return String(phone).replace(/[<>]/g, '');
  };

  const getPhoneHref = (phone) => {
    if (!phone || typeof phone !== 'string') {
      return '';
    }

    return phone.replace(/[^\d+]/g, '');
  };

  const rawAddress = String(siteSettings.address || '');
  const displayAddress = /türkiye|turkiye|istanbul/i.test(rawAddress)
    ? 'سوريا'
    : rawAddress;

  return (
    <>
      <section
        className="section-band section-band--gradient"
        id="footer"
      >
        <footer className="footer">
          <div className="footer-container">
            <div className="footer-brand">
              <div className="footer-brand-row">
                <span
                  className="footer-brand-badge"
                  aria-hidden="true"
                >
                  <img src={brandImage} alt="" />
                </span>

                <span className="footer-brand-title">خبير</span>
              </div>

              <p className="footer-desc">
                خبيرك المناسب لكل خدمة، وحل أسرع لكل مشكلة.
              </p>

              {/*
                Google Play ve App Store bağlantıları mobil uygulama
                yayımlandığında bu alanda yeniden etkinleştirilecek.
              */}
            </div>

            <div className="footer-columns">
              <div className="footer-column">
                <h4 className="footer-title">روابط سريعة</h4>

                <Link className="footer-link" to="/">
                  الرئيسية
                </Link>

                <button
                  className="footer-link footer-link-button"
                  type="button"
                  onClick={() => scrollToSection('how-it-works')}
                >
                  كيف يعمل؟
                </button>

                <Link className="footer-link" to="/faq">
                  الأسئلة الشائعة
                </Link>
              </div>

              <div className="footer-column">
                <h4 className="footer-title">
                  شروط الاستخدام وسياسة الخصوصية
                </h4>

                <button
                  className="footer-link footer-link-button"
                  type="button"
                  onClick={() => setPolicyType('terms')}
                >
                  شروط الاستخدام
                </button>

                <button
                  className="footer-link footer-link-button"
                  type="button"
                  onClick={() => setPolicyType('privacy')}
                >
                  سياسة الخصوصية
                </button>
              </div>

              <div className="footer-column">
                <h4 className="footer-title">التواصل</h4>

                <div className="footer-contact">
                  <div className="footer-contact-row">
                    <span
                      className="footer-contact-icon"
                      aria-hidden="true"
                    >
                      ✉
                    </span>

                    <a
                      className="footer-link"
                      href={`mailto:${siteSettings.contactEmail}`}
                    >
                      {siteSettings.contactEmail}
                    </a>
                  </div>

                  <div className="footer-contact-row">
                    <span
                      className="footer-contact-icon"
                      aria-hidden="true"
                    >
                      ☎
                    </span>

                    <a
                      className="footer-link footer-phone-number"
                      href={`tel:${getPhoneHref(siteSettings.phone)}`}
                      dir="ltr"
                    >
                      <bdi>{formatPhone(siteSettings.phone)}</bdi>
                    </a>
                  </div>

                  <div className="footer-contact-row">
                    <span
                      className="footer-contact-icon"
                      aria-hidden="true"
                    >
                      📍
                    </span>

                    <span className="footer-muted">
                      {displayAddress}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="footer-bottom">
            <span>Developed By NDM Software</span>
            <span>Khabiir, all rights reserved © 2026</span>
          </div>
        </footer>
      </section>

      <PolicyModal
        open={Boolean(policyType)}
        title={
          policyType === 'privacy'
            ? 'سياسة الخصوصية'
            : 'شروط الاستخدام'
        }
        onClose={closePolicyModal}
      >
        <LegalPolicyContent type={policyType || 'terms'} />
      </PolicyModal>
    </>
  );
}

export default Footer;
