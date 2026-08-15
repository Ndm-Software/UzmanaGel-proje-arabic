import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import '../styles/PwaInstallButton.css';

const PwaInstallButton = () => {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    // Listen for Chrome / Android beforeinstallprompt event
    const handleBeforeInstallPrompt = (e) => {
      // Prevent standard mini-infobar from appearing on mobile
      e.preventDefault();
      // Save event so it can be triggered later
      setDeferredPrompt(e);
    };

    // Listen for app installed event
    const handleAppInstalled = () => {
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      // Show the browser install prompt
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        console.log('User accepted the PWA install prompt');
        setDeferredPrompt(null);
      }
    } else {
      // Show custom styled modal instead of standard browser alert
      setShowModal(true);
    }
  };

  const modalElement = showModal ? (
    <div className="pwa-modal-overlay" onClick={() => setShowModal(false)}>
      <div className="pwa-modal-content" onClick={(e) => e.stopPropagation()}>
        <button className="pwa-modal-close" onClick={() => setShowModal(false)}>
          <i className="fa-solid fa-xmark"></i>
        </button>

        <div className="pwa-modal-header">
          <div className="pwa-modal-icon">
            <i className="fa-solid fa-mobile-screen-button"></i>
          </div>
          <h3>تثبيت تطبيق خبير</h3>
        </div>

        <div className="pwa-modal-body">
          <div className="pwa-step-item">
            <div className="pwa-step-icon">
              <i className="fa-brands fa-chrome"></i>
            </div>
            <div className="pwa-step-text">
              <strong>متصفح الكمبيوتر <span dir="ltr">(Chrome / Edge)</span>:</strong>
              <p>انقر على أيقونة التثبيت <span className="highlight-badge">➕</span> في أعلى شريط العنوان، أو اختر <strong>"تثبيت التطبيق"</strong> من قائمة المتصفح.</p>
            </div>
          </div>

          <div className="pwa-step-item">
            <div className="pwa-step-icon">
              <i className="fa-brands fa-apple"></i>
            </div>
            <div className="pwa-step-text">
              <strong>أجهزة آيفون / أيباد <span dir="ltr">(Safari)</span>:</strong>
              <p>انقر على زر المشاركة <span className="highlight-badge">⎘</span> ثم اختر <strong>"إضافة إلى الشاشة الرئيسية"</strong>.</p>
            </div>
          </div>
        </div>

        <div className="pwa-modal-footer">
          <button className="pwa-modal-btn-confirm" onClick={() => setShowModal(false)}>
            حسناً، فهمت
          </button>
        </div>
      </div>
    </div>
  ) : null;

  return (
    <>
      <button
        type="button"
        className="pwa-install-btn"
        onClick={handleInstallClick}
        title="تحميل تطبيق خبير"
      >
        <i className="fa-solid fa-download" aria-hidden="true"></i>
        <span>تحميل التطبيق</span>
      </button>

      {showModal && ReactDOM.createPortal(modalElement, document.body)}
    </>
  );
};

export default PwaInstallButton;

