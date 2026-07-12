import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import PageTransition from "../components/PageTransition";
import brandImage from "../assets/pictures/Logo.png";
import PolicyModal from "../components/PolicyModal";
import DOMPurify from 'dompurify';
import LoadingSpinner from "../components/LoadingSpinner";
import { useSystemSettings } from "../hooks/useSystemSettings";

import {
  initRecaptcha,
  clearRecaptcha,
  sendPhoneOtp,
  confirmPhoneOtp,
  logout,
  getPhoneIdentityStatus,
} from "../firebase/authService";

import "../styles/LoginPage.css";
import "../styles/LoginPhonePage.css";
import "../styles/RegisterPage.css";
import "../styles/RegisterPhonePage.css";

const isDevelopment = process.env.NODE_ENV === 'development';

const sanitizeText = (text) => {
  if (!text) return '';
  return DOMPurify.sanitize(String(text));
};

export default function RegisterPhonePage() {
  const navigate = useNavigate();
  
  // Sistem ayarlarını kontrol et
  const { maintenanceMode, registrationsOpen, loading: settingsLoading } = useSystemSettings();

  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [confirmation, setConfirmation] = useState(null);

  const [agree, setAgree] = useState(false);
  const [phoneError, setPhoneError] = useState("");
  const [error, setError] = useState("");
  const [infoMessage, setInfoMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [phoneTouched, setPhoneTouched] = useState(false);

  const [policyOpen, setPolicyOpen] = useState(false);
  const [policyType, setPolicyType] = useState("terms");

  useEffect(() => {
    logout().catch(() => {});

    const saved = localStorage.getItem("theme");
    const initial = saved === "light" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", initial);

    let timer;
    clearRecaptcha();

    timer = setTimeout(() => {
      const container = document.getElementById("recaptcha-container");

      if (container) {
        container.innerHTML = "";

        try {
          initRecaptcha("recaptcha-container", { size: "invisible" });
        } catch (err) {
          if (isDevelopment) console.warn("reCAPTCHA Init Warning:", err.message);
        }
      }
    }, 100);

    return () => {
      clearTimeout(timer);
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

  if (!registrationsOpen) {
    return (
      <div className="registrations-closed-page">
        <div className="registrations-closed-content">
          <i className="fas fa-door-closed fa-4x"></i>
          <h1>Yeni Kayıtlar Durduruldu</h1>
          <p>Şu anda yeni kayıtlar geçici olarak durdurulmuştur.</p>
          <p>Daha sonra tekrar deneyin.</p>
          <Link to="/" className="registrations-home-btn">Ana Sayfaya Dön</Link>
          <Link to="/login" className="registrations-login-btn">Giriş Yap</Link>
        </div>
      </div>
    );
  }

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

  const validatePhone = (phoneStr) => {
    const cleaned = String(phoneStr || "").replace(/\D/g, "");

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

  const formatPhone = (digits) => {
    const cleaned = String(digits || "").replace(/\D/g, "").slice(0, 10);

    const part1 = cleaned.slice(0, 3);
    const part2 = cleaned.slice(3, 6);
    const part3 = cleaned.slice(6, 8);
    const part4 = cleaned.slice(8, 10);

    let formatted = "";
    if (part1) formatted += part1;
    if (part2) formatted += ` ${part2}`;
    if (part3) formatted += ` ${part3}`;
    if (part4) formatted += ` ${part4}`;

    return formatted;
  };

  const handlePhoneChange = (e) => {
    const raw = e.target.value.replace(/\D/g, "").slice(0, 10);
    setPhone(raw);

    if (phoneTouched) {
      validatePhone(raw);
    } else if (!raw) {
      setPhoneError("");
    }
  };

  const handlePhoneBlur = () => {
    setPhoneTouched(true);
    validatePhone(phone);
  };

  const handleSend = async () => {
    setError("");
    setInfoMessage("");
    setPhoneTouched(true);

    if (!agree) {
      setError("Devam etmek için şartları kabul etmelisiniz.");
      return;
    }

    if (!validatePhone(phone)) {
      setError("Telefon numarası 5xx xxx xx xx formatında olmalıdır.");
      return;
    }

    try {
      setLoading(true);

      const normalizedPhone = `+90${phone}`;
      const phoneStatus = await getPhoneIdentityStatus(normalizedPhone);

      if (phoneStatus?.existsInUsers) {
        setPhoneError("Bu telefon numarası ile zaten bir kayıt bulunmaktadır.");
        return;
      }

      // 7 mayis modified by Edrees
      const result = await sendPhoneOtp(normalizedPhone, {
        blockExistingPhone: true,
      });


      setConfirmation(result);
      setInfoMessage("SMS kodu gönderildi. Lütfen telefonunu kontrol et.");
    } catch (e) {
      if (isDevelopment) console.log("PHONE REGISTER OTP ERROR:", e.message);

      if (e?.code === "PHONE_LINK_REQUIRED") {
        setError(
          "Bu telefon numarası mevcut bir hesaba ait. Lütfen giriş yapın veya mevcut hesabınıza telefon numaranızı bağlayın."
        );
      } else if (e?.code === "auth/invalid-phone-number") {
        setError("Telefon formatı hatalı. Örn: +90 5xx xxx xx xx");
      } else if (e?.code === "auth/too-many-requests") {
        setError("Çok fazla deneme yapıldı. Lütfen biraz sonra tekrar deneyin.");
      } else if (e?.code === "auth/invalid-app-credential") {
        setError("reCAPTCHA doğrulaması geçersiz oldu. Lütfen tekrar deneyin.");
      } else {
        setError("Kod gönderilemedi. Lütfen daha sonra tekrar deneyin.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async () => {
    setError("");
    setInfoMessage("");

    try {
      setLoading(true);

      const user = await confirmPhoneOtp(confirmation, code);

      sessionStorage.setItem("phoneRegistrationVerified", "true");
      sessionStorage.setItem("phoneRegistrationNumber", user?.phoneNumber || `+90${phone}`);

      navigate("/register-details", { replace: true });
    } catch (e) {
      if (isDevelopment) console.log("PHONE REGISTER VERIFY ERROR:", e.message);

      if (
        e?.code === "auth/invalid-verification-code" ||
        e?.code === "auth/code-expired"
      ) {
        setError("Kod hatalı veya süresi dolmuş. Lütfen tekrar deneyin.");
      } else {
        setError("Kod doğrulanamadı. Lütfen tekrar deneyin.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setError("");
    setPhoneError("");
    setPhoneTouched(false);
    setInfoMessage("");
    setCode("");
    setConfirmation(null);

    clearRecaptcha();

    setTimeout(() => {
      try {
        initRecaptcha("recaptcha-container", { size: "invisible" });
      } catch (err) {
        if (isDevelopment) console.warn("reCAPTCHA reset warning:", err.message);
      }
    }, 100);
  };

  return (
    <PageTransition>
      <div className="lp-login lp-login-phone">
        <header className="lp-login-topbrand">
          <Link to="/" className="lp-login-topbrand-link" aria-label="خبير">
            <img className="lp-login-topbrand-logo" src={brandImage} alt="خبير" />
            <span className="lp-login-topbrand-text">
              Uzmana<span className="highlight">Gel</span>
            </span>
          </Link>
        </header>

        <div className="lp-login-card">
          <section className="lp-login-left">
            <div className="lp-login-header">
              <h1 className="lp-login-title">Telefon ile Kayıt</h1>
              <p className="lp-login-subtitle">SMS kodu ile doğrula</p>
            </div>

            <div className="lp-login-form">
              <div className="lp-login-form-group">
                <label className="lp-login-label">
                  <i className="fas fa-phone lp-login-icon"></i>
                  Telefon
                </label>

                <div className="lp-register-phone-wrapper">
                  <span className="lp-register-phone-prefix">+90</span>

                  <input
                    className="lp-login-input lp-register-phone-input"
                    type="tel"
                    value={formatPhone(phone)}
                    onChange={handlePhoneChange}
                    onBlur={handlePhoneBlur}
                    placeholder="5xx xxx xx xx"
                    disabled={loading || !!confirmation}
                    autoComplete="tel"
                  />
                </div>

                {phoneTouched && phoneError && (
                  <small
                    style={{
                      color: "#ef4444",
                      display: "block",
                      marginTop: "6px",
                    }}
                  >
                    <i className="fas fa-times-circle"></i> {sanitizeText(phoneError)}
                  </small>
                )}
              </div>

              {!confirmation && (
                <div className="lp-register-form-group terms-group" style={{ marginTop: "10px" }}>
                  <label
                    className="lp-register-agree"
                    style={{ display: "flex", alignItems: "flex-start", gap: "8px" }}
                  >
                    <input
                      type="checkbox"
                      checked={agree}
                      onChange={(e) => setAgree(e.target.checked)}
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
              )}

              {!confirmation ? (
                <button
                  className="lp-login-btn"
                  type="button"
                  onClick={handleSend}
                  disabled={loading || !agree || phone.length !== 10}
                >
                  {loading ? "Gönderiliyor..." : "Kod Gönder"}
                </button>
              ) : (
                <>
                  <div className="lp-login-form-group">
                    <label className="lp-login-label">
                      <i className="fas fa-key lp-login-icon"></i>
                      OTP Kodu
                    </label>

                    <input
                      className="lp-login-input"
                      type="text"
                      value={code}
                      onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      placeholder="6 haneli kod"
                      disabled={loading}
                    />
                  </div>

                  <button
                    className="lp-login-btn"
                    type="button"
                    onClick={handleVerify}
                    disabled={loading || code.length < 6}
                  >
                    {loading ? "Doğrulanıyor..." : "Doğrula ve Devam Et"}
                  </button>

                  <button
                    className="lp-login-btn-secondary"
                    type="button"
                    onClick={handleReset}
                    disabled={loading}
                  >
                    <i className="fas fa-rotate-right"></i>
                    Kodu tekrar gönder
                  </button>
                </>
              )}

              {infoMessage && (
                <p
                  style={{
                    color: "#22c55e",
                    marginTop: "12px",
                    fontSize: "14px",
                    textAlign: "center",
                  }}
                >
                  {sanitizeText(infoMessage)}
                </p>
              )}

              {error && <p className="lp-login-error">{sanitizeText(error)}</p>}

              <p className="lp-login-bottom">
                Zaten hesabın var mı? <Link to="/login">Giriş Yap</Link>
              </p>

              <div className="lp-recaptcha-wrap">
                <div id="recaptcha-container"></div>
              </div>
            </div>
          </section>

          <section className="lp-login-right">
            <div className="benefits-list">
              <h3>Güvenli doğrulama</h3>
              <ul>
                <li><i className="fas fa-check-circle"></i> SMS ile hızlı doğrulama</li>
                <li><i className="fas fa-check-circle"></i> Spam/abuse koruması (reCAPTCHA)</li>
                <li><i className="fas fa-check-circle"></i> Sonraki adımda hesap bilgilerini tamamlarsın</li>
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
}
