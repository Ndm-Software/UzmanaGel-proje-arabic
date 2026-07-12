import React from "react";

const CancelSuccessModal = ({ isOpen, onClose, expertName }) => {
  if (!isOpen) return null;

  return (
    <div className="detail-overlay" onClick={onClose}>
      <div className="appointment-modal-form" style={{ maxWidth: "450px" }} onClick={e => e.stopPropagation()}>
        <div className="appo-form-header" style={{ marginBottom: "10px", paddingBottom: "0" }}>
          <h3 className="appo-form-title" style={{ color: "var(--error, #ef4444)", fontSize: "20px", marginBottom: "12px" }}>
            <i className="fas fa-info-circle"></i> معلومات عن عملية الإلغاء
          </h3>
          <div className="appo-form-title-line" style={{ marginBottom: "8px" }}></div>
        </div>

        <div style={{ padding: "20px", paddingTop: "0" }}>
          <p style={{ color: "var(--text-main, #fff)", marginBottom: "16px", lineHeight: "1.6", fontSize: "14px", marginTop: "0" }}>
            تم إلغاء الموعد وإرسال رسالة إبلاغ إلى العميل.
          </p>

          <div style={{ background: "rgba(239, 68, 68, 0.12)", padding: "12px", borderRadius: "10px", marginBottom: "12px", borderLeft: "3px solid #ef4444" }}>
            <p style={{ color: "#f87171", fontSize: "14px", margin: "0 0 4px 0", fontWeight: "bold" }}>
              ⚠️ معلومات الرصيد
            </p>
            <p style={{ color: "#fca5a5", fontSize: "13px", margin: 0, lineHeight: "1.4" }}>
              وفقاً لقواعد النظام، لا يتم استرداد الرصيد عند الإلغاء من طرف الخبير.
            </p>
          </div>

          <div style={{ background: "rgba(59, 130, 246, 0.1)", padding: "12px", borderRadius: "10px", marginBottom: "16px", borderLeft: "3px solid #3b82f6" }}>
            <p style={{ color: "#60a5fa", fontSize: "14px", margin: "0 0 4px 0", fontWeight: "bold" }}>
              💡 توصية
            </p>
            <p style={{ color: "#93c5fd", fontSize: "13px", margin: 0, lineHeight: "1.4" }}>
              لتجنب فقدان الرصيد في المواعيد القادمة، ننصحك بمراجعة التفاصيل قبل التأكيد أو استخدام خيار تغيير الوقت.
            </p>
          </div>

          <button 
            className="btn-form-cancel" 
            onClick={onClose} 
            style={{ 
              width: "100%", 
              padding: "8px", 
              fontSize: "14px",
              background: "var(--input-bg, #252a36)",
              color: "var(--text-main, #e8edf2)",
              border: "1px solid var(--card-border, #2d3340)",
              borderRadius: "8px",
              cursor: "pointer"
            }}
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
};

export default CancelSuccessModal;
