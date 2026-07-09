import React, { useState, useEffect } from 'react';
import { turkeyData } from '../data/turkeyData';
import DOMPurify from 'dompurify';
import { showAppToast } from '../utils/showAppToast';
import '../styles/AddressModal.css';

const isDevelopment = process.env.NODE_ENV === 'development';

const sanitizeText = (text) => {
  if (!text) return '';
  return DOMPurify.sanitize(String(text));
};

const AddressModal = ({ isOpen, onClose, onSave, initialData, isEditing, mode = "PERMANENT" }) => {
  const isTemporaryMode = mode === "TEMPORARY";
  
  const [address, setAddress] = useState(initialData || {
    addressName: '',
    city: '',
    district: '',
    neighborhood: '',
    street: '',
    siteName: '',
    apartmentName: '',
    blockName: '',
    buildingNo: '',
    floor: '',
    doorNo: ''
  });
  const [mahalleler, setMahalleler] = useState([]);
  const [mahalleMode, setMahalleMode] = useState('select');
  const [searchTerm, setSearchTerm] = useState('');
  const [manualNeighborhood, setManualNeighborhood] = useState('');
  const [coordsStatus, setCoordsStatus] = useState("LÜTFEN ŞEHİR VE İLÇE SEÇİNİZ");
  const [isPrecise, setIsPrecise] = useState(false);
  const [showWarning, setShowWarning] = useState(false);

  useEffect(() => {
    if (initialData && isOpen) {
      setAddress(initialData);
    } else if (isOpen) {
      setAddress({ addressName: '', city: '', district: '', neighborhood: '', street: '', siteName: '', apartmentName: '', blockName: '', buildingNo: '', floor: '', doorNo: '', lat: '', lng: '' });
      setCoordsStatus("LÜTFEN ŞEHİR VE İLÇE SEÇİNİZ");
    }
  }, [initialData, isOpen]);

  useEffect(() => {
    if (!address.district) { setMahalleler([]); return; }
    fetch(`https://turkiyeapi.dev/api/v1/neighborhoods?city=${encodeURIComponent(address.city)}&district=${encodeURIComponent(address.district)}`)
      .then(res => res.json())
      .then(result => {
        if (result.data) {
          setMahalleler([{ id: 'bulamadim', name: 'Mahallemi Bulamadım (Elle Gir)' }, ...result.data]);
        }
      })
      .catch(() => setMahalleler([{ id: 'bulamadim', name: 'Mahallemi Bulamadım (Elle Gir)' }]));
  }, [address.city, address.district]);

  useEffect(() => {
    const { city, district, neighborhood } = address;
    
    if (!city || !district) {
      setCoordsStatus("⚠️ LÜTFEN ŞEHİR VE İLÇE SEÇİNİZ");
      return;
    }

    if (!neighborhood) {
      setCoordsStatus("📍 Lütfen Mahalle / Köy Seçiniz");
      return;
    }

    setCoordsStatus("🔍 Konum aranıyor...");

    const timer = setTimeout(async () => {
      const fallbackToDistrictCenter = (isFallback) => {
        const districtData = turkeyData[city]?.find(d => d.name === district);
        if (districtData) {
          setAddress(prev => ({ ...prev, lat: parseFloat(districtData.lat), lng: parseFloat(districtData.lng) }));
          setCoordsStatus(isFallback 
            ? `⚠️ Mahalle bulunamadı, İlçe Merkezi: ${districtData.lat} , ${districtData.lng}` 
            : `✅ İlçe Merkezi Belirlendi: ${districtData.lat} , ${districtData.lng}`
          );
          setIsPrecise(false);
        }
      };

      try {
        const cleanNeighborhood = neighborhood.replace(/ mahallesi| mahalle| mah| mah.| mh.| mh/gi, "").trim();
        const query = `${cleanNeighborhood}, ${district}, ${city}`;
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&countrycodes=tr&limit=1`);
        const data = await res.json();

        if (data && data.length > 0) {
          setAddress(prev => ({ ...prev, lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) }));
          setCoordsStatus(`✅ Mahalle koordinatları bulundu: ${parseFloat(data[0].lat).toFixed(4)} , ${parseFloat(data[0].lon).toFixed(4)}`);
          setIsPrecise(true);
        } else {
          fallbackToDistrictCenter(true);
        }
      } catch (err) {
        if (isDevelopment) console.error("Koordinat bulma hatası:", err.message);
        fallbackToDistrictCenter(true);
      }
    }, 1500);

    return () => clearTimeout(timer);
  }, [address.city, address.district, address.neighborhood]);

  const checkAndSave = () => {
    const { city, district, neighborhood, street, buildingNo, floor, doorNo, addressName } = address;

    if (!addressName || !addressName.trim()) {
      showAppToast("Lütfen Adres Başlığı doldurunuz.", "error");
      return;
    }

    if (!city || !district || !neighborhood || !street || street.trim().length < 3 || !buildingNo?.trim() || !floor?.trim() || !doorNo?.trim()) {
      showAppToast("Lütfen tüm zorunlu alanları (Bina No, Kat, Daire dahil) doldurunuz.", "error");
      return;
    }

    if (!isPrecise) {
      setShowWarning(true);
    } else {
      processSave();
    }
  };

  const handleFieldChange = (field, value) => {
    setAddress(prev => {
      const updated = { ...prev, [field]: value };
      if (field === 'city') {
        updated.district = '';
        updated.neighborhood = '';
      } else if (field === 'district') {
        updated.neighborhood = '';
      }
      return updated;
    });
  };

  const processSave = () => {
    try {
      const dataToSave = { 
        ...address, 
        addressName: sanitizeText(address.addressName),
        city: sanitizeText(address.city),
        district: sanitizeText(address.district),
        neighborhood: sanitizeText(address.neighborhood),
        street: sanitizeText(address.street),
        siteName: sanitizeText(address.siteName),
        apartmentName: sanitizeText(address.apartmentName),
        blockName: sanitizeText(address.blockName),
        buildingNo: sanitizeText(address.buildingNo),
        floor: sanitizeText(address.floor),
        doorNo: sanitizeText(address.doorNo),
        lat: address.lat, 
        lng: address.lng, 
        coordSource: isPrecise ? "API_Center" : "API_District",
        isTemporary: isTemporaryMode
      };

      if (onSave) {
        onSave(dataToSave);
      }
      setShowWarning(false);
    } catch (error) {
      if (isDevelopment) console.error("Kayıt hatası:", error.message);
      showAppToast("Adres kaydedilirken bir hata oluştu.", "error");
    }
  };

  if (!isOpen) return null;

  return (
    <div className="address-modal-overlay">
      <div className="address-modal-container">
        <div className="address-modal-box">
          <div className="address-modal-header">
            <h3>{isEditing ? 'Adresi Güncelle' : (isTemporaryMode ? 'Randevu İçin Adres Gir' : 'Yeni Adres Ekle')}</h3>
            <button className="address-modal-close-btn" onClick={onClose}>×</button>
          </div>

          <div className="address-modal-body">
            {isTemporaryMode && (
              <div className="address-temp-warning">
                <i className="fas fa-info-circle"></i>
                <span>Bu adres sadece bu randevu için kullanılacak, hesabınıza kaydedilmeyecektir.</span>
              </div>
            )}

            <div className="address-form-fields">
              <div className="address-field">
                <label className="address-label required">ADRES BAŞLIĞI (Zorunlu)</label>
                <input type="text" className="address-input" value={address.addressName} onChange={(e) => handleFieldChange('addressName', e.target.value)} placeholder="Örn: Evim, İş Yerim" />
              </div>

              <div className="address-row-2cols">
                <div className="address-field">
                  <label className="address-label required">ŞEHİR</label>
                  <select className="address-select" value={address.city} onChange={(e) => handleFieldChange('city', e.target.value)}>
                    <option value="">Şehir Seçiniz</option>
                    {Object.keys(turkeyData).sort().map(city => <option key={city} value={city}>{city}</option>)}
                  </select>
                </div>
                <div className="address-field">
                  <label className="address-label required">İLÇE</label>
                  <select 
                    className="address-select" 
                    value={address.district} 
                    onChange={(e) => { 
                      handleFieldChange('district', e.target.value); 
                      setMahalleMode('select'); 
                      setSearchTerm(''); 
                      setManualNeighborhood(''); 
                    }} 
                    disabled={!address.city}
                  >
                    <option value="">İlçe Seçiniz</option>
                    {address.city && turkeyData[address.city].sort((a,b) => a.name.localeCompare(b.name, 'tr')).map(dist => <option key={dist.name} value={dist.name}>{dist.name}</option>)}
                  </select>
                </div>
              </div>

              <div className="address-field">
                <label className="address-label required">MAHALLE</label>
                {mahalleMode === 'select' && (
                  <select className="address-select" value={address.neighborhood} onChange={(e) => {
                    if (e.target.value === 'search_mode') { setMahalleMode('search'); }
                    else if (e.target.value === 'manual_mode') { setMahalleMode('manual'); }
                    else { handleFieldChange('neighborhood', e.target.value); }
                  }}>
                    <option value="">Mahalle Seçiniz</option>
                    <option value="search_mode">🔍 Mahallenizi listede bulamadıysanız arayın</option>
                    <option value="manual_mode">✍️ Mahalleniz listede yoksa elle girin</option>
                    <option disabled>----------------------------------------</option>
                    {address.neighborhood && !mahalleler.some(m => sanitizeText(m.name) === address.neighborhood) && (
                      <option value={address.neighborhood}>{address.neighborhood} (Elle Girildi)</option>
                    )}
                    {mahalleler.filter(m => m.id !== 'bulamadim').map(mah => (
                      <option key={mah.id} value={sanitizeText(mah.name)}>{sanitizeText(mah.name)}</option>
                    ))}
                  </select>
                )}

                {mahalleMode === 'search' && (
                  <div className="address-search-mode">
                    <div className="address-search-header">
                      <input type="text" className="address-search-input" placeholder="Mahalle adını yazarak arayın..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value.toLocaleUpperCase('TR'))} autoFocus />
                      <button className="address-search-back" onClick={() => { setMahalleMode('select'); setSearchTerm(''); }}>Geri</button>
                    </div>
                    <div className="address-search-results">
                      {mahalleler.filter(m => m.id !== 'bulamadim' && sanitizeText(m.name).toLocaleUpperCase('TR').includes(searchTerm)).length > 0 ? (
                        mahalleler.filter(m => m.id !== 'bulamadim' && sanitizeText(m.name).toLocaleUpperCase('TR').includes(searchTerm)).map(mah => (
                          <button key={mah.id} className="address-search-result-item" onClick={() => { handleFieldChange('neighborhood', sanitizeText(mah.name)); setMahalleMode('select'); setSearchTerm(''); }}>
                            {sanitizeText(mah.name)}
                          </button>
                        ))
                      ) : (
                        <div className="address-search-no-result">Eşleşen mahalle bulunamadı. "Elle Gir" modunu kullanın.</div>
                      )}
                    </div>
                  </div>
                )}

                {mahalleMode === 'manual' && (
                  <div className="address-manual-mode">
                    <div className="address-manual-header">
                      <input type="text" className="address-manual-input" placeholder="Mahallenizin adını girin..." value={manualNeighborhood} onChange={(e) => setManualNeighborhood(e.target.value)} autoFocus />
                      <button className="address-manual-back" onClick={() => { setMahalleMode('select'); setManualNeighborhood(''); }}>Geri</button>
                    </div>
                    <button className="address-manual-save" onClick={() => { if(manualNeighborhood.trim().length > 2) { handleFieldChange('neighborhood', manualNeighborhood.trim()); setMahalleMode('select'); } else { showAppToast("Lütfen geçerli bir mahalle adı giriniz.", "error"); } }}>
                      Bu Mahalleyi Kaydet
                    </button>
                  </div>
                )}
              </div>

              <div className="address-field">
                <label className="address-label required">CADDE / SOKAK / BULVAR</label>
                <input type="text" className="address-input" value={address.street} onChange={(e) => handleFieldChange('street', e.target.value)} placeholder="Örn: Albay Faik Sözdener Cad." />
              </div>

              <div className="address-row-3cols">
                <div className="address-field">
                  <label className="address-label optional">SİTE ADI</label>
                  <input type="text" className="address-input" value={address.siteName} onChange={(e) => handleFieldChange('siteName', e.target.value)} placeholder="Site Adı" />
                </div>
                <div className="address-field">
                  <label className="address-label optional">APARTMAN ADI</label>
                  <input type="text" className="address-input" value={address.apartmentName} onChange={(e) => handleFieldChange('apartmentName', e.target.value)} placeholder="Apartman Adı" />
                </div>
                <div className="address-field">
                  <label className="address-label optional">BLOK ADI</label>
                  <input type="text" className="address-input" value={address.blockName} onChange={(e) => handleFieldChange('blockName', e.target.value)} placeholder="Blok" />
                </div>
              </div>

              <div className="address-row-3cols">
                <div className="address-field">
                  <label className="address-label required">BİNA NO</label>
                  <input type="text" className="address-input" value={address.buildingNo} onChange={(e) => handleFieldChange('buildingNo', e.target.value)} placeholder="Bina No" />
                </div>
                <div className="address-field">
                  <label className="address-label required">KAT</label>
                  <input type="text" className="address-input" value={address.floor} onChange={(e) => handleFieldChange('floor', e.target.value)} placeholder="Kat" />
                </div>
                <div className="address-field">
                  <label className="address-label required">DAİRE</label>
                  <input type="text" className="address-input" value={address.doorNo} onChange={(e) => handleFieldChange('doorNo', e.target.value)} placeholder="Daire" />
                </div>
              </div>

              <div className="address-coords-status">
                <span className="address-coords-label">KONUM DURUMU:</span>
                <span className={`address-coords-value ${coordsStatus.includes('✅') ? 'success' : (coordsStatus.includes('⚠️') ? 'warning' : 'info')}`}>
                  {sanitizeText(coordsStatus)}
                </span>
              </div>
            </div>

            <div className="address-modal-actions">
              <button onClick={onClose} className="address-cancel-btn">İptal</button>
              <button onClick={checkAndSave} className="address-save-btn">
                {isTemporaryMode ? 'Bu Adresi Kullan' : (isEditing ? 'Güncelle' : 'Kaydet')}
              </button>
            </div>
          </div>

          {showWarning && (
            <div className="address-warning-overlay">
              <div className="address-warning-modal">
                <h4>📍 Konum Uyarısı</h4>
                <p>
                  {isTemporaryMode 
                    ? "Mahalleniz sistemde tam olarak bulunamadı. İlçe merkezi baz alınacaktır."
                    : "Mahalleniz sistemde tam olarak bulunamadığı için ilçe merkezi koordinatları kullanılacaktır."
                  }
                </p>
                <div className="address-warning-actions">
                  <button onClick={() => setShowWarning(false)} className="address-warning-google">Vazgeç, Düzenle</button>
                  <button onClick={() => processSave()} className="address-warning-risk">Yine de Kaydet</button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AddressModal;