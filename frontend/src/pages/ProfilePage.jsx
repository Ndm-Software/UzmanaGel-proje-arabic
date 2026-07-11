import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  onAuthStateChanged,
  updateProfile,
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
} from 'firebase/auth';
import {
  doc,
  getDoc,
  collection,
  addDoc,
  serverTimestamp,
  deleteDoc,
  query,
  orderBy,
  onSnapshot,
  updateDoc,
  writeBatch,
  where,
  getDocs
} from 'firebase/firestore';
import { auth, db } from '../firebase/firebaseClient';
import Navbar from '../components/Navbar';
import LoadingSpinner from '../components/LoadingSpinner';
import AddressModal from '../components/AddressModal';
import {
  updateMyDisplayName,
  uploadProfilePhoto,
  getProfilePhoto,
} from '../services/updateService';
import { deleteClientAccount } from '../services/accountService';
import {
  initRecaptcha,
  clearRecaptcha,
  startPhoneLinking,
  confirmPhoneLinking,
  linkGoogleToCurrentUser,
  getCurrentUserProviderFlags,
} from '../firebase/authService';
import imageCompression from 'browser-image-compression';
import DOMPurify from 'dompurify';
import { showAppToast } from '../utils/showAppToast';
import ConfirmModal from '../components/ConfirmModal';
import '../styles/ProfilePage.css';

const isDevelopment = import.meta.env.DEV;

const sanitizeText = (text) => {
  if (!text) return '';
  return DOMPurify.sanitize(String(text));
};

const filterAddressChips = (items) =>
  items.filter((item) => item && String(item.value || '').trim());

const buildAddressChipLines = (address) =>
  [
    filterAddressChips([
      { label: 'Şehir', value: address.city },
      { label: 'İlçe', value: address.district },
      { label: 'Mahalle', value: address.neighborhood },
    ]),
    filterAddressChips([
      { label: 'Sokak', value: address.street },
      address.siteName ? { label: 'Site', value: address.siteName } : null,
      address.apartmentName ? { label: 'Apt', value: address.apartmentName } : null,
    ]),
    filterAddressChips([
      address.blockName ? { label: 'Blok', value: address.blockName } : null,
      { label: 'Bina', value: address.buildingNo },
      { label: 'Kat', value: address.floor },
      { label: 'Daire', value: address.doorNo },
    ]),
  ].filter((row) => row.length > 0);

const hasSpecialChar = (str) =>
  /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(str);

function hasConsecutiveChars(str) {
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

    if (isLower(c1) && isLower(c2) && isLower(c3) && c2 === c1 + 1 && c3 === c2 + 1) {
      return true;
    }

    if (isUpper(c1) && isUpper(c2) && isUpper(c3) && c2 === c1 + 1 && c3 === c2 + 1) {
      return true;
    }
  }
  return false;
}

function hasRepeatedChars(str) {
  for (let i = 0; i < str.length - 2; i++) {
    if (str[i] === str[i + 1] && str[i + 1] === str[i + 2]) return true;
  }
  return false;
}

function validatePassword(pass) {
  const errors = [];
  if (pass.length < 6) errors.push('En az 6 karakter olmalıdır');
  if (!/[A-Z]/.test(pass)) errors.push('En az 1 büyük harf içermelidir');
  if (!/[a-z]/.test(pass)) errors.push('En az 1 küçük harf içermelidir');
  if (!/[0-9]/.test(pass)) errors.push('En az 1 rakam içermelidir');
  if (!hasSpecialChar(pass)) errors.push('En az 1 özel karakter içermelidir');
  if (hasConsecutiveChars(pass)) errors.push('Ardışık karakterler içermemelidir (örn. abc, 123)');
  if (hasRepeatedChars(pass)) errors.push('Aynı karakteri 3 kez tekrarlamamalıdır (örn. aaa)');
  return errors;
}

function computePasswordStrength(pass) {
  if (!pass) return 0;
  let s = 0;
  if (pass.length >= 6) s += 20;
  if (/[A-Z]/.test(pass)) s += 20;
  if (/[a-z]/.test(pass)) s += 20;
  if (/[0-9]/.test(pass)) s += 20;
  if (hasSpecialChar(pass)) s += 20;
  if (hasConsecutiveChars(pass)) s -= 40;
  if (hasRepeatedChars(pass)) s -= 40;
  return Math.max(0, Math.min(100, s));
}

function getPasswordStrengthColor(s) {
  if (s === 0) return '#4b5563';
  if (s <= 25) return '#ef4444';
  if (s <= 50) return '#f97316';
  if (s <= 75) return '#eab308';
  return '#22c55e';
}

function getStrengthText(s) {
  if (s === 0) return 'Şifre gücü: Zayıf';
  if (s <= 25) return 'Şifre gücü: Çok Zayıf';
  if (s <= 50) return 'Şifre gücü: Orta';
  if (s <= 75) return 'Şifre gücü: İyi';
  if (s < 100) return 'Şifre gücü: Çok İyi';
  return 'Şifre gücü: Mükemmel ✓';
}

function mapFirebaseAuthError(error) {
  const code = error?.code;
  if (code === 'auth/wrong-password' || code === 'auth/invalid-credential') return 'Eski şifreniz hatalı.';
  if (code === 'auth/too-many-requests') return 'Çok fazla deneme yapıldı. Lütfen biraz bekleyip tekrar deneyin.';
  if (code === 'auth/requires-recent-login') return 'Güvenlik nedeniyle tekrar giriş yapmanız gerekiyor.';
  if (code === 'auth/network-request-failed') return 'Bağlantı hatası. İnternetinizi kontrol edin.';
  if (code === 'auth/weak-password') return 'Yeni şifre çok zayıf.';
  return 'Şifre güncellenemedi. Lütfen daha sonra tekrar deneyin.';
}

const Modal = ({ title, onClose, children }) => (
  <div className="modal-overlay" onClick={onClose}>
    <div className="modal-box" onClick={(e) => e.stopPropagation()}>
      <div className="modal-header">
        <h3>{sanitizeText(title)}</h3>
        <button className="modal-close-btn" onClick={onClose}>
          <i className="fas fa-times"></i>
        </button>
      </div>
      <div className="modal-body">{children}</div>
    </div>
  </div>
);

const NameModal = ({ user, currentName, onClose, onSuccess }) => {
  const split = (name) => {
    const parts = String(name || '')
      .replace(/\s+/g, ' ')
      .trim()
      .split(' ');
    if (parts.length === 1) return { firstName: parts[0], lastName: '' };
    return {
      firstName: parts.slice(0, -1).join(' '),
      lastName: parts[parts.length - 1],
    };
  };

  const initial = split(currentName);
  const [firstName, setFirstName] = useState(initial.firstName);
  const [lastName, setLastName] = useState(initial.lastName);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!firstName.trim() || !lastName.trim()) {
      setError('Ad ve soyad zorunludur.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const displayName = `${firstName.trim()} ${lastName.trim()}`;
      await updateMyDisplayName(user, {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
      });

      try {
        if (auth.currentUser) {
          await updateProfile(auth.currentUser, { displayName });
        }
      } catch {
        /* ignore */
      }

      setSuccess('Ad soyad güncellendi.');
      onSuccess(displayName);
      setTimeout(onClose, 1200);
    } catch (err) {
      if (isDevelopment) console.error("Ad soyad güncellenemedi:", err.message);
      setError('Ad soyad güncellenirken bir hata oluştu. Lütfen daha sonra tekrar deneyin.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal title="Ad Soyad Güncelle" onClose={onClose}>
      <form onSubmit={handleSubmit} className="modal-form">
        <div className="modal-field">
          <label>Ad</label>
          <input
            type="text"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            required
            disabled={loading}
            autoFocus
            maxLength={50}
          />
        </div>

        <div className="modal-field">
          <label>Soyad</label>
          <input
            type="text"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            required
            disabled={loading}
            maxLength={50}
          />
        </div>

        {error && <p className="modal-error">{sanitizeText(error)}</p>}
        {success && <p className="modal-success">{sanitizeText(success)}</p>}

        <div className="modal-actions">
          <button
            type="button"
            className="settings-secondary-button"
            onClick={onClose}
            disabled={loading}
          >
            İptal
          </button>
          <button type="submit" className="settings-primary-button" disabled={loading}>
            {loading ? 'Kaydediliyor...' : 'Kaydet'}
          </button>
        </div>
      </form>
    </Modal>
  );
};

const PhoneModal = ({ onClose, onSuccess }) => {
  const [digits, setDigits] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [step, setStep] = useState('phone');
  const [loading, setLoading] = useState(false);
  const [sendingOtp, setSendingOtp] = useState(false);
  const [confirmationResult, setConfirmationResult] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const normalize = (v) => {
    const d = String(v || '').replace(/\D/g, '');
    let core = d;
    if (core.length === 11 && core.startsWith('0')) core = core.slice(1);
    if (core.length === 12 && core.startsWith('90')) core = core.slice(2);
    return core.slice(0, 10);
  };

  const format = (d) => {
    const c = String(d || '').replace(/\D/g, '').slice(0, 10);
    let f = '';
    if (c.slice(0, 3)) f += c.slice(0, 3);
    if (c.slice(3, 6)) f += ' ' + c.slice(3, 6);
    if (c.slice(6, 8)) f += ' ' + c.slice(6, 8);
    if (c.slice(8, 10)) f += ' ' + c.slice(8, 10);
    return f;
  };

  useEffect(() => {
    if (step !== 'otp') return;

    const timer = setTimeout(() => {
      try {
        initRecaptcha('profile-phone-recaptcha', { size: 'invisible' });
      } catch {
        /* ignore */
      }
    }, 0);

    return () => clearTimeout(timer);
  }, [step]);

  useEffect(() => {
    return () => {
      clearRecaptcha();
    };
  }, []);

  const validatePhone = () => {
    const d = normalize(digits);
    if (d.length !== 10 || !d.startsWith('5')) {
      setError('5xx xxx xx xx formatında geçerli bir numara girin.');
      return null;
    }
    return `+90${d}`;
  };

  const handleSendOtp = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    const phoneNumber = validatePhone();
    if (!phoneNumber) return;

    setSendingOtp(true);

    try {
      initRecaptcha('profile-phone-recaptcha', { size: 'invisible' });
      const result = await startPhoneLinking(phoneNumber);
      setConfirmationResult(result);
      setStep('otp');
      setSuccess('SMS kodu gönderildi. Lütfen telefonunu kontrol et.');
    } catch (err) {
      if (isDevelopment) console.error("Kod gönderme hatası:", err.message);
      setError('Kod gönderilemedi. Lütfen daha sonra tekrar deneyin.');
    } finally {
      setSendingOtp(false);
    }
  };

  const handleVerifyAndSave = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!confirmationResult) {
      setError('Doğrulama oturumu bulunamadı. Lütfen yeniden kod gönder.');
      return;
    }

    if (!String(otpCode).trim() || String(otpCode).trim().length < 6) {
      setError('Lütfen 6 haneli doğrulama kodunu girin.');
      return;
    }

    setLoading(true);

    try {
      const result = await confirmPhoneLinking(confirmationResult, otpCode);
      const finalPhone = result?.user?.phoneNumber || `+90${normalize(digits)}`;
      setSuccess('Telefon numarası başarıyla doğrulandı ve kaydedildi.');
      onSuccess(finalPhone);
      setTimeout(() => {
        clearRecaptcha();
        onClose();
      }, 1200);
    } catch (err) {
      if (isDevelopment) console.error("Doğrulama hatası:", err.message);
      setError('Doğrulama başarısız oldu. Lütfen daha sonra tekrar deneyin.');
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    setError('');
    setSuccess('');

    const phoneNumber = validatePhone();
    if (!phoneNumber) return;

    setSendingOtp(true);

    try {
      clearRecaptcha();
      initRecaptcha('profile-phone-recaptcha', { size: 'invisible' });
      const result = await startPhoneLinking(phoneNumber);
      setConfirmationResult(result);
      setSuccess('Yeni SMS kodu gönderildi.');
    } catch (err) {
      if (isDevelopment) console.error("Kod gönderme hatası:", err.message);
      setError('Kod tekrar gönderilemedi. Lütfen daha sonra tekrar deneyin.');
    } finally {
      setSendingOtp(false);
    }
  };

  return (
    <Modal title="Telefon Numarasını Güncelle" onClose={onClose}>
      <form onSubmit={step === 'phone' ? handleSendOtp : handleVerifyAndSave} className="modal-form">
        <div className="phone-verify-shell">
          <div className="phone-verify-step">
            <div className={`phone-step-badge ${step === 'phone' ? 'active' : 'done'}`}>1</div>
            <span>Numara</span>
          </div>
          <div className="phone-step-line"></div>
          <div className="phone-verify-step">
            <div className={`phone-step-badge ${step === 'otp' ? 'active' : ''}`}>2</div>
            <span>OTP</span>
          </div>
        </div>

        <div className="modal-field">
          <label>Yeni Telefon (+90)</label>
          <input
            type="tel"
            value={format(digits)}
            onChange={(e) => setDigits(normalize(e.target.value))}
            placeholder="5xx xxx xx xx"
            required
            disabled={loading || sendingOtp || step === 'otp'}
          />
        </div>

        {step === 'otp' && (
          <div className="modal-field">
            <label>OTP Kodu</label>
            <input
              type="text"
              inputMode="numeric"
              value={otpCode}
              onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="6 haneli kod"
              required
              disabled={loading}
            />
          </div>
        )}

        <div id="profile-phone-recaptcha" className="profile-phone-recaptcha"></div>

        {error && <p className="modal-error">{sanitizeText(error)}</p>}
        {success && <p className="modal-success">{sanitizeText(success)}</p>}

        {step === 'otp' && (
          <button
            type="button"
            className="phone-resend-btn"
            onClick={handleResendOtp}
            disabled={sendingOtp || loading}
          >
            <i className="fas fa-rotate-right"></i>
            {sendingOtp ? 'Kod gönderiliyor...' : 'Kodu tekrar gönder'}
          </button>
        )}

        <div className="modal-actions">
          <button
            type="button"
            className="settings-secondary-button"
            onClick={onClose}
            disabled={loading || sendingOtp}
          >
            İptal
          </button>

          {step === 'phone' ? (
            <button type="submit" className="settings-primary-button" disabled={sendingOtp || loading}>
              {sendingOtp ? 'Kod Gönderiliyor...' : 'Kod Gönder'}
            </button>
          ) : (
            <button type="submit" className="settings-primary-button" disabled={loading}>
              {loading ? 'Doğrulanıyor...' : 'Doğrula ve Kaydet'}
            </button>
          )}
        </div>
      </form>
    </Modal>
  );
};

const PasswordModal = ({ onClose, onSuccess }) => {
  const [form, setForm] = useState({ current: '', newPass: '', confirm: '' });
  const [show, setShow] = useState({
    current: false,
    newPass: false,
    confirm: false,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [strength, setStrength] = useState(0);
  const [errors, setErrors] = useState([]);

  const handleNewPass = (e) => {
    const v = e.target.value;
    setForm((p) => ({ ...p, newPass: v }));
    setStrength(computePasswordStrength(v));
    setErrors(validatePassword(v));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (errors.length > 0) {
      setError('Şifre gereksinimleri karşılanmıyor.');
      return;
    }

    if (strength !== 100) {
      setError(`Şifre yeterince güçlü değil. Güç: ${Math.round(strength)}% (100% gerekli)`);
      return;
    }

    if (form.newPass !== form.confirm) {
      setError('Yeni şifreler eşleşmiyor.');
      return;
    }

    const authUser = auth.currentUser;
    if (!authUser) {
      setError('Oturum bulunamadı.');
      return;
    }

    const hasPass =
      Array.isArray(authUser.providerData) &&
      authUser.providerData.some((p) => p?.providerId === 'password');

    if (!hasPass || !authUser.email) {
      setError('Bu hesap şifre ile giriş yapmıyor.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const credential = EmailAuthProvider.credential(authUser.email, form.current);
      await reauthenticateWithCredential(authUser, credential);
      await updatePassword(authUser, form.newPass);
      setSuccess('Şifreniz başarıyla güncellendi.');
      setTimeout(() => {
        onSuccess?.();
      }, 1500);
    } catch (err) {
      setError(mapFirebaseAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  const color = getPasswordStrengthColor(strength);

  return (
    <Modal title="Şifre Değiştir" onClose={onClose}>
      <form onSubmit={handleSubmit} className="modal-form">
        <div className="modal-field">
          <label>Mevcut Şifre</label>
          <div className="modal-input-wrapper">
            <input
              type={show.current ? 'text' : 'password'}
              value={form.current}
              onChange={(e) => setForm((p) => ({ ...p, current: e.target.value }))}
              required
              disabled={loading}
            />
            <button
              type="button"
              className="modal-eye-btn"
              onClick={() => setShow((p) => ({ ...p, current: !p.current }))}
            >
              <i className={`fas fa-eye${show.current ? '-slash' : ''}`}></i>
            </button>
          </div>
        </div>

        <div className="modal-field">
          <label>Yeni Şifre</label>
          <div className="modal-input-wrapper">
            <input
              type={show.newPass ? 'text' : 'password'}
              value={form.newPass}
              onChange={handleNewPass}
              required
              disabled={loading}
            />
            <button
              type="button"
              className="modal-eye-btn"
              onClick={() => setShow((p) => ({ ...p, newPass: !p.newPass }))}
            >
              <i className={`fas fa-eye${show.newPass ? '-slash' : ''}`}></i>
            </button>
          </div>

          {form.newPass.length > 0 && (
            <>
              <div
                style={{
                  marginTop: '8px',
                  height: '4px',
                  background: 'var(--card-border)',
                  borderRadius: '2px',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    height: '100%',
                    transition: 'all 0.3s ease',
                    width: `${strength}%`,
                    backgroundColor: color,
                  }}
                />
              </div>
              <small
                style={{
                  color,
                  display: 'block',
                  marginTop: '4px',
                  fontWeight: 600,
                }}
              >
                {getStrengthText(strength)}
              </small>
            </>
          )}

          {form.newPass.length > 0 && errors.length > 0 && (
            <div style={{ marginTop: '8px' }}>
              {errors.map((err, i) => (
                <small
                  key={i}
                  style={{ color: '#ef4444', display: 'block', marginTop: '2px' }}
                >
                  <i className="fas fa-times-circle"></i> {sanitizeText(err)}
                </small>
              ))}
            </div>
          )}

          <small
            style={{
              color: 'var(--text-muted)',
              fontSize: '0.78rem',
              marginTop: '6px',
              display: 'block',
            }}
          >
            ✓ Min 6 karakter ✓ Büyük harf ✓ Küçük harf ✓ Rakam ✓ Özel karakter
          </small>
        </div>

        <div className="modal-field">
          <label>Yeni Şifre (Tekrar)</label>
          <div className="modal-input-wrapper">
            <input
              type={show.confirm ? 'text' : 'password'}
              value={form.confirm}
              onChange={(e) => setForm((p) => ({ ...p, confirm: e.target.value }))}
              required
              disabled={loading}
            />
            <button
              type="button"
              className="modal-eye-btn"
              onClick={() => setShow((p) => ({ ...p, confirm: !p.confirm }))}
            >
              <i className={`fas fa-eye${show.confirm ? '-slash' : ''}`}></i>
            </button>
          </div>
        </div>

        {error && <p className="modal-error">{sanitizeText(error)}</p>}
        {success && <p className="modal-success">{sanitizeText(success)}</p>}

        <div className="modal-actions">
          <button
            type="button"
            className="settings-secondary-button"
            onClick={onClose}
            disabled={loading}
          >
            İptal
          </button>
          <button
            type="submit"
            className="settings-primary-button"
            disabled={loading || strength !== 100 || form.newPass !== form.confirm}
          >
            {loading ? 'Kaydediliyor...' : 'Kaydet'}
          </button>
        </div>
      </form>
    </Modal>
  );
};

const DeleteAccountModal = ({
  onClose,
  onDeleted,
  hasPasswordProvider = false,
  hasGoogleProvider = false,
}) => {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const finishDeactivateFlow = () => {
    setSuccess('Hesabınız devre dışı bırakıldı. 60 gün içinde tekrar aktif edebilirsiniz.');
    setTimeout(() => {
      onDeleted();
    }, 1400);
  };

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();

    if (!password.trim()) {
      setError('Lütfen şifrenizi girin.');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      await deleteClientAccount({ password });
      finishDeactivateFlow();
    } catch (err) {
      if (isDevelopment) console.error("Hesap silme hatası:", err.message);
      setError('Hesabı devre dışı bırakma işlemi sırasında bir hata oluştu. Lütfen daha sonra tekrar deneyin.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleDeactivate = async () => {
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      await deleteClientAccount({ useGoogle: true });
      finishDeactivateFlow();
    } catch (err) {
      if (isDevelopment) console.error("Google doğrulama hatası:", err.message);
      setError('Google ile doğrulama sırasında bir hata oluştu. Lütfen daha sonra tekrar deneyin.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal title="Hesabı Devre Dışı Bırak" onClose={onClose}>
      <form
        onSubmit={hasPasswordProvider ? handlePasswordSubmit : (e) => e.preventDefault()}
        className="modal-form"
      >
        <p className="modal-info-text">
          Hesabınız hemen kalıcı olarak silinmez. Hesabınız devre dışı bırakılır ve 60 gün boyunca geri açılabilir.
          Bu süre sonunda hesabınız kalıcı olarak silinir.
        </p>

        {hasPasswordProvider ? (
          <div className="modal-field">
            <label>Şifrenizi Girin</label>
            <div className="modal-input-wrapper">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mevcut şifrenizi girin"
                required
                disabled={loading}
              />
              <button
                type="button"
                className="modal-eye-btn"
                onClick={() => setShowPassword((prev) => !prev)}
                disabled={loading}
              >
                <i className={`fas fa-eye${showPassword ? '-slash' : ''}`}></i>
              </button>
            </div>
          </div>
        ) : hasGoogleProvider ? (
          <div className="delete-auth-box">
            <div className="delete-auth-title">
              <i className="fab fa-google"></i>
              Google ile doğrulama gerekli
            </div>
            <p className="delete-auth-subtitle">
              Bu hesap Google ile giriş yapıyor. Devam etmek için Google hesabınızla yeniden doğrulama yapın.
            </p>
          </div>
        ) : (
          <div className="modal-error">
            Bu hesap için uygun bir doğrulama yöntemi bulunamadı. Lütfen destek ekibiyle iletişime geçin.
          </div>
        )}

        {error && <p className="modal-error">{sanitizeText(error)}</p>}
        {success && <p className="modal-success">{sanitizeText(success)}</p>}

        <div className="modal-actions">
          <button
            type="button"
            className="settings-secondary-button"
            onClick={onClose}
            disabled={loading}
          >
            İptal
          </button>

          {hasPasswordProvider ? (
            <button type="submit" className="settings-danger-button" disabled={loading}>
              {loading ? 'İşleniyor...' : 'Hesabımı Devre Dışı Bırak'}
            </button>
          ) : hasGoogleProvider ? (
            <button
              type="button"
              className="settings-primary-button delete-google-button"
              onClick={handleGoogleDeactivate}
              disabled={loading}
            >
              <i className="fab fa-google"></i>
              {loading ? 'Google Doğrulanıyor...' : 'Google ile Doğrula ve Devre Dışı Bırak'}
            </button>
          ) : null}
        </div>
      </form>
    </Modal>
  );
};

const ProfilePage = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [profileDisplayName, setProfileDisplayName] = useState('');
  const [profilePhoneNumber, setProfilePhoneNumber] = useState('');
  const [loading, setLoading] = useState(true);
  const [activeSetting, setActiveSetting] = useState('user');
  const [activeModal, setActiveModal] = useState(null);
  const [passwordToast, setPasswordToast] = useState('');

  const [googleLinked, setGoogleLinked] = useState(false);
  const [googleLinkLoading, setGoogleLinkLoading] = useState(false);
  const [googleLinkMessage, setGoogleLinkMessage] = useState('');
  const [googleLinkError, setGoogleLinkError] = useState('');
  const [canLinkGoogle, setCanLinkGoogle] = useState(false);
  const [hasPasswordProvider, setHasPasswordProvider] = useState(false);

  const [profilePhotoUrl, setProfilePhotoUrl] = useState(null);
  const [photoUploading, setPhotoUploading] = useState(false);

  const [showAddAddressModal, setShowAddAddressModal] = useState(false);
  const [addresses, setAddresses] = useState([]);
  const [editingAddressId, setEditingAddressId] = useState(null);

  const [emailVerified, setEmailVerified] = useState(false);

  const [orders, setOrders] = useState([]);
  const [completedOrderCount, setCompletedOrderCount] = useState(0);
  const [experts, setExperts] = useState([]);

  const [showDeleteAddressConfirm, setShowDeleteAddressConfirm] = useState(false);
  const [addressToDelete, setAddressToDelete] = useState(null);

  const formatTrDate = (dateStr) => {
    const s = String(dateStr || '').trim();
    if (!s) return '';
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return sanitizeText(s);
    return d.toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' });
  };

  const getSafeAvatar = async (expertId, name) => {
    try {
      const url = await getProfilePhoto(expertId);
      if (url) return url;
    } catch {
      /* ignore */
    }
    const seed = encodeURIComponent(String(expertId || name || 'uzman'));
    return `https://i.pravatar.cc/150?u=${seed}`;
  };

  const openCompletedAppointments = (focusId) => {
    navigate('/customer-appointments?tab=completed', focusId ? { state: { focusId } } : undefined);
  };

  const confirmDeleteAddress = async () => {
    const addressId = addressToDelete;
    if (!addressId) return;

    try {
      const addressDocRef = doc(db, 'users', user.uid, 'addresses', String(addressId));
      await deleteDoc(addressDocRef);
      showAppToast('Adres başarıyla silindi.', 'success');
    } catch (error) {
      if (isDevelopment) console.error('Silme hatası:', error.message);
      showAppToast('Adres silinirken bir hata oluştu.', 'error');
    } finally {
      setShowDeleteAddressConfirm(false);
      setAddressToDelete(null);
    }
  };

  const handleDeleteAddress = (addressId) => {
    setAddressToDelete(addressId);
    setShowDeleteAddressConfirm(true);
  };

  useEffect(() => {
    let cancelled = false;

    const unsub = onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser) {
        navigate('/login');
        return;
      }

      setUser(currentUser);
      setEmailVerified(!!currentUser.emailVerified);

      const currentEmail = String(currentUser.email || "").trim().toLowerCase();
      setCanLinkGoogle(currentEmail.endsWith("@gmail.com"));

      try {
        const snap = await getDoc(doc(db, 'users', currentUser.uid));
        if (!cancelled) {
          const data = snap.exists() ? snap.data() : null;
          setProfileDisplayName(
            data?.displayName ||
              data?.email?.split('@')[0] ||
              currentUser.email?.split('@')[0] ||
              'Kullanıcı'
          );
          setProfilePhoneNumber(data?.phoneNumber || currentUser.phoneNumber || '');
        }
      } catch {
        if (!cancelled) {
          setProfileDisplayName(currentUser.email?.split('@')[0] || 'Kullanıcı');
          setProfilePhoneNumber(currentUser.phoneNumber || '');
        }
      }

      try {
        const photo = await getProfilePhoto(currentUser.uid);
        if (!cancelled && photo) setProfilePhotoUrl(photo);
      } catch {
        /* ignore */
      }

      try {
        const flags = getCurrentUserProviderFlags();
        if (!cancelled) {
          setGoogleLinked(!!flags.hasGoogle);
          setHasPasswordProvider(!!flags.hasPassword);
        }
      } catch {
        if (!cancelled) {
          setGoogleLinked(false);
          setHasPasswordProvider(false);
        }
      }

      if (!cancelled) setLoading(false);
    });

    return () => {
      cancelled = true;
      unsub();
    };
  }, [navigate]);

  useEffect(() => {
    if (!user?.uid) return;

    const addressesRef = collection(db, 'users', user.uid, 'addresses');
    const q = query(addressesRef, orderBy('createdAt', 'desc'));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const fetchedAddresses = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
        }));
        setAddresses(fetchedAddresses);
      },
      (error) => {
        if (isDevelopment) console.error('Adres çekme hatası:', error.message);
      }
    );

    return () => unsubscribe();
  }, [user?.uid]);

  useEffect(() => {
    if (!user?.uid) return;

    const q = query(collection(db, 'appointments'), where('clientId', '==', user.uid));

    const unsubscribe = onSnapshot(
      q,
      async (snapshot) => {
        const completed = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          const normalizedStatus = String(data?.status || '').trim().toLowerCase();
          if (normalizedStatus !== 'completed') return;
          completed.push({ id: docSnap.id, ...data });
        });

        completed.sort((a, b) => {
          const at =
            a?.checkOutTime?.toDate?.()?.getTime?.() ??
            a?.approvedTime ??
            a?.createdTime ??
            0;
          const bt =
            b?.checkOutTime?.toDate?.()?.getTime?.() ??
            b?.approvedTime ??
            b?.createdTime ??
            0;
          return bt - at;
        });

        const recentOrders = completed.slice(0, 3).map((app) => ({
          id: app.id,
          title: app.listingTitle || app.note || 'Hizmet',
          date: formatTrDate(app.date),
          provider: app.expertName || 'Uzman',
          price: typeof app.price === 'number' ? app.price : null,
          expertId: app.expertId || null,
          city: app.city || '',
          district: app.district || '',
          time: app.start || '',
        }));

        const uniqueExperts = [];
        const seen = new Set();
        for (const app of completed) {
          const expertId = app?.expertId;
          if (!expertId || seen.has(expertId)) continue;
          seen.add(expertId);
          uniqueExperts.push({
            id: expertId,
            expertId,
            name: app.expertName || 'Uzman',
            lastService: app.listingTitle || app.note || 'Hizmet',
          });
          if (uniqueExperts.length >= 3) break;
        }

        const withAvatarsAndProfessions = await Promise.all(
          uniqueExperts.map(async (e) => {
            let profession = '';
            let category = '';
            try {
              const expertDoc = await getDoc(doc(db, 'service_providers', e.expertId));
              if (expertDoc.exists()) {
                const d = expertDoc.data() || {};
                profession = String(d.profession || '').trim();
                category = String(d.category || '').split(',')[0]?.trim() || '';
              }
            } catch {
              /* ignore */
            }

            return {
              ...e,
              avatar: await getSafeAvatar(e.expertId, e.name),
              profession: profession || category || 'Uzman',
            };
          })
        );

        setOrders(recentOrders);
        setCompletedOrderCount(completed.length);
        setExperts(withAvatarsAndProfessions);
      },
      (error) => {
        if (isDevelopment) console.error('Randevu geçmişi çekme hatası:', error?.message || error);
        setOrders([]);
        setExperts([]);
        setCompletedOrderCount(0);
      }
    );

    return () => unsubscribe();
  }, [user?.uid]);

  const handleLinkGoogle = async () => {
    setGoogleLinkError('');
    setGoogleLinkMessage('');
    setGoogleLinkLoading(true);

    try {
      const result = await linkGoogleToCurrentUser();
      setGoogleLinked(true);
      setGoogleLinkMessage(result?.message || 'Google hesabı başarıyla bağlandı.');
    } catch (err) {
      if (
        err?.code === 'GOOGLE_ACCOUNT_EMAIL_MISMATCH' ||
        err?.code === 'GOOGLE_EMAIL_NOT_RESOLVED'
      ) {
        setGoogleLinkError(
          err?.message ||
            'Seçilen Google hesabı mevcut hesap e-postasıyla eşleşmiyor.'
        );
        return;
      }

      if (err?.code === 'GOOGLE_CREDENTIAL_ALREADY_IN_USE') {
        setGoogleLinkError(
          err?.message || 'Bu Google hesabı başka bir kullanıcıya bağlı.'
        );
        return;
      }

      if (err?.code === 'GOOGLE_ALREADY_LINKED') {
        setGoogleLinked(true);
        setGoogleLinkMessage('Google hesabı zaten bağlı.');
        return;
      }

      if (err?.code === 'GOOGLE_POPUP_CLOSED') {
        return;
      }

      if (err?.code === 'GOOGLE_POPUP_BLOCKED') {
        setGoogleLinkError(
          err?.message ||
            'Google açılır penceresi engellendi. Lütfen pop-up izni verin.'
        );
        return;
      }

      setGoogleLinkError(err?.message || 'Google hesabı bağlanamadı.');
    } finally {
      setGoogleLinkLoading(false);
    }
  };

  const handleProfilePhotoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      showAppToast('Sadece JPEG, PNG veya WEBP formatında resim yükleyebilirsiniz!', 'error');
      e.target.value = '';
      return;
    }

    const maxSize = 2 * 1024 * 1024;
    if (file.size > maxSize) {
      showAppToast('Dosya boyutu 2MB\'dan küçük olmalıdır!', 'error');
      e.target.value = '';
      return;
    }

    setPhotoUploading(true);
    try {
      const options = {
        maxSizeMB: 0.1,
        maxWidthOrHeight: 256,
        useWebWorker: true,
      };

      const compressedFile = await imageCompression(file, options);

      const url = await uploadProfilePhoto({ uid: user.uid, file: compressedFile });
      setProfilePhotoUrl(url);

      const batch = writeBatch(db);

      const clientChatsQ = query(collection(db, "conversations"), where("clientUid", "==", user.uid));
      const clientChatsSnap = await getDocs(clientChatsQ);
      clientChatsSnap.forEach((chatDoc) => {
        batch.update(chatDoc.ref, { clientAvatar: url });
      });

      const providerChatsQ = query(collection(db, "conversations"), where("providerUid", "==", user.uid));
      const providerChatsSnap = await getDocs(providerChatsQ);
      providerChatsSnap.forEach((chatDoc) => {
        batch.update(chatDoc.ref, { providerAvatar: url });
      });

      await batch.commit();
    } catch (err) {
      if (isDevelopment) {
        console.error('Profil fotoğrafı yüklenemedi veya sohbetlere aktarılamadı:', err.message);
      }
      showAppToast('Fotoğraf yüklenirken bir hata oluştu. Lütfen daha sonra tekrar deneyin.', 'error');
    } finally {
      setPhotoUploading(false);
      e.target.value = '';
    }
  };

  const handleSaveAddress = async (formData) => {
    const {
      addressName,
      city,
      district,
      neighborhood,
      street,
      siteName,
      apartmentName,
      blockName,
      buildingNo,
      floor,
      doorNo,
      lat,
      lng,
      coordSource,
    } = formData;

    if (
      !city ||
      !district ||
      !neighborhood ||
      !street?.trim() ||
      street.trim().length < 3 ||
      !buildingNo?.trim() ||
      !floor?.trim() ||
      !doorNo?.trim()
    ) {
      showAppToast('Eksik veya Hatalı Alan! Cadde/Sokak, Bina No, Kat ve Daire bilgilerini doldurmak zorunludur.', 'error');
      return;
    }

    const forbiddenWords = ['asd', 'qwe', 'test', 'zxc', 'deneme', 'adsız', 'bilinmiyor', 'yok'];
    const lowerStreet = (street || '').toLowerCase().trim();
    const lowerBuilding = (buildingNo || '').toLowerCase().trim();

    const validStreetPattern = /^[a-zA-ZğüşıöçĞÜŞİÖÇ\s\d/.-]+$/;
    if (!validStreetPattern.test(street)) {
      showAppToast('Cadde/Sokak adı geçersiz karakterler içeriyor!', 'error');
      return;
    }

    if (forbiddenWords.includes(lowerStreet) || forbiddenWords.includes(lowerBuilding)) {
      showAppToast('Lütfen gerçek adres bilgilerini girdiğinizden emin olun.', 'error');
      return;
    }

    try {
      const finalAddressData = {
        addressName: sanitizeText(addressName?.trim() || 'İsimsiz Adres'),
        city: sanitizeText(city),
        district: sanitizeText(district),
        neighborhood: sanitizeText(neighborhood),
        street: sanitizeText(street.trim()),
        siteName: sanitizeText(siteName?.trim() || ''),
        apartmentName: sanitizeText(apartmentName?.trim() || ''),
        blockName: sanitizeText(blockName?.trim() || ''),
        buildingNo: sanitizeText(buildingNo.trim()),
        floor: sanitizeText(floor.trim()),
        doorNo: sanitizeText(doorNo.trim()),
        lat: lat ?? null,
        lng: lng ?? null,
        coordSource: coordSource || 'Unknown',
        updatedAt: serverTimestamp(),
      };

      if (editingAddressId) {
        const addressDocRef = doc(db, 'users', user.uid, 'addresses', editingAddressId);
        await updateDoc(addressDocRef, finalAddressData);
        showAppToast('Adresiniz başarıyla güncellendi!', 'success');
      } else {
        finalAddressData.createdAt = serverTimestamp();
        const addressesRef = collection(db, 'users', user.uid, 'addresses');
        await addDoc(addressesRef, finalAddressData);
        showAppToast('Adresiniz başarıyla kaydedildi!', 'success');
      }

      setShowAddAddressModal(false);
      setEditingAddressId(null);
    } catch (error) {
      if (isDevelopment) console.error('Firebase işlem hatası:', error.message);
      showAppToast('İşlem sırasında bir hata oluştu. Lütfen daha sonra tekrar deneyin.', 'error');
    }
  };

  const handleEditClick = (address) => {
    setEditingAddressId(address.id);
    setShowAddAddressModal(true);
  };

  const getUserDisplayName = () =>
    sanitizeText(profileDisplayName || user?.email?.split('@')[0] || 'Kullanıcı');

  const getUserInitials = () => {
    const parts = getUserDisplayName().trim().split(/\s+/);
    return parts.length > 1
      ? (parts[0][0] + parts[1][0]).toUpperCase()
      : getUserDisplayName().substring(0, 2).toUpperCase();
  };

  const locationLabel = useMemo(() => {
    const primary = Array.isArray(addresses) && addresses.length > 0 ? addresses[0] : null;
    const city = String(primary?.city || '').trim();
    const district = String(primary?.district || '').trim();
    if (city && district) return `${sanitizeText(city)}, ${sanitizeText(district)}`;
    if (city) return sanitizeText(city);
    return 'Adres eklenmedi';
  }, [addresses]);

  if (loading) {
    return (
      <div className="profile-page">
        <Navbar />
        <LoadingSpinner text="Profil yükleniyor..." />
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="profile-page">
      <Navbar />

      {activeModal === 'name' && (
        <NameModal
          user={user}
          currentName={getUserDisplayName()}
          onClose={() => setActiveModal(null)}
          onSuccess={(v) => setProfileDisplayName(v)}
        />
      )}

      {activeModal === 'phone' && (
        <PhoneModal
          user={user}
          onClose={() => setActiveModal(null)}
          onSuccess={(v) => setProfilePhoneNumber(v)}
        />
      )}

      {activeModal === 'password' && (
        <PasswordModal
          onClose={() => setActiveModal(null)}
          onSuccess={() => {
            setActiveModal(null);
            setPasswordToast('Şifre güncellendi.');
            setTimeout(() => setPasswordToast(''), 4000);
          }}
        />
      )}

      {activeModal === 'deleteAccount' && (
        <DeleteAccountModal
          hasPasswordProvider={hasPasswordProvider}
          hasGoogleProvider={googleLinked}
          onClose={() => setActiveModal(null)}
          onDeleted={() => {
            setActiveModal(null);
            window.location.href = '/';
          }}
        />
      )}

      <main className="profile-main">
        <div className="profile-header-card">
          <div className="profile-header-left">
            <div className="profile-avatar-large">
              {profilePhotoUrl ? (
                <img
                  src={profilePhotoUrl}
                  alt="Profil"
                  style={{
                    width: '80px',
                    height: '80px',
                    borderRadius: '50%',
                    objectFit: 'cover',
                    border: '3px solid var(--card-border)',
                    display: 'block',
                  }}
                />
              ) : (
                <div className="avatar-circle-large">
                  <span className="avatar-initials-large">{getUserInitials()}</span>
                </div>
              )}

              <label
                style={{
                  position: 'absolute',
                  bottom: 0,
                  right: 0,
                  width: '28px',
                  height: '28px',
                  borderRadius: '50%',
                  background: 'var(--primary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: photoUploading ? 'not-allowed' : 'pointer',
                  opacity: photoUploading ? 0.6 : 1,
                  boxShadow: 'var(--shadow)',
                }}
              >
                <input
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  disabled={photoUploading}
                  onChange={handleProfilePhotoUpload}
                />
                {photoUploading ? (
                  <i className="fas fa-spinner fa-spin" style={{ fontSize: '12px', color: '#0b1020' }}></i>
                ) : (
                  <i className="fas fa-camera" style={{ fontSize: '12px', color: '#0b1020' }}></i>
                )}
              </label>
            </div>

            <div className="profile-header-info">
              <h1 className="profile-header-name">{getUserDisplayName()}</h1>
              <p className="profile-header-username">
                @{getUserDisplayName().toLowerCase().replace(/\s/g, '')}
              </p>
              <div className="profile-header-contact">
                <span>
                  <i className="fas fa-envelope"></i> {sanitizeText(user.email || 'E-posta yok')}
                </span>
                <span>
                  <i className="fas fa-phone"></i> {sanitizeText(profilePhoneNumber || 'Telefon yok')}
                </span>
              </div>
            </div>
          </div>

          <div className="profile-header-right">
            <div className="header-stat-item">
              <span className="header-stat-value">{completedOrderCount}</span>
              <span className="header-stat-label">Tamamlanan Sipariş</span>
            </div>
          </div>
        </div>

        <div className="expert-tabs">
          {[
            { key: 'user', icon: 'fa-user-circle', label: 'Kullanıcı Bilgileri' },
            { key: 'addresses', icon: 'fa-map-marker-alt', label: 'Kayıtlı Adreslerim' },
            { key: 'security', icon: 'fa-shield-alt', label: 'Güvenlik' },
          ].map(({ key, icon, label }) => (
            <button
              key={key}
              className={`tab-btn ${activeSetting === key ? 'active' : ''}`}
              onClick={() => setActiveSetting(key)}
            >
              <i className={`fas ${icon}`}></i> {label}
            </button>
          ))}
        </div>

        <section className="profile-card-section profile-settings-detail">
          {activeSetting === 'user' && (
            <div className="settings-combined-container">
              <h4 className="settings-section-title">Kişisel Bilgiler</h4>
              <div className="settings-detail-grid">
                <div className="settings-field-group">
                  <span className="settings-field-label">AD SOYAD</span>
                  <span className="settings-field-value">{getUserDisplayName()}</span>
                </div>
                <div className="settings-field-group">
                  <div className="settings-field-label-row">
                    <span className="settings-field-label">E-POSTA</span>

                    {emailVerified ? (
                      <span className="settings-email-status-inline verified" title="E-posta doğrulandı">
                        <span className="settings-email-status-dot verified"></span>
                        <span className="settings-email-status-text verified">Doğrulandı</span>
                      </span>
                    ) : (
                      <span className="settings-email-status-inline unverified" title="E-posta doğrulanmadı">
                        <span className="settings-email-status-dot unverified"></span>
                        <span className="settings-email-status-text unverified">Doğrulanmadı</span>
                      </span>
                    )}
                  </div>

                  <span className="settings-field-value">{sanitizeText(user.email || 'Belirtilmemiş')}</span>
                </div>
                <div className="settings-field-group">
                  <span className="settings-field-label">TELEFON</span>
                  <span className="settings-field-value">{sanitizeText(profilePhoneNumber || 'Belirtilmemiş')}</span>
                </div>
                <div className="settings-field-group">
                  <span className="settings-field-label">KONUM</span>
                  <span className="settings-field-value">{locationLabel}</span>
                </div>
              </div>
            </div>
          )}

          {activeSetting === 'addresses' && (
            <div className="settings-combined-container saved-addresses-section">
              <div className="saved-addresses-section__head">
                <div>
                  <h4 className="settings-section-title saved-addresses-section__title">Kayıtlı Adresler</h4>
                  <p className="settings-helper-text saved-addresses-section__hint">
                    En fazla iki adres kaydedebilirsiniz.
                  </p>
                </div>
                {addresses.length < 2 && (
                  <button
                    type="button"
                    className="settings-primary-button saved-addresses-add-btn"
                    onClick={() => {
                      setEditingAddressId(null);
                      setShowAddAddressModal(true);
                    }}
                  >
                    <i className="fas fa-plus" aria-hidden="true"></i> Yeni Adres Ekle
                  </button>
                )}
              </div>

              {addresses.length === 0 ? (
                <div className="saved-addresses-empty">
                  <i className="fas fa-map-marker-alt" aria-hidden="true"></i>
                  <p>Henüz kayıtlı adresiniz yok.</p>
                  <button
                    type="button"
                    className="settings-primary-button"
                    onClick={() => {
                      setEditingAddressId(null);
                      setShowAddAddressModal(true);
                    }}
                  >
                    <i className="fas fa-plus" aria-hidden="true"></i> İlk Adresini Ekle
                  </button>
                </div>
              ) : (
                <div className="saved-addresses-list">
                  {addresses.map((address) => {
                    const chipLines = buildAddressChipLines(address);

                    return (
                      <article key={address.id} className="saved-address-card">
                        <div className="saved-address-card__top">
                          <div className="saved-address-card__title-row">
                            <span className="saved-address-card__icon-badge" aria-hidden="true">
                              <i className="fas fa-map-marker-alt"></i>
                            </span>
                            <h5 className="saved-address-card__name">
                              {sanitizeText(address.addressName || 'Adres')}
                            </h5>
                          </div>
                          <div className="saved-address-card__actions">
                            <button
                              type="button"
                              className="settings-secondary-button saved-address-update-btn"
                              onClick={() => handleEditClick(address)}
                              title="Adresi güncelle"
                            >
                              <i className="fas fa-pen" aria-hidden="true"></i>
                              <span className="saved-address-btn-text">Güncelle</span>
                            </button>
                            <button
                              type="button"
                              className="settings-danger-button saved-address-delete-btn"
                              onClick={() => handleDeleteAddress(address.id)}
                              title="Adresi sil"
                            >
                              <i className="fas fa-trash" aria-hidden="true"></i>
                              <span className="saved-address-btn-text">Sil</span>
                            </button>
                          </div>
                        </div>

                        <div className="saved-address-card__lines">
                          {chipLines.map((row, rowIndex) => {
                            const cols = 4;
                            const padded = [...row];
                            while (padded.length < cols) padded.push(null);

                            return (
                              <div key={`${address.id}-line-${rowIndex}`} className="saved-address-card__line">
                                {padded.map((chip, colIndex) =>
                                  chip ? (
                                    <div key={`${address.id}-${chip.label}`} className="saved-address-detail">
                                      <span className="saved-address-detail__label">{chip.label}</span>
                                      <span className="saved-address-detail__value">{sanitizeText(chip.value)}</span>
                                    </div>
                                  ) : (
                                    <div
                                      key={`${address.id}-pad-${rowIndex}-${colIndex}`}
                                      className="saved-address-detail saved-address-detail--empty"
                                      aria-hidden="true"
                                    />
                                  )
                                )}
                              </div>
                            );
                          })}
                        </div>

                        {address.coordSource !== 'API_Center' && address.coordSource !== 'API_District' && address.coordSource !== 'GoogleMap' && address.coordSource !== 'Unknown' && (
                          <div className="saved-address-coord-warn" role="status">
                            <i className="fas fa-exclamation-triangle" aria-hidden="true"></i>
                            <span>Konum doğruluğu düşük — <strong>Güncelle</strong> ile adresinizi düzenleyin.</span>
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {activeSetting === 'security' && (
            <div className="settings-security">
              {passwordToast && (
                <div
                  style={{
                    color: '#10b981',
                    background: 'rgba(16,185,129,0.1)',
                    padding: '10px 14px',
                    borderRadius: '10px',
                    fontSize: '13px',
                  }}
                >
                  <i className="fas fa-check-circle"></i> {sanitizeText(passwordToast)}
                </div>
              )}

              {googleLinkMessage && (
                <div className="security-inline-success">
                  <i className="fab fa-google"></i> {sanitizeText(googleLinkMessage)}
                </div>
              )}

              {googleLinkError && (
                <div className="security-inline-error">
                  <i className="fas fa-exclamation-circle"></i> {sanitizeText(googleLinkError)}
                </div>
              )}

              <p className="settings-helper-text">
                Hesabınızın güvenliğini artırmak için aşağıdaki ayarları kullanabilirsiniz.
              </p>

              <div className="settings-security-list">
                <div className="settings-security-item">
                  <div>
                    <div className="settings-security-title">Ad Soyad Güncelle</div>
                    <div className="settings-security-subtitle">Profilinizde görünen adı güncelleyin.</div>
                  </div>
                  <button className="settings-primary-button" onClick={() => setActiveModal('name')}>
                    Düzenle
                  </button>
                </div>

                <div className="settings-security-item">
                  <div>
                    <div className="settings-security-title">Telefon Numarası Güncelle</div>
                    <div className="settings-security-subtitle">
                      Yeni numaranızı SMS kodu ile doğrulayarak hesabınıza bağlayın.
                    </div>
                  </div>
                  <button className="settings-secondary-button" onClick={() => setActiveModal('phone')}>
                    Telefonu Düzenle
                  </button>
                </div>

                <div className="settings-security-item">
                  <div>
                    <div className="settings-security-title">Google Hesabı</div>
                    <div className="settings-security-subtitle">
                      Google hesabınızı mevcut hesabınıza bağlayarak daha hızlı giriş yapabilirsiniz.
                    </div>
                  </div>

                  {googleLinked ? (
                    <span className="settings-status-badge">
                      <i className="fab fa-google"></i> Google bağlı
                    </span>
                  ) : canLinkGoogle ? (
                    <button
                      className="settings-primary-button"
                      onClick={handleLinkGoogle}
                      disabled={googleLinkLoading}
                    >
                      {googleLinkLoading ? 'Bağlanıyor...' : 'Google Hesabını Bağla'}
                    </button>
                  ) : (
                    <span className="settings-disabled-badge">
                      Sadece Gmail kullanıcıları bağlayabilir
                    </span>
                  )}
                </div>

                <div className="settings-security-item">
                  <div>
                    <div className="settings-security-title">Şifre Değiştir</div>
                    <div className="settings-security-subtitle">
                      {hasPasswordProvider
                        ? 'Hesap şifrenizi düzenli aralıklarla güncelleyin.'
                        : 'Bu hesap Google ile giriş yapıyor ve kullanılabilir bir şifreye sahip değil.'}
                    </div>
                  </div>

                  <span
                    title={
                      hasPasswordProvider
                        ? ''
                        : 'Bu hesap Google ile bağlıdır ve şifreye sahip değildir.'
                    }
                    style={{ display: 'inline-flex' }}
                  >
                    <button
                      className="settings-primary-button"
                      onClick={() => setActiveModal('password')}
                      disabled={!hasPasswordProvider}
                      style={
                        !hasPasswordProvider
                          ? {
                              opacity: 0.55,
                              cursor: 'not-allowed',
                            }
                          : {}
                      }
                    >
                      Şifreyi Değiştir
                    </button>
                  </span>
                </div>

                <div className="settings-security-item security-danger-row">
                  <div>
                    <div className="security-danger-title">Hesabımı Devre Dışı Bırak</div>
                    <div className="settings-security-subtitle">
                      Hesabınız devre dışı bırakılır ve 60 gün boyunca geri açılabilir.
                      60 gün sonunda kalıcı olarak silinir.
                    </div>
                  </div>
                  <button className="settings-danger-button" onClick={() => setActiveModal('deleteAccount')}>
                    Hesabı Devre Dışı Bırak
                  </button>
                </div>
              </div>
            </div>
          )}
        </section>

        <section className="profile-card-section">
          <div className="section-header">
            <h3><i className="fas fa-box"></i> Son Siparişlerim</h3>
            <button className="view-all" onClick={() => openCompletedAppointments()}>
              Tümü <i className="fas fa-arrow-right"></i>
            </button>
          </div>

          <div className="orders-list">
            {orders.length === 0 ? (
              <div className="ma-empty" style={{ padding: '18px', textAlign: 'center' }}>
                <i className="fas fa-box-open ma-empty-icon"></i>
                <h3 className="ma-empty-title">Henüz tamamlanan işlem yok</h3>
                <p className="ma-empty-text">Bir randevunuz tamamlandığında burada görünecek.</p>
              </div>
            ) : orders.map((order) => (
              <div
                key={order.id}
                className="order-item"
                onClick={() => openCompletedAppointments(order.id)}
              >
                <div className="order-info">
                  <div className="order-title-row">
                    <h4 className="order-title">{sanitizeText(order.title)}</h4>
                    <span className="order-chevron" aria-hidden="true">
                      <i className="fas fa-chevron-right"></i>
                    </span>
                  </div>

                  <div className="order-meta">
                    <span className="order-meta-item">
                      <i className="fas fa-calendar-alt"></i> {sanitizeText(order.date || '')}
                    </span>
                    {order.time ? (
                      <span className="order-meta-item">
                        <i className="fas fa-clock"></i> {sanitizeText(order.time)}
                      </span>
                    ) : null}
                    {(order.district || order.city) ? (
                      <span className="order-meta-item">
                        <i className="fas fa-map-marker-alt"></i>{' '}
                        {sanitizeText(
                          [order.district, order.city].filter(Boolean).join(', ')
                        )}
                      </span>
                    ) : null}
                  </div>

                  <div className="order-subline">
                    <span className="order-badge">
                      <i className="fas fa-user"></i> {sanitizeText(order.provider)}
                    </span>
                    <span className="order-badge order-badge--done">
                      <i className="fas fa-flag-checkered"></i> Tamamlandı
                    </span>
                  </div>
                </div>

                <span className="order-price">
                  {typeof order.price === 'number' ? `₺${order.price}` : '—'}
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="profile-card-section">
          <div className="section-header">
            <h3><i className="fas fa-users"></i> Son Kullanılan Uzmanlar</h3>
            <button className="view-all" onClick={() => openCompletedAppointments()}>
              Tümü <i className="fas fa-arrow-right"></i>
            </button>
          </div>

          <div className="recent-experts-horizontal">
            {experts.length === 0 ? (
              <div className="ma-empty" style={{ padding: '18px', textAlign: 'center' }}>
                <i className="fas fa-user-clock ma-empty-icon"></i>
                <h3 className="ma-empty-title">Henüz uzman geçmişi yok</h3>
                <p className="ma-empty-text">Tamamlanan randevularınızdan uzmanlar burada listelenecek.</p>
              </div>
            ) : experts.map((expert) => (
              <div
                key={expert.id}
                className="expert-horizontal-card"
                role="button"
                tabIndex={0}
                onClick={() => navigate(`/uzman/${expert.expertId}`)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') navigate(`/uzman/${expert.expertId}`);
                }}
              >
                <img src={expert.avatar} alt={sanitizeText(expert.name)} />
                <div className="expert-horizontal-info">
                  <h4>{sanitizeText(expert.name)}</h4>
                  <p className="expert-profession">{sanitizeText(expert.profession || 'Uzman')}</p>
                  <p className="expert-lastservice">
                    <i className="fas fa-wrench"></i> {sanitizeText(expert.lastService)}
                  </p>
                </div>
                <button
                  className="rate-small-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate(`/uzman/${expert.expertId}`);
                  }}
                >
                  İncele
                </button>
              </div>
            ))}
          </div>
        </section>

        <AddressModal
          isOpen={showAddAddressModal}
          onClose={() => {
            setShowAddAddressModal(false);
            setEditingAddressId(null);
          }}
          onSave={handleSaveAddress}
          initialData={editingAddressId ? addresses.find((a) => a.id === editingAddressId) : null}
          isEditing={!!editingAddressId}
        />
      </main>

      <ConfirmModal
        isOpen={showDeleteAddressConfirm}
        onClose={() => {
          setShowDeleteAddressConfirm(false);
          setAddressToDelete(null);
        }}
        onConfirm={confirmDeleteAddress}
        title="Adres Sil"
        message="Bu adresi silmek istediğinize emin misiniz? Bu işlem geri alınamaz."
        confirmText="Evet, Sil"
        cancelText="Vazgeç"
        type="danger"
      />
    </div>
  );
};

export default ProfilePage;