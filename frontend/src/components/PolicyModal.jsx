import { useEffect, useId, useRef } from "react";
import "../styles/PolicyModal.css";

export default function PolicyModal({ open, title, children, onClose }) {
  const titleId = useId();
  const modalRef = useRef(null);
  const closeButtonRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    const previouslyFocused = document.activeElement;
    const previousOverflow = document.body.style.overflow;

    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        onClose?.();
        return;
      }

      if (event.key !== "Tab" || !modalRef.current) return;

      const focusable = modalRef.current.querySelectorAll(
        'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable.length) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  const closeFromBackdrop = (event) => {
    if (event.target === event.currentTarget) onClose?.();
  };

  return (
    <div className="policy-backdrop" onMouseDown={closeFromBackdrop}>
      <div
        ref={modalRef}
        className="policy-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        dir="rtl"
        lang="ar"
      >
        <div className="policy-header">
          <h3 className="policy-title" id={titleId}>{title}</h3>
          <button
            ref={closeButtonRef}
            className="policy-close"
            type="button"
            onClick={onClose}
            aria-label="إغلاق النافذة"
            title="إغلاق"
          >
            ×
          </button>
        </div>

        <div className="policy-body">{children}</div>

        <div className="policy-footer">
          <button className="policy-btn" type="button" onClick={onClose}>
            فهمت، إغلاق
          </button>
        </div>
      </div>
    </div>
  );
}
