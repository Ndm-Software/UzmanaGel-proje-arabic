// ExpertRegisterPage.jsx file code 

import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import PolicyModal from "../components/PolicyModal";
import { checkRegistrationEligibility } from "../services/registrationGuardService";
import {
  initRecaptcha,
  sendPhoneOtp,
  clearRecaptcha,
  registerExpertDraft,
  finalizeExpertRegistration,
  logout,
} from "../firebase/authService";
import DOMPurify from 'dompurify';
import "../styles/RegisterPage.css";
import PageTransition from "../components/PageTransition";
import brandImage from "../assets/pictures/Logo.png";
import LoadingSpinner from "../components/LoadingSpinner";
import { useSystemSettings } from "../hooks/useSystemSettings";

const isDevelopment = process.env.NODE_ENV === 'development';

const sanitizeText = (text) => {
  if (!text) return '';
  return DOMPurify.sanitize(String(text));
};

/* ─── Şifre Yardımcı Fonksiyonları ─── */
const hasSpecialChar = (str) =>
  /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>/?]/.test(str);

const hasConsecutiveChars = (str) => {
  for (let i = 0; i < str.length - 2; i++) {
    const c1 = str.charCodeAt(i);
    const c2 = str.charCodeAt(i + 1);
    const c3 = str.charCodeAt(i + 2);
    const isNum = (c) => c >= 48 && c <= 57;
    const isLower = (c) => c >= 97 && c <= 122;
    const isUpper = (c) => c >= 65 && c <= 90;

    if (
      isNum(c1) &&
      isNum(c2) &&
      isNum(c3) &&
      ((c2 === c1 + 1 && c3 === c2 + 1) || (c2 === c1 - 1 && c3 === c2 - 1))
    ) {
      return true;
    }

    if (
      isLower(c1) &&
      isLower(c2) &&
      isLower(c3) &&
      c2 === c1 + 1 &&
      c3 === c2 + 1
    ) {
      return true;
    }

    if (
      isUpper(c1) &&
      isUpper(c2) &&
      isUpper(c3) &&
      c2 === c1 + 1 &&
      c3 === c2 + 1
    ) {
      return true;
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

const ExpertRegisterPage = () => {
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

  const [policyOpen, setPolicyOpen] = useState(false);
  const [policyType, setPolicyType] = useState("terms");

  const [otp, setOtp] = useState("");
  const [showOtpScreen, setShowOtpScreen] = useState(false);
  const [confirmationResult, setConfirmationResult] = useState(null);
  const [pendingUserData, setPendingUserData] = useState(null);

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
  ];

  useEffect(() => {
    logout().catch(() => {});
    const saved = localStorage.getItem("theme");
    const initial = saved === "light" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", initial);

    return () => {
      clearRecaptcha();
    };
  }, []);

  // Bakım modu kontrolü
  if (settingsLoading) {
    return <LoadingSpinner text="Sistem ayarları kontrol ediliyor..." />;
  }

  // Bakım modu aktifse sayfayı gösterme
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

  // Yeni kayıtlar kapalıysa uzman başvurusunu da engelle
  if (!registrationsOpen) {
    return (
      <div className="registrations-closed-page">
        <div className="registrations-closed-content">
          <i className="fas fa-door-closed fa-4x"></i>
          <h1>Yeni Kayıtlar Durduruldu</h1>
          <p>Şu anda yeni kayıtlar geçici olarak durdurulmuştur.</p>
          <p>Uzman başvuruları da şu anda alınmamaktadır.</p>
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
      setPhoneError("Telefon numarası sadece rakamlardan oluşmalıdır.");
      return false;
    }

    if (cleaned.length !== 10) {
      setPhoneError("Telefon numarası 10 haneli olmalıdır (5xx xxx xx xx).");
      return false;
    }

    if (!cleaned.startsWith("5")) {
      setPhoneError("Telefon numarası 5 ile başlamalıdır.");
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
    if (!hasSpecialChar(pass)) errors.push("En az 1 özel karakter içermelidir");
    if (hasConsecutiveChars(pass)) {
      errors.push("Ardışık karakterler içermemelidir (örn. abc, 123)");
    }
    if (hasRepeatedChars(pass)) {
      errors.push("Aynı karakteri 3 kez tekrarlamamalıdır (örn. aaa)");
    }
    return errors;
  };

  const handlePasswordChange = (e) => {
    const pass = e.target.value;
    setPassword(pass);

    let strength = 0;
    if (pass.length >= 6) strength += 20;
    if (/[A-Z]/.test(pass)) strength += 20;
    if (/[a-z]/.test(pass)) strength += 20;
    if (/[0-9]/.test(pass)) strength += 20;
    if (hasSpecialChar(pass)) strength += 20;
    if (hasConsecutiveChars(pass)) strength -= 40;
    if (hasRepeatedChars(pass)) strength -= 40;

    strength = Math.max(0, Math.min(100, strength));
    setPasswordStrength(strength);
    setPasswordErrors(validatePassword(pass));
  };

  const handleEmailChange = (e) => {
    const newEmail = e.target.value;
    setEmail(newEmail);
    setError("");
    if (newEmail) validateEmail(newEmail);
    else setEmailError("");
  };

  const handlePhoneChange = (e) => {
    const raw = e.target.value.replace(/\D/g, "");
    const cleaned = raw.slice(0, 10);
    setPhone(cleaned);
    setError("");
    if (cleaned) validatePhone(cleaned);
    else setPhoneError("");
  };

  const getPasswordStrengthColor = () => {
    if (passwordStrength === 0) return "#4b5563";
    if (passwordStrength <= 25) return "#ef4444";
    if (passwordStrength <= 50) return "#f97316";
    if (passwordStrength <= 75) return "#eab308";
    return "#22c55e";
  };

  const getPasswordStrengthText = () => {
    if (passwordStrength === 0) return "Şifre gücü: Zayıf";
    if (passwordStrength <= 25) return "Şifre gücü: Çok Zayıf";
    if (passwordStrength <= 50) return "Şifre gücü: Orta";
    if (passwordStrength <= 75) return "Şifre gücü: İyi";
    if (passwordStrength < 100) return "Şifre gücü: Çok İyi";
    return "Şifre gücü: Mükemmel ✓";
  };

  const formatPhone = (digits) => {
    if (!digits) return "";
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

  const applyEligibilityError = (eligibilityError) => {
    const message = "Kayıt için uygunluk kontrolü başarısız oldu.";

    if (eligibilityError?.field === "email") {
      setEmailError(message);
      setError(message);
      return;
    }

    if (eligibilityError?.field === "phoneNumber") {
      setPhoneError(message);
      setError(message);
      return;
    }

    setError(message);
  };

  const runEligibilityCheck = async () => {
    setError("");

    return await checkRegistrationEligibility({
      email: String(email || "").trim().toLowerCase(),
      phoneNumber: phone,
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setEmailError("");
    setPhoneError("");

    if (!fullName || !email || !phone || !password || !password2) {
      setError("Lütfen tüm zorunlu alanları doldurun.");
      return;
    }

    if (!agree) {
      setError("Devam etmek için şartları kabul etmelisiniz.");
      return;
    }

    if (password !== password2) {
      setError("Şifreler eşleşmiyor.");
      return;
    }

    if (!validateEmail(email)) {
      setError("Geçerli bir e-posta adresi girin.");
      return;
    }

    if (!validatePhone(phone)) {
      setError("Telefon numarası 5xx xxx xx xx formatında olmalıdır.");
      return;
    }

    const passwordCheck = validatePassword(password);
    if (passwordCheck.length > 0) {
      setError("Şifre gereksinimleri karşılanmıyor.");
      return;
    }

    if (passwordStrength !== 100) {
      setError("Şifre yeterince güçlü değil.");
      return;
    }

    try {
      setLoading(true);

      try {
        await runEligibilityCheck();
      } catch (eligibilityError) {
        applyEligibilityError(eligibilityError);
        return;
      }

      const draft = await registerExpertDraft({
        userData: {
          fullName,
          email: String(email || "").trim().toLowerCase(),
          password,
          phone: `+90${phone}`,
        },
      });

      setPendingUserData(draft);

      clearRecaptcha();
      const container = document.getElementById("recaptcha-container");
      if (container) container.innerHTML = "";
      initRecaptcha("recaptcha-container");

      // 7 mayis modified by Edrees
      const confirmation = await sendPhoneOtp(draft.phone, {
        blockExistingPhone: true,
      });


      setConfirmationResult(confirmation);
      setShowOtpScreen(true);
    } catch (err) {
      if (isDevelopment) console.error("Kayıt hatası:", err.message);
      setError("Hesap oluşturulurken bir hata oluştu. Lütfen daha sonra tekrar deneyin.");
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

      try {
        await runEligibilityCheck();
      } catch (eligibilityError) {
        applyEligibilityError(eligibilityError);
        setLoading(false);
        return;
      }

      await finalizeExpertRegistration({
        confirmationResult,
        code: otp,
        userData: pendingUserData,
        userType: "PENDING_PROVIDER",
      });

      // Edrees added this to solve JWT issue 7 mayis
      await logout();

      sessionStorage.removeItem("phoneRegistrationVerified");
      sessionStorage.removeItem("phoneRegistrationNumber");

      navigate("/login", {
        replace: true,
        state: {
          prefillEmail: pendingUserData?.email || "",
          loginNoticeType: "registration_success",
        },
      });
    } catch (err) {
      if (isDevelopment) console.error("OTP doğrulama hatası:", err.message);
      setError("Kod doğrulanamadı. Lütfen tekrar deneyin.");
    } finally {
      setLoading(false);
    }
  };

  const isFormValid = () =>
    fullName.trim().length > 0 &&
    email.trim().length > 0 &&
    phone.length === 10 &&
    password.length > 0 &&
    password2.length > 0 &&
    emailError === "" &&
    phoneError === "" &&
    passwordStrength === 100 &&
    password === password2 &&
    agree &&
    !loading;

  return (
    <PageTransition>
      <div className="expert-register-page">
        <header className="lp-register-topbrand">
          <Link to="/" className="lp-register-topbrand-link" aria-label="UzmanaGel Home">
            <img className="lp-register-topbrand-logo" src={brandImage} alt="UzmanaGel" />
            <span className="lp-register-topbrand-text">
              Uzmana<span className="highlight">Gel</span>
            </span>
          </Link>
        </header>

        <div className="lp-register-card">
          <section className="lp-register-left">
            <div className="lp-register-header">
              <h1 className="lp-register-title">Uzman Kaydı</h1>
              <p className="lp-register-subtitle">
                Temel bilgilerinizi girerek başvuru sürecini başlatın
              </p>
            </div>

            <div id="recaptcha-container"></div>

            {!showOtpScreen ? (
              <form className="lp-register-form" onSubmit={handleSubmit}>
                <div className="lp-register-form-group">
                  <label className="lp-register-label">
                    <i className="fas fa-user lp-register-icon"></i>
                    Ad Soyad <span className="required">*</span>
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
                    <i className="fas fa-envelope lp-register-icon"></i>
                    E-Posta <span className="required">*</span>
                  </label>
                  <input
                    className="lp-register-input"
                    type="email"
                    placeholder="E-posta adresiniz"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={handleEmailChange}
                    onBlur={() => email && validateEmail(email)}
                    disabled={loading}
                  />
                  {emailError && (
                    <small
                      style={{
                        color: "#ef4444",
                        display: "block",
                        marginTop: "4px",
                      }}
                    >
                      <i className="fas fa-times-circle"></i> {sanitizeText(emailError)}
                    </small>
                  )}
                </div>

                <div className="lp-register-form-group">
                  <label className="lp-register-label">
                    <i className="fas fa-phone lp-register-icon"></i>
                    Telefon <span className="required">*</span>
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
                      placeholder="5xx-xxx-xx-xx"
                      autoComplete="tel"
                      required
                      value={formatPhone(phone)}
                      onChange={handlePhoneChange}
                      onBlur={() => phone && validatePhone(phone)}
                      disabled={loading}
                      style={{ flex: 1 }}
                    />
                  </div>
                  {phoneError && (
                    <small
                      style={{
                        color: "#ef4444",
                        display: "block",
                        marginTop: "4px",
                      }}
                    >
                      <i className="fas fa-times-circle"></i> {sanitizeText(phoneError)}
                    </small>
                  )}
                </div>

                <div className="lp-register-form-group">
                  <label className="lp-register-label">
                    <i className="fas fa-lock lp-register-icon"></i>
                    Şifre <span className="required">*</span>
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
                      disabled={loading}
                    >
                      <i className={showPass ? "fas fa-eye-slash" : "fas fa-eye"}></i>
                    </button>
                  </div>

                  <div
                    style={{
                      marginTop: "8px",
                      height: "4px",
                      background: "var(--border-color)",
                      borderRadius: "2px",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        height: "100%",
                        transition: "all 0.3s ease",
                        width: `${passwordStrength}%`,
                        backgroundColor: getPasswordStrengthColor(),
                      }}
                    />
                  </div>

                  {password.length > 0 && (
                    <small
                      style={{
                        color: getPasswordStrengthColor(),
                        display: "block",
                        marginTop: "4px",
                        fontWeight: "600",
                      }}
                    >
                      {getPasswordStrengthText()}
                    </small>
                  )}

                  {password.length > 0 && passwordErrors.length > 0 && (
                    <div style={{ marginTop: "8px" }}>
                      <p
                        style={{
                          fontSize: "0.85rem",
                          color: "var(--text-muted)",
                          marginBottom: "4px",
                          fontWeight: "600",
                        }}
                      >
                        Eksik gereksinimler:
                      </p>
                      {passwordErrors.map((err, index) => (
                        <small
                          key={index}
                          style={{
                            color: "#ef4444",
                            display: "block",
                            marginTop: "2px",
                          }}
                        >
                          <i className="fas fa-times-circle"></i> {sanitizeText(err)}
                        </small>
                      ))}
                    </div>
                  )}

                  {password.length > 0 &&
                    passwordErrors.length === 0 &&
                    passwordStrength === 100 && (
                      <small
                        style={{
                          color: "#22c55e",
                          display: "block",
                          marginTop: "4px",
                          fontWeight: "600",
                        }}
                      >
                        <i className="fas fa-check-circle"></i> Şifre tüm gereksinimleri
                        karşılıyor ✓
                      </small>
                    )}

                  <small
                    style={{
                      color: "var(--text-muted)",
                      fontSize: "0.8rem",
                      marginTop: "8px",
                      display: "block",
                    }}
                  >
                    ✓ Min 6 karakter ✓ Büyük harf (A-Z) ✓ Küçük harf (a-z)
                    <br />
                    ✓ Rakam (0-9) ✓ Özel karakter (!@#$%^&*) ✓ Ardışık yok
                  </small>
                </div>

                <div className="lp-register-form-group">
                  <label className="lp-register-label">
                    <i className="fas fa-lock lp-register-icon"></i>
                    Şifre Tekrar <span className="required">*</span>
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
                      disabled={loading}
                    >
                      <i className={showPass2 ? "fas fa-eye-slash" : "fas fa-eye"}></i>
                    </button>
                  </div>
                  {password2.length > 0 && (
                    <small
                      style={{
                        color: password === password2 ? "#22c55e" : "#ef4444",
                        display: "block",
                        marginTop: "4px",
                        fontWeight: "600",
                      }}
                    >
                      <i
                        className={`fas fa-${
                          password === password2 ? "check-circle" : "times-circle"
                        }`}
                      ></i>
                      {password === password2
                        ? " Şifreler eşleşiyor ✓"
                        : " Şifreler eşleşmiyor ✗"}
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
                      'nı ve
                      <a href="#" className="terms-link" onClick={openPrivacy}>
                        {" "}
                        Gizlilik Politikası
                      </a>
                      'nı okudum, kabul ediyorum.
                      <span className="required">*</span>
                    </span>
                  </label>
                </div>

                {error && (
                  <div
                    style={{
                      backgroundColor: "rgba(239, 68, 68, 0.1)",
                      border: "1px solid #ef4444",
                      borderRadius: "8px",
                      padding: "12px 16px",
                      marginTop: "16px",
                      marginBottom: "16px",
                      color: "#ef4444",
                      display: "flex",
                      alignItems: "center",
                      gap: "12px",
                      fontSize: "14px",
                    }}
                  >
                    <i
                      className="fas fa-exclamation-circle"
                      style={{ fontSize: "18px" }}
                    ></i>
                    <p style={{ margin: 0 }}>{sanitizeText(error)}</p>
                  </div>
                )}

                <button
                  className="lp-register-btn"
                  type="submit"
                  disabled={!isFormValid()}
                  style={{
                    opacity: isFormValid() ? 1 : 0.5,
                    cursor: isFormValid() ? "pointer" : "not-allowed",
                  }}
                >
                  <i className="fas fa-user-plus"></i>
                  {loading ? " İşleniyor..." : " Devam Et"}
                </button>
              </form>
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
                    onChange={(e) =>
                      setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))
                    }
                    required
                    disabled={loading}
                  />
                </div>

                {error && (
                  <div
                    style={{
                      backgroundColor: "rgba(239, 68, 68, 0.1)",
                      border: "1px solid #ef4444",
                      borderRadius: "8px",
                      padding: "12px 16px",
                      marginTop: "16px",
                      marginBottom: "16px",
                      color: "#ef4444",
                      display: "flex",
                      alignItems: "center",
                      gap: "12px",
                      fontSize: "14px",
                    }}
                  >
                    <i
                      className="fas fa-exclamation-circle"
                      style={{ fontSize: "18px" }}
                    ></i>
                    <p style={{ margin: 0 }}>{sanitizeText(error)}</p>
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
            <p className="lp-register-bottom" style={{ marginTop: "10px" }}>
              Normal kullanıcı mısın? <Link to="/register">Kaydol</Link>
            </p>
          </section>

          <section className="lp-register-right">
            <div className="benefits-list">
              <h3>Uzman olarak neler kazanacaksın?</h3>
              <ul>
                <li>
                  <i className="fas fa-check-circle"></i> Yeni müşterilere ulaş
                </li>
                <li>
                  <i className="fas fa-check-circle"></i> Profesyonel panel ile iş
                  takibi
                </li>
                <li>
                  <i className="fas fa-check-circle"></i> Güvenli ödeme sistemi
                </li>
                <li>
                  <i className="fas fa-check-circle"></i> 7/24 destek
                </li>
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
      </div>
    </PageTransition>
  );
};

export default ExpertRegisterPage;