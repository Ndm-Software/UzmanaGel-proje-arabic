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
      showToast('Ayarlar yüklenemedi, varsayılan değerler kullanılıyor', 'error');
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
      showToast('Fiyat ayarları yüklenemedi, varsayılan değerler kullanılıyor', 'error');
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
        showToast('Geçerli bir e-posta adresi girin!', 'error');
        return;
      }
      setSiteSettings(prev => ({ ...prev, [name]: sanitizeText(trimmedValue, 100) }));
    } else if (name === 'phone') {
      const cleanedValue = value.replace(/\D/g, '');
      if (cleanedValue && !isValidPhone(cleanedValue)) {
        showToast('Geçerli bir telefon numarası girin!', 'error');
        return;
      }
      let formattedValue = cleanedValue;
      if (cleanedValue.length === 10) {
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
      showToast('Geçerli bir e-posta adresi girin!', 'error');
      return;
    }
    
    if (!isValidPhone(siteSettings.phone)) {
      showToast('Geçerli bir telefon numarası girin!', 'error');
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
      showToast('Site ayarları kaydedildi!', 'success');
    } catch (error) {
      if (isDevelopment) console.error('Ayarlar kaydedilirken hata:', error);
      showToast('Ayarlar kaydedilemedi!', 'error');
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
      showToast('Jeton ayarları kaydedildi!', 'success');
    } catch (error) {
      if (isDevelopment) console.error('Jeton ayarları kaydedilirken hata:', error);
      showToast('Jeton ayarları kaydedilemedi!', 'error');
    } finally {
      setSaving(false);
    }
  };

  const updateAdminProfile = async () => {
    if (!adminProfile.displayName.trim()) {
      showToast('Lütfen ad soyad girin!', 'error');
      return;
    }
    
    setSaving(true);
    try {
      const user = auth.currentUser;
      if (!user) {
        showToast('Oturum bulunamadı!', 'error');
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
      
      showToast('Profil bilgileri güncellendi!', 'success');
    } catch (error) {
      if (isDevelopment) console.error('Profil güncellenirken hata:', error);
      showToast('Profil güncellenemedi: ' + error.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const updateAdminPassword = async () => {
    if (isRateLimited()) {
      setPasswordError('Çok fazla başarısız deneme. Lütfen 1 dakika bekleyin.');
      return;
    }
    
    if (!passwordData.currentPassword) {
      setPasswordError('Lütfen mevcut şifrenizi girin!');
      recordPasswordAttempt();
      return;
    }
    
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      setPasswordError('Yeni şifreler eşleşmiyor!');
      recordPasswordAttempt();
      return;
    }
    
    if (passwordData.newPassword.length < 6) {
      setPasswordError('Şifre en az 6 karakter olmalıdır!');
      recordPasswordAttempt();
      return;
    }
    
    if (passwordData.newPassword.length > 100) {
      setPasswordError('Şifre çok uzun!');
      recordPasswordAttempt();
      return;
    }
    
    setUpdatingPassword(true);
    setPasswordError('');
    
    try {
      const user = auth.currentUser;
      if (!user || !user.email) {
        setPasswordError('Oturum bilgisi bulunamadı. Lütfen tekrar giriş yapın.');
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
      showToast('Şifre başarıyla değiştirildi!', 'success');
      
    } catch (error) {
      if (isDevelopment) console.error('Şifre değiştirme hatası:', error);
      recordPasswordAttempt();
      
      switch (error.code) {
        case 'auth/wrong-password':
        case 'auth/invalid-credential':
          setPasswordError('Mevcut şifreniz yanlış!');
          break;
        case 'auth/requires-recent-login':
          setPasswordError('Güvenlik nedeniyle tekrar giriş yapmanız gerekiyor. Lütfen çıkış yapıp tekrar giriş yapın.');
          break;
        default:
          setPasswordError('Şifre değiştirilemedi: ' + (error.message || 'Bilinmeyen hata'));
      }
    } finally {
      setUpdatingPassword(false);
    }
  };

  if (authLoading || loading) {
    return <LoadingSpinner text="Ayarlar yükleniyor..." />;
  }

  if (!authorized) {
    return (
      <div className="no-data">
        <i className="fas fa-shield-alt fa-3x"></i>
        <p>Bu sayfaya erişim yetkiniz yok.</p>
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
          <i className="fas fa-globe"></i> Site Ayarları
        </button>
        <button 
          className={`settings-tab-btn ${activeSection === 'pricing' ? 'active' : ''}`}
          onClick={() => setActiveSection('pricing')}
        >
          <i className="fas fa-coins"></i> Jeton Ayarları
        </button>
        <button 
          className={`settings-tab-btn ${activeSection === 'profile' ? 'active' : ''}`}
          onClick={() => setActiveSection('profile')}
        >
          <i className="fas fa-user-shield"></i> Admin Profil
        </button>
        <button 
          className={`settings-tab-btn ${activeSection === 'password' ? 'active' : ''}`}
          onClick={() => setActiveSection('password')}
        >
          <i className="fas fa-key"></i> Şifre Değiştir
        </button>
      </div>

      <div className="settings-content-wrapper">
        {activeSection === 'site' && (
          <div className="settings-card">
            <div className="card-header">
              <h3><i className="fas fa-globe"></i> Site Ayarları</h3>
            </div>
            
            <div className="card-body">
              <div className="form-group">
                <label>İletişim E-posta</label>
                <input
                  type="email"
                  name="contactEmail"
                  value={siteSettings.contactEmail}
                  onChange={handleSiteSettingChange}
                  className="form-input"
                  maxLength={100}
                />
                <small className="form-hint">Site iletişim e-posta adresi</small>
              </div>

              <div className="form-group">
                <label>Telefon</label>
                <input
                  type="tel"
                  name="phone"
                  value={siteSettings.phone}
                  onChange={handleSiteSettingChange}
                  className="form-input"
                  maxLength={20}
                />
                <small className="form-hint">İletişim telefon numarası</small>
              </div>

              <div className="form-group">
                <label>Adres</label>
                <textarea
                  name="address"
                  value={siteSettings.address}
                  onChange={handleSiteSettingChange}
                  className="form-textarea"
                  rows={2}
                  maxLength={500}
                />
                <small className="form-hint">Şirket/Ofis adresi</small>
              </div>

              <div className="form-group checkbox-group">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    name="maintenanceMode"
                    checked={siteSettings.maintenanceMode}
                    onChange={handleSiteSettingChange}
                  />
                  <span>Bakım Modu (Siteyi geçici olarak kapatır)</span>
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
                  <span>Yeni Kayıtlara Açık</span>
                </label>
              </div>

              <button 
                className="save-btn" 
                onClick={saveSiteSettings} 
                disabled={saving}
              >
                {saving ? <><i className="fas fa-spinner fa-spin"></i> Kaydediliyor...</> : 'Ayarları Kaydet'}
              </button>
            </div>
          </div>
        )}

        {activeSection === 'pricing' && (
          <div className="settings-card">
            <div className="card-header">
              <h3><i className="fas fa-coins"></i> Jeton Ayarları</h3>
            </div>
            
            <div className="card-body">
              <div className="form-group">
                <label>1 Jeton Fiyatı (₺)</label>
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
                <small className="form-hint">1 Jeton = {priceSettings.tokenPrice} TL</small>
                <small className="form-hint warning-hint">
                  <i className="fas fa-info-circle"></i> Jeton fiyatı değiştiğinde, yeni satın alımlar bu fiyat üzerinden yapılır. Mevcut jetonlar etkilenmez.
                </small>
              </div>

              <div className="info-box">
                <i className="fas fa-info-circle"></i>
                <div>
                  <strong>Bilgi:</strong> Bu ayarlar sistem genelinde geçerlidir. 
                  Jeton fiyatı değiştiğinde <strong>yeni satın alımlar</strong> bu fiyat üzerinden yapılır.
                </div>
              </div>

              <button 
                className="save-btn" 
                onClick={savePriceSettings} 
                disabled={saving}
              >
                {saving ? <><i className="fas fa-spinner fa-spin"></i> Kaydediliyor...</> : 'Ayarları Kaydet'}
              </button>
            </div>
          </div>
        )}

        {activeSection === 'profile' && (
          <div className="settings-card">
            <div className="card-header">
              <h3><i className="fas fa-user-shield"></i> Admin Profil</h3>
            </div>
            
            <div className="card-body">
              <div className="form-group">
                <label>Ad Soyad</label>
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
                <label>E-posta Adresi</label>
                <input
                  type="email"
                  name="email"
                  value={adminProfile.email}
                  disabled
                  className="form-input disabled"
                />
                <small className="form-hint">E-posta adresi değiştirilemez.</small>
              </div>

              <button 
                className="save-btn" 
                onClick={updateAdminProfile} 
                disabled={saving}
              >
                {saving ? <><i className="fas fa-spinner fa-spin"></i> Kaydediliyor...</> : 'Profili Güncelle'}
              </button>
            </div>
          </div>
        )}

        {activeSection === 'password' && (
          <div className="settings-card">
            <div className="card-header">
              <h3><i className="fas fa-key"></i> Şifre Değiştir</h3>
            </div>
            
            <div className="card-body">
              {passwordError && (
                <div className="error-message">
                  <i className="fas fa-exclamation-triangle"></i> {passwordError}
                </div>
              )}

              <div className="form-group">
                <label>Mevcut Şifre</label>
                <input
                  type="password"
                  name="currentPassword"
                  value={passwordData.currentPassword}
                  onChange={handlePasswordChange}
                  className="form-input"
                  placeholder="Mevcut şifrenizi girin"
                  maxLength={100}
                />
              </div>

              <div className="form-group">
                <label>Yeni Şifre</label>
                <input
                  type="password"
                  name="newPassword"
                  value={passwordData.newPassword}
                  onChange={handlePasswordChange}
                  className="form-input"
                  placeholder="Yeni şifrenizi girin (en az 6 karakter)"
                  maxLength={100}
                />
              </div>

              <div className="form-group">
                <label>Yeni Şifre (Tekrar)</label>
                <input
                  type="password"
                  name="confirmPassword"
                  value={passwordData.confirmPassword}
                  onChange={handlePasswordChange}
                  className="form-input"
                  placeholder="Yeni şifrenizi tekrar girin"
                  maxLength={100}
                />
              </div>

              <button 
                className="save-btn" 
                onClick={updateAdminPassword} 
                disabled={updatingPassword}
              >
                {updatingPassword ? <><i className="fas fa-spinner fa-spin"></i> Değiştiriliyor...</> : 'Şifreyi Değiştir'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}