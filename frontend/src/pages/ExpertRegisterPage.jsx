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
  registerWithEmailDirect,
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
    return <LoadingSpinner text="يتم التحقق من إعدادات النظام..." />;
  }

  // Bakım modu aktifse sayfayı gösterme
  if (maintenanceMode) {
    return (
      <div className="maintenance-page">
        <div className="maintenance-content">
          <i className="fas fa-tools fa-4x"></i>
          <h1>وضع الصيانة</h1>
          <p>يتم حالياً إجراء أعمال صيانة على المنصة.</p>
          <p>يرجى المحاولة لاحقاً.</p>
          <Link to="/" className="maintenance-home-btn">
            العودة إلى الرئيسية
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
          <h1>تم إيقاف التسجيلات الجديدة</h1>
          <p>التسجيلات الجديدة متوقفة مؤقتاً في الوقت الحالي.</p>
          <p>طلبات الخبراء غير متاحة حالياً.</p>
          <Link to="/" className="registrations-home-btn">
            العودة إلى الرئيسية
          </Link>
          <Link to="/login" className="registrations-login-btn">
            تسجيل الدخول
          </Link>
        </div>
      </div>
    );
  }

  const validateEmail = (value) => {
    const normalizedValue = String(value || "").trim().toLowerCase();
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

    if (!normalizedValue) {
      setEmailError("البريد الإلكتروني مطلوب.");
      return false;
    }

    if (!emailRegex.test(normalizedValue)) {
      setEmailError("يرجى إدخال بريد إلكتروني صالح.");
      return false;
    }

    const domain = normalizedValue.split("@")[1]?.toLowerCase();
    if (!validEmailDomains.includes(domain)) {
      setEmailError("نطاق البريد الإلكتروني غير مدعوم.");
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
      setPhoneError("رقم الهاتف يجب أن يحتوي على أرقام فقط.");
      return false;
    }

    if (cleaned.length < 9 || cleaned.length > 15) {
      setPhoneError("رقم الهاتف يجب أن يتكون من 9 إلى 15 رقمًا.");
      return false;
    }

    setPhoneError("");
    return true;
  };

  const validatePassword = (pass) => {
    const errors = [];
    if (pass.length < 6) errors.push("يجب أن تكون 6 أحرف على الأقل");
    if (!/[A-Z]/.test(pass)) errors.push("يجب أن تحتوي على حرف كبير واحد على الأقل");
    if (!/[a-z]/.test(pass)) errors.push("يجب أن تحتوي على حرف صغير واحد على الأقل");
    if (!/[0-9]/.test(pass)) errors.push("يجب أن تحتوي على رقم واحد على الأقل");
    if (!hasSpecialChar(pass)) errors.push("يجب أن تحتوي على رمز خاص واحد على الأقل");
    if (hasConsecutiveChars(pass)) {
      errors.push("يجب ألا تحتوي على أحرف أو أرقام متتالية (مثل: abc أو 123)");
    }
    if (hasRepeatedChars(pass)) {
      errors.push("يجب ألا تكرر نفس الحرف 3 مرات متتالية (مثل: aaa)");
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
    if (passwordStrength === 0) return "قوة كلمة المرور: ضعيفة";
    if (passwordStrength <= 25) return "قوة كلمة المرور: ضعيفة جداً";
    if (passwordStrength <= 50) return "قوة كلمة المرور: متوسطة";
    if (passwordStrength <= 75) return "قوة كلمة المرور: جيدة";
    if (passwordStrength < 100) return "قوة كلمة المرور: جيدة جداً";
    return "قوة كلمة المرور: ممتازة ✓";
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
    const message = "فشل التحقق من أهلية التسجيل.";

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
      phoneNumber: "",
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setEmailError("");

    if (!fullName || !email || !password || !password2) {
      setError("يرجى تعبئة جميع الحقول المطلوبة.");
      return;
    }

    if (!agree) {
      setError("يجب قبول الشروط للمتابعة.");
      return;
    }

    if (password !== password2) {
      setError("كلمتا المرور غير متطابقتين.");
      return;
    }

    if (!validateEmail(email)) {
      setError("يرجى إدخال بريد إلكتروني صالح.");
      return;
    }

    const passwordCheck = validatePassword(password);
    if (passwordCheck.length > 0) {
      setError("متطلبات كلمة المرور غير مكتملة.");
      return;
    }

    if (passwordStrength !== 100) {
      setError("كلمة المرور ليست قوية بما يكفي.");
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

      await registerWithEmailDirect({
        name: sanitizeText(fullName),
        email: String(email || "").trim().toLowerCase(),
        password,
        phone: "",
        userType: "PENDING_PROVIDER",
      });

      await logout();

      navigate("/login", {
        replace: true,
        state: {
          prefillEmail: String(email || "").trim().toLowerCase(),
          loginNoticeType: "registration_success",
        },
      });
    } catch (err) {
      if (isDevelopment) console.error("Kayıt hatası:", err.message);
      setError("حدث خطأ أثناء إنشاء الحساب. يرجى المحاولة لاحقاً.");
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
      setError("تعذر التحقق من الرمز. يرجى المحاولة مرة أخرى.");
    } finally {
      setLoading(false);
    }
  };

  const isFormValid = () =>
    fullName.trim().length > 0 &&
    email.trim().length > 0 &&
    password.length > 0 &&
    password2.length > 0 &&
    emailError === "" &&
    passwordErrors.length === 0 &&
    password === password2 &&
    agree &&
    !loading;

  return (
    <PageTransition>
      <div className="expert-register-page">
        <header className="lp-register-topbrand">
          <Link to="/" className="lp-register-topbrand-link" aria-label="الصفحة الرئيسية">
            <img className="lp-register-topbrand-logo" src={brandImage} alt="خبير" />
            <span className="lp-register-topbrand-text">
              Uzmana<span className="highlight">Gel</span>
            </span>
          </Link>
        </header>

        <div className="lp-register-card">
          <section className="lp-register-left">
            <div className="lp-register-header">
              <h1 className="lp-register-title">تسجيل خبير</h1>
              <p className="lp-register-subtitle">
                أدخل معلوماتك الأساسية لبدء طلب الانضمام كخبير
              </p>
            </div>

            <div id="recaptcha-container"></div>

            {!showOtpScreen ? (
              <form className="lp-register-form" onSubmit={handleSubmit}>
                <div className="lp-register-form-group">
                  <label className="lp-register-label">
                    <i className="fas fa-user lp-register-icon"></i>
                    الاسم الكامل <span className="required">*</span>
                  </label>
                  <input
                    className="lp-register-input"
                    type="text"
                    placeholder="الاسم الكامل"
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
                    البريد الإلكتروني <span className="required">*</span>
                  </label>
                  <input
                    className="lp-register-input"
                    type="email"
                    placeholder="بريدك الإلكتروني"
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
                    <i className="fas fa-lock lp-register-icon"></i>
                    كلمة المرور <span className="required">*</span>
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
                        المتطلبات الناقصة:
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
                        <i className="fas fa-check-circle"></i> كلمة المرور تستوفي جميع المتطلبات ✓
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
                    ✓ 6 أحرف على الأقل ✓ حرف كبير (A-Z) ✓ حرف صغير (a-z)
                    <br />
                    ✓ رقم (0-9) ✓ رمز خاص (!@#$%^&*) ✓ بدون تسلسل
                  </small>
                </div>

                <div className="lp-register-form-group">
                  <label className="lp-register-label">
                    <i className="fas fa-lock lp-register-icon"></i>
                    تأكيد كلمة المرور <span className="required">*</span>
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
                        ? " كلمتا المرور متطابقتان ✓"
                        : " كلمتا المرور غير متطابقتين ✗"}
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
                        شروط الاستخدام
                      </a>
                      {" "}و{" "}
                      <a href="#" className="terms-link" onClick={openPrivacy}>
                        سياسة الخصوصية
                      </a>
                      {" "}قرأتهما وأوافق عليهما.
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
                  {loading ? " جارٍ المعالجة..." : " متابعة"}
                </button>
              </form>
            ) : (
              <form className="lp-register-form" onSubmit={handleVerifyOtp}>
                <div className="lp-register-header" style={{ marginBottom: "20px" }}>
                  <h3 className="lp-register-title">التحقق عبر SMS</h3>
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
                  {loading ? "جارٍ التحقق..." : "تحقق وسجّل"}
                </button>
              </form>
            )}

            <p className="lp-register-bottom">
              لديك حساب بالفعل؟ <Link to="/login">تسجيل الدخول</Link>
            </p>
            <p className="lp-register-bottom" style={{ marginTop: "10px" }}>
              هل أنت مستخدم عادي؟ <Link to="/register">أنشئ حساباً</Link>
            </p>
          </section>

          <section className="lp-register-right">
            <div className="benefits-list">
              <h3>ماذا ستحصل عليه كخبير؟</h3>
              <ul>
                <li>
                  <i className="fas fa-check-circle"></i> الوصول إلى عملاء جدد
                </li>
                <li>
                  <i className="fas fa-check-circle"></i> متابعة العمل من لوحة احترافية
                </li>
                <li>
                  <i className="fas fa-check-circle"></i> نظام دفع آمن
                </li>
                <li>
                  <i className="fas fa-check-circle"></i> دعم على مدار الساعة
                </li>
              </ul>
            </div>
          </section>
        </div>

        <PolicyModal
          open={policyOpen}
          title={policyType === "terms" ? "شروط الاستخدام" : "سياسة الخصوصية"}
          onClose={() => setPolicyOpen(false)}
        >
          <div className="policy-placeholder">
            <p style={{ color: "var(--text-muted)" }}>
              {policyType === "terms"
                ? "سيتم عرض محتوى شروط الاستخدام هنا."
                : "سيتم عرض محتوى سياسة الخصوصية هنا."}
            </p>
          </div>
        </PolicyModal>
      </div>
    </PageTransition>
  );
};

export default ExpertRegisterPage;
