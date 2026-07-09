import { useEffect } from "react";
import "../styles/PolicyModal.css";

export default function PolicyModal({ open, title, children, onClose }) {
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (e) => {
      if (e.key === "Escape") onClose?.();
    };

    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="policy-backdrop" onClick={onClose}>
      <div className="policy-modal" onClick={(e) => e.stopPropagation()}>
        <div className="policy-header">
          <h3 className="policy-title">{title}</h3>
          <button className="policy-close" type="button" onClick={onClose} aria-label="Kapat">
            ×
          </button>
        </div>

        <div className="policy-body">
          {children /*data will be added here */}
        </div>

        <div className="policy-footer">
          <button className="policy-btn" type="button" onClick={onClose}>
            Kapat
          </button>
        </div>
      </div>
    </div>
  );
}