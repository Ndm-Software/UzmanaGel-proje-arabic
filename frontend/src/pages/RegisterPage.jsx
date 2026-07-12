// RegisterPage.jsx file code 

import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import "../styles/RegisterPage.css";
import PageTransition from "../components/PageTransition";
import brandImage from "../assets/pictures/Logo.png";
import PolicyModal from "../components/PolicyModal";
import DOMPurify from 'dompurify';
import LoadingSpinner from "../components/LoadingSpinner";
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
  const title = isGoogleMode ? "Zaten Hesabınız Var" : "Hesap Mevcut";

  return (
    <div className="lp-modal-overlay" onClick={onClose}>
      <div className="lp-modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="lp-modal-header">
          <h3>{title}</h3>
          <button
            type="button"
            className="lp-modal-close-btn"
            onClick={onClose}
            aria-label="Kapat"
          >
            <i className="fas fa-times"></i>
          </button>
        </div>

        <div className="lp-modal-body">
          <p className="lp-modal-helper">
            <strong>{sanitizeText(email)}</strong> adresiyle zaten bir hesap var.
          </p>

          {isGoogleMode ? (
            <>
              <p className="lp-modal-helper">
                Bu hesap daha önce Google ile oluşturulmuş. Devam etmek için lütfen Google ile giriş yapın.
              </p>
              <div className="lp-modal-actions" style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button type="button" className="lp-modal-secondary-btn" onClick={onGoLogin}>
                  Giriş Sayfasına Git
                </button>
                <button type="button" className="lp-modal-primary-btn" onClick={onContinueGoogle}>
                  Google ile Devam Et
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="lp-modal-helper">
                Bu hesap zaten mevcut. Yeni kayıt oluşturmak yerine giriş yapmalısınız.
              </p>
              <div className="lp-modal-actions" style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button type="button" className="lp-modal-primary-btn" onClick={onGoLogin}>
                  Giriş Yap
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
    return <LoadingSpinner text="Sistem ayarları kontrol ediliyor..." />;
  }

  if (maintenanceMode) {
    return (
      <div className="maintenance-page">
        <div className="maintenance-content">
          <i className="fas fa-tools fa-4x"></i>
          <h1>Bakım Modu</h1>
          <p>Sitemizde bakım çalışması yapılmaktadır.</p>
          <p>Lütfen daha sonra tekrar deneyin.</p>
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
          <h1>Yeni Kayıtlar Durduruldu</h1>
          <p>Şu anda yeni kayıtlar geçici olarak durdurulmuştur.</p>
          <p>Daha sonra tekrar deneyin.</p>
          <Link to="/" className="registrations-home-btn">
            Ana Sayfaya Dön
          </Link>
          <Link to="/login" className="registrations-login-btn">
            Giriş Yap
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
      setEmailError("E-posta zorunludur.");
      return false;
    }

    if (!emailRegex.test(normalizedValue)) {
      setEmailError("Lütfen geçerli bir e-posta adresi girin.");
      return false;
    }

    const domain = normalizedValue.split("@")[1]?.toLowerCase();
    if (!validEmailDomains.includes(domain)) {
      setEmailError("Geçersiz e-posta domaini.");
      return false;
    }

    setEmailError("");
    return true;
  };

  const validatePhone = (phoneStr) => {
    const cleaned = String(phoneStr || "").replace(/[\s()-]/g, "");

    if (!cleaned) {
      setPhoneError("Telefon numarası zorunludur.");
      return false;
    }

    if (!/^\d+$/.test(cleaned)) {
      setPhoneError("Telefon sadece rakamlardan oluşmalıdır.");
      return false;
    }

    if (cleaned.length !== 10) {
      setPhoneError("Telefon numarası 10 haneli olmalıdır (5xx xxx xx xx).");
      return false;
    }

    if (!cleaned.startsWith("5")) {
      setPhoneError("Telefon 5 ile başlamalıdır.");
      return false;
    }

    setPhoneError("");
    return true;
  };

  const validatePassword = (pass) => {
    const errors = [];
    if (pass.length < 6) errors.push("En az 6 karakter olmalıdır");
    if (!/[A-Z]/.test(pass)) errors.push("En az 1 büyük harf içermelidir");
    if (!/[a-z]/.test(pass)) errors.push("En az 1 küçük harf içermelidir");
    if (!/[0-9]/.test(pass)) errors.push("En az 1 rakam içermelidir");
    if (hasConsecutiveChars(pass)) errors.push("Ardışık karakterler içermemelidir");
    if (hasRepeatedChars(pass)) errors.push("Aynı karakteri 3 kez tekrarlamamalıdır");
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
    setPhoneError("");
    setEmailTouched(true);
    setPhoneTouched(true);

    if (!fullName || !email || !phone || !password || !password2) {
      return setError("Lütfen tüm zorunlu alanları doldurun.");
    }

    if (!agree) {
      return setError("Devam etmek için şartları kabul etmelisiniz.");
    }

    if (password !== password2) {
      return setError("Şifreler eşleşmiyor.");
    }

    if (!validateEmail(email)) {
      return setError("Lütfen geçerli bir e-posta adresi girin.");
    }

    if (!validatePhone(phone)) {
      return setError("Telefon numarası 5xx xxx xx xx formatında olmalıdır.");
    }

    const passwordCheck = validatePassword(password);
    if (passwordCheck.length > 0) {
      return setError("Şifre gereksinimleri karşılamıyor.");
    }

    if (passwordStrength !== 100) {
      return setError("Şifreniz belirtilen kurallara uygun olmalıdır.");
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
        phoneNumber: phone,
      });

      const draft = await registerExpertDraft({
        userData: {
          fullName: sanitizeText(fullName),
          email: cleanEmail,
          password,
          phone: `+90${phone}`,
        },
      });

      setPendingUserData(draft);

      clearRecaptcha();
      initRecaptcha("recaptcha-container");

      // 7 mayis modified by Edrees
      const confirmation = await sendPhoneOtp(draft.phone, {
        blockExistingPhone: true,
      });

      setConfirmationResult(confirmation);
      setShowOtpScreen(true);
    } catch (err) {
      if (err?.field === "email") {
        setEmailError("Bu e-posta adresi kullanılamaz.");
      } else if (err?.field === "phoneNumber") {
        setPhoneError("Bu telefon numarası kullanılamaz.");
      } else {
        setError("SMS gönderilirken bir hata oluştu. Lütfen daha sonra tekrar deneyin.");
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
        setError("Doğrulama oturumu bulunamadı. Lütfen tekrar kayıt olun.");
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

      setError("Kod doğrulanamadı. Lütfen tekrar deneyin.");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setError("");

    // Bakım modunda Google girişini de engelle
    if (maintenanceMode) {
      setError("Bakım modu nedeniyle kayıt yapılamıyor.");
      return;
    }

    // Yeni kayıtlar kapalıysa Google ile kaydı da engelle
    if (!registrationsOpen) {
      setError("Yeni kayıtlar şu anda geçici olarak durdurulmuştur.");
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
            "Google açılır penceresi engellendi. Lütfen tarayıcı ayarlarınızı kontrol edin."
        );
        return;
      }

      if (
        err?.code === "DELETED_ACCOUNT_IN_RETENTION" ||
        err?.code === "SOCIAL_LOGIN_BLOCKED_DELETED_ACCOUNT"
      ) {
        setError(
          err?.message ||
            "Bu hesap silinmiş durumda ve geri yükleme süresi devam ediyor. Lütfen hesabınızı geri yükleyin."
        );
        return;
      }

      if (err?.code === "GOOGLE_EMAIL_MISSING") {
        setError(err?.message || "Google hesabından geçerli bir e-posta alınamadı.");
        return;
      }

      setError("Google ile devam edilemedi. Lütfen daha sonra tekrar deneyin.");
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
      setError("Hesap birleştirilemedi. Lütfen daha sonra tekrar deneyin.");
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
    phone.length === 10 &&
    password &&
    password2 &&
    !emailError &&
    !phoneError &&
    passwordStrength === 100 &&
    passwordsMatch &&
    agree;

  return (
    <PageTransition>
      <div className="lp-register">
        <header className="lp-register-topbrand">
          <Link to="/" className="lp-register-topbrand-link" aria-label="خبير">
            <img className="lp-register-topbrand-logo" src={brandImage} alt="خبير" />
            <span className="lp-register-topbrand-text">
              Uzmana<span className="highlight">Gel</span>
            </span>
          </Link>
        </header>

        <div className="lp-register-card">
          <section className="lp-register-left">
            <div className="lp-register-header">
              <h1 className="lp-register-title">Hesap Oluştur</h1>
              <p className="lp-register-subtitle">Ücretsiz kaydol, hemen başla</p>
            </div>

            <div id="recaptcha-container"></div>

            {!showOtpScreen ? (
              <>
                <form className="lp-register-form" onSubmit={handleSubmit}>
                  <div className="lp-register-form-group">
                    <label className="lp-register-label">
                      <i className="fas fa-user lp-register-icon"></i> Ad Soyad
                    </label>
                    <input
                      className="lp-register-input"
                      type="text"
                      placeholder="Ad Soyad"
                      autoComplete="name"
                      required
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      disabled={loading}
                    />
                  </div>

                  <div className="lp-register-form-group">
                    <label className="lp-register-label">
                      <i className="fas fa-envelope lp-register-icon"></i> E-Posta
                    </label>
                    <input
                      className="lp-register-input"
                      type="email"
                      placeholder="E-Posta"
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
                      <i className="fas fa-phone lp-register-icon"></i> Telefon
                    </label>
                    <div
                      className="lp-register-phone-wrapper"
                      style={{ display: "flex", alignItems: "center", gap: "8px" }}
                    >
                      <span
                        className="lp-register-phone-prefix"
                        style={{
                          padding: "0 10px",
                          background: "var(--bg-secondary)",
                          borderRadius: "8px",
                          border: "1px solid var(--border-color)",
                          height: "45px",
                          display: "flex",
                          alignItems: "center",
                        }}
                      >
                        +90
                      </span>
                      <input
                        className="lp-register-input lp-register-phone-input"
                        type="tel"
                        placeholder="5xx xxx xx xx"
                        autoComplete="tel"
                        required
                        value={formatPhone(phone)}
                        onChange={handlePhoneChange}
                        onBlur={handlePhoneBlur}
                        disabled={loading}
                        style={{ flex: 1 }}
                      />
                    </div>
                    {phoneError && phoneTouched && (
                      <small style={{ color: "#ef4444", display: "block", marginTop: "4px" }}>
                        <i className="fas fa-times-circle"></i> {sanitizeText(phoneError)}
                      </small>
                    )}
                  </div>

                  <div className="lp-register-form-group">
                    <label className="lp-register-label">
                      <i className="fas fa-lock lp-register-icon"></i> Şifre
                    </label>
                    <div className="lp-register-pass">
                      <input
                        className="lp-register-input"
                        type={showPass ? "text" : "password"}
                        placeholder="Şifre"
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
                        aria-label={showPass ? "Şifreyi gizle" : "Şifreyi göster"}
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
                      En az 6 karakter, 1 büyük harf, 1 küçük harf, 1 rakam
                    </small>
                  </div>

                  <div className="lp-register-form-group">
                    <label className="lp-register-label">
                      <i className="fas fa-lock lp-register-icon"></i> Şifre Tekrar
                    </label>
                    <div className="lp-register-pass">
                      <input
                        className="lp-register-input"
                        type={showPass2 ? "text" : "password"}
                        placeholder="Şifre Tekrar"
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
                        aria-label={showPass2 ? "Şifreyi gizle" : "Şifreyi göster"}
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
                        {passwordsMatch ? " Şifreler eşleşiyor" : " Şifreler eşleşmiyor"}
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
                          Kullanım Koşulları
                        </a>
                        {" "}ve{" "}
                        <a href="#" className="terms-link" onClick={openPrivacy}>
                          Gizlilik Politikası
                        </a>
                        {" "}okudum, kabul ediyorum.
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
                    {loading ? " İşleniyor..." : " Kaydol"}
                  </button>
                </form>

                <div className="lp-register-social">
                  <div className="lp-register-or">
                    <span>veya</span>
                  </div>
                  <div className="social-icons">
                    <button
                      className="social-icon google"
                      type="button"
                      onClick={handleGoogle}
                      aria-label="Google ile devam et"
                      disabled={loading}
                    >
                      <img src={googleLogo} alt="Google" className="social-icon-img" />
                    </button>

                    <button
                      className="social-icon phone"
                      type="button"
                      onClick={handlePhoneInfo}
                      aria-label="Telefon ile kayıt ol"
                      disabled={loading}
                    >
                      <img src={phoneLogo} alt="Telefon" className="social-icon-img phone-icon-img" />
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <form className="lp-register-form" onSubmit={handleVerifyOtp}>
                <div className="lp-register-header" style={{ marginBottom: "20px" }}>
                  <h3 className="lp-register-title">SMS Doğrulama</h3>
                  <p className="lp-register-subtitle">
                    Telefonunuza gönderilen 6 haneli kodu girin
                  </p>
                </div>

                <div className="lp-register-form-group">
                  <input
                    className="lp-register-input"
                    type="text"
                    placeholder="Doğrulama Kodu"
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
                  {loading ? "Doğrulanıyor..." : "Doğrula ve Kaydol"}
                </button>
              </form>
            )}

            <p className="lp-register-bottom">
              Zaten hesabın var mı? <Link to="/login">Giriş Yap</Link>
            </p>
          </section>

          <section className="lp-register-right">
            <div className="benefits-list">
              <h3>Ücretsiz kaydolunca neler kazanacaksın?</h3>
              <ul>
                <li><i className="fas fa-check-circle"></i> Binlerce uzmana anında ulaş</li>
                <li><i className="fas fa-check-circle"></i> Güvenli ödeme sistemi</li>
                <li><i className="fas fa-check-circle"></i> 7/24 canlı destek</li>
                <li><i className="fas fa-check-circle"></i> İş takibi ve bildirimler</li>
              </ul>
            </div>
          </section>
        </div>

        <PolicyModal
          open={policyOpen}
          title={policyType === "terms" ? "Kullanım Koşulları" : "Gizlilik Politikası"}
          onClose={() => setPolicyOpen(false)}
        >
          <div className="policy-placeholder">
            <p style={{ color: "var(--text-muted)" }}>
              {policyType === "terms"
                ? "Kullanım koşulları içeriği burada yer alacak."
                : "Gizlilik politikası içeriği burada yer alacak."}
            </p>
          </div>
        </PolicyModal>

        {mergeOpen && (
          <div className="lp-google-modal-overlay">
            <div className="lp-google-modal-box">
              <div className="lp-google-modal-header">
                <h3>Hesabı Birleştir</h3>
              </div>

              <div className="lp-google-modal-body">
                <p>
                  Bu e-posta adresiyle zaten bir hesabınız var.
                </p>

                <p className="lp-google-modal-note">
                  Mevcut hesabınızı doğruladıktan sonra Google girişini bu hesaba bağlayacağız.
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
                    <i className="fas fa-lock lp-register-icon"></i> Mevcut Şifre
                  </label>
                  <input
                    className="lp-register-input"
                    type="password"
                    placeholder="Mevcut hesabınızın şifresi"
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
                    Şifre ile Giriş Yap
                  </button>

                  <button
                    type="button"
                    className="lp-google-modal-btn"
                    onClick={handleConfirmMerge}
                    disabled={loading || !mergePassword.trim()}
                  >
                    {loading ? "Bağlanıyor..." : "Google ile Birleştir"}
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
