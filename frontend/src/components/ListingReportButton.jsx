import { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { auth } from "../firebase/firebaseClient";
import { submitListingReport } from "../services/listingReportsApi";
import { showAppToast } from "../utils/showAppToast";
import "./ListingReportButton.css";

const REASON_OPTIONS = [
  {
    value: "inappropriate_photo",
    label: "صورة غير مناسبة",
    hint: "صورة الإعلان أو المحتوى المرئي مزعج أو مضلل.",
  },
  {
    value: "inappropriate_name",
    label: "اسم غير مناسب",
    hint: "العنوان أو الاسم أو العبارة المستخدمة في الإعلان غير مناسبة.",
  },
  {
    value: "other",
    label: "أخرى",
    hint: "يجب كتابة وصف قصير.",
  },
];

const emptyFlags = () => ({
  inappropriate_photo: false,
  inappropriate_name: false,
  other: false,
});

export default function ListingReportButton({ listingId, listingTitle, className = "" }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [flags, setFlags] = useState(emptyFlags);
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  const selectedCount = useMemo(
    () => Object.values(flags).filter(Boolean).length,
    [flags]
  );

  useEffect(() => {
    if (!flags.other) setDescription("");
  }, [flags.other]);

  useEffect(() => {
    if (!open) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e) => {
      if (e.key === "Escape" && !submitting) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, submitting]);

  const label = listingTitle?.trim()
    ? `الإبلاغ عن هذا الإعلان: ${listingTitle.trim()}`
    : "الإبلاغ عن الإعلان";

  const handleOpen = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!listingId) return;
    const user = auth.currentUser;
    if (!user) {
      showAppToast("يجب تسجيل الدخول لإرسال البلاغ.", "error");
      navigate("/login");
      return;
    }
    setFormError("");
    setFlags(emptyFlags());
    setDescription("");
    setOpen(true);
  };

  const close = () => {
    if (submitting) return;
    setOpen(false);
    setFormError("");
  };

  const toggleReason = (value) => {
    setFlags((prev) => {
      const next = { ...prev, [value]: !prev[value] };
      if (value === "other" && !next.other) {
        setDescription("");
      }
      return next;
    });
    setFormError("");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const user = auth.currentUser;
    if (!user) {
      navigate("/login");
      return;
    }

    const reasons = REASON_OPTIONS.map((o) => o.value).filter((k) => flags[k]);
    if (reasons.length === 0) {
      setFormError("يرجى اختيار سبب واحد على الأقل للبلاغ.");
      return;
    }

    const desc = description.trim();
    if (flags.other) {
      if (desc.length < 5) {
        setFormError("عند اختيار \"أخرى\" يرجى كتابة وصف لا يقل عن 5 أحرف.");
        return;
      }
    }
    if (desc.length > 2000) {
      setFormError("يمكن أن يكون الوصف 2000 حرف كحد أقصى.");
      return;
    }

    setSubmitting(true);
    setFormError("");
    try {
      await submitListingReport({
        listingId: String(listingId),
        reasons,
        description: flags.other ? desc : "",
      });
      setOpen(false);
      setFlags(emptyFlags());
      setDescription("");
      showAppToast("تم استلام بلاغك. شكراً لمساعدتك.", "success");
    } catch (err) {
      if (import.meta.env.DEV) console.error("listing_reports:", err);
      const msg =
        err && typeof err.message === "string" && err.message.trim()
          ? err.message.trim()
          : "تعذر الإرسال. يرجى التحقق من الاتصال والمحاولة مرة أخرى.";
      setFormError(msg);
      showAppToast(msg, "error");
    } finally {
      setSubmitting(false);
    }
  };

  const modal = open
    ? createPortal(
        <div
          className="listing-report-overlay"
          onClick={close}
          role="presentation"
        >
          <div
            className="listing-report-modal"
            onClick={(ev) => ev.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="listing-report-title"
          >
            <div className="listing-report-modal__accent" aria-hidden="true" />

            <button
              type="button"
              className="listing-report-modal__close"
              onClick={close}
              disabled={submitting}
              aria-label="إغلاق"
            >
              <i className="fas fa-times" aria-hidden="true" />
            </button>

            <h2 id="listing-report-title" className="listing-report-modal__title">
              الإبلاغ عن الإعلان
            </h2>
            {listingTitle?.trim() && (
              <p className="listing-report-modal__subtitle">
                <span className="listing-report-modal__subtitle-kicker">عنوان الإعلان:</span>{" "}
                <span className="listing-report-modal__subtitle-title">{listingTitle.trim()}</span>
              </p>
            )}
            <p className="listing-report-modal__hint">
              يمكنك اختيار أكثر من سبب. ستتم المراجعة حسب اختياراتك، وقد تؤثر البلاغات المسيئة على حسابك.
            </p>

            <fieldset className="listing-report-fieldset">
              <legend className="listing-report-legend">أسباب البلاغ</legend>
              <p className="listing-report-legend-sub">حدد كل الأسباب المناسبة.</p>
              <div className="listing-report-options">
                {REASON_OPTIONS.map((opt) => {
                  const checked = flags[opt.value];
                  return (
                    <label
                      key={opt.value}
                      className={`listing-report-option ${checked ? "listing-report-option--checked" : ""}`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleReason(opt.value)}
                      />
                      <span className="listing-report-option__body">
                        <span className="listing-report-option__title">{opt.label}</span>
                        <span className="listing-report-option__hint">{opt.hint}</span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>

            {flags.other && (
              <div className="listing-report-textarea-wrap">
                <label htmlFor="listing-report-desc">أخرى - الوصف</label>
                <textarea
                  id="listing-report-desc"
                  value={description}
                  onChange={(ev) => setDescription(ev.target.value.slice(0, 2000))}
                  placeholder="اكتب باختصار ما الذي تريد الإبلاغ عنه (إلزامي)"
                  rows={4}
                  maxLength={2000}
                />
                <span className="listing-report-charcount">{description.length}/2000</span>
              </div>
            )}

            {selectedCount > 0 && (
              <p className="listing-report-summary">
                <i className="fas fa-check-double" aria-hidden="true" /> {selectedCount} اختيار
              </p>
            )}

            {formError ? (
              <p className="listing-report-error" role="alert">
                {formError}
              </p>
            ) : null}

            <div className="listing-report-actions">
              <button type="button" className="listing-report-btn secondary" onClick={close} disabled={submitting}>
                إلغاء
              </button>
              <button
                type="button"
                className="listing-report-btn primary"
                onClick={handleSubmit}
                disabled={submitting}
              >
                {submitting ? "جاري الإرسال..." : "إرسال"}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )
    : null;

  return (
    <>
      <button
        type="button"
        className={`btn-listing-report ${className}`.trim()}
        aria-label={label}
        title="الإبلاغ عن محتوى غير مناسب"
        data-listing-id={listingId ?? ""}
        onClick={handleOpen}
      >
        <span className="btn-listing-report__mark" aria-hidden="true">
          !
        </span>
      </button>
      {modal}
    </>
  );
}
