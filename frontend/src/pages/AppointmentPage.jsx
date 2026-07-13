import React, { useState, useEffect } from 'react';
import Navbar from '../components/Navbar';
import { useNavigate } from 'react-router-dom';
import '../styles/AppointmentPage.css';
import { doc, getDoc, setDoc, onSnapshot, query, collection, where, addDoc, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../firebase/firebaseClient';
import { turkeyData } from '../data/turkeyData';
import DOMPurify from 'dompurify';
import { showAppToast } from '../utils/showAppToast';
import CancelSuccessModal from '../components/CancelSuccessModal';
import ConfirmModal from '../components/ConfirmModal';
import { useSearchParams } from 'react-router-dom';
import SharedCalendar from '../components/SharedCalendar';

const isDevelopment = process.env.NODE_ENV === 'development';

const sanitizeText = (text) => {
  if (!text) return '';
  return DOMPurify.sanitize(String(text));
};

const AppointmentPage = () => {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showWorkloadModal, setShowWorkloadModal] = useState(false);
  const [allData, setAllData] = useState({});
  const [showFormModal, setShowFormModal] = useState(false);
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState(null);
  const [showCancelWarning, setShowCancelWarning] = useState(false); 
  const [currentUserId, setCurrentUserId] = useState(null);
  const [expertName, setExpertName] = useState('');
  const [expertDefaultAddress, setExpertDefaultAddress] = useState({ city: '', district: '', neighborhood: '' });
  const [companyName, setCompanyName] = useState('');
  const [providerId, setProviderId] = useState(null);
  const [iletisimAcik, setIletisimAcik] = useState(false);
  const [konumAcik, setKonumAcik] = useState(false);
  const [ayrintiliAdresAcik, setAyrintiliAdresAcik] = useState(false);
  const [newAppo, setNewAppo] = useState({
    client: '', start: '', end: '', phone: '', email: '', 
    city: '', district: '', neighborhood: '', address: '', note: '',
    lat: '', lng: ''
  });
  const [coordsStatus, setCoordsStatus] = useState("");
  const [mahalleler, setMahalleler] = useState([]);
  const [elleGirisAktif, setElleGirisAktif] = useState(false);

  const [showRescheduleModal, setShowRescheduleModal] = useState(false);
  const [rescheduleStep, setRescheduleStep] = useState(1);
  const [rescheduleReason, setRescheduleReason] = useState("");
  const [rescheduleSelectedDates, setRescheduleSelectedDates] = useState([]);
  const [searchParams] = useSearchParams();

  const navigate = useNavigate();
  const [isEditing, setIsEditing] = useState(false);
  const [providerWorkingHours, setProviderWorkingHours] = useState(null);
  const [formError, setFormError] = useState(null);
  const [showCancelSuccessModal, setShowCancelSuccessModal] = useState(false);
  const [showDeleteConfirmModal, setShowDeleteConfirmModal] = useState(false);

  useEffect(() => {
    if (!showFormModal) return;

    const { city, district, neighborhood } = newAppo;

    if (!city || !district) {
      setCoordsStatus("LÜTFEN ŞEHİR VE İLÇE SEÇİNİZ");
      return;
    }

    if (!neighborhood && !elleGirisAktif) {
      setCoordsStatus("📍 MAHALLE SEÇİMİ BEKLENİYOR...");
      return;
    }

    setCoordsStatus("📍 Konum hesaplanıyor...");

    const timer = setTimeout(async () => {
      const cleanMah = neighborhood.replace(/ mahallesi| mahalle| mah| mah.| mh.| mh/gi, "").trim();
      const searchQuery = neighborhood ? `${cleanMah}, ${district}, ${city}` : `${district}, ${city}`;

      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}&countrycodes=tr&limit=1`);
        const data = await res.json();

        if (data && data.length > 0) {
          setNewAppo(prev => ({ ...prev, lat: data[0].lat, lng: data[0].lon }));
          setCoordsStatus(neighborhood ? "✅ (API - MAHALLE) KOORDİNATI ALINDI" : "✅ (API - İLÇE) KOORDİNATI ALINDI");
        } else {
          const districtData = turkeyData[city]?.find(d => d.name === district);
          if (districtData) {
            setNewAppo(prev => ({ ...prev, lat: districtData.lat, lng: districtData.lng }));
            setCoordsStatus("⚠️ MAHALLE BULUNAMADI, İLÇE MERKEZİ BAZ ALINDI");
          }
        }
      } catch (err) {
        if (isDevelopment) console.error("Konum API hatası:", err.message);
        setCoordsStatus("⚠️ BAĞLANTI HATASI (İLÇE MERKEZİNE DÜŞÜLDÜ)");
      }
    }, 1500);

    return () => clearTimeout(timer);
  }, [showFormModal, newAppo.city, newAppo.district, newAppo.neighborhood, elleGirisAktif]);
  
  useEffect(() => {
    if (!newAppo.district) {
      setMahalleler([]);
      return; 
    }

    fetch(`https://turkiyeapi.dev/api/v1/neighborhoods?city=${encodeURIComponent(newAppo.city)}&district=${encodeURIComponent(newAppo.district)}`)
      .then(res => res.json())
      .then(result => {
        if (result.data && Array.isArray(result.data)) {
          let gelenMahalleler = result.data.map(n => ({
            id: n.id || n.name, 
            name: n.name 
          }));
          
          const guncelListe = [
            { id: 'bulamadim', name: 'Mahallemi Bulamadım (Elle Gir)' },
            ...gelenMahalleler
          ];
          
          setMahalleler(guncelListe);
          setElleGirisAktif(false);
          setNewAppo(prev => ({ ...prev, neighborhood: '' }));
        }
      })
      .catch(err => {
        if (isDevelopment) console.error("Mahalleler çekilemedi:", err.message);
        setMahalleler([{ id: 'bulamadim', name: 'Mahallemi Bulamadım (Elle Gir)' }]);
      });
  }, [newAppo.city, newAppo.district]);

  const handleVerifyLocation = async () => {
    const { city, district, neighborhood } = newAppo;
    
    if (!city || !district) {
      showAppToast("Lütfen Şehir ve İlçe bilgilerini seçiniz.", "error");
      return;
    }

    setCoordsStatus("📍 Konum bulunuyor...");

    if (neighborhood) {
      const cleanNeighborhood = neighborhood.replace(/ mahallesi| mahalle| mah| mah.| mh.| mh/gi, "").trim();
      const query = `${cleanNeighborhood}, ${district}, ${city}`;
  
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&countrycodes=tr&limit=1`);
        const data = await res.json();

        if (data && data.length > 0) {
          setNewAppo(prev => ({ ...prev, lat: data[0].lat, lng: data[0].lon }));
          setCoordsStatus(`✅ BAŞARILI (Mahalle): ${data[0].lat.slice(0,7)} , ${data[0].lon.slice(0,7)}`);
          return;
        } else {
          if (isDevelopment) console.warn("Mahalle API'de bulunamadı. B Planı: Yerel veriye geçiliyor...");
        }
      } catch (err) {
        if (isDevelopment) console.error("API hatası, yerel veriye geçiliyor:", err.message);
      }
    }

    const districtData = turkeyData[city]?.find(d => d.name === district);
    
    if (districtData) {
      setNewAppo(prev => ({ ...prev, lat: districtData.lat, lng: districtData.lng }));
      
      if (neighborhood) {
        setCoordsStatus(`⚠️ Mahalle bulunamadı, İlçe merkezi baz alındı: ${districtData.lat} , ${districtData.lng}`);
      } else {
        setCoordsStatus(`✅ BAŞARILI (Yerel Veri): ${districtData.lat} , ${districtData.lng}`);
      }
    } else {
      setCoordsStatus("❌ Konum hiçbir şekilde bulunamadı!");
    }
  };

  const handleEditClick = () => {
    setIsEditing(true);
    setNewAppo({
      id: selectedAppointment.id,
      client: selectedAppointment.client,
      start: selectedAppointment.start,
      end: selectedAppointment.end,
      phone: selectedAppointment.phone || '',
      email: selectedAppointment.email || '',
      address: selectedAppointment.address || '',
      note: selectedAppointment.note || '',
      city: selectedAppointment.city || '',
      district: selectedAppointment.district || '',
      neighborhood: selectedAppointment.neighborhood || '',
      lat: selectedAppointment.lat || '',
      lng: selectedAppointment.lng || ''
    });
    setShowNoteModal(false);
    setShowFormModal(true);
  };

  const handleNewClick = () => {
    setIsEditing(false);
    
    setNewAppo({ 
      client: '', start: '', end: '', phone: '', email: '', address: '', note: '', 
      city: expertDefaultAddress.city, 
      district: expertDefaultAddress.district, 
      neighborhood: expertDefaultAddress.neighborhood || '',
      lat: '', lng: '' 
    });

    setCoordsStatus("");
    setElleGirisAktif(false);
    setShowFormModal(true);
  };

  useEffect(() => {
    const unsubscribeAuth = auth.onAuthStateChanged((user) => {
      if (user) {
        const uid = user.uid;
        setProviderId(uid);
        setCurrentUserId(uid);

        const fetchProviderData = async () => {
          try {
            const providerRef = doc(db, 'service_providers', uid);
            const providerSnap = await getDoc(providerRef);
            let fetchedCompany = '';
            if (providerSnap.exists()) {
              const pData = providerSnap.data();
              setProviderWorkingHours(pData.workingHours || null);
              if (pData.city || pData.district || pData.neighborhood) {
                setNewAppo(prev => ({
                  ...prev,
                  city: pData.city || '',
                  district: pData.district || '',
                  neighborhood: pData.neighborhood || ''
                }));
                setExpertDefaultAddress({
                  city: pData.city || '',
                  district: pData.district || '',
                  neighborhood: pData.neighborhood || ''
                });
              }             
              fetchedCompany = pData.businessName || pData.companyName || '';
              setCompanyName(fetchedCompany);
            }
            const userRef = doc(db, 'users', uid);
            const userSnap = await getDoc(userRef);
            let fetchedName = '';
            if (userSnap.exists()) {
              const uData = userSnap.data();
              fetchedName = uData.displayName || `${uData.name || ''} ${uData.surname || ''}`.trim();
            }
            setExpertName(fetchedName || fetchedCompany || 'İsimsiz Uzman');
          } catch (error) {
            if (isDevelopment) console.error('Veri çekme hatası:', error.message);
          }
        };
        fetchProviderData();

        const q = query(
          collection(db, 'appointments'), 
          where('expertId', '==', uid)
        );

        const unsubscribeAppos = onSnapshot(q, (querySnapshot) => {
          const groupedData = {};
          
          querySnapshot.forEach((doc) => {
            const data = doc.data();
            const dateKey = data.date;

            if (!groupedData[dateKey]) {
              groupedData[dateKey] = [];
            }

            groupedData[dateKey].push({
              id: doc.id, 
              ...data
            });
          });

          setAllData(groupedData);
        });
        return () => unsubscribeAppos();
      }
    });
    return () => unsubscribeAuth();
  }, []);

  useEffect(() => {
    const autoOpenId = searchParams.get('autoOpenId');
    const autoOpenDate = searchParams.get('autoOpenDate');
    
    if (autoOpenId && autoOpenDate && Object.keys(allData).length > 0) {
      const targetDate = new Date(autoOpenDate);
      setSelectedDate(targetDate);

      const dateKey = autoOpenDate;
      const dayAppos = allData[dateKey] || [];
      const finalAppo = dayAppos.find(a => a.id === autoOpenId);

      if (finalAppo) {
        setSelectedAppointment(finalAppo);
        setShowNoteModal(true);
        navigate('/randevu-takvimi', { replace: true });
      } 
    }
  }, [searchParams, allData, navigate]);

  useEffect(() => {
    if (formError && formError.type !== 'decision_panel') {
      const timer = setTimeout(() => {
        setFormError(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [formError]);

  const getDateKey = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const dateKey = getDateKey(selectedDate);
  const dailyAppointments = allData[dateKey] || [];

  const pendingCount = Object.values(allData)
    .flat()
    .filter(app => app.createdBy === 'customer' && app.status === 'pending')
    .length;

  const currentDayEn = selectedDate.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
  const todaySchedule = providerWorkingHours ? providerWorkingHours[currentDayEn] : null;

  let isDayClosed = true;
  let startH = 9;
  let endH = 18;

  if (providerWorkingHours) {
    if (todaySchedule && todaySchedule.enabled) {
      isDayClosed = false;
      startH = parseInt(todaySchedule.start.split(':')[0]);
      endH = parseInt(todaySchedule.end.split(':')[0]);
    }
  } else {
    isDayClosed = false;
  }

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setNewAppo(prev => ({ ...prev, [name]: value }));
    
    if (name === "district") {
      setMahalleler([]);
      setNewAppo(prev => ({ ...prev, neighborhood: '' }));
    }
    
    if (formError) setFormError(null);
  };

  const forceSaveAppointment = async () => {
    const toMinutes = (timeStr) => {
      const [h, m] = timeStr.split(':').map(Number);
      return h * 60 + m;
    };

    const newStartMin = toMinutes(newAppo.start);
    const newEndMin = toMinutes(newAppo.end);
    const sH = parseInt(newAppo.start.split(':')[0]);
    const eH = parseInt(newAppo.end.split(':')[0]);

    const cleanedDayData = dailyAppointments.map(app => {
      if (app.status === 'pending') {
        const appStart = typeof app.start === 'string' ? toMinutes(app.start) : app.start * 60;
        const appEnd = typeof app.end === 'string' ? toMinutes(app.end) : app.end * 60;
        
        if (newStartMin < appEnd && newEndMin > appStart) {
          return { 
            ...app, 
            status: 'rejected', 
            expertRejectNote: 'Bu saat dilimi için başka bir randevu onaylanmıştır.' 
          };
        }
      }
      return app;
    });
  };

  const keepBothAndSave = async () => {
    if (formError?.nextStepTraffic) {
      const traffic = formError.nextStepTraffic;
      setFormError({
        type: 'decision_panel', zone: 'traffic_warning',
        existingClient: traffic.data.client || traffic.data.customerName || "Bilinmeyen Müşteri",
        existingAddress: traffic.data.address || "Adres Belirtilmemiş",
        existingTime: `${traffic.data.start} - ${traffic.data.end}`,
        newClientName: newAppo.client || "Yeni Müşteri",
        newAddress: newAppo.address || "Adres Girilmemiş",
        gapMinutes: traffic.gap,
        pendingDecision: { type: 'keep_all' } 
      });
      return; 
    }

    let source = "API_District";
    if (coordsStatus.includes("MAHALLE")) source = "API_Center";

    const fullAddressStr = `${newAppo.city} / ${newAppo.district}${newAppo.neighborhood ? ` / ${newAppo.neighborhood} Mah.` : ''} - ${newAppo.address}`;

    const appointmentData = {
      ...newAppo,
      date: getDateKey(selectedDate),
      fullAddress: fullAddressStr,
      coordSource: source, 
      lat: newAppo.lat ? parseFloat(newAppo.lat) : 0,
      lng: newAppo.lng ? parseFloat(newAppo.lng) : 0,
      expertId: auth.currentUser?.uid,
      expertName,
      companyName,
      status: 'approved',
      createdBy: 'expert',
      createdTime: Date.now(),
      approvedTime: Date.now()
    };

    try {
      if (isEditing) {
        await updateDoc(doc(db, "appointments", newAppo.id), appointmentData);
      } else {
        await addDoc(collection(db, "appointments"), appointmentData);
      }
      setShowFormModal(false);
      setFormError(null);
      showAppToast("Randevular başarıyla kaydedildi!", "success");
    } catch (err) { 
      if (isDevelopment) console.error("Kayıt hatası:", err.message);
      showAppToast("İşlem sırasında bir hata oluştu.", "error");
    }
  };

  const rejectOldAndSave = async () => {
    if (formError?.nextStepTraffic) {
      const traffic = formError.nextStepTraffic;
      setFormError({
        type: 'decision_panel', zone: 'traffic_warning',
        existingClient: traffic.data.client || traffic.data.customerName || "Bilinmeyen Müşteri",
        existingAddress: traffic.data.address || "Adres Belirtilmemiş",
        existingTime: `${traffic.data.start} - ${traffic.data.end}`,
        newClientName: newAppo.client || "Yeni Müşteri",
        newAddress: newAppo.address || "Adres Girilmemiş",
        gapMinutes: traffic.gap,
        pendingDecision: { type: 'reject_affected', ids: formError.affectedPendings.map(p => p.id) }
      });
      return; 
    }

    try {
      const affectedIds = formError.affectedPendings.map(p => p.id);
      for (const id of affectedIds) {
        await updateDoc(doc(db, "appointments", id), {
          status: 'rejected',
          expertRejectNote: 'Uzman bu saat dilimi için başka bir işi tercih etti.'
        });
      }

      let finalCoordSource = "API_District";
      if (coordsStatus.includes("MAHALLE") && !coordsStatus.includes("baz alındı")) {
        finalCoordSource = "API_Center";
      }

      const fullAddressStr = `${newAppo.city} / ${newAppo.district}${newAppo.neighborhood ? ` / ${newAppo.neighborhood} Mah.` : ''} - ${newAppo.address}`;

      const appointmentData = {
        ...newAppo,
        date: getDateKey(selectedDate),
        fullAddress: fullAddressStr,
        coordSource: finalCoordSource,
        lat: newAppo.lat ? parseFloat(newAppo.lat) : 0,
        lng: newAppo.lng ? parseFloat(newAppo.lng) : 0,
        expertId: auth.currentUser?.uid,
        expertName,
        companyName,
        status: 'approved',
        createdBy: 'expert',
        createdTime: Date.now(),
        approvedTime: Date.now()
      };

      if (isEditing) {
        await updateDoc(doc(db, "appointments", newAppo.id), appointmentData);
      } else {
        await addDoc(collection(db, "appointments"), appointmentData);
      }

      setShowFormModal(false);
      setFormError(null);
      showAppToast("Çakışan randevular reddedildi ve yenisi başarıyla eklendi!", "success");
    } catch (err) { 
      if (isDevelopment) console.error("Reddet/Kaydet hatası:", err.message);
      showAppToast("İşlem sırasında bir hata oluştu.", "error");
    }
  };

  const handleDelete = async () => {
    try {
      const docRef = doc(db, "appointments", selectedAppointment.id);
      await deleteDoc(docRef);
      setShowNoteModal(false);
      setShowFormModal(false);
      showAppToast("Randevu başarıyla silindi.", "success");
    } catch (error) {
      if (isDevelopment) console.error('Silme hatası:', error.message);
      showAppToast('Randevu silinirken bir hata oluştu.', "error");
    } finally {
      setShowDeleteConfirmModal(false);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();

    const now = new Date();
    const todayStr = getDateKey(now);
    const selectedDateStr = getDateKey(selectedDate);
    
    if (selectedDateStr === todayStr) {
      const nowHour = now.getHours();
      const nowMinute = now.getMinutes();
      const nowTotalMinutes = nowHour * 60 + nowMinute;
      
      const [startHour, startMinute] = newAppo.start.split(':').map(Number);
      const startTotalMinutes = startHour * 60 + startMinute;
      
      if (startTotalMinutes < nowTotalMinutes) {
        setFormError({
          type: 'error',
          message: `⚠️ Geçmiş saate randevu eklenemez!\n\nŞu an saat ${nowHour}:${nowMinute.toString().padStart(2, '0')}.\nSeçtiğiniz başlangıç saati (${newAppo.start}) geçmiş bir zamandır.\n\nLütfen ileri bir saat seçiniz.`
        });
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
    }

    if (!newAppo.neighborhood || newAppo.neighborhood.trim() === "") {
      setFormError({ 
        type: 'error', 
        message: 'Lütfen mahalle seçimini yapınız.\n\nKonum tespiti ve sağlıklı randevu kaydı için mahalle bilgisi zorunludur.' 
      });
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    if (newAppo.end <= newAppo.start) { 
      setFormError({ type: 'error', message: 'Bitiş saati, başlangıç saatinden sonra olmalıdır!' }); 
      return; 
    }

    const toMinutes = (timeStr) => {
      const [h, m] = timeStr.split(':').map(Number);
      return h * 60 + m;
    };

    const newStartMin = toMinutes(newAppo.start);
    const newEndMin = toMinutes(newAppo.end);

    if (newStartMin < startH * 60 || newEndMin > endH * 60) {
      setFormError({ 
        type: 'error', 
        message: `Seçilen saat aralığı uzmanımızın mesai saatleri dışındadır.\n\nRandevu kayıtları yalnızca ${startH}:00 ile ${endH}:00 saatleri arasında kabul edilmektedir.\n\nLütfen takvimdeki Yeşil Alanlardaki(Müsait) saatleri tercih ediniz.` 
      });
      return;
    }

    if (newEndMin - newStartMin < 5) { 
      showAppToast('Randevu süresi en az 5 dakika olmalıdır.', "error"); 
      return; 
    }

    let overlappingApproved = null;
    let affectedPendings = [];

    for (const app of dailyAppointments) {
      if (isEditing && app.id === selectedAppointment.id) continue;
      if (app.status === 'rejected') continue;

      const appStartMin = typeof app.start === 'string' ? toMinutes(app.start) : app.start * 60;

      if (app.status === 'approved') {
        const appEndMin = typeof app.end === 'string' ? toMinutes(app.end) : app.end * 60;
        
        const gapAfter = newStartMin - appEndMin;
        const gapBefore = appStartMin - newEndMin;

        if ((newStartMin < appEndMin && newEndMin > appStartMin) || (newStartMin >= appEndMin && gapAfter < 15) || (newEndMin <= appStartMin && gapBefore < 15)) {
          let type = 'exact';
          if (gapAfter >= 0 && gapAfter < 15) type = 'too_close_after';
          if (gapBefore >= 0 && gapBefore < 15) type = 'too_close_before';
          
          overlappingApproved = { type: type, data: app, gap: Math.max(gapAfter, gapBefore) };
          break;
        }

        if (!overlappingApproved) {
          if (newStartMin >= appEndMin && gapAfter < 60) {
            overlappingApproved = { type: 'traffic_warning_after', data: app, gap: gapAfter };
          } else if (newEndMin <= appStartMin && gapBefore < 60) {
            overlappingApproved = { type: 'traffic_warning_before', data: app, gap: gapBefore };
          }
        }
      }

      if (app.status === 'pending') {
        const pStart = appStartMin; 
        let effectiveDiff = Infinity;

        if (pStart >= newStartMin && pStart < newEndMin) {
          effectiveDiff = 0;
        } else if (pStart >= newEndMin) {
          effectiveDiff = pStart - newEndMin;
        } else {
          effectiveDiff = newStartMin - pStart;
        }

        if (effectiveDiff <= 60) {
          affectedPendings.push({ ...app, effectiveDiff });
        }
      }
    }

    if (overlappingApproved && (overlappingApproved.type === 'exact' || overlappingApproved.type === 'too_close_after' || overlappingApproved.type === 'too_close_before')) {
      const existingClient = overlappingApproved.data.client || overlappingApproved.data.customerName || "Bilinmeyen Müşteri";
      const requestedHours = `${newAppo.start} - ${newAppo.end}`;

      if (overlappingApproved.type === 'exact') {
        setFormError({
          type: 'error',
          message: `🚫 Üzgünüz, Seçtiğiniz Saat Dilimi Dolu\n\nSeçtiğiniz ${requestedHours} saatleri arasında zaten onaylanmış bir randevunuz bulunuyor. Takvimde bu saatler şu an ${existingClient} adına rezerve edilmiş durumda.\n\nLütfen takvimdeki yeşil (müsait) alanlardan birini tercih ediniz.`
        });
        return; 
      }

      const formatMins = (mins) => {
        const h = Math.floor(mins / 60);
        const m = mins % 60;
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      };

      const appData = overlappingApproved.data;
      const appStartMin = typeof appData.start === 'string' ? toMinutes(appData.start) : appData.start * 60;
      const appEndMin = typeof appData.end === 'string' ? toMinutes(appData.end) : appData.end * 60;
      
      let suggestionText = "";
      const newClientName = newAppo.client || "Yeni Müşteri";

      if (overlappingApproved.type === 'too_close_after') {
        suggestionText = `Lütfen başlangıç saatini **${formatMins(appEndMin + 15)}** veya sonrasını seçiniz.`;
      } else {
        suggestionText = `Lütfen bitiş saatini **${formatMins(appStartMin - 15)}** veya altını seçiniz.`;
      }

      setFormError({
        type: 'error',
        message: `Sistem kuralları gereği, ardışık randevular arasında uzmanın toparlanması ve yolculuğu için iki randevu kaydı arasında minimum 15 dakika ara verilmesi gerekmektedir.\n\nYeni eklemek istediğiniz ${newClientName} ve onaylı kayıdı bulunan ${existingClient} kişisinin randevuları arasında yeterli hazırlık süresi bulunmuyor.\n\n👉 ${suggestionText}`
      });
      return; 
    }

    if (affectedPendings.length > 0) {
      const trafficDataForLater = (overlappingApproved && (overlappingApproved.type === 'traffic_warning_after' || overlappingApproved.type === 'traffic_warning_before')) ? overlappingApproved : null;

      if (affectedPendings.length === 1) {
        const singleAppo = affectedPendings[0];
        setFormError({
          type: 'decision_panel', 
          zone: singleAppo.effectiveDiff <= 10 ? 'red' : 'yellow', 
          affectedPendings: affectedPendings, 
          pendingClientName: singleAppo.client || singleAppo.customerName || "İsimsiz Müşteri",
          pendingNote: singleAppo.note || "Müşteri not bırakmamış.",
          pendingAddress: singleAppo.address || "Adres belirtilmemiş.",
          pendingTime: singleAppo.start,
          newClientName: newAppo.client || "Yeni Müşteri",
          link: `/request-detail/${dateKey}/${singleAppo.id}`,
          nextStepTraffic: trafficDataForLater
        });
      } else {
        setFormError({
          type: 'decision_panel',
          zone: 'multi',
          affectedPendings: affectedPendings, 
          newClientName: newAppo.client || "Yeni Müşteri",
          nextStepTraffic: trafficDataForLater
        });
      }
      return; 
    }

    if (overlappingApproved && (overlappingApproved.type === 'traffic_warning_after' || overlappingApproved.type === 'traffic_warning_before')) {
      setFormError({
        type: 'decision_panel',
        zone: 'traffic_warning',
        existingClient: overlappingApproved.data.client || overlappingApproved.data.customerName || "Bilinmeyen Müşteri",
        existingAddress: overlappingApproved.data.address || "Adres Belirtilmemiş",
        existingTime: `${overlappingApproved.data.start} - ${overlappingApproved.data.end}`,
        newClientName: newAppo.client || "Yeni Müşteri",
        newAddress: newAppo.address || "Adres Girilmemiş",
        gapMinutes: overlappingApproved.gap,
        pendingDecision: null
      });
      return; 
    }

    const pid = auth.currentUser?.uid;
    const sH = parseInt(newAppo.start.split(':')[0]);
    const eH = parseInt(newAppo.end.split(':')[0]);

    let finalCoordSource = "API_District";

    if (coordsStatus.includes("✅") && coordsStatus.includes("MAHALLE")) {
        finalCoordSource = "API_Center";
    } else if (coordsStatus.includes("İLÇE") || coordsStatus.includes("baz alındı") || coordsStatus.includes("⚠️")) {
        finalCoordSource = "API_District";
    }

    const fullAddress = `${newAppo.city} / ${newAppo.district}${newAppo.neighborhood ? ` / ${newAppo.neighborhood} Mah.` : ''} - ${newAppo.address}`;

    const appointmentData = {
      ...newAppo,
      date: getDateKey(selectedDate),
      fullAddress: fullAddress,
      coordSource: finalCoordSource,
      lat: newAppo.lat ? parseFloat(newAppo.lat) : 0,
      lng: newAppo.lng ? parseFloat(newAppo.lng) : 0,
      startHour: sH,
      endHour: eH,
      expertId: auth.currentUser?.uid,
      expertName,
      companyName,
      status: 'approved',
      createdBy: 'expert',
      createdTime: Date.now(),
      approvedTime: Date.now()
    };

    try {
      if (isEditing) {
        const docRef = doc(db, "appointments", newAppo.id); 
        await updateDoc(docRef, appointmentData);
      } else {
        await addDoc(collection(db, "appointments"), {
          ...appointmentData,
          createdTime: Date.now()
        });
      }

      setShowFormModal(false);
      setIsEditing(false);
      setFormError(null);
      setNewAppo({ client: '', start: '', end: '', phone: '', email: '', address: '', note: '', city: '', district: '', neighborhood: '', lat: '', lng: '' });
      
      showAppToast(isEditing ? "Randevu güncellendi!" : "Randevu başarıyla kaydedildi!", "success");
    } catch (error) {
      if (isDevelopment) console.error('Kayıt/Güncelleme Hatası:', error.message);
      showAppToast('İşlem sırasında bir hata oluştu.', "error");
    }
  };

  const handleMahalleSecimi = (e) => {
    const secilenDeger = e.target.value;

    if (secilenDeger === 'bulamadim') {
      setElleGirisAktif(true);
      setNewAppo(prev => ({ ...prev, neighborhood: '' }));
    } else {
      setElleGirisAktif(false);
      const mahalleIsmi = mahalleler.find(m => m.id.toString() === secilenDeger)?.name || '';
      setNewAppo(prev => ({ ...prev, neighborhood: mahalleIsmi }));
    }
  };

  const generateDisplayBlocks = () => {
    let blocks = [];
    let currentMin = startH * 60;
    const endDayMin = endH * 60;

    const getMins = (timeStr) => {
      if (typeof timeStr !== 'string') return timeStr * 60;
      const [h, m] = timeStr.split(':').map(Number);
      return h * 60 + m;
    };

    const formatTime = (mins) => {
      const h = Math.floor(mins / 60);
      const m = mins % 60;
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    };

    const approvedApps = dailyAppointments.filter(app =>
      app.status === 'approved' || app.createdBy === 'expert'
    );
    const sortedApps = [...approvedApps].sort((a, b) => getMins(a.start) - getMins(b.start));

    const addFreeBlocks = (freeStart, freeEnd) => {
      let current = freeStart;
      while (current < freeEnd) {
        let nextHour = Math.floor(current / 60) * 60 + 60;
        let blockEnd = Math.min(nextHour, freeEnd);
        if (blockEnd - current >= 30) {
          blocks.push({ type: 'free', startStr: formatTime(current), endStr: formatTime(blockEnd) });
        }
        current = blockEnd;
      }
    };

    sortedApps.forEach(app => {
      const appStartMin = getMins(app.start);
      const appEndMin = getMins(app.end);
      if (appStartMin > currentMin) addFreeBlocks(currentMin, appStartMin);
      blocks.push({ type: 'appointment', startStr: formatTime(appStartMin), endStr: formatTime(appEndMin), data: app });
      currentMin = Math.max(currentMin, appEndMin);
    });

    if (currentMin < endDayMin) addFreeBlocks(currentMin, endDayMin);
    return blocks;
  };

  const displayBlocks = generateDisplayBlocks();

  return (
    <div className="profile-page">
      <Navbar />
      <main className="profile-main appointment-main">

        <div className="appointment-header">
          <div className="appo-title-wrap">
            <h2 className="appo-title">
              <i className="fas fa-calendar-alt"></i>
              {selectedDate.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', weekday: 'long' })}
            </h2>
          </div>

          <div className="appo-center-wrap">
            <div className="appo-requests-pos">
              <button className="btn-customer-requests" onClick={() => navigate('/customer-requests')}>
                <i className="fas fa-bell-concierge"></i>
                MÜŞTERİ TALEPLERİM
              </button>
              {pendingCount > 0 && (
                <span className="appo-pending-badge">{pendingCount}</span>
              )}
            </div>
          </div>

          <div className="appo-right-wrap">
            <button className="settings-primary-button appo-new-btn" onClick={handleNewClick}>
              <i className="fas fa-plus"></i> Yeni Kayıt Ekle
            </button>
          </div>
        </div>

        <section className="profile-card-section appo-grid-section">
          <div className="hours-grid">
            {isDayClosed ? (
              <div className="hour-card non-working appo-closed-full">
                <span className="hour-card-status appo-closed-text">Bu Gün Hizmet Verilmemektedir</span>
              </div>
            ) : (
              <>
                {startH > 0 && (
                  <div className="hour-card non-working appo-hour-tall">
                    <div className="hour-card-top appo-hour-top">{`00:00 - ${startH < 10 ? `0${startH}` : startH}:00`}</div>
                    <div className="appo-closed-label">Mesai Dışı</div>
                  </div>
                )}

                {displayBlocks.map((block, index) => {
                  const isApp = block.type === 'appointment';
                  return (
                    <div
                      key={index}
                      className={`hour-card appo-hour-tall ${isApp ? 'has-appo' : ''}`}
                      onClick={() => isApp && (setSelectedAppointment(block.data), setShowNoteModal(true))}
                    >
                      <div className="appo-block-times">
                        <div className="appo-block-time-row">
                          <strong>Başlangıç:</strong>
                          <span className="appo-block-start">{block.startStr}</span>
                        </div>
                        <div className="appo-block-time-row">
                          <strong>Bitiş:</strong>
                          <span className="appo-block-end">{block.endStr}</span>
                        </div>
                      </div>
                      <div className={`appo-block-label ${isApp ? 'appo-block-label--appo' : 'appo-block-label--free'}`}>
                        {isApp ? sanitizeText(block.data.client) : 'Müsait'}
                      </div>
                    </div>
                  );
                })}

                {endH < 24 && (
                  <div className="hour-card non-working appo-hour-tall">
                    <div className="hour-card-top appo-hour-top">{`${endH}:00 - 00:00`}</div>
                    <div className="appo-closed-label">Mesai Dışı</div>
                  </div>
                )}
              </>
            )}
          </div>
        </section>

        <section className="profile-card-section">
          <SharedCalendar 
            selectedDate={selectedDate} 
            onDateSelect={setSelectedDate} 
            mode="EXPERT"
            onWorkloadClick={() => setShowWorkloadModal(true)}
          />
        </section>

      </main>

      {showFormModal && (
        <div className="detail-overlay" onClick={() => { setShowFormModal(false); setFormError(null); }}>
          
          <div onClick={e => e.stopPropagation()}>

            <form 
              className="appointment-modal-form" 
              onSubmit={handleSave}
              style={{
                margin: 'auto',
                height: 'auto',
                borderRadius: '16px',
                width: '100%',
                overflowY: 'auto'
              }}
            >

              <div className="appo-form-header">
                <h3 className="appo-form-title">Yeni Randevu Kaydı</h3>
                <div className="appo-form-title-line"></div>
              </div>

              <div className="appo-form-legend-row">
                <div className="appo-form-date-label">
                  <i className="fas fa-calendar-alt"></i>
                  {selectedDate.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', weekday: 'long' })}
                </div>
                <div className="appo-legend-items">
                  <div className="appo-legend-item">
                    <div className="appo-legend-dot appo-legend-dot--closed"></div>
                    <span className="appo-legend-text">Mesai Dışı</span>
                  </div>
                  <div className="appo-legend-item">
                    <div className="appo-legend-dot appo-legend-dot--busy"></div>
                    <span className="appo-legend-text">Dolu</span>
                  </div>
                  <div className="appo-legend-item">
                    <div className="appo-legend-dot appo-legend-dot--free"></div>
                    <span className="appo-legend-text">Müsait</span>
                  </div>
                </div>
              </div>

              <div className="appo-visualizer-wrap">
                {isDayClosed ? (
                  <div className="hour-visualizer-block appo-visualizer-closed">
                    Tüm Gün Mesai Dışı
                  </div>
                ) : (
                  <>
                    {startH > 0 && (
                      <div className="appo-vis-block appo-vis-block--closed">
                        <div>{`00:00 - ${startH < 10 ? `0${startH}` : startH}:00`}</div>
                        <div className="appo-vis-sub">(Mesai Dışı)</div>
                      </div>
                    )}
                    {displayBlocks.map((block, idx) => {
                      const isApp = block.type === 'appointment';
                      return (
                        <div key={idx} className={`appo-vis-block ${isApp ? 'appo-vis-block--busy' : 'appo-vis-block--free'}`}>
                          <div>{block.startStr} - {block.endStr}</div>
                          <div className="appo-vis-sub">{isApp ? '(DOLU)' : '(MÜSAİT)'}</div>
                        </div>
                      );
                    })}
                    {endH < 24 && (
                      <div className="appo-vis-block appo-vis-block--closed">
                        <div>{`${endH}:00 - 00:00`}</div>
                        <div className="appo-vis-sub">(Mesai Dışı)</div>
                      </div>
                    )}
                  </>
                )}
              </div>

              <div className="appo-form-grid">
              <div className="appo-form-section appo-form-section--client">
                <div className="appo-field appo-field--span2">
                  <label className="appointment-input-label">MÜŞTERİ İSİM SOYİSİM (Zorunlu)</label>
                  <input 
                    type="text" 
                    autoComplete="off"
                    name="client" 
                    className="appointment-input-field" 
                    value={newAppo.client} 
                    onChange={handleInputChange} 
                    placeholder="Ad Soyad" 
                    required 
                  />
                </div>

                <div className="appo-field">
                  <label className="appointment-input-label">BAŞLANGIÇ SAATİ</label>
                  <input 
                    type="time" 
                    autoComplete="off"
                    name="start" 
                    className="appointment-input-field" 
                    value={newAppo.start} 
                    onChange={handleInputChange} 
                    required 
                  />
                </div>

                <div className="appo-field">
                  <label className="appointment-input-label">BİTİŞ SAATİ</label>
                  <input 
                    type="time" 
                    autoComplete="off"
                    name="end" 
                    className="appointment-input-field" 
                    value={newAppo.end} 
                    onChange={handleInputChange} 
                    required 
                  />
                </div>
              </div>

                <div className="appo-form-section">
                  <div className="appo-field appo-field--span4 appo-form-section-row">
                    <div>
                      <label className="appointment-input-label">ŞEHİR</label>
                      <select name="city" className="appointment-input-field" value={newAppo.city} onChange={(e) => { handleInputChange(e); setNewAppo(prev => ({ ...prev, district: '', neighborhood: '' })); }} required>
                        <option value="">Şehir Seçiniz</option>
                        {Object.keys(turkeyData).sort().map(city => <option key={city} value={city}>{city}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="appointment-input-label">İLÇE</label>
                      <select name="district" className="appointment-input-field" value={newAppo.district} onChange={(e) => { handleInputChange(e); setNewAppo(prev => ({ ...prev, neighborhood: '' })); }} required disabled={!newAppo.city}>
                        <option value="">İlçe Seçiniz</option>
                        {newAppo.city && turkeyData[newAppo.city].sort((a,b) => a.name.localeCompare(b.name, 'tr')).map(dist => <option key={dist.name} value={dist.name}>{dist.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="appointment-input-label">MAHALLE</label>
                      <select name="neighborhood_select" className="appointment-input-field" value={elleGirisAktif ? 'bulamadim' : (mahalleler.find(m => m.name === newAppo.neighborhood)?.id || '')} onChange={handleMahalleSecimi} disabled={!newAppo.district}>
                        <option value="">Mahalle Seçiniz</option>
                        {mahalleler.map(mah => <option key={mah.id} value={mah.id}>{mah.name}</option>)}
                      </select>
                    </div>
                  </div>

                  <div className="appo-field appo-field--span2">
                    <div className="appo-location-status">
                      <i className="fas fa-crosshairs appo-location-status__icon" aria-hidden="true" />
                      <div className="appo-location-status__text">
                        <span className="appo-location-status__label">KONUM DURUMU</span>
                        <span
                          className={`appo-location-status__value ${coordsStatus.includes("✅") ? "appo-location-status__value--ok" : ""}`}
                        >
                          {coordsStatus || "Seçim Bekleniyor"}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="appo-field appo-field--span2">
                    <div
                      role="button"
                      tabIndex={0}
                      className={`appo-address-toggle ${ayrintiliAdresAcik ? "appo-address-toggle--open" : ""}`}
                      onClick={() => setAyrintiliAdresAcik(!ayrintiliAdresAcik)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setAyrintiliAdresAcik(!ayrintiliAdresAcik);
                        }
                      }}
                    >
                      <span className="appo-address-toggle__emoji" aria-hidden="true">🏠</span>
                      <span className="appo-address-toggle__text">
                        {ayrintiliAdresAcik ? "Ayrıntılı Adresi Gizle" : "Ayrıntılı Adres Girişi Yap (Opsiyonel)"}
                      </span>
                    </div>
                  </div>

                  {ayrintiliAdresAcik && (
                    <div style={{ display: 'contents' }}>
                      <div className="appo-field appo-field--span4">
                        <label className="appointment-input-label">🏠 Cadde / Sokak / Bulvar — Site Adı (Varsa) — Blok Adı/Harfi (Varsa) — Bina (Dış Kapı) Numarası — Bina Kat Numarası — İç Kapı (Daire) Numarası</label>
                        <textarea name="address" className="appointment-input-field" style={{ height: '60px' }} value={newAppo.address} onChange={handleInputChange} placeholder="Sokak ismi, Bina No, Kat, Daire..."></textarea>
                      </div>
                      <div className="appo-field appo-field--span4" style={{ 
                        display: 'grid', 
                        gridTemplateColumns: '1fr 1.5fr', 
                        gap: '10px', 
                        marginTop: '5px' 
                      }}>
                        
                        <input
                          type="text"
                          className="appo-coords-input"
                          placeholder="Örn: 40.64, 35.83 (Koordinatları manuel girin)"
                          value={newAppo.lat && newAppo.lng ? `${newAppo.lat}, ${newAppo.lng}` : ''}
                          onChange={(e) => {
                            const val = e.target.value;
                            const [la, ln] = val.split(',');
                            setNewAppo(prev => ({ ...prev, lat: la?.trim() || '', lng: ln?.trim() || '' }));
                          }}
                        />
                      </div>
                    </div>
                  )}
                </div>

                  <div className="appo-form-section appo-form-section--contact">
                    <div className="appo-field appo-field--span4" style={{ display: 'flex', justifyContent: 'center' }}>
                      <div
                        role="button"
                        tabIndex={0}
                        className="appo-contact-toggle"
                        onClick={() => setIletisimAcik(!iletisimAcik)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setIletisimAcik(!iletisimAcik);
                          }
                        }}
                      >
                        <i className={`fas ${iletisimAcik ? "fa-chevron-up" : ""}`} aria-hidden="true" />
                        <span>
                          {iletisimAcik
                            ? "Not Bilgilerini Gizle"
                            : "@Eposta- Telefon - Randevu Notları Girmek İçin Tıklayınız (Opsiyonel)"}
                        </span>
                      </div>
                    </div>

                    {iletisimAcik && (
                      <div style={{ display: 'contents', animation: 'fadeInDown 0.3s ease' }}>
                        <div className="appo-field appo-field--span2">
                          <label className="appointment-input-label optional">E-POSTA</label>
                          <input type="email" autoComplete="off" name="email" className="appointment-input-field" value={newAppo.email} onChange={handleInputChange} placeholder="ornek@mail.com" />
                        </div>
                        <div className="appo-field appo-field--span2">
                          <label className="appointment-input-label optional">TELEFON</label>
                          <input type="tel" autoComplete="off" name="phone" className="appointment-input-field" value={newAppo.phone} onChange={handleInputChange} placeholder="05XX XXX XX XX" />
                        </div>
                        <div className="appo-field appo-field--span4">
                          <label className="appointment-input-label optional">ÖZEL NOTLAR</label>
                          <textarea name="note" className="appointment-input-field" style={{ height: '80px' }} value={newAppo.note} onChange={handleInputChange} placeholder="Randevu ile ilgili eklemek istediğiniz detaylar..."></textarea>
                        </div>
                      </div>
                    )}
                  </div>
              </div>                  

              <div className="appo-form-actions">
                <button type="button" className="btn-form-cancel" onClick={() => { setShowFormModal(false); setFormError(null); }}>İptal</button>
                <button type="submit" className="btn-form-submit">Randevuyu Onayla</button>
              </div>
            </form>

          </div>

        </div>
      )}

      {showNoteModal && selectedAppointment && (
        <div className="detail-overlay" onClick={() => setShowNoteModal(false)}>
          <div className="detail-card-container" onClick={e => e.stopPropagation()}>

            <div className="appo-detail-header">
              <i className="fas fa-address-card appo-detail-icon"></i>
              <h3 className="appo-detail-title">Randevu Detayları</h3>
            </div>

            <div className="appo-detail-body">
              <div className="appo-detail-client-row">
                <span className="appo-detail-client-label">Müşteri:</span>
                <span className="appo-detail-client-name">{sanitizeText(selectedAppointment.client)}</span>
              </div>

              <div className="appo-detail-times-row">
                <div className="appo-detail-time-block">
                  <div className="appo-detail-time-label">BAŞLANGIÇ SAATİ</div>
                  <div className="appo-detail-time-val appo-detail-time-val--start">{selectedAppointment.start}</div>
                </div>
                <div className="appo-detail-time-divider"></div>
                <div className="appo-detail-time-block">
                  <div className="appo-detail-time-label">BİTİŞ SAATİ</div>
                  <div className="appo-detail-time-val appo-detail-time-val--end">{selectedAppointment.end}</div>
                </div>
              </div>

              <div className="appo-detail-contacts">
                <div className="appo-detail-contact-item">
                  <span className="appo-detail-contact-label">TELEFON</span>
                  <div className="appo-detail-contact-val">
                    <i className="fas fa-phone-alt appo-detail-contact-icon"></i>
                    {sanitizeText(selectedAppointment.phone) || 'Girilmedi'}
                  </div>
                </div>
                <div className="appo-detail-contact-item">
                  <span className="appo-detail-contact-label">E-POSTA</span>
                  <div className="appo-detail-contact-val">
                    <i className="fas fa-envelope appo-detail-contact-icon"></i>
                    {sanitizeText(selectedAppointment.email) || 'Girilmedi'}
                  </div>
                </div>
              </div>

              <div className="appo-detail-section">
                <span className="appo-detail-section-label">ADRES</span>
                <div className="appo-detail-section-val">
                  <i className="fas fa-map-marker-alt appo-detail-map-icon"></i>
                  {sanitizeText(selectedAppointment.fullAddress || selectedAppointment.address) || 'Adres belirtilmedi'}
                </div>
              </div>

              <div className="appo-detail-section">
                <span className="appo-detail-section-label">İŞ NOTU</span>
                <div className="appo-detail-note-val">
                  <span className="appo-detail-note-text">"{sanitizeText(selectedAppointment.note) || 'Not eklenmemiş.'}"</span>
                </div>
              </div>
            </div>

            {showCancelWarning ? (
              <div className="appo-cancel-warning-box" style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid #ef4444', padding: '20px', borderRadius: '12px', textAlign: 'center', marginTop: '10px' }}>
                <i className="fas fa-exclamation-triangle" style={{ color: '#ef4444', fontSize: '28px', marginBottom: '12px' }}></i>
                <h4 style={{ color: '#c90e0e', marginBottom: '8px', fontSize: '18px' }}>Dikkat: Jetonunuz Yanacaktır!</h4>
                <p style={{ color: '#687483', fontSize: '14px', lineHeight: '1.6', marginBottom: '20px' }}>
                  Bu randevuyu iptal ederseniz onay için harcadığınız <strong>1 jeton iade edilmez.</strong><br/>
                  İptal yerine müşteriye "Vakit Değişikliği" teklif etmeniz önerilir.
                </p>
                
                <div className="appo-modal-btn-group">
                  <button className="appo-modal-btn appo-btn--yellow" onClick={() => setShowCancelWarning(false)}>
                    <i className="fas fa-arrow-left"></i> Geri Dön
                  </button>
                  <button 
                    className="appo-modal-btn appo-btn--red" 
                    onClick={async () => {
                      try {
                        const docRef = doc(db, "appointments", selectedAppointment.id);
                        await updateDoc(docRef, { 
                          status: 'cancelled_by_expert',
                          cancelledAt: Date.now() 
                        });
                        if (selectedAppointment.clientId) {
                          await addDoc(collection(db, "notifications"), {
                            userId: selectedAppointment.clientId,
                            title: "Randevunuz İptal Edildi",
                            message: `Sayın ${sanitizeText(selectedAppointment.client)} iyi günler dileriz. ${selectedAppointment.date} tarihli , saat ${selectedAppointment.start} de ve "${sanitizeText(selectedAppointment.note) || 'İş detayı belirtilmemiş'}" şikayetiyle başvurduğunuz ${expertName} isimli uzmanımıza vermiş olduğunuz onaylanmış randevunuz, uzmanın kendisi tarafından iptal edilmiştir ve uzman randevuya gelemeyecektir. Bu iptal için sizden özür dileriz. Uzmanımıza bu hareketinden dolayı cezai işlem uygulanmıştır. Sizden isteğimiz lütfen aynı veya farklı bir uzmandan yeni randevu oluşturmanızdır. Ayrıntıyı görmek isterseniz lütfen sağdaki butona tıklayın. UzmanaGel ekibi olarak iyi günler dileriz.`,
                            type: "appointment_cancelled_by_expert",
                            appointmentDate: selectedAppointment.date,
                            appointmentTime: selectedAppointment.start,
                            expertName: expertName,
                            link: "/customer-appointments?tab=cancelled_by_expert",
                            createdAt: serverTimestamp(),
                            read: false
                          });
                        }
                        setShowCancelWarning(false);
                        setShowNoteModal(false);
                        setShowCancelSuccessModal(true);
                      } catch (err) { 
                        if (isDevelopment) console.error(err); 
                      }
                    }}
                  >
                    Yine de İptal Et <i className="fas fa-times"></i>
                  </button>
                </div>
              </div>
            ) : (
              <div className="appo-modal-btn-group">
                
                <button className="appo-modal-btn appo-btn--yellow" onClick={() => { setShowNoteModal(false); setShowCancelWarning(false); }}>
                  Kapat
                </button>

                {(!selectedAppointment.createdBy || selectedAppointment.createdBy === 'expert') ? (
                  <>
                    <button className="appo-modal-btn appo-btn--green" onClick={handleEditClick}>
                      <i className="fas fa-edit"></i> Güncelle
                    </button>
                    <button className="appo-modal-btn appo-btn--red" onClick={() => setShowDeleteConfirmModal(true)}>
                      <i className="fas fa-trash-alt"></i> Sil
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      className="appo-modal-btn appo-btn--green"
                      onClick={() => {
                        setShowNoteModal(false);
                        setShowRescheduleModal(true);
                        setRescheduleStep(1);
                        setRescheduleSelectedDates([]);
                        setRescheduleReason("");
                      }}
                    >
                      <i className="fas fa-business-time"></i> Vakit Değişikliği
                    </button>

                    <button className="appo-modal-btn appo-btn--red" onClick={() => setShowCancelWarning(true)}>
                      <i className="fas fa-times-circle"></i> İptal Et
                    </button>
                  </>
                )}
              </div>
            )}    
          </div>
        </div>
      )}

      {formError && (
        <div className={`appo-outside-notification ${formError.type}`} style={{ zIndex: 9999 }}>
          <div className="appo-outside-content">
            <div className="appo-outside-header">
              <i className={formError.type === 'error' ? 'fas fa-ban' : 'fas fa-id-card'}></i>
              <span>{formError.type === 'decision_panel' ? 'AKILLI KARAR MERKEZİ' : 'BİLGİ / HATA PANELİ'}</span>
            </div>

            {formError.type === 'decision_panel' ? (
              <div className="appo-decision-container">
                
                {formError.zone === 'multi' ? (
                  <>
                    <p className="appo-outside-text">
                      ⚠️ ÇOKLU ÇAKIŞMA: Girmek istediğiniz saat aralığı, sistemde bekleyen <strong>{formError.affectedPendings.length} farklı müşterinin</strong> zamanıyla çakışıyor.
                    </p>
                    
                    <div className="appo-pending-info-card">
                      <h4>ETKİLENEN MÜŞTERİLER:</h4>
                      <ul style={{ paddingLeft: '15px', margin: '5px 0', color: '#c25757', fontSize: '14px' }}>
                        {formError.affectedPendings.map((p, idx) => (
                          <li key={idx} style={{ marginBottom: '4px' }}>
                            <strong>{sanitizeText(p.client || p.customerName || "İsimsiz")}</strong> (Saat: {p.start})
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div className="appo-outside-actions">
                      <div className="action-item">
                        <button type="button" className="appo-outside-btn reject-save-btn" onClick={rejectOldAndSave}>
                          🔴 TÜMÜNÜ REDDET VE YENİSİNİ KAYDET <i className="fas fa-trash-alt"></i>
                        </button>
                        <small>Listedeki tüm bekleyen talepler iptal edilir, sadece <strong>{sanitizeText(formError.newClientName)}</strong> eklenir.</small>
                      </div>
                      
                      <button type="button" className="appo-outside-btn link-only-btn" onClick={() => setFormError(null)}>
                        VAZGEÇ VE SAATİ DEĞİŞTİR <i className="fas fa-times"></i>
                      </button>
                    </div>
                  </>
                ) : formError.zone === 'traffic_warning' ? (
                  <>
                    <p className="appo-outside-text">
                      🚗 <strong>Trafik ve Lojistik Uyarısı</strong><br /><br />
                      Seçtiğiniz saat, mevcut <strong>{sanitizeText(formError.existingClient)}</strong> randevusuna çok yakın. 
                      İki randevu arasında sadece <strong>{formError.gapMinutes} dakika</strong> vaktiniz olacak.
                    </p>

                    <div className="appo-pending-info-card">
                      <h4 style={{ color: '#ffcc00' }}>📍 ADRES KIYASLAMASI:</h4>
                      <p><strong>1. İşin Adresi:</strong> {sanitizeText(formError.existingAddress)}</p>
                      <p style={{ marginTop: '8px' }}><strong>2. İşin Adresi:</strong> {sanitizeText(formError.newAddress)}</p>
                    </div>

                    <p className="appo-outside-text" style={{ fontSize: '13px', marginTop: '10px', color: '#bbb' }}>
                      ℹ️ <em>Not: Bu iki lokasyon arası tahmini ulaşım süresi trafik durumuna göre <strong>25-35 dakika</strong> sürebilir.</em>
                    </p>

                    <div className="appo-outside-actions">
                      <div className="action-item">
                        <button type="button" className="appo-outside-btn keep-btn" onClick={keepBothAndSave}>
                          🟢 RİSKİ KABUL ET VE YİNE DE KAYDET <i className="fas fa-check-double"></i>
                        </button>
                        <small>Usta yetişebileceğini düşünüyorsa bu seçeneği kullanın.</small>
                      </div>
                      
                      <button type="button" className="appo-outside-btn link-only-btn" onClick={() => setFormError(null)}>
                        ❌ VAZGEÇ VE SAATİ GÜNCELLE
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="appo-outside-text">
                      {formError.zone === 'red' 
                        ? `⚠️ KRİTİK ÇAKIŞMA: Yeni randevunuz, bekleyen bir talep ile üst üste biniyor veya 10 dakikadan daha az mesafe var.` 
                        : `🟡 YAKIN ZAMANLI TALEP: Girmek istediğiniz saate yakın (1 saat içinde) bekleyen bir müşteri var.`}
                    </p>

                    <div className="appo-pending-info-card">
                      <h4>BEKLEYEN MÜŞTERİ BİLGİLERİ:</h4>
                      <p><strong>👤 İsim:</strong> {sanitizeText(formError.pendingClientName)}</p>
                      <p><strong>⏰ Saat:</strong> {formError.pendingTime}</p>
                      <p><strong>🛠️ İş Özeti:</strong> {sanitizeText(formError.pendingNote)}</p>
                      <p><strong>📍 Adres:</strong> {sanitizeText(formError.pendingAddress)}</p>
                    </div>

                    <div className="appo-outside-actions">
                      {formError.zone === 'yellow' && (
                        <div className="action-item">
                          <button type="button" className="appo-outside-btn keep-btn" onClick={keepBothAndSave}>
                            🟢 İKİSİNİ DE TUT VE KAYDET <i className="fas fa-check-double"></i>
                          </button>
                          <small><strong>{sanitizeText(formError.pendingClientName)}</strong> beklemede kalır, <strong>{sanitizeText(formError.newClientName)}</strong> sisteme eklenir.</small>
                        </div>
                      )}

                      <div className="action-item">
                        <button type="button" className="appo-outside-btn reject-save-btn" onClick={rejectOldAndSave}>
                          🔴 ESKİSİNİ REDDET VE KAYDET <i className="fas fa-user-times"></i>
                        </button>
                        <small><strong>{sanitizeText(formError.pendingClientName)}</strong> reddedilir, sadece <strong>{sanitizeText(formError.newClientName)}</strong> sisteme eklenir.</small>
                      </div>

                      <button type="button" className="appo-outside-btn link-only-btn" onClick={() => navigate(formError.link)}>
                        TALEBİ TAM SAYFA İNCELE <i className="fas fa-external-link-alt"></i>
                      </button>
                    </div>
                  </>

                )} 

              </div>
            ) : (
              <p className="appo-outside-text">{sanitizeText(formError.message)}</p>
            )}
          </div>
          <button type="button" className="appo-outside-close" onClick={() => setFormError(null)}>×</button>
        </div>
      )}

      {showWorkloadModal && (
        <div className="detail-overlay" onClick={() => setShowWorkloadModal(false)}>
          <div className="appointment-modal-form workload-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '600px' }}>
            
            <div className="appo-form-header">
              <h3 className="appo-form-title">Günün İş Yoğunluğu: {selectedDate.toLocaleDateString('tr-TR')}</h3>
              <div className="appo-form-title-line"></div>
            </div>

            <div className="workload-section">
              <h4 style={{ color: '#10b981', marginBottom: '15px' }}>
                <i className="fas fa-check-circle"></i> {dailyAppointments.filter(a => a.status === 'approved' || a.createdBy === 'expert').length} Adet Onaylı Müşteri
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {dailyAppointments
                  .filter(a => a.status === 'approved' || a.createdBy === 'expert')
                  .sort((a, b) => a.start.localeCompare(b.start))
                  .map((app, index) => (
                    <div key={index} style={{ background: 'rgba(16, 185, 129, 0.1)', padding: '12px', borderRadius: '8px', borderLeft: '4px solid #10b981', color: '#fff' }}>
                      <strong>{sanitizeText(app.client || "Uzman Kaydı")}</strong> 
                      <span style={{ float: 'right', color: '#cbd5e1' }}>{app.start} - {app.end}</span>
                    </div>
                  ))}
              </div>
            </div>

            <hr style={{ border: 'none', height: '2px', background: '#334155', margin: '25px 0' }} />

            <div className="workload-section">
              <h4 style={{ color: '#f59e0b', marginBottom: '15px' }}>
                <i className="fas fa-clock"></i> {dailyAppointments.filter(a => a.status === 'pending').length} Adet Onay Bekleyen Müşteri
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {dailyAppointments
                  .filter(a => a.status === 'pending')
                  .map((app, index) => (
                    <div key={index} style={{ background: 'rgba(245, 158, 11, 0.1)', padding: '12px', borderRadius: '8px', borderLeft: '4px solid #f59e0b', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <strong style={{ color: '#ffffffe5' }}>{sanitizeText(app.client)}</strong>
                        <div style={{ fontSize: '15px', color: '#4ae611e8' }}>Talep Edilen Başlangıç Saati: {app.start}</div>
                      </div>
                      <button 
                        className="settings-primary-button" 
                        style={{ padding: '12px 12px', fontSize: '15px', background: '#e9b029ed' }}
                        onClick={() => navigate(`/request-detail/${dateKey}/${app.id}`)}
                      >
                        Detaya Git <i className="fas fa-external-link-alt"></i>
                      </button>
                    </div>
                  ))}
              </div>
            </div>

            <div className="appo-form-actions" style={{ marginTop: '25px' }}>
              <button type="button" className="btn-form-cancel" style={{ width: '100%' }} onClick={() => setShowWorkloadModal(false)}>Kapat</button>
            </div>
          </div>
        </div>
      )}

      {showRescheduleModal && selectedAppointment && (
        <div className="detail-overlay" onClick={() => setShowRescheduleModal(false)}>
          <div className="appointment-modal-form reschedule-modal" onClick={e => e.stopPropagation()} style={{ width: '95vw', height: '90vh', maxWidth: '1800px', display: 'flex', flexDirection: 'column' }}>
            <div className="appo-form-header">
              <h3 className="appo-form-title">
                {rescheduleStep === 1 ? "Vakit Değişikliği Talebi Oluştur" : "Talebi Gözden Geçir ve Gönder"}
              </h3>
              <div className="appo-form-title-line"></div>
            </div>

            {rescheduleStep === 1 ? (
              <div className="reschedule-step-1" style={{ display: 'flex', gap: '30px', flex: 1, overflow: 'hidden', padding: '10px' }}>
                
                <div style={{ flex: '1', display: 'flex', flexDirection: 'column', overflowY: 'auto', paddingRight: '10px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                    <label className="appointment-input-label" style={{ color: '#10b981', margin: 0 }}>
                      <i className="fas fa-calendar-check"></i> MÜSAİT GÜNLERİ SEÇİN
                    </label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button 
                        type="button" 
                        className="settings-primary-button" 
                        style={{ background: '#3b82f6', padding: '6px 12px', fontSize: '13px', borderRadius: '8px' }} 
                        onClick={() => {
                          const allDates = [];
                          const minTime = new Date(selectedAppointment.date).getTime();
                          for(let i=0; i<=30; i++) {
                            const d = new Date();
                            d.setDate(d.getDate() + i);
                            d.setHours(0,0,0,0);
                            if (d.getTime() > minTime && d.getTime() > new Date().setHours(0,0,0,0)) {
                               allDates.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`);
                            }
                          }
                          setRescheduleSelectedDates(allDates);
                        }}
                      >
                        <i className="fas fa-check-double"></i> Tümünü Seç
                      </button>

                      <button 
                        type="button" 
                        className="settings-primary-button" 
                        style={{ background: '#ef4444', padding: '6px 12px', fontSize: '13px', borderRadius: '8px' }} 
                        onClick={() => setRescheduleSelectedDates([])}
                      >
                        <i className="fas fa-trash-sweep"></i> Seçimi Temizle
                      </button>
                    </div>
                  </div>
                  
                  <div style={{ background: 'rgba(15, 23, 42, 0.5)', padding: '15px', borderRadius: '12px', border: '1px dashed #334155', flex: 1, overflowY: 'auto' }}>
                    <SharedCalendar 
                      mode="MULTI_SELECT"
                      selectedDates={rescheduleSelectedDates}
                      onDatesChange={setRescheduleSelectedDates}
                      minDate={selectedAppointment.date} 
                    />
                  </div>
                </div>

                <div style={{ flex: '1', display: 'flex', flexDirection: 'column', gap: '20px', overflowY: 'auto' }}>
                   
                   <div className="appo-field">
                     <label className="appointment-input-label">MÜŞTERİYE MAZERETİNİZİ YAZIN (Zorunlu)</label>
                     <textarea 
                       className="appointment-input-field" 
                       style={{ 
                         height: '90px', 
                         border: rescheduleReason.trim().length < 5 ? '2px solid #ef4444' : '2px solid #6366f1', 
                         resize: 'none',
                         transition: 'all 0.3s ease'
                       }}
                       placeholder="Örn: Acil bir durum nedeniyle..."
                       value={rescheduleReason}
                       onChange={(e) => setRescheduleReason(e.target.value)}
                     />
                     {rescheduleReason.trim().length < 5 && (
                       <small style={{ color: '#ef4444', fontSize: '11px', marginTop: '5px' }}>* Lütfen geçerli bir mazeret belirtin.</small>
                     )}
                   </div>
                   
                   <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
                     <button 
                       type="button" 
                       onClick={() => setSelectedDate(new Date(new Date(selectedDate).setDate(selectedDate.getDate() - 1)))} 
                       style={{ background: '#334155', border: 'none', color: '#fff', padding: '8px 12px', borderRadius: '6px', cursor: 'pointer', transition: 'none', fontWeight: 'bold', fontSize: '13px' }}
                     >
                       <i className="fas fa-chevron-left"></i> Önceki Gün
                     </button>
                     
                     <div style={{ color: '#ffcc00', fontWeight: 'bold', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                       <i className="fas fa-clock"></i> 
                       <input 
                         type="date" 
                         value={getDateKey(selectedDate)} 
                         onChange={(e) => { if(e.target.value) setSelectedDate(new Date(e.target.value)) }} 
                         style={{ background: 'transparent', border: 'none', color: '#ffcc00', fontWeight: 'bold', outline: 'none', cursor: 'pointer', transition: 'none', fontFamily: 'inherit', fontSize: '15px' }} 
                       />
                     </div>

                     <button 
                       type="button" 
                       onClick={() => setSelectedDate(new Date(new Date(selectedDate).setDate(selectedDate.getDate() + 1)))} 
                       style={{ background: '#334155', border: 'none', color: '#fff', padding: '8px 12px', borderRadius: '6px', cursor: 'pointer', transition: 'none', fontWeight: 'bold', fontSize: '13px' }}
                     >
                       Sonraki Gün <i className="fas fa-chevron-right"></i>
                     </button>
                   </div>

                   <div style={{ background: '#1e293b', borderRadius: '12px', padding: '15px', flex: 1, display: 'flex', flexDirection: 'column', border: '1px solid #334155' }}>
                     <div className="hours-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', overflowY: 'auto', flex: 1, paddingRight: '5px' }}>
                       {isDayClosed ? (
                         <div className="hour-card non-working appo-closed-full" style={{ transition: 'none' }}><span className="hour-card-status appo-closed-text">Bu Gün Hizmet Verilmemektedir</span></div>
                       ) : (
                         <>
                           {displayBlocks.map((block, index) => {
                             const isApp = block.type === 'appointment';
                             return (
                               <div key={index} className={`hour-card appo-hour-tall ${isApp ? 'has-appo' : ''}`} style={{ cursor: 'default', minHeight: '80px' }}>
                                 <div className="appo-block-times">
                                   <div className="appo-block-time-row"><strong>Baş:</strong><span className="appo-block-start">{block.startStr}</span></div>
                                   <div className="appo-block-time-row"><strong>Bit:</strong><span className="appo-block-end">{block.endStr}</span></div>
                                 </div>
                                 <div className={`appo-block-label ${isApp ? 'appo-block-label--appo' : 'appo-block-label--free'}`} style={{ fontSize: '11px', textAlign: 'center', marginTop: '5px' }}>
                                   {isApp ? sanitizeText(block.data.client) : 'Müsait'}
                                 </div>
                               </div>
                             );
                           })}
                         </>
                       )}
                     </div>
                   </div>

                   <div className="appo-form-actions" style={{ marginTop: 'auto', paddingTop: '15px' }}>
                     <button type="button" className="btn-form-cancel" onClick={() => setShowRescheduleModal(false)}>İptal</button>
                     <button 
                       type="button" 
                       className="btn-form-submit" 
                       onClick={() => {
                         const hasReason = rescheduleReason && rescheduleReason.trim().length > 5;
                         const hasDates = rescheduleSelectedDates && rescheduleSelectedDates.length > 0;

                         if (!hasReason) {
                           showAppToast("Lütfen geçerli bir mazeret giriniz (en az 5 karakter).", "error");
                           return;
                         }

                         if (!hasDates) {
                           showAppToast("Lütfen müşterinize sunmak için en az bir gün seçiniz.", "error");
                           return;
                         }

                         setRescheduleStep(2);
                       }}
                     >
                       Devam Et (Özet Gör) <i className="fas fa-arrow-right"></i>
                     </button>
                   </div>
                </div>
              </div>
            ) : (
              <div 
                className="reschedule-step-2" 
                style={{ 
                  padding: '30px', 
                  display: 'flex', 
                  flexDirection: 'column', 
                  flex: 1, 
                  minHeight: '500px',
                  background: '#111827',
                  overflowY: 'auto' 
                }}
              >
                <div style={{ background: '#1e293b', padding: '25px', borderRadius: '16px', border: '1px solid #334155', marginBottom: '30px' }}>
                <h4 style={{ color: '#94a3b8', fontSize: '14px', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '15px' }}>
                  <i className="fas fa-comment-dots"></i> Müşteriye İletilecek Mesaj:
                </h4>
                <p style={{ color: '#fff', fontStyle: 'italic', fontSize: '17px', lineHeight: '1.6', background: 'rgba(0,0,0,0.2)', padding: '15px', borderRadius: '8px' }}>
                  "{sanitizeText(rescheduleReason)}"
                </p>
                
                <h4 style={{ color: '#94a3b8', fontSize: '14px', textTransform: 'uppercase', letterSpacing: '1px', marginTop: '30px', marginBottom: '15px' }}>
                  <i className="fas fa-calendar-check"></i> Teklif Edilen Alternatif Günler:
                </h4>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                  {rescheduleSelectedDates.map(date => (
                    <span key={date} style={{ background: 'linear-gradient(135deg, #10b981, #059669)', color: '#fff', padding: '8px 16px', borderRadius: '12px', fontSize: '14px', fontWeight: 'bold', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}>
                      <i className="fas fa-calendar-day"></i> {new Date(date).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', weekday: 'long' })}
                    </span>
                  ))}
                </div>
              </div>

              <div className="appo-form-actions" style={{ marginTop: 'auto' }}>
                <button type="button" className="btn-form-cancel" onClick={() => setRescheduleStep(1)}>
                  <i className="fas fa-arrow-left"></i> Seçimleri Düzenle
                </button>
                
                <button 
                    type="button" 
                    className="btn-form-submit" 
                    style={{ background: '#6366f1', padding: '15px 30px' }}
                    onClick={async () => {
                      try {
                        const appRef = doc(db, "appointments", selectedAppointment.id);
                        const toMinutes = (t) => t.split(':').reduce((h, m) => h * 60 + (+m));
                        const duration = toMinutes(selectedAppointment.end) - toMinutes(selectedAppointment.start);

                        await updateDoc(appRef, {
                          status: 'reschedule_pending',
                          rescheduleReason,
                          rescheduleAllowedDates: rescheduleSelectedDates,
                          originalDate: selectedAppointment.date,
                          originalStart: selectedAppointment.start,
                          originalEnd: selectedAppointment.end,
                          appointmentDuration: duration,
                          rescheduledAt: serverTimestamp()
                        });
                        
                      await addDoc(collection(db, "notifications"), {
                        userId: selectedAppointment.clientId,
                        title: "Vakit Değişikliği Talebi",
                        message: `Uzmanımız ${expertName}, randevunuz için mazeret bildirerek yeni bir vakit seçmenizi talep etti.`,
                        type: "reschedule_request",
                        link: "/customer-appointments?tab=reschedule_requests", 
                        createdAt: serverTimestamp(),
                        read: false
                      });

                      setShowRescheduleModal(false);
                      showAppToast("Vakit değişikliği talebiniz başarıyla gönderildi!", "success");
                    } catch (err) { 
                      if (isDevelopment) console.error("Firebase Hatası:", err.message); 
                      showAppToast("İşlem sırasında bir hata oluştu!", "error"); 
                    }
                  }}
                >
                  Talebi Müşteriye Gönder <i className="fas fa-paper-plane"></i>
                </button>
              </div>
            </div>
            )}
          </div>
        </div>
      )}

      <CancelSuccessModal 
        isOpen={showCancelSuccessModal} 
        onClose={() => setShowCancelSuccessModal(false)} 
        expertName={expertName}
      />

      <ConfirmModal
        isOpen={showDeleteConfirmModal}
        onClose={() => setShowDeleteConfirmModal(false)}
        onConfirm={handleDelete}
        title="Randevuyu Sil"
        message="Bu randevuyu silmek istediğinize emin misiniz? Bu işlem geri alınamaz."
        confirmText="Evet, Sil"
        cancelText="Vazgeç"
        type="danger"
      />

    </div>

  );
};

export default AppointmentPage;