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
  "Genel Bilgiler",
  "Detaylı Bilgi",
  "Kapak Fotoğrafı",
];

// DÜZELTİLDİ - Dosya boyutu kontrolü düzeltildi
function fileToDataUrl(file, crop = DEFAULT_IMAGE_CROP) {
  if (!file) return Promise.resolve("");
  
  // Dosya boyutunu kontrol et (5MB)
  if (file.size > 5 * 1024 * 1024) {
    return Promise.reject(new Error("Kapak fotoğrafı 5MB'dan büyük olamaz."));
  }
  
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
  if (!allowedTypes.includes(file.type)) {
    return Promise.reject(new Error("Sadece JPEG, PNG veya WEBP formatında dosya yükleyebilirsiniz."));
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
            reject(new Error("Kapak fotoğrafı işlenemedi."));
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

      image.onerror = () => reject(new Error("Kapak fotoğrafı okunamadı."));
      image.src = src;
    };
    reader.onerror = () => reject(new Error("Kapak fotoğrafı okunamadı."));
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
        setErrorMsg("Kapak fotoğrafı 5MB'dan büyük olamaz.");
        event.target.value = '';
        return;
      }
      const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
      if (!allowedTypes.includes(file.type)) {
        setErrorMsg("Sadece JPEG, PNG veya WEBP formatında dosya yükleyebilirsiniz.");
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
      if (!formData.title.trim()) return "İlan başlığı zorunludur.";
      if (formData.title.length < 5) return "İlan başlığı en az 5 karakter olmalıdır.";
      if (formData.title.length > 100) return "İlan başlığı en fazla 100 karakter olabilir.";
      if (!formData.category) return "Kategori seçmelisiniz.";
      if (!String(formData.serviceSubcategory || "").trim()) return "Uzmanlık seçmelisiniz.";
      if (!formData.price || Number(formData.price) <= 0) return "Geçerli bir ücret giriniz.";
      if (selectedSpecialtyMinPrice > 0 && Number(formData.price) < selectedSpecialtyMinPrice) {
        return `Ücret, seçtiğiniz uzmanlığın başlangıç fiyatından düşük olamaz (en az ${Number(selectedSpecialtyMinPrice).toLocaleString("tr-TR")} TL).`;
      }
      if (Number(formData.price) > 1000000) return "Ücret 1.000.000 TL'den büyük olamaz.";
      if (!formData.city.trim()) return "Şehir bilgisi zorunludur.";
      return "";
    }

    if (currentStep === 2) {
      if (!formData.description.trim()) return "İlan açıklaması zorunludur.";
      if (formData.description.length < 20) return "İlan açıklaması en az 20 karakter olmalıdır.";
      if (formData.description.length > 2000) return "İlan açıklaması en fazla 2000 karakter olabilir.";
      return "";
    }

    if (currentStep === 3) {
      if (!formData.coverImage) return "Kapak fotoğrafı yüklemeniz gerekiyor.";
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
        throw new Error("Oturum bulunamadı. Lütfen tekrar giriş yapın.");
      }

      const imageDataUrl = await fileToDataUrl(formData.coverImage, coverCrop);
      if (!imageDataUrl) {
        throw new Error("Kapak fotoğrafı yüklemeniz gerekiyor.");
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
        setSuccessMsg("İlanınız yayında, ancak kapak fotoğrafı yüklenemedi.");
        setErrorMsg(result?.imageUploadError ? "Kapak fotoğrafı yüklenemedi." : "");
        return;
      }

      setSuccessMsg("İlanınız başarıyla yayınlandı.");
      window.setTimeout(() => {
        navigate("/uzman/ilanlarim");
      }, 700);
    } catch (error) {
      const code = error?.code;
      if (code === "TOTAL_LISTING_LIMIT_REACHED") {
        setErrorMsg(
          "Toplam ilan limitine ulaştınız (10/10). Yeni ilan eklemek için bir ilanı silmeniz gerekir."
        );
      } else if (code === "SPECIALTY_LIMIT_REACHED") {
        setErrorMsg(
          "Bu uzmanlık için limit dolu. Aynı uzmanlıktan en fazla 2 ilan verebilirsiniz."
        );
      } else {
        setErrorMsg(error.message || "İlan kaydedilirken bir hata oluştu. Lütfen daha sonra tekrar deneyin.");
      }
    } finally {
      setSaving(false);
    }
  };

  const renderStepOne = () => (
    <div className="expert-create-ad-step-body">

      <div className="expert-create-ad-grid">
        <label className="expert-create-ad-field">
          İlan Başlığı
          <input
            type="text"
            name="title"
            value={formData.title}
            onChange={onChange}
            placeholder="Örn: Profesyonel Temizlik Hizmeti"
            required
            maxLength="100"
          />
        </label>

        <label className="expert-create-ad-field">
          Kategori
          <select name="category" value={formData.category} onChange={onChange} required disabled>
            <option value="">Kategori seçiniz</option>
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
          Uzmanlık
          <select
            name="serviceSubcategory"
            value={formData.serviceSubcategory}
            onChange={onChange}
            required
            disabled={!providerSpecialties.length}
          >
            <option value="">Uzmanlık seçiniz</option>
            {providerSpecialties.map((s) => (
              <option key={s.name} value={s.name}>
                {sanitizeText(s.name)}
              </option>
            ))}
          </select>
          {!providerSpecialties.length ? (
            <small className="city-error" style={{ display: "block", marginTop: 6 }}>
              ⚠️ Profilinizde uzmanlık bulunamadı. Lütfen önce uzman profilinizi tamamlayın.
            </small>
          ) : null}
        </label>

        <label className="expert-create-ad-field">
          Ayrıntılar
          <input
            type="text"
            name="serviceSubcategoryDetails"
            value={formData.serviceSubcategoryDetails}
            onChange={onChange}
            placeholder="Örn: Kaç m²? Malzeme dahil mi?"
            maxLength="500"
          />
        </label>
      </div>

      <div className="expert-create-ad-grid">
        <label className="expert-create-ad-field">
          Ücret (TL)
          <input
            type="number"
            min={String(selectedSpecialtyMinPrice || 0)}
            max="1000000"
            step="1"
            name="price"
            value={formData.price}
            onChange={onChange}
            placeholder="Örn: 750"
            required
          />
          {selectedSpecialtyMinPrice > 0 && formData.price && Number(formData.price) < selectedSpecialtyMinPrice ? (
            <small className="expert-create-ad-helper expert-create-ad-helper--error">
              En az {Number(selectedSpecialtyMinPrice).toLocaleString("tr-TR")} TL olmalı (
              {sanitizeText(String(formData.serviceSubcategory || "").trim())} başlangıç fiyatı).
            </small>
          ) : selectedSpecialtyMinPrice > 0 ? (
            <small className="expert-create-ad-helper">
              {sanitizeText(String(formData.serviceSubcategory || "").trim())} başlangıç fiyatı:{" "}
              {Number(selectedSpecialtyMinPrice).toLocaleString("tr-TR")} TL
            </small>
          ) : (
            <small className="expert-create-ad-helper expert-create-ad-helper--spacer" aria-hidden="true">
              &nbsp;
            </small>
          )}
        </label>

        <label className="expert-create-ad-field">
          Hizmet Tipi
          <select name="pricingType" value={formData.pricingType} onChange={onChange}>
            <option value="Proje Bazlı">Proje Bazlı</option>
            <option value="Saatlik Ücret">Saatlik Ücret</option>
          </select>
          <small className="expert-create-ad-helper expert-create-ad-helper--spacer" aria-hidden="true">&nbsp;</small>
        </label>
      </div>

      <div className="expert-create-ad-grid">
        <label className="expert-create-ad-field">
          Şehir
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
              value={sanitizeText(formData.city || "Şehir bilgisi bulunamadı")}
              readOnly
              disabled
              className="city-readonly-field"
            />
            {!formData.city && (
              <small className="city-error">
                ⚠️ Şehir bilgisi alınamadı. Lütfen profilinizden adres ekleyin.
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
        İlan Açıklaması
        <textarea
          name="description"
          value={formData.description}
          onChange={onChange}
          rows={8}
          placeholder="Yaptığınız işi ve sunduğunuz hizmeti detaylı anlatın. Hangi hizmetleri verdiğiniz, çalışma saatleriniz, ek bilgiler..."
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
          <span>Kapak Fotoğrafı Yükle</span>
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={handleCoverImageChange}
            required
          />
          <small>Desteklenen formatlar: PNG, JPG, WEBP (max 5MB)</small>
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
                alt="Kapak önizleme"
                style={getListingImageStyle({ imageCrop: coverCrop })}
                draggable="false"
              />
            ) : (
              <div className="expert-create-ad-cover-placeholder">
                <i className="fas fa-image"></i>
                <p>Kapak fotoğrafınız burada yuvarlak görünecek</p>
              </div>
            )}
          </div>

          {coverPreview ? (
            <div className="expert-create-ad-cover-controls">
              <label className="expert-create-ad-cover-slider">
                <span>Yakınlaştır</span>
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
                Konumu Sıfırla
              </button>

              <p className="expert-create-ad-cover-hint">
                Fotoğrafı fare veya parmağınızla sürükleyip yuvarlak alan içinde nasıl görüneceğini ayarlayın.
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
        <LoadingSpinner text="Uzman paneli yükleniyor..." />
      </div>
    );
  }

  return (
    <div className="expert-create-ad-page">
      <Navbar />

      <main className="expert-create-ad-main">
        <section className="expert-create-ad-hero">
          <p className="expert-create-ad-kicker">Uzman Paneli</p>
          <h1>İlan Ekle</h1>
          <p>
            İlanınızı adım adım oluşturun. Önce genel bilgiler, sonra detaylar ve son olarak
            kapak fotoğrafı ekleyin.
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
                  Çıkış
                </button>
              ) : (
                <button
                  type="button"
                  className="expert-create-ad-btn secondary"
                  onClick={goPrevStep}
                  disabled={saving}
                >
                  Geri
                </button>
              )}

              {currentStep < 3 ? (
                <button
                  type="button"
                  className="expert-create-ad-btn primary"
                  onClick={goNextStep}
                  disabled={saving}
                >
                  Devam Et
                </button>
              ) : (
                <button 
                  type="submit" 
                  className="expert-create-ad-btn primary" 
                  disabled={saving}
                >
                  {saving ? "Kaydediliyor..." : "İlanı Tamamla"}
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
              <h3 id="expert-create-ad-exit-title">Sayfadan çıkılsın mı?</h3>
              <p id="expert-create-ad-exit-desc">
                İlan oluşturma sayfasından ayrılıyorsunuz. Kaydedilmemiş tüm bilgiler silinir; bu işlem
                geri alınamaz.
              </p>
              <div className="expert-create-ad-exit-actions">
                <button
                  type="button"
                  className="expert-create-ad-btn secondary"
                  onClick={() => setShowExitConfirm(false)}
                  disabled={saving}
                >
                  İptal
                </button>
                <button
                  type="button"
                  className="expert-create-ad-btn expert-create-ad-exit-confirm"
                  onClick={confirmExit}
                  disabled={saving}
                >
                  Evet, çık
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
