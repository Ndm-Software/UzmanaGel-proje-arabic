import React, { useState, useEffect } from 'react';
import { doc, getDoc, updateDoc, setDoc } from 'firebase/firestore';
import { db, auth } from '../../firebase/firebaseClient';
import { updatePassword, EmailAuthProvider, reauthenticateWithCredential, updateProfile } from 'firebase/auth';
import { useAdminOnly } from '../../hooks/useAuthGuard';
import LoadingSpinner from '../../components/LoadingSpinner';
import DOMPurify from 'dompurify';
import '../../styles/admin/AdminSettings.css';

const isDevelopment = process.env.NODE_ENV === 'development';

const sanitizeText = (text, maxLength = 200) => {
  if (!text) return '-';
  const sanitized = DOMPurify.sanitize(String(text));
  return sanitized.length > maxLength ? sanitized.slice(0, maxLength) + '...' : sanitized;
};

const safeNumber = (value, defaultValue = 0) => {
  const num = Number(value);
  return isNaN(num) ? defaultValue : num;
};

const isValidEmail = (email) => {
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return emailRegex.test(String(email || '').trim());
};

const isValidPhone = (phone) => {
  const cleaned = String(phone || '').replace(/\D/g, '');
  if (cleaned.length === 12 && cleaned.startsWith('963')) {
    return true;
  }
  if (cleaned.length === 9 && cleaned.startsWith('9')) {
    return true;
  }
  if (cleaned.length === 12 && cleaned.startsWith('90')) {
    return true;
  }
  if (cleaned.length === 10 && cleaned.startsWith('5')) {
    return true;
  }
  return false;
};

let passwordAttempts = 0;
let lastAttemptTime = 0;

const isRateLimited = () => {
  const now = Date.now();
  if (now - lastAttemptTime > 60000) {
    passwordAttempts = 0;
    lastAttemptTime = now;
    return false;
  }
  if (passwordAttempts >= 5) {
    return true;
  }
  return false;
};

const recordPasswordAttempt = () => {
  const now = Date.now();
  if (now - lastAttemptTime > 60000) {
    passwordAttempts = 1;
  } else {
    passwordAttempts++;
  }
  lastAttemptTime = now;
};

const showToast = (message, type) => {
  const toast = document.createElement('div');
  toast.className = `admin-toast ${type}`;
  toast.innerHTML = `<i class="fas ${type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle'}"></i> ${sanitizeText(message, 100)}`;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
};

export default function AdminSettings() {
  const { authorized, loading: authLoading } = useAdminOnly();
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  const [siteSettings, setSiteSettings] = useState({
    contactEmail: 'info@uzmanagel.com',
    phone: '+90 555 123 4567',
    address: 'İstanbul, Türkiye',
    maintenanceMode: false,
    registrationsOpen: true,
  });
  
  const [priceSettings, setPriceSettings] = useState({
    tokenPrice: 50,
  });
  
  const [adminProfile, setAdminProfile] = useState({
    displayName: '',
    email: '',
  });
  
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [passwordError, setPasswordError] = useState('');
  const [updatingPassword, setUpdatingPassword] = useState(false);
  
  const [activeSection, setActiveSection] = useState('site');

  useEffect(() => {
    if (authorized) {
      loadSettings();
      loadPriceSettings();
      loadAdminProfile();
    }
  }, [authorized]);

  const loadSettings = async () => {
    try {
      const settingsRef = doc(db, 'admin_settings', 'site');
      const settingsSnap = await getDoc(settingsRef);
      
      if (settingsSnap.exists()) {
        const data = settingsSnap.data();
        setSiteSettings(prev => ({
          ...prev,
          contactEmail: data.contactEmail && isValidEmail(data.contactEmail) ? data.contactEmail : prev.contactEmail,
          phone: data.phone && isValidPhone(data.phone) ? data.phone : prev.phone,
          address: data.address ? sanitizeText(data.address, 500) : prev.address,
          maintenanceMode: typeof data.maintenanceMode === 'boolean' ? data.maintenanceMode : prev.maintenanceMode,
          registrationsOpen: typeof data.registrationsOpen === 'boolean' ? data.registrationsOpen : prev.registrationsOpen,
        }));
      } else {
        await setDoc(settingsRef, {
          ...siteSettings,
          createdAt: new Date().toISOString(),
        });
      }
    } catch (error) {
      if (isDevelopment) console.error('Ayarlar yüklenirken hata:', error);
      showToast('تعذر تحميل الإعدادات، تم استخدام القيم الافتراضية', 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadPriceSettings = async () => {
    try {
      const priceRef = doc(db, 'admin_settings', 'pricing');
      const priceSnap = await getDoc(priceRef);
      
      if (priceSnap.exists()) {
        const data = priceSnap.data();
        const tokenPrice = safeNumber(data.tokenPrice);
        if (tokenPrice >= 1 && tokenPrice <= 10000) {
          setPriceSettings({ tokenPrice });
        }
      } else {
        await setDoc(priceRef, {
          ...priceSettings,
          createdAt: new Date().toISOString(),
        });
      }
    } catch (error) {
      if (isDevelopment) console.error('Fiyat ayarları yüklenirken hata:', error);
      showToast('تعذر تحميل إعدادات الأسعار، تم استخدام القيم الافتراضية', 'error');
    }
  };

  const loadAdminProfile = async () => {
    try {
      const user = auth.currentUser;
      if (user) {
        setAdminProfile({
          displayName: sanitizeText(user.displayName || 'Admin', 100),
          email: user.email || '',
        });
      }
    } catch (error) {
      if (isDevelopment) console.error('Profil yüklenirken hata:', error);
    }
  };

  const handleSiteSettingChange = (e) => {
    const { name, value, type, checked } = e.target;
    
    if (name === 'contactEmail') {
      const trimmedValue = value.trim();
      if (trimmedValue && !isValidEmail(trimmedValue)) {
        showToast('يرجى إدخال عنوان بريد إلكتروني صالح!', 'error');
        return;
      }
      setSiteSettings(prev => ({ ...prev, [name]: sanitizeText(trimmedValue, 100) }));
    } else if (name === 'phone') {
      const cleanedValue = value.replace(/\D/g, '');
      if (cleanedValue && !isValidPhone(cleanedValue)) {
        showToast('يرجى إدخال رقم هاتف صالح!', 'error');
        return;
      }
      let formattedValue = cleanedValue;
      if (cleanedValue.length === 9) {
        formattedValue = `+963 ${cleanedValue.slice(0, 3)} ${cleanedValue.slice(3, 6)} ${cleanedValue.slice(6, 9)}`;
      } else if (cleanedValue.length === 12 && cleanedValue.startsWith('963')) {
        const national = cleanedValue.slice(3);
        formattedValue = `+963 ${national.slice(0, 3)} ${national.slice(3, 6)} ${national.slice(6, 9)}`;
      } else if (cleanedValue.length === 10) {
        formattedValue = `+90 ${cleanedValue.slice(0, 3)} ${cleanedValue.slice(3, 6)} ${cleanedValue.slice(6, 8)} ${cleanedValue.slice(8, 10)}`;
      } else if (cleanedValue.length === 12 && cleanedValue.startsWith('90')) {
        const national = cleanedValue.slice(2);
        formattedValue = `+90 ${national.slice(0, 3)} ${national.slice(3, 6)} ${national.slice(6, 8)} ${national.slice(8, 10)}`;
      }
      setSiteSettings(prev => ({ ...prev, [name]: sanitizeText(formattedValue, 50) }));
    } else if (name === 'address') {
      setSiteSettings(prev => ({ ...prev, [name]: sanitizeText(value, 500) }));
    } else if (type === 'checkbox') {
      setSiteSettings(prev => ({ ...prev, [name]: checked }));
    }
  };

  const handlePriceSettingChange = (e) => {
    const { name, value } = e.target;
    let numValue = safeNumber(value);
    if (numValue < 1) numValue = 1;
    if (numValue > 10000) numValue = 10000;
    setPriceSettings(prev => ({ ...prev, [name]: numValue }));
  };

  const handleAdminProfileChange = (e) => {
    const { name, value } = e.target;
    setAdminProfile(prev => ({ ...prev, [name]: sanitizeText(value, 100) }));
  };

  const handlePasswordChange = (e) => {
    const { name, value } = e.target;
    setPasswordData(prev => ({ ...prev, [name]: value.slice(0, 100) }));
    setPasswordError('');
  };

  const saveSiteSettings = async () => {
    if (!isValidEmail(siteSettings.contactEmail)) {
      showToast('يرجى إدخال عنوان بريد إلكتروني صالح!', 'error');
      return;
    }
    
    if (!isValidPhone(siteSettings.phone)) {
      showToast('يرجى إدخال رقم هاتف صالح!', 'error');
      return;
    }
    
    setSaving(true);
    try {
      const settingsRef = doc(db, 'admin_settings', 'site');
      await updateDoc(settingsRef, {
        contactEmail: siteSettings.contactEmail.toLowerCase(),
        phone: siteSettings.phone,
        address: siteSettings.address,
        maintenanceMode: siteSettings.maintenanceMode,
        registrationsOpen: siteSettings.registrationsOpen,
        updatedAt: new Date().toISOString(),
      });
      showToast('تم حفظ إعدادات الموقع!', 'success');
    } catch (error) {
      if (isDevelopment) console.error('Ayarlar kaydedilirken hata:', error);
      showToast('تعذر حفظ الإعدادات!', 'error');
    } finally {
      setSaving(false);
    }
  };

  const savePriceSettings = async () => {
    setSaving(true);
    try {
      const priceRef = doc(db, 'admin_settings', 'pricing');
      await updateDoc(priceRef, {
        tokenPrice: priceSettings.tokenPrice,
        updatedAt: new Date().toISOString(),
      });
      showToast('تم حفظ إعدادات الرصيد!', 'success');
    } catch (error) {
      if (isDevelopment) console.error('Jeton ayarları kaydedilirken hata:', error);
      showToast('تعذر حفظ إعدادات الرصيد!', 'error');
    } finally {
      setSaving(false);
    }
  };

  const updateAdminProfile = async () => {
    if (!adminProfile.displayName.trim()) {
      showToast('يرجى إدخال الاسم والكنية!', 'error');
      return;
    }
    
    setSaving(true);
    try {
      const user = auth.currentUser;
      if (!user) {
        showToast('لم يتم العثور على الجلسة!', 'error');
        return;
      }
      
      await updateProfile(user, {
        displayName: sanitizeText(adminProfile.displayName, 100)
      });
      
      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, {
        displayName: sanitizeText(adminProfile.displayName, 100),
        updatedAt: new Date().toISOString()
      });
      
      showToast('تم تحديث معلومات الملف الشخصي!', 'success');
    } catch (error) {
      if (isDevelopment) console.error('Profil güncellenirken hata:', error);
      showToast('تعذر تحديث الملف الشخصي: ' + error.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const updateAdminPassword = async () => {
    if (isRateLimited()) {
      setPasswordError('الكثير من المحاولات الفاشلة. يرجى الانتظار دقيقة واحدة.');
      return;
    }
    
    if (!passwordData.currentPassword) {
      setPasswordError('يرجى إدخال كلمة المرور الحالية!');
      recordPasswordAttempt();
      return;
    }
    
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      setPasswordError('كلمات المرور الجديدة غير متطابقة!');
      recordPasswordAttempt();
      return;
    }
    
    if (passwordData.newPassword.length < 6) {
      setPasswordError('يجب أن تتكون كلمة المرور من 6 أحرف على الأقل!');
      recordPasswordAttempt();
      return;
    }
    
    if (passwordData.newPassword.length > 100) {
      setPasswordError('كلمة المرور طويلة جداً!');
      recordPasswordAttempt();
      return;
    }
    
    setUpdatingPassword(true);
    setPasswordError('');
    
    try {
      const user = auth.currentUser;
      if (!user || !user.email) {
        setPasswordError('تعذر العثور على معلومات الجلسة. يرجى تسجيل الدخول مرة أخرى.');
        recordPasswordAttempt();
        return;
      }
      
      const credential = EmailAuthProvider.credential(
        user.email,
        passwordData.currentPassword
      );
      
      await reauthenticateWithCredential(user, credential);
      await updatePassword(user, passwordData.newPassword);
      
      setPasswordData({
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
      });
      passwordAttempts = 0;
      showToast('تم تغيير كلمة المرور بنجاح!', 'success');
      
    } catch (error) {
      if (isDevelopment) console.error('Şifre değiştirme hatası:', error);
      recordPasswordAttempt();
      
      switch (error.code) {
        case 'auth/wrong-password':
        case 'auth/invalid-credential':
          setPasswordError('كلمة المرور الحالية غير صحيحة!');
          break;
        case 'auth/requires-recent-login':
          setPasswordError('يتعين عليك تسجيل الدخول مرة أخرى لأسباب أمنية. يرجى تسجيل الخروج ثم الدخول مجدداً.');
          break;
        default:
          setPasswordError('تعذر تغيير كلمة المرور: ' + (error.message || 'خطأ غير معروف'));
      }
    } finally {
      setUpdatingPassword(false);
    }
  };

  if (authLoading || loading) {
    return <LoadingSpinner text="جاري تحميل الإعدادات..." />;
  }

  if (!authorized) {
    return (
      <div className="no-data">
        <i className="fas fa-shield-alt fa-3x"></i>
        <p>ليس لديك صلاحية للوصول إلى هذه الصفحة.</p>
      </div>
    );
  }

  return (
    <div className="admin-settings">
      <div className="settings-tabs">
        <button 
          className={`settings-tab-btn ${activeSection === 'site' ? 'active' : ''}`}
          onClick={() => setActiveSection('site')}
        >
          <i className="fas fa-globe"></i> إعدادات الموقع
        </button>
        <button 
          className={`settings-tab-btn ${activeSection === 'pricing' ? 'active' : ''}`}
          onClick={() => setActiveSection('pricing')}
        >
          <i className="fas fa-coins"></i> إعدادات النقاط
        </button>
        <button 
          className={`settings-tab-btn ${activeSection === 'profile' ? 'active' : ''}`}
          onClick={() => setActiveSection('profile')}
        >
          <i className="fas fa-user-shield"></i> ملف المسؤول
        </button>
        <button 
          className={`settings-tab-btn ${activeSection === 'password' ? 'active' : ''}`}
          onClick={() => setActiveSection('password')}
        >
          <i className="fas fa-key"></i> تغيير كلمة المرور
        </button>
      </div>

      <div className="settings-content-wrapper">
        {activeSection === 'site' && (
          <div className="settings-card">
            <div className="card-header">
              <h3><i className="fas fa-globe"></i> إعدادات الموقع</h3>
            </div>
            
            <div className="card-body">
              <div className="form-group">
                <label>البريد الإلكتروني للتواصل</label>
                <input
                  type="email"
                  name="contactEmail"
                  value={siteSettings.contactEmail}
                  onChange={handleSiteSettingChange}
                  className="form-input"
                  maxLength={100}
                />
                <small className="form-hint">البريد الإلكتروني للتواصل الخاص بالموقع</small>
              </div>

              <div className="form-group">
                <label>الهاتف</label>
                <input
                  type="tel"
                  name="phone"
                  value={siteSettings.phone}
                  onChange={handleSiteSettingChange}
                  className="form-input"
                  maxLength={20}
                />
                <small className="form-hint">رقم هاتف التواصل</small>
              </div>

              <div className="form-group">
                <label>العنوان</label>
                <textarea
                  name="address"
                  value={siteSettings.address}
                  onChange={handleSiteSettingChange}
                  className="form-textarea"
                  rows={2}
                  maxLength={500}
                />
                <small className="form-hint">عنوان الشركة/المكتب</small>
              </div>

              <div className="form-group checkbox-group">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    name="maintenanceMode"
                    checked={siteSettings.maintenanceMode}
                    onChange={handleSiteSettingChange}
                  />
                  <span>وضع الصيانة (يغلق الموقع مؤقتاً)</span>
                </label>
              </div>

              <div className="form-group checkbox-group">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    name="registrationsOpen"
                    checked={siteSettings.registrationsOpen}
                    onChange={handleSiteSettingChange}
                  />
                  <span>فتح التسجيل الجديد</span>
                </label>
              </div>

              <button 
                className="save-btn" 
                onClick={saveSiteSettings} 
                disabled={saving}
              >
                {saving ? <><i className="fas fa-spinner fa-spin"></i> جاري الحفظ...</> : 'حفظ الإعدادات'}
              </button>
            </div>
          </div>
        )}

        {activeSection === 'pricing' && (
          <div className="settings-card">
            <div className="card-header">
              <h3><i className="fas fa-coins"></i> إعدادات النقاط</h3>
            </div>
            
            <div className="card-body">
              <div className="form-group">
                <label>سعر النقطة الواحدة (ل.س)</label>
                <input
                  type="number"
                  name="tokenPrice"
                  value={priceSettings.tokenPrice}
                  onChange={handlePriceSettingChange}
                  className="form-input"
                  min="1"
                  max="10000"
                  step="1"
                />
                <small className="form-hint">1 نقطة = {priceSettings.tokenPrice} ل.س</small>
                <small className="form-hint warning-hint">
                  <i className="fas fa-info-circle"></i> عند تغيير سعر النقاط، سيتم إجراء عمليات الشراء الجديدة بهذا السعر. لن تتأثر النقاط الحالية.
                </small>
              </div>

              <div className="info-box">
                <i className="fas fa-info-circle"></i>
                <div>
                  <strong>معلومات:</strong> هذه الإعدادات تسري على مستوى النظام بالكامل. 
                  عند تغيير سعر النقاط، سيتم شراء <strong>النقاط الجديدة</strong> بناءً على هذا السعر.
                </div>
              </div>

              <button 
                className="save-btn" 
                onClick={savePriceSettings} 
                disabled={saving}
              >
                {saving ? <><i className="fas fa-spinner fa-spin"></i> جاري الحفظ...</> : 'حفظ الإعدادات'}
              </button>
            </div>
          </div>
        )}

        {activeSection === 'profile' && (
          <div className="settings-card">
            <div className="card-header">
              <h3><i className="fas fa-user-shield"></i> ملف المسؤول</h3>
            </div>
            
            <div className="card-body">
              <div className="form-group">
                <label>الاسم والكنية</label>
                <input
                  type="text"
                  name="displayName"
                  value={adminProfile.displayName}
                  onChange={handleAdminProfileChange}
                  className="form-input"
                  maxLength={100}
                />
              </div>

              <div className="form-group">
                <label>البريد الإلكتروني</label>
                <input
                  type="email"
                  name="email"
                  value={adminProfile.email}
                  disabled
                  className="form-input disabled"
                />
                <small className="form-hint">لا يمكن تغيير عنوان البريد الإلكتروني.</small>
              </div>

              <button 
                className="save-btn" 
                onClick={updateAdminProfile} 
                disabled={saving}
              >
                {saving ? <><i className="fas fa-spinner fa-spin"></i> جاري الحفظ...</> : 'تحديث الملف الشخصي'}
              </button>
            </div>
          </div>
        )}

        {activeSection === 'password' && (
          <div className="settings-card">
            <div className="card-header">
              <h3><i className="fas fa-key"></i> تغيير كلمة المرور</h3>
            </div>
            
            <div className="card-body">
              {passwordError && (
                <div className="error-message">
                  <i className="fas fa-exclamation-triangle"></i> {passwordError}
                </div>
              )}

              <div className="form-group">
                <label>كلمة المرور الحالية</label>
                <input
                  type="password"
                  name="currentPassword"
                  value={passwordData.currentPassword}
                  onChange={handlePasswordChange}
                  className="form-input"
                  placeholder="أدخل كلمة المرور الحالية"
                  maxLength={100}
                />
              </div>

              <div className="form-group">
                <label>كلمة المرور الجديدة</label>
                <input
                  type="password"
                  name="newPassword"
                  value={passwordData.newPassword}
                  onChange={handlePasswordChange}
                  className="form-input"
                  placeholder="أدخل كلمة المرور الجديدة (6 أحرف على الأقل)"
                  maxLength={100}
                />
              </div>

              <div className="form-group">
                <label>تأكيد كلمة المرور الجديدة</label>
                <input
                  type="password"
                  name="confirmPassword"
                  value={passwordData.confirmPassword}
                  onChange={handlePasswordChange}
                  className="form-input"
                  placeholder="أعد إدخال كلمة المرور الجديدة"
                  maxLength={100}
                />
              </div>

              <button 
                className="save-btn" 
                onClick={updateAdminPassword} 
                disabled={updatingPassword}
              >
                {updatingPassword ? <><i className="fas fa-spinner fa-spin"></i> جاري التغيير...</> : 'تغيير كلمة المرور'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}