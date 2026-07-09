import React, { useState, useEffect, useRef } from 'react';
import Navbar from '../components/Navbar';
import { useNavigate, useParams } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import '../styles/AppointmentPage.css';
import {
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  collection,
  query,
  where,
  addDoc,
  deleteDoc,
  updateDoc,
} from 'firebase/firestore';
import AddressModal from '../components/AddressModal';
import { db, auth } from '../firebase/firebaseClient';
import SharedCalendar from '../components/SharedCalendar';
import DOMPurify from 'dompurify';
import { fetchListingById } from '../services/listingsApi';
import { showAppToast } from '../utils/showAppToast';
import ConfirmModal from '../components/ConfirmModal';

const isDevelopment = process.env.NODE_ENV === 'development';

const sanitizeText = (text) => {
  if (!text) return '';
  return DOMPurify.sanitize(String(text));
};

const validateAndSanitizeInput = (value, maxLength = 500) => {
  if (!value) return '';
  const sanitized = String(value).trim();
  if (sanitized.length > maxLength) {
    return sanitized.slice(0, maxLength);
  }
  return sanitizeText(sanitized);
};

const validatePhoneNumber = (phone) => {
  const cleaned = String(phone || '').replace(/\s/g, '');
  const phoneRegex = /^(\+90|0)?[0-9]{10,11}$/;
  return phoneRegex.test(cleaned);
};

const validateEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(String(email || '').trim());
};

const MIN_APPOINTMENT_LEAD_MS = 30 * 60 * 1000;
const APPOINTMENT_MIN_LEAD_MSG =
  'Randevu talebi, başlangıç saatine en az 30 dakika kala verilmelidir. Lütfen daha ileri bir saat seçiniz.';

const CustomerAppointmentPage = () => {
  const { expertId } = useParams();
  const navigate = useNavigate();

  const [selectedDate, setSelectedDate] = useState(new Date());
  const [allData, setAllData] = useState({});
  const [providerWorkingHours, setProviderWorkingHours] = useState(null);
  const [showFormModal, setShowFormModal] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [formError, setFormError] = useState(null);
  const [newAppo, setNewAppo] = useState({
    client: '',
    start: '',
    phone: '',
    address: '',
    note: '',
    email: '',
  });
  const [expertName, setExpertName] = useState('İsimsiz Uzman');
  const [companyName, setCompanyName] = useState('');

  const [user, setUser] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [userDisplayName, setUserDisplayName] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [userPhone, setUserPhone] = useState('');
  const [loadingUserInfo, setLoadingUserInfo] = useState(true);

  const [savedAddresses, setSavedAddresses] = useState([]);
  const [selectedAddressId, setSelectedAddressId] = useState('');

  const [showAddressModal, setShowAddressModal] = useState(false);
  const [editingAddressId, setEditingAddressId] = useState(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [isTempAddressMode, setIsTempAddressMode] = useState(false);
  const [tempAddressData, setTempAddressData] = useState(null);

  const [listingId, setListingId] = useState(null);
  const [isPenalized, setIsPenalized] = useState(false);
  const [appointmentsPermissionError, setAppointmentsPermissionError] = useState(false);
  const [listingTitle, setListingTitle] = useState('');
  const [isListingInfoLoading, setIsListingInfoLoading] = useState(true);
  const [showDeleteConfirmModal, setShowDeleteConfirmModal] = useState(false);
  const [addressToDelete, setAddressToDelete] = useState(null);
  const minLeadNotifSentRef = useRef('');

  const isProvider = userRole === 'PROVIDER';

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const listingIdFromUrl = params.get('listingId');
    if (listingIdFromUrl && /^[a-zA-Z0-9_-]+$/.test(listingIdFromUrl)) {
      setListingId(listingIdFromUrl);
    }
  }, []);

  useEffect(() => {
    const fetchListingInfo = async () => {
      if (!listingId) {
        setIsListingInfoLoading(false);
        return;
      }
      
      setIsListingInfoLoading(true);
      
      try {
        const listingData = await fetchListingById(listingId);
        setListingTitle(listingData?.title ? validateAndSanitizeInput(listingData.title, 200) : '');
      } catch (error) {
        if (isDevelopment) console.error('İlan bilgisi çekilemedi:', error);
        setListingTitle('');
      } finally {
        setIsListingInfoLoading(false);
      }
    };
    
    fetchListingInfo();
  }, [listingId]);

  useEffect(() => {
    let unsubPenalty = () => {};

    const unsubAuth = onAuthStateChanged(auth, async (currentUser) => {
      unsubPenalty();

      if (!currentUser) {
        setUser(null);
        setUserRole(null);
        setUserDisplayName('');
        setUserEmail('');
        setUserPhone('');
        setLoadingUserInfo(false);
        return;
      }

      setUser(currentUser);

      try {
        const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
        if (userDoc.exists()) {
          const data = userDoc.data();
          const role = data.userType || 'CLIENT';
          const displayName = data.displayName || currentUser.displayName || '';
          const email = data.email || currentUser.email || '';
          const phone = data.phoneNumber || currentUser.phoneNumber || '';

          setUserRole(role);
          setUserDisplayName(displayName);
          setUserEmail(email);
          setUserPhone(phone);
          setNewAppo((prev) => ({
            ...prev,
            client: validateAndSanitizeInput(displayName, 100),
            email: validateAndSanitizeInput(email, 100),
            phone: validateAndSanitizeInput(phone, 20),
          }));
        } else {
          setUserRole('CLIENT');
          setUserDisplayName(currentUser.displayName || '');
          setUserEmail(currentUser.email || '');
          setUserPhone(currentUser.phoneNumber || '');
          setNewAppo((prev) => ({
            ...prev,
            client: validateAndSanitizeInput(currentUser.displayName || '', 100),
            email: validateAndSanitizeInput(currentUser.email || '', 100),
            phone: validateAndSanitizeInput(currentUser.phoneNumber || '', 20),
          }));
        }
      } catch (error) {
        if (isDevelopment) console.error('Kullanıcı bilgileri alınamadı:', error);
      } finally {
        setLoadingUserInfo(false);
      }

      unsubPenalty = onSnapshot(
        doc(db, 'users', currentUser.uid),
        (docSnap) => {
          if (docSnap.exists()) {
            const data = docSnap.data();
            if (data.penaltyEndDate) {
              const now = new Date();
              const penaltyDate = data.penaltyEndDate.toDate();
              setIsPenalized(penaltyDate > now);
            } else {
              setIsPenalized(false);
            }
          } else {
            setIsPenalized(false);
          }
        },
        (error) => {
          if (isDevelopment) console.error('Ceza bilgisi dinlenirken hata:', error);
          setIsPenalized(false);
        }
      );
    });

    return () => {
      unsubAuth();
      unsubPenalty();
    };
  }, []);

  useEffect(() => {
    if (formError && formError.type !== 'decision_panel') {
      const timer = setTimeout(() => {
        setFormError(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [formError]);

  const confirmDeleteAddress = async () => {
    const id = addressToDelete;
    if (!id) return;
    
    try {
      const clientId = auth.currentUser?.uid;
      if (!clientId) {
        showAppToast('Lütfen önce giriş yapınız.', 'error');
        return;
      }
      await deleteDoc(doc(db, 'users', clientId, 'addresses', id));
      if (selectedAddressId === id) setSelectedAddressId('');
      setRefreshTrigger((prev) => prev + 1);
      showAppToast('Adres başarıyla silindi.', 'success');
    } catch (error) {
      if (isDevelopment) console.error('Silme hatası:', error);
      showAppToast('Adres silinirken bir hata oluştu.', 'error');
    } finally {
      setShowDeleteConfirmModal(false);
      setAddressToDelete(null);
    }
  };

  const handleDeleteAddress = async (id) => {
    if (!id || typeof id !== 'string') return;
    setAddressToDelete(id);
    setShowDeleteConfirmModal(true);
  };

  const openEditAddress = (id) => {
    if (!id || typeof id !== 'string') return;
    setEditingAddressId(id);
    setShowAddressModal(true);
  };

  const openAddAddress = () => {
    setEditingAddressId(null);
    setShowAddressModal(true);
  };

  const handleModalSave = async (formData) => {
    const clientId = auth.currentUser?.uid;
    if (!clientId) {
      showAppToast('Lütfen önce giriş yapınız.', 'error');
      return;
    }

    const sanitizedData = {
      addressName: validateAndSanitizeInput(formData.addressName, 100),
      city: validateAndSanitizeInput(formData.city, 50),
      district: validateAndSanitizeInput(formData.district, 50),
      neighborhood: validateAndSanitizeInput(formData.neighborhood, 100),
      street: validateAndSanitizeInput(formData.street, 200),
      siteName: validateAndSanitizeInput(formData.siteName, 100),
      apartmentName: validateAndSanitizeInput(formData.apartmentName, 100),
      blockName: validateAndSanitizeInput(formData.blockName, 50),
      buildingNo: validateAndSanitizeInput(formData.buildingNo, 20),
      floor: validateAndSanitizeInput(formData.floor, 10),
      doorNo: validateAndSanitizeInput(formData.doorNo, 10),
      lat: typeof formData.lat === 'number' && !isNaN(formData.lat) && Math.abs(formData.lat) <= 90 ? formData.lat : null,
      lng: typeof formData.lng === 'number' && !isNaN(formData.lng) && Math.abs(formData.lng) <= 180 ? formData.lng : null,
      coordSource: validateAndSanitizeInput(formData.coordSource, 20),
    };

    try {
      if (editingAddressId) {
        await updateDoc(doc(db, 'users', clientId, 'addresses', editingAddressId), {
          ...sanitizedData,
          updatedAt: Date.now(),
        });
        showAppToast('Adres başarıyla güncellendi.', 'success');
      } else {
        await addDoc(collection(db, 'users', clientId, 'addresses'), {
          ...sanitizedData,
          createdAt: Date.now(),
        });
        showAppToast('Adres başarıyla eklendi.', 'success');
      }
      setShowAddressModal(false);
      setEditingAddressId(null);
      setRefreshTrigger((prev) => prev + 1);
    } catch (error) {
      if (isDevelopment) console.error('Kayıt hatası:', error);
      showAppToast('Adres kaydedilirken bir hata oluştu.', 'error');
    }
  };

  const handleTempAddressSave = (addressData) => {
    setTempAddressData(addressData);
    setShowAddressModal(false);
    setShowFormModal(true);
    setFormError(null);
  };

  useEffect(() => {
    const fetchAddresses = async () => {
      const clientId = auth.currentUser?.uid;
      if (!clientId || !showFormModal || isProvider) return;

      try {
        const addressesRef = collection(db, 'users', clientId, 'addresses');
        const addressSnap = await getDocs(addressesRef);
        const addresses = [];
        addressSnap.forEach((docItem) => {
          addresses.push({ id: docItem.id, ...docItem.data() });
        });
        setSavedAddresses(addresses.slice(0, 2));
        if (addresses.length > 0) {
          setSelectedAddressId((prev) => prev || addresses[0].id);
        }
      } catch (error) {
        if (isDevelopment) console.error('Adresler çekilirken hata:', error);
      }
    };
    fetchAddresses();
  }, [showFormModal, refreshTrigger, isProvider]);

  useEffect(() => {
    if (!expertId || loadingUserInfo) return;

    let unsubProvider = () => {};
    let unsubAppos = () => {};
    let intervalId = null;

    const fetchExpertUserName = async () => {
      try {
        const userRef = doc(db, 'users', expertId);
        const userSnap = await getDoc(userRef);
        if (userSnap.exists()) {
          const uData = userSnap.data();
          let tempName = 'İsimsiz Uzman';
          if (uData.name && uData.surname) {
            tempName = `${validateAndSanitizeInput(uData.name, 50)} ${validateAndSanitizeInput(uData.surname, 50)}`;
          } else if (uData.displayName) {
            tempName = validateAndSanitizeInput(uData.displayName, 100);
          } else if (uData.name) {
            tempName = validateAndSanitizeInput(uData.name, 50);
          }
          setExpertName(tempName);
        }
      } catch (error) {
        if (isDevelopment) console.error('Uzman adı alınamadı:', error.message);
        setExpertName('İsimsiz Uzman');
      }
    };

    fetchExpertUserName();

    unsubProvider = onSnapshot(
      doc(db, 'service_providers', expertId),
      (providerSnap) => {
        if (providerSnap.exists()) {
          const pData = providerSnap.data();
          setProviderWorkingHours(pData.workingHours || null);
          setCompanyName(validateAndSanitizeInput(pData.businessName || '', 200));
        } else {
          setProviderWorkingHours(null);
          setCompanyName('');
        }
      },
      (error) => {
        if (isDevelopment) console.error('Uzman çalışma saatleri dinlenirken hata:', error.message);
      }
    );

    const isClientUser = userRole !== 'PROVIDER';
    const clientId = user?.uid;

    if (isClientUser && clientId) {
      const fetchClientAppointments = async () => {
        try {
          const myAppointmentsQuery = query(
            collection(db, 'appointments'),
            where('clientId', '==', clientId)
          );

          const expertApprovedQuery = query(
            collection(db, 'appointments'),
            where('expertId', '==', expertId),
            where('status', '==', 'approved')
          );

          const [mySnap, expertSnap] = await Promise.all([
            getDocs(myAppointmentsQuery),
            getDocs(expertApprovedQuery),
          ]);

          const groupedData = {};

          mySnap.forEach((docItem) => {
            const data = docItem.data();
            const dateKey = data.date;
            if (!groupedData[dateKey]) groupedData[dateKey] = [];
            groupedData[dateKey].push({ id: docItem.id, ...data });
          });

          expertSnap.forEach((docItem) => {
            const data = docItem.data();
            const dateKey = data.date;
            if (!groupedData[dateKey]) groupedData[dateKey] = [];

            if (data.clientId !== clientId) {
              groupedData[dateKey].push({
                id: docItem.id,
                start: data.start,
                end: data.end,
                status: data.status,
                client: 'DOLU',
                clientId: null,
                phone: null,
                email: null,
                fullAddress: null,
                note: null,
              });
            }
          });

          setAllData(groupedData);
          setAppointmentsPermissionError(false);
        } catch (error) {
          if (isDevelopment) console.error('Randevu verileri alınırken hata:', error);
          setAppointmentsPermissionError(true);
        }
      };

      fetchClientAppointments();
      intervalId = setInterval(fetchClientAppointments, 30000);
    } else if (!isClientUser) {
      const q = query(collection(db, 'appointments'), where('expertId', '==', expertId));
      unsubAppos = onSnapshot(
        q,
        (querySnapshot) => {
          setAppointmentsPermissionError(false);
          const groupedData = {};
          querySnapshot.forEach((docItem) => {
            const data = docItem.data();
            const dateKey = data.date;
            if (!groupedData[dateKey]) {
              groupedData[dateKey] = [];
            }
            groupedData[dateKey].push({ id: docItem.id, ...data });
          });
          setAllData(groupedData);
        },
        (error) => {
          if (isDevelopment) console.error('Randevu verileri dinlenirken hata:', error);
          if (error?.code === 'permission-denied') {
            setAppointmentsPermissionError(true);
          }
        }
      );
    }

    return () => {
      unsubProvider();
      unsubAppos();
      if (intervalId) clearInterval(intervalId);
    };
  }, [expertId, userRole, loadingUserInfo, user?.uid]);

  const getDateKey = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const dateKey = getDateKey(selectedDate);
  const dailyAppointments = allData[dateKey] || [];

  const currentDayEn = selectedDate.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
  const todaySchedule = providerWorkingHours ? providerWorkingHours[currentDayEn] : null;

  let isDayClosed = true;
  let startH = 9;
  let endH = 18;

  if (providerWorkingHours) {
    if (todaySchedule && todaySchedule.enabled) {
      isDayClosed = false;
      startH = parseInt(todaySchedule.start.split(':')[0], 10);
      endH = parseInt(todaySchedule.end.split(':')[0], 10);
    }
  } else {
    isDayClosed = false;
  }

  const generateDisplayBlocks = () => {
    const blocks = [];
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

    const approvedApps = dailyAppointments.filter(
      (app) => app.status === 'approved' || app.createdBy === 'expert'
    );
    const sortedApps = [...approvedApps].sort((a, b) => getMins(a.start) - getMins(b.start));

    const addFreeBlocks = (freeStart, freeEnd) => {
      let current = freeStart;
      while (current < freeEnd) {
        const nextHour = Math.floor(current / 60) * 60 + 60;
        const blockEnd = Math.min(nextHour, freeEnd);
        if (blockEnd - current >= 30) {
          blocks.push({ type: 'free', startStr: formatTime(current), endStr: formatTime(blockEnd) });
        }
        current = blockEnd;
      }
    };

    sortedApps.forEach((app) => {
      const appStartMin = getMins(app.start);
      const appEndMin = getMins(app.end);
      if (appStartMin > currentMin) {
        addFreeBlocks(currentMin, appStartMin);
      }
      blocks.push({
        type: 'appointment',
        startStr: formatTime(appStartMin),
        endStr: formatTime(appEndMin),
        data: app,
      });
      currentMin = Math.max(currentMin, appEndMin);
    });

    if (currentMin < endDayMin) {
      addFreeBlocks(currentMin, endDayMin);
    }
    return blocks;
  };

  const displayBlocks = generateDisplayBlocks();
  const selectedAddressObj = savedAddresses.find((addr) => addr.id === selectedAddressId);

  const handleOpenFormModal = () => {
    if (appointmentsPermissionError) {
      showAppToast('Takvim verileri şu anda yüklenemedi.', 'error');
      return;
    }
    if (isPenalized) {
      showAppToast('Hesabınızdaki kısıtlama devam ettiği için şu an yeni randevu oluşturamazsınız.', 'error');
      return;
    }
    
    if (listingId && isListingInfoLoading) {
      showAppToast('İlan bilgileri yükleniyor, lütfen birkaç saniye bekleyin...', 'info');
      return;
    }
    
    if (isProvider) {
      setIsTempAddressMode(true);
      setShowAddressModal(true);
    } else {
      setIsTempAddressMode(false);
      setShowFormModal(true);
      setFormError(null);
    }
  };

  const handleSendRequest = async (e) => {
    e.preventDefault();

    const selectedDateStr = getDateKey(selectedDate);

    const clientId = auth.currentUser?.uid;
    if (clientId && isProvider && clientId === expertId) {
      setFormError({
        type: 'error',
        message: 'Kendi ilanınıza randevu talebinde bulunamazsınız!'
      });
      return;
    }

    if (!clientId) {
      setFormError({ type: 'error', message: 'Lütfen önce giriş yapınız.' });
      return;
    }

    const sanitizedClient = validateAndSanitizeInput(newAppo.client, 100);
    const sanitizedEmail = validateAndSanitizeInput(newAppo.email, 100);
    const sanitizedPhone = validateAndSanitizeInput(newAppo.phone, 20);
    const sanitizedNote = validateAndSanitizeInput(newAppo.note, 1000);

    if (!sanitizedClient) {
      setFormError({ type: 'error', message: 'Ad soyad alanı boş olamaz.' });
      return;
    }

    if (!validateEmail(sanitizedEmail)) {
      setFormError({ type: 'error', message: 'Geçerli bir e-posta adresi giriniz.' });
      return;
    }

    if (!validatePhoneNumber(sanitizedPhone)) {
      setFormError({ type: 'error', message: 'Geçerli bir telefon numarası giriniz.' });
      return;
    }

    if (!newAppo.start) {
      setFormError({ type: 'error', message: 'Lütfen randevu saati seçiniz.' });
      return;
    }

    const appointmentStartTime = new Date(`${selectedDateStr}T${newAppo.start}:00`).getTime();
    if (Number.isNaN(appointmentStartTime) || appointmentStartTime - Date.now() < MIN_APPOINTMENT_LEAD_MS) {
      showAppToast(APPOINTMENT_MIN_LEAD_MSG, 'error');
      window.scrollTo({ top: 0, behavior: 'smooth' });

      const notifKey = `${clientId}-${selectedDateStr}-${newAppo.start}`;
      if (clientId && minLeadNotifSentRef.current !== notifKey) {
        minLeadNotifSentRef.current = notifKey;
        const notifMessage = `${selectedDateStr} - ${newAppo.start} tarihli randevu talebiniz oluşturulamadı. ${APPOINTMENT_MIN_LEAD_MSG}`;
        addDoc(collection(db, 'notifications'), {
          userId: clientId,
          type: 'appointment_min_lead_blocked',
          title: 'Randevu Talebi Oluşturulamadı ⏱️',
          message: notifMessage,
          createdAt: new Date().toISOString(),
          read: false,
          expertId: expertId || null,
        }).catch((err) => {
          if (isDevelopment) console.error('Bildirim oluşturulamadı:', err);
          minLeadNotifSentRef.current = '';
        });
      }
      return;
    }

    if (isDayClosed) {
      setFormError({ type: 'error', message: 'Üzgünüz, uzmanımız bu gün hizmet vermemektedir.' });
      return;
    }

    let selectedAddress = null;
    let fullAddressLabeled = '';
    let shortAddress = '';

    if (isProvider && tempAddressData) {
      selectedAddress = tempAddressData;
      const addressParts = [];
      if (selectedAddress.city) addressParts.push(`Şehir: ${validateAndSanitizeInput(selectedAddress.city, 50)}`);
      if (selectedAddress.district) addressParts.push(`İlçe: ${validateAndSanitizeInput(selectedAddress.district, 50)}`);
      if (selectedAddress.neighborhood) addressParts.push(`Mahalle: ${validateAndSanitizeInput(selectedAddress.neighborhood, 100)}`);
      if (selectedAddress.street) addressParts.push(`Sokak/Cadde: ${validateAndSanitizeInput(selectedAddress.street, 200)}`);
      if (selectedAddress.siteName) addressParts.push(`Site: ${validateAndSanitizeInput(selectedAddress.siteName, 100)}`);
      if (selectedAddress.apartmentName) addressParts.push(`Apartman: ${validateAndSanitizeInput(selectedAddress.apartmentName, 100)}`);
      if (selectedAddress.blockName) addressParts.push(`Blok: ${validateAndSanitizeInput(selectedAddress.blockName, 50)}`);
      if (selectedAddress.buildingNo) addressParts.push(`Bina No: ${validateAndSanitizeInput(selectedAddress.buildingNo, 20)}`);
      if (selectedAddress.floor) addressParts.push(`Kat: ${validateAndSanitizeInput(selectedAddress.floor, 10)}`);
      if (selectedAddress.doorNo) addressParts.push(`Daire: ${validateAndSanitizeInput(selectedAddress.doorNo, 10)}`);
      fullAddressLabeled = addressParts.join(', ');

      const shortParts = [];
      if (selectedAddress.street) shortParts.push(`Cadde/Sokak: ${validateAndSanitizeInput(selectedAddress.street, 200)}`);
      if (selectedAddress.siteName) shortParts.push(`Site: ${validateAndSanitizeInput(selectedAddress.siteName, 100)}`);
      if (selectedAddress.apartmentName) shortParts.push(`Apartman: ${validateAndSanitizeInput(selectedAddress.apartmentName, 100)}`);
      if (selectedAddress.blockName) shortParts.push(`Blok: ${validateAndSanitizeInput(selectedAddress.blockName, 50)}`);
      if (selectedAddress.buildingNo) shortParts.push(`Bina No: ${validateAndSanitizeInput(selectedAddress.buildingNo, 20)}`);
      if (selectedAddress.floor) shortParts.push(`Kat: ${validateAndSanitizeInput(selectedAddress.floor, 10)}`);
      if (selectedAddress.doorNo) shortParts.push(`Daire: ${validateAndSanitizeInput(selectedAddress.doorNo, 10)}`);
      shortAddress = shortParts.join(', ');
    } else {
      if (!selectedAddressId) {
        setFormError({ type: 'error', message: 'Lütfen bir adres seçiniz.' });
        return;
      }
      selectedAddress = savedAddresses.find((a) => a.id === selectedAddressId);
      if (!selectedAddress) {
        setFormError({ type: 'error', message: 'Seçilen adres bulunamadı.' });
        return;
      }

      const addressParts = [];
      if (selectedAddress.city) addressParts.push(`Şehir: ${validateAndSanitizeInput(selectedAddress.city, 50)}`);
      if (selectedAddress.district) addressParts.push(`İlçe: ${validateAndSanitizeInput(selectedAddress.district, 50)}`);
      if (selectedAddress.neighborhood) addressParts.push(`Mahalle: ${validateAndSanitizeInput(selectedAddress.neighborhood, 100)}`);
      if (selectedAddress.street) addressParts.push(`Sokak/Cadde: ${validateAndSanitizeInput(selectedAddress.street, 200)}`);
      if (selectedAddress.siteName) addressParts.push(`Site: ${validateAndSanitizeInput(selectedAddress.siteName, 100)}`);
      if (selectedAddress.apartmentName) addressParts.push(`Apartman: ${validateAndSanitizeInput(selectedAddress.apartmentName, 100)}`);
      if (selectedAddress.blockName) addressParts.push(`Blok: ${validateAndSanitizeInput(selectedAddress.blockName, 50)}`);
      if (selectedAddress.buildingNo) addressParts.push(`Bina No: ${validateAndSanitizeInput(selectedAddress.buildingNo, 20)}`);
      if (selectedAddress.floor) addressParts.push(`Kat: ${validateAndSanitizeInput(selectedAddress.floor, 10)}`);
      if (selectedAddress.doorNo) addressParts.push(`Daire: ${validateAndSanitizeInput(selectedAddress.doorNo, 10)}`);
      fullAddressLabeled = addressParts.join(', ');

      const shortParts = [];
      if (selectedAddress.street) shortParts.push(`Cadde/Sokak: ${validateAndSanitizeInput(selectedAddress.street, 200)}`);
      if (selectedAddress.siteName) shortParts.push(`Site: ${validateAndSanitizeInput(selectedAddress.siteName, 100)}`);
      if (selectedAddress.apartmentName) shortParts.push(`Apartman: ${validateAndSanitizeInput(selectedAddress.apartmentName, 100)}`);
      if (selectedAddress.blockName) shortParts.push(`Blok: ${validateAndSanitizeInput(selectedAddress.blockName, 50)}`);
      if (selectedAddress.buildingNo) shortParts.push(`Bina No: ${validateAndSanitizeInput(selectedAddress.buildingNo, 20)}`);
      if (selectedAddress.floor) shortParts.push(`Kat: ${validateAndSanitizeInput(selectedAddress.floor, 10)}`);
      if (selectedAddress.doorNo) shortParts.push(`Daire: ${validateAndSanitizeInput(selectedAddress.doorNo, 10)}`);
      shortAddress = shortParts.join(', ');
    }

    const toMinutes = (timeStr) => {
      if (!timeStr) return 0;
      const [h, m] = timeStr.split(':').map(Number);
      return h * 60 + m;
    };

    const requestedMin = toMinutes(newAppo.start);
    const MIN_DURATION = 15;
    const requestedEndMin = requestedMin + MIN_DURATION;
    const expertStartMin = startH * 60;
    const expertEndMin = endH * 60;

    if (requestedMin < expertStartMin || requestedEndMin > expertEndMin) {
      setFormError({
        type: 'error',
        message: `Lütfen mesai saatleri içinden bir vakit seçiniz. (${startH}:00 - ${endH}:00)`
      });
      return;
    }

    const onaylanmisRandevular = dailyAppointments.filter(
      (app) => app.status === 'approved' || app.createdBy === 'expert'
    );
    const isOverlapping = onaylanmisRandevular.some((app) => {
      const existingStart = typeof app.start === 'string' ? toMinutes(app.start) : app.start * 60;
      const existingEnd = typeof app.end === 'string' ? toMinutes(app.end) : app.end * 60;
      return requestedMin < existingEnd && requestedEndMin > existingStart;
    });

    if (isOverlapping) {
      setFormError({
        type: 'error',
        message: 'Seçtiğiniz saat, uzmanın onaylanmış bir randevusuyla çakışıyor. Lütfen farklı bir saat seçiniz.'
      });
      return;
    }

    const endHourCalc = Math.floor(requestedEndMin / 60);
    const endMinCalc = requestedEndMin % 60;
    const calculatedEndStr = `${String(endHourCalc).padStart(2, '0')}:${String(endMinCalc).padStart(2, '0')}`;

    const appointmentData = {
      clientId,
      expertId,
      listingId: listingId || null,
      listingTitle: listingTitle || null,
      addressId: isProvider ? null : selectedAddressId,
      expertName: validateAndSanitizeInput(expertName, 100),
      companyName: validateAndSanitizeInput(companyName, 200),
      client: sanitizedClient,
      email: sanitizedEmail,
      phone: sanitizedPhone,
      note: sanitizedNote,
      address: shortAddress,
      fullAddress: fullAddressLabeled,
      city: selectedAddress.city ? validateAndSanitizeInput(selectedAddress.city, 50) : null,
      district: selectedAddress.district ? validateAndSanitizeInput(selectedAddress.district, 50) : null,
      neighborhood: selectedAddress.neighborhood ? validateAndSanitizeInput(selectedAddress.neighborhood, 100) : null,
      lat: selectedAddress.lat && typeof selectedAddress.lat === 'number' && Math.abs(selectedAddress.lat) <= 90 ? selectedAddress.lat : null,
      lng: selectedAddress.lng && typeof selectedAddress.lng === 'number' && Math.abs(selectedAddress.lng) <= 180 ? selectedAddress.lng : null,
      coordSource: selectedAddress.coordSource ? validateAndSanitizeInput(selectedAddress.coordSource, 20) : 'API_Center',
      date: dateKey,
      start: newAppo.start,
      end: calculatedEndStr,
      startHour: Math.floor(requestedMin / 60),
      endHour: Math.floor(requestedEndMin / 60),
      status: 'pending',
      createdBy: isProvider ? 'expert_request' : 'customer',
      createdTime: Date.now(),
      approvedTime: null,
      isTemporaryAddress: isProvider && !!tempAddressData,
    };

    try {
      await addDoc(collection(db, 'appointments'), appointmentData);
      setShowFormModal(false);
      setShowSuccessModal(true);
      setFormError(null);
      setTempAddressData(null);
      setIsTempAddressMode(false);
    } catch (error) {
      if (isDevelopment) console.error('Gönderim hatası:', error.message);
      setFormError({
        type: 'error',
        message: 'Talep gönderilirken bir hata oluştu. Lütfen daha sonra tekrar deneyin.'
      });
    }
  };

  if (loadingUserInfo) {
    return (
      <div className="profile-page">
        <Navbar />
        <main className="profile-main appointment-main">
          <div className="appo-cust-loading">
            Kullanıcı bilgileri yükleniyor...
          </div>
        </main>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="profile-page">
        <Navbar />
        <main className="profile-main appointment-main">
          <div className="appo-cust-loading">
            Randevu oluşturmak için giriş yapmanız gerekiyor.
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="profile-page">
      <Navbar />
      <main className="profile-main appointment-main">
        <div className="appointment-header">
          <div className="appo-title-wrap">
            <h2 className="appo-title">
              <i className="fas fa-calendar-alt"></i>
              {selectedDate.toLocaleDateString('tr-TR', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
                weekday: 'long',
              })}
            </h2>
          </div>

          <div className="appo-right-wrap">
            <button
              className="settings-primary-button appo-new-btn"
              onClick={handleOpenFormModal}
              style={{
                filter: isPenalized ? 'grayscale(1)' : 'none',
                opacity: isPenalized ? 0.7 : 1,
                cursor: isPenalized ? 'not-allowed' : 'pointer',
              }}
            >
              <i className={`fas ${isPenalized ? 'fa-lock' : 'fa-plus'}`}></i>
              {isPenalized
                ? ' Randevu Oluşturma Yetkiniz Kısıtlandı'
                : isProvider
                ? ' Randevu Talebi Oluştur'
                : ' İstediğiniz Vakti Seçin ve Randevu Oluşturun'}
            </button>
          </div>
        </div>

        {appointmentsPermissionError && (
          <div className="appo-cust-banner--error">
            Randevu takvimi verileri yüklenemedi.
          </div>
        )}

        {isProvider && (
          <div className="appo-cust-banner--info">
            <i className="fas fa-info-circle" aria-hidden="true" />
            <span>
              Uzman olarak randevu talebi oluşturuyorsunuz. Adresiniz sistemde kaydedilmeyecek, sadece bu randevu için kullanılacaktır.
            </span>
          </div>
        )}

        <section className="profile-card-section appo-grid-section">
          <div className="hours-grid">
            {isDayClosed ? (
              <div className="hour-card non-working appo-closed-full">
                <span className="hour-card-status appo-closed-text">Uzman Bu Gün Hizmet Vermemektedir</span>
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
                    <div key={`block-${index}-${block.startStr}`} className={`hour-card appo-hour-tall ${isApp ? 'has-appo' : ''}`} style={{ cursor: 'default' }}>
                      <div className="appo-block-times">
                        <div className="appo-block-time-row appo-block-time-row--between">
                          <strong>Başlangıç:</strong>
                          <span className="appo-block-start">{block.startStr}</span>
                        </div>
                        <div className="appo-block-time-row appo-block-time-row--between">
                          <strong>Bitiş:</strong>
                          <span className="appo-block-end">{block.endStr}</span>
                        </div>
                      </div>
                      <div className={`appo-block-label ${isApp ? 'appo-block-label--appo' : 'appo-block-label--free'}`}>
                        {isApp ? 'DOLU' : 'Müsait'}
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
          <SharedCalendar selectedDate={selectedDate} onDateSelect={setSelectedDate} mode="CUSTOMER" />
        </section>
      </main>

      {showFormModal && (
        <div className="detail-overlay" onClick={() => { setShowFormModal(false); setFormError(null); setTempAddressData(null); setIsTempAddressMode(false); }}>
          <form className="appointment-modal-form" onClick={(e) => e.stopPropagation()} onSubmit={handleSendRequest}>
            <div className="appo-form-header">
              <h3 className="appo-form-title">Yeni Randevu Talebi</h3>
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
                      <div
                        key={idx}
                        className={`appo-vis-block ${isApp ? 'appo-vis-block--busy' : 'appo-vis-block--free'}`}
                      >
                        <div>
                          {block.startStr} - {block.endStr}
                        </div>
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

            {isProvider && tempAddressData && (
              <div className="appo-cust-temp-address">
                <div className="appo-cust-temp-address__head">
                  <i className="fas fa-check-circle" aria-hidden="true" />
                  <span className="appo-cust-temp-address__title">ADRES SEÇİLDİ:</span>
                </div>
                <p className="appo-cust-temp-address__text">
                  {tempAddressData.street}, {tempAddressData.district}/{tempAddressData.city}
                </p>
                <button
                  type="button"
                  className="appo-cust-temp-address__btn"
                  onClick={() => {
                    setTempAddressData(null);
                    setShowAddressModal(true);
                  }}
                >
                  <i className="fas fa-edit" aria-hidden="true" /> Adresi Değiştir
                </button>
              </div>
            )}

            <div className="appo-form-grid">
              <div className="appo-field appo-field--span2">
                <label className="appointment-input-label">AD VE SOYAD (Zorunlu)</label>
                <input type="text" name="client" autoComplete="off" className="appointment-input-field" value={newAppo.client} onChange={(e) => setNewAppo({ ...newAppo, client: e.target.value.slice(0, 100) })} placeholder="Ad Soyad" required />
              </div>

              <div className="appo-field appo-field--span2">
                <label className="appointment-input-label">UZMANIN GELMESİNİ İSTEDİĞİNİZ VAKİT (Zorunlu)</label>
                <input type="time" name="start" className="appointment-input-field" value={newAppo.start} onChange={(e) => setNewAppo({ ...newAppo, start: e.target.value })} required />
              </div>

              <div className="appo-field appo-field--span2">
                <label className="appointment-input-label">E-POSTA (Zorunlu)</label>
                <input type="email" name="email" autoComplete="off" className="appointment-input-field" value={newAppo.email} onChange={(e) => setNewAppo({ ...newAppo, email: e.target.value.slice(0, 100) })} placeholder="ornek@mail.com" required />
              </div>

              <div className="appo-field appo-field--span2">
                <label className="appointment-input-label">TELEFON (Zorunlu)</label>
                <input type="tel" name="phone" autoComplete="off" className="appointment-input-field" value={newAppo.phone} onChange={(e) => setNewAppo({ ...newAppo, phone: e.target.value.slice(0, 20) })} placeholder="05XX XXX XX XX" required />
              </div>

              {!isProvider && (
                <div className="appo-field appo-field--span4">
                  <label className="appointment-input-label">KAYITLI ADRESLERİNİZ (Zorunlu)</label>
                  <div className="appo-cust-address-list">
                    {savedAddresses.map((addr) => (
                      <div
                        key={addr.id}
                        role="button"
                        tabIndex={0}
                        className={`appo-cust-address-item ${selectedAddressId === addr.id ? "appo-cust-address-item--selected" : ""}`}
                        onClick={() => setSelectedAddressId(addr.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setSelectedAddressId(addr.id);
                          }
                        }}
                      >
                        <div className="appo-cust-address-item__main">
                          <div className="appo-cust-address-item__radio" aria-hidden="true" />
                          <div>
                            <strong className="appo-cust-address-item__name">
                              {validateAndSanitizeInput(addr.addressName, 100)}
                            </strong>
                            <div className="appo-cust-address-item__detail">
                              {validateAndSanitizeInput(addr.district, 50)}/
                              {validateAndSanitizeInput(addr.city, 50)} (
                              {validateAndSanitizeInput(addr.street, 200)})
                            </div>
                          </div>
                        </div>
                        <div className="appo-cust-address-item__actions">
                          <button
                            type="button"
                            className="appo-cust-address-item__edit"
                            onClick={(e) => {
                              e.stopPropagation();
                              openEditAddress(addr.id);
                            }}
                            aria-label="Adresi düzenle"
                          >
                            <i className="fas fa-edit" aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            className="appo-cust-address-item__delete"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteAddress(addr.id);
                            }}
                            aria-label="Adresi sil"
                          >
                            <i className="fas fa-trash-alt" aria-hidden="true" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="appo-cust-address-hint">
                    <p>
                      {savedAddresses.length >= 2
                        ? "En fazla 2 adet adres kaydedebilirsiniz."
                        : "Adreslerinizi buradan yönetebilir veya yeni ekleyebilirsiniz."}
                    </p>
                    {savedAddresses.length < 2 && (
                      <button type="button" className="appo-cust-address-hint__btn" onClick={openAddAddress}>
                        <i className="fas fa-plus" aria-hidden="true" /> Yeni Adres Ekle
                      </button>
                    )}
                  </div>
                </div>
              )}

              <div className="appo-field appo-field--span4">
                <label className="appointment-input-label">Sıkıntınızı Uzmana Yazın (Zorunlu)</label>
                <textarea name="note" className="appointment-input-field appointment-textarea appo-textarea-tall" value={newAppo.note} onChange={(e) => setNewAppo({ ...newAppo, note: e.target.value.slice(0, 1000) })} placeholder="Örn: Bosch marka çamaşır makinem su akıtıyor..." required />
              </div>
            </div>

            <div className="appo-form-actions">
              <button type="button" className="btn-form-cancel" onClick={() => { setShowFormModal(false); setFormError(null); setTempAddressData(null); setIsTempAddressMode(false); }}>İptal</button>
              <button type="submit" className="btn-form-submit">Randevuyu Uzmana Gönder</button>
            </div>
          </form>
        </div>
      )}

      {formError && (
        <div className={`appo-outside-notification ${formError.type}`} style={{ zIndex: 9999 }}>
          <div className="appo-outside-content">
            <div className="appo-outside-header">
              <i className={formError.type === 'error' ? 'fas fa-ban' : 'fas fa-id-card'}></i>
              <span>BİLGİ / HATA PANELİ</span>
            </div>
            <p className="appo-outside-text">{formError.message}</p>
          </div>
          <button type="button" className="appo-outside-close" onClick={() => setFormError(null)}>×</button>
        </div>
      )}

      {showSuccessModal && (
        <div className="detail-overlay">
          <div className="appointment-modal-form appo-success-modal">
            <div className="appo-success-icon"><i className="fas fa-check-circle"></i></div>
            <h2 className="appo-success-title">Talebiniz Gönderildi!</h2>
            <p className="appo-success-text">
              Randevu talebiniz başarıyla alınmıştır.
              <br />
              Uzman onayladıktan sonra <strong>Randevularım</strong> sayfanızda detayları görebilirsiniz.
            </p>
            <button className="settings-primary-button appo-success-btn" onClick={() => navigate('/customer-appointments')}>Randevularıma Git</button>
          </div>
        </div>
      )}

      {showAddressModal && (
        <AddressModal
          isOpen={showAddressModal}
          onClose={() => { setShowAddressModal(false); setEditingAddressId(null); }}
          onSave={(addressData) => {
            if (editingAddressId) {
              const currentUser = auth.currentUser;
              if (currentUser) {
                updateDoc(doc(db, 'users', currentUser.uid, 'addresses', editingAddressId), { ...addressData, updatedAt: Date.now() }).then(() => {
                  setShowAddressModal(false);
                  setEditingAddressId(null);
                  setRefreshTrigger(prev => prev + 1);
                }).catch(err => console.error('Güncelleme hatası:', err));
              }
            } else if (isProvider && isTempAddressMode) {
              handleTempAddressSave(addressData);
            } else {
              const currentUser = auth.currentUser;
              if (currentUser) {
                addDoc(collection(db, 'users', currentUser.uid, 'addresses'), { ...addressData, createdAt: Date.now() }).then(() => {
                  setShowAddressModal(false);
                  setRefreshTrigger(prev => prev + 1);
                }).catch(err => console.error('Kayıt hatası:', err));
              }
            }
          }}
          initialData={editingAddressId ? savedAddresses.find(a => a.id === editingAddressId) : null}
          isEditing={!!editingAddressId}
          mode={isProvider && isTempAddressMode ? "TEMPORARY" : "PERMANENT"}
        />
      )}

      <ConfirmModal
        isOpen={showDeleteConfirmModal}
        onClose={() => {
          setShowDeleteConfirmModal(false);
          setAddressToDelete(null);
        }}
        onConfirm={confirmDeleteAddress}
        title="Adres Sil"
        message="Bu adresi silmek istediğinize emin misiniz? Bu işlem geri alınamaz."
        confirmText="Evet, Sil"
        cancelText="Vazgeç"
        type="danger"
      />
    </div>
  );
};

export default CustomerAppointmentPage;