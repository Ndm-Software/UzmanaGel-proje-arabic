import React, { useEffect, useState } from "react";
import DOMPurify from "dompurify";
import { showAppToast } from "../utils/showAppToast";
import "../styles/AddressModal.css";

const isDevelopment = process.env.NODE_ENV === "development";

const SYRIA_GOVERNORATES = [
  { label: "دمشق (العاصمة)", value: "دمشق" },
  { label: "ريف دمشق", value: "ريف دمشق" },
  { label: "حلب", value: "حلب" },
  { label: "حمص", value: "حمص" },
  { label: "حماة", value: "حماة" },
  { label: "اللاذقية", value: "اللاذقية" },
  { label: "طرطوس", value: "طرطوس" },
  { label: "إدلب", value: "إدلب" },
  { label: "دير الزور", value: "دير الزور" },
  { label: "الرقة", value: "الرقة" },
  { label: "الحسكة", value: "الحسكة" },
  { label: "درعا", value: "درعا" },
  { label: "السويداء", value: "السويداء" },
  { label: "القنيطرة", value: "القنيطرة" },
];

const EMPTY_ADDRESS = {
  governorate: "",
  area: "",
  additionalInfo: "",

  /*
   * حقول التوافق مع البنية الحالية في الـ Backend.
   * لا تظهر هذه الحقول في الواجهة، لكنها تبقى ضمن الكائن المحفوظ.
   */
  addressName: "",
  city: "",
  district: "",
  neighborhood: "",
  street: "",
  siteName: "",
  apartmentName: "",
  blockName: "",
  buildingNo: "",
  floor: "",
  doorNo: "",
  lat: null,
  lng: null,
  coordSource: "Manual",
};

const sanitizeText = (value) => {
  if (value === null || value === undefined) return "";
  return DOMPurify.sanitize(String(value));
};

const normalizeGovernorate = (value) => {
  const normalized = sanitizeText(value).trim();

  // توافق مع أي بيانات قديمة حُفظت بهذا الاسم.
  if (normalized === "دمشق (العاصمة)") return "دمشق";

  return normalized;
};

const createAddressState = (initialData) => {
  if (!initialData) return { ...EMPTY_ADDRESS };

  const governorate = normalizeGovernorate(
    initialData.governorate || initialData.city || ""
  );

  const area = sanitizeText(
    initialData.area ||
      initialData.district ||
      initialData.neighborhood ||
      ""
  ).trim();

  const additionalInfo = sanitizeText(
    initialData.additionalInfo || initialData.street || ""
  ).trim();

  return {
    ...EMPTY_ADDRESS,
    ...initialData,
    governorate,
    area,
    additionalInfo,
  };
};

const AddressModal = ({
  isOpen,
  onClose,
  onSave,
  initialData,
  isEditing,
  mode = "PERMANENT",
}) => {
  const isTemporaryMode = mode === "TEMPORARY";

  const [address, setAddress] = useState(() =>
    createAddressState(initialData)
  );

  useEffect(() => {
    if (!isOpen) return;
    setAddress(createAddressState(initialData));
  }, [initialData, isOpen]);

  useEffect(() => {
    if (!isOpen) return undefined;

    const previousOverflow = document.body.style.overflow;

    const handleEscape = (event) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen, onClose]);

  const handleFieldChange = (field, value) => {
    setAddress((previousAddress) => ({
      ...previousAddress,
      [field]: value,
    }));
  };

  const processSave = () => {
    try {
      const governorate = normalizeGovernorate(address.governorate).slice(
        0,
        100
      );

      const area = sanitizeText(address.area).trim().slice(0, 100);

      const additionalInfo = sanitizeText(address.additionalInfo)
        .trim()
        .slice(0, 300);

      /*
       * ربط حقول الواجهة الجديدة مع حقول الـ Backend الحالية:
       *
       * المحافظة                  -> city
       * المنطقة                    -> district
       * المنطقة                    -> neighborhood
       * معلومات إضافية عن العنوان -> street
       *
       * district وneighborhood يحصلان على قيمة المنطقة نفسها مؤقتاً
       * للمحافظة على التوافق مع الصفحات والخدمات الحالية.
       */
      const dataToSave = {
        ...address,

        // الحقول الجديدة الواضحة للواجهة.
        governorate,
        area,
        additionalInfo,

        // الحقول القديمة التي يعتمد عليها الـ Backend.
        addressName:
          sanitizeText(address.addressName).trim().slice(0, 200) ||
          "عنوان العمل",
        city: governorate,
        district: area,
        neighborhood: area,
        street: additionalInfo,

        // تبقى الحقول التالية موجودة دون عرضها في الواجهة.
        siteName: sanitizeText(address.siteName).slice(0, 200),
        apartmentName: sanitizeText(address.apartmentName).slice(0, 200),
        blockName: sanitizeText(address.blockName).slice(0, 100),
        buildingNo: sanitizeText(address.buildingNo).slice(0, 50),
        floor: sanitizeText(address.floor).slice(0, 50),
        doorNo: sanitizeText(address.doorNo).slice(0, 50),

        lat: address.lat ?? null,
        lng: address.lng ?? null,
        coordSource: address.coordSource || "Manual",
        isTemporary: isTemporaryMode,
      };

      onSave?.(dataToSave);
    } catch (error) {
      if (isDevelopment) {
        console.error("Address save error:", error);
      }

      showAppToast(
        "حدث خطأ أثناء حفظ العنوان. يرجى المحاولة مرة أخرى.",
        "error"
      );
    }
  };

  const checkAndSave = () => {
    if (!String(address.governorate || "").trim()) {
      showAppToast("يرجى اختيار المحافظة.", "error");
      return;
    }

    if (!String(address.area || "").trim()) {
      showAppToast("يرجى إدخال المنطقة.", "error");
      return;
    }

    processSave();
  };

  const handleOverlayMouseDown = (event) => {
    if (event.target === event.currentTarget) {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="address-modal-overlay"
      onMouseDown={handleOverlayMouseDown}
      role="presentation"
    >
      <div className="address-modal-container">
        <section
          className="address-modal-box"
          role="dialog"
          aria-modal="true"
          aria-labelledby="address-modal-title"
          dir="rtl"
          lang="ar"
          onMouseDown={(event) => event.stopPropagation()}
        >
          <header className="address-modal-header">
            <div className="address-modal-heading">
              <h3 id="address-modal-title">
                {isEditing ? "تعديل العنوان" : "إضافة عنوان"}
              </h3>

              <p className="address-modal-subtitle">
                أدخل المحافظة والمنطقة الخاصة بموقع العمل.
              </p>
            </div>

            <button
              type="button"
              className="address-modal-close-btn"
              onClick={onClose}
              aria-label="إغلاق نافذة العنوان"
            >
              ×
            </button>
          </header>

          <div className="address-modal-body">
            {isTemporaryMode && (
              <div className="address-temp-warning">
                <i className="fas fa-info-circle" aria-hidden="true"></i>
                <span>
                  سيُستخدم هذا العنوان لهذه العملية فقط ولن يُحفظ ضمن
                  حسابك.
                </span>
              </div>
            )}

            <div className="address-form-fields">
              {/* 1. المحافظة — مطلوبة */}
              <div className="address-field">
                <label
                  className="address-label required"
                  htmlFor="address-governorate"
                >
                  المحافظة
                </label>

                <select
                  id="address-governorate"
                  className="address-select"
                  value={address.governorate}
                  onChange={(event) =>
                    handleFieldChange(
                      "governorate",
                      event.target.value
                    )
                  }
                  required
                  dir="rtl"
                  lang="ar"
                >
                  <option value="">اختر المحافظة</option>

                  {SYRIA_GOVERNORATES.map((governorate) => (
                    <option
                      key={governorate.value}
                      value={governorate.value}
                    >
                      {governorate.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* 2. المنطقة — مطلوبة */}
              <div className="address-field">
                <label
                  className="address-label required"
                  htmlFor="address-area"
                >
                  المنطقة
                </label>

                <input
                  id="address-area"
                  type="text"
                  className="address-input"
                  value={address.area}
                  onChange={(event) =>
                    handleFieldChange("area", event.target.value)
                  }
                  placeholder="مثال: المزة، جرمانا، الحمدانية..."
                  maxLength={100}
                  autoComplete="address-level2"
                  inputMode="text"
                  dir="rtl"
                  lang="ar"
                  required
                />
              </div>

              {/* 3. معلومات إضافية — اختيارية */}
              <div className="address-field">
                <label
                  className="address-label optional"
                  htmlFor="address-additional-info"
                >
                  معلومات إضافية عن العنوان
                </label>

                <textarea
                  id="address-additional-info"
                  className="address-input address-textarea"
                  value={address.additionalInfo}
                  onChange={(event) =>
                    handleFieldChange(
                      "additionalInfo",
                      event.target.value
                    )
                  }
                  placeholder="مثال: بجانب الصيدلية، البناء الثاني، الطابق الأول..."
                  maxLength={300}
                  rows={4}
                  dir="rtl"
                  lang="ar"
                />

                <small className="address-character-count">
                  {address.additionalInfo.length}/300
                </small>
              </div>
            </div>

            <footer className="address-modal-actions">
              <button
                type="button"
                onClick={onClose}
                className="address-cancel-btn"
              >
                إلغاء
              </button>

              <button
                type="button"
                onClick={checkAndSave}
                className="address-save-btn"
              >
                {isTemporaryMode
                  ? "استخدام هذا العنوان"
                  : isEditing
                    ? "حفظ التعديلات"
                    : "حفظ العنوان"}
              </button>
            </footer>
          </div>
        </section>
      </div>
    </div>
  );
};

export default AddressModal;

// ============================================================================
// OLD FRONTEND ADDRESS MODAL CODE
// الكود القديم محفوظ أدناه على شكل تعليقات فقط، ولا يتم تشغيله.
// ============================================================================

// import React, { useState, useEffect } from 'react';
// import { turkeyData } from '../data/turkeyData';
// import DOMPurify from 'dompurify';
// import { showAppToast } from '../utils/showAppToast';
// import '../styles/AddressModal.css';
// 
// const isDevelopment = process.env.NODE_ENV === 'development';
// 
// const sanitizeText = (text) => {
//   if (!text) return '';
//   return DOMPurify.sanitize(String(text));
// };
// 
// const AddressModal = ({ isOpen, onClose, onSave, initialData, isEditing, mode = "PERMANENT" }) => {
//   const isTemporaryMode = mode === "TEMPORARY";
//   
//   const [address, setAddress] = useState(initialData || {
//     addressName: '',
//     city: '',
//     district: '',
//     neighborhood: '',
//     street: '',
//     siteName: '',
//     apartmentName: '',
//     blockName: '',
//     buildingNo: '',
//     floor: '',
//     doorNo: ''
//   });
//   const [mahalleler, setMahalleler] = useState([]);
//   const [mahalleMode, setMahalleMode] = useState('select');
//   const [searchTerm, setSearchTerm] = useState('');
//   const [manualNeighborhood, setManualNeighborhood] = useState('');
//   const [coordsStatus, setCoordsStatus] = useState("LÜTFEN ŞEHİR VE İLÇE SEÇİNİZ");
//   const [isPrecise, setIsPrecise] = useState(false);
//   const [showWarning, setShowWarning] = useState(false);
// 
//   useEffect(() => {
//     if (initialData && isOpen) {
//       setAddress(initialData);
//     } else if (isOpen) {
//       setAddress({ addressName: '', city: '', district: '', neighborhood: '', street: '', siteName: '', apartmentName: '', blockName: '', buildingNo: '', floor: '', doorNo: '', lat: '', lng: '' });
//       setCoordsStatus("LÜTFEN ŞEHİR VE İLÇE SEÇİNİZ");
//     }
//   }, [initialData, isOpen]);
// 
//   useEffect(() => {
//     if (!address.district) { setMahalleler([]); return; }
//     fetch(`https://turkiyeapi.dev/api/v1/neighborhoods?city=${encodeURIComponent(address.city)}&district=${encodeURIComponent(address.district)}`)
//       .then(res => res.json())
//       .then(result => {
//         if (result.data) {
//           setMahalleler([{ id: 'bulamadim', name: 'Mahallemi Bulamadım (Elle Gir)' }, ...result.data]);
//         }
//       })
//       .catch(() => setMahalleler([{ id: 'bulamadim', name: 'Mahallemi Bulamadım (Elle Gir)' }]));
//   }, [address.city, address.district]);
// 
//   useEffect(() => {
//     const { city, district, neighborhood } = address;
//     
//     if (!city || !district) {
//       setCoordsStatus("⚠️ LÜTFEN ŞEHİR VE İLÇE SEÇİNİZ");
//       return;
//     }
// 
//     if (!neighborhood) {
//       setCoordsStatus("📍 Lütfen Mahalle / Köy Seçiniz");
//       return;
//     }
// 
//     setCoordsStatus("🔍 Konum aranıyor...");
// 
//     const timer = setTimeout(async () => {
//       const fallbackToDistrictCenter = (isFallback) => {
//         const districtData = turkeyData[city]?.find(d => d.name === district);
//         if (districtData) {
//           setAddress(prev => ({ ...prev, lat: parseFloat(districtData.lat), lng: parseFloat(districtData.lng) }));
//           setCoordsStatus(isFallback 
//             ? `⚠️ Mahalle bulunamadı, İlçe Merkezi: ${districtData.lat} , ${districtData.lng}` 
//             : `✅ İlçe Merkezi Belirlendi: ${districtData.lat} , ${districtData.lng}`
//           );
//           setIsPrecise(false);
//         }
//       };
// 
//       try {
//         const cleanNeighborhood = neighborhood.replace(/ mahallesi| mahalle| mah| mah.| mh.| mh/gi, "").trim();
//         const query = `${cleanNeighborhood}, ${district}, ${city}`;
//         const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&countrycodes=tr&limit=1`);
//         const data = await res.json();
// 
//         if (data && data.length > 0) {
//           setAddress(prev => ({ ...prev, lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) }));
//           setCoordsStatus(`✅ Mahalle koordinatları bulundu: ${parseFloat(data[0].lat).toFixed(4)} , ${parseFloat(data[0].lon).toFixed(4)}`);
//           setIsPrecise(true);
//         } else {
//           fallbackToDistrictCenter(true);
//         }
//       } catch (err) {
//         if (isDevelopment) console.error("Koordinat bulma hatası:", err.message);
//         fallbackToDistrictCenter(true);
//       }
//     }, 1500);
// 
//     return () => clearTimeout(timer);
//   }, [address.city, address.district, address.neighborhood]);
// 
//   const checkAndSave = () => {
//     const { city, district, neighborhood, street, buildingNo, floor, doorNo, addressName } = address;
// 
//     if (!addressName || !addressName.trim()) {
//       showAppToast("Lütfen Adres Başlığı doldurunuz.", "error");
//       return;
//     }
// 
//     if (!city || !district || !neighborhood || !street || street.trim().length < 3 || !buildingNo?.trim() || !floor?.trim() || !doorNo?.trim()) {
//       showAppToast("Lütfen tüm zorunlu alanları (Bina No, Kat, Daire dahil) doldurunuz.", "error");
//       return;
//     }
// 
//     if (!isPrecise) {
//       setShowWarning(true);
//     } else {
//       processSave();
//     }
//   };
// 
//   const handleFieldChange = (field, value) => {
//     setAddress(prev => {
//       const updated = { ...prev, [field]: value };
//       if (field === 'city') {
//         updated.district = '';
//         updated.neighborhood = '';
//       } else if (field === 'district') {
//         updated.neighborhood = '';
//       }
//       return updated;
//     });
//   };
// 
//   const processSave = () => {
//     try {
//       const dataToSave = { 
//         ...address, 
//         addressName: sanitizeText(address.addressName),
//         city: sanitizeText(address.city),
//         district: sanitizeText(address.district),
//         neighborhood: sanitizeText(address.neighborhood),
//         street: sanitizeText(address.street),
//         siteName: sanitizeText(address.siteName),
//         apartmentName: sanitizeText(address.apartmentName),
//         blockName: sanitizeText(address.blockName),
//         buildingNo: sanitizeText(address.buildingNo),
//         floor: sanitizeText(address.floor),
//         doorNo: sanitizeText(address.doorNo),
//         lat: address.lat, 
//         lng: address.lng, 
//         coordSource: isPrecise ? "API_Center" : "API_District",
//         isTemporary: isTemporaryMode
//       };
// 
//       if (onSave) {
//         onSave(dataToSave);
//       }
//       setShowWarning(false);
//     } catch (error) {
//       if (isDevelopment) console.error("Kayıt hatası:", error.message);
//       showAppToast("Adres kaydedilirken bir hata oluştu.", "error");
//     }
//   };
// 
//   if (!isOpen) return null;
// 
//   return (
//     <div className="address-modal-overlay">
//       <div className="address-modal-container">
//         <div className="address-modal-box">
//           <div className="address-modal-header">
//             <h3>{isEditing ? 'Adresi Güncelle' : (isTemporaryMode ? 'Randevu İçin Adres Gir' : 'Yeni Adres Ekle')}</h3>
//             <button className="address-modal-close-btn" onClick={onClose}>×</button>
//           </div>
// 
//           <div className="address-modal-body">
//             {isTemporaryMode && (
//               <div className="address-temp-warning">
//                 <i className="fas fa-info-circle"></i>
//                 <span>Bu adres sadece bu randevu için kullanılacak, hesabınıza kaydedilmeyecektir.</span>
//               </div>
//             )}
// 
//             <div className="address-form-fields">
//               <div className="address-field">
//                 <label className="address-label required">ADRES BAŞLIĞI (Zorunlu)</label>
//                 <input type="text" className="address-input" value={address.addressName} onChange={(e) => handleFieldChange('addressName', e.target.value)} placeholder="Örn: Evim, İş Yerim" />
//               </div>
// 
//               <div className="address-row-2cols">
//                 <div className="address-field">
//                   <label className="address-label required">ŞEHİR</label>
//                   <select className="address-select" value={address.city} onChange={(e) => handleFieldChange('city', e.target.value)}>
//                     <option value="">Şehir Seçiniz</option>
//                     {Object.keys(turkeyData).sort().map(city => <option key={city} value={city}>{city}</option>)}
//                   </select>
//                 </div>
//                 <div className="address-field">
//                   <label className="address-label required">İLÇE</label>
//                   <select 
//                     className="address-select" 
//                     value={address.district} 
//                     onChange={(e) => { 
//                       handleFieldChange('district', e.target.value); 
//                       setMahalleMode('select'); 
//                       setSearchTerm(''); 
//                       setManualNeighborhood(''); 
//                     }} 
//                     disabled={!address.city}
//                   >
//                     <option value="">İlçe Seçiniz</option>
//                     {address.city && turkeyData[address.city].sort((a,b) => a.name.localeCompare(b.name, 'tr')).map(dist => <option key={dist.name} value={dist.name}>{dist.name}</option>)}
//                   </select>
//                 </div>
//               </div>
// 
//               <div className="address-field">
//                 <label className="address-label required">MAHALLE</label>
//                 {mahalleMode === 'select' && (
//                   <select className="address-select" value={address.neighborhood} onChange={(e) => {
//                     if (e.target.value === 'search_mode') { setMahalleMode('search'); }
//                     else if (e.target.value === 'manual_mode') { setMahalleMode('manual'); }
//                     else { handleFieldChange('neighborhood', e.target.value); }
//                   }}>
//                     <option value="">Mahalle Seçiniz</option>
//                     <option value="search_mode">🔍 Mahallenizi listede bulamadıysanız arayın</option>
//                     <option value="manual_mode">✍️ Mahalleniz listede yoksa elle girin</option>
//                     <option disabled>----------------------------------------</option>
//                     {address.neighborhood && !mahalleler.some(m => sanitizeText(m.name) === address.neighborhood) && (
//                       <option value={address.neighborhood}>{address.neighborhood} (Elle Girildi)</option>
//                     )}
//                     {mahalleler.filter(m => m.id !== 'bulamadim').map(mah => (
//                       <option key={mah.id} value={sanitizeText(mah.name)}>{sanitizeText(mah.name)}</option>
//                     ))}
//                   </select>
//                 )}
// 
//                 {mahalleMode === 'search' && (
//                   <div className="address-search-mode">
//                     <div className="address-search-header">
//                       <input type="text" className="address-search-input" placeholder="Mahalle adını yazarak arayın..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value.toLocaleUpperCase('TR'))} autoFocus />
//                       <button className="address-search-back" onClick={() => { setMahalleMode('select'); setSearchTerm(''); }}>Geri</button>
//                     </div>
//                     <div className="address-search-results">
//                       {mahalleler.filter(m => m.id !== 'bulamadim' && sanitizeText(m.name).toLocaleUpperCase('TR').includes(searchTerm)).length > 0 ? (
//                         mahalleler.filter(m => m.id !== 'bulamadim' && sanitizeText(m.name).toLocaleUpperCase('TR').includes(searchTerm)).map(mah => (
//                           <button key={mah.id} className="address-search-result-item" onClick={() => { handleFieldChange('neighborhood', sanitizeText(mah.name)); setMahalleMode('select'); setSearchTerm(''); }}>
//                             {sanitizeText(mah.name)}
//                           </button>
//                         ))
//                       ) : (
//                         <div className="address-search-no-result">Eşleşen mahalle bulunamadı. "Elle Gir" modunu kullanın.</div>
//                       )}
//                     </div>
//                   </div>
//                 )}
// 
//                 {mahalleMode === 'manual' && (
//                   <div className="address-manual-mode">
//                     <div className="address-manual-header">
//                       <input type="text" className="address-manual-input" placeholder="Mahallenizin adını girin..." value={manualNeighborhood} onChange={(e) => setManualNeighborhood(e.target.value)} autoFocus />
//                       <button className="address-manual-back" onClick={() => { setMahalleMode('select'); setManualNeighborhood(''); }}>Geri</button>
//                     </div>
//                     <button className="address-manual-save" onClick={() => { if(manualNeighborhood.trim().length > 2) { handleFieldChange('neighborhood', manualNeighborhood.trim()); setMahalleMode('select'); } else { showAppToast("Lütfen geçerli bir mahalle adı giriniz.", "error"); } }}>
//                       Bu Mahalleyi Kaydet
//                     </button>
//                   </div>
//                 )}
//               </div>
// 
//               <div className="address-field">
//                 <label className="address-label required">CADDE / SOKAK / BULVAR</label>
//                 <input type="text" className="address-input" value={address.street} onChange={(e) => handleFieldChange('street', e.target.value)} placeholder="Örn: Albay Faik Sözdener Cad." />
//               </div>
// 
//               <div className="address-row-3cols">
//                 <div className="address-field">
//                   <label className="address-label optional">SİTE ADI</label>
//                   <input type="text" className="address-input" value={address.siteName} onChange={(e) => handleFieldChange('siteName', e.target.value)} placeholder="Site Adı" />
//                 </div>
//                 <div className="address-field">
//                   <label className="address-label optional">APARTMAN ADI</label>
//                   <input type="text" className="address-input" value={address.apartmentName} onChange={(e) => handleFieldChange('apartmentName', e.target.value)} placeholder="Apartman Adı" />
//                 </div>
//                 <div className="address-field">
//                   <label className="address-label optional">BLOK ADI</label>
//                   <input type="text" className="address-input" value={address.blockName} onChange={(e) => handleFieldChange('blockName', e.target.value)} placeholder="Blok" />
//                 </div>
//               </div>
// 
//               <div className="address-row-3cols">
//                 <div className="address-field">
//                   <label className="address-label required">BİNA NO</label>
//                   <input type="text" className="address-input" value={address.buildingNo} onChange={(e) => handleFieldChange('buildingNo', e.target.value)} placeholder="Bina No" />
//                 </div>
//                 <div className="address-field">
//                   <label className="address-label required">KAT</label>
//                   <input type="text" className="address-input" value={address.floor} onChange={(e) => handleFieldChange('floor', e.target.value)} placeholder="Kat" />
//                 </div>
//                 <div className="address-field">
//                   <label className="address-label required">DAİRE</label>
//                   <input type="text" className="address-input" value={address.doorNo} onChange={(e) => handleFieldChange('doorNo', e.target.value)} placeholder="Daire" />
//                 </div>
//               </div>
// 
//               <div className="address-coords-status">
//                 <span className="address-coords-label">KONUM DURUMU:</span>
//                 <span className={`address-coords-value ${coordsStatus.includes('✅') ? 'success' : (coordsStatus.includes('⚠️') ? 'warning' : 'info')}`}>
//                   {sanitizeText(coordsStatus)}
//                 </span>
//               </div>
//             </div>
// 
//             <div className="address-modal-actions">
//               <button onClick={onClose} className="address-cancel-btn">İptal</button>
//               <button onClick={checkAndSave} className="address-save-btn">
//                 {isTemporaryMode ? 'Bu Adresi Kullan' : (isEditing ? 'Güncelle' : 'Kaydet')}
//               </button>
//             </div>
//           </div>
// 
//           {showWarning && (
//             <div className="address-warning-overlay">
//               <div className="address-warning-modal">
//                 <h4>📍 Konum Uyarısı</h4>
//                 <p>
//                   {isTemporaryMode 
//                     ? "Mahalleniz sistemde tam olarak bulunamadı. İlçe merkezi baz alınacaktır."
//                     : "Mahalleniz sistemde tam olarak bulunamadığı için ilçe merkezi koordinatları kullanılacaktır."
//                   }
//                 </p>
//                 <div className="address-warning-actions">
//                   <button onClick={() => setShowWarning(false)} className="address-warning-google">Vazgeç, Düzenle</button>
//                   <button onClick={() => processSave()} className="address-warning-risk">Yine de Kaydet</button>
//                 </div>
//               </div>
//             </div>
//           )}
//         </div>
//       </div>
//     </div>
//   );
// };
// 
// export default AddressModal;