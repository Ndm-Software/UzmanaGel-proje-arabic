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
import { toArabicServiceLabel } from '../utils/arabicLabels';
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
  if (!file) return { valid: false, error: `ملف ${type} غير موجود.` };
  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    return { valid: false, error: `ملف ${type} يجب أن يكون بصيغة PDF, JPG أو PNG فقط.` };
  }
  if (file.size > MAX_FILE_SIZE) {
    return { valid: false, error: `ملف ${type} يجب أن يكون أصغر من 5MB.` };
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
   // identityFile: null,
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
        { id: "temizlik", name: "تنظيف", expertise: ["تنظيف منازل", "تنظيف مكاتب", "غسيل سجاد"] },
        { id: "elektrikci", name: "كهربائي", expertise: ["تمديد شبكات", "كشف أعطال", "تبديل قواطع"] },
        { id: "tesisatci", name: "سباك", expertise: ["تصليح صنابير", "تركيب مراحيض", "تنظيف رادياتير"] },
        { id: "boya-badana", name: "دهان وجبس", expertise: ["دهان داخلي", "دهان خارجي", "جبس بورد"] }
      ]);
      setCitiesData(["دمشق", "حلب", "حمص", "اللاذقية", "طرطوس", "حماة"]);
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

  /* const handleIdentityUpload = (event) => {
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
  }; */

  /* const removeIdentityFile = () => {
    setFormData(prev => ({ ...prev, identityFile: null }));
    setAnalysisCache(prev => {
      const next = { ...prev };
      delete next.identity;
      return next;
    });
    const input = document.getElementById('identity-upload');
    if (input) input.value = '';
  }; */

  // DÜZELTİLDİ - Dosya validasyonu eklendi
  const handleCertificateUpload = (event) => {
    const files = Array.from(event.target.files);
    const validFiles = [];
    for (const file of files) {
      const validation = validateFile(file, 'شهادة');
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
      const validation = validateFile(file, 'اللوحة الضريبية');
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
    if (!formData.fullName.trim()) { setError('الاسم الكامل مطلوب'); return false; }
    if (formData.fullName.length > 100) { setError('الاسم الكامل لا يمكن أن يتجاوز 100 حرف'); return false; }
    if (!formData.businessName.trim()) { setError('اسم النشاط التجاري مطلوب'); return false; }
    if (formData.businessName.length > 200) { setError('اسم النشاط التجاري لا يمكن أن يتجاوز 200 حرف'); return false; }
    if (formData.selectedCategories.length === 0) { setError('يجب اختيار فئة خدمة واحدة'); return false; }
    if (!selectedAddress && !formData.city) { setError('معلومات العنوان مطلوبة'); return false; }
    return true;
  };

  const validateStep2 = () => {
    if (!formData.minPrice || !formData.maxPrice) { setError('نطاق السعر مطلوب'); return false; }
    const minPriceNum = parseInt(formData.minPrice);
    const maxPriceNum = parseInt(formData.maxPrice);
    if (isNaN(minPriceNum) || isNaN(maxPriceNum)) { setError('يرجى إدخال سعر صحيح'); return false; }
    if (minPriceNum >= maxPriceNum) { setError('يجب أن يكون الحد الأدنى للسعر أقل من الحد الأقصى'); return false; }
    if (minPriceNum < 0 || maxPriceNum > 1000000) { setError('يجب أن يكون نطاق السعر بين 0 و 1,000,000 ل.س'); return false; }
    return true;
  };

  const validateStep3 = () => {
    if (!formData.experienceYears) { setError('سنوات الخبرة مطلوبة'); return false; }
    const expYears = parseInt(formData.experienceYears);
    if (isNaN(expYears) || expYears < 0 || expYears > 50) { setError('يجب أن تكون سنوات الخبرة بين 0 و 50 عاماً'); return false; }
    if (formData.selectedExpertise.length === 0) { setError('يجب عليك اختيار مجال تخصص واحد على الأقل'); return false; }
    if (formData.selectedExpertise.some(e => !String(e.startingPrice || '').trim() || Number(e.startingPrice) <= 0)) {
      setError('يرجى إدخال سعر البداية لكل تخصص اخترته');
      return false;
    }
    
    // Uzmanlık fiyatlarının max fiyattan büyük olmaması kontrolü
    const maxPriceNum = parseInt(formData.maxPrice);
    if (!isNaN(maxPriceNum) && maxPriceNum > 0) {
      for (const expertise of formData.selectedExpertise) {
        const expertisePrice = Number(expertise.startingPrice);
        if (expertisePrice > maxPriceNum) {
          setError(`سعر البداية لـ "${sanitizeText(expertise.name)}" (${expertisePrice} ل.س) لا يمكن أن يكون أعلى من الحد الأقصى للسعر (${maxPriceNum} ل.س).`);
          return false;
        }
      }
    }
    
    //if (!formData.identityFile) { setError('Kimlik belgesi yüklemelisiniz'); return false; }

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
      if (!uid) throw new Error('تعذّر العثور على معلومات المستخدم!');

      const formDataObj = new FormData();
      let needsRequest = false;

      /*if (formData.identityFile && !analysisCache.identity) {
        formDataObj.append('identity', formData.identityFile);
        needsRequest = true;
      } */

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

     // let freshResults = { identity: null, certificates: [], taxPlate: null };
     let freshResults = { certificates: [], taxPlate: null };

      if (needsRequest) {
        const token = await auth.currentUser?.getIdToken();
        const verifyRes = await fetch(`${API_BASE_URL}/api/ocr/analyze-batch`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` },
          body: formDataObj
        });

        if (verifyRes.status === 503) {
          const errorData = await verifyRes.json();
          throw new Error(errorData.error || 'خدمة التحقق من المستندات غير متاحة حالياً. يرجى المحاولة مرة أخرى لاحقاً.');
        }
        if (!verifyRes.ok) throw new Error(`HTTP ${verifyRes.status}: ${verifyRes.statusText}`);

        const verifyResult = await verifyRes.json();
        freshResults = verifyResult.results || {};
      }

      const newCache = { ...analysisCache };

      /*if (freshResults.identity) {
        newCache.identity = freshResults.identity;
      } */

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

     /* const mergedResults = {
        identity: newCache.identity || null,
        certificates: formData.certificateFilesList.map((_, idx) => newCache[`certificates_${idx}`]).filter(Boolean),
        taxPlate: newCache.taxPlate || null,
      };*/

      const mergedResults = {
        certificates: formData.certificateFilesList
          .map((_, idx) => newCache[`certificates_${idx}`])
          .filter(Boolean),
        taxPlate: newCache.taxPlate || null,
      };

      setAnalysisResults(mergedResults);
      
      setAnalyzing(false);

      let hasRejection = false;
      let rejectionReason = '';

      /*if (!mergedResults.identity || mergedResults.identity.verdict === 'rejected') {
        hasRejection = true;
        rejectionReason = 'Kimlik belgesi geçersiz';
      }*/

      // Rejection control for certificates
      if (mergedResults.certificates && mergedResults.certificates.length > 0) {
        setError("يرجى تحميل مستندات صالحة والمحاولة مجدداً.");
        return;
      }

      setShowAnalysisModal(false);
      
      setLoading(true);

      const categoryNames = formData.selectedCategories.map(c => c.name).join(', ');
      const specialties = formData.selectedExpertise.map(e => ({
        name: sanitizeText(e.name).slice(0, 100),
        startingPrice: Number(String(e.startingPrice || "").replace(/[^\d]/g, "")) || 0,
      }));
      /*const allFiles = [
        formData.identityFile,
        ...formData.certificateFilesList,
        ...(formData.taxPlateFile ? [formData.taxPlateFile] : [])
      ].filter(Boolean); */

      const allFiles = [
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
          addressName: selectedAddress?.addressName ? sanitizeText(selectedAddress.addressName).slice(0, 200) : "عنوان العمل",
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

          /*ocrResults: {
            identity: mergedResults.identity,
            certificates: mergedResults.certificates,
            taxPlate: mergedResults.taxPlate,
            verifiedAt: new Date().toISOString()
          }*/

            ocrResults: {
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
      setError('حدث خطأ أثناء إكمال الملف الشخصي. يرجى المحاولة مرة أخرى لاحقاً.');
      setAnalyzing(false);
      setLoading(false);
      setShowAnalysisModal(false);
    }
  };

  const AnalysisModal = () => {
    if (!showAnalysisModal) return null;

    const results = analysisResults;

    /* const hasRejection = results && (
      !results.identity ||
      results.identity.verdict === 'rejected' ||
      (results.certificates && results.certificates.length > 0
        ? results.certificates.every(c => c.verdict === 'rejected')
        : false) ||
      (formData.providerType === 'company' && (!results.taxPlate || results.taxPlate.verdict === 'rejected'))
    ); */

    const hasRejection = results && (
      (results.certificates && results.certificates.length > 0
        ? results.certificates.every(c => c.verdict === 'rejected')
        : false)
    );

    const headerTitle = analyzing
      ? 'جاري تحليل المستندات'
      : hasRejection
        ? 'فشل التحقق من المستندات'
        : 'اكتمل تحليل المستندات';

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
                <p>جاري فحص المستندات التي قمت برفعها...</p>
                <p className="loading-text">يتم التحقق من الشهادات واللوحة الضريبية.</p>
                <small>قد تستغرق هذه العملية 5-10 ثوانٍ.</small>
              </div>
            ) : (
              <div className="analysis-results">
                {/* Eski kimlik analizi UI kodu gerektiğinde geri açılabilir.
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
                */}

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
                        <strong>الشهادة {idx + 1}</strong>
                        <span className={`verdict-badge ${cert.verdict}`}>
                          {cert.verdict === 'approved' ? 'مقبول' :
                           cert.verdict === 'rejected' ? 'مرفوض' : 'قيد المراجعة'}
                        </span>
                      </div>
                      <p className="result-reason">{sanitizeText(cert.reason)}</p>
                      {cert.verdict === 'rejected' && (
                        <div className="error-detail">
                          <i className="fas fa-info-circle"></i>
                          <span>لم يتم إكمال تسجيلك بسبب هذا المستند.</span>
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
                        <strong>اللوحة الضريبية</strong>
                        <span className={`verdict-badge ${results.taxPlate.verdict}`}>
                          {results.taxPlate.verdict === 'approved' ? 'مقبول' :
                           results.taxPlate.verdict === 'rejected' ? 'مرفوض' : 'قيد المراجعة'}
                        </span>
                      </div>
                      <p className="result-reason">{sanitizeText(results.taxPlate.reason)}</p>
                      {results.taxPlate.verdict === 'rejected' && (
                        <div className="error-detail">
                          <i className="fas fa-info-circle"></i>
                          <span>لم يتم إكمال تسجيلك بسبب هذا المستند.</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {hasRejection && (
                  <div className="rejection-warning">
                    <i className="fas fa-exclamation-triangle"></i>
                    <p>تعذّر إكمال تسجيلك للأسباب المذكورة أعلاه. يرجى تحميل مستندات صالحة والمحاولة مجدداً.</p>
                  </div>
                )}

                {!hasRejection && results && (
                  <div className="success-warning">
                    <i className="fas fa-check-circle"></i>
                    <p>تم التحقق من المستندات بنجاح! جاري حفظ ملفك الشخصي...</p>
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
                إغلاق وتعديل
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
          <LoadingSpinner text="جاري التحميل..." />
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
              <h3>اكتمل الملف الشخصي!</h3>
              <p>تم إنشاء ملفك الشخصي بنجاح. بعد موافقة المسؤول، ستتمكن من تسجيل الدخول كخبير.</p>
              <p className="info-text">سيتم إعلامك عبر رسالة SMS عند اكتمال عملية الموافقة.</p>
              <p className="redirect-text">جاري إعادة توجيهك إلى صفحة الإعلانات...</p>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="expert-complete-page" dir="rtl">
      <Navbar />
      
      <main className="app-main">
        <div className="app-container">
          <div className="app-title-section">
            <h1>إكمال الملف الشخصي</h1>
            <p>أدخل معلومات تخصصك</p>
          </div>

          <div className="form-container">
            <div className="step-indicator">
              {[1, 2, 3].map(step => (
                <React.Fragment key={step}>
                  <div className={`step-item ${currentStep === step ? 'active' : ''} ${currentStep > step ? 'completed' : ''}`} data-step={step}>
                    <div className="step-circle">{step}</div>
                    <span className="step-label">
                      {step === 1 && 'المنشأة'}
                      {step === 2 && 'العمل'}
                      {step === 3 && 'الخبرة المهنية'}
                    </span>
                  </div>
                  {step < 3 && <div className="step-line"></div>}
                </React.Fragment>
              ))}
            </div>

            {currentStep === 1 && (
              <div className="form-step active">
                <h2 className="step-title">معلومات المنشأة</h2>
                <div className="form-grid">
                  <div className="form-group full-width">
                    <label className="form-label">
                      <i className="fas fa-user"></i>
                      الاسم الكامل <span className="required">*</span>
                    </label>
                    <input type="text" className="form-input" value={formData.fullName}
                      onChange={(e) => setFormData({...formData, fullName: e.target.value.slice(0, 100)})}
                      placeholder="الاسم الكامل" required disabled={loading || analyzing} maxLength="100" />
                  </div>

                  <div className="form-group full-width">
                    <label className="form-label">
                      <i className="fas fa-building"></i>
                      اسم المنشأة / الاسم التجاري <span className="required">*</span>
                    </label>
                    <input type="text" className="form-input" value={formData.businessName}
                      onChange={(e) => setFormData({...formData, businessName: e.target.value.slice(0, 200)})}
                      placeholder="اسم المنشأة أو اسمك التجاري" required disabled={loading || analyzing} maxLength="200" />
                  </div>

                  {/* Business type cards and tax number inputs removed for individual-only setup */}

                  <div className="form-group full-width">
                    <label className="form-label">
                      <i className="fas fa-tags"></i>
                      فئة الخدمة <span className="required">*</span>
                      <span className="selected-count">يمكن اختيار فئة واحدة فقط</span>
                    </label>
                    <div className="categories-grid">
                      {categoriesData.map(category => (
                        <div key={category.id}
                          className={`category-item ${formData.selectedCategories.some(c => c.name === category.name && !c.isCustom) ? 'selected' : ''}`}
                          onClick={() => toggleCategory(category.name)}>
                          {toArabicServiceLabel(category.name)}
                        </div>
                      ))}
                      <div className={`category-item other-category ${formData.showCustomCategoryInput ? 'selected' : ''}`}
                        onClick={() => setFormData(prev => ({...prev, showCustomCategoryInput: true}))}>
                        <i className="fas fa-plus"></i> أخرى
                      </div>
                    </div>

                    {formData.showCustomCategoryInput && (
                      <div className="custom-category-section">
                        <div className="expertise-add">
                          <input type="text" className="form-input" value={formData.customCategoryInput}
                            onChange={(e) => setFormData({...formData, customCategoryInput: e.target.value.slice(0, 100)})}
                            placeholder="اكتب اسم الفئة..." autoFocus disabled={loading || analyzing} maxLength="100" />
                          <button type="button" className="btn-add" onClick={addCustomCategory} disabled={loading || analyzing}>
                            <i className="fas fa-plus"></i> إضافة
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
                        <label className="form-label small">الفئات التي أضفتها:</label>
                        <div className="custom-items-tags">
                          {formData.selectedCategories.filter(c => c.isCustom).map((category, index) => (
                            <div key={index} className="custom-item-tag">
                              <span>{toArabicServiceLabel(category.name)}</span>
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
                      معلومات العنوان <span className="required">*</span>
                      <span className="address-hint">(يرجى إدخال عنوان مقر العمل الخاص بك)</span>
                    </label>
                    <button type="button" className="btn-add" onClick={openAddressModal}
                      style={{ marginBottom: '15px', width: '100%' }} disabled={loading || analyzing}>
                      <i className="fas fa-plus"></i>
                      {selectedAddress ? 'تعديل العنوان' : 'إضافة / اختيار العنوان'}
                    </button>
                    {selectedAddress && (
                      <div className="custom-items-list">
                        <div className="custom-item-tag" style={{ width: '100%', justifyContent: 'space-between' }}>
                          <div>
                            <i className="fas fa-home"></i>
                            <strong>{sanitizeText(selectedAddress.addressName || 'العنوان المسجل')}</strong>
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
                <h2 className="step-title">تفاصيل العمل</h2>
                <div className="form-grid">
                  <div className="form-group">
                    <label className="form-label"><i className="fas fa-tag"></i> الحد الأدنى للسعر (ل.س) <span className="required">*</span></label>
                    <input type="number" className="form-input" value={formData.minPrice}
                      onChange={(e) => setFormData({...formData, minPrice: e.target.value.slice(0, 10)})}
                      placeholder="الحد الأدنى" min="0" max="1000000" required disabled={loading || analyzing} />
                  </div>
                  <div className="form-group">
                    <label className="form-label"><i className="fas fa-tag"></i> الحد الأقصى للسعر (ل.س) <span className="required">*</span></label>
                    <input type="number" className="form-input" value={formData.maxPrice}
                      onChange={(e) => setFormData({...formData, maxPrice: e.target.value.slice(0, 10)})}
                      placeholder="الحد الأقصى" min="0" max="1000000" required disabled={loading || analyzing} />
                  </div>

                  <div className="form-group full-width">
                    <label className="form-label"><i className="fas fa-coins"></i> نموذج التسعير <span className="required">*</span></label>
                    <div className="pricing-type-group">
                      <label className="pricing-option">
                        <input type="radio" name="pricingModel" checked={formData.pricingModel === 'Proje Bazlı'}
                          onChange={() => setFormData({...formData, pricingModel: 'Proje Bazlı'})} disabled={loading || analyzing} />
                        <span>مشروع كامل</span>
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {currentStep === 3 && (
              <div className="form-step active">
                <h2 className="step-title">الخبرة المهنية</h2>
                <div className="form-grid">
                  <div className="form-group">
                    <label className="form-label"><i className="fas fa-briefcase"></i> سنوات الخبرة <span className="required">*</span></label>
                    <input type="number" name="experienceYears" className="form-input" value={formData.experienceYears}
                      onChange={(e) => setFormData({...formData, experienceYears: e.target.value.slice(0, 2)})}
                      placeholder="مثال: 5" min="0" max="50" required disabled={loading || analyzing} />
                  </div>
                  <div className="form-group">
                    <label className="form-label"><i className="fas fa-graduation-cap"></i> المعلومات التعليمية <span className="optional">(اختياري)</span></label>
                    <input type="text" className="form-input" value={formData.educationInfo}
                      onChange={(e) => setFormData({...formData, educationInfo: e.target.value.slice(0, 500)})}
                      placeholder="المدرسة / القسم" disabled={loading || analyzing} maxLength="500" />
                  </div>

                  <div className="form-group full-width">
                    <label className="form-label">
                      <i className="fas fa-star"></i> مجالات التخصص <span className="required">*</span>
                      <span className="selected-count">تم تحديد {formData.selectedExpertise.length}</span>
                    </label>
                    {availableExpertise.length > 0 && (
                      <div className="categories-grid">
                        {availableExpertise.map((expertise, index) => (
                          <div key={index}
                            className={`category-item ${formData.selectedExpertise.some(e => e.name === expertise && !e.isCustom) ? 'selected' : ''}`}
                            onClick={() => toggleExpertise(expertise)}>
                            {toArabicServiceLabel(expertise)}
                          </div>
                        ))}
                        <div className={`category-item other-category ${formData.showCustomExpertiseInput ? 'selected' : ''}`}
                          onClick={() => setFormData(prev => ({...prev, showCustomExpertiseInput: true}))}>
                          <i className="fas fa-plus"></i> أخرى
                        </div>
                      </div>
                    )}

                    {formData.showCustomExpertiseInput && (
                      <div className="custom-category-section">
                        <div className="expertise-add">
                          <input type="text" className="form-input" value={formData.customExpertiseInput}
                            onChange={(e) => setFormData({...formData, customExpertiseInput: e.target.value.slice(0, 100)})}
                            placeholder="اكتب مجال التخصص..." autoFocus disabled={loading || analyzing} maxLength="100" />
                          <button type="button" className="btn-add" onClick={addCustomExpertise} disabled={loading || analyzing}>
                            <i className="fas fa-plus"></i> إضافة
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
                        <label className="form-label small">مجالات التخصص التي أضفتها:</label>
                        <div className="custom-items-tags">
                          {formData.selectedExpertise.filter(e => e.isCustom).map((expertise, index) => (
                            <div key={index} className="custom-item-tag">
                              <span>{toArabicServiceLabel(expertise.name)}</span>
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
                          أسعار البداية <span className="required">*</span>
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
                                  placeholder="مثال: 600"
                                  disabled={loading || analyzing}
                                  required
                                  maxLength="10"
                                />
                                <span style={{ color: 'var(--text-muted)', fontWeight: 700 }}>ل.س</span>
                              </div>
                              <small style={{ color: 'var(--text-muted)' }}>
                                سعر البداية لـ “{sanitizeText(e.name)}”
                              </small>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="form-group full-width">
                    <label className="form-label"><i className="fas fa-file-upload"></i> المستندات</label>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px', marginTop: '15px' }}>

                      <div className="upload-card">
                        <div className="upload-card-header">
                          <i className="fas fa-certificate"></i>
                          <span>الشهادات <span className="optional">(اختياري)</span></span>
                        </div>
                        <div className="upload-card-body">
                          <input type="file" id="certificate-upload-input" accept=".pdf,.jpg,.jpeg,.png" multiple
                            onChange={handleCertificateUpload} style={{ display: 'none' }} disabled={loading || analyzing} />
                          <button type="button" className="btn-upload"
                            onClick={() => document.getElementById('certificate-upload-input').click()} disabled={loading || analyzing}>
                            <i className="fas fa-upload"></i> اختر ملفاً
                          </button>
                          <small>PDF, JPG, PNG (بحد أقصى 5MB) - يمكنك تحديد ملفات متعددة (اختياري)</small>
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
                              <span>اختياري، يمكن تخطيه</span>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Company tax plate upload card removed */}
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
                  <i className="fas fa-arrow-left"></i> رجوع
                </button>
              )}
              {currentStep < totalSteps ? (
                <button className="btn btn-primary" onClick={nextStep} disabled={loading || analyzing}>
                  التالي <i className="fas fa-arrow-right"></i>
                </button>
              ) : (
                <button className="btn btn-primary" onClick={handleSubmit}
                  disabled={loading || analyzing} style={{ minWidth: '200px' }}>
                  {loading ? (
                    <span><i className="fas fa-spinner fa-spin"></i> جاري الحفظ...</span>
                  ) : analyzing ? (
                    <span><i className="fas fa-spinner fa-spin"></i> جاري تحليل المستندات...</span>
                  ) : (
                    <span><i className="fas fa-check"></i> حفظ وإنهاء</span>
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

/*
REMOVED BLOCKS FOR SYRIA LAUNCH:
1. Company ("şirket") provider type option.
2. Tax number ("taxNumber") input and validation.
3. Tax plate ("taxPlateFile") upload card and validation.
4. Hourly rate ("saatlik ücret") option (was already not present in Arabic).
*/
