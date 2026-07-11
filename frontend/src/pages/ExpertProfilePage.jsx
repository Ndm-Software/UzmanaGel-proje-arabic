import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { onAuthStateChanged, updateProfile } from 'firebase/auth';
import { doc, getDoc, collection, getDocs, addDoc, deleteDoc, updateDoc, onSnapshot, query, where, writeBatch } from 'firebase/firestore';
import { auth, db, storage } from '../firebase/firebaseClient';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { deleteProviderAccount } from '../services/accountService';
import {
  getCurrentUserProviderFlags,
  initRecaptcha,
  clearRecaptcha,
  startPhoneLinking,
  confirmPhoneLinking,
  linkGoogleToCurrentUser,
  uploadPortfolioPhoto,
  getPortfolioPhotos,
  deletePortfolioPhoto,
} from '../firebase/authService';
import {
  updateUserPassword,
  updateWorkingHours,
  uploadProfilePhoto,
  getProfilePhoto,
  updateMyDisplayName,
} from '../services/updateService';
import Navbar from '../components/Navbar';
import AddressModal from '../components/AddressModal';
import LoadingSpinner from '../components/LoadingSpinner';
import DOMPurify from 'dompurify';
import { showAppToast } from '../utils/showAppToast';
import ConfirmModal from '../components/ConfirmModal';
import '../styles/ExpertProfilePage.css';
import { computeRatingSummary, fetchExpertReviewStats, fetchExpertReviews } from '../services/reviewsApi';

const isDevelopment = import.meta.env.DEV;

const sanitizeText = (text) => {
  if (!text) return '';
  return DOMPurify.sanitize(String(text));
};

const normalizeSpecialties = (raw) => {
  const arr = Array.isArray(raw) ? raw : [];
  return arr
    .map((s) => {
      if (typeof s === "string") {
        const name = String(s || "").trim();
        return name ? { name, startingPrice: 0 } : null;
      }
      const name = String(s?.name || "").trim();
      const startingPrice = Number(s?.startingPrice) || 0;
      return name ? { name, startingPrice } : null;
    })
    .filter(Boolean);
};

const Lightbox = ({ images, startIndex, onClose }) => {
  const [current, setCurrent] = useState(startIndex);
  const prev = useCallback(() => setCurrent(i => (i - 1 + images.length) % images.length), [images.length]);
  const next = useCallback(() => setCurrent(i => (i + 1) % images.length), [images.length]);

  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') prev();
      if (e.key === 'ArrowRight') next();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose, prev, next]);

  return (
    <div className="lightbox-overlay" onClick={onClose}>
      <button className="lightbox-close" onClick={onClose}><i className="fas fa-times"></i></button>
      {images.length > 1 && (
        <button className="lightbox-prev" onClick={e => { e.stopPropagation(); prev(); }}>
          <i className="fas fa-chevron-left"></i>
        </button>
      )}
      <img className="lightbox-image" src={images[current]} alt={`Görsel ${current + 1}`} onClick={e => e.stopPropagation()} />
      {images.length > 1 && (
        <button className="lightbox-next" onClick={e => { e.stopPropagation(); next(); }}>
          <i className="fas fa-chevron-right"></i>
        </button>
      )}
      {images.length > 1 && <span className="lightbox-counter">{current + 1} / {images.length}</span>}
    </div>
  );
};

const isPdf = (url) => {
  try { return new URL(url).pathname.toLowerCase().endsWith('.pdf'); }
  catch { return url.toLowerCase().includes('.pdf'); }
};
const imageUrlsOnly = (urls) => urls.filter(u => !isPdf(u));
const getTurkishDayName = (day) => ({
  monday: 'الاثنين', tuesday: 'الثلاثاء', wednesday: 'الأربعاء',
  thursday: 'الخميس', friday: 'الجمعة', saturday: 'السبت', sunday: 'الأحد'
})[day] || day;

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

function storageRefFromDownloadUrl(storageInstance, urlOrPath) {
  const raw = String(urlOrPath || '').trim();
  if (!raw) return null;
  if (!raw.startsWith('http')) return ref(storageInstance, raw);

  try {
    const u = new URL(raw);
    const m = u.pathname.match(/\/o\/([^/]+)$/);
    const encoded = m?.[1];
    if (!encoded) return null;
    const objectPath = decodeURIComponent(encoded);
    return ref(storageInstance, objectPath);
  } catch {
    return null;
  }
}

const hasSpecialChar = (str) =>
  /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(str);

const hasConsecutiveChars = (str) => {
  for (let i = 0; i < str.length - 2; i++) {
    const c1 = str.charCodeAt(i);
    const c2 = str.charCodeAt(i + 1);
    const c3 = str.charCodeAt(i + 2);
    const isNum = (c) => c >= 48 && c <= 57;
    const isLower = (c) => c >= 97 && c <= 122;
    const isUpper = (c) => c >= 65 && c <= 90;
    if (isNum(c1) && isNum(c2) && isNum(c3) &&
      ((c2 === c1 + 1 && c3 === c2 + 1) || (c2 === c1 - 1 && c3 === c2 - 1))) return true;
    if (isLower(c1) && isLower(c2) && isLower(c3) && c2 === c1 + 1 && c3 === c2 + 1) return true;
    if (isUpper(c1) && isUpper(c2) && isUpper(c3) && c2 === c1 + 1 && c3 === c2 + 1) return true;
  }
  return false;
};

const toMillis = (value) => {
  if (!value) return 0;
  if (typeof value === 'number') return value;
  if (typeof value?.toMillis === 'function') return value.toMillis();
  if (value instanceof Date) return value.getTime();
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatAppointmentDate = (dateStr) => {
  if (!dateStr) return 'غير محدد';
  const parsed = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return sanitizeText(dateStr);
  return parsed.toLocaleDateString('ar-SY', {
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  });
};

const getAppointmentEndTime = (item) => {
  const datePart = String(item?.date || '').trim();
  if (!datePart) return 0;
  const timePart = String(item?.end || item?.start || '23:59').trim() || '23:59';
  const parsed = new Date(`${datePart}T${timePart}:00`).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
};

const getExpertHistoryMeta = (item) => {
  const normalizedStatus = String(item?.status || '').trim().toLowerCase();
  const endTime = getAppointmentEndTime(item);
  const now = Date.now();

  if (normalizedStatus === 'completed') {
    return { key: 'completed', label: 'مكتمل', icon: 'fa-flag-checkered', badgeClass: 'order-badge--done' };
  }

  if (normalizedStatus === 'expired' || (normalizedStatus === 'approved' && endTime && endTime < now)) {
    return { key: 'expired', label: 'انتهى وقته', icon: 'fa-history', badgeClass: '' };
  }

  if (normalizedStatus === 'cancelled_by_expert') {
    return { key: 'cancelled_by_expert', label: 'إلغاء الخبير', icon: 'fa-ban', badgeClass: '' };
  }

  if (normalizedStatus === 'cancelled_by_customer') {
    return { key: 'cancelled_by_customer', label: 'إلغاء العميل', icon: 'fa-user-slash', badgeClass: '' };
  }

  if (normalizedStatus === 'rejected') {
    return { key: 'rejected', label: 'مرفوض', icon: 'fa-circle-xmark', badgeClass: '' };
  }

  return null;
};

const hasRepeatedChars = (str) => {
  for (let i = 0; i < str.length - 2; i++) {
    if (str[i] === str[i + 1] && str[i + 1] === str[i + 2]) return true;
  }
  return false;
};

const validatePassword = (pass) => {
  const errors = [];
  if (pass.length < 6) errors.push('يجب أن تكون 6 أحرف على الأقل');
  if (!/[A-Z]/.test(pass)) errors.push('يجب أن تحتوي على حرف كبير واحد على الأقل');
  if (!/[a-z]/.test(pass)) errors.push('يجب أن تحتوي على حرف صغير واحد على الأقل');
  if (!/[0-9]/.test(pass)) errors.push('يجب أن تحتوي على رقم واحد على الأقل');
  if (!hasSpecialChar(pass)) errors.push('يجب أن تحتوي على رمز خاص واحد على الأقل');
  if (hasConsecutiveChars(pass)) errors.push('يجب ألا تحتوي على أحرف متتالية (مثل: abc، 123)');
  if (hasRepeatedChars(pass)) errors.push('يجب ألا تكرر نفس الحرف 3 مرات متتالية (مثل: aaa)');
  return errors;
};

const calcPasswordStrength = (pass) => {
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
};

const getStrengthColor = (strength) => {
  if (strength === 0) return '#4b5563';
  if (strength <= 25) return '#ef4444';
  if (strength <= 50) return '#f97316';
  if (strength <= 75) return '#eab308';
  return '#22c55e';
};

const getStrengthText = (strength) => {
  if (strength === 0) return 'قوة كلمة المرور: ضعيفة';
  if (strength <= 25) return 'قوة كلمة المرور: ضعيفة جداً';
  if (strength <= 50) return 'قوة كلمة المرور: متوسطة';
  if (strength <= 75) return 'قوة كلمة المرور: جيدة';
  if (strength < 100) return 'قوة كلمة المرور: جيدة جداً';
  return 'قوة كلمة المرور: ممتازة ✓';
};

const PhotoThumb = ({ url, index, allUrls, onDelete, size = 120, height = 120 }) => {
  const [lightbox, setLightbox] = useState(false);
  const pdf = isPdf(url);
  const imageUrls = imageUrlsOnly(allUrls);
  const imageIndex = imageUrls.indexOf(url);

  return (
    <>
      <div className="photo-thumb" style={{ width: `${size}px`, height: `${height}px` }}>
        {pdf ? (
          <div className="photo-thumb__pdf" onClick={() => window.open(url, '_blank', 'noopener,noreferrer')}>
            <i className="fas fa-file-pdf photo-thumb__pdf-icon"></i>
            <span className="photo-thumb__pdf-label">مستند PDF</span>
            <span className="photo-thumb__pdf-open"><i className="fas fa-external-link-alt"></i> فتح</span>
          </div>
        ) : (
          <>
            <img className="photo-thumb__img" src={url} alt={`Görsel ${index + 1}`} onClick={() => setLightbox(true)} />
            <div className="photo-thumb__overlay" onClick={() => setLightbox(true)}>
              <i className="fas fa-search-plus photo-thumb__zoom-icon"></i>
            </div>
          </>
        )}
        {onDelete && (
          <button className="photo-thumb__delete" onClick={e => { e.stopPropagation(); onDelete(url); }}>
            <i className="fas fa-times"></i>
          </button>
        )}
      </div>
      {lightbox && !pdf && imageIndex !== -1 && (
        <Lightbox images={imageUrls} startIndex={imageIndex} onClose={() => setLightbox(false)} />
      )}
    </>
  );
};

const Modal = ({ title, onClose, children }) => (
  <div className="modal-overlay" onClick={onClose}>
    <div className="modal-box" onClick={e => e.stopPropagation()}>
      <div className="modal-header">
        <h3>{sanitizeText(title)}</h3>
        <button className="modal-close-btn" onClick={onClose}><i className="fas fa-times"></i></button>
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
      .split(' ')
      .filter(Boolean);

    if (parts.length === 0) return { firstName: '', lastName: '' };
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
    setSuccess('');

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

      setSuccess('تم تحديث الاسم والكنية.');
      onSuccess(displayName);
      setTimeout(onClose, 1200);
    } catch (err) {
      if (isDevelopment) console.error('Ad soyad güncellenemedi:', err?.message || err);
      setError('حدث خطأ أثناء تحديث الاسم والكنية. يرجى المحاولة مرة أخرى لاحقاً.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal title="تحديث الاسم والكنية" onClose={onClose}>
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
          <button type="button" className="settings-secondary-button" onClick={onClose} disabled={loading}>
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

const PriceRangeModal = ({ uid, currentMin, currentMax, onClose, onSuccess }) => {
  const [minPrice, setMinPrice] = useState(String(currentMin ?? ""));
  const [maxPrice, setMaxPrice] = useState(String(currentMax ?? ""));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const normalize = (value) => {
    const num = Number(String(value ?? "").replace(",", "."));
    if (!Number.isFinite(num)) return 0;
    return Math.max(0, Math.round(num));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    const nextMin = normalize(minPrice);
    const nextMax = normalize(maxPrice);

    if (nextMax > 0 && nextMin > nextMax) {
      setError("الحد الأدنى للسعر لا يمكن أن يتجاوز الحد الأقصى.");
      return;
    }

    setLoading(true);
    try {
      await updateDoc(doc(db, "service_providers", uid), {
        minPrice: nextMin,
        maxPrice: nextMax,
        updatedAt: new Date().toISOString(),
      });
      setSuccess("تم تحديث نطاق السعر.");
      onSuccess?.({ minPrice: nextMin, maxPrice: nextMax });
      setTimeout(() => onClose?.(), 900);
    } catch (err) {
      if (isDevelopment) console.error("Fiyat aralığı güncellenemedi:", err?.message || err);
      setError("حدث خطأ أثناء تحديث نطاق السعر. يرجى المحاولة مرة أخرى.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal title="نطاق السعر" onClose={onClose}>
      <form onSubmit={handleSubmit} className="modal-form">
        <div className="modal-field">
          <label>الحد الأدنى للسعر (ل.س)</label>
          <input
            type="number"
            min="0"
            step="1"
            inputMode="numeric"
            value={minPrice}
            onChange={(e) => setMinPrice(e.target.value)}
            disabled={loading}
            placeholder="مثال: 150"
          />
        </div>

        <div className="modal-field">
          <label>الحد الأقصى للسعر (ل.س)</label>
          <input
            type="number"
            min="0"
            step="1"
            inputMode="numeric"
            value={maxPrice}
            onChange={(e) => setMaxPrice(e.target.value)}
            disabled={loading}
            placeholder="مثال: 1200"
          />
        </div>

        <p className="modal-info-text" style={{ color: "var(--text-muted)", marginTop: 6 }}>
          يتم استخدام هذا النطاق كمرجع لقواعد الأسعار للإعلانات والتخصصات.
        </p>

        {error && <p className="modal-error">{sanitizeText(error)}</p>}
        {success && <p className="modal-success">{sanitizeText(success)}</p>}

        <div className="modal-actions">
          <button type="button" className="settings-secondary-button" onClick={onClose} disabled={loading}>
            إلغاء
          </button>
          <button type="submit" className="settings-primary-button" disabled={loading}>
            {loading ? "جاري الحفظ..." : "حفظ"}
          </button>
        </div>
      </form>
    </Modal>
  );
};

const ChangePasswordModal = ({ onClose, onSuccess }) => {
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [showPasswords, setShowPasswords] = useState({ current: false, new: false, confirm: false });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [passwordStrength, setPasswordStrength] = useState(0);
  const [passwordErrors, setPasswordErrors] = useState([]);

  const handleNewPasswordChange = (e) => {
    const pass = e.target.value;
    setForm(p => ({ ...p, newPassword: pass }));
    setPasswordStrength(calcPasswordStrength(pass));
    setPasswordErrors(validatePassword(pass));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (passwordErrors.length > 0) { setError('لم يتم استيفاء متطلبات كلمة المرور.'); return; }
    if (passwordStrength !== 100) { setError(`كلمة المرور ليست قوية بما فيه الكفاية. القوة: ${Math.round(passwordStrength)}% (مطلوب 100%)`); return; }
    if (form.newPassword !== form.confirmPassword) { setError('كلمات المرور الجديدة لا تتطابق.'); return; }
    setLoading(true); setError('');
    try {
      await updateUserPassword({ currentPassword: form.currentPassword, newPassword: form.newPassword });
      setSuccess('تم تحديث كلمة المرور بنجاح.');
      setTimeout(() => {
        onSuccess?.();
        onClose?.();
      }, 1500);
    } catch (err) {
      if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        setError('كلمة المرور الحالية غير صحيحة.');
      } else {
        setError('حدث خطأ. يرجى المحاولة مرة أخرى لاحقاً.');
      }
    } finally { setLoading(false); }
  };

  const color = getStrengthColor(passwordStrength);

  return (
    <Modal title="تغيير كلمة المرور" onClose={onClose}>
      <form onSubmit={handleSubmit} className="modal-form">
        <div className="modal-field">
          <label>كلمة المرور الحالية</label>
          <div className="modal-input-wrapper">
            <input type={showPasswords.current ? 'text' : 'password'} value={form.currentPassword}
              onChange={e => setForm(p => ({ ...p, currentPassword: e.target.value }))} required />
            <button type="button" className="modal-eye-btn"
              onClick={() => setShowPasswords(p => ({ ...p, current: !p.current }))}>
              <i className={`fas fa-eye${showPasswords.current ? '-slash' : ''}`}></i>
            </button>
          </div>
        </div>

        <div className="modal-field">
          <label>كلمة المرور الجديدة</label>
          <div className="modal-input-wrapper">
            <input type={showPasswords.new ? 'text' : 'password'} value={form.newPassword}
              onChange={handleNewPasswordChange} required />
            <button type="button" className="modal-eye-btn"
              onClick={() => setShowPasswords(p => ({ ...p, new: !p.new }))}>
              <i className={`fas fa-eye${showPasswords.new ? '-slash' : ''}`}></i>
            </button>
          </div>

          {form.newPassword.length > 0 && (
            <>
              <div style={{ marginTop: '8px', height: '4px', background: 'var(--card-border, #333)', borderRadius: '2px', overflow: 'hidden' }}>
                <div style={{ height: '100%', transition: 'all 0.3s ease', width: `${passwordStrength}%`, backgroundColor: color }} />
              </div>
              <small style={{ color, display: 'block', marginTop: '4px', fontWeight: 600 }}>
                {getStrengthText(passwordStrength)}
              </small>
            </>
          )}

          {form.newPassword.length > 0 && passwordErrors.length > 0 && (
            <div style={{ marginTop: '8px' }}>
              {passwordErrors.map((err, i) => (
                <small key={i} style={{ color: '#ef4444', display: 'block', marginTop: '2px' }}>
                  <i className="fas fa-times-circle"></i> {sanitizeText(err)}
                </small>
              ))}
            </div>
          )}

          {form.newPassword.length > 0 && passwordErrors.length === 0 && passwordStrength === 100 && (
            <small style={{ color: '#22c55e', display: 'block', marginTop: '4px', fontWeight: 600 }}>
              <i className="fas fa-check-circle"></i> كلمة المرور تستوفي جميع الشروط ✓
            </small>
          )}

          <small style={{ color: 'var(--text-muted)', fontSize: '0.78rem', marginTop: '6px', display: 'block' }}>
            ✓ 6 أحرف كحد أدنى &nbsp;✓ حرف كبير &nbsp;✓ حرف صغير &nbsp;✓ رقم &nbsp;✓ رمز خاص &nbsp;✓ لا توجد أحرف متتالية
          </small>
        </div>

        <div className="modal-field">
          <label>تأكيد كلمة المرور الجديدة</label>
          <div className="modal-input-wrapper">
            <input type={showPasswords.confirm ? 'text' : 'password'} value={form.confirmPassword}
              onChange={e => setForm(p => ({ ...p, confirmPassword: e.target.value }))} required />
            <button type="button" className="modal-eye-btn"
              onClick={() => setShowPasswords(p => ({ ...p, confirm: !p.confirm }))}>
              <i className={`fas fa-eye${showPasswords.confirm ? '-slash' : ''}`}></i>
            </button>
          </div>
          {form.confirmPassword.length > 0 && (
            <small style={{
              color: form.newPassword === form.confirmPassword ? '#22c55e' : '#ef4444',
              display: 'block', marginTop: '4px', fontWeight: 600
            }}>
              <i className={`fas fa-${form.newPassword === form.confirmPassword ? 'check' : 'times'}-circle`}></i>
              {form.newPassword === form.confirmPassword ? ' كلمات المرور متطابقة ✓' : ' كلمات المرور غير متطابقة ✗'}
            </small>
          )}
        </div>

        {error && <p className="modal-error">{sanitizeText(error)}</p>}
        {success && <p className="modal-success">{sanitizeText(success)}</p>}

        <div className="modal-actions">
          <button type="button" className="settings-secondary-button" onClick={onClose} disabled={loading}>إلغاء</button>
          <button type="submit" className="settings-primary-button"
            disabled={loading || passwordStrength !== 100 || form.newPassword !== form.confirmPassword}>
            {loading ? <><i className="fas fa-spinner fa-spin"></i> جاري الحفظ...</> : 'حفظ'}
          </button>
        </div>
      </form>
    </Modal>
  );
};

const PhoneModal = ({ currentPhone, onClose, onSuccess }) => {
  const [digits, setDigits] = useState(() => String(currentPhone || '').replace(/\D/g, '').replace(/^90/, '').replace(/^0/, '').slice(0, 10));
  const [otpCode, setOtpCode] = useState('');
  const [step, setStep] = useState('phone');
  const [loading, setLoading] = useState(false);
  const [sendingOtp, setSendingOtp] = useState(false);
  const [confirmationResult, setConfirmationResult] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const normalize = (value) => {
    const d = String(value || '').replace(/\D/g, '');
    let core = d;
    if (core.length === 11 && core.startsWith('0')) core = core.slice(1);
    if (core.length === 12 && core.startsWith('90')) core = core.slice(2);
    return core.slice(0, 10);
  };

  const format = (value) => {
    const c = String(value || '').replace(/\D/g, '').slice(0, 10);
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
        initRecaptcha('expert-profile-phone-recaptcha', { size: 'invisible' });
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
    if (d.length !== 10 || !d.startsWith('9')) {
      setError('يرجى إدخال رقم هاتف صالح بالصيغة 9xx xxx xx xx.');
      return null;
    }
    return `+963${d}`;
  };

  const handleSendOtp = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    const phoneNumber = validatePhone();
    if (!phoneNumber) return;

    setSendingOtp(true);

    try {
      initRecaptcha('expert-profile-phone-recaptcha', { size: 'invisible' });
      const result = await startPhoneLinking(phoneNumber);
      setConfirmationResult(result);
      setStep('otp');
      setSuccess('تم إرسال رمز التحقق (SMS). يرجى التحقق من هاتفك.');
    } catch (err) {
      if (isDevelopment) console.error('Kod gönderme hatası:', err?.message || err);
      setError('تعذّر إرسال الرمز. يرجى المحاولة مرة أخرى لاحقاً.');
    } finally {
      setSendingOtp(false);
    }
  };

  const handleVerifyAndSave = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!confirmationResult) {
      setError('لم يتم العثور على جلسة التحقق. يرجى إرسال الرمز مجدداً.');
      return;
    }

    if (!String(otpCode).trim() || String(otpCode).trim().length < 6) {
      setError('يرجى إدخال رمز التحقق المكون من 6 أرقام.');
      return;
    }

    setLoading(true);

    try {
      const result = await confirmPhoneLinking(confirmationResult, otpCode);
      const finalPhone = result?.user?.phoneNumber || `+963${normalize(digits)}`;

      try {
        if (auth.currentUser?.uid) {
          await updateDoc(doc(db, 'users', auth.currentUser.uid), { phoneNumber: finalPhone });
        }
      } catch {
        /* ignore */
      }

      setSuccess('تم التحقق من رقم الهاتف وحفظه بنجاح.');
      onSuccess(finalPhone);
      setTimeout(() => {
        clearRecaptcha();
        onClose();
      }, 1200);
    } catch (err) {
      if (isDevelopment) console.error('Doğrulama hatası:', err?.message || err);
      setError('فشلت عملية التحقق. يرجى المحاولة مرة أخرى لاحقاً.');
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
      initRecaptcha('expert-profile-phone-recaptcha', { size: 'invisible' });
      const result = await startPhoneLinking(phoneNumber);
      setConfirmationResult(result);
      setSuccess('تم إرسال رمز تحقق جديد.');
    } catch (err) {
      if (isDevelopment) console.error('Kod gönderme hatası:', err?.message || err);
      setError('تعذّر إعادة إرسال الرمز. يرجى المحاولة مرة أخرى لاحقاً.');
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
            <span>الرمز</span>
          </div>
        </div>

        <div className="modal-field">
          <label>رقم الهاتف الجديد (+963)</label>
          <input
            type="tel"
            value={format(digits)}
            onChange={(e) => setDigits(normalize(e.target.value))}
            placeholder="9xx xxx xx xx"
            required
            disabled={loading || sendingOtp || step === 'otp'}
          />
        </div>

        {step === 'otp' && (
          <div className="modal-field">
            <label>رمز التحقق (OTP)</label>
            <input
              type="text"
              inputMode="numeric"
              value={otpCode}
              onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="رمز مكون من 6 أرقام"
              required
              disabled={loading}
            />
          </div>
        )}

        <div id="expert-profile-phone-recaptcha" className="profile-phone-recaptcha"></div>

        {error && <p className="modal-error">{sanitizeText(error)}</p>}
        {success && <p className="modal-success">{sanitizeText(success)}</p>}

        {step === 'otp' && (
          <button type="button" className="phone-resend-btn" onClick={handleResendOtp} disabled={sendingOtp || loading}>
            <i className="fas fa-rotate-right"></i>
            {sendingOtp ? 'جاري الإرسال...' : 'إعادة إرسال الرمز'}
          </button>
        )}

        <div className="modal-actions">
          <button type="button" className="settings-secondary-button" onClick={onClose} disabled={loading || sendingOtp}>
            إلغاء
          </button>

          {step === 'phone' ? (
            <button type="submit" className="settings-primary-button" disabled={sendingOtp || loading}>
              {sendingOtp ? 'جاري الإرسال...' : 'إرسال الرمز'}
            </button>
          ) : (
            <button type="submit" className="settings-primary-button" disabled={loading}>
              {loading ? 'جاري التحقق...' : 'تحقق وحفظ'}
            </button>
          )}
        </div>
      </form>
    </Modal>
  );
};

const WorkingHoursModal = ({ uid, currentHours, onClose, onSuccess }) => {
  const [hours, setHours] = useState(() => {
    const initial = {};
    DAYS.forEach(day => {
      initial[day] = {
        enabled: currentHours?.[day]?.enabled || false,
        start: currentHours?.[day]?.start || '09:00',
        end: currentHours?.[day]?.end || '18:00',
      };
    });
    return initial;
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const toggleDay = (day) => setHours(prev => ({ ...prev, [day]: { ...prev[day], enabled: !prev[day].enabled } }));
  const setTime = (day, field, value) => setHours(prev => ({ ...prev, [day]: { ...prev[day], [field]: value } }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      await updateWorkingHours({ uid, workingHours: hours });
      setSuccess('تم تحديث ساعات العمل الخاصة بك.');
      onSuccess(hours);
      setTimeout(onClose, 1500);
    } catch {
      setError('حدث خطأ. يرجى المحاولة مرة أخرى لاحقاً.');
    } finally { setLoading(false); }
  };

  return (
    <Modal title="تعديل ساعات العمل" onClose={onClose}>
      <form onSubmit={handleSubmit} className="modal-form">
        <div className="working-hours-edit-list">
          {DAYS.map(day => (
            <div key={day} className={`working-hours-edit-row ${hours[day].enabled ? 'active' : ''}`}>
              <div className="working-hours-edit-day">
                <label className="working-hours-toggle">
                  <input type="checkbox" checked={hours[day].enabled} onChange={() => toggleDay(day)} />
                  <span className="toggle-slider"></span>
                </label>
                <span className="working-hours-day-name">{getTurkishDayName(day)}</span>
              </div>
              {hours[day].enabled ? (
                <div className="working-hours-edit-times">
                  <input type="time" value={hours[day].start} onChange={e => setTime(day, 'start', e.target.value)} />
                  <span>—</span>
                  <input type="time" value={hours[day].end} onChange={e => setTime(day, 'end', e.target.value)} />
                </div>
              ) : (
                <span className="working-hours-closed">مغلق</span>
              )}
            </div>
          ))}
        </div>
        {error && <p className="modal-error">{sanitizeText(error)}</p>}
        {success && <p className="modal-success">{sanitizeText(success)}</p>}
        <div className="modal-actions">
          <button type="button" className="settings-secondary-button" onClick={onClose} disabled={loading}>إلغاء</button>
          <button type="submit" className="settings-primary-button" disabled={loading}>
            {loading ? <><i className="fas fa-spinner fa-spin"></i> جاري الحفظ...</> : 'حفظ'}
          </button>
        </div>
      </form>
    </Modal>
  );
};

const DeleteAccountModal = ({ onClose, onDeleted, hasPasswordProvider = false, hasGoogleProvider = false }) => {

  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const finishDeactivateFlow = (result) => {
    setSuccess(
      `تم تعطيل حسابك بنجاح. تم حذف إعلاناتك النشطة (${result?.deletedListingsCount || 0}). جاري تحويلك...`
    );
    setTimeout(() => {
      onDeleted();
    }, 1200);
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
      const result = await deleteProviderAccount({ password });
      finishDeactivateFlow(result);
    } catch (err) {
      setError(err?.message || 'حدث خطأ أثناء محاولة تعطيل الحساب.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleDeactivate = async () => {
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const result = await deleteProviderAccount({ useGoogle: true });
      finishDeactivateFlow(result);
    } catch (err) {
      setError(err?.message || 'حدث خطأ أثناء التحقق بواسطة Google.');
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
          لن يتم حذف حسابك نهائياً على الفور. سيتم تعطيل الحساب ويمكن استعادته خلال 60 يوماً.
          خلال هذه الفترة، ستتم إزالة إعلاناتك النشطة من المنصة. بعد 60 يوماً، سيتم حذف الحساب نهائياً.
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
              يسجل هذا الحساب الدخول عبر Google. للمتابعة، يرجى إعادة التحقق من حساب Google الخاص بك.
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
          <button type="button" className="settings-secondary-button" onClick={onClose} disabled={loading}>
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

const AddressRequestModal = ({ user, onClose, onSuccess }) => {
  const [reason, setReason] = useState('');
  const [taxPlate, setTaxPlate] = useState(null);
  const [inspectionReport, setInspectionReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleFileChange = (e, setter) => {
    const file = e.target.files[0];
    if (file && file.size > 5 * 1024 * 1024) {
      showAppToast("Dosya boyutu 5MB'dan küçük olmalıdır.", "error");
      e.target.value = null;
      return;
    }
    setter(file);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!taxPlate && !inspectionReport) {
      setError('Lütfen en az bir gerekli belgeyi (Vergi Levhası veya Yoklama Fişi) yükleyin.');
      return;
    }
    if (!reason.trim()) {
      setError('Lütfen adres değişikliği sebebini yazınız.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      let taxPlateUrl = null;
      let inspectionReportUrl = null;

      if (taxPlate) {
        const taxRef = ref(storage, `address_requests/${user.uid}/tax_plate_${Date.now()}`);
        await uploadBytes(taxRef, taxPlate);
        taxPlateUrl = await getDownloadURL(taxRef);
      }

      if (inspectionReport) {
        const inspRef = ref(storage, `address_requests/${user.uid}/inspection_report_${Date.now()}`);
        await uploadBytes(inspRef, inspectionReport);
        inspectionReportUrl = await getDownloadURL(inspRef);
      }

      const userDisplayName = user.displayName || userData?.displayName || expertData?.businessName || "Belirtilmemiş";
      const userEmail = user.email || userData?.email;

      await addDoc(collection(db, "address_change_requests"), {
        expertId: user.uid,
        userDisplayName: userDisplayName,  
        userEmail: userEmail,              
        reason: reason.trim(),
        taxPlateUrl,
        inspectionReportUrl,
        status: 'PENDING',
        rejectionReason: null,
        createdAt: new Date().toISOString()
      });

      showAppToast('Talebiniz başarıyla iletildi. Değerlendirme aşamasını bu sekmeden takip edebilirsiniz.', 'success');
      onSuccess();
    } catch (err) {
      if (isDevelopment) console.error("Talep gönderme hatası:", err);
      setError('Talep gönderilirken bir hata oluştu. Lütfen tekrar deneyin.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal title="Adres Değişikliği Talebi" onClose={onClose}>
      <form onSubmit={handleSubmit} className="modal-form">
        <p className="modal-info-text" style={{ color: '#ffcc00', fontWeight: 'bold', marginBottom: '15px' }}>
          <i className="fas fa-info-circle"></i> En az bir gerekli belgeyi yükleyin
        </p>

        <div className="modal-field">
          <label>Vergi Levhası (Opsiyonel)</label>
          <input type="file" accept="image/*,application/pdf" onChange={(e) => handleFileChange(e, setTaxPlate)} disabled={loading} />
        </div>

        <div className="modal-field">
          <label>Yoklama Fişi (Opsiyonel)</label>
          <input type="file" accept="image/*,application/pdf" onChange={(e) => handleFileChange(e, setInspectionReport)} disabled={loading} />
        </div>

        <div className="modal-field">
          <label>Adres Değişikliği Sebebini Yazınız:</label>
          <textarea 
            className="modal-textarea"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Örn: İş yerimi daha geniş bir alana taşıdım..."
            rows="4"
            disabled={loading}
          />
        </div>

        {error && <p className="modal-error">{sanitizeText(error)}</p>}

        <div className="modal-actions">
          <button type="button" className="settings-secondary-button" onClick={onClose} disabled={loading}>İptal</button>
          <button type="submit" className="settings-primary-button" disabled={loading}>
            {loading ? <><i className="fas fa-spinner fa-spin"></i> Gönderiliyor...</> : 'Talebi Gönder'}
          </button>
        </div>
      </form>
    </Modal>
  );
};

const FinalAddressUpdateFlow = ({ user, requestId, mainAddressId, onClose, onSuccess }) => {
  const [step, setStep] = useState('warning'); 
  const [loading, setLoading] = useState(false);
  const [initialAddress, setInitialAddress] = useState(null);

  useEffect(() => {
    const fetchCurrent = async () => {
      if (!mainAddressId) return; 

      try {
        const docRef = doc(db, "users", user.uid, "addresses", mainAddressId);
        const snap = await getDoc(docRef);
        if (snap.exists()) setInitialAddress(snap.data());
      } catch (err) {
        console.error("Adres çekilemedi:", err);
      }
    };
    fetchCurrent();
  }, [user.uid, mainAddressId]);

  const handleFinalSave = async (newData) => {
    setLoading(true);
    try {
      const batch = writeBatch(db);
      let addrRef;

      if (mainAddressId) {
        addrRef = doc(db, "users", user.uid, "addresses", mainAddressId);
        batch.update(addrRef, { ...newData, updatedAt: new Date().toISOString() });
      } else {
        addrRef = doc(collection(db, "users", user.uid, "addresses"));
        batch.set(addrRef, { ...newData, createdAt: new Date().toISOString() });
        
        const userRef = doc(db, "users", user.uid);
        batch.update(userRef, { mainAddressId: addrRef.id });
      }

      const providerRef = doc(db, "service_providers", user.uid);
        batch.update(providerRef, {
          lat: newData.lat || null,
          lng: newData.lng || null,
          city: newData.city || null,
          district: newData.district || null,
          mainAddressId: addrRef.id,
          updatedAt: new Date().toISOString()
        });

      const reqRef = doc(db, "address_change_requests", requestId);
      batch.update(reqRef, { status: 'COMPLETED' });

      await batch.commit();
      showAppToast('İş yeri adresiniz başarıyla kaydedildi.', 'success');
      onSuccess();
    } catch (err) {
      console.error("Kaydetme hatası:", err);
      showAppToast('Güncelleme sırasında bir hata oluştu.', 'error');
    } finally {
      setLoading(false);
    }
  };

  if (step === 'warning') {
    return (
      <Modal title="⚠️ Kritik Uyarı" onClose={onClose}>
        <div className="modal-form">
          <div className="rejection-alert-box" style={{ background: 'rgba(255, 204, 0, 0.1)', border: '1px solid #ffcc00' }}>
            <p style={{ color: '#ffcc00', fontSize: '15px', lineHeight: '1.6' }}>
              <strong>Lütfen iş yerinizi doğru girdiğinizden emin olun.</strong> Bu işlem geri alınamaz. 
              Yanlış veya hata yaparsanız bir daha talep oluşturmak zorunda kalırsınız.
            </p>
          </div>
          <div className="modal-actions" style={{ marginTop: '20px' }}>
            <button className="settings-secondary-button" onClick={onClose}>Geri Dön</button>
            <button className="settings-primary-button" onClick={() => setStep('form')}>Okudum, Kabul Ediyorum</button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <AddressModal 
      isOpen={true}
      onClose={onClose}
      onSave={handleFinalSave}
      initialData={initialAddress}
      isEditing={true}
    />
  );
};

const ExpertProfilePage = () => {
  const navigate = useNavigate();
  const SPECIALTIES_PRICE_LIMIT = 5;
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isExpert, setIsExpert] = useState(false);
  const [userData, setUserData] = useState(null);
  const [expertData, setExpertData] = useState(null);
  const [activeSetting, setActiveSetting] = useState('user');
  const [portfolioUrls, setPortfolioUrls] = useState([]);
  const [portfolioLoading, setPortfolioLoading] = useState(false);
  const [portfolioUploading, setPortfolioUploading] = useState(false);
  const [portfolioError, setPortfolioError] = useState('');
  const [activeModal, setActiveModal] = useState(null);
  const [profilePhotoUrl, setProfilePhotoUrl] = useState(null);
  const [photoUploading, setPhotoUploading] = useState(false);

  const [showSpecialtiesModal, setShowSpecialtiesModal] = useState(false);
  const [specialtiesDraft, setSpecialtiesDraft] = useState([]);
  const [specialtiesSaving, setSpecialtiesSaving] = useState(false);
  const [specialtiesError, setSpecialtiesError] = useState("");

  const [baGallery, setBaGallery] = useState([]);
  const [baLoading, setBaLoading] = useState(false);
  const [showBaAddModal, setShowBaAddModal] = useState(false);
  const [showBaViewModal, setShowBaViewModal] = useState(false);
  const [selectedBaPair, setSelectedBaPair] = useState(null);
  const [baForm, setBaForm] = useState({ title: '', beforeImage: null, afterImage: null });
  const [baUploading, setBaUploading] = useState(false);
  const [showBaEditModal, setShowBaEditModal] = useState(false);
  const [editBaForm, setEditBaForm] = useState({ title: '', beforeImage: null, afterImage: null });
  const [appointments, setAppointments] = useState([]);
  const [showAllRecentJobs, setShowAllRecentJobs] = useState(false);

  const [reviews, setReviews] = useState([]);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [reviewStats, setReviewStats] = useState({ avg: 0, count: 0 });
  const [activeListingReviewStats, setActiveListingReviewStats] = useState({ avg: 0, count: 0 });

  const [emailVerified, setEmailVerified] = useState(false);
  const [passwordToast, setPasswordToast] = useState('');
  const [googleLinked, setGoogleLinked] = useState(false);
  const [googleLinkLoading, setGoogleLinkLoading] = useState(false);
  const [googleLinkMessage, setGoogleLinkMessage] = useState('');
  const [googleLinkError, setGoogleLinkError] = useState('');
  const [canLinkGoogle, setCanLinkGoogle] = useState(false);
  const [hasPasswordProvider, setHasPasswordProvider] = useState(false);

  const [addressRequest, setAddressRequest] = useState(null);
  const [mainAddressData, setMainAddressData] = useState(null);

  const [showPortfolioDeleteConfirm, setShowPortfolioDeleteConfirm] = useState(false);
  const [portfolioUrlToDelete, setPortfolioUrlToDelete] = useState(null);
  const [showBaDeleteConfirm, setShowBaDeleteConfirm] = useState(false);
  const [baIdToDelete, setBaIdToDelete] = useState(null);

  useEffect(() => {
    if (!user?.uid) return;
    
    const q = query(collection(db, "address_change_requests"), where("expertId", "==", user.uid));
    const unsubscribe = onSnapshot(q, (snap) => {
      try {
        if (!snap.empty) {
          const sorted = snap.docs.map(d => ({ id: d.id, ...d.data() }))
                          .sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
          setAddressRequest(sorted[0]);
        } else {
          setAddressRequest(null);
        }
      } catch (err) {
        console.error("Ajan veri okuyamadı:", err);
      }
    }, (error) => {
      console.warn("Firebase Kuralları henüz aktif olmayabilir:", error.message);
    });
    return () => unsubscribe();
  }, [user?.uid]);

  useEffect(() => {
    if (!user?.uid || !userData?.mainAddressId) return;
    const fetchAddr = async () => {
      const addrDoc = await getDoc(doc(db, "users", user.uid, "addresses", userData.mainAddressId));
      if (addrDoc.exists()) setMainAddressData(addrDoc.data());
    };
    fetchAddr();
  }, [user?.uid, userData?.mainAddressId]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser) { navigate('/login'); return; }
      setUser(currentUser);
      setEmailVerified(!!currentUser.emailVerified);

      const currentEmail = String(currentUser.email || '').trim().toLowerCase();
      setCanLinkGoogle(currentEmail.endsWith('@gmail.com'));

      try {
        const userDoc = await getDoc(doc(db, "users", currentUser.uid));
        if (userDoc.exists()) {
          const data = userDoc.data();
          setUserData({
            ...data,
            email: data.email || currentUser.email || '',
            phoneNumber: data.phoneNumber || currentUser.phoneNumber || '',
          });
          if (data.userType === 'PROVIDER') { setIsExpert(true); }
          else { navigate('/'); return; }
        }
        const expertDoc = await getDoc(doc(db, "service_providers", currentUser.uid));
        if (expertDoc.exists()) setExpertData(expertDoc.data());

        await loadPortfolio(currentUser.uid);
        await loadBaGallery(currentUser.uid);

        const photo = await getProfilePhoto(currentUser.uid);
        setProfilePhotoUrl(photo);

        try {
          const flags = getCurrentUserProviderFlags();
          setGoogleLinked(!!flags.hasGoogle);
          setHasPasswordProvider(!!flags.hasPassword);
        } catch {
          setGoogleLinked(false);
          setHasPasswordProvider(false);
        }
      } catch (error) {
        if (isDevelopment) console.error("Veri çekme hatası:", error.message);
        navigate('/');
      } finally { setLoading(false); }
    });
    return () => unsubscribe();
  }, [navigate]);

  useEffect(() => {
    if (!user?.uid || !isExpert) {
      setAppointments([]);
      return undefined;
    }

    const appointmentsQuery = query(
      collection(db, 'appointments'),
      where('expertId', '==', user.uid)
    );

    const unsubscribe = onSnapshot(
      appointmentsQuery,
      (snapshot) => {
        const items = snapshot.docs.map((item) => ({
          id: item.id,
          ...item.data()
        }));
        setAppointments(items);
      },
      (error) => {
        if (isDevelopment) {
          console.error("[ExpertProfile] appointments onSnapshot error:", error);
        }
        setAppointments([]);
      }
    );

    return () => unsubscribe();
  }, [user?.uid, isExpert]);

  useEffect(() => {
    if (!user?.uid || !isExpert) {
      setReviews([]);
      setReviewStats({ avg: 0, count: 0 });
      setActiveListingReviewStats({ avg: 0, count: 0 });
      return;
    }

    let cancelled = false;
    const load = async () => {
      setReviewsLoading(true);
      try {
        const [items, stats, activeStats] = await Promise.all([
          fetchExpertReviews(user.uid, { pageSize: 3, includeInactiveListings: false }),
          fetchExpertReviewStats(user.uid, { includeInactiveListings: true }),
          fetchExpertReviewStats(user.uid, { includeInactiveListings: false }),
        ]);
        if (!cancelled) {
          setReviews(items);
          setReviewStats(stats);
          setActiveListingReviewStats(activeStats);
        }
      } finally {
        if (!cancelled) setReviewsLoading(false);
      }
    };

    load();
    return () => { cancelled = true; };
  }, [user?.uid, isExpert]);

  const handleLinkGoogle = async () => {
    setGoogleLinkError('');
    setGoogleLinkMessage('');
    setGoogleLinkLoading(true);

    try {
      const result = await linkGoogleToCurrentUser();
      setGoogleLinked(true);
      setGoogleLinkMessage(result?.message || 'Google hesabı başarıyla bağlandı.');
    } catch (err) {
      if (err?.code === 'GOOGLE_ACCOUNT_EMAIL_MISMATCH' || err?.code === 'GOOGLE_EMAIL_NOT_RESOLVED') {
        setGoogleLinkError(err?.message || 'Seçilen Google hesabı mevcut hesap e-postasıyla eşleşmiyor.');
        return;
      }

      if (err?.code === 'GOOGLE_CREDENTIAL_ALREADY_IN_USE') {
        setGoogleLinkError(err?.message || 'Bu Google hesabı başka bir kullanıcıya bağlı.');
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
        setGoogleLinkError(err?.message || 'Google açılır penceresi engellendi. Lütfen pop-up izni verin.');
        return;
      }

      setGoogleLinkError(err?.message || 'Google hesabı bağlanamadı.');
    } finally {
      setGoogleLinkLoading(false);
    }
  };

  const loadPortfolio = async (uid) => {
    try {
      setPortfolioLoading(true);
      const urls = await getPortfolioPhotos(uid);
      setPortfolioUrls(urls);
    } catch {
      setPortfolioUrls([]);
    } finally {
      setPortfolioLoading(false);
    }
  };

  const loadBaGallery = async (uid) => {
    try {
      setBaLoading(true);
      const querySnapshot = await getDocs(collection(db, "users", uid, "beforeAfterGallery"));
      const data = querySnapshot.docs.map(docItem => ({ id: docItem.id, ...docItem.data() }));
      const sortedData = data.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      setBaGallery(sortedData);
    } catch (error) {
      if (isDevelopment) console.error("Galeri çekme hatası:", error.message);
    } finally {
      setBaLoading(false);
    }
  };

  const getUserDisplayName = () => userData?.displayName || '';
  const getFirstName = () => getUserDisplayName().split(' ')[0] || 'Belirtilmemiş';
  const getLastName = () => {
    const p = getUserDisplayName().split(' ');
    return p.length > 1 ? p.slice(1).join(' ') : 'Belirtilmemiş';
  };
  const getUserInitials = () => (userData?.displayName || expertData?.businessName || '').substring(0, 2).toUpperCase();

  const openSpecialtiesModal = () => {
    setSpecialtiesError("");
    setSpecialtiesDraft(normalizeSpecialties(expertData?.specialties));
    setShowSpecialtiesModal(true);
  };

  const updateDraftRow = (idx, patch) => {
    setSpecialtiesDraft((prev) =>
      prev.map((row, i) => (i === idx ? { ...row, ...patch } : row))
    );
  };

  const removeDraftRow = (idx) => {
    setSpecialtiesDraft((prev) => prev.filter((_, i) => i !== idx));
  };

  const addDraftRow = () => {
    setSpecialtiesDraft((prev) => {
      if (prev.length >= SPECIALTIES_PRICE_LIMIT) return prev;
      return [...prev, { name: "", startingPrice: 0 }];
    });
  };

  const saveSpecialties = async () => {
    if (!user?.uid) return;
    setSpecialtiesError("");

    const rangeMin = Math.max(0, Number(expertData?.minPrice) || 0);
    const rangeMax = Math.max(0, Number(expertData?.maxPrice) || 0);
    const hasRange = rangeMin > 0 || rangeMax > 0;

    const cleaned = specialtiesDraft
      .map((x) => ({
        name: String(x?.name || "").trim(),
        startingPrice: Number(String(x?.startingPrice ?? 0).replace(/[^\d]/g, "")) || 0,
      }))
      .filter((x) => x.name);

    if (!cleaned.length) {
      setSpecialtiesError("En az 1 uzmanlık eklemelisiniz.");
      return;
    }
    if (cleaned.some((x) => x.startingPrice <= 0)) {
      setSpecialtiesError("Her uzmanlık için başlangıç fiyatı girin (0'dan büyük).");
      return;
    }

    if (hasRange) {
      if (rangeMax > 0 && rangeMin > rangeMax) {
        setSpecialtiesError("Fiyat aralığı geçersiz: Min fiyat, max fiyattan büyük olamaz.");
        return;
      }

      const tooLow = cleaned.find((x) => rangeMin > 0 && x.startingPrice < rangeMin);
      if (tooLow) {
        setSpecialtiesError(
          `“${tooLow.name}” başlangıç fiyatı min fiyattan düşük olamaz (en az ${rangeMin.toLocaleString("tr-TR")} TL).`
        );
        return;
      }

      const tooHigh = cleaned.find((x) => rangeMax > 0 && x.startingPrice > rangeMax);
      if (tooHigh) {
        setSpecialtiesError(
          `“${tooHigh.name}” başlangıç fiyatı max fiyattan yüksek olamaz (en fazla ${rangeMax.toLocaleString("tr-TR")} TL).`
        );
        return;
      }
    }

    setSpecialtiesSaving(true);
    try {
      const names = cleaned.map((x) => x.name);
      await updateDoc(doc(db, "service_providers", user.uid), {
        specialties: cleaned,
        specialtyNames: names,
        updatedAt: new Date().toISOString(),
      });
      setExpertData((prev) => ({ ...(prev || {}), specialties: cleaned, specialtyNames: names }));
      setShowSpecialtiesModal(false);
    } catch (err) {
      if (isDevelopment) console.error("Uzmanlık fiyatları kaydedilemedi:", err.message);
      setSpecialtiesError("Kaydedilemedi. Lütfen tekrar deneyin.");
    } finally {
      setSpecialtiesSaving(false);
    }
  };

  const confirmPortfolioDelete = async () => {
    const url = portfolioUrlToDelete;
    if (!url) {
      setShowPortfolioDeleteConfirm(false);
      return;
    }
    try {
      await deletePortfolioPhoto(url);
      setPortfolioUrls(prev => prev.filter(u => u !== url));
    } catch (err) {
      if (isDevelopment) console.error("Portfolyo silme hatası:", err.message);
      setPortfolioError("Fotoğraf silinirken bir hata oluştu.");
    } finally {
      setShowPortfolioDeleteConfirm(false);
      setPortfolioUrlToDelete(null);
    }
  };

  const handlePortfolioDelete = (url) => {
    setPortfolioUrlToDelete(url);
    setShowPortfolioDeleteConfirm(true);
  };

  const confirmBaDelete = async () => {
    const pairId = baIdToDelete;
    if (!pairId) {
      setShowBaDeleteConfirm(false);
      return;
    }
    
    const pairData = baGallery.find(p => p.id === pairId);
    if (!pairData) {
      setShowBaDeleteConfirm(false);
      return;
    }

    try {
      const deleteFile = async (url) => {
        if (!url) return;
        try {
          const fileRef = storageRefFromDownloadUrl(storage, url);
          if (!fileRef) return;
          await deleteObject(fileRef);
        } catch {
          if (isDevelopment) console.warn("Dosya Storage'da bulunamadı veya zaten silinmiş:", url);
        }
      };

      await deleteFile(pairData.beforeUrl);
      await deleteFile(pairData.afterUrl);

      await deleteDoc(doc(db, "users", user.uid, "beforeAfterGallery", pairId));

      await loadBaGallery(user.uid);
      setShowBaViewModal(false);
    } catch (error) {
      if (isDevelopment) console.error("Silme işlemi sırasında hata:", error?.message || error);
      showAppToast('Silme sırasında bir hata oluştu.', 'error');
    } finally {
      setShowBaDeleteConfirm(false);
      setBaIdToDelete(null);
    }
  };

  const handleBADelete = (pairId) => {
    setBaIdToDelete(pairId);
    setShowBaDeleteConfirm(true);
  };

  const handleProfilePhotoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !user?.uid) return;

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
      const url = await uploadProfilePhoto({ uid: user.uid, file });
      setProfilePhotoUrl(url);

      const batch = writeBatch(db);
      let hasUpdates = false;

      const providerChatsQ = query(collection(db, 'conversations'), where('providerUid', '==', user.uid));
      const providerChatsSnap = await getDocs(providerChatsQ);
      providerChatsSnap.forEach((chatDoc) => {
        batch.update(chatDoc.ref, { providerAvatar: url });
        hasUpdates = true;
      });

      const clientChatsQ = query(collection(db, 'conversations'), where('clientUid', '==', user.uid));
      const clientChatsSnap = await getDocs(clientChatsQ);
      clientChatsSnap.forEach((chatDoc) => {
        batch.update(chatDoc.ref, { clientAvatar: url });
        hasUpdates = true;
      });

      if (hasUpdates) await batch.commit();
    } catch (err) {
      if (isDevelopment) console.error('Profil fotoğrafı yüklenemedi veya sohbetlere aktarılamadı:', err?.message || err);
      showAppToast('Fotoğraf yüklenirken bir hata oluştu. Lütfen daha sonra tekrar deneyin.', 'error');
    } finally {
      setPhotoUploading(false);
      e.target.value = '';
    }
  };

  const handlePortfolioUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    setPortfolioUploading(true);
    setPortfolioError('');
    try {
      const uploadedUrls = [];
      for (const file of files) {
        const url = await uploadPortfolioPhoto({ uid: user.uid, file });
        uploadedUrls.push(url);
      }
      setPortfolioUrls(prev => [...prev, ...uploadedUrls]);
    } catch (err) {
      if (isDevelopment) console.error("Portfolyo yükleme hatası:", err.message);
      setPortfolioError("Fotoğraf yüklenirken bir hata oluştu.");
    } finally {
      setPortfolioUploading(false);
      e.target.value = '';
    }
  };

  const handleBAUpload = async () => {
    if (!baForm.title || !baForm.beforeImage || !baForm.afterImage) {
      showAppToast('Lütfen başlık girin ve her iki fotoğrafı da seçin.', 'error');
      return;
    }

    setBaUploading(true);
    try {
      const ts = Date.now();
      const beforeRef = ref(storage, `beforeAfter/${user.uid}/${ts}_before`);
      await uploadBytes(beforeRef, baForm.beforeImage);
      const beforeUrl = await getDownloadURL(beforeRef);

      const afterRef = ref(storage, `beforeAfter/${user.uid}/${ts}_after`);
      await uploadBytes(afterRef, baForm.afterImage);
      const afterUrl = await getDownloadURL(afterRef);

      await addDoc(collection(db, "users", user.uid, "beforeAfterGallery"), {
        title: sanitizeText(baForm.title),
        beforeUrl,
        afterUrl,
        createdAt: new Date().toISOString()
      });

      showAppToast('Galeri başarıyla eklendi!', 'success');
      setBaForm({ title: '', beforeImage: null, afterImage: null });
      setShowBaAddModal(false);
      await loadBaGallery(user.uid);
    } catch (error) {
      if (isDevelopment) console.error("Yükleme hatası:", error?.message || error);
      showAppToast('Yükleme sırasında bir hata oluştu.', 'error');
    } finally {
      setBaUploading(false);
    }
  };

  const handleBAUpdate = async () => {
    if (!editBaForm.title) {
      showAppToast('Başlık gerekli.', 'error');
      return;
    }

    setBaUploading(true);
    try {
      const updateData = { title: sanitizeText(editBaForm.title) };

      const oldBeforeUrl = selectedBaPair.beforeUrl;
      const oldAfterUrl = selectedBaPair.afterUrl;

      if (editBaForm.beforeImage) {
        const oldBeforeRef = storageRefFromDownloadUrl(storage, oldBeforeUrl);
        if (oldBeforeRef) await deleteObject(oldBeforeRef).catch(() => {});
        const ts = Date.now();
        const beforeRef = ref(storage, `beforeAfter/${user.uid}/${ts}_before`);
        await uploadBytes(beforeRef, editBaForm.beforeImage);
        updateData.beforeUrl = await getDownloadURL(beforeRef);
      }

      if (editBaForm.afterImage) {
        const oldAfterRef = storageRefFromDownloadUrl(storage, oldAfterUrl);
        if (oldAfterRef) await deleteObject(oldAfterRef).catch(() => {});
        const ts = Date.now();
        const afterRef = ref(storage, `beforeAfter/${user.uid}/${ts}_after`);
        await uploadBytes(afterRef, editBaForm.afterImage);
        updateData.afterUrl = await getDownloadURL(afterRef);
      }

      await updateDoc(doc(db, "users", user.uid, "beforeAfterGallery", selectedBaPair.id), updateData);

      setShowBaEditModal(false);
      setShowBaViewModal(false);
      await loadBaGallery(user.uid);
    } catch (error) {
      if (isDevelopment) console.error(error);
      showAppToast('Güncelleme sırasında bir hata oluştu.', 'error');
    } finally {
      setBaUploading(false);
    }
  };

  const [zoomState, setZoomState] = useState({
    before: { scale: 1, panning: { x: 0, y: 0 }, isDragging: false, startCoords: { x: 0, y: 0 } },
    after: { scale: 1, panning: { x: 0, y: 0 }, isDragging: false, startCoords: { x: 0, y: 0 } }
  });

  const handleWheelZoom = (e, side) => {
    e.preventDefault();
    const delta = e.deltaY;
    const zoomFactor = delta > 0 ? 0.9 : 1.1;
    const newScale = zoomState[side].scale * zoomFactor;
    if (newScale >= 1 && newScale <= 5) {
      setZoomState({ ...zoomState, [side]: { ...zoomState[side], scale: newScale } });
    }
  };

  const handlePanStart = (e, side) => {
    e.preventDefault();
    setZoomState({ ...zoomState, [side]: { ...zoomState[side], isDragging: true, startCoords: { x: e.clientX, y: e.clientY } } });
  };

  const handlePanMove = useCallback((e) => {
    const side = zoomState.before.isDragging ? 'before' : (zoomState.after.isDragging ? 'after' : null);
    if (!side) return;
    const currentDragState = zoomState[side];
    const dx = e.clientX - currentDragState.startCoords.x;
    const dy = e.clientY - currentDragState.startCoords.y;
    const panSpeed = 0.7;

    setZoomState({
      ...zoomState,
      [side]: {
        ...zoomState[side],
        panning: {
          x: currentDragState.panning.x + (dx * panSpeed),
          y: currentDragState.panning.y + (dy * panSpeed)
        },
        startCoords: { x: e.clientX, y: e.clientY }
      }
    });
  }, [zoomState]);

  const handlePanEnd = useCallback(() => {
    const side = zoomState.before.isDragging ? 'before' : (zoomState.after.isDragging ? 'after' : null);
    if (!side) return;
    setZoomState({ ...zoomState, [side]: { ...zoomState[side], isDragging: false } });
  }, [zoomState]);

  useEffect(() => {
    window.addEventListener('mousemove', handlePanMove);
    window.addEventListener('mouseup', handlePanEnd);
    return () => {
      window.removeEventListener('mousemove', handlePanMove);
      window.removeEventListener('mouseup', handlePanEnd);
    };
  }, [handlePanMove, handlePanEnd]);

  useEffect(() => {
    const initialState = { scale: 1, panning: { x: 0, y: 0 }, isDragging: false, startCoords: { x: 0, y: 0 } };
    setZoomState({
      before: initialState,
      after: initialState
    });
  }, [showBaViewModal]);

  if (loading) return <div className="profile-page"><Navbar /><LoadingSpinner text="Yükleniyor..." /></div>;
  if (!user || !isExpert) return null;

  const certificates = expertData?.certificates || [];
  const historyAppointments = appointments
    .map((item) => {
      const historyMeta = getExpertHistoryMeta(item);
      return historyMeta ? { ...item, historyMeta } : null;
    })
    .filter(Boolean)
    .sort((a, b) => {
      const aTime =
        toMillis(a?.checkOutTime) ||
        Number(a?.approvedTime || a?.createdTime || 0) ||
        new Date(`${a?.date || '1970-01-01'}T${a?.end || a?.start || '00:00'}:00`).getTime();
      const bTime =
        toMillis(b?.checkOutTime) ||
        Number(b?.approvedTime || b?.createdTime || 0) ||
        new Date(`${b?.date || '1970-01-01'}T${b?.end || b?.start || '00:00'}:00`).getTime();
      return bTime - aTime;
    });
  const completedAppointments = historyAppointments.filter((item) => item.historyMeta?.key === 'completed');
  const recentJobs = completedAppointments.map((item) => ({
    id: item.id,
    title: item.listingTitle || item.note || 'Hizmet işlemi',
    date: formatAppointmentDate(item.date),
    time: item.start || '',
    city: item.city || '',
    district: item.district || '',
    client: item.client || item.clientName || 'Belirtilmemiş',
    address: item.fullAddress || item.address || 'Adres belirtilmemiş',
    statusLabel: item.historyMeta?.label || '',
    statusIcon: item.historyMeta?.icon || 'fa-clock',
    statusBadgeClass: item.historyMeta?.badgeClass || '',
  }));
  const visibleRecentJobs = showAllRecentJobs ? recentJobs : recentJobs.slice(0, 3);
  const uniqueCustomerCount = new Set(
    completedAppointments
      .map((item) => item.clientId || String(item.client || '').trim().toLowerCase())
      .filter(Boolean)
  ).size;

  const fixedAvg = Number(expertData?.rating || 0);
  const activeReviewCount = activeListingReviewStats?.count || 0;

  return (
    <div className="profile-page">
      <Navbar />

      {showSpecialtiesModal && (
        <Modal title="التخصصات وأسعار البداية" onClose={() => (specialtiesSaving ? null : setShowSpecialtiesModal(false))}>
          <div className="specialties-price-modal">
            <div className="specialties-price-topline">
              <div className="specialties-price-counter">
                {specialtiesDraft.length} / {SPECIALTIES_PRICE_LIMIT}
              </div>
              {specialtiesDraft.length >= SPECIALTIES_PRICE_LIMIT && (
                <div className="specialties-price-limitwarn">
                  يمكن إضافة ما يصل إلى {SPECIALTIES_PRICE_LIMIT} تخصصات. احذف سطراً لإضافة تخصص جديد.
                </div>
              )}
            </div>

            <div className="specialties-price-table">
              <div className="specialties-price-row specialties-price-head">
                <div>التخصص</div>
                <div>سعر البداية</div>
                <div></div>
              </div>

              {specialtiesDraft.map((row, idx) => (
                <div key={`${row.name}-${idx}`} className="specialties-price-row">
                  <div>
                    <input
                      className="specialties-price-input"
                      value={row.name}
                      onChange={(e) => updateDraftRow(idx, { name: e.target.value })}
                      placeholder="مثال: دهان خارجي"
                      disabled={specialtiesSaving}
                    />
                  </div>
                  <div className="specialties-price-pricecell">
                    <input
                      className="specialties-price-input"
                      type="number"
                      inputMode="numeric"
                      value={row.startingPrice ?? 0}
                      onChange={(e) => updateDraftRow(idx, { startingPrice: e.target.value })}
                      placeholder="مثال: 600"
                      disabled={specialtiesSaving}
                      min={String(Math.max(0, Number(expertData?.minPrice) || 0))}
                      max={Number(expertData?.maxPrice) > 0 ? String(Math.max(0, Number(expertData?.maxPrice) || 0)) : undefined}
                    />
                    <span className="specialties-price-currency">ل.س</span>
                  </div>
                  <div>
                    <button
                      type="button"
                      className="specialties-price-remove"
                      onClick={() => removeDraftRow(idx)}
                      disabled={specialtiesSaving}
                      title="حذف السطر"
                    >
                      <i className="fas fa-trash"></i>
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {specialtiesError && <div className="specialties-price-error"><i className="fas fa-exclamation-circle"></i> {sanitizeText(specialtiesError)}</div>}

            <div className="specialties-price-actions">
              <button
                type="button"
                className="settings-secondary-button"
                onClick={addDraftRow}
                disabled={specialtiesSaving || specialtiesDraft.length >= SPECIALTIES_PRICE_LIMIT}
                title={specialtiesDraft.length >= SPECIALTIES_PRICE_LIMIT ? "الحد ممتلئ" : "إضافة تخصص"}
              >
                + إضافة تخصص
              </button>
              <div style={{ display: "flex", gap: 10 }}>
                <button type="button" className="settings-secondary-button" onClick={() => setShowSpecialtiesModal(false)} disabled={specialtiesSaving}>
                  إلغاء
                </button>
                <button type="button" className="settings-primary-button" onClick={saveSpecialties} disabled={specialtiesSaving}>
                  {specialtiesSaving ? <><i className="fas fa-spinner fa-spin"></i> جاري الحفظ...</> : "حفظ"}
                </button>
              </div>
            </div>
          </div>
        </Modal>
      )}

      {activeModal === 'name' && (
        <NameModal
          user={user}
          currentName={getUserDisplayName()}
          onClose={() => setActiveModal(null)}
          onSuccess={(displayName) => setUserData((prev) => ({ ...(prev || {}), displayName }))}
        />
      )}

      {activeModal === 'priceRange' && user?.uid && (
        <PriceRangeModal
          uid={user.uid}
          currentMin={expertData?.minPrice || 0}
          currentMax={expertData?.maxPrice || 0}
          onClose={() => setActiveModal(null)}
          onSuccess={(v) => setExpertData((prev) => ({ ...(prev || {}), ...(v || {}) }))}
        />
      )}

      {activeModal === 'password' && (
        <ChangePasswordModal
          onClose={() => setActiveModal(null)}
          onSuccess={() => {
            setPasswordToast('Şifre güncellendi.');
            setTimeout(() => setPasswordToast(''), 4000);
          }}
        />
      )}

      {activeModal === 'phone' && (
        <PhoneModal
          currentPhone={userData?.phoneNumber || ''}
          onClose={() => setActiveModal(null)}
          onSuccess={(phoneNumber) => setUserData((prev) => ({ ...(prev || {}), phoneNumber }))}
        />
      )}
      {activeModal === 'workingHours' && (
        <WorkingHoursModal uid={user.uid} currentHours={expertData?.workingHours || {}} onClose={() => setActiveModal(null)}
          onSuccess={(v) => setExpertData(p => ({ ...p, workingHours: v }))} />
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

      {activeModal === 'addressRequestModal' && (
        <AddressRequestModal
          user={user}
          onClose={() => setActiveModal(null)}
          onSuccess={() => {
            setActiveModal(null);
          }}
        />
      )}

      {activeModal === 'finalAddressUpdate' && (
        <FinalAddressUpdateFlow
          user={user}
          requestId={addressRequest?.id}
          mainAddressId={userData?.mainAddressId}
          onClose={() => setActiveModal(null)}
          onSuccess={() => {
            setActiveModal(null);
            window.location.reload();
          }}
        />
      )}

      <main className="profile-main">
        <div className="profile-header-card">
          <div className="profile-header-left">
            <div className="profile-avatar-large">
              {profilePhotoUrl ? (
                <img src={profilePhotoUrl} alt="Profil" style={{ width: '80px', height: '80px', borderRadius: '50%', objectFit: 'cover', border: '3px solid var(--card-border)', display: 'block' }} />
              ) : (
                <div className="avatar-circle-large">
                  <span className="avatar-initials-large">{sanitizeText(getUserInitials())}</span>
                </div>
              )}
              <label style={{ position: 'absolute', bottom: 0, right: 0, width: '28px', height: '28px', borderRadius: '50%', background: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: photoUploading ? 'not-allowed' : 'pointer', opacity: photoUploading ? 0.6 : 1, boxShadow: 'var(--shadow)' }}>
                <input type="file" accept="image/*" style={{ display: 'none' }} disabled={photoUploading} onChange={handleProfilePhotoUpload} />
                {photoUploading
                  ? <i className="fas fa-spinner fa-spin" style={{ fontSize: '12px', color: '#0b1020' }}></i>
                  : <i className="fas fa-camera" style={{ fontSize: '12px', color: '#0b1020' }}></i>}
              </label>
            </div>

            <div className="profile-header-info">
              <div className="profile-header-meta">
                <h1 className="profile-header-name">{sanitizeText(expertData?.businessName || 'غير محدد')}</h1>
                {String(expertData?.profession || '').trim() ? (
                  <span className="profile-header-sub profile-header-sub--profession">
                    {sanitizeText(String(expertData.profession).trim())}
                  </span>
                ) : String(expertData?.category || '').trim() ? (
                  <span className="profile-header-sub profile-header-sub--profession">
                    {sanitizeText(String(expertData.category).split(',')[0].trim())}
                  </span>
                ) : null}
                <span className="profile-header-sub">{sanitizeText(getUserDisplayName())}</span>
              </div>
              <div className="profile-header-contact">
                <span><i className="fas fa-envelope"></i> {sanitizeText(userData?.email || 'غير محدد')}</span>
                <span><i className="fas fa-phone"></i> {sanitizeText(userData?.phoneNumber || 'غير محدد')}</span>
              </div>
              <div className="profile-header-meta">
                <span className="profile-badge-approved"><i className="fas fa-check-circle"></i> خبير معتمد</span>
                <span className="profile-badge-since">
                  <i className="fas fa-calendar-alt"></i>
                  {userData?.createdAt ? `عضو منذ عام ${new Date(userData.createdAt).getFullYear()}` : 'غير محدد'}
                </span>
              </div>
            </div>
          </div>
          <div className="profile-header-right">
              <div className="profile-header-stats">
              <div className="header-stat-item">
                <span className="header-stat-value">{fixedAvg} <i className="fas fa-star"></i></span>
                <span className="header-stat-label">تقييم العملاء</span>
                <span className="profile-stat-sub">({activeReviewCount} تقييم)</span>
              </div>
              <div className="header-stat-item">
                <span className="header-stat-value">{completedAppointments.length}</span>
                <span className="header-stat-label">الأعمال المنجزة</span>
              </div>
            </div>
          </div>
        </div>

        <div className="expert-tabs">
          {['user', 'working-hours', 'portfolio', 'security', 'address'].map((tab) => (
            <button key={tab} className={`tab-btn ${activeSetting === tab ? 'active' : ''}`} onClick={() => setActiveSetting(tab)}>
              {tab === 'user' && <><i className="fas fa-user-circle"></i> معلومات المستخدم</>}
              {tab === 'working-hours' && <><i className="fas fa-clock"></i> ساعات العمل</>}
              {tab === 'portfolio' && <><i className="fas fa-images"></i> معرض الأعمال والشهادات</>}
              {tab === 'security' && <><i className="fas fa-shield-alt"></i> الأمان</>}
              {tab === 'address' && <><i className="fas fa-map-marker-alt"></i> عنوان العمل</>}
            </button>
          ))}
        </div>

        <section className="profile-card-section profile-settings-detail">
          {activeSetting === 'user' && (
            <div className="settings-combined-container">
              <h4 className="settings-section-title">معلومات شخصية</h4>
              <div className="settings-detail-grid" style={{ marginBottom: '25px' }}>
                <div className="settings-field-group"><span className="settings-field-label">الاسم</span><span className="settings-field-value">{sanitizeText(getFirstName())}</span></div>
                <div className="settings-field-group"><span className="settings-field-label">الكنية</span><span className="settings-field-value">{sanitizeText(getLastName())}</span></div>
                <div className="settings-field-group"><span className="settings-field-label">اسم العمل</span><span className="settings-field-value">{sanitizeText(expertData?.businessName || 'غير محدد')}</span></div>
                <div className="settings-field-group">
                  <div className="settings-field-label-row">
                    <span className="settings-field-label">البريد الإلكتروني</span>
                    {emailVerified ? (
                      <span className="settings-email-status-inline verified" title="تم التحقق من البريد">
                        <span className="settings-email-status-dot verified"></span>
                        <span className="settings-email-status-text verified">تم التحقق</span>
                      </span>
                    ) : (
                      <span className="settings-email-status-inline unverified" title="لم يتم التحقق من البريد">
                        <span className="settings-email-status-dot unverified"></span>
                        <span className="settings-email-status-text unverified">لم يتم التحقق</span>
                      </span>
                    )}
                  </div>
                  <span className="settings-field-value">{sanitizeText(userData?.email || user?.email || 'غير محدد')}</span>
                </div>
                <div className="settings-field-group"><span className="settings-field-label">رقم الهاتف</span><span className="settings-field-value">{sanitizeText(userData?.phoneNumber || 'غير محدد')}</span></div>
              </div>
              <h4 className="settings-section-title">التعليم والخبرة</h4>
              <div className="settings-detail-grid" style={{ marginBottom: '25px' }}>
                <div className="settings-field-group"><span className="settings-field-label">الخبرة</span><span className="settings-field-value">{expertData?.experienceYears ?? 'غير محدد'} سنوات</span></div>
                <div className="settings-field-group"><span className="settings-field-label">التعليم</span><span className="settings-field-value">{sanitizeText(expertData?.educationInfo || 'غير محدد')}</span></div>
              </div>
              <h4 className="settings-section-title">التخصصات</h4>
              <div className="expert-price-range-banner">
                <div className="expert-price-range-banner__main">
                  <div className="expert-price-range-banner__icon" aria-hidden="true">
                    <i className="fas fa-coins"></i>
                  </div>
                  <div className="expert-price-range-banner__text">
                    <span className="expert-price-range-banner__label">نطاق السعر</span>
                    <span className="expert-price-range-banner__value">
                      الحد الأدنى {Number(expertData?.minPrice || 0).toLocaleString('ar-SY')} ل.س
                      {' - '}
                      الحد الأقصى {Number(expertData?.maxPrice || 0).toLocaleString('ar-SY')} ل.س
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  className="settings-secondary-button specialties-edit-btn"
                  onClick={() => setActiveModal('priceRange')}
                >
                  <i className="fas fa-pen" aria-hidden="true"></i> تعديل
                </button>
              </div>
              <div className="specialties-price-header">
                <p className="settings-helper-text specialties-price-header__hint">
                  يأخذ العملاء فكرة عن السعر عند مراجعة ملفك الشخصي.
                </p>
                <button
                  type="button"
                  className="settings-secondary-button specialties-edit-btn"
                  onClick={openSpecialtiesModal}
                >
                  <i className="fas fa-pen" aria-hidden="true"></i> تعديل
                </button>
              </div>

              {normalizeSpecialties(expertData?.specialties).length > 0 ? (
                <div className="specialties-price-table">
                  <div className="specialties-price-row specialties-price-head">
                    <div>التخصص</div>
                    <div>السعر</div>
                    <div></div>
                  </div>
                  {normalizeSpecialties(expertData?.specialties).map((s, i) => (
                    <div key={`${s.name}-${i}`} className="specialties-price-row">
                      <div className="specialties-price-name">{sanitizeText(s.name)}</div>
                      <div className="specialties-price-price">
                        {Number(s.startingPrice || 0).toLocaleString("ar-SY")} ل.س{" "}
                        <span className="specialties-price-muted">تبدأ من</span>
                      </div>
                      <div></div>
                    </div>
                  ))}
                </div>
              ) : (
                <span className="specialties-empty">غير محدد</span>
              )}
            </div>
          )}

          {activeSetting === 'working-hours' && (
            <div className="settings-working-hours">
              <h4 className="settings-section-title">برنامج العمل الأسبوعي</h4>
              <p className="settings-helper-text">يمكنك عرض ساعات عملك الأسبوعية أدناه.</p>
              {expertData?.workingHours && Object.values(expertData.workingHours).some(d => d.enabled) ? (
                <div className="working-hours-container">
                  {DAYS.map(day => {
                    const h = expertData.workingHours[day];
                    if (!h?.enabled) return null;
                    return (
                      <div key={day} className="working-hours-row">
                        <div className="working-hours-day"><i className="fas fa-calendar-day"></i>{getTurkishDayName(day)}</div>
                        <div className="working-hours-time"><span>{h.start} - {h.end}</span></div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="working-hours-empty-state">
                  <i className="fas fa-clock working-hours-empty-icon"></i>
                  <p>لم يتم تحديد ساعات عمل</p>
                </div>
              )}
              <div className="settings-save-row">
                <button className="settings-primary-button" onClick={() => setActiveModal('workingHours')}>
                  <i className="fas fa-edit"></i> تعديل ساعات العمل
                </button>
              </div>
            </div>
          )}

          {activeSetting === 'portfolio' && (
            <div className="settings-security">
              {portfolioError && <div className="error-banner"><i className="fas fa-exclamation-circle"></i> {sanitizeText(portfolioError)}</div>}
              <div className="settings-security-item portfolio-section">
                <div className="portfolio-section-header cert-section-head">
                  <div>
                    <div className="settings-security-title">الشهادات المرفوعة</div>
                  </div>
                </div>
                <div className="portfolio-thumbs">
                  {certificates.length > 0
                    ? certificates.map((url, i) => <PhotoThumb key={i} url={url} index={i} allUrls={certificates} size={120} height={80} />)
                    : <span className="portfolio-empty">لم يتم رفع أي شهادات بعد.</span>}
                </div>
              </div>

              <div className="settings-security-item portfolio-section">
                <div className="portfolio-section-header">
                  <div>
                    <div className="settings-security-title">معرض الأعمال (الصور)</div>
                    <div className="settings-security-subtitle">يتم عرض صور المتجر والأعمال المنجزة للعملاء.</div>
                  </div>
                  <label className={`portfolio-upload-label ${portfolioUploading ? 'portfolio-upload-label--disabled' : ''}`}>
                    <input type="file" accept="image/*" multiple style={{ display: 'none' }} disabled={portfolioUploading} onChange={handlePortfolioUpload} />
                    <span className={`settings-secondary-button portfolio-upload-btn ${portfolioUploading ? 'portfolio-upload-btn--loading' : ''}`}>
                      {portfolioUploading ? <><i className="fas fa-spinner fa-spin"></i> جاري الرفع...</> : 'إضافة جديد +'}
                    </span>
                  </label>
                </div>
                {portfolioLoading ? (
                  <span className="settings-helper-text"><i className="fas fa-spinner fa-spin"></i> جاري تحميل الصور...</span>
                ) : (
                  <div className="portfolio-thumbs">
                    {portfolioUrls.length > 0
                      ? portfolioUrls.map((url, i) => <PhotoThumb key={i} url={url} index={i} allUrls={portfolioUrls} onDelete={handlePortfolioDelete} size={120} height={120} />)
                      : <span className="portfolio-empty">لم يتم إضافة صور معرض الأعمال بعد.</span>}
                  </div>
                )}
              </div>

              <div className="settings-security-item portfolio-section ba-section-wrapper">
                <div className="portfolio-section-header">
                  <div>
                    <div className="settings-security-title">معرض قبل وبعد</div>
                    <div
                      className={`settings-security-subtitle ${
                        baGallery.length >= 5 ? "ba-subtitle-warning" : ""
                      }`}
                    >
                      {baGallery.length >= 5
                        ? `المعرض ممتلئ. احذف أحدها أو قم بتحديثه. (5 / 5 مجموعات) لا يمكن تحميل أكثر من 5 مجموعات.`
                        : `اعرض التغيير في أعمالك (${baGallery.length} / 5 مجموعات)`}
                    </div>
                  </div>
                  {baGallery.length < 5 && (
                    <button
                      className="settings-secondary-button portfolio-upload-btn"
                      onClick={() => setShowBaAddModal(true)}
                    >
                      إضافة جديد +
                    </button>
                  )}
                </div>

                {baLoading ? (
                  <span className="settings-helper-text"><i className="fas fa-spinner fa-spin"></i> جاري الرفع...</span>
                ) : (
                  <div className="ba-grid-container">
                    {baGallery.map((pair) => (
                      <div key={pair.id} className="ba-main-card" onClick={() => { setSelectedBaPair(pair); setShowBaViewModal(true); }}>
                        <div className="ba-card-header-title">{sanitizeText(pair.title)}</div>
                        <div className="ba-card-media">
                          <img src={pair.beforeUrl} className="ba-img-before" alt="Eski" />
                          <img src={pair.afterUrl} className="ba-img-after" alt="Yeni" />
                        </div>
                        <div className="ba-card-footer-labels">
                          <span className="label-eski">قبل</span>
                          <span className="label-yeni">بعد</span>
                        </div>
                      </div>
                    ))}
                    {baGallery.length === 0 && <span className="portfolio-empty">لم يتم إضافة أي أعمال بعد.</span>}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeSetting === 'security' && (
            <div className="settings-security">
              {passwordToast && (
                <div className="security-inline-success">
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
                يمكنك استخدام الإعدادات أدناه لزيادة أمان حساب الخبير الخاص بك والحفاظ على صحة التواصل مع العملاء.
              </p>

              <div className="settings-security-list">
                <div className="settings-security-item">
                  <div>
                    <div className="settings-security-title">تحديث الاسم والكنية</div>
                    <div className="settings-security-subtitle">قم بتحديث الاسم والكنية الشخصيين اللذين يظهران في ملفك الشخصي.</div>
                  </div>
                  <button className="settings-primary-button" onClick={() => setActiveModal('name')}>
                    تعديل
                  </button>
                </div>

                <div className="settings-security-item">
                  <div>
                    <div className="settings-security-title">تحديث رقم الهاتف</div>
                    <div className="settings-security-subtitle">اربط رقمك الجديد بالحساب بعد التحقق منه عبر رمز SMS.</div>
                  </div>
                  <button className="settings-secondary-button" onClick={() => setActiveModal('phone')}>
                    تعديل الهاتف
                  </button>
                </div>

                <div className="settings-security-item">
                  <div>
                    <div className="settings-security-title">حساب Google</div>
                    <div className="settings-security-subtitle">
                      يربط حساب Google الخاص بك لتسجيل الدخول بشكل أسرع.
                    </div>
                  </div>

                  {googleLinked ? (
                    <span className="settings-status-badge">
                      <i className="fab fa-google"></i> حساب Google مرتبط
                    </span>
                  ) : canLinkGoogle ? (
                    <button className="settings-primary-button" onClick={handleLinkGoogle} disabled={googleLinkLoading}>
                      {googleLinkLoading ? 'جاري الربط...' : 'ربط حساب Google'}
                    </button>
                  ) : (
                    <span className="settings-disabled-badge">
                      يمكن لمستخدمي Gmail فقط الربط
                    </span>
                  )}
                </div>

                <div className="settings-security-item">
                  <div>
                    <div className="settings-security-title">تغيير كلمة المرور</div>
                    <div className="settings-security-subtitle">
                      {hasPasswordProvider
                        ? 'يُنصح بتحديث كلمة مرور حسابك بشكل دوري.'
                        : 'يسجل هذا الحساب الدخول عبر Google وليس لديه كلمة مرور نشطة.'}
                    </div>
                  </div>

                  <span
                    title={hasPasswordProvider ? '' : 'يسجل هذا الحساب الدخول عبر Google وليس لديه كلمة مرور.'}
                    style={{ display: 'inline-flex' }}
                  >
                    <button
                      className="settings-primary-button"
                      onClick={() => setActiveModal('password')}
                      disabled={!hasPasswordProvider}
                      style={!hasPasswordProvider ? { opacity: 0.55, cursor: 'not-allowed' } : {}}
                    >
                      تغيير كلمة المرور
                    </button>
                  </span>
                </div>

                <div className="settings-security-item security-danger-row">
                  <div>
                    <div className="security-danger-title">تعطيل حسابي</div>
                    <div className="settings-security-subtitle">
                      سيتم تعطيل حسابك ويمكن استعادته خلال 60 يوماً. بعد 60 يوماً، سيتم حذفه نهائياً.
                    </div>
                  </div>
                  <button className="settings-danger-button" onClick={() => setActiveModal('deleteAccount')}>
                    تعطيل الحساب
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeSetting === 'address' && (
            <div className="settings-combined-container">
              <h4 className="settings-section-title">عنوان العمل الحالي</h4>
              
              {mainAddressData ? (
                <div className="address-display-card">
                  <div className="address-info-row">
                    <i className="fas fa-location-dot"></i>
                    <div>
                      <p className="address-full-text">{mainAddressData.addressName}</p>
                      <p className="address-sub-text">
                        {mainAddressData.neighborhood} {mainAddressData.street} No:{mainAddressData.buildingNo} 
                        Kat:{mainAddressData.floor} Daire:{mainAddressData.doorNo}
                      </p>
                      <p className="address-city-text">{mainAddressData.district} / {mainAddressData.city}</p>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="settings-helper-text">لم يتم العثور على عنوان عمل مسجل بعد.</p>
              )}

              <div className="address-request-section" style={{ marginTop: '30px' }}>
                
                {addressRequest?.status === 'REJECTED' && (
                  <div className="rejection-alert-box">
                    <div className="rejection-alert-title">
                      <i className="fas fa-exclamation-triangle"></i> تم رفض طلب تغيير العنوان
                    </div>
                    <p className="rejection-alert-reason">
                      <strong>سبب الرفض:</strong> {addressRequest.rejectionReason || "غير محدد."}
                    </p>
                  </div>
                )}

                <button 
                  className={`address-status-btn ${(!addressRequest || addressRequest.status === 'COMPLETED') ? 'primary' : addressRequest.status.toLowerCase()}`}
                  disabled={addressRequest?.status === 'PENDING'}
                  onClick={() => {
                    if (!addressRequest || addressRequest.status === 'REJECTED' || addressRequest.status === 'COMPLETED') {
                      setActiveModal('addressRequestModal');
                    } else if (addressRequest.status === 'APPROVED') {
                      setActiveModal('finalAddressUpdate');
                    }
                  }}
                >
                  {(!addressRequest || addressRequest?.status === 'COMPLETED') && (
                    <><i className="fas fa-file-signature"></i> طلب تغيير عنوان العمل</>
                  )}
                  
                  {addressRequest?.status === 'PENDING' && (
                    <><i className="fas fa-hourglass-half"></i> الطلب قيد المراجعة</>
                  )}
                  
                  {addressRequest?.status === 'APPROVED' && (
                    <><i className="fas fa-check-circle"></i> تم القبول! انقر للتحديث</>
                  )}
                  
                  {addressRequest?.status === 'REJECTED' && (
                    <><i className="fas fa-redo"></i> تم الرفض. أعد تقديم الطلب</>
                  )}
                </button>
              </div>
            </div>
          )}
        </section>

        <div className="profile-reviews-section">
          <section className="profile-card-section">
            <div className="section-header">
              <h3><i className="fas fa-star"></i> تقييمات العملاء</h3>
            </div>

            <div className="profile-reviews-summary">
              <div className="profile-reviews-summary__avg">
                المتوسط: <span className="profile-reviews-summary__score">{fixedAvg}</span>{' '}
                <i className="fas fa-star" aria-hidden="true"></i>
              </div>
              <div className="profile-reviews-summary__count">
                {activeReviewCount} تقييم
              </div>
            </div>

            {reviewsLoading ? (
              <div style={{ color: 'var(--text-muted)', padding: '12px 0' }}>
                <i className="fas fa-spinner fa-spin"></i> جاري تحميل التقييمات...
              </div>
            ) : reviews.length === 0 ? (
              <div className="working-hours-empty-state" style={{ padding: '22px 12px' }}>
                <i className="fas fa-comment-slash working-hours-empty-icon"></i>
                <p>لا توجد تقييمات بعد.</p>
              </div>
            ) : (
              <div className="orders-list">
                {reviews.map((r) => (
                  <div key={r.id} className="order-item job-item profile-review-item">
                    <div className="profile-review-item__body">
                      <div className="profile-review-item__head">
                        <div className="profile-review-stars" aria-label={`${r.rating || 0} yıldız`}>
                          {Array.from({ length: 5 }).map((_, i) => (
                            <i key={i} className="fas fa-star" style={{ opacity: i < Number(r.rating || 0) ? 1 : 0.25 }}></i>
                          ))}
                        </div>
                        <div className="profile-review-date">
                          {r.createdAt?.toDate ? r.createdAt.toDate().toLocaleDateString('ar-SY') : ''}
                        </div>
                      </div>
                      <div className="profile-review-comment">
                        {r.comment ? `“${sanitizeText(r.comment)}”` : <span className="profile-review-comment--empty">لم يتم إضافة تعليق.</span>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <button
              className="settings-secondary-button"
              style={{ width: '100%', marginTop: 12, padding: '12px', fontWeight: 'bold' }}
              onClick={() => navigate(`/uzman/${user.uid}?tab=reviews`)}
            >
              مشاهدة الكل (الملف الشخصي العام) →
            </button>
          </section>
        </div>
      </main>

      {showBaAddModal && (
        <Modal title="Öncesi ve Sonrası Ekle" onClose={() => setShowBaAddModal(false)}>
          <div className="ba-modal-content">
            <div className="modal-field">
              <label>İşlem Başlığı</label>
              <input
                type="text"
                placeholder="Örn: Mutfak Tezgah Yenileme"
                value={baForm.title}
                onChange={(e) => setBaForm({ ...baForm, title: e.target.value })}
              />
            </div>

            <div className="ba-upload-grid">
              <div className="ba-upload-item before">
                <span className="ba-upload-label" style={{ color: '#ef4444' }}>İŞLEM ÖNCESİ</span>
                <input
                  type="file"
                  accept="image/*"
                  className="ba-upload-input"
                  onChange={(e) => setBaForm({ ...baForm, beforeImage: e.target.files[0] })}
                />
              </div>
              <div className="ba-upload-item after">
                <span className="ba-upload-label" style={{ color: '#22c55e' }}>İŞLEM SONRASI</span>
                <input
                  type="file"
                  accept="image/*"
                  className="ba-upload-input"
                  onChange={(e) => setBaForm({ ...baForm, afterImage: e.target.files[0] })}
                />
              </div>
            </div>

            <div className="modal-actions" style={{ marginTop: '30px' }}>
              <button className="settings-secondary-button" onClick={() => setShowBaAddModal(false)} disabled={baUploading}>İptal</button>
              <button className="settings-primary-button" onClick={handleBAUpload} disabled={baUploading}>
                {baUploading ? <><i className="fas fa-spinner fa-spin"></i> Kaydediliyor...</> : 'Galeriyi Kaydet'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {showBaEditModal && (
        <Modal title="Galeriyi Düzenle" onClose={() => setShowBaEditModal(false)}>
          <div className="ba-modal-content ba-wider-modal">
            <div className="modal-field">
              <label>İşlem Başlığı</label>
              <input
                type="text"
                value={editBaForm.title}
                onChange={(e) => setEditBaForm({ ...editBaForm, title: e.target.value })}
              />
            </div>

            <div className="ba-upload-grid">
              <div className="ba-upload-item before">
                <span className="ba-upload-label" style={{ color: '#ef4444' }}>ESKİ HALİ (DEĞİŞTİR)</span>
                <input
                  type="file"
                  accept="image/*"
                  className="ba-upload-input"
                  onChange={(e) => setEditBaForm({ ...editBaForm, beforeImage: e.target.files[0] })}
                />
                <span style={{ fontSize: '10px', marginTop: '5px', color: '#94a3b8' }}>Değiştirmek istemiyorsanız boş bırakın</span>
              </div>
              <div className="ba-upload-item after">
                <span className="ba-upload-label" style={{ color: '#22c55e' }}>YENİ HALİ (DEĞİŞTİR)</span>
                <input
                  type="file"
                  accept="image/*"
                  className="ba-upload-input"
                  onChange={(e) => setEditBaForm({ ...editBaForm, afterImage: e.target.files[0] })}
                />
                <span style={{ fontSize: '10px', marginTop: '5px', color: '#94a3b8' }}>Değiştirmek istemiyorsanız boş bırakın</span>
              </div>
            </div>

            <div className="modal-actions" style={{ marginTop: '30px' }}>
              <button className="settings-secondary-button" onClick={() => setShowBaEditModal(false)} disabled={baUploading}>İptal</button>
              <button className="settings-primary-button" onClick={handleBAUpdate} disabled={baUploading}>
                {baUploading ? <><i className="fas fa-spinner fa-spin"></i> Güncelleniyor...</> : 'Değişiklikleri Kaydet'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {showBaViewModal && selectedBaPair && (
        <div className="ba-view-overlay" onClick={() => setShowBaViewModal(false)}>
          <div className="ba-view-container" onClick={e => e.stopPropagation()}>
            <div className="ba-view-header">
              <div className="ba-view-header-center">
                <h2>{sanitizeText(selectedBaPair.title)}</h2>
              </div>
              <div className="ba-view-header-right">
                <button className="ba-btn-action ba-btn-delete" onClick={() => handleBADelete(selectedBaPair.id)}>
                  <i className="fas fa-trash mr-1"></i> Sil
                </button>
                <button
                  className="ba-btn-action ba-btn-edit"
                  onClick={() => {
                    setEditBaForm({ title: selectedBaPair.title, beforeImage: null, afterImage: null });
                    setShowBaEditModal(true);
                    setShowBaViewModal(false);
                  }}
                >
                  <i className="fas fa-edit mr-1"></i> Düzenle
                </button>
                <button className="ba-btn-close-circle" onClick={() => setShowBaViewModal(false)}>
                  <i className="fas fa-times"></i>
                </button>
              </div>
            </div>

            <div className="ba-view-content">
              <div className="ba-view-side">
                <div className="ba-view-label-large label-eski-bg">ESKİ HALİ</div>
                <div
                  className="ba-zoom-wrapper"
                  onWheel={(e) => handleWheelZoom(e, 'before')}
                  onMouseDown={(e) => handlePanStart(e, 'before')}
                >
                  <img
                    src={selectedBaPair.beforeUrl}
                    className="ba-zoom-img"
                    alt="Before"
                    style={{
                      transform: `scale(${zoomState.before.scale}) translate(${zoomState.before.panning.x}px, ${zoomState.before.panning.y}px)`,
                      cursor: zoomState.before.isDragging ? 'grabbing' : 'grab'
                    }}
                  />
                </div>
              </div>

              <div className="ba-view-side">
                <div className="ba-view-label-large label-yeni-bg">YENİ HALİ</div>
                <div
                  className="ba-zoom-wrapper"
                  onWheel={(e) => handleWheelZoom(e, 'after')}
                  onMouseDown={(e) => handlePanStart(e, 'after')}
                >
                  <img
                    src={selectedBaPair.afterUrl}
                    className="ba-zoom-img"
                    alt="After"
                    style={{
                      transform: `scale(${zoomState.after.scale}) translate(${zoomState.after.panning.x}px, ${zoomState.after.panning.y}px)`,
                      cursor: zoomState.after.isDragging ? 'grabbing' : 'grab'
                    }}
                  />
                </div>
              </div>
            </div>

            <div className="ba-view-footer-hint">
              <i className="fas fa-mouse mr-2"></i> Tekerlek ile yakınlaşın, basılı tutup sürükleyin.
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={showPortfolioDeleteConfirm}
        onClose={() => {
          setShowPortfolioDeleteConfirm(false);
          setPortfolioUrlToDelete(null);
        }}
        onConfirm={confirmPortfolioDelete}
        title="Fotoğrafı Sil"
        message="Bu fotoğrafı silmek istediğinize emin misiniz? Bu işlem geri alınamaz."
        confirmText="Evet, Sil"
        cancelText="Vazgeç"
        type="danger"
      />

      <ConfirmModal
        isOpen={showBaDeleteConfirm}
        onClose={() => {
          setShowBaDeleteConfirm(false);
          setBaIdToDelete(null);
        }}
        onConfirm={confirmBaDelete}
        title="Galeriyi Sil"
        message="Bu galeriyi silmek istediğinize emin misiniz? Bu işlem geri alınamaz."
        confirmText="Evet, Sil"
        cancelText="Vazgeç"
        type="danger"
      />
    </div>
  );
};

export default ExpertProfilePage;

/*
REMOVED BLOCKS FOR SYRIA LAUNCH:
1. Recent Jobs ("Son İşlerim") section.
2. ID Document ("kimlik belgesi") display / "Yasal Belgeler" section was simplified to only show certificates.
*/