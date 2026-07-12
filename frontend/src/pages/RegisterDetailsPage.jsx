import { useEffect,useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import PageTransition from "../components/PageTransition";
import brandImage from "../assets/pictures/Logo.png";
import { linkEmailPasswordToPhoneUser, logout } from "../firebase/authService";
import DOMPurify from 'dompurify';
import LoadingSpinner from "../components/LoadingSpinner";
import { useSystemSettings } from "../hooks/useSystemSettings";

import { auth } from "../firebase/firebaseClient";
import { onAuthStateChanged } from "firebase/auth";

import "../styles/RegisterPage.css";
import PolicyModal from "../components/PolicyModal";

const isDevelopment = process.env.NODE_ENV === 'development';

const sanitizeText = (text) => {
  if (!text) return '';
  return DOMPurify.sanitize(String(text));
};

export default function RegisterDetailsPage() {
    const navigate = useNavigate();
    const isCompletingRegistrationRef = useRef(false);
    // Sistem ayarlarını kontrol et

    const { maintenanceMode, registrationsOpen, loading: settingsLoading } = useSystemSettings();

    const [isCheckingAuth, setIsCheckingAuth] = useState(true);
    const [fullName, setFullName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [password2, setPassword2] = useState("");

    const [showPass, setShowPass] = useState(false);
    const [showPass2, setShowPass2] = useState(false);
    const [passwordStrength, setPasswordStrength] = useState(0);

    const [agree, setAgree] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const [policyOpen, setPolicyOpen] = useState(false);
    const [policyType, setPolicyType] = useState("terms");

    useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
        if (user) {
            setIsCheckingAuth(false);
        } else {
            if (isCompletingRegistrationRef.current) return;

            if (isDevelopment) console.warn("Güvenlik Uyarısı: Yetkisiz erişim tespit edildi.");
            navigate("/register-phone", { replace: true });
        }
    });

    return () => unsubscribe();
    }, [navigate]);

    useEffect(() => {
        const saved = localStorage.getItem("theme");
        const initial = saved === "light" ? "light" : "dark";
        document.documentElement.setAttribute("data-theme", initial);
    }, []);

    if (settingsLoading || isCheckingAuth) {
        return <LoadingSpinner text="Yükleniyor..." />;
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

    const handleCancelRegistration = async (e) => {
        e.preventDefault();
        try {
            await logout();
        } catch (err) {
            if (isDevelopment) console.error("Çıkış yapılırken hata:", err.message);
        }
        navigate("/"); 
    };

    const handlePasswordChange = (e) => {
        const pass = e.target.value;
        setPassword(pass);

        let strength = 0;
        if (pass.length >= 8) strength += 25;
        if (pass.match(/[A-Z]/)) strength += 25;
        if (pass.match(/[0-9]/)) strength += 25;
        if (pass.match(/[^A-Za-z0-9]/)) strength += 25;
        setPasswordStrength(strength);
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

     if (!agree) return setError("Devam etmek için şartları kabul etmelisiniz.");
     if (password !== password2) return setError("Şifreler eşleşmiyor.");

     try {
        setLoading(true);

        await linkEmailPasswordToPhoneUser({ 
            fullName: sanitizeText(fullName), 
            email: sanitizeText(email), 
            password 
        });

        // Edrees added this to solve JWT issue 7 mayis
        isCompletingRegistrationRef.current = true;

        await logout();

        sessionStorage.removeItem("phoneRegistrationVerified");
        sessionStorage.removeItem("phoneRegistrationNumber");

        navigate("/login", {
            replace: true,
            state: {
                prefillEmail: sanitizeText(email),
                loginNoticeType: "registration_success",
            },
        });
     } catch (err) {
        isCompletingRegistrationRef.current = false;

        if (err?.code === "auth/email-already-in-use") {
            setError("Bu e-posta zaten kullanılıyor.");
        } else {
            setError("Hesap oluşturulurken bir hata oluştu. Lütfen daha sonra tekrar deneyin.");
        }
        } finally {
            setLoading(false);
        }   
    };

    return (
        <PageTransition>
            <div className="lp-register">
                <header className="lp-register-topbrand">
                    <Link to="/" onClick={handleCancelRegistration} className="lp-register-topbrand-link">
                        <img className="lp-register-topbrand-logo" src={brandImage} alt="خبير" />
                        <span className="lp-register-topbrand-text">
                            Uzmana<span className="highlight">Gel</span>
                        </span>
                    </Link>
                </header>

                <div className="lp-register-card">
                    <section className="lp-register-left">
                        <div className="lp-register-header">
                            <h1 className="lp-register-title">Hesap Bilgileri</h1>
                            <p className="lp-register-subtitle">Kayıt işlemini tamamla</p>
                        </div>

                        <form className="lp-register-form" onSubmit={handleSubmit}>
                            <div className="lp-register-form-group">
                                <label className="lp-register-label">
                                    <i className="fas fa-user lp-register-icon"></i>
                                    Ad Soyad
                                </label>
                                <input
                                    className="lp-register-input"
                                    type="text"
                                    placeholder="Ad Soyad"
                                    value={fullName}
                                    onChange={(e) => setFullName(e.target.value)}
                                    required
                                    disabled={loading}
                                />
                            </div>

                            <div className="lp-register-form-group">
                                <label className="lp-register-label">
                                    <i className="fas fa-envelope lp-register-icon"></i>
                                    E-Posta
                                </label>
                                <input
                                    className="lp-register-input"
                                    type="email"
                                    placeholder="E-Posta"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    required
                                    disabled={loading}
                                />
                            </div>

                            <div className="lp-register-form-group">
                                <label className="lp-register-label">
                                    <i className="fas fa-lock lp-register-icon"></i>
                                    Şifre
                                </label>
                                <div className="lp-register-pass">
                                    <input
                                        className="lp-register-input"
                                        type={showPass ? "text" : "password"}
                                        placeholder="Şifre"
                                        value={password}
                                        onChange={handlePasswordChange}
                                        required
                                        disabled={loading}
                                    />
                                    <button
                                        type="button"
                                        className="lp-register-eye"
                                        onClick={() => setShowPass(!showPass)}
                                        disabled={loading}
                                    >
                                        <i className={showPass ? "fas fa-eye-slash" : "fas fa-eye"}></i>
                                    </button>
                                </div>
                                <div className="password-strength">
                                    <div className="strength-bar" style={{ width: `${passwordStrength}%`, background: "#d4af37" }}></div>
                                </div>
                                <small className="password-hint">En az 8 karakter, 1 büyük harf, 1 rakam</small>
                            </div>

                            <div className="lp-register-form-group">
                                <label className="lp-register-label">
                                    <i className="fas fa-lock lp-register-icon"></i>
                                    Şifre Tekrar
                                </label>
                                <div className="lp-register-pass">
                                    <input
                                        className="lp-register-input"
                                        type={showPass2 ? "text" : "password"}
                                        placeholder="Şifre Tekrar"
                                        value={password2}
                                        onChange={(e) => setPassword2(e.target.value)}
                                        required
                                        disabled={loading}
                                    />
                                    <button
                                        type="button"
                                        className="lp-register-eye"
                                        onClick={() => setShowPass2(!showPass2)}
                                        disabled={loading}
                                    >
                                        <i className={showPass2 ? "fas fa-eye-slash" : "fas fa-eye"}></i>
                                    </button>
                                </div>
                            </div>

                            <div className="lp-register-form-group terms-group">
                                <label className="lp-register-agree">
                                    <input
                                        type="checkbox"
                                        checked={agree}
                                        onChange={(e) => setAgree(e.target.checked)}
                                        required
                                        disabled={loading}
                                    />
                                    <span>
                                        <a href="#" className="terms-link" onClick={openTerms}>Kullanım Koşulları</a>'nı ve
                                        <a href="#" className="terms-link" onClick={openPrivacy}> Gizlilik Politikası</a>'nı okudum.
                                    </span>
                                </label>
                            </div>

                            {error && <p style={{ marginTop: 10, color: "tomato", fontWeight: 600 }}>{sanitizeText(error)}</p>}

                            <button className="lp-register-btn" type="submit" disabled={!agree || loading}>
                                <i className="fas fa-check-circle"></i>
                                {loading ? "Kaydediliyor..." : "Kaydı Tamamla"}
                            </button>
                        </form>
                    </section>

                    <section className="lp-register-right">
                        <div className="benefits-list">
                            <h3>Son adım</h3>
                            <ul>
                                <li><i className="fas fa-check-circle"></i> Telefon doğrulandı ✅</li>
                                <li><i className="fas fa-check-circle"></i> E-posta/şifre bağlanacak</li>
                                <li><i className="fas fa-check-circle"></i> Güvenli profil oluşturma</li>
                            </ul>
                        </div>
                    </section>
                </div>

                <PolicyModal
                    open={policyOpen}
                    title={policyType === "terms" ? "Kullanım Koşulları" : "Gizlilik Politikası"}
                    onClose={() => setPolicyOpen(false)}
                >
                    <div className="policy-placeholder">Şartlar ve Koşullar içeriği buraya gelecek.</div>
                </PolicyModal>
            </div>
        </PageTransition>
    );
}
