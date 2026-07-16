import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import "../styles/PolicyModal.css";

export default function PolicyModal({
  open,
  title,
  children,
  onClose,
}) {
  const titleId = useId();
  const modalRef = useRef(null);
  const closeButtonRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    const previouslyFocused = document.activeElement;
    const previousOverflow = document.body.style.overflow;

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        onClose?.();
        return;
      }

      if (event.key !== "Tab" || !modalRef.current) return;

      const focusableElements = modalRef.current.querySelectorAll(
        [
          "a[href]",
          "button:not([disabled])",
          "input:not([disabled])",
          "select:not([disabled])",
          "textarea:not([disabled])",
          '[tabindex]:not([tabindex="-1"])',
        ].join(",")
      );

      if (!focusableElements.length) return;

      const firstElement = focusableElements[0];
      const lastElement =
        focusableElements[focusableElements.length - 1];

      if (
        event.shiftKey &&
        document.activeElement === firstElement
      ) {
        event.preventDefault();
        lastElement.focus();
      } else if (
        !event.shiftKey &&
        document.activeElement === lastElement
      ) {
        event.preventDefault();
        firstElement.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";

    const focusTimer = window.setTimeout(() => {
      closeButtonRef.current?.focus();
    }, 60);

    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus?.();
    };
  }, [open, onClose]);

  if (typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="kh-policy-overlay"
          style={{
            position: "fixed",
            inset: 0,
            width: "100vw",
            height: "100dvh",
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{
            duration: 0.2,
            ease: "easeOut",
          }}
          onPointerDown={(event) => {
            if (event.target === event.currentTarget) {
              onClose?.();
            }
          }}
        >
          <motion.section
            ref={modalRef}
            className="kh-policy-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            dir="rtl"
            lang="ar"
            initial={{
              opacity: 0,
              scale: 0.95,
              y: 28,
            }}
            animate={{
              opacity: 1,
              scale: 1,
              y: 0,
            }}
            exit={{
              opacity: 0,
              scale: 0.97,
              y: 18,
            }}
            transition={{
              duration: 0.28,
              ease: [0.22, 1, 0.36, 1],
            }}
            onPointerDown={(event) => event.stopPropagation()}
          >
            <header className="kh-policy-header">
              <h3
                className="kh-policy-title"
                id={titleId}
              >
                {title}
              </h3>

              <button
                ref={closeButtonRef}
                className="kh-policy-close"
                type="button"
                onClick={onClose}
                aria-label="إغلاق النافذة"
                title="إغلاق"
              >
                <i
                  className="fas fa-times"
                  aria-hidden="true"
                />
              </button>
            </header>

            <div className="kh-policy-body">
              {children}
            </div>

            <footer className="kh-policy-footer">
              <button
                className="kh-policy-button"
                type="button"
                onClick={onClose}
              >
                فهمت، إغلاق
              </button>
            </footer>
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}