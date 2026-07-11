import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, collection, getDocs } from "firebase/firestore"; 
import Navbar from "../components/Navbar";
import LoadingSpinner from "../components/LoadingSpinner";
import { auth, db } from "../firebase/firebaseClient"; 
import { createListing } from "../services/listingsApi";
import DOMPurify from 'dompurify';
import { getListingImageStyle, normalizeListingImageCrop } from "../utils/listingImagePresentation";
import "../styles/ExpertCreateAdPage.css";

const isDevelopment = process.env.NODE_ENV === 'development';

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

const INITIAL_FORM = {
  title: "",
  category: "",
  serviceSubcategory: "",
  serviceSubcategoryDetails: "",
  price: "",
  city: "",
  pricingType: "Proje Bazlı",
  description: "",
  coverImage: null,
  expertEmail: "",
};

const DEFAULT_IMAGE_CROP = { x: 50, y: 50, scale: 1 };

const STEP_TITLES = [
  "معلومات عامة",
  "تفاصيل إضافية",
  "الصورة الرئيسية",
];

// DÜZELTİLDİ - Dosya boyutu kontrolü düzeltildi
function fileToDataUrl(file, crop = DEFAULT_IMAGE_CROP) {
  if (!file) return Promise.resolve("");
  
  // Dosya boyutunu kontrol et (5MB)
  if (file.size > 5 * 1024 * 1024) {
    return Promise.reject(new Error("لا يمكن أن تتجاوز الصورة الرئيسية 5 ميغابايت."));
  }
  
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
  if (!allowedTypes.includes(file.type)) {
    return Promise.reject(new Error("يمكنك فقط تحميل ملفات بصيغة JPEG أو PNG أو WEBP."));
  }
  
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const src = String(reader.result || "");
      const image = new Image();

      image.onload = () => {
        try {
          const safeCrop = normalizeListingImageCrop(crop);
          const canvas = document.createElement("canvas");
          const outputSize = 1200;

          canvas.width = outputSize;
          canvas.height = outputSize;

          const context = canvas.getContext("2d");
          if (!context) {
            reject(new Error("فشل معالجة الصورة الرئيسية."));
            return;
          }

          const coverScale = Math.max(
            outputSize / image.naturalWidth,
            outputSize / image.naturalHeight
          );
          const finalScale = coverScale * safeCrop.scale;
          const drawWidth = image.naturalWidth * finalScale;
          const drawHeight = image.naturalHeight * finalScale;
          const offsetX = (outputSize - drawWidth) * (safeCrop.x / 100);
          const offsetY = (outputSize - drawHeight) * (safeCrop.y / 100);

          context.clearRect(0, 0, outputSize, outputSize);
          context.drawImage(image, offsetX, offsetY, drawWidth, drawHeight);

          const mimeType =
            file.type === "image/png" || file.type === "image/webp"
              ? file.type
              : "image/jpeg";

          resolve(canvas.toDataURL(mimeType, 0.92));
        } catch {
          reject(new Error("Kapak fotoğrafı işlenemedi."));
        }
      };

      image.onerror = () => reject(new Error("فشل قراءة الصورة الرئيسية."));
      image.src = src;
    };
    reader.onerror = () => reject(new Error("فشل قراءة الصورة الرئيسية."));
    reader.readAsDataURL(file);
  });
}

export default function ExpertCreateAdPage() {
  const navigate = useNavigate();
  const [authLoading, setAuthLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState(null);
  const [providerSpecialties, setProviderSpecialties] = useState([]);
  const [currentStep, setCurrentStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [formData, setFormData] = useState(INITIAL_FORM);
  const [coverPreview, setCoverPreview] = useState("");
  const [coverCrop, setCoverCrop] = useState(DEFAULT_IMAGE_CROP);
  const [isDraggingPreview, setIsDraggingPreview] = useState(false);
  const [showExitConfirm, setShowExitConfirm] = useState(false);

  const [categoriesData, setCategoriesData] = useState([]);
  const [cityOptions, setCityOptions] = useState([]);
  const [loadingData, setLoadingData] = useState(true);

  const selectedSpecialtyMinPrice = useMemo(() => {
    const name = String(formData?.serviceSubcategory || "").trim();
    if (!name) return 0;
    const match = providerSpecialties.find((s) => s?.name === name);
    return Math.max(0, Number(match?.startingPrice) || 0);
  }, [formData?.serviceSubcategory, providerSpecialties]);

  const hasUnsavedChanges = useMemo(() => {
    const fd = formData || INITIAL_FORM;
    return (
      String(fd.title || "").trim() ||
      String(fd.category || "").trim() ||
      String(fd.price || "").trim() ||
      String(fd.pricingType || "").trim() ||
      String(fd.description || "").trim() ||
      !!fd.coverImage
    );
  }, [formData]);

  const handleExit = () => {
    if (saving) return;
    if (hasUnsavedChanges) {
      setShowExitConfirm(true);
      return;
    }
    navigate("/uzman/ilanlarim");
  };

  const confirmExit = () => {
    setShowExitConfirm(false);
    navigate("/uzman/ilanlarim");
  };

  useEffect(() => {
    if (!showExitConfirm) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e) => {
      if (e.key === "Escape" && !saving) setShowExitConfirm(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [showExitConfirm, saving]);

  useEffect(() => {
    let mounted = true;

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!mounted) return;

      if (!user) {
        navigate("/login", { replace: true });
        return;
      }

      try {
        const userDoc = await getDoc(doc(db, "users", user.uid));
        
        if (!userDoc.exists()) {
          navigate("/login", { replace: true });
          return;
        }

        const userData = userDoc.data();
        
        if (userData.userType !== "PROVIDER") {
          navigate("/ilanlar", { replace: true });
          return;
        }
        
        setCurrentUser(user);

        try {
          const providerDoc = await getDoc(doc(db, "service_providers", user.uid));
          const providerData = providerDoc.exists() ? providerDoc.data() : {};
          const meslek = String(providerData?.category || "").split(",")[0].trim();
          if (mounted && meslek) {
            setFormData((prev) => ({ ...prev, category: meslek }));
          }
          if (mounted) {
            const normalized = normalizeSpecialties(providerData?.specialties);
            setProviderSpecialties(normalized);
          }
        } catch (e) {
          if (isDevelopment) console.warn("service_providers category okunamadı:", e.message);
          if (mounted) setProviderSpecialties([]);
        }
        
        let expertCity = "";
        
        try {
          const addressesRef = collection(db, "users", user.uid, "addresses");
          const addressesSnap = await getDocs(addressesRef);
          const mainAddress = addressesSnap.docs.find(doc => doc.data().isMain === true) || addressesSnap.docs[0];
          
          if (mainAddress) {
            const addressData = mainAddress.data();
            expertCity = addressData.city || "";
          }
        } catch (err) {
          if (isDevelopment) console.error("Adresler çekilemedi:", err.message);
        }
        
        if (mounted) {
          setFormData(prev => ({
            ...prev,
            expertEmail: userData.email || user.email || "",
            city: expertCity,
          }));
        }
        
        setAuthLoading(false);
        
      } catch (error) {
        if (isDevelopment) console.error("Kontrol hatası:", error.message);
        navigate("/login", { replace: true });
      }
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [navigate]);

  useEffect(() => {
    let ignore = false;

    const loadData = async () => {
      try {
        setLoadingData(true);
        
        const categoriesResponse = await fetch("/expert-data.json");
        const categoriesJson = await categoriesResponse.json();
        if (!ignore) {
          setCategoriesData(categoriesJson.categories || []);
        }

        const citiesResponse = await fetch("/cities.json");
        const citiesJson = await citiesResponse.json();
        if (!ignore) {
          const cities = Array.isArray(citiesJson?.cities) ? citiesJson.cities : [];
          setCityOptions(cities);
        }
      } catch (error) {
        if (isDevelopment) console.error("Veriler yüklenirken hata:", error.message);
        if (!ignore) {
          setCategoriesData([]);
          setCityOptions([]);
        }
      } finally {
        if (!ignore) setLoadingData(false);
      }
    };

    loadData();

    return () => { ignore = true; };
  }, []);

  useEffect(() => {
    const specialty = String(formData?.serviceSubcategory || "").trim();
    if (!specialty) return;

    const minPrice = selectedSpecialtyMinPrice;
    if (!minPrice) return;

    // Uzmanlık değiştiğinde başlangıç fiyatını otomatik çek.
    setFormData((prev) => ({ ...prev, price: String(minPrice) }));
  }, [formData?.serviceSubcategory, selectedSpecialtyMinPrice]);

  const onChange = (event) => {
    const { name, value } = event.target;

    if (name === "price") {
      if (value === "") {
        setFormData((prev) => ({ ...prev, price: "" }));
        return;
      }

      // Serbest yazıma izin ver: min kontrolünü uyarı + submit validasyonunda yapacağız.
      // Sadece sayısal olmayan karakterleri kırp.
      const sanitized = String(value).replace(/[^\d]/g, "");
      setFormData((prev) => ({ ...prev, price: sanitized }));
      return;
    }

    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  // DÜZELTİLDİ - Dosya boyutu kontrolü düzeltildi
  const handleCoverImageChange = (event) => {
    const file = event.target.files?.[0] || null;
    
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        setErrorMsg("لا يمكن أن تتجاوز الصورة الرئيسية 5 ميغابايت.");
        event.target.value = '';
        return;
      }
      const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
      if (!allowedTypes.includes(file.type)) {
        setErrorMsg("يمكنك فقط تحميل ملفات بصيغة JPEG أو PNG أو WEBP.");
        event.target.value = '';
        return;
      }
    }
    
    setFormData((prev) => ({ ...prev, coverImage: file }));
    setSuccessMsg("");
    setErrorMsg("");
    setCoverCrop({ ...DEFAULT_IMAGE_CROP });

    if (!file) {
      setCoverPreview("");
      return;
    }

    const previewUrl = URL.createObjectURL(file);
    setCoverPreview(previewUrl);
  };

  const updateCoverCrop = (nextCrop) => {
    setCoverCrop((prev) => normalizeListingImageCrop(typeof nextCrop === "function" ? nextCrop(prev) : nextCrop));
  };

  const handlePreviewPointerDown = (event) => {
    if (!coverPreview) return;

    event.preventDefault();
    let lastX = event.clientX;
    let lastY = event.clientY;

    setIsDraggingPreview(true);

    const handleMove = (moveEvent) => {
      const deltaX = moveEvent.clientX - lastX;
      const deltaY = moveEvent.clientY - lastY;

      lastX = moveEvent.clientX;
      lastY = moveEvent.clientY;

      updateCoverCrop((prev) => ({
        ...prev,
        x: prev.x - deltaX / 3,
        y: prev.y - deltaY / 3,
      }));
    };

    const handleUp = () => {
      setIsDraggingPreview(false);
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
  };

  useEffect(() => {
    return () => {
      if (coverPreview) URL.revokeObjectURL(coverPreview);
    };
  }, [coverPreview]);

  const validateStep = () => {
    if (currentStep === 1) {
      if (!formData.title.trim()) return "عنوان الإعلان مطلوب.";
      if (formData.title.length < 5) return "يجب أن يكون عنوان الإعلان 5 أحرف على الأقل.";
      if (formData.title.length > 100) return "لا يمكن أن يتجاوز عنوان الإعلان 100 حرف.";
      if (!formData.category) return "يجب عليك اختيار فئة.";
      if (!String(formData.serviceSubcategory || "").trim()) return "يجب عليك اختيار تخصص.";
      if (!formData.price || Number(formData.price) <= 0) return "يرجى إدخال سعر صالح.";
      if (selectedSpecialtyMinPrice > 0 && Number(formData.price) < selectedSpecialtyMinPrice) {
        return `لا يمكن أن يكون السعر أقل من سعر البداية للتخصص المختار (على الأقل ${Number(selectedSpecialtyMinPrice).toLocaleString("ar-SY")} ل.س).`;
      }
      if (Number(formData.price) > 1000000) return "لا يمكن أن يتجاوز السعر 1,000,000 ل.س.";
      if (!formData.city.trim()) return "معلومات المدينة مطلوبة.";
      return "";
    }

    if (currentStep === 2) {
      if (!formData.description.trim()) return "وصف الإعلان مطلوب.";
      if (formData.description.length < 20) return "يجب أن يكون وصف الإعلان 20 حرفاً على الأقل.";
      if (formData.description.length > 2000) return "لا يمكن أن يتجاوز وصف الإعلان 2000 حرف.";
      return "";
    }

    if (currentStep === 3) {
      if (!formData.coverImage) return "يجب تحميل الصورة الرئيسية.";
      return "";
    }

    return "";
  };

  const goNextStep = () => {
    const validationError = validateStep();
    if (validationError) {
      setErrorMsg(validationError);
      return;
    }
    setErrorMsg("");
    setCurrentStep((prev) => Math.min(3, prev + 1));
  };

  const goPrevStep = () => {
    setErrorMsg("");
    setCurrentStep((prev) => Math.max(1, prev - 1));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    const validationError = validateStep();
    if (validationError) {
      setErrorMsg(validationError);
      return;
    }

    try {
      setErrorMsg("");
      setSaving(true);
      setSuccessMsg("");

      if (!currentUser) {
        throw new Error("لم يتم العثور على الجلسة. يرجى تسجيل الدخول مرة أخرى.");
      }

      const imageDataUrl = await fileToDataUrl(formData.coverImage, coverCrop);
      if (!imageDataUrl) {
        throw new Error("يجب تحميل الصورة الرئيسية.");
      }

      const result = await createListing(currentUser, {
        title: sanitizeText(formData.title).slice(0, 100),
        category: sanitizeText(formData.category).slice(0, 100),
        serviceSubcategory: sanitizeText(String(formData.serviceSubcategory || "").trim()).slice(0, 100),
        serviceSubcategoryDetails: sanitizeText(String(formData.serviceSubcategoryDetails || "").trim()).slice(0, 500),
        description: sanitizeText(formData.description).slice(0, 2000),
        pricingType: sanitizeText(formData.pricingType).slice(0, 50),
        city: sanitizeText(formData.city).slice(0, 100),
        price: Number(formData.price),
        image: imageDataUrl,
        imageCrop: coverCrop,
        providerEmail: sanitizeText(formData.expertEmail || currentUser.email).slice(0, 254),
        providerId: currentUser.uid,
      });

      const imageUploadFailed =
        String(result?.message || "").toLowerCase().includes("image upload failed") ||
        !!result?.imageUploadError;

      if (imageUploadFailed) {
        setSuccessMsg("تم نشر إعلانك، ولكن تعذر تحميل الصورة الرئيسية.");
        setErrorMsg(result?.imageUploadError ? "تعذر تحميل الصورة الرئيسية." : "");
        return;
      }

      setSuccessMsg("تم نشر إعلانك بنجاح.");
      window.setTimeout(() => {
        navigate("/uzman/ilanlarim");
      }, 700);
    } catch (error) {
      const code = error?.code;
      if (code === "TOTAL_LISTING_LIMIT_REACHED") {
        setErrorMsg(
          "لقد وصلت إلى الحد الأقصى للإعلانات (10/10). لإضافة إعلان جديد، يجب عليك حذف أحد الإعلانات."
        );
      } else if (code === "SPECIALTY_LIMIT_REACHED") {
        setErrorMsg(
          "تم الوصول للحد الأقصى لهذا التخصص. يمكنك إنشاء إعلانيين كحد أقصى لنفس التخصص."
        );
      } else {
        setErrorMsg(error.message || "حدث خطأ أثناء حفظ الإعلان. يرجى المحاولة مرة أخرى لاحقاً.");
      }
    } finally {
      setSaving(false);
    }
  };

  const renderStepOne = () => (
    <div className="expert-create-ad-step-body">

      <div className="expert-create-ad-grid">
        <label className="expert-create-ad-field">
          عنوان الإعلان
          <input
            type="text"
            name="title"
            value={formData.title}
            onChange={onChange}
            placeholder="مثال: خدمة تنظيف احترافية"
            required
            maxLength="100"
          />
        </label>

        <label className="expert-create-ad-field">
          الفئة
          <select name="category" value={formData.category} onChange={onChange} required disabled>
            <option value="">اختر فئة</option>
            {categoriesData.map((category) => (
              <option key={category.id} value={sanitizeText(category.name)}>
                {sanitizeText(category.name)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="expert-create-ad-grid">
        <label className="expert-create-ad-field">
          التخصص
          <select
            name="serviceSubcategory"
            value={formData.serviceSubcategory}
            onChange={onChange}
            required
            disabled={!providerSpecialties.length}
          >
            <option value="">اختر تخصصاً</option>
            {providerSpecialties.map((s) => (
              <option key={s.name} value={s.name}>
                {sanitizeText(s.name)}
              </option>
            ))}
          </select>
          {!providerSpecialties.length ? (
            <small className="city-error" style={{ display: "block", marginTop: 6 }}>
              ⚠️ لم يتم العثور على تخصص في ملفك الشخصي. يرجى إكمال ملف الخبير أولاً.
            </small>
          ) : null}
        </label>

        <label className="expert-create-ad-field">
          التفاصيل
          <input
            type="text"
            name="serviceSubcategoryDetails"
            value={formData.serviceSubcategoryDetails}
            onChange={onChange}
            placeholder="مثال: كم متر مربع؟ هل المواد مشمولة؟"
            maxLength="500"
          />
        </label>
      </div>

      <div className="expert-create-ad-grid">
        <label className="expert-create-ad-field">
          السعر (ل.س)
          <input
            type="number"
            min={String(selectedSpecialtyMinPrice || 0)}
            max="1000000"
            step="1"
            name="price"
            value={formData.price}
            onChange={onChange}
            placeholder="مثال: 750"
            required
          />
          {selectedSpecialtyMinPrice > 0 && formData.price && Number(formData.price) < selectedSpecialtyMinPrice ? (
            <small className="expert-create-ad-helper expert-create-ad-helper--error">
              يجب أن يكون على الأقل {Number(selectedSpecialtyMinPrice).toLocaleString("ar-SY")} ل.س (
              سعر البداية لـ {sanitizeText(String(formData.serviceSubcategory || "").trim())}).
            </small>
          ) : selectedSpecialtyMinPrice > 0 ? (
            <small className="expert-create-ad-helper">
              سعر البداية لـ {sanitizeText(String(formData.serviceSubcategory || "").trim())}:{" "}
              {Number(selectedSpecialtyMinPrice).toLocaleString("ar-SY")} ل.س
            </small>
          ) : (
            <small className="expert-create-ad-helper expert-create-ad-helper--spacer" aria-hidden="true">
              &nbsp;
            </small>
          )}
        </label>

        <label className="expert-create-ad-field">
          نوع الخدمة
          <select name="pricingType" value={formData.pricingType} onChange={onChange}>
            <option value="Proje Bazlı">حسب المشروع</option>
          </select>
          <small className="expert-create-ad-helper expert-create-ad-helper--spacer" aria-hidden="true">&nbsp;</small>
        </label>
      </div>

      <div className="expert-create-ad-grid">
        <label className="expert-create-ad-field">
          المدينة
          {formData.city ? (
            <span className="expert-create-ad-badge expert-create-ad-badge--auto">
            </span>
          ) : null}
          
          <input 
            type="hidden" 
            name="city" 
            value={formData.city} 
          />
          
          <div className="city-display-field">
            <input
              type="text"
              value={sanitizeText(formData.city || "لم يتم العثور على معلومات المدينة")}
              readOnly
              disabled
              className="city-readonly-field"
            />
            {!formData.city && (
              <small className="city-error">
                ⚠️ لم يتم الحصول على معلومات المدينة. يرجى إضافة عنوان في ملفك الشخصي.
              </small>
            )}
          </div>
        </label>
      </div>
    </div>
  );

  const renderStepTwo = () => (
    <div className="expert-create-ad-step-body">
      <label>
        وصف الإعلان
        <textarea
          name="description"
          value={formData.description}
          onChange={onChange}
          rows={8}
          placeholder="اشرح عملك والخدمة التي تقدمها بالتفصيل. الخدمات المقدمة، ساعات العمل، معلومات إضافية..."
          required
          maxLength="2000"
        />
        <small className="char-counter">{formData.description.length}/2000</small>
      </label>
    </div>
  );

  const renderStepThree = () => (
    <div className="expert-create-ad-step-body">
      <div className="expert-create-ad-cover-grid">
        <label className="expert-create-ad-cover-upload">
          <span>تحميل الصورة الرئيسية</span>
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={handleCoverImageChange}
            required
          />
          <small>الصيغ المدعومة: PNG, JPG, WEBP (بحد أقصى 5MB)</small>
        </label>

        <div className="expert-create-ad-cover-preview-card">
          <div
            className={`expert-create-ad-cover-preview expert-create-ad-cover-preview--round ${isDraggingPreview ? "dragging" : ""}`}
            onPointerDown={handlePreviewPointerDown}
            role={coverPreview ? "presentation" : undefined}
          >
            {coverPreview ? (
              <img
                src={coverPreview}
                alt="معاينة الصورة"
                style={getListingImageStyle({ imageCrop: coverCrop })}
                draggable="false"
              />
            ) : (
              <div className="expert-create-ad-cover-placeholder">
                <i className="fas fa-image"></i>
                <p>ستظهر صورتك الرئيسية هنا بشكل دائري</p>
              </div>
            )}
          </div>

          {coverPreview ? (
            <div className="expert-create-ad-cover-controls">
              <label className="expert-create-ad-cover-slider">
                <span>تكبير/تصغير</span>
                <input
                  type="range"
                  min="1"
                  max="2.5"
                  step="0.05"
                  value={coverCrop.scale}
                  onChange={(event) =>
                    updateCoverCrop((prev) => ({
                      ...prev,
                      scale: Number(event.target.value),
                    }))
                  }
                />
              </label>

              <button
                type="button"
                className="expert-create-ad-reset-crop"
                onClick={() => setCoverCrop({ ...DEFAULT_IMAGE_CROP })}
              >
                إعادة تعيين الموضع
              </button>

              <p className="expert-create-ad-cover-hint">
                اسحب الصورة بالماوس أو بإصبعك لضبط كيفية ظهورها داخل الإطار الدائري.
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );

  if (authLoading || loadingData) {
    return (
      <div className="expert-create-ad-page">
        <Navbar />
        <LoadingSpinner text="جاري تحميل لوحة التحكم..." />
      </div>
    );
  }

  return (
    <div className="expert-create-ad-page">
      <Navbar />

      <main className="expert-create-ad-main">
        <section className="expert-create-ad-hero">
          <p className="expert-create-ad-kicker">لوحة التحكم للخبير</p>
          <h1>إنشاء إعلان</h1>
          <p>
            أنشئ إعلانك خطوة بخطوة. أولاً المعلومات العامة، ثم التفاصيل، وأخيراً أضف الصورة الرئيسية.
          </p>
        </section>

        <section className="expert-create-ad-card">
          <div className="expert-create-ad-stepper">
            {STEP_TITLES.map((title, index) => {
              const step = index + 1;
              const stateClass =
                currentStep === step ? "active" : currentStep > step ? "done" : "";
              return (
                <div key={title} className={`expert-create-ad-step ${stateClass}`}>
                  <span className="expert-create-ad-step-index">{step}</span>
                  <span className="expert-create-ad-step-title">{title}</span>
                </div>
              );
            })}
          </div>

          <form className="expert-create-ad-form" onSubmit={handleSubmit}>
            {currentStep === 1 && renderStepOne()}
            {currentStep === 2 && renderStepTwo()}
            {currentStep === 3 && renderStepThree()}

            {errorMsg && <p className="expert-create-ad-error">{sanitizeText(errorMsg)}</p>}
            {successMsg && <p className="expert-create-ad-success">{sanitizeText(successMsg)}</p>}

            <div className="expert-create-ad-actions">
              {currentStep === 1 ? (
                <button
                  type="button"
                  className="expert-create-ad-btn secondary"
                  onClick={handleExit}
                  disabled={saving}
                >
                  خروج
                </button>
              ) : (
                <button
                  type="button"
                  className="expert-create-ad-btn secondary"
                  onClick={goPrevStep}
                  disabled={saving}
                >
                  رجوع
                </button>
              )}

              {currentStep < 3 ? (
                <button
                  type="button"
                  className="expert-create-ad-btn primary"
                  onClick={goNextStep}
                  disabled={saving}
                >
                  استمرار
                </button>
              ) : (
                <button 
                  type="submit" 
                  className="expert-create-ad-btn primary" 
                  disabled={saving}
                >
                  {saving ? "جاري الحفظ..." : "إكمال الإعلان"}
                </button>
              )}
            </div>
          </form>
        </section>
      </main>

      {showExitConfirm &&
        createPortal(
          <div
            className="expert-create-ad-exit-overlay"
            onClick={() => !saving && setShowExitConfirm(false)}
            role="presentation"
          >
            <div
              className="expert-create-ad-exit-dialog"
              onClick={(e) => e.stopPropagation()}
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="expert-create-ad-exit-title"
              aria-describedby="expert-create-ad-exit-desc"
            >
              <div className="expert-create-ad-exit-icon" aria-hidden="true">
                <i className="fas fa-door-open" />
              </div>
              <h3 id="expert-create-ad-exit-title">هل تريد الخروج من الصفحة؟</h3>
              <p id="expert-create-ad-exit-desc">
                أنت تغادر صفحة إنشاء الإعلان. سيتم حذف جميع المعلومات غير المحفوظة؛ هذا الإجراء لا يمكن التراجع عنه.
              </p>
              <div className="expert-create-ad-exit-actions">
                <button
                  type="button"
                  className="expert-create-ad-btn secondary"
                  onClick={() => setShowExitConfirm(false)}
                  disabled={saving}
                >
                  إلغاء
                </button>
                <button
                  type="button"
                  className="expert-create-ad-btn expert-create-ad-exit-confirm"
                  onClick={confirmExit}
                  disabled={saving}
                >
                  نعم، اخرج
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}

/*
REMOVED BLOCKS FOR SYRIA LAUNCH:
1. Hourly Rate ("Saatlik Ücret") option from pricingType drop-down selection list.
*/
