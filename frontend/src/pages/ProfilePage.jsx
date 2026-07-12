//ProfilePage.jsx file code 

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
  const raw = String(text);
  const normalized = raw.trim().toLocaleLowerCase('tr-TR');
  const visibleTextTranslations = {
    'bu çok önemli bir şey.': 'هذه معلومة مهمة.',
    'bu, bir mesaj olarak kabul edildi.': 'تم حفظ هذه المعلومة.',
    'bu bir gerçek': 'هذا صحيح.',
    "yeni zelanda'nın en iyisi": 'أفضل خبير في المنطقة',
  };
  return DOMPurify.sanitize(visibleTextTranslations[normalized] || raw);
};

const filterAddressChips = (items) =>
  items.filter((item) => item && String(item.value || '').trim());

const buildAddressChipLines = (address) => {
  const governorate =
    address.governorate ||
    address.city ||
    "";

  const area =
    address.area ||
    address.district ||
    address.neighborhood ||
    "";

  const additionalInfo =
    address.additionalInfo ||
    address.street ||
    "";

  return [
    filterAddressChips([
      {
        label: "المحافظة",
        value: governorate,
      },
      {
        label: "المنطقة",
        value: area,
      },
    ]),

    filterAddressChips([
      {
        label: "معلومات إضافية",
        value: additionalInfo,
      },
    ]),
  ].filter((row) => row.length > 0);
};

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
  if (pass.length < 6) errors.push('يجب أن تتكون كلمة المرور من 6 أحرف على الأقل.');
  if (!/[A-Z]/.test(pass)) errors.push('يجب أن تحتوي على حرف كبير واحد على الأقل.');
  if (!/[a-z]/.test(pass)) errors.push('يجب أن تحتوي على حرف صغير واحد على الأقل.');
  if (!/[0-9]/.test(pass)) errors.push('يجب أن تحتوي على رقم واحد على الأقل.');
  if (!hasSpecialChar(pass)) errors.push('يجب أن تحتوي على رمز خاص واحد على الأقل.');
  if (hasConsecutiveChars(pass)) errors.push('يجب ألا تحتوي على أحرف متتابعة مثل abc أو 123.');
  if (hasRepeatedChars(pass)) errors.push('يجب ألا يتكرر نفس الحرف ثلاث مرات مثل aaa.');
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
  if (s === 0) return 'قوة كلمة المرور: ضعيفة';
  if (s <= 25) return 'قوة كلمة المرور: ضعيفة جداً';
  if (s <= 50) return 'قوة كلمة المرور: متوسطة';
  if (s <= 75) return 'قوة كلمة المرور: جيدة';
  if (s < 100) return 'قوة كلمة المرور: جيدة جداً';
  return 'قوة كلمة المرور: ممتازة ✓';
}

function mapFirebaseAuthError(error) {
  const code = error?.code;
  if (code === 'auth/wrong-password' || code === 'auth/invalid-credential') return 'كلمة المرور الحالية غير صحيحة.';
  if (code === 'auth/too-many-requests') return 'تم إجراء محاولات كثيرة. يرجى الانتظار قليلاً ثم المحاولة مرة أخرى.';
  if (code === 'auth/requires-recent-login') return 'لأسباب أمنية، يرجى تسجيل الدخول مرة أخرى.';
  if (code === 'auth/network-request-failed') return 'حدث خطأ في الاتصال. يرجى التحقق من الإنترنت.';
  if (code === 'auth/weak-password') return 'كلمة المرور الجديدة ضعيفة جداً.';
  return 'تعذر تحديث كلمة المرور. يرجى المحاولة لاحقاً.';
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
      setError('الاسم والكنية مطلوبان.');
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

      setSuccess('تم تحديث الاسم الكامل.');
      onSuccess(displayName);
      setTimeout(onClose, 1200);
    } catch (err) {
      if (isDevelopment) console.error("Ad soyad güncellenemedi:", err.message);
      setError('حدث خطأ أثناء تحديث الاسم الكامل. يرجى المحاولة لاحقاً.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal title="تحديث الاسم الكامل" onClose={onClose}>
      <form onSubmit={handleSubmit} className="modal-form">
        <div className="modal-field">
          <label>الاسم</label>
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
          <label>الكنية</label>
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
            إلغاء
          </button>
          <button type="submit" className="settings-primary-button" disabled={loading}>
            {loading ? 'جاري الحفظ...' : 'حفظ'}
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
      setError('يرجى إدخال رقم صالح بصيغة 5xx xxx xx xx.');
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
      setSuccess('تم إرسال رمز SMS. يرجى التحقق من هاتفك.');
    } catch (err) {
      if (isDevelopment) console.error("Kod gönderme hatası:", err.message);
      setError('تعذر إرسال الرمز. يرجى المحاولة لاحقاً.');
    } finally {
      setSendingOtp(false);
    }
  };

  const handleVerifyAndSave = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!confirmationResult) {
      setError('لم يتم العثور على جلسة التحقق. يرجى إرسال الرمز مرة أخرى.');
      return;
    }

    if (!String(otpCode).trim() || String(otpCode).trim().length < 6) {
      setError('يرجى إدخال رمز التحقق المكون من 6 أرقام.');
      return;
    }

    setLoading(true);

    try {
      const result = await confirmPhoneLinking(confirmationResult, otpCode);
      const finalPhone = result?.user?.phoneNumber || `+90${normalize(digits)}`;
      setSuccess('تم التحقق من رقم الهاتف وحفظه بنجاح.');
      onSuccess(finalPhone);
      setTimeout(() => {
        clearRecaptcha();
        onClose();
      }, 1200);
    } catch (err) {
      if (isDevelopment) console.error("Doğrulama hatası:", err.message);
      setError('فشل التحقق. يرجى المحاولة لاحقاً.');
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
      setSuccess('تم إرسال رمز SMS جديد.');
    } catch (err) {
      if (isDevelopment) console.error("Kod gönderme hatası:", err.message);
      setError('تعذر إرسال الرمز مرة أخرى. يرجى المحاولة لاحقاً.');
    } finally {
      setSendingOtp(false);
    }
  };

  return (
    <Modal title="تحديث رقم الهاتف" onClose={onClose}>
      <form onSubmit={step === 'phone' ? handleSendOtp : handleVerifyAndSave} className="modal-form">
        <div className="phone-verify-shell">
          <div className="phone-verify-step">
            <div className={`phone-step-badge ${step === 'phone' ? 'active' : 'done'}`}>1</div>
            <span>الرقم</span>
          </div>
          <div className="phone-step-line"></div>
          <div className="phone-verify-step">
            <div className={`phone-step-badge ${step === 'otp' ? 'active' : ''}`}>2</div>
            <span>OTP</span>
          </div>
        </div>

        <div className="modal-field">
          <label>الهاتف الجديد (+90)</label>
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
            <label>رمز OTP</label>
            <input
              type="text"
              inputMode="numeric"
              value={otpCode}
              onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="رمز من 6 أرقام"
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
            {sendingOtp ? 'جاري إرسال الرمز...' : 'إرسال الرمز مرة أخرى'}
          </button>
        )}

        <div className="modal-actions">
          <button
            type="button"
            className="settings-secondary-button"
            onClick={onClose}
            disabled={loading || sendingOtp}
          >
            إلغاء
          </button>

          {step === 'phone' ? (
            <button type="submit" className="settings-primary-button" disabled={sendingOtp || loading}>
              {sendingOtp ? 'جاري إرسال الرمز...' : 'إرسال الرمز'}
            </button>
          ) : (
            <button type="submit" className="settings-primary-button" disabled={loading}>
              {loading ? 'جاري التحقق...' : 'تحقق واحفظ'}
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
      setError('متطلبات كلمة المرور غير مكتملة.');
      return;
    }

    if (strength !== 100) {
      setError(`كلمة المرور ليست قوية بما يكفي. القوة: ${Math.round(strength)}% (المطلوب 100%)`);
      return;
    }

    if (form.newPass !== form.confirm) {
      setError('كلمتا المرور الجديدتان غير متطابقتين.');
      return;
    }

    const authUser = auth.currentUser;
    if (!authUser) {
      setError('لم يتم العثور على جلسة تسجيل الدخول.');
      return;
    }

    const hasPass =
      Array.isArray(authUser.providerData) &&
      authUser.providerData.some((p) => p?.providerId === 'password');

    if (!hasPass || !authUser.email) {
      setError('هذا الحساب لا يستخدم تسجيل الدخول بكلمة مرور.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const credential = EmailAuthProvider.credential(authUser.email, form.current);
      await reauthenticateWithCredential(authUser, credential);
      await updatePassword(authUser, form.newPass);
      setSuccess('تم تحديث كلمة المرور بنجاح.');
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
    <Modal title="تغيير كلمة المرور" onClose={onClose}>
      <form onSubmit={handleSubmit} className="modal-form">
        <div className="modal-field">
          <label>كلمة المرور الحالية</label>
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
          <label>كلمة المرور الجديدة</label>
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
            ✓ 6 أحرف على الأقل ✓ حرف كبير ✓ حرف صغير ✓ رقم ✓ رمز خاص
          </small>
        </div>

        <div className="modal-field">
          <label>كلمة المرور الجديدة (تأكيد)</label>
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
            إلغاء
          </button>
          <button
            type="submit"
            className="settings-primary-button"
            disabled={loading || strength !== 100 || form.newPass !== form.confirm}
          >
            {loading ? 'جاري الحفظ...' : 'حفظ'}
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
    setSuccess('تم تعطيل حسابك. يمكنك إعادة تفعيله خلال 60 يوماً.');
    setTimeout(() => {
      onDeleted();
    }, 1400);
  };

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();

    if (!password.trim()) {
      setError('يرجى إدخال كلمة المرور.');
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
      setError('حدث خطأ أثناء تعطيل الحساب. يرجى المحاولة لاحقاً.');
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
      setError('حدث خطأ أثناء التحقق بواسطة Google. يرجى المحاولة لاحقاً.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal title="تعطيل الحساب" onClose={onClose}>
      <form
        onSubmit={hasPasswordProvider ? handlePasswordSubmit : (e) => e.preventDefault()}
        className="modal-form"
      >
        <p className="modal-info-text">
          لن يتم حذف حسابك نهائياً على الفور. سيتم تعطيل حسابك ويمكنك إعادة تفعيله خلال 60 يوماً.
          بعد انتهاء هذه المدة سيتم حذف الحساب نهائياً.
        </p>

        {hasPasswordProvider ? (
          <div className="modal-field">
            <label>أدخل كلمة المرور</label>
            <div className="modal-input-wrapper">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="أدخل كلمة المرور الحالية"
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
              التحقق بواسطة Google مطلوب
            </div>
            <p className="delete-auth-subtitle">
              هذا الحساب يسجل الدخول عبر Google. للمتابعة، يرجى إعادة التحقق باستخدام حساب Google الخاص بك.
            </p>
          </div>
        ) : (
          <div className="modal-error">
            لم يتم العثور على طريقة تحقق مناسبة لهذا الحساب. يرجى التواصل مع فريق الدعم.
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
            إلغاء
          </button>

          {hasPasswordProvider ? (
            <button type="submit" className="settings-danger-button" disabled={loading}>
              {loading ? 'جاري المعالجة...' : 'تعطيل حسابي'}
            </button>
          ) : hasGoogleProvider ? (
            <button
              type="button"
              className="settings-primary-button delete-google-button"
              onClick={handleGoogleDeactivate}
              disabled={loading}
            >
              <i className="fab fa-google"></i>
              {loading ? 'جاري التحقق من Google...' : 'التحقق بواسطة Google وتعطيل الحساب'}
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

  // Syria Arabic launch: appointment history widgets disabled.
  // const [orders, setOrders] = useState([]);
  // const [completedOrderCount, setCompletedOrderCount] = useState(0);
  // const [experts, setExperts] = useState([]);

  const [showDeleteAddressConfirm, setShowDeleteAddressConfirm] = useState(false);
  const [addressToDelete, setAddressToDelete] = useState(null);

  const formatTrDate = (dateStr) => {
    const s = String(dateStr || '').trim();
    if (!s) return '';
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return sanitizeText(s);
    return d.toLocaleDateString('ar-SY', { day: '2-digit', month: 'long', year: 'numeric' });
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
    showAppToast('تم تعطيل صفحة المواعيد في هذه النسخة. يمكنك التواصل مع الخبير مباشرة عبر الرسائل.', 'info');
  };

  const confirmDeleteAddress = async () => {
    const addressId = addressToDelete;
    if (!addressId) return;

    try {
      const addressDocRef = doc(db, 'users', user.uid, 'addresses', String(addressId));
      await deleteDoc(addressDocRef);
      showAppToast('تم حذف العنوان بنجاح.', 'success');
    } catch (error) {
      if (isDevelopment) console.error('Silme hatası:', error.message);
      showAppToast('حدث خطأ أثناء حذف العنوان.', 'error');
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
              'مستخدم'
          );
          setProfilePhoneNumber(data?.phoneNumber || currentUser.phoneNumber || '');
        }
      } catch {
        if (!cancelled) {
          setProfileDisplayName(currentUser.email?.split('@')[0] || 'مستخدم');
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

  /* Syria Arabic launch: appointment history listener disabled.
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
              ignore
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
  */

  const handleLinkGoogle = async () => {
    setGoogleLinkError('');
    setGoogleLinkMessage('');
    setGoogleLinkLoading(true);

    try {
      const result = await linkGoogleToCurrentUser();
      setGoogleLinked(true);
      setGoogleLinkMessage(result?.message || 'تم ربط حساب Google بنجاح.');
    } catch (err) {
      if (
        err?.code === 'GOOGLE_ACCOUNT_EMAIL_MISMATCH' ||
        err?.code === 'GOOGLE_EMAIL_NOT_RESOLVED'
      ) {
        setGoogleLinkError(
          err?.message ||
            'حساب Google المحدد لا يطابق البريد الإلكتروني الحالي.'
        );
        return;
      }

      if (err?.code === 'GOOGLE_CREDENTIAL_ALREADY_IN_USE') {
        setGoogleLinkError(
          err?.message || 'حساب Google هذا مرتبط بمستخدم آخر.'
        );
        return;
      }

      if (err?.code === 'GOOGLE_ALREADY_LINKED') {
        setGoogleLinked(true);
        setGoogleLinkMessage('حساب Google مرتبط بالفعل.');
        return;
      }

      if (err?.code === 'GOOGLE_POPUP_CLOSED') {
        return;
      }

      if (err?.code === 'GOOGLE_POPUP_BLOCKED') {
        setGoogleLinkError(
          err?.message ||
            'تم حظر نافذة Google. يرجى السماح بالنوافذ المنبثقة.'
        );
        return;
      }

      setGoogleLinkError(err?.message || 'تعذر ربط حساب Google.');
    } finally {
      setGoogleLinkLoading(false);
    }
  };

  const handleProfilePhotoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      showAppToast('يمكنك رفع صور بصيغة JPEG أو PNG أو WEBP فقط.', 'error');
      e.target.value = '';
      return;
    }

    const maxSize = 2 * 1024 * 1024;
    if (file.size > maxSize) {
      showAppToast('يجب أن يكون حجم الملف أقل من 2MB.', 'error');
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
      showAppToast('حدث خطأ أثناء رفع الصورة. يرجى المحاولة لاحقاً.', 'error');
    } finally {
      setPhotoUploading(false);
      e.target.value = '';
    }
  };

  const handleSaveAddress = async (addressData) => {
  /*
   * واجهة العنوان العربية:
   *
   * governorate   = المحافظة
   * area          = المنطقة
   * additionalInfo = معلومات إضافية اختيارية
   *
   * مع إبقاء حقول Firestore القديمة للتوافق مع باقي المشروع:
   *
   * city         <- governorate
   * district     <- area
   * neighborhood <- area
   * street       <- additionalInfo
   */

  const governorate = sanitizeText(
    addressData.governorate ||
      addressData.city ||
      ""
  )
    .trim()
    .slice(0, 100);

  const area = sanitizeText(
    addressData.area ||
      addressData.district ||
      addressData.neighborhood ||
      ""
  )
    .trim()
    .slice(0, 100);

  const additionalInfo = sanitizeText(
    addressData.additionalInfo ||
      addressData.street ||
      ""
  )
    .trim()
    .slice(0, 300);

  // المحافظة مطلوبة
  if (!governorate) {
    showAppToast(
      "يرجى اختيار المحافظة.",
      "error"
    );
    return;
  }

  // المنطقة مطلوبة
  if (!area) {
    showAppToast(
      "يرجى إدخال المنطقة.",
      "error"
    );
    return;
  }

  if (!user?.uid) {
    showAppToast(
      "تعذر تحديد المستخدم. يرجى تسجيل الدخول مجدداً.",
      "error"
    );
    return;
  }

  try {
    const finalAddressData = {
      /*
       * الحقول الجديدة الخاصة بالواجهة العربية.
       */
      governorate,
      area,
      additionalInfo,

      /*
       * الحقول القديمة تبقى موجودة للتوافق مع بقية المشروع.
       */
      addressName: sanitizeText(
        addressData.addressName ||
          "عنوان العمل"
      )
        .trim()
        .slice(0, 200),

      city: governorate,
      district: area,
      neighborhood: area,
      street: additionalInfo,

      /*
       * الحقول القديمة المخفية من الواجهة.
       * ليست إجبارية، لكنها لا تُحذف من بنية البيانات.
       */
      siteName: sanitizeText(
        addressData.siteName || ""
      )
        .trim()
        .slice(0, 200),

      apartmentName: sanitizeText(
        addressData.apartmentName || ""
      )
        .trim()
        .slice(0, 200),

      blockName: sanitizeText(
        addressData.blockName || ""
      )
        .trim()
        .slice(0, 100),

      buildingNo: sanitizeText(
        addressData.buildingNo || ""
      )
        .trim()
        .slice(0, 50),

      floor: sanitizeText(
        addressData.floor || ""
      )
        .trim()
        .slice(0, 50),

      doorNo: sanitizeText(
        addressData.doorNo || ""
      )
        .trim()
        .slice(0, 50),

      lat: addressData.lat ?? null,
      lng: addressData.lng ?? null,

      coordSource:
        addressData.coordSource ||
        "Manual",

      updatedAt: serverTimestamp(),
    };

    if (editingAddressId) {
      const addressDocRef = doc(
        db,
        "users",
        user.uid,
        "addresses",
        editingAddressId
      );

      await updateDoc(
        addressDocRef,
        finalAddressData
      );

      showAppToast(
        "تم تحديث العنوان بنجاح.",
        "success"
      );
    } else {
      const addressesRef = collection(
        db,
        "users",
        user.uid,
        "addresses"
      );

      await addDoc(addressesRef, {
        ...finalAddressData,
        createdAt: serverTimestamp(),
      });

      showAppToast(
        "تم حفظ العنوان بنجاح.",
        "success"
      );
    }

    setShowAddAddressModal(false);
    setEditingAddressId(null);
  } catch (error) {
    if (isDevelopment) {
      console.error(
        "Address save error:",
        error
      );
    }

    showAppToast(
      "حدث خطأ أثناء حفظ العنوان. يرجى المحاولة مرة أخرى.",
      "error"
    );
  }
};

  const handleEditClick = (address) => {
    setEditingAddressId(address.id);
    setShowAddAddressModal(true);
  };

  const getUserDisplayName = () =>
    sanitizeText(profileDisplayName || user?.email?.split('@')[0] || 'مستخدم');

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
    return 'لم يتم إضافة عنوان';
  }, [addresses]);

  if (loading) {
    return (
      <div className="profile-page">
        <Navbar />
        <LoadingSpinner text="جاري تحميل الملف الشخصي..." />
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
            setPasswordToast('تم تحديث كلمة المرور.');
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
                  <i className="fas fa-envelope"></i> {sanitizeText(user.email || 'لا يوجد بريد إلكتروني')}
                </span>
                <span>
                  <i className="fas fa-phone"></i> {sanitizeText(profilePhoneNumber || 'لا يوجد رقم هاتف')}
                </span>
              </div>
            </div>
          </div>

          {/* Syria Arabic launch: appointment-based completed order counter disabled.
          <div className="profile-header-right">
            <div className="header-stat-item">
              <span className="header-stat-value">{completedOrderCount}</span>
              <span className="header-stat-label">الطلبات المكتملة</span>
            </div>
          </div>
          */}
        </div>

        <div className="expert-tabs">
          {[
            { key: 'user', icon: 'fa-user-circle', label: 'معلومات المستخدم' },
            { key: 'addresses', icon: 'fa-map-marker-alt', label: 'عناويني المسجلة' },
            { key: 'security', icon: 'fa-shield-alt', label: 'الأمان' },
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
              <h4 className="settings-section-title">المعلومات الشخصية</h4>
              <div className="settings-detail-grid">
                <div className="settings-field-group">
                  <span className="settings-field-label">الاسم الكامل</span>
                  <span className="settings-field-value">{getUserDisplayName()}</span>
                </div>
                <div className="settings-field-group">
                  <div className="settings-field-label-row">
                    <span className="settings-field-label">البريد الإلكتروني</span>

                    {emailVerified ? (
                      <span className="settings-email-status-inline verified" title="تم توثيق البريد الإلكتروني">
                        <span className="settings-email-status-dot verified"></span>
                        <span className="settings-email-status-text verified">موثق</span>
                      </span>
                    ) : (
                      <span className="settings-email-status-inline unverified" title="لم يتم توثيق البريد الإلكتروني">
                        <span className="settings-email-status-dot unverified"></span>
                        <span className="settings-email-status-text unverified">غير موثق</span>
                      </span>
                    )}
                  </div>

                  <span className="settings-field-value">{sanitizeText(user.email || 'غير محدد')}</span>
                </div>
                <div className="settings-field-group">
                  <span className="settings-field-label">الهاتف</span>
                  <span className="settings-field-value">{sanitizeText(profilePhoneNumber || 'غير محدد')}</span>
                </div>
                <div className="settings-field-group">
                  <span className="settings-field-label">الموقع</span>
                  <span className="settings-field-value">{locationLabel}</span>
                </div>
              </div>
            </div>
          )}

          {activeSetting === 'addresses' && (
            <div className="settings-combined-container saved-addresses-section">
              <div className="saved-addresses-section__head">
                <div>
                  <h4 className="settings-section-title saved-addresses-section__title">العناوين المسجلة</h4>
                  <p className="settings-helper-text saved-addresses-section__hint">
                    يمكنك تسجيل عنوانين كحد أقصى.
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
                    <i className="fas fa-plus" aria-hidden="true"></i> إضافة عنوان جديد
                  </button>
                )}
              </div>

              {addresses.length === 0 ? (
                <div className="saved-addresses-empty">
                  <i className="fas fa-map-marker-alt" aria-hidden="true"></i>
                  <p>ليس لديك أي عناوين مسجلة بعد.</p>
                  <button
                    type="button"
                    className="settings-primary-button"
                    onClick={() => {
                      setEditingAddressId(null);
                      setShowAddAddressModal(true);
                    }}
                  >
                    <i className="fas fa-plus" aria-hidden="true"></i> أضف عنوانك الأول
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
                              {sanitizeText(address.addressName || 'عنوان')}
                            </h5>
                          </div>
                          <div className="saved-address-card__actions">
                            <button
                              type="button"
                              className="settings-secondary-button saved-address-update-btn"
                              onClick={() => handleEditClick(address)}
                              title="تعديل العنوان"
                            >
                              <i className="fas fa-pen" aria-hidden="true"></i>
                              <span className="saved-address-btn-text">تعديل</span>
                            </button>
                            <button
                              type="button"
                              className="settings-danger-button saved-address-delete-btn"
                              onClick={() => handleDeleteAddress(address.id)}
                              title="حذف العنوان"
                            >
                              <i className="fas fa-trash" aria-hidden="true"></i>
                              <span className="saved-address-btn-text">حذف</span>
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
                            <span>دقة الموقع منخفضة — يرجى تعديل عنوانك بالنقر على <strong>تعديل</strong>.</span>
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
                يمكنك استخدام الإعدادات أدناه لزيادة أمان حسابك.
              </p>

              <div className="settings-security-list">
                <div className="settings-security-item">
                  <div>
                    <div className="settings-security-title">تعديل الاسم الكامل</div>
                    <div className="settings-security-subtitle">تعديل اسمك المعروض على الملف الشخصي.</div>
                  </div>
                  <button className="settings-primary-button" onClick={() => setActiveModal('name')}>
                    تعديل
                  </button>
                </div>

                <div className="settings-security-item">
                  <div>
                    <div className="settings-security-title">تعديل رقم الهاتف</div>
                    <div className="settings-security-subtitle">
                      ربط رقمك الجديد بحسابك عبر التحقق من رمز SMS.
                    </div>
                  </div>
                  <button className="settings-secondary-button" onClick={() => setActiveModal('phone')}>
                    تعديل الهاتف
                  </button>
                </div>

                <div className="settings-security-item">
                  <div>
                    <div className="settings-security-title">حساب Google</div>
                    <div className="settings-security-subtitle">
                      ربط حساب Google بحسابك الحالي لتسجيل الدخول بشكل أسرع.
                    </div>
                  </div>

                  {googleLinked ? (
                    <span className="settings-status-badge">
                      <i className="fab fa-google"></i> Google متصل
                    </span>
                  ) : canLinkGoogle ? (
                    <button
                      className="settings-primary-button"
                      onClick={handleLinkGoogle}
                      disabled={googleLinkLoading}
                    >
                      {googleLinkLoading ? 'جاري الربط...' : 'ربط حساب Google'}
                    </button>
                  ) : (
                    <span className="settings-disabled-badge">
                      متاح لمستخدمي Gmail فقط
                    </span>
                  )}
                </div>

                <div className="settings-security-item">
                  <div>
                    <div className="settings-security-title">تغيير كلمة المرور</div>
                    <div className="settings-security-subtitle">
                      {hasPasswordProvider
                        ? 'حدث كلمة مرور حسابك بشكل دوري.'
                        : 'يسجل هذا الحساب الدخول عبر Google وليس لديه كلمة مرور مفعلة.'}
                    </div>
                  </div>

                  <span
                    title={
                      hasPasswordProvider
                        ? ''
                        : 'هذا الحساب مرتبط بجوجل ولا يمتلك كلمة مرور.'
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
                      تغيير كلمة المرور
                    </button>
                  </span>
                </div>

                <div className="settings-security-item security-danger-row">
                  <div>
                    <div className="security-danger-title">تعطيل حسابي</div>
                    <div className="settings-security-subtitle">
                      سيتم تعطيل حسابك ويمكنك استعادته خلال 60 يوماً. بعد 60 يوماً سيتم حذفه نهائياً.
                    </div>
                  </div>
                  <button className="settings-danger-button" onClick={() => setActiveModal('deleteAccount')}>
                    تعطيل حسابي
                  </button>
                </div>
              </div>
            </div>
          )}
        </section>

        {/* Syria Arabic launch: appointment history sections disabled.
        <section className="profile-card-section">
          <div className="section-header">
            <h3><i className="fas fa-box"></i> طلباتي الأخيرة</h3>
            <button className="view-all" onClick={() => openCompletedAppointments()}>
              الكل <i className="fas fa-arrow-right"></i>
            </button>
          </div>

          <div className="orders-list">
            {orders.length === 0 ? (
              <div className="ma-empty" style={{ padding: '18px', textAlign: 'center' }}>
                <i className="fas fa-box-open ma-empty-icon"></i>
                <h3 className="ma-empty-title">لا توجد معاملات مكتملة بعد</h3>
                <p className="ma-empty-text">ستظهر المواعيد المكتملة هنا.</p>
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
                      <i className="fas fa-flag-checkered"></i> مكتمل
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
            <h3><i className="fas fa-users"></i> الخبراء الذين تم التعامل معهم مؤخراً</h3>
            <button className="view-all" onClick={() => openCompletedAppointments()}>
              الكل <i className="fas fa-arrow-right"></i>
            </button>
          </div>

          <div className="recent-experts-horizontal">
            {experts.length === 0 ? (
              <div className="ma-empty" style={{ padding: '18px', textAlign: 'center' }}>
                <i className="fas fa-user-clock ma-empty-icon"></i>
                <h3 className="ma-empty-title">لا يوجد سجل خبراء بعد</h3>
                <p className="ma-empty-text">سيتم عرض الخبراء الذين أتممت معهم مواعيد هنا.</p>
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
                  <p className="expert-profession">{sanitizeText(expert.profession || 'خبير')}</p>
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
                  عرض
                </button>
              </div>
            ))}
          </div>
        </section>
        */}

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
        title="حذف العنوان"
        message="هل أنت متأكد من رغبتك في حذف هذا العنوان؟ لا يمكن التراجع عن هذا الإجراء."
        confirmText="نعم، حذف"
        cancelText="إلغاء"
        type="danger"
      />
    </div>
  );
};

export default ProfilePage;
