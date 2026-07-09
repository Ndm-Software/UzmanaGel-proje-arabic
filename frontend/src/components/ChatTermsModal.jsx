// ChatTermsModal.jsx file code

import React from "react";
import "../styles/ChatTermsModal.css";

const chatRules = [
  {
    icon: "fa-ban",
    title: "Yasaklı kelimeler ve uygunsuz ifadeler",
    text: "Küfür, hakaret, tehdit, aşağılayıcı ifadeler, romantik veya aşk içerikli mesajlar ve rahatsız edici kelimeler kullanılamaz.",
  },
  {
    icon: "fa-user-shield",
    title: "Güvenli iletişim",
    text: "Sohbet yalnızca randevu alınan hizmetin detaylarını netleştirmek için kullanılmalıdır.",
  },
  {
    icon: "fa-phone-slash",
    title: "Platform dışına yönlendirme",
    text: "Telefon, sosyal medya veya farklı bir platform üzerinden iletişime geçmeye zorlamak uygun değildir.",
  },
  {
    icon: "fa-file-contract",
    title: "Kayıt ve denetim",
    text: "Güvenlik ve hizmet kalitesi için uygunsuz mesajlar sistem tarafından engellenebilir veya incelenebilir.",
  },
  {
    icon: "fa-circle-exclamation",
    title: "İhlal durumunda",
    text: "Kurallara aykırı kullanım durumunda sohbet özelliği kısıtlanabilir veya hesap hakkında işlem yapılabilir.",
  },
];

const ChatTermsModal = ({
  isOpen,
  accepted,
  loading,
  onAcceptedChange,
  onCancel,
  onConfirm,
}) => {
  if (!isOpen) return null;

  return (
    <div className="chat-terms-overlay" onClick={onCancel}>
      <div className="chat-terms-modal" onClick={(e) => e.stopPropagation()}>
        <div className="chat-terms-header">
          <div className="chat-terms-icon">
            <i className="fas fa-comments"></i>
          </div>

          <div>
            <h2>Sohbet Kullanım Kuralları</h2>
            <p>
              Uzmanla konuşmaya başlamadan önce lütfen aşağıdaki sohbet
              kurallarını okuyup onaylayın.
            </p>
          </div>

          <button
            type="button"
            className="chat-terms-close"
            onClick={onCancel}
            disabled={loading}
            title="Kapat"
          >
            <i className="fas fa-times"></i>
          </button>
        </div>

        <div className="chat-terms-body">
          <div className="chat-terms-warning">
            <i className="fas fa-triangle-exclamation"></i>
            <span>
              Uygunsuz kelimeler, rahatsız edici ifadeler ve hizmet dışı
              konuşmalar engellenebilir.
            </span>
          </div>

          <ul className="chat-terms-list">
            {chatRules.map((rule, index) => (
              <li key={index} className="chat-terms-item">
                <div className="chat-terms-item-icon">
                  <i className={`fas ${rule.icon}`}></i>
                </div>

                <div>
                  <h4>{rule.title}</h4>
                  <p>{rule.text}</p>
                </div>
              </li>
            ))}
          </ul>

          <label className="chat-terms-checkbox">
            <input
              type="checkbox"
              checked={accepted}
              onChange={(e) => onAcceptedChange(e.target.checked)}
              disabled={loading}
            />
            <span>Sohbet kullanım koşullarını okudum ve kabul ediyorum.</span>
          </label>
        </div>

        <div className="chat-terms-actions">
          <button
            type="button"
            className="chat-terms-btn chat-terms-btn-secondary"
            onClick={onCancel}
            disabled={loading}
          >
            Vazgeç
          </button>

          <button
            type="button"
            className="chat-terms-btn chat-terms-btn-primary"
            onClick={onConfirm}
            disabled={!accepted || loading}
          >
            {loading ? (
              <>
                <i className="fas fa-spinner fa-spin"></i>
                Sohbet Açılıyor...
              </>
            ) : (
              <>
                <i className="fas fa-check"></i>
                Kabul Et ve Sohbete Geç
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChatTermsModal;