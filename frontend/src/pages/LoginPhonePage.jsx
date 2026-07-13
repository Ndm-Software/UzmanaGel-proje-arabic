import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import PageTransition from "../components/PageTransition";
import brandImage from "../assets/pictures/Logo.png";
import DOMPurify from 'dompurify';
import LoadingSpinner from "../components/LoadingSpinner";
import { useSystemSettings } from "../hooks/useSystemSettings";
import { useAuthGuard } from "../hooks/useAuthGuard";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../firebase/firebaseClient";

import {
  initRecaptcha,
  clearRecaptcha,
  sendPhoneOtp,
  completePhoneLogin,
} from "../firebase/authService";

import "../styles/LoginPage.css";
import "../styles/LoginPhonePage.css";
import "../styles/RegisterPage.css";

const isDevelopment = process.env.NODE_ENV === 'development';

const sanitizeText = (text) => {
  if (!text) return '';
  return DOMPurify.sanitize(String(text));
};

export default function LoginPhonePage() {
  const navigate = useNavigate();
  
  // Sistem ayarlarını kontrol et
  const { maintenanceMode, loading: settingsLoading } = useSystemSettings();
  const { isAdmin, loading: authLoading } = useAuthGuard();

  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [confirmation, setConfirmation] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [phoneError, setPhoneError] = useState("");
  const [infoMessage, setInfoMessage] = useState("");

  const [phoneTouched, setPhoneTouched] = useState(false);

  useEffect(() => {
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

  if (settingsLoading || authLoading) {
    return <LoadingSpinner text="Sistem ayarları kontrol ediliyor..." />;
  }

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

    if (cleaned.length < 9 || cleaned.length > 15) {
      setPhoneError("Telefon numarası 9 ila 15 haneli olmalıdır (Örn: 9xx xxx xxx).");
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

    if (raw) {
      validatePhone(raw);
    } else {
      setPhoneError("");
    }
  };

  const checkUserStatusAfterLogin = async (user) => {
    try {
      const userDoc = await getDoc(doc(db, "users", user.uid));

      if (!userDoc.exists()) {
        return {
          allowed: false,
          message: "Kullanıcı kaydı bulunamadı.",
        };
      }

      const userData = userDoc.data();

      // BAKIM MODU KONTROLÜ - Admin değilse ve bakım modu açıksa engelle
      if (maintenanceMode && userData.userType !== "ADMIN") {
        return {
          allowed: false,
          message: "Sistem bakım modundadır. Lütfen daha sonra tekrar deneyin.",
        };
      }

      return { allowed: true, redirect: "/ilanlar" };
    } catch (error) {
      if (isDevelopment) console.error("Kullanıcı durumu kontrol edilirken hata:", error.message);
      return { allowed: true, redirect: "/ilanlar" };
    }
  };

  const handleSend = async () => {
    setError("");
    setPhoneError("");
    setInfoMessage("");

    try {
      setLoading(true);

      if (!validatePhone(phone)) {
        setError("Telefon numarası geçersiz. Örn: 9xx xxx xxx");
        return;
      }

      const normalizedPhone = `+963${phone}`;

      const result = await sendPhoneOtp(normalizedPhone);
      setConfirmation(result);
      setInfoMessage("SMS kodu gönderildi. Lütfen telefonunu kontrol et.");
    } catch (e) {
      if (isDevelopment) console.log("PHONE LOGIN OTP ERROR:", e.message);

      if (e?.code === "PHONE_LINK_REQUIRED") {
        setError(
          "Bu telefon numarası mevcut bir hesaba ait, ancak telefonla giriş henüz etkin değil. Lütfen önce e-posta veya Google ile giriş yapın, ardından telefon numaranızı hesabınıza bağlayın."
        );
      } else if (e?.code === "auth/invalid-phone-number") {
        setError("Telefon formatı hatalı. Örn: +963 9xx xxx xxx");
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

      const result = await completePhoneLogin(confirmation, code);
      const user = result.user;
      
      const statusCheck = await checkUserStatusAfterLogin(user);
      
      if (!statusCheck.allowed) {
        setError(statusCheck.message);
        setLoading(false);
        return;
      }

      navigate(statusCheck.redirect || "/ilanlar", { replace: true });
    } catch (e) {
      if (isDevelopment) console.log("PHONE LOGIN VERIFY ERROR:", e.message);

      if (e?.code === "PHONE_ACCOUNT_SPLIT_DETECTED") {
        setError(
          "Bu telefon numarası sistemde mevcut bir hesaba ait, ancak telefon girişi henüz bu hesaba bağlanmamış. Lütfen önce e-posta veya Google ile giriş yapın, ardından telefon numaranızı hesabınıza bağlayın."
        );
      } else if (
        e?.code === "auth/invalid-verification-code" ||
        e?.code === "auth/code-expired"
      ) {
        setError("Kod hatalı veya süresi dolmuş. Lütfen tekrar deneyin.");
      } else {
        setError("Kod hatalı veya telefon girişi tamamlanamadı. Lütfen tekrar deneyin.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setError("");
    setPhoneError("");
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
              <h1 className="lp-login-title">Telefon ile Giriş</h1>
              <p className="lp-login-subtitle">SMS kodu ile doğrula</p>
            </div>

            <div className="lp-login-form">
              <div className="lp-login-form-group">
                <label className="lp-login-label">
                  <i className="fas fa-phone lp-login-icon"></i>
                  Telefon
                </label>

                <div className="lp-register-phone-wrapper">
                  <span className="lp-register-phone-prefix">+963</span>

                  <input
                    className="lp-login-input lp-register-phone-input"
                    type="tel"
                    value={formatPhone(phone)}
                    onChange={handlePhoneChange}
                    onBlur={() => setPhoneTouched(true) && validatePhone(phone)}
                    placeholder="5xx xxx xx xx"
                    disabled={loading || !!confirmation}
                    autoComplete="tel"
                  />
                </div>

                {phoneError && phoneTouched && (
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

              {!confirmation ? (
                <button
                  className="lp-login-btn"
                  type="button"
                  onClick={handleSend}
                  disabled={loading || phone.length !== 10}
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
                    {loading ? "Doğrulanıyor..." : "Doğrula ve Giriş Yap"}
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
                Email ile giriş yapmak ister misin? <Link to="/login">Giriş Yap</Link>
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
              </ul>
            </div>
          </section>
        </div>
      </div>
    </PageTransition>
  );
}
