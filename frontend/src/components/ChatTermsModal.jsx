// ChatTermsModal.jsx file code

import React from "react";
import "../styles/ChatTermsModal.css";

const chatRules = [
  {
    icon: "fa-ban",
    title: "الكلمات المحظورة والعبارات غير المناسبة",
    text: "لا يمكن استخدام الشتائم أو الإهانات أو التهديدات أو العبارات المهينة أو الرسائل الرومانسية أو كلمات الإزعاج.",
  },
  {
    icon: "fa-user-shield",
    title: "تواصل آمن",
    text: "يجب استخدام المحادثة فقط لتوضيح تفاصيل الخدمة المطلوبة.",
  },
  {
    icon: "fa-phone-slash",
    title: "عدم إجبار الطرف الآخر على الخروج من المنصة",
    text: "لا يجوز إجبار الطرف الآخر على التواصل عبر الهاتف أو وسائل التواصل الاجتماعي أو منصة أخرى.",
  },
  {
    icon: "fa-file-contract",
    title: "التسجيل والمراجعة",
    text: "لأمان المستخدمين وجودة الخدمة، قد يتم حظر الرسائل غير المناسبة أو مراجعتها من قبل النظام.",
  },
  {
    icon: "fa-circle-exclamation",
    title: "في حال المخالفة",
    text: "عند استخدام المحادثة بشكل مخالف للقواعد، قد يتم تقييد ميزة المحادثة أو اتخاذ إجراء بحق الحساب.",
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
            <h2>قواعد استخدام المحادثة</h2>
            <p>
              قبل بدء المحادثة مع الخبير، يرجى قراءة قواعد المحادثة أدناه والموافقة عليها.
            </p>
          </div>

          <button
            type="button"
            className="chat-terms-close"
            onClick={onCancel}
            disabled={loading}
            title="إغلاق"
          >
            <i className="fas fa-times"></i>
          </button>
        </div>

        <div className="chat-terms-body">
          <div className="chat-terms-warning">
            <i className="fas fa-triangle-exclamation"></i>
            <span>
              قد يتم حظر الكلمات غير المناسبة والعبارات المزعجة والمحادثات الخارجة عن نطاق الخدمة.
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
            <span>قرأت شروط استخدام المحادثة وأوافق عليها.</span>
          </label>
        </div>

        <div className="chat-terms-actions">
          <button
            type="button"
            className="chat-terms-btn chat-terms-btn-secondary"
            onClick={onCancel}
            disabled={loading}
          >
            إلغاء
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
                جاري فتح المحادثة...
              </>
            ) : (
              <>
                <i className="fas fa-check"></i>
                أوافق وانتقل إلى المحادثة
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChatTermsModal;
