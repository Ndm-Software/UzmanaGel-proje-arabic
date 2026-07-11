import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../firebase/firebaseClient';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase/firebaseClient';
import Navbar from '../components/Navbar';
import LoadingSpinner from '../components/LoadingSpinner';
import { completeExpertProfile } from '../firebase/authService';
import AddressModal from '../components/AddressModal';
import DOMPurify from 'dompurify';
import '../styles/ExpertCompleteProfilePage.css';

const isDevelopment = process.env.NODE_ENV === 'development';

const sanitizeText = (text) => {
  if (!text) return '';
  return DOMPurify.sanitize(String(text));
};

// DÜZELTİLDİ - Production'da fallback yok
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;
if (!API_BASE_URL && !isDevelopment) {
  throw new Error('API_BASE_URL is not defined');
}

// DÜZELTİLDİ - Gerçek dosya validasyonu
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf'];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

const validateFile = (file, type) => {
  if (!file) return { valid: false, error: `${type} dosyası bulunamadı` };
  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    return { valid: false, error: `${type} dosyası sadece PDF, JPG veya PNG formatında olabilir.` };
  }
  if (file.size > MAX_FILE_SIZE) {
    return { valid: false, error: `${type} dosyası 5MB\'dan büyük olamaz.` };
  }
  return { valid: true, error: null };
};

const ExpertCompleteProfilePage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  
  const { 
    phone, 
    email, 
    uid: stateUid, 
    fullName: stateFullName,
    businessName: initialBusinessName,
    category: initialCategory,
    city: initialCity
  } = location.state || {};

  const [currentStep, setCurrentStep] = useState(1);
  const totalSteps = 3;
  const [user, setUser] = useState(null);
  const [userData, setUserData] = useState(null);

  const [showAddressModal, setShowAddressModal] = useState(false);
  const [selectedAddress, setSelectedAddress] = useState(null);

  const [analyzing, setAnalyzing] = useState(false);
  const [analysisResults, setAnalysisResults] = useState(null);
  const [showAnalysisModal, setShowAnalysisModal] = useState(false);

  const [analysisCache, setAnalysisCache] = useState({});

  const [formData, setFormData] = useState({
    fullName: stateFullName || '',
    businessName: initialBusinessName || '',
    providerType: 'individual',
    taxNumber: '',
    selectedCategories: initialCategory ? [{ name: initialCategory, isCustom: false }] : [],
    customCategoryInput: '',
    showCustomCategoryInput: false,
    
    city: initialCity || '',
    workingHours: {
      monday: { enabled: true, start: '09:00', end: '18:00' },
      tuesday: { enabled: true, start: '09:00', end: '18:00' },
      wednesday: { enabled: true, start: '09:00', end: '18:00' },
      thursday: { enabled: true, start: '09:00', end: '18:00' },
      friday: { enabled: true, start: '09:00', end: '18:00' },
      saturday: { enabled: false, start: '09:00', end: '18:00' },
      sunday: { enabled: false, start: '09:00', end: '18:00' }
    },
    minPrice: '',
    maxPrice: '',
    pricingModel: 'Proje Bazlı',
    
    experienceYears: '',
    educationInfo: '',
    selectedExpertise: [],
    customExpertiseInput: '',
    showCustomExpertiseInput: false,
    isCertified: false,
    certificateFiles: [],
    showCertificateUpload: false,
    identityFile: null,
    certificateFilesList: [],
    taxPlateFile: null
  });

  const [loading, setLoading] = useState(false);
  const [loadingPage, setLoadingPage] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  
  const [categoriesData, setCategoriesData] = useState([]);
  const [citiesData, setCitiesData] = useState([]);
  const [loadingData, setLoadingData] = useState(true);
  const [availableExpertise, setAvailableExpertise] = useState([]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      // Kullanıcı giriş yapmamış ve stateUid yoksa login'e yönlendir
      if (!currentUser && !stateUid) {
        navigate('/login');
        return;
      }
      
      if (currentUser) {
        setUser(currentUser);
        
        try {
          const userDoc = await getDoc(doc(db, "users", currentUser.uid));
          if (userDoc.exists()) {
            const data = userDoc.data();
            setUserData(data);
            
            setFormData(prev => ({
              ...prev,
              fullName: prev.fullName || data.displayName || '',
              providerType: data.providerType || 'individual',
              taxNumber: data.taxNumber || ''
            }));

            // Eğer kullanıcı zaten profilini tamamlamışsa ve PENDING_PROVIDER ise
            if (data.profileCompleted === true && data.userType === 'PENDING_PROVIDER') {
              if (isDevelopment) console.log("Profil zaten tamamlanmış, onay bekleniyor. Ana sayfaya yönlendiriliyor...");
              navigate('/');
              return;
            }
            
            // Eğer kullanıcı zaten PROVIDER ise (onaylanmış uzman)
            if (data.userType === 'PROVIDER') {
              if (isDevelopment) console.log("Kullanıcı zaten onaylı uzman. İlanlar sayfasına yönlendiriliyor...");
              navigate('/ilanlar');
              return;
            }
          }
        } catch (error) {
          if (isDevelopment) console.error("Kullanıcı bilgileri alınamadı:", error.message);
        }
      } else if (stateUid) {
        setUser({ uid: stateUid });
        setFormData(prev => ({
          ...prev,
          fullName: prev.fullName || stateFullName || ''
        }));
      }
      
      setLoadingPage(false);
    });
    
    return () => unsubscribe();
  }, [navigate, stateUid, stateFullName]);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    updateAvailableExpertise();
  }, [formData.selectedCategories, categoriesData]);

  const loadData = async () => {
    try {
      setLoadingData(true);
      
      const categoriesResponse = await fetch('/expert-data.json');
      const categoriesJson = await categoriesResponse.json();
      setCategoriesData(categoriesJson.categories || []);

      const citiesResponse = await fetch('/cities.json');
      const citiesJson = await citiesResponse.json();
      
      let citiesArray = [];
      if (citiesJson && citiesJson.cities && Array.isArray(citiesJson.cities)) {
        citiesArray = citiesJson.cities.map(city => city.name);
      } else {
        citiesArray = ["İstanbul", "Ankara", "İzmir", "Bursa", "Antalya", "Adana", "Konya", "Gaziantep"];
      }
      
      setCitiesData(citiesArray);
      
    } catch (error) {
      if (isDevelopment) console.error('Veriler yüklenirken hata:', error.message);
      setCategoriesData([
        { id: "temizlik", name: "Temizlik", expertise: ["Ev Temizliği", "Ofis Temizliği", "Halı Yıkama"] },
        { id: "elektrikci", name: "Elektrikçi", expertise: ["Tesisat Çekimi", "Arıza Tespiti", "Sigorta Değişimi"] },
        { id: "tesisatci", name: "Tesisatçı", expertise: ["Musluk Tamiri", "Klozet Montajı", "Petek Temizliği"] },
        { id: "boya-badana", name: "Boya & Badana", expertise: ["İç Cephe Boya", "Dış Cephe Boya", "Alçı Sıva"] }
      ]);
      setCitiesData(["İstanbul", "Ankara", "İzmir", "Bursa", "Antalya", "Adana"]);
    } finally {
      setLoadingData(false);
    }
  };

  const updateAvailableExpertise = () => {
    const expertiseList = [];
    
    formData.selectedCategories.forEach(cat => {
      if (!cat.isCustom) {
        const category = categoriesData.find(c => c.name === cat.name);
        if (category && category.expertise) {
          expertiseList.push(...category.expertise);
        }
      }
    });

    const uniqueExpertise = [...new Set(expertiseList)];
    setAvailableExpertise(uniqueExpertise);
  };

  const toggleCategory = (categoryName) => {
    setFormData(prev => {
      const isAlreadySelected = prev.selectedCategories.some(c => c.name === categoryName && !c.isCustom);
      if (isAlreadySelected) {
        return { ...prev, selectedCategories: [] };
      } else {
        return { ...prev, selectedCategories: [{ name: categoryName, isCustom: false }] };
      }
    });
  };

  const addCustomCategory = () => {
    if (formData.customCategoryInput.trim()) {
      const newCategoryName = formData.customCategoryInput.trim().slice(0, 100);
      setFormData(prev => ({
        ...prev,
        selectedCategories: [{ name: newCategoryName, isCustom: true }],
        customCategoryInput: '',
        showCustomCategoryInput: false
      }));
    }
  };

  const removeCustomCategory = (categoryName) => {
    setFormData(prev => ({
      ...prev,
      selectedCategories: prev.selectedCategories.filter(c => !(c.name === categoryName && c.isCustom))
    }));
  };

  const toggleExpertise = (expertiseName) => {
    setFormData(prev => {
      const selected = prev.selectedExpertise;
      const existingIndex = selected.findIndex(e => e.name === expertiseName && !e.isCustom);
      if (existingIndex === -1) {
        return { ...prev, selectedExpertise: [...selected, { name: expertiseName, isCustom: false, startingPrice: "" }] };
      } else {
        return { ...prev, selectedExpertise: selected.filter((_, i) => i !== existingIndex) };
      }
    });
  };

  const addCustomExpertise = () => {
    if (formData.customExpertiseInput.trim()) {
      const newName = formData.customExpertiseInput.trim().slice(0, 100);
      setFormData(prev => ({
        ...prev,
        selectedExpertise: [
          ...prev.selectedExpertise,
          { name: newName, isCustom: true, startingPrice: "" }
        ],
        customExpertiseInput: '',
        showCustomExpertiseInput: false
      }));
    }
  };

  const setExpertiseStartingPrice = (expertiseName, value) => {
    const numericOnly = String(value || "").replace(/[^\d]/g, "").slice(0, 10);
    setFormData(prev => ({
      ...prev,
      selectedExpertise: prev.selectedExpertise.map((e) =>
        e.name === expertiseName ? { ...e, startingPrice: numericOnly } : e
      ),
    }));
  };

  const removeCustomExpertise = (expertiseName) => {
    setFormData(prev => ({
      ...prev,
      selectedExpertise: prev.selectedExpertise.filter(e => !(e.name === expertiseName && e.isCustom))
    }));
  };

  const handleWorkingHourChange = (day, field, value) => {
    setFormData(prev => ({
      ...prev,
      workingHours: {
        ...prev.workingHours,
        [day]: { ...prev.workingHours[day], [field]: value }
      }
    }));
  };

  // DÜZELTİLDİ - Dosya validasyonu eklendi
  const handleIdentityUpload = (event) => {
    const file = event.target.files[0];
    if (file) {
      const validation = validateFile(file, 'Kimlik');
      if (!validation.valid) {
        setError(validation.error);
        event.target.value = '';
        return;
      }
      setFormData(prev => ({ ...prev, identityFile: file }));
      setAnalysisCache(prev => {
        const next = { ...prev };
        delete next.identity;
        return next;
      });
    }
  };

  const removeIdentityFile = () => {
    setFormData(prev => ({ ...prev, identityFile: null }));
    setAnalysisCache(prev => {
      const next = { ...prev };
      delete next.identity;
      return next;
    });
    const input = document.getElementById('identity-upload');
    if (input) input.value = '';
  };

  // DÜZELTİLDİ - Dosya validasyonu eklendi
  const handleCertificateUpload = (event) => {
    const files = Array.from(event.target.files);
    const validFiles = [];
    for (const file of files) {
      const validation = validateFile(file, 'Sertifika');
      if (validation.valid) {
        validFiles.push(file);
      } else {
        setError(validation.error);
        event.target.value = '';
        return;
      }
    }
    
    setFormData(prev => {
      const startIndex = prev.certificateFilesList.length;
      setAnalysisCache(cache => {
        const next = { ...cache };
        validFiles.forEach((_, i) => delete next[`certificates_${startIndex + i}`]);
        return next;
      });
      return {
        ...prev,
        certificateFilesList: [...prev.certificateFilesList, ...validFiles],
        isCertified: true
      };
    });
  };

  const removeCertificateFile = (index) => {
    setFormData(prev => ({
      ...prev,
      certificateFilesList: prev.certificateFilesList.filter((_, i) => i !== index),
      isCertified: prev.certificateFilesList.length - 1 === 0 ? false : true
    }));
    setAnalysisCache(prev => {
      const next = { ...prev };
      Object.keys(next).forEach(k => {
        if (k.startsWith('certificates_')) {
          const idx = parseInt(k.split('_')[1], 10);
          if (idx >= index) delete next[k];
        }
      });
      return next;
    });
  };

  // DÜZELTİLDİ - Dosya validasyonu eklendi
  const handleTaxPlateUpload = (event) => {
    const file = event.target.files[0];
    if (file) {
      const validation = validateFile(file, 'Vergi levhası');
      if (!validation.valid) {
        setError(validation.error);
        event.target.value = '';
        return;
      }
      setFormData(prev => ({ ...prev, taxPlateFile: file }));
      setAnalysisCache(prev => {
        const next = { ...prev };
        delete next.taxPlate;
        return next;
      });
    }
  };

  const removeTaxPlateFile = () => {
    setFormData(prev => ({ ...prev, taxPlateFile: null }));
    setAnalysisCache(prev => {
      const next = { ...prev };
      delete next.taxPlate;
      return next;
    });
    const input = document.getElementById('taxplate-upload');
    if (input) input.value = '';
  };

  const handleTaxNumberChange = (value) => {
    const digits = value.replace(/\D/g, '').slice(0, 10);
    setFormData(prev => ({ ...prev, taxNumber: digits }));
  };

  const isTaxNumberValid = (taxNumber) => {
    const digits = String(taxNumber).replace(/\D/g, '');
    return digits.length === 10;
  };

  const openAddressModal = () => setShowAddressModal(true);
  const closeAddressModal = () => setShowAddressModal(false);

  const handleAddressSave = (addressData) => {
    setSelectedAddress(addressData);
    setFormData(prev => ({ ...prev, city: addressData.city || prev.city }));
    setShowAddressModal(false);
  };

  const validateStep1 = () => {
    if (!formData.fullName.trim()) { setError('Ad Soyad gereklidir'); return false; }
    if (formData.fullName.length > 100) { setError('Ad Soyad 100 karakterden uzun olamaz'); return false; }
    if (!formData.businessName.trim()) { setError('İşletme adı gereklidir'); return false; }
    if (formData.businessName.length > 200) { setError('İşletme adı 200 karakterden uzun olamaz'); return false; }
    if (formData.selectedCategories.length === 0) { setError('Bir hizmet kategorisi seçmelisiniz'); return false; }
    if (formData.providerType === 'company') {
      if (!formData.taxNumber) { setError('Şirketler için vergi numarası gereklidir'); return false; }
      if (!isTaxNumberValid(formData.taxNumber)) { setError('Vergi numarası 10 haneli olmalıdır'); return false; }
    }
    if (!selectedAddress && !formData.city) { setError('Adres bilgisi gereklidir'); return false; }
    return true;
  };

  const validateStep2 = () => {
    const hasWorkingDay = Object.values(formData.workingHours).some(day => day.enabled);
    if (!hasWorkingDay) { setError('En az bir gün için çalışma saati belirlemelisiniz'); return false; }
    if (!formData.minPrice || !formData.maxPrice) { setError('Fiyat aralığı gereklidir'); return false; }
    const minPriceNum = parseInt(formData.minPrice);
    const maxPriceNum = parseInt(formData.maxPrice);
    if (isNaN(minPriceNum) || isNaN(maxPriceNum)) { setError('Geçerli fiyat giriniz'); return false; }
    if (minPriceNum >= maxPriceNum) { setError('Minimum fiyat maksimum fiyattan küçük olmalıdır'); return false; }
    if (minPriceNum < 0 || maxPriceNum > 1000000) { setError('Fiyat aralığı 0-1.000.000 TL arasında olmalıdır'); return false; }
    return true;
  };

  const validateStep3 = () => {
    if (!formData.experienceYears) { setError('Deneyim yılı gereklidir'); return false; }
    const expYears = parseInt(formData.experienceYears);
    if (isNaN(expYears) || expYears < 0 || expYears > 50) { setError('Deneyim yılı 0-50 arasında olmalıdır'); return false; }
    if (formData.selectedExpertise.length === 0) { setError('En az bir uzmanlık alanı seçmelisiniz'); return false; }
    if (formData.selectedExpertise.some(e => !String(e.startingPrice || '').trim() || Number(e.startingPrice) <= 0)) {
      setError('Lütfen seçtiğiniz her uzmanlık için başlangıç fiyatı girin');
      return false;
    }
    
    // Uzmanlık fiyatlarının max fiyattan büyük olmaması kontrolü
    const maxPriceNum = parseInt(formData.maxPrice);
    if (!isNaN(maxPriceNum) && maxPriceNum > 0) {
      for (const expertise of formData.selectedExpertise) {
        const expertisePrice = Number(expertise.startingPrice);
        if (expertisePrice > maxPriceNum) {
          setError(`"${sanitizeText(expertise.name)}" başlangıç fiyatı (${expertisePrice} TL) maksimum fiyatınızdan (${maxPriceNum} TL) yüksek olamaz.`);
          return false;
        }
      }
    }
    
    if (!formData.identityFile) { setError('Kimlik belgesi yüklemelisiniz'); return false; }
    if (formData.providerType === 'company' && !formData.taxPlateFile) { setError('Şirketler için vergi levhası yüklemelisiniz'); return false; }
    // Sertifikalar artık zorunlu değil - kontrol kaldırıldı
    return true;
  };

  const nextStep = () => {
    setError('');
    let isValid = false;
    switch(currentStep) {
      case 1: isValid = validateStep1(); break;
      case 2: isValid = validateStep2(); break;
      case 3: isValid = validateStep3(); break;
      default: isValid = true;
    }
    if (isValid && currentStep < totalSteps) {
      setCurrentStep(prev => prev + 1);
    }
  };

  const prevStep = () => {
    setError('');
    if (currentStep > 1) setCurrentStep(prev => prev - 1);
  };

  const handleSubmit = async () => {
    setError('');
    if (!validateStep1() || !validateStep2() || !validateStep3()) return;
    
    setAnalyzing(true);
    setShowAnalysisModal(true);
    setAnalysisResults(null);

    try {
      const uid = user?.uid || stateUid;
      if (!uid) throw new Error('Kullanıcı bilgisi bulunamadı!');

      const formDataObj = new FormData();
      let needsRequest = false;

      if (formData.identityFile && !analysisCache.identity) {
        formDataObj.append('identity', formData.identityFile);
        needsRequest = true;
      }

      formData.certificateFilesList.forEach((file, idx) => {
        if (!analysisCache[`certificates_${idx}`]) {
          formDataObj.append('certificates', file);
          needsRequest = true;
        }
      });

      if (formData.taxPlateFile && !analysisCache.taxPlate) {
        formDataObj.append('taxPlate', formData.taxPlateFile);
        needsRequest = true;
      }

      let freshResults = { identity: null, certificates: [], taxPlate: null };

      if (needsRequest) {
        const token = await auth.currentUser?.getIdToken();
        const verifyRes = await fetch(`${API_BASE_URL}/api/ocr/analyze-batch`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` },
          body: formDataObj
        });

        if (verifyRes.status === 503) {
          const errorData = await verifyRes.json();
          throw new Error(errorData.error || 'Belge doğrulama servisi şu anda kullanılamıyor. Lütfen daha sonra tekrar deneyin.');
        }
        if (!verifyRes.ok) throw new Error(`HTTP ${verifyRes.status}: ${verifyRes.statusText}`);

        const verifyResult = await verifyRes.json();
        freshResults = verifyResult.results || {};
      }

      const newCache = { ...analysisCache };

      if (freshResults.identity) {
        newCache.identity = freshResults.identity;
      }

      const freshCertList = freshResults.certificates || [];
      let freshCertCursor = 0;
      formData.certificateFilesList.forEach((_, idx) => {
        const cacheKey = `certificates_${idx}`;
        if (!analysisCache[cacheKey] && freshCertCursor < freshCertList.length) {
          newCache[cacheKey] = freshCertList[freshCertCursor++];
        }
      });

      if (freshResults.taxPlate) {
        newCache.taxPlate = freshResults.taxPlate;
      }

      setAnalysisCache(newCache);

      const mergedResults = {
        identity: newCache.identity || null,
        certificates: formData.certificateFilesList.map((_, idx) => newCache[`certificates_${idx}`]).filter(Boolean),
        taxPlate: newCache.taxPlate || null,
      };

      setAnalysisResults(mergedResults);
      
      setAnalyzing(false);

      let hasRejection = false;
      let rejectionReason = '';

      if (!mergedResults.identity || mergedResults.identity.verdict === 'rejected') {
        hasRejection = true;
        rejectionReason = 'Kimlik belgesi geçersiz';
      }

      // Sertifikalar artık zorunlu değil - sadece varsa kontrol et
      if (mergedResults.certificates && mergedResults.certificates.length > 0) {
        if (mergedResults.certificates.every(c => c.verdict === 'rejected')) {
          hasRejection = true;
          rejectionReason = 'Tüm sertifikalar geçersiz';
        }
      }

      if (formData.providerType === 'company') {
        if (!mergedResults.taxPlate || mergedResults.taxPlate.verdict === 'rejected') {
          hasRejection = true;
          rejectionReason = 'Vergi levhası geçersiz';
        }
      }

      if (hasRejection) {
        setError("Lütfen geçerli belgeler yükleyip tekrar deneyin.");
        return;
      }

      setShowAnalysisModal(false);
      
      setLoading(true);

      const categoryNames = formData.selectedCategories.map(c => c.name).join(', ');
      const specialties = formData.selectedExpertise.map(e => ({
        name: sanitizeText(e.name).slice(0, 100),
        startingPrice: Number(String(e.startingPrice || "").replace(/[^\d]/g, "")) || 0,
      }));
      const allFiles = [
        formData.identityFile,
        ...formData.certificateFilesList,
        ...(formData.taxPlateFile ? [formData.taxPlateFile] : [])
      ].filter(Boolean);

      let lat = null, lng = null, locationDisplay = null, coordSource = "API_Center";
      if (selectedAddress) {
        lat = selectedAddress.lat || null;
        lng = selectedAddress.lng || null;
        if (lat && lng) locationDisplay = `${lat}° N, ${lng}° E`;
        coordSource = selectedAddress.coordSource || "API_Center";
      }

      await completeExpertProfile({
        uid,
        profileData: {
          displayName: sanitizeText(formData.fullName).slice(0, 100),
          businessName: sanitizeText(formData.businessName).slice(0, 200),
          providerType: formData.providerType,
          taxNumber: sanitizeText(formData.taxNumber).slice(0, 10),
          category: sanitizeText(categoryNames).slice(0, 500),
          addressName: selectedAddress?.addressName ? sanitizeText(selectedAddress.addressName).slice(0, 200) : "İş Adresi",
          city: selectedAddress?.city ? sanitizeText(selectedAddress.city).slice(0, 100) : sanitizeText(formData.city).slice(0, 100),
          district: selectedAddress?.district ? sanitizeText(selectedAddress.district).slice(0, 100) : "",
          neighborhood: selectedAddress?.neighborhood ? sanitizeText(selectedAddress.neighborhood).slice(0, 100) : "",
          street: selectedAddress?.street ? sanitizeText(selectedAddress.street).slice(0, 200) : "",
          siteName: selectedAddress?.siteName ? sanitizeText(selectedAddress.siteName).slice(0, 200) : "",
          apartmentName: selectedAddress?.apartmentName ? sanitizeText(selectedAddress.apartmentName).slice(0, 200) : "",
          blockName: selectedAddress?.blockName ? sanitizeText(selectedAddress.blockName).slice(0, 100) : "",
          buildingNo: selectedAddress?.buildingNo ? sanitizeText(selectedAddress.buildingNo).slice(0, 50) : "",
          floor: selectedAddress?.floor ? sanitizeText(selectedAddress.floor).slice(0, 50) : "",
          doorNo: selectedAddress?.doorNo ? sanitizeText(selectedAddress.doorNo).slice(0, 50) : "",
          lat, lng, coordSource,
          educationInfo: sanitizeText(formData.educationInfo).slice(0, 500),
          experienceYears: parseInt(formData.experienceYears),
          minPrice: parseInt(formData.minPrice),
          maxPrice: parseInt(formData.maxPrice),
          pricingType: formData.pricingModel,
          specialties,
          certificateFiles: allFiles,
          workingHours: formData.workingHours,
          ocrResults: {
            identity: mergedResults.identity,
            certificates: mergedResults.certificates,
            taxPlate: mergedResults.taxPlate,
            verifiedAt: new Date().toISOString()
          }
        }
      });

      setLoading(false);
      setSuccess(true);
      setTimeout(() => navigate('/ilanlar'), 3000);

    } catch (err) {
      if (isDevelopment) console.error("Submit error:", err.message);
      setError('Profil tamamlanırken bir hata oluştu. Lütfen daha sonra tekrar deneyin.');
      setAnalyzing(false);
      setLoading(false);
      setShowAnalysisModal(false);
    }
  };

  const AnalysisModal = () => {
    if (!showAnalysisModal) return null;

    const results = analysisResults;

    const hasRejection = results && (
      !results.identity ||
      results.identity.verdict === 'rejected' ||
      (results.certificates && results.certificates.length > 0
        ? results.certificates.every(c => c.verdict === 'rejected')
        : false) ||
      (formData.providerType === 'company' && (!results.taxPlate || results.taxPlate.verdict === 'rejected'))
    );

    const headerTitle = analyzing
      ? 'Belgeler Analiz Ediliyor'
      : hasRejection
        ? 'Belge Doğrulama Başarısız'
        : 'Belge Analizi Tamamlandı';

    const headerIcon = analyzing
      ? 'fa-file-search'
      : hasRejection
        ? 'fa-times-circle'
        : 'fa-check-circle';

    const headerIconColor = analyzing
      ? 'var(--primary)'
      : hasRejection
        ? '#ef4444'
        : '#10b981';

    return (
      <div className="modal-overlay">
        <div className="analysis-modal">

          <div className="modal-header">
            <i className={`fas ${headerIcon}`} style={{ color: headerIconColor }}></i>
            <h3>{headerTitle}</h3>
          </div>

          <div className="modal-body">
            {analyzing ? (
              <div className="analysis-loading">
                <div className="loading-spinner"></div>
                <p>Yüklediğiniz belgeler inceleniyor...</p>
                <p className="loading-text">Kimlik, sertifikalar ve vergi levhası kontrol ediliyor.</p>
                <small>Bu işlem 5-10 saniye sürebilir.</small>
              </div>
            ) : (
              <div className="analysis-results">
                {results?.identity && (
                  <div className={`result-item ${results.identity.verdict}`}>
                    <div className="result-icon">
                      <i className={`fas ${
                        results.identity.verdict === 'approved' ? 'fa-check-circle' :
                        results.identity.verdict === 'rejected' ? 'fa-times-circle' :
                        'fa-exclamation-triangle'
                      }`}></i>
                    </div>
                    <div className="result-content">
                      <div className="result-title">
                        <strong>Kimlik Belgesi</strong>
                        <span className={`verdict-badge ${results.identity.verdict}`}>
                          {results.identity.verdict === 'approved' ? 'ONAYLANDI' :
                           results.identity.verdict === 'rejected' ? 'REDDEDİLDİ' : 'İNCELENMELİ'}
                        </span>
                      </div>
                      <p className="result-reason">{sanitizeText(results.identity.reason)}</p>
                      {results.identity.verdict === 'rejected' && (
                        <div className="error-detail">
                          <i className="fas fa-info-circle"></i>
                          <span>Bu belge nedeniyle kaydınız tamamlanamadı.</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {results?.certificates?.map((cert, idx) => (
                  <div key={idx} className={`result-item ${cert.verdict}`}>
                    <div className="result-icon">
                      <i className={`fas ${
                        cert.verdict === 'approved' ? 'fa-check-circle' :
                        cert.verdict === 'rejected' ? 'fa-times-circle' :
                        'fa-exclamation-triangle'
                      }`}></i>
                    </div>
                    <div className="result-content">
                      <div className="result-title">
                        <strong>Sertifika {idx + 1}</strong>
                        <span className={`verdict-badge ${cert.verdict}`}>
                          {cert.verdict === 'approved' ? 'ONAYLANDI' :
                           cert.verdict === 'rejected' ? 'REDDEDİLDİ' : 'İNCELENMELİ'}
                        </span>
                      </div>
                      <p className="result-reason">{sanitizeText(cert.reason)}</p>
                      {cert.verdict === 'rejected' && (
                        <div className="error-detail">
                          <i className="fas fa-info-circle"></i>
                          <span>Bu belge nedeniyle kaydınız tamamlanamadı.</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}

                {results?.taxPlate && (
                  <div className={`result-item ${results.taxPlate.verdict}`}>
                    <div className="result-icon">
                      <i className={`fas ${
                        results.taxPlate.verdict === 'approved' ? 'fa-check-circle' :
                        results.taxPlate.verdict === 'rejected' ? 'fa-times-circle' :
                        'fa-exclamation-triangle'
                      }`}></i>
                    </div>
                    <div className="result-content">
                      <div className="result-title">
                        <strong>Vergi Levhası</strong>
                        <span className={`verdict-badge ${results.taxPlate.verdict}`}>
                          {results.taxPlate.verdict === 'approved' ? 'ONAYLANDI' :
                           results.taxPlate.verdict === 'rejected' ? 'REDDEDİLDİ' : 'İNCELENMELİ'}
                        </span>
                      </div>
                      <p className="result-reason">{sanitizeText(results.taxPlate.reason)}</p>
                      {results.taxPlate.verdict === 'rejected' && (
                        <div className="error-detail">
                          <i className="fas fa-info-circle"></i>
                          <span>Bu belge nedeniyle kaydınız tamamlanamadı.</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {hasRejection && (
                  <div className="rejection-warning">
                    <i className="fas fa-exclamation-triangle"></i>
                    <p>Yukarıda belirtilen nedenlerden dolayı kaydınız tamamlanamadı. Lütfen geçerli belgeler yükleyip tekrar deneyin.</p>
                  </div>
                )}

                {!hasRejection && results && (
                  <div className="success-warning">
                    <i className="fas fa-check-circle"></i>
                    <p>Tüm belgeler başarıyla doğrulandı! Profiliniz kaydediliyor...</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {!analyzing && hasRejection && (
            <div className="modal-footer">
              <button
                className="btn btn-secondary"
                onClick={() => {
                  setShowAnalysisModal(false);
                  setAnalysisResults(null);
                }}
              >
                <i className="fas fa-times"></i>
                Kapat ve Düzelt
              </button>
            </div>
          )}
        </div>
      </div>
    );
  };

  if (loadingPage || loadingData) {
    return (
      <div className="expert-complete-page">
        <Navbar />
        <div className="loading-container">
          <LoadingSpinner text="Yükleniyor..." />
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="expert-complete-page">
        <Navbar />
        <main className="app-main">
          <div className="app-container">
            <div className="success-message">
              <div className="success-icon">
                <i className="fas fa-check-circle"></i>
              </div>
              <h3>Profil Tamamlandı!</h3>
              <p>Profiliniz başarıyla oluşturuldu. Admin onayından sonra uzman olarak giriş yapabileceksiniz.</p>
              <p className="info-text">Onay süreci tamamlandığında SMS ile bilgilendirileceksiniz.</p>
              <p className="redirect-text">İlanlar sayfasına yönlendiriliyorsunuz...</p>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="expert-complete-page">
      <Navbar />
      
      <main className="app-main">
        <div className="app-container">
          <div className="app-title-section">
            <h1>Profili Tamamla</h1>
            <p>Uzmanlık bilgilerinizi girin</p>
          </div>

          <div className="form-container">
            <div className="step-indicator">
              {[1, 2, 3].map(step => (
                <React.Fragment key={step}>
                  <div className={`step-item ${currentStep === step ? 'active' : ''} ${currentStep > step ? 'completed' : ''}`} data-step={step}>
                    <div className="step-circle">{step}</div>
                    <span className="step-label">
                      {step === 1 && 'İşletme'}
                      {step === 2 && 'Çalışma'}
                      {step === 3 && 'Profesyonel'}
                    </span>
                  </div>
                  {step < 3 && <div className="step-line"></div>}
                </React.Fragment>
              ))}
            </div>

            {currentStep === 1 && (
              <div className="form-step active">
                <h2 className="step-title">İşletme Bilgileri</h2>
                <div className="form-grid">
                  <div className="form-group full-width">
                    <label className="form-label">
                      <i className="fas fa-user"></i>
                      Ad Soyad <span className="required">*</span>
                    </label>
                    <input type="text" className="form-input" value={formData.fullName}
                      onChange={(e) => setFormData({...formData, fullName: e.target.value.slice(0, 100)})}
                      placeholder="Ad Soyad" required disabled={loading || analyzing} maxLength="100" />
                  </div>

                  <div className="form-group full-width">
                    <label className="form-label">
                      <i className="fas fa-building"></i>
                      İşletme / Marka Adı <span className="required">*</span>
                    </label>
                    <input type="text" className="form-input" value={formData.businessName}
                      onChange={(e) => setFormData({...formData, businessName: e.target.value.slice(0, 200)})}
                      placeholder="İşletme veya marka adınız" required disabled={loading || analyzing} maxLength="200" />
                  </div>

                  <div className="form-group full-width">
                    <label className="form-label">İşletme Türü <span className="required">*</span></label>
                    <div className="business-type-cards">
                      <label className={`business-card ${formData.providerType === 'individual' ? 'selected' : ''}`}
                        onClick={() => setFormData({...formData, providerType: 'individual', taxNumber: ''})}>
                        <div className="card-content">
                          <div className="card-icon"><i className="fas fa-user-tie"></i></div>
                          <div className="card-info"><h4>Şahıs İşletmesi</h4><p>Bireysel olarak hizmet verecekler</p></div>
                          <div className="card-check"><i className="fas fa-check-circle"></i></div>
                        </div>
                      </label>
                      <label className={`business-card ${formData.providerType === 'company' ? 'selected' : ''}`}
                        onClick={() => setFormData({...formData, providerType: 'company'})}>
                        <div className="card-content">
                          <div className="card-icon"><i className="fas fa-building"></i></div>
                          <div className="card-info"><h4>Şirket</h4><p>Limited, Anonim vb. şirketler</p></div>
                          <div className="card-check"><i className="fas fa-check-circle"></i></div>
                        </div>
                      </label>
                    </div>
                  </div>

                  {formData.providerType === 'company' && (
                    <div className="form-group full-width">
                      <label className="form-label">
                        <i className="fas fa-building"></i>
                        Vergi Numarası <span className="required">*</span>
                      </label>
                      <input type="text"
                        className={`form-input ${formData.taxNumber.length > 0 && !isTaxNumberValid(formData.taxNumber) ? 'input-error' : formData.taxNumber.length === 10 ? 'input-success' : ''}`}
                        value={formData.taxNumber} onChange={(e) => handleTaxNumberChange(e.target.value)}
                        placeholder="10 haneli vergi numarası" maxLength={10} inputMode="numeric" disabled={loading || analyzing} />
                      <small className={`field-hint ${formData.taxNumber.length > 0 && !isTaxNumberValid(formData.taxNumber) ? 'hint-error' : ''}`}>
                        {formData.taxNumber.length > 0
                          ? `${formData.taxNumber.length}/10 hane${formData.taxNumber.length === 10 ? ' ✓' : ''}`
                          : 'Şirketler için 10 haneli vergi numarası zorunludur'}
                      </small>
                    </div>
                  )}

                  <div className="form-group full-width">
                    <label className="form-label">
                      <i className="fas fa-tags"></i>
                      Hizmet Kategorisi <span className="required">*</span>
                      <span className="selected-count">1 kategori seçilebilir</span>
                    </label>
                    <div className="categories-grid">
                      {categoriesData.map(category => (
                        <div key={category.id}
                          className={`category-item ${formData.selectedCategories.some(c => c.name === category.name && !c.isCustom) ? 'selected' : ''}`}
                          onClick={() => toggleCategory(category.name)}>
                          {category.name}
                        </div>
                      ))}
                      <div className={`category-item other-category ${formData.showCustomCategoryInput ? 'selected' : ''}`}
                        onClick={() => setFormData(prev => ({...prev, showCustomCategoryInput: true}))}>
                        <i className="fas fa-plus"></i> Diğer
                      </div>
                    </div>

                    {formData.showCustomCategoryInput && (
                      <div className="custom-category-section">
                        <div className="expertise-add">
                          <input type="text" className="form-input" value={formData.customCategoryInput}
                            onChange={(e) => setFormData({...formData, customCategoryInput: e.target.value.slice(0, 100)})}
                            placeholder="Kategori adı yazın..." autoFocus disabled={loading || analyzing} maxLength="100" />
                          <button type="button" className="btn-add" onClick={addCustomCategory} disabled={loading || analyzing}>
                            <i className="fas fa-plus"></i> Ekle
                          </button>
                          <button type="button" className="btn-cancel"
                            onClick={() => setFormData(prev => ({...prev, showCustomCategoryInput: false, customCategoryInput: ''}))}
                            disabled={loading || analyzing}>
                            <i className="fas fa-times"></i>
                          </button>
                        </div>
                      </div>
                    )}

                    {formData.selectedCategories.filter(c => c.isCustom).length > 0 && (
                      <div className="custom-items-list">
                        <label className="form-label small">Eklediğiniz Kategoriler:</label>
                        <div className="custom-items-tags">
                          {formData.selectedCategories.filter(c => c.isCustom).map((category, index) => (
                            <div key={index} className="custom-item-tag">
                              <span>{category.name}</span>
                              <button type="button" onClick={() => removeCustomCategory(category.name)} disabled={loading || analyzing}>
                                <i className="fas fa-times"></i>
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="form-group full-width">
                    <label className="form-label">
                      <i className="fas fa-map-marker-alt"></i>
                      Adres Bilgisi <span className="required">*</span>
                      <span className="address-hint">(Lütfen iş yeri adresinizi giriniz)</span>
                    </label>
                    <button type="button" className="btn-add" onClick={openAddressModal}
                      style={{ marginBottom: '15px', width: '100%' }} disabled={loading || analyzing}>
                      <i className="fas fa-plus"></i>
                      {selectedAddress ? 'Adresi Düzenle' : 'Adres Ekle / Seç'}
                    </button>
                    {selectedAddress && (
                      <div className="custom-items-list">
                        <div className="custom-item-tag" style={{ width: '100%', justifyContent: 'space-between' }}>
                          <div>
                            <i className="fas fa-home"></i>
                            <strong>{sanitizeText(selectedAddress.addressName || 'Kayıtlı Adres')}</strong>
                            <p style={{ margin: '5px 0 0 0', fontSize: '12px', color: 'var(--text-muted)' }}>
                              {sanitizeText(selectedAddress.city)} {sanitizeText(selectedAddress.district)} {sanitizeText(selectedAddress.neighborhood)}
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {currentStep === 2 && (
              <div className="form-step active">
                <h2 className="step-title">Çalışma Detayları</h2>
                <div className="form-grid">
                  <div className="form-group">
                    <label className="form-label"><i className="fas fa-tag"></i> Min Fiyat (₺) <span className="required">*</span></label>
                    <input type="number" className="form-input" value={formData.minPrice}
                      onChange={(e) => setFormData({...formData, minPrice: e.target.value.slice(0, 10)})}
                      placeholder="Min. fiyat" min="0" max="1000000" required disabled={loading || analyzing} />
                  </div>
                  <div className="form-group">
                    <label className="form-label"><i className="fas fa-tag"></i> Max Fiyat (₺) <span className="required">*</span></label>
                    <input type="number" className="form-input" value={formData.maxPrice}
                      onChange={(e) => setFormData({...formData, maxPrice: e.target.value.slice(0, 10)})}
                      placeholder="Max. fiyat" min="0" max="1000000" required disabled={loading || analyzing} />
                  </div>

                  <div className="form-group full-width">
                    <label className="form-label"><i className="fas fa-coins"></i> Fiyatlandırma Modeli <span className="required">*</span></label>
                    <div className="pricing-type-group">
                      <label className="pricing-option">
                        <input type="radio" name="pricingModel" checked={formData.pricingModel === 'Proje Bazlı'}
                          onChange={() => setFormData({...formData, pricingModel: 'Proje Bazlı'})} disabled={loading || analyzing} />
                        <span>Proje Bazlı</span>
                      </label>
                      <label className="pricing-option">
                        <input type="radio" name="pricingModel" checked={formData.pricingModel === 'Saatlik Ücret'}
                          onChange={() => setFormData({...formData, pricingModel: 'Saatlik Ücret'})} disabled={loading || analyzing} />
                        <span>Saatlik Ücret</span>
                      </label>
                    </div>
                  </div>

                  <div className="form-group full-width">
                    <label className="form-label">
                      <i className="fas fa-clock"></i> Çalışma Saatleri <span className="required">*</span>
                      <span className="field-hint">En az bir gün seçmelisiniz</span>
                    </label>
                    <div className="working-hours-grid">
                      {Object.entries(formData.workingHours).map(([day, hours]) => (
                        <div key={day} className="working-hour-item">
                          <div className="day-header">
                            <label className="day-checkbox">
                              <input type="checkbox" checked={hours.enabled}
                                onChange={(e) => handleWorkingHourChange(day, 'enabled', e.target.checked)}
                                disabled={loading || analyzing} />
                              <span className="day-name">
                                {day === 'monday' && 'Pazartesi'}{day === 'tuesday' && 'Salı'}
                                {day === 'wednesday' && 'Çarşamba'}{day === 'thursday' && 'Perşembe'}
                                {day === 'friday' && 'Cuma'}{day === 'saturday' && 'Cumartesi'}
                                {day === 'sunday' && 'Pazar'}
                              </span>
                            </label>
                          </div>
                          {hours.enabled && (
                            <div className="hour-inputs">
                              <input type="time" value={hours.start}
                                onChange={(e) => handleWorkingHourChange(day, 'start', e.target.value)} disabled={loading || analyzing} />
                              <span>-</span>
                              <input type="time" value={hours.end}
                                onChange={(e) => handleWorkingHourChange(day, 'end', e.target.value)} disabled={loading || analyzing} />
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {currentStep === 3 && (
              <div className="form-step active">
                <h2 className="step-title">Profesyonel Bilgiler</h2>
                <div className="form-grid">
                  <div className="form-group">
                    <label className="form-label"><i className="fas fa-briefcase"></i> Deneyim Yılı <span className="required">*</span></label>
                    <input type="number" name="experienceYears" className="form-input" value={formData.experienceYears}
                      onChange={(e) => setFormData({...formData, experienceYears: e.target.value.slice(0, 2)})}
                      placeholder="Örn: 5" min="0" max="50" required disabled={loading || analyzing} />
                  </div>
                  <div className="form-group">
                    <label className="form-label"><i className="fas fa-graduation-cap"></i> Eğitim Bilgisi <span className="optional">(opsiyonel)</span></label>
                    <input type="text" className="form-input" value={formData.educationInfo}
                      onChange={(e) => setFormData({...formData, educationInfo: e.target.value.slice(0, 500)})}
                      placeholder="Okul / Bölüm" disabled={loading || analyzing} maxLength="500" />
                  </div>

                  <div className="form-group full-width">
                    <label className="form-label">
                      <i className="fas fa-star"></i> Uzmanlık Alanları <span className="required">*</span>
                      <span className="selected-count">{formData.selectedExpertise.length} seçildi</span>
                    </label>
                    {availableExpertise.length > 0 && (
                      <div className="categories-grid">
                        {availableExpertise.map((expertise, index) => (
                          <div key={index}
                            className={`category-item ${formData.selectedExpertise.some(e => e.name === expertise && !e.isCustom) ? 'selected' : ''}`}
                            onClick={() => toggleExpertise(expertise)}>
                            {expertise}
                          </div>
                        ))}
                        <div className={`category-item other-category ${formData.showCustomExpertiseInput ? 'selected' : ''}`}
                          onClick={() => setFormData(prev => ({...prev, showCustomExpertiseInput: true}))}>
                          <i className="fas fa-plus"></i> Diğer
                        </div>
                      </div>
                    )}

                    {formData.showCustomExpertiseInput && (
                      <div className="custom-category-section">
                        <div className="expertise-add">
                          <input type="text" className="form-input" value={formData.customExpertiseInput}
                            onChange={(e) => setFormData({...formData, customExpertiseInput: e.target.value.slice(0, 100)})}
                            placeholder="Uzmanlık alanı yazın..." autoFocus disabled={loading || analyzing} maxLength="100" />
                          <button type="button" className="btn-add" onClick={addCustomExpertise} disabled={loading || analyzing}>
                            <i className="fas fa-plus"></i> Ekle
                          </button>
                          <button type="button" className="btn-cancel"
                            onClick={() => setFormData(prev => ({...prev, showCustomExpertiseInput: false, customExpertiseInput: ''}))}
                            disabled={loading || analyzing}>
                            <i className="fas fa-times"></i>
                          </button>
                        </div>
                      </div>
                    )}

                    {formData.selectedExpertise.filter(e => e.isCustom).length > 0 && (
                      <div className="custom-items-list">
                        <label className="form-label small">Eklediğiniz Uzmanlıklar:</label>
                        <div className="custom-items-tags">
                          {formData.selectedExpertise.filter(e => e.isCustom).map((expertise, index) => (
                            <div key={index} className="custom-item-tag">
                              <span>{expertise.name}</span>
                              <button type="button" onClick={() => removeCustomExpertise(expertise.name)} disabled={loading || analyzing}>
                                <i className="fas fa-times"></i>
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {formData.selectedExpertise.length > 0 && (
                      <div style={{ marginTop: 14 }}>
                        <label className="form-label small" style={{ marginBottom: 10, display: 'block' }}>
                          Başlangıç Fiyatları <span className="required">*</span>
                        </label>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
                          {formData.selectedExpertise.map((e, idx) => (
                            <div key={`${e.name}-${idx}`} className="form-group" style={{ margin: 0 }}>
                              <label className="form-label small" style={{ opacity: 0.9 }}>
                                {sanitizeText(e.name)}
                              </label>
                              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                                <input
                                  type="text"
                                  inputMode="numeric"
                                  className="form-input"
                                  value={e.startingPrice || ""}
                                  onChange={(ev) => setExpertiseStartingPrice(e.name, ev.target.value)}
                                  placeholder="Örn: 600"
                                  disabled={loading || analyzing}
                                  required
                                  maxLength="10"
                                />
                                <span style={{ color: 'var(--text-muted)', fontWeight: 700 }}>TL</span>
                              </div>
                              <small style={{ color: 'var(--text-muted)' }}>
                                “{sanitizeText(e.name)}” için başlangıç fiyatı
                              </small>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="form-group full-width">
                    <label className="form-label"><i className="fas fa-file-upload"></i> Belgeler</label>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px', marginTop: '15px' }}>

                      <div className="upload-card">
                        <div className="upload-card-header">
                          <i className="fas fa-id-card"></i>
                          <span>Kimlik Belgesi <span className="required">*</span></span>
                        </div>
                        <div className="upload-card-body">
                          <input type="file" id="identity-upload" accept=".pdf,.jpg,.jpeg,.png"
                            onChange={handleIdentityUpload} style={{ display: 'none' }} disabled={loading || analyzing} />
                          <button type="button" className="btn-upload"
                            onClick={() => document.getElementById('identity-upload').click()} disabled={loading || analyzing}>
                            <i className="fas fa-upload"></i> {formData.identityFile ? 'Dosyayı Değiştir' : 'Dosya Seç'}
                          </button>
                          <small>PDF, JPG, PNG (max 5MB)</small>
                        </div>
                        {formData.identityFile ? (
                          <div className="upload-card-footer">
                            <div className="uploaded-file">
                              <i className="fas fa-file"></i>
                              <span>{formData.identityFile.name.length > 20 ? formData.identityFile.name.slice(0, 15) + '...' : formData.identityFile.name}</span>
                              <button onClick={removeIdentityFile} disabled={loading || analyzing}>✕</button>
                            </div>
                          </div>
                        ) : (
                          <div className="upload-card-warning">
                            <i className="fas fa-exclamation-circle"></i> Kimlik yüklemelisiniz
                          </div>
                        )}
                      </div>

                      <div className="upload-card">
                        <div className="upload-card-header">
                          <i className="fas fa-certificate"></i>
                          <span>Sertifikalar <span className="optional">(opsiyonel)</span></span>
                        </div>
                        <div className="upload-card-body">
                          <input type="file" id="certificate-upload-input" accept=".pdf,.jpg,.jpeg,.png" multiple
                            onChange={handleCertificateUpload} style={{ display: 'none' }} disabled={loading || analyzing} />
                          <button type="button" className="btn-upload"
                            onClick={() => document.getElementById('certificate-upload-input').click()} disabled={loading || analyzing}>
                            <i className="fas fa-upload"></i> Dosya Seç
                          </button>
                          <small>PDF, JPG, PNG (max 5MB) - Birden fazla seçebilirsiniz (opsiyonel)</small>
                        </div>
                        {formData.certificateFilesList.length > 0 ? (
                          <div className="upload-card-footer">
                            {formData.certificateFilesList.map((file, idx) => (
                              <div key={idx} className="uploaded-file">
                                <i className="fas fa-file"></i>
                                <span>{file.name.length > 20 ? file.name.slice(0, 15) + '...' : file.name}</span>
                                <button onClick={() => removeCertificateFile(idx)} disabled={loading || analyzing}>✕</button>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="upload-card-footer">
                            <div className="uploaded-file" style={{ opacity: 0.6 }}>
                              <i className="fas fa-info-circle"></i>
                              <span>Opsiyonel, atlanabilir</span>
                            </div>
                          </div>
                        )}
                      </div>

                      {formData.providerType === 'company' ? (
                        <div className="upload-card">
                          <div className="upload-card-header">
                            <i className="fas fa-file-invoice"></i>
                            <span>Vergi Levhası <span className="required">*</span></span>
                          </div>
                          <div className="upload-card-body">
                            <input type="file" id="taxplate-upload" accept=".pdf,.jpg,.jpeg,.png"
                              onChange={handleTaxPlateUpload} style={{ display: 'none' }} disabled={loading || analyzing} />
                            <button type="button" className="btn-upload"
                              onClick={() => document.getElementById('taxplate-upload').click()} disabled={loading || analyzing}>
                              <i className="fas fa-upload"></i> {formData.taxPlateFile ? 'Dosyayı Değiştir' : 'Dosya Seç'}
                            </button>
                            <small>PDF, JPG, PNG (max 5MB)</small>
                          </div>
                          {formData.taxPlateFile ? (
                            <div className="upload-card-footer">
                              <div className="uploaded-file">
                                <i className="fas fa-file"></i>
                                <span>{formData.taxPlateFile.name.length > 20 ? formData.taxPlateFile.name.slice(0, 15) + '...' : formData.taxPlateFile.name}</span>
                                <button onClick={removeTaxPlateFile} disabled={loading || analyzing}>✕</button>
                              </div>
                            </div>
                          ) : (
                            <div className="upload-card-warning">
                              <i className="fas fa-exclamation-circle"></i> Vergi levhası yüklemelisiniz
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="upload-card empty-card">
                          <div className="upload-card-header">
                            <i className="fas fa-building"></i>
                            <span>Şahıs İşletmesi</span>
                          </div>
                          <div className="upload-card-body">
                            <p className="empty-message">Vergi levhası gerekmez</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {error && (
              <div className="error-message" style={{ marginTop: '20px' }}>
                <i className="fas fa-exclamation-circle"></i>
                <div style={{ flex: 1, whiteSpace: 'pre-line' }}>
                  {sanitizeText(error)}
                </div>
              </div>
            )}

            <div className="form-navigation">
              {currentStep > 1 && (
                <button className="btn btn-secondary" onClick={prevStep} disabled={loading || analyzing}>
                  <i className="fas fa-arrow-left"></i> Geri
                </button>
              )}
              {currentStep < totalSteps ? (
                <button className="btn btn-primary" onClick={nextStep} disabled={loading || analyzing}>
                  İleri <i className="fas fa-arrow-right"></i>
                </button>
              ) : (
                <button className="btn btn-primary" onClick={handleSubmit}
                  disabled={loading || analyzing} style={{ minWidth: '200px' }}>
                  {loading ? (
                    <span><i className="fas fa-spinner fa-spin"></i> Kaydediliyor...</span>
                  ) : analyzing ? (
                    <span><i className="fas fa-spinner fa-spin"></i> Belgeler Analiz Ediliyor...</span>
                  ) : (
                    <span><i className="fas fa-check"></i> Kaydet ve Bitir</span>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      </main>

      <AddressModal
        isOpen={showAddressModal}
        onClose={closeAddressModal}
        onSave={handleAddressSave}
        initialData={selectedAddress}
        isEditing={!!selectedAddress}
      />

      <AnalysisModal />
    </div>
  );
};

export default ExpertCompleteProfilePage;