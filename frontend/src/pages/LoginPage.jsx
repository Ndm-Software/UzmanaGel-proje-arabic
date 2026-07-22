// LoginPage.jsx file code 

import { useEffect, useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import {
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
  sendEmailVerification,
  getIdTokenResult,
} from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "../firebase/firebaseClient";
import DOMPurify from 'dompurify';
import "../styles/LoginPage.css";
import PageTransition from "../components/PageTransition";
import brandImage from "../assets/pictures/logoArabicNoWriting.png";
import googleLogo from "../assets/pictures/google.png";
import phoneLogo from "../assets/pictures/telephone.png";
import LoadingSpinner from "../components/LoadingSpinner";
import MobilePageActions from "../components/MobilePageActions";
import { useSystemSettings } from "../hooks/useSystemSettings";

import {
  loginWithEmail,
  requestPasswordReset,
  linkGoogleToCurrentUser,
  getCurrentUserProviderFlags,
  startGoogleUnionFlow,
  finishGoogleUnionWithPassword,
} from "../firebase/authService";

const isDevelopment = process.env.NODE_ENV === 'development';

const sanitizeText = (text) => {
  if (!text) return '';
  return DOMPurify.sanitize(String(text));
};

const ALLOWED_EMAIL_DOMAINS = [
  "gmail.com",
  "hotmail.com",
  "outlook.com",
  "icloud.com",
  "yahoo.com",
  "protonmail.com",
  "aol.com",
  "yandex.com",
  "mail.com",
  "gmx.com",
  "live.com",
  "msn.com",
  "test.com",
];

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function isValidAllowedEmail(email) {
  const cleanEmail = normalizeEmail(email);
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(cleanEmail)) return false;
  const parts = cleanEmail.split("@");
  if (parts.length !== 2) return false;
  return ALLOWED_EMAIL_DOMAINS.includes(parts[1]);
}

function ForgotPasswordModal({ isOpen, onClose, initialEmail = "" }) {
  const [resetEmail, setResetEmail] = useState(initialEmail);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetError, setResetError] = useState("");
  const [resetSuccess, setResetSuccess] = useState("");

  const isAllowedEmail = isValidAllowedEmail(resetEmail);

  useEffect(() => {
    if (isOpen) {
      setResetEmail(initialEmail || "");
      setResetError("");
      setResetSuccess("");
      setResetLoading(false);
    }
  }, [isOpen, initialEmail]);

  if (!isOpen) return null;

  const handleResetSubmit = async (e) => {
    e.preventDefault();
    setResetError("");
    setResetSuccess("");
    setResetLoading(true);

    const cleanEmail = normalizeEmail(resetEmail);

    if (!cleanEmail) {
      setResetError("يرجى إدخال بريدك الإلكتروني.");
      setResetLoading(false);
      return;
    }

    if (!isValidAllowedEmail(cleanEmail)) {
      setResetError(
        "يرجى إدخال بريد إلكتروني صالح ومسموح."
      );
      setResetLoading(false);
      return;
    }

    try {
      const result = await requestPasswordReset(cleanEmail);

      if (result?.status === "deleted_reserved") {
        setResetError(
          result?.message ||
            "هذا الحساب محذوف وما زالت مدة الاستعادة مستمرة."
        );
        return;
      }

      setResetSuccess(
        result?.message ||
          "إذا كان هذا البريد الإلكتروني مرتبطاً بحساب نشط، فسيتم إرسال رابط إعادة تعيين كلمة المرور."
      );
    } catch (err) {
      setResetError("حدث خطأ. يرجى المحاولة لاحقاً.");
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <div className="lp-modal-overlay" onClick={onClose}>
      <div className="lp-modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="lp-modal-header">
          <h3>نسيت كلمة المرور</h3>
          <button
            type="button"
            className="lp-modal-close-btn"
            onClick={onClose}
            aria-label="إغلاق"
          >
            <i className="fas fa-times"></i>
          </button>
        </div>

        <div className="lp-modal-body">
          <form onSubmit={handleResetSubmit} className="lp-modal-form">
            <p className="lp-modal-helper">
              أدخل البريد الإلكتروني المرتبط بحسابك ليتم إرسال رابط إعادة تعيين كلمة المرور.
            </p>

            <div className="lp-modal-field">
              <label>البريد الإلكتروني</label>
              <input
                type="email"
                value={resetEmail}
                onChange={(e) => setResetEmail(e.target.value)}
                placeholder="ornek@mail.com"
                required
                disabled={resetLoading}
                autoFocus
              />
            </div>

            {resetError && <p className="lp-modal-error">{sanitizeText(resetError)}</p>}
            {resetSuccess && <p className="lp-modal-success">{sanitizeText(resetSuccess)}</p>}

            <div className="lp-modal-actions">
              <button
                type="button"
                className="lp-modal-secondary-btn"
                onClick={onClose}
                disabled={resetLoading}
              >
                إلغاء
              </button>

              <button
                type="submit"
                className="lp-modal-primary-btn"
                disabled={resetLoading || !isAllowedEmail}
              >
                {resetLoading ? "جاري الإرسال..." : "إرسال الرابط"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

function GoogleConflictModal({
  open,
  email,
  onClose,
  onUsePasswordLogin,
  onStartLinking,
  linkingMode,
  mergePassword,
  setMergePassword,
  onConfirmLink,
  loading,
}) {
  if (!open) return null;

  return (
    <div className="lp-modal-overlay" onClick={onClose}>
      <div className="lp-modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="lp-modal-header">
          <h3>الحساب موجود بالفعل</h3>
          <button
            type="button"
            className="lp-modal-close-btn"
            onClick={onClose}
            aria-label="إغلاق"
          >
            <i className="fas fa-times"></i>
          </button>
        </div>

        <div className="lp-modal-body">
          <p className="lp-modal-helper">
            يوجد حساب بالفعل باستخدام البريد <strong>{sanitizeText(email)}</strong>.
          </p>

          {!linkingMode ? (
            <div
              className="lp-modal-actions"
              style={{ display: "flex", gap: 10, flexWrap: "wrap" }}
            >
              <button
                type="button"
                className="lp-modal-secondary-btn"
                onClick={onUsePasswordLogin}
                disabled={loading}
              >
                تسجيل الدخول بكلمة المرور
              </button>

              <button
                type="button"
                className="lp-modal-primary-btn"
                onClick={onStartLinking}
                disabled={loading}
              >
                ربط حساب Google
              </button>
            </div>
          ) : (
            <>
              <div className="lp-modal-field">
                <label>كلمة المرور الحالية</label>
                <input
                  type="password"
                  value={mergePassword}
                  onChange={(e) => setMergePassword(e.target.value)}
                  placeholder="كلمة مرور حسابك الحالي"
                  disabled={loading}
                />
              </div>

              <div
                className="lp-modal-actions"
                style={{ display: "flex", gap: 10, flexWrap: "wrap" }}
              >
                <button
                  type="button"
                  className="lp-modal-secondary-btn"
                  onClick={onUsePasswordLogin}
                  disabled={loading}
                >
                  تسجيل الدخول بكلمة المرور
                </button>

                <button
                  type="button"
                  className="lp-modal-primary-btn"
                  onClick={onConfirmLink}
                  disabled={loading || !mergePassword.trim()}
                >
                  {loading ? "جاري الربط..." : "ربط الحساب"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  
  const { maintenanceMode, registrationsOpen, loading: settingsLoading } = useSystemSettings();

  const [showPass, setShowPass] = useState(false);
  const [email, setEmail] = useState(location.state?.prefillEmail || "");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showWarning, setShowWarning] = useState(false);
  const [warningMessage, setWarningMessage] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [warningVariant, setWarningVariant] = useState("success");

  const [mergeOpen, setMergeOpen] = useState(false);
  const [mergeEmail, setMergeEmail] = useState(
    location.state?.prefillEmail || ""
  );
  const [mergePassword, setMergePassword] = useState("");
  const [pendingGoogleCredential, setPendingGoogleCredential] = useState(null);
  const [linkingMode, setLinkingMode] = useState(false);

  const [googleAutoRedirect, setGoogleAutoRedirect] = useState(false);
  const [googleAutoEmail, setGoogleAutoEmail] = useState("");

  useEffect(() => {
    const saved = localStorage.getItem("theme");
    const initial = saved === "light" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", initial);
  }, []);

  useEffect(() => {
    if (location.state?.prefillEmail) {
      setEmail(location.state.prefillEmail);
      setMergeEmail(location.state.prefillEmail);
    }

    setShowWarning(false);
    setWarningMessage("");
    setWarningVariant("success");

    const loginNoticeType = location.state?.loginNoticeType;
    const legacyProviderHint = location.state?.providerHint;

    if (loginNoticeType === "session_expired") {
      setWarningMessage("انتهت مدة الجلسة. يرجى تسجيل الدخول مرة أخرى.");
      setWarningVariant("warning");
      setShowWarning(true);
      return;
    }

    if (loginNoticeType === "registration_success") {
      setWarningMessage(
        "تم إنشاء حسابك بنجاح. يرجى التحقق من بريدك الإلكتروني وتأكيد حسابك قبل تسجيل الدخول."
      );
      setWarningVariant("success");
      setShowWarning(true);
      return;
    }

    if (loginNoticeType === "google_account_exists") {
      setWarningMessage(
        "هذا البريد الإلكتروني مسجل عبر Google. يرجى المتابعة باستخدام Google."
      );
      setWarningVariant("info");
      setShowWarning(true);
      return;
    }

    if (legacyProviderHint === "password") {
      setWarningMessage(
        "تم إنشاء حسابك بنجاح. يرجى التحقق من بريدك الإلكتروني وتأكيد حسابك قبل تسجيل الدخول."
      );
      setWarningVariant("success");
      setShowWarning(true);
      return;
    }

    if (legacyProviderHint === "google") {
      setWarningMessage(
        "هذا البريد الإلكتروني مسجل عبر Google. يرجى المتابعة باستخدام Google."
      );
      setWarningVariant("info");
      setShowWarning(true);
    }
  }, [location.state]);

  if (settingsLoading) {
    return <LoadingSpinner text="جاري التحقق من إعدادات النظام..." />;
  }

  const checkUserStatus = async (user) => {
    try {
      const userDoc = await getDoc(doc(db, "users", user.uid));

      if (!userDoc.exists()) {
        return {
          allowed: false,
          redirect: null,
          message: "لم يتم العثور على سجل المستخدم.",
        };
      }

      const userData = userDoc.data();
      const tokenResult = await getIdTokenResult(user);
      const claims = tokenResult?.claims || {};
      const adminFromClaims = claims.admin === true || claims.userType === "ADMIN";
      // BAKIM MODU KONTROLÜ - Admin değilse ve bakım modu açıksa engelle
      if (maintenanceMode && userData.userType !== "ADMIN" && !adminFromClaims) {
        return {
          allowed: false,
          redirect: null,
          message: "النظام في وضع الصيانة. يرجى المحاولة لاحقاً.",
        };
      }

      if (userData.userType === "ADMIN" || adminFromClaims) {
        return { allowed: true, redirect: "/admin", message: "" };
      }

      if (userData.userType === "PROVIDER") {
        return { allowed: true, redirect: "/ilanlar", message: "" };
      }

      if (userData.userType === "PENDING_PROVIDER") {
        return {
          allowed: true,
          redirect: "/expert-complete-profile",
          message: "",
        };
      }

      return {
        allowed: true,
        redirect: "/ilanlar",
        message: "",
      };
    } catch (error) {
      if (isDevelopment) console.error("Kullanıcı durumu kontrol edilirken hata:", error.message);
      return { allowed: true, redirect: "/ilanlar", message: "" };
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    setShowWarning(false);

    try {
      if (rememberMe) {
        await setPersistence(auth, browserLocalPersistence);
      } else {
        await setPersistence(auth, browserSessionPersistence);
      }

      const user = await loginWithEmail({ email, password });

      let isAdminAccount = false;
      try {
      // Read the claim directly from the token instead of querying the database!
        const idTokenResult = await user.getIdTokenResult();
        const claims = idTokenResult?.claims || {};
  
        isAdminAccount = claims.admin === true || claims.userType === "ADMIN";
      } catch (adminCheckError) {
        if (isDevelopment) console.error("Admin role check failed:", adminCheckError.message);
      }

      if (!user.emailVerified && !isAdminAccount) {
        try {
          await sendEmailVerification(user);
        } catch (evErr) {
          if (isDevelopment) console.error("Error sending verification email:", evErr.message);
        }
        setError("يرجى تأكيد بريدك الإلكتروني أولاً قبل تسجيل الدخول. لقد أرسلنا رابط التأكيد إلى بريدك الإلكتروني.");
        await auth.signOut();
        setLoading(false);
        return;
      }

      const statusCheck = await checkUserStatus(user);

      if (!statusCheck.allowed) {
        setWarningMessage(statusCheck.message);
        setShowWarning(true);
        setLoading(false);
        return;
      }

      navigate(statusCheck.redirect);
    } catch (err) {
      const code = err?.code;

      if (code === "DELETED_ACCOUNT_IN_RETENTION") {
        setError(
          err?.message ||
            "هذا الحساب محذوف وما زالت مدة الاستعادة البالغة 60 يوماً مستمرة."
        );
        setLoading(false);
        return;
      }

      if (code === "ACCOUNT_SWITCHED_TO_GOOGLE") {
        setGoogleAutoEmail(err?.email || email);
        setGoogleAutoRedirect(true);
        setLoading(false);
        return;
      }

      if (
        code === "auth/wrong-password" ||
        code === "auth/user-not-found" ||
        code === "auth/invalid-credential" ||
        code === "auth/invalid-email"
      ) {
        setError("البريد الإلكتروني أو كلمة المرور غير صحيحة. يرجى التحقق مرة أخرى.");
      } else if (code === "PASSWORD_LOGIN_NOT_ALLOWED") {
        setError(
          err?.message || "هذا البريد الإلكتروني مسجل بطريقة دخول مختلفة."
        );
      } else {
        setError("فشل تسجيل الدخول. يرجى المحاولة لاحقاً.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError("");
    setLoading(true);
    setShowWarning(false);

    try {
      if (rememberMe) {
        await setPersistence(auth, browserLocalPersistence);
      } else {
        await setPersistence(auth, browserSessionPersistence);
      }

      const authFlags = getCurrentUserProviderFlags();

      if (
        authFlags.isLoggedIn &&
        authFlags.hasPassword &&
        !authFlags.hasGoogle
      ) {
        const linkResult = await linkGoogleToCurrentUser();

        const statusCheck = await checkUserStatus(linkResult.user);
        if (!statusCheck.allowed) {
          setWarningMessage(statusCheck.message);
          setShowWarning(true);
          return;
        }

        navigate(statusCheck.redirect);
        return;
      }

      const result = await startGoogleUnionFlow();

      if (
        result?.status === "NEW_ACCOUNT_CREATED" ||
        result?.status === "SIGNED_IN"
      ) {
        const statusCheck = await checkUserStatus(result.user);
        if (!statusCheck.allowed) {
          setWarningMessage(statusCheck.message);
          setShowWarning(true);
          return;
        }

        navigate(statusCheck.redirect);
        return;
      }

      if (
        result?.status === "PASSWORD_ACCOUNT_LINK_REQUIRED" ||
        result?.status === "MERGE_REQUIRED"
      ) {
        setMergeEmail(result?.email || "");
        setEmail(result?.email || "");
        setPendingGoogleCredential(result?.pendingGoogleCredential || null);
        setMergePassword("");
        setLinkingMode(true);
        setMergeOpen(true);
        return;
      }
    } catch (err) {
      if (
        err?.code === "GOOGLE_POPUP_CLOSED" ||
        err?.code === "GOOGLE_POPUP_CANCELLED"
      ) {
        return;
      }

      if (err?.code === "GOOGLE_POPUP_BLOCKED") {
        setError(err?.message || "Google popup engellendi.");
        return;
      }

      if (
        err?.code === "DELETED_ACCOUNT_IN_RETENTION" ||
        err?.code === "SOCIAL_LOGIN_BLOCKED_DELETED_ACCOUNT"
      ) {
        setError(
          err?.message ||
            "هذا الحساب محذوف وما زالت مدة الاستعادة مستمرة. يرجى استعادة حسابك أو التواصل مع الدعم."
        );
        return;
      }

      setError("فشل تسجيل الدخول عبر Google. يرجى المحاولة لاحقاً.");
    } finally {
      setLoading(false);
    }
  };

  const handleUsePasswordLogin = () => {
    setMergeOpen(false);
    setLinkingMode(false);
    setPassword("");
    setShowWarning(true);
    setWarningMessage(
      "حسابك موجود بالفعل. للمتابعة يرجى تسجيل الدخول بكلمة المرور."
    );
  };

  const handleConfirmLink = async () => {
    setError("");
    setLoading(true);

    try {
      const result = await finishGoogleUnionWithPassword({
        email: mergeEmail,
        password: mergePassword,
        pendingGoogleCredential,
      });

      setMergeOpen(false);
      setLinkingMode(false);
      setMergePassword("");
      setPendingGoogleCredential(null);

      const statusCheck = await checkUserStatus(result.user);
      if (!statusCheck.allowed) {
        setWarningMessage(statusCheck.message);
        setShowWarning(true);
        return;
      }

      navigate(statusCheck.redirect);
    } catch (err) {
      setError("تعذر ربط حساب Google. يرجى المحاولة لاحقاً.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <PageTransition>
      <div className="lp-login">
        <header className="lp-login-topbrand">
          <MobilePageActions className="mobile-page-actions--auth" />
          <Link
            to="/"
            className="lp-login-topbrand-link"
            aria-label="خبير"
          >
            <img
              className="lp-login-topbrand-logo"
              src={brandImage}
              alt="خبير"
            />
            <span className="lp-login-topbrand-text">
             {/* خ + ب (Plus the long stretch following ب) */}
                <span >
                  {"خ\u0640\u0640ب\u0640\u0640\u0640\u0640\u200D"}
                </span>
  
                {/* ي (Isolated in Orange + Its trailing stretch) */}
                <span >
                  {"\u200Dي\u0640\u0640\u0640\u0640\u0640\u200D"}
                </span>
  
                {/* ر (With its leading stretch) */}
                <span >
                  {"\u200D\u0640\u0640ر"}
                </span>
            </span>
          </Link>
        </header>

        <div className="lp-login-card">
          <section className="lp-login-left">
            <div className="lp-login-header">
              <h1 className="lp-login-title">أهلاً بك!</h1>
              <p className="lp-login-subtitle">سجّل الدخول إلى حسابك</p>
            </div>

            {error && <div className="lp-login-error">{sanitizeText(error)}</div>}

            {googleAutoRedirect && (
              <div
                style={{
                  backgroundColor: "rgba(234, 179, 8, 0.1)",
                  border: "1px solid #eab308",
                  borderRadius: "12px",
                  padding: "16px",
                  marginBottom: "20px",
                  textAlign: "center",
                }}
              >
                <i
                  className="fab fa-google"
                  style={{
                    color: "#eab308",
                    marginBottom: "8px",
                    fontSize: "1.4rem",
                    display: "block",
                  }}
                ></i>
                <p
                  style={{
                    color: "#eab308",
                    fontWeight: "600",
                    margin: "0 0 4px",
                  }}
                >
                  هذا الحساب يستخدم تسجيل الدخول عبر Google
                </p>
                <p
                  style={{
                    color: "var(--text-muted)",
                    fontSize: "0.85rem",
                    margin: "0 0 12px",
                  }}
                >
                  البريد <strong>{sanitizeText(googleAutoEmail)}</strong> يستخدم الآن تسجيل الدخول عبر Google.
                  لا يمكن استخدام كلمة المرور لهذا الحساب. يرجى المتابعة باستخدام Google.
                </p>
                <button
                  type="button"
                  className="lp-login-btn"
                  style={{
                    background: "#ffffff",
                    color: "#1a1a1a",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "8px",
                  }}
                  onClick={() => {
                    setGoogleAutoRedirect(false);
                    handleGoogleLogin();
                  }}
                  disabled={loading}
                >
                  <img src={googleLogo} alt="Google" className="lp-login-google-btn-img" />
                  تسجيل الدخول عبر Google
                </button>
                <button
                  type="button"
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--text-muted)",
                    fontSize: "0.8rem",
                    marginTop: "8px",
                    cursor: "pointer",
                  }}
                  onClick={() => setGoogleAutoRedirect(false)}
                >
                  إلغاء
                </button>
              </div>
            )}

            {showWarning && (
              <div
                className="lp-login-warning"
                style={
                  warningVariant === "info" || warningVariant === "warning"
                    ? {
                        backgroundColor: "rgba(234, 179, 8, 0.10)",
                        border: "1px solid #eab308",
                        color: "#eab308",
                      }
                    : undefined
                }
              >
                <i
                  className={
                    warningVariant === "warning"
                      ? "fas fa-clock"
                      : warningVariant === "info"
                      ? "fas fa-info-circle"
                      : "fas fa-check-circle"
                  }
                  style={{ marginRight: "8px" }}
                ></i>
                {sanitizeText(warningMessage)}
              </div>
            )}

            <form className="lp-login-form" onSubmit={handleSubmit}>
              <div className="lp-login-form-group">
                <label className="lp-login-label">
                  <i className="fas fa-envelope lp-login-icon"></i>
                  البريد الإلكتروني
                </label>
                <input
                  className="lp-login-input"
                  type="text"
                  placeholder="بريدك الإلكتروني"
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>

              <div className="lp-login-form-group">
                <label className="lp-login-label">
                  <i className="fas fa-lock lp-login-icon"></i>
                  كلمة المرور
                </label>

                <div className="lp-login-pass">
                  <input
                    className="lp-login-input"
                    type={showPass ? "text" : "password"}
                    placeholder="••••••••"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />

                  <button
                    type="button"
                    className="lp-login-eye"
                    onClick={() => setShowPass((v) => !v)}
                    aria-label={showPass ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
                  >
                    <i
                      className={
                        showPass ? "fas fa-eye-slash" : "fas fa-eye"
                      }
                    ></i>
                  </button>
                </div>
              </div>

              <div className="lp-login-row">
                <label className="lp-login-remember">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                  />
                  <span>تذكرني</span>
                </label>

                <button
                  type="button"
                  className="lp-login-link lp-login-link-btn"
                  onClick={() => setShowForgotModal(true)}
                >
                  نسيت كلمة المرور
                </button>
              </div>

              <button className="lp-login-btn" type="submit" disabled={loading}>
                <i className="fas fa-sign-in-alt"></i>
                {loading ? "جاري تسجيل الدخول..." : "تسجيل الدخول"}
              </button>
            </form>

            <div className="lp-login-or">
              <span>أو</span>
            </div>

            <div className="social-icons">
              <button
                className="social-icon google"
                type="button"
                onClick={handleGoogleLogin}
                disabled={loading}
                aria-label="تسجيل الدخول عبر Google"
              >
                <img src={googleLogo} alt="Google" className="social-icon-img" />
              </button>
             </div>

            {registrationsOpen ? (
              <p className="lp-login-bottom">
                ليس لديك حساب؟ <Link to="/register">سجّل الآن</Link>
              </p>
            ) : (
              <p className="lp-login-bottom registrations-closed">
                <i className="fas fa-door-closed"></i> تم إيقاف التسجيلات الجديدة مؤقتاً.
              </p>
            )}

            <div className="lp-login-expert">
              <Link to="/uzman-basvuru" className="lp-login-expert-link">
                هل أنت خبير؟ قدّم طلبك.
              </Link>
            </div>
          </section>

          <section className="lp-login-right">
            <div className="lp-login-quote">
              <i className="fas fa-quote-left lp-login-quote-icon"></i>
              <p>
                ابحث بين الخبراء <br />
                عن الخدمة التي تحتاجها، <br />
                وحل مشكلتك بسرعة.
              </p>
              <span className="lp-login-quote-author">- خبير</span>
            </div>
          </section>
        </div>

        <ForgotPasswordModal
          isOpen={showForgotModal}
          onClose={() => setShowForgotModal(false)}
          initialEmail={email}
        />

        <GoogleConflictModal
          open={mergeOpen}
          email={mergeEmail}
          onClose={() => {
            if (loading) return;
            setMergeOpen(false);
            setLinkingMode(false);
          }}
          onUsePasswordLogin={handleUsePasswordLogin}
          onStartLinking={() => setLinkingMode(true)}
          linkingMode={linkingMode}
          mergePassword={mergePassword}
          setMergePassword={setMergePassword}
          onConfirmLink={handleConfirmLink}
          loading={loading}
        />
      </div>
    </PageTransition>
  );
}
