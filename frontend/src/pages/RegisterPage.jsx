// RegisterPage.jsx file code 

import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import "../styles/RegisterPage.css";
import PageTransition from "../components/PageTransition";
import brandImage from "../assets/pictures/LogoArabicNoWriting.png";
import PolicyModal from "../components/PolicyModal";
import DOMPurify from 'dompurify';
import LoadingSpinner from "../components/LoadingSpinner";
import MobilePageActions from "../components/MobilePageActions";
import { useSystemSettings } from "../hooks/useSystemSettings";

import googleLogo from "../assets/pictures/google.png";
import phoneLogo from "../assets/pictures/telephone.png";

import {
  continueWithGoogle,
  mergeGoogleWithExistingPasswordAccount,
  getEmailIdentityStatus,
  initRecaptcha,
  sendPhoneOtp,
  clearRecaptcha,
  registerExpertDraft,
  finalizeExpertRegistration,
// Edress added this to solve JWT issue 7 mayis
   logout,
   registerWithEmailDirect,
} from "../firebase/authService";
import { checkRegistrationEligibility } from "../services/registrationGuardService";

const isDevelopment = process.env.NODE_ENV === 'development';

const sanitizeText = (text) => {
  if (!text) return '';
  return DOMPurify.sanitize(String(text));
};

function ExistingAccountModal({
  open,
  email,
  mode,
  onClose,
  onContinueGoogle,
  onGoLogin,
}) {
  if (!open) return null;

  const isGoogleMode = mode === "google_exists";
  const title = isGoogleMode ? "لديك حساب بالفعل" : "الحساب موجود";

  return (
    <div className="lp-modal-overlay" onClick={onClose}>
      <div className="lp-modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="lp-modal-header">
          <h3>{title}</h3>
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
            <strong>{sanitizeText(email)}</strong> لديك بالفعل حساب باستخدام هذا العنوان.
          </p>

          {isGoogleMode ? (
            <>
              <p className="lp-modal-helper">
                 Google تم إنشاء هذا الحساب سابقًا باستخدام 
                . Google للمتابعة، يرجى تسجيل الدخول باستخدام .
              </p>
              <div className="lp-modal-actions" style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button type="button" className="lp-modal-secondary-btn" onClick={onGoLogin}>
                  الانتقال إلى صفحة تسجيل الدخول
                </button>
                <button type="button" className="lp-modal-primary-btn" onClick={onContinueGoogle}>
                  المتابعة باستخدام Google
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="lp-modal-helper">
                هذا الحساب موجود بالفعل. يجب عليك تسجيل الدخول بدلاً من إنشاء حساب جديد.
              </p>
              <div className="lp-modal-actions" style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button type="button" className="lp-modal-primary-btn" onClick={onGoLogin}>
                  تسجيل الدخول
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function RegisterPage() {
  const navigate = useNavigate();
  
  // Sistem ayarlarını kontrol et
  const { maintenanceMode, registrationsOpen, loading: settingsLoading } = useSystemSettings();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");

  const [showPass, setShowPass] = useState(false);
  const [showPass2, setShowPass2] = useState(false);
  const [agree, setAgree] = useState(false);
  const [passwordStrength, setPasswordStrength] = useState(0);
  const [passwordErrors, setPasswordErrors] = useState([]);
  const [emailError, setEmailError] = useState("");
  const [phoneError, setPhoneError] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [otp, setOtp] = useState("");
  const [showOtpScreen, setShowOtpScreen] = useState(false);
  const [confirmationResult, setConfirmationResult] = useState(null);
  const [pendingUserData, setPendingUserData] = useState(null);

  const [policyOpen, setPolicyOpen] = useState(false);
  const [policyType, setPolicyType] = useState("terms");

  const [mergeOpen, setMergeOpen] = useState(false);
  const [mergeEmail, setMergeEmail] = useState("");
  const [mergePassword, setMergePassword] = useState("");
  const [pendingGoogleCredential, setPendingGoogleCredential] = useState(null);

  const [existingAccountOpen, setExistingAccountOpen] = useState(false);
  const [existingAccountEmail, setExistingAccountEmail] = useState("");
  const [existingAccountMode, setExistingAccountMode] = useState("password_exists");

  const [emailTouched, setEmailTouched] = useState(false);
  const [phoneTouched, setPhoneTouched] = useState(false);

  const validEmailDomains = [
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

  useEffect(() => {
    const saved = localStorage.getItem("theme");
    const initial = saved === "light" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", initial);

    return () => {
      clearRecaptcha();
    };
  }, []);

  if (settingsLoading) {
    return <LoadingSpinner text=" ...يتم فحص إعدادات النظام" />;
  }

  if (maintenanceMode) {
    return (
      <div className="maintenance-page">
        <div className="maintenance-content">
          <i className="fas fa-tools fa-4x"></i>
          <h1>Bakım Modu</h1>
          <p>.الموقع قيد الصيانة حالية</p>
          <p>.الرجاءالمحاولة لاحقا</p>
          <Link to="/" className="maintenance-home-btn">
            Ana Sayfaya Dön
          </Link>
        </div>
      </div>
    );
  }

  // Yeni kayıtlar kapalıysa register sayfasını gösterME
  if (!registrationsOpen) {
    return (
      <div className="registrations-closed-page">
        <div className="registrations-closed-content">
          <i className="fas fa-door-closed fa-4x"></i>
          <h1>تم إيقاف التسجيلات الجديدة</h1>
          <p>.التسجيلات الجديدة متوقفة مؤقتًا في الوقت الحالي</p>
          <p>.يرجى المحاولة مرة أخرى لاحقًا</p>
          <Link to="/" className="registrations-home-btn">
            العودة إلى الصفحة الرئيسية
          </Link>
          <Link to="/login" className="registrations-login-btn">
            تسجيل الدخول
          </Link>
        </div>
      </div>
    );
  }

  const hasConsecutiveChars = (str) => {
    for (let i = 0; i < str.length - 2; i++) {
      const char1 = str.charCodeAt(i);
      const char2 = str.charCodeAt(i + 1);
      const char3 = str.charCodeAt(i + 2);

      if (
        char1 >= 48 && char1 <= 57 &&
        char2 >= 48 && char2 <= 57 &&
        char3 >= 48 && char3 <= 57
      ) {
        if (char2 === char1 + 1 && char3 === char2 + 1) return true;
        if (char2 === char1 - 1 && char3 === char2 - 1) return true;
      }

      if (
        char1 >= 97 && char1 <= 122 &&
        char2 >= 97 && char2 <= 122 &&
        char3 >= 97 && char3 <= 122
      ) {
        if (char2 === char1 + 1 && char3 === char2 + 1) return true;
      }

      if (
        char1 >= 65 && char1 <= 90 &&
        char2 >= 65 && char2 <= 90 &&
        char3 >= 65 && char3 <= 90
      ) {
        if (char2 === char1 + 1 && char3 === char2 + 1) return true;
      }
    }
    return false;
  };

  const hasRepeatedChars = (str) => {
    for (let i = 0; i < str.length - 2; i++) {
      if (str[i] === str[i + 1] && str[i + 1] === str[i + 2]) return true;
    }
    return false;
  };

  const validateEmail = (value) => {
    const normalizedValue = String(value || "").trim().toLowerCase();
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

    if (!normalizedValue) {
      setEmailError("حقل البريد الإلكتروني إجباري");
      return false;
    }

    if (!emailRegex.test(normalizedValue)) {
      setEmailError("الرجاء إدخال بريد إلكتروني صالح");
      return false;
    }

    const domain = normalizedValue.split("@")[1]?.toLowerCase();
    if (!validEmailDomains.includes(domain)) {
      setEmailError("بريد إلكتروني غير صالح");
      return false;
    }

    setEmailError("");
    return true;
  };

  const validatePhone = (phoneStr) => {
    const cleaned = String(phoneStr || "").replace(/[\s()-]/g, "");

    if (!cleaned) {
      setPhoneError("رقم الهاتف مطلوب.");
      return false;
    }

    if (!/^\d+$/.test(cleaned)) {
      setPhoneError("يجب أن يتكون رقم الهاتف من أرقام فقط.");
      return false;
    }

    if (cleaned.length < 9 || cleaned.length > 15) {
      setPhoneError("يجب أن يتكون رقم الهاتف من 9 إلى 15 رقمًا.");
      return false;
    }

    setPhoneError("");
    return true;
  };

  const validatePassword = (pass) => {
    const errors = [];
    if (pass.length < 6) errors.push("يجب أن تتكون من 6 أحرف على الأقل");
    if (!/[A-Z]/.test(pass)) errors.push("يجب أن تحتوي على حرف كبير واحد على الأقل");
    if (!/[a-z]/.test(pass)) errors.push("يجب أن تحتوي على حرف صغير واحد على الأقل");
    if (!/[0-9]/.test(pass)) errors.push("يجب أن تحتوي على رقم واحد على الأقل");
    if (!/[^A-Za-z0-9]/.test(pass)) errors.push("يجب أن تحتوي على رمز خاص واحد على الأقل");
    if (hasConsecutiveChars(pass)) errors.push("يجب ألا تحتوي على أحرف متتالية");
    if (hasRepeatedChars(pass)) errors.push("يجب ألا يتكرر نفس الحرف 3 مرات متتالية");
    return errors;
  };

  const handlePasswordChange = (e) => {
    const pass = e.target.value;
    setPassword(pass);

    let strength = 0;
    if (pass.length >= 6) strength += 20;
    if (pass.length >= 8) strength += 5;
    if (/[A-Z]/.test(pass)) strength += 20;
    if (/[a-z]/.test(pass)) strength += 20;
    if (/[0-9]/.test(pass)) strength += 20;
    if (/[^A-Za-z0-9]/.test(pass)) strength += 15;
    if (hasConsecutiveChars(pass)) strength -= 20;
    if (hasRepeatedChars(pass)) strength -= 20;

    strength = Math.max(0, Math.min(100, strength));
    setPasswordStrength(strength);
    setPasswordErrors(validatePassword(pass));
  };

  const handleEmailChange = (e) => {
    const newEmail = e.target.value;
    setEmail(newEmail);

    if (emailTouched) {
      validateEmail(newEmail);
    } else if (!newEmail) {
      setEmailError("");
    }
  };

  const handlePhoneChange = (e) => {
    const raw = e.target.value.replace(/\D/g, "");
    const cleaned = raw.slice(0, 10);
    setPhone(cleaned);

    if (phoneTouched) {
      validatePhone(cleaned);
    } else if (!cleaned) {
      setPhoneError("");
    }
  };

  const handleEmailBlur = () => {
    setEmailTouched(true);
    validateEmail(email);
  };

  const handlePhoneBlur = () => {
    setPhoneTouched(true);
    validatePhone(phone);
  };

  const getPasswordStrengthColor = () => {
    if (passwordStrength === 0) return "#4b5563";
    if (passwordStrength <= 25) return "#ef4444";
    if (passwordStrength <= 50) return "#f97316";
    if (passwordStrength <= 75) return "#eab308";
    return "#22c55e";
  };

  const formatPhone = (digits) => {
    const part1 = digits.slice(0, 3);
    const part2 = digits.slice(3, 6);
    const part3 = digits.slice(6, 8);
    const part4 = digits.slice(8, 10);

    let formatted = "";
    if (part1) formatted += part1;
    if (part2) formatted += "-" + part2;
    if (part3) formatted += "-" + part3;
    if (part4) formatted += "-" + part4;
    return formatted;
  };

  const openTerms = (e) => {
    e.preventDefault();
    setPolicyType("terms");
    setPolicyOpen(true);
  };

  const openPrivacy = (e) => {
    e.preventDefault();
    setPolicyType("privacy");
    setPolicyOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setEmailError("");
    setEmailTouched(true);

    if (!fullName || !email || !password || !password2) {
      return setError(".يرجى إدخال جميع الحقول المطلوبة");
    }

    if (!agree) {
      return setError(".يجب عليك قبول الشروط للمتابعة");
    }

    if (password !== password2) {
      return setError(".كلمات المرور غير متطابقة");
    }

    if (!validateEmail(email)) {
      return setError(".يرجى إدخال عنوان بريد إلكتروني صحيح");
    }

    const passwordCheck = validatePassword(password);
    if (passwordCheck.length > 0) {
      return setError(".كلمة المرور لا تستوفي الشروط المطلوبة");
    }

    if (passwordStrength !== 100) {
      return setError("يجب أن تكون كلمة المرور متوافقة مع القواعد المحددة");
    }

    try {
      setLoading(true);

      const cleanEmail = String(email || "").trim().toLowerCase();
      const identity = await getEmailIdentityStatus(cleanEmail);

      const methods = identity?.methods || [];
      const hasPassword = methods.includes("password");
      const hasGoogle = methods.includes("google.com");

      if (hasGoogle && !hasPassword) {
        setExistingAccountEmail(cleanEmail);
        setExistingAccountMode("google_exists");
        setExistingAccountOpen(true);
        return;
      }

      if (hasPassword || identity?.existsInUsers) {
        setExistingAccountEmail(cleanEmail);
        setExistingAccountMode("password_exists");
        setExistingAccountOpen(true);
        return;
      }

      await checkRegistrationEligibility({
        email: cleanEmail,
        phoneNumber: "",
      });

      await registerWithEmailDirect({
        name: sanitizeText(fullName),
        email: cleanEmail,
        password,
        phone: "",
        userType: "CLIENT",
      });

      await logout();

      navigate("/login", {
        replace: true,
        state: {
          prefillEmail: cleanEmail,
          loginNoticeType: "registration_success",
        },
      });
    } catch (err) {
      if (err?.field === "email") {
        setEmailError("لا يمكن استخدام هذا البريد الإلكتروني.");
      } else if (err?.field === "phoneNumber") {
        setPhoneError("لا يمكن استخدام هذا الرقم.");
      } else {
        setError("حدث خطأ أثناء إنشاء الحساب. يرجى المحاولة لاحقًا.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      if (!confirmationResult || !pendingUserData) {
        setError("لم يتم العثور على جلسة التحقق. يرجى التسجيل مرة أخرى.");
        setLoading(false);
        return;
      }

      await finalizeExpertRegistration({
        confirmationResult,
        code: otp,
        userData: pendingUserData,
        userType: "CLIENT",
      });
      // Edress added this to solve JWT issue 7 mayis
      await logout();

      navigate("/login", {
        // Edress added this to solve JWT issue 7 mayis
        replace: true,
        state: {
          prefillEmail: pendingUserData?.email || "",
          loginNoticeType: "registration_success",
        },
      });
    } catch (err) {
      if (err?.code === "EMAIL_ALREADY_REGISTERED_WITH_GOOGLE") {
        setExistingAccountEmail(
          pendingUserData?.email || email || ""
        );
        setExistingAccountMode("google_exists");
        setExistingAccountOpen(true);
        setShowOtpScreen(false);
        return;
      }

      setError("لم يتم التحقق من الرمز. يرجى المحاولة مرة أخرى.");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setError("");

    // Bakım modunda Google girişini de engelle
    if (maintenanceMode) {
      setError("لا يمكن التسجيل بسبب وضع الصيانة.");
      return;
    }

    // Yeni kayıtlar kapalıysa Google ile kaydı da engelle
    if (!registrationsOpen) {
      setError("تم إيقاف التسجيلات الجديدة مؤقتًا حاليًا.");
      return;
    }

    try {
      setLoading(true);

      const result = await continueWithGoogle();

      if (
        result?.status === "NEW_ACCOUNT_CREATED" ||
        result?.status === "SIGNED_IN"
      ) {
        navigate("/ilanlar");
        return;
      }

      if (result?.status === "MERGE_REQUIRED") {
        setMergeEmail(result?.email || "");
        setPendingGoogleCredential(result?.pendingCredential || null);
        setMergePassword("");
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
        setError(
          err?.message ||
            "تم حظر نافذة Google المنبثقة. يرجى التحقق من إعدادات المتصفح."
        );
        return;
      }

      if (
        err?.code === "DELETED_ACCOUNT_IN_RETENTION" ||
        err?.code === "SOCIAL_LOGIN_BLOCKED_DELETED_ACCOUNT"
      ) {
        setError(
          err?.message ||
            "هذا الحساب محذوف حاليًا ومرحلة الاستعادة ما زالت قيد التنفيذ. يرجى استعادة حسابك."
        );
        return;
      }

      if (err?.code === "GOOGLE_EMAIL_MISSING") {
        setError(err?.message || "لم يتم الحصول على بريد إلكتروني صالح من حساب Google.");
        return;
      }

      setError("تعذر المتابعة باستخدام Google. يرجى المحاولة لاحقًا.");
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmMerge = async () => {
    setError("");

    try {
      setLoading(true);

      await mergeGoogleWithExistingPasswordAccount({
        email: mergeEmail,
        password: mergePassword,
        pendingGoogleCredential,
      });

      setMergeOpen(false);
      setMergePassword("");
      setPendingGoogleCredential(null);
      navigate("/");
    } catch (err) {
      setError("تعذر دمج الحساب. يرجى المحاولة لاحقًا.");
    } finally {
      setLoading(false);
    }
  };

  const handleCloseMergeModal = () => {
    if (loading) return;
    setMergeOpen(false);
    setMergePassword("");
    setPendingGoogleCredential(null);
  };

  const handlePhoneInfo = () => {
    navigate("/register-phone");
  };

  const passwordsMatch = password && password2 && password === password2;
  const isFormValid =
    fullName &&
    email &&
    password &&
    password2 &&
    !emailError &&
    passwordErrors.length === 0 &&
    passwordsMatch &&
    agree;

  return (
    <PageTransition>
      <div className="lp-register" >
        <header className="lp-register-topbrand" dir="rtl">
          <MobilePageActions className="mobile-page-actions--auth" />
          <Link to="/" className="lp-register-topbrand-link" aria-label="خبير Home">
            <img className="lp-register-topbrand-logo" src={brandImage} alt="خبير" />
            <span className="lp-register-topbrand-text">
              {/* خ + ب (Plus the long stretch following ب) */}
              <span className="outer-letter">
                {"خ\u0640\u0640ب\u0640\u0640\u0640\u200D"}
              </span>

              {/* ي (Isolated + Its trailing stretch) */}
              <span className="inner-letters">
                {"\u200Dي\u0640\u0640\u0640\u0640\u200D"}
              </span>

              {/* ر (With its leading stretch) */}
              <span className="outer-letter">
                {"\u200D\u0640\u0640ر"}
              </span>
            </span>
          </Link>
        </header>

        <div className="lp-register-card">
          <section className="lp-register-left">
            <div className="lp-register-header">
              <h1 className="lp-register-title">إنشاء حساب</h1>
              <p className="lp-register-subtitle">سجّل مجانًا، وابدأ الآن</p>
            </div>

            <div id="recaptcha-container"></div>

            {!showOtpScreen ? (
              <>
                <form className="lp-register-form" onSubmit={handleSubmit}>
                  <div className="lp-register-form-group">
                    <label className="lp-register-label">
                      <i className="fas fa-user lp-register-icon"></i> الإسم الكامل
                    </label>
                    <input
                      className="lp-register-input"
                      type="text"
                      placeholder="الإسم الكامل"
                      autoComplete="name"
                      required
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      disabled={loading}
                    />
                  </div>

                  <div className="lp-register-form-group">
                    <label className="lp-register-label">
                      <i className="fas fa-envelope lp-register-icon"></i> البريد الإلكتروني
                    </label>
                    <input
                      className="lp-register-input lp-register-email-input"
                      type="email"
                      placeholder="البريد الإلكتروني"
                      autoComplete="email"
                      required
                      value={email}
                      onChange={handleEmailChange}
                      onBlur={handleEmailBlur}
                      disabled={loading}
                    />
                    {emailError && emailTouched && (
                      <small style={{ color: "#ef4444", display: "block", marginTop: "4px" }}>
                        <i className="fas fa-times-circle"></i> {sanitizeText(emailError)}
                      </small>
                    )}
                  </div>


                  <div className="lp-register-form-group">
                    <label className="lp-register-label">
                      <i className="fas fa-lock lp-register-icon"></i> كلمة المرور
                    </label>
                    <div className="lp-register-pass">
                      <input
                        className="lp-register-input"
                        type={showPass ? "text" : "password"}
                        placeholder="كلمة المرور"
                        autoComplete="new-password"
                        required
                        value={password}
                        onChange={handlePasswordChange}
                        disabled={loading}
                      />
                      <button
                        type="button"
                        className="lp-register-eye"
                        onClick={() => setShowPass((v) => !v)}
                        aria-label={showPass ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
                        disabled={loading}
                      >
                        <i className={showPass ? "fas fa-eye-slash" : "fas fa-eye"}></i>
                      </button>
                    </div>

                    <div
                      className="password-strength"
                      style={{
                        marginTop: "8px",
                        height: "4px",
                        background: "var(--border-color)",
                        borderRadius: "2px",
                        overflow: "hidden",
                      }}
                    >
                      <div
                        className="strength-bar"
                        style={{
                          height: "100%",
                          transition: "all 0.3s ease",
                          width: `${passwordStrength}%`,
                          backgroundColor: getPasswordStrengthColor(),
                        }}
                      ></div>
                    </div>

                    {password && password.length > 0 && passwordErrors.length > 0 && (
                      <div className="password-requirements">
                        {passwordErrors.map((err, index) => (
                          <small
                            key={index}
                            style={{ color: "#ef4444", display: "block", marginTop: "4px" }}
                          >
                            <i className="fas fa-times-circle"></i> {sanitizeText(err)}
                          </small>
                        ))}
                      </div>
                    )}

                    <small
                      className="password-hint"
                      style={{
                        color: "var(--text-muted)",
                        fontSize: "0.8rem",
                        marginTop: "4px",
                        display: "block",
                      }}
                    >
                    ✓ 6 أحرف على الأقل ✓ حرف كبير (A-Z) ✓ حرف صغير (a-z)
                    <br />
                    ✓ رقم (0-9) ✓ رمز خاص (!@#$%^&*) ✓ بدون تسلسل                    </small>
                  </div>

                  <div className="lp-register-form-group">
                    <label className="lp-register-label">
                      <i className="fas fa-lock lp-register-icon"></i> تأكيد كلمة المرور
                    </label>
                    <div className="lp-register-pass">
                      <input
                        className="lp-register-input"
                        type={showPass2 ? "text" : "password"}
                        placeholder="تأكيد كلمة المرور"
                        autoComplete="new-password"
                        required
                        value={password2}
                        onChange={(e) => setPassword2(e.target.value)}
                        disabled={loading}
                      />
                      <button
                        type="button"
                        className="lp-register-eye"
                        onClick={() => setShowPass2((v) => !v)}
                        aria-label={showPass2 ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
                        disabled={loading}
                      >
                        <i className={showPass2 ? "fas fa-eye-slash" : "fas fa-eye"}></i>
                      </button>
                    </div>

                    {password2 && password2.length > 0 && (
                      <small
                        style={{
                          color: passwordsMatch ? "#22c55e" : "#ef4444",
                          display: "block",
                          marginTop: "4px",
                        }}
                      >
                        <i
                          className={`fas fa-${passwordsMatch ? "check-circle" : "times-circle"}`}
                        ></i>
                        {passwordsMatch ? " كلمات المرور تتطابق" : " كلمات المرور لا تتطابق"}
                      </small>
                    )}
                  </div>

                  <div className="lp-register-form-group terms-group">
                    <label
                      className="lp-register-agree"
                      style={{ display: "flex", alignItems: "flex-start", gap: "8px" }}
                    >
                      <input
                        type="checkbox"
                        checked={agree}
                        onChange={(e) => setAgree(e.target.checked)}
                        required
                        disabled={loading}
                        style={{ marginTop: "4px" }}
                      />
                      <span style={{ fontSize: "0.9rem", color: "var(--text-secondary)" }}>
                        <a href="#" className="terms-link" onClick={openTerms}>
                          شروط الإستخدام
                        </a>
                        {" "}و{" "}
                        <a href="#" className="terms-link" onClick={openPrivacy}>
                          سياسة الخصوصية
                        </a>
                        {" "}لقد قرأت ووافقت 
                      </span>
                    </label>
                  </div>

                  {error && (
                    <div
                      className="error-message"
                      style={{
                        backgroundColor: "rgba(239, 68, 68, 0.1)",
                        border: "1px solid #ef4444",
                        borderRadius: "8px",
                        padding: "10px",
                        marginTop: "10px",
                        color: "#ef4444",
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                      }}
                    >
                      <i className="fas fa-exclamation-circle"></i>
                      <p style={{ margin: 0, fontSize: "14px" }}>{sanitizeText(error)}</p>
                    </div>
                  )}

                  <button className="lp-register-btn" type="submit" disabled={!isFormValid || loading}>
                    <i className="fas fa-user-plus"></i>
                    {loading ? "...جاري المعالجة" : " تسجيل"}
                  </button>
                </form>

                <div className="lp-register-social">
                  <div className="lp-register-or">
                    <span>أو</span>
                  </div>
                  <div className="social-icons">
                    <button
                      className="social-icon google"
                      type="button"
                      onClick={handleGoogle}
                      aria-label="Google المتابعة باستخدام"
                      disabled={loading}
                    >
                      <img src={googleLogo} alt="Google" className="social-icon-img" />
                    </button>

                    
                  </div>
                </div>
              </>
            ) : (
              <form className="lp-register-form" onSubmit={handleVerifyOtp}>
                <div className="lp-register-header" style={{ marginBottom: "20px" }}>
                  <h3 className="lp-register-title">SMS التحقق عبر</h3>
                  <p className="lp-register-subtitle">
                    أدخل الرمز المكون من 6 أرقام المرسل إلى هاتفك
                  </p>
                </div>

                <div className="lp-register-form-group">
                  <input
                    className="lp-register-input"
                    type="text"
                    placeholder="رمز التحقق"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    required
                    disabled={loading}
                  />
                </div>

                {error && (
                  <div
                    className="error-message"
                    style={{
                      backgroundColor: "rgba(239, 68, 68, 0.1)",
                      border: "1px solid #ef4444",
                      borderRadius: "8px",
                      padding: "10px",
                      margin: "10px 0",
                      color: "#ef4444",
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                    }}
                  >
                    <i className="fas fa-exclamation-circle"></i>
                    <p style={{ margin: 0, fontSize: "14px" }}>{sanitizeText(error)}</p>
                  </div>
                )}

                <button
                  className="lp-register-btn"
                  type="submit"
                  disabled={loading || otp.length < 6}
                >
                  {loading ? "جاري التحقق..." : "التحقق والتسجيل"}
                </button>
              </form>
            )}

            <p className="lp-register-bottom">
              لديك حساب بالفعل؟ <Link to="/login">تسجيل الدخول</Link>
            </p>
          </section>

          <section className="lp-register-right">
            <div className="benefits-list">
              <h3>ماذا ستكسب عند التسجيل مجانًا؟</h3>
              <ul>
                <li><i className="fas fa-check-circle"></i> الوصول الفوري إلى آلاف الخبراء</li>
                <li><i className="fas fa-check-circle"></i>نظام دفع آمن</li>
                <li><i className="fas fa-check-circle"></i> دعم مباشر على مدار الساعة 24/7</li>
                <li><i className="fas fa-check-circle"></i> متابعة العمل والإشعارات</li>
              </ul>
            </div>
          </section>
        </div>

        <PolicyModal
          open={policyOpen}
          title={policyType === "terms" ? "الشروط والأحكام" : "سياسة الخصوصية"}
          onClose={() => setPolicyOpen(false)}
        >
          <div className="policy-placeholder">
            <p style={{ color: "var(--text-muted)" }}>
              {policyType === "terms"
                ? "ستظهر شروط والأحكام هنا."
                : "ستظهر سياسة الخصوصية هنا."}
            </p>
          </div>
        </PolicyModal>

        {mergeOpen && (
          <div className="lp-google-modal-overlay">
            <div className="lp-google-modal-box">
              <div className="lp-google-modal-header">
                <h3>دمج الحساب</h3>
              </div>

              <div className="lp-google-modal-body">
                <p>
                  يوجد لديك بالفعل حساب باستخدام هذا البريد الإلكتروني.
                </p>

                <p className="lp-google-modal-note">
                  بعد التحقق من الحساب الحالي، سنربط تسجيل Google بهذا الحساب.
                </p>

                <div className="lp-register-form-group" style={{ marginBottom: 0 }}>
                  <label className="lp-register-label">
                    <i className="fas fa-envelope lp-register-icon"></i> E-Posta
                  </label>
                  <input
                    className="lp-register-input"
                    type="email"
                    value={sanitizeText(mergeEmail)}
                    disabled
                  />
                </div>

                <div className="lp-register-form-group" style={{ marginBottom: 0 }}>
                  <label className="lp-register-label">
                    <i className="fas fa-lock lp-register-icon"></i> كلمة المرور الحالية
                  </label>
                  <input
                    className="lp-register-input"
                    type="password"
                    placeholder="كلمة المرور للحساب الحالي"
                    value={mergePassword}
                    onChange={(e) => setMergePassword(e.target.value)}
                    disabled={loading}
                  />
                </div>

                <div className="lp-google-modal-actions">
                  <button
                    type="button"
                    className="lp-google-modal-btn lp-google-modal-btn-secondary"
                    onClick={() => {
                      navigate("/login", {
                        state: {
                          prefillEmail: mergeEmail,
                          loginNoticeType: "existing_password_account",
                        },
                      });
                    }}
                    disabled={loading}
                  >
                    تسجيل الدخول بكلمة المرور
                  </button>

                  <button
                    type="button"
                    className="lp-google-modal-btn"
                    onClick={handleConfirmMerge}
                    disabled={loading || !mergePassword.trim()}
                  >
                    {loading ? "جارٍ الربط..." : "الربط مع Google"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        <ExistingAccountModal
          open={existingAccountOpen}
          email={existingAccountEmail}
          mode={existingAccountMode}
          onClose={() => setExistingAccountOpen(false)}
          onContinueGoogle={async () => {
            setExistingAccountOpen(false);
            await handleGoogle();
          }}
          onGoLogin={() => {
            navigate("/login", {
              state: {
                prefillEmail: existingAccountEmail,
                loginNoticeType:
                  existingAccountMode === "google_exists"
                    ? "google_account_exists"
                    : "existing_password_account",
              },
            });
          }}
        />
      </div>
    </PageTransition>
  );
}
