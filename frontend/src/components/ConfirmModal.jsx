// ConfirmModal.jsx
import React from "react";

const ConfirmModal = ({ isOpen, onClose, onConfirm, title, message, confirmText = "نعم", cancelText = "لا", type = "warning" }) => {
  if (!isOpen) return null;

  const colors = {
    warning: { border: "#f59e0b", icon: "#f59e0b", button: "#f59e0b" },
    danger: { border: "#ef4444", icon: "#ef4444", button: "#ef4444" },
    info: { border: "#3b82f6", icon: "#3b82f6", button: "#3b82f6" }
  };

  const currentColor = colors[type] || colors.warning;

  return (
    <div className="detail-overlay" style={{ zIndex: 20000 }} onClick={onClose}>
      <div className="appointment-modal-form" style={{ maxWidth: "400px" }} onClick={e => e.stopPropagation()}>
        <div className="appo-form-header" style={{ marginBottom: "0", paddingBottom: "0" }}>
          <h3 className="appo-form-title" style={{ color: currentColor.border, marginBottom: "12px" }}>{title}</h3>
          <div className="appo-form-title-line" style={{ marginBottom: "0" }}></div>
        </div>

        <div style={{ padding: "20px", textAlign: "center", paddingTop: "8px", paddingBottom: "12px" }}>
          <i className="fas fa-exclamation-triangle" style={{ fontSize: "40px", color: currentColor.icon, marginBottom: "8px" }}></i>
          <p style={{ color: "var(--text-main, #fff)", fontSize: "14px", marginBottom: "12px", lineHeight: "1.5" }}>
            {message}
          </p>

          <div style={{ display: "flex", gap: "12px", justifyContent: "center" }}>
            <button 
              className="btn-form-cancel" 
              onClick={onClose} 
              style={{ padding: "8px 20px", fontSize: "13px" }}
            >
              <i className="fas fa-times"></i> {cancelText}
            </button>
            <button 
              className="btn-form-submit" 
              onClick={onConfirm} 
              style={{ background: currentColor.button, padding: "8px 20px", fontSize: "13px" }}
            >
              <i className="fas fa-check"></i> {confirmText}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConfirmModal;
