// authService.js file code 

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  EmailAuthProvider,
  linkWithCredential,
  linkWithPopup,
  sendPasswordResetEmail,
  fetchSignInMethodsForEmail,
  linkWithPhoneNumber,
  PhoneAuthProvider,
  updatePhoneNumber,
  unlink,
} from "firebase/auth";


import { auth, db, storage } from "./firebaseClient";
import {
  doc,
  setDoc,
  getDoc,
  updateDoc,
  collection,
  query,
  where,
  getDocs,
  deleteDoc,
  deleteField,
  addDoc,
} from "firebase/firestore";
import {
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject,
  listAll,
} from "firebase/storage";

import { checkPasswordResetEligibility } from "../services/passwordResetGuardService";
import { checkSocialLoginEligibility } from "../services/socialLoginGuardService";

import { checkLoginEligibility } from "../services/loginGuardService";

const isDevelopment = process.env.NODE_ENV === "development";

// DÜZELTİLDİ - Input validation eklendi
function validateEmail(email) {
  const cleanEmail = normalizeEmail(email);
  if (!cleanEmail) return false;
  if (cleanEmail.length > 254) return false;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) return false;
  return true;
}

function validatePassword(password) {
  if (!password) return false;
  if (password.length < 6) return false;
  if (password.length > 128) return false;
  return true;
}

function validateName(name) {
  if (!name) return true;
  if (name.length < 2) return false;
  if (name.length > 100) return false;
  return true;
}

async function assertSocialLoginAllowed(email, provider = "google") {
  const cleanEmail = normalizeEmail(email);

  if (!cleanEmail || !validateEmail(email)) {
    throw new Error("Geçerli bir e-posta adresi gerekli.");
  }

  return await checkSocialLoginEligibility({
    email: cleanEmail,
    provider,
  });
}

function isGmailAddress(email) {
  const cleanEmail = normalizeEmail(email);
  return cleanEmail.endsWith("@gmail.com");
}

function normalizeComparableGoogleEmail(email) {
  const clean = normalizeEmail(email);
  if (!clean || !clean.includes("@")) return clean;

  const [localPart, rawDomain] = clean.split("@");
  const domain = rawDomain === "googlemail.com" ? "gmail.com" : rawDomain;

  if (domain !== "gmail.com") {
    return `${localPart}@${domain}`;
  }

  const localWithoutPlus = localPart.split("+")[0].replace(/\./g, "");
  return `${localWithoutPlus}@gmail.com`;
}

function isSameGoogleIdentity(emailA, emailB) {
  return (
    normalizeComparableGoogleEmail(emailA) ===
    normalizeComparableGoogleEmail(emailB)
  );
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeEmail(email) {
  if (!email) return "";
  const trimmed = String(email).trim().toLowerCase();
  if (trimmed.length > 254) return "";
  return trimmed;
}

function normalizePhoneNumber(phone) {
  if (!phone) return "";
  let normalized = String(phone).trim();
  normalized = normalized.replace(/[^\d+]/g, "");

  if ((normalized.match(/\+/g) || []).length > 1) {
    normalized = normalized.replace(/\+/g, "");
    normalized = `+${normalized}`;
  }
  
  if (normalized.length > 15) return "";
  return normalized;
}

function buildProviderFields(provider) {
  if (provider === "google") {
    return {
      authProvider: "google",
      authProviders: ["google"],
    };
  }

  if (provider === "phone") {
    return {
      authProvider: "phone",
      authProviders: ["phone"],
    };
  }

  return {
    authProvider: "password",
    authProviders: ["password"],
  };
}

function normalizeProviderList(value) {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value
        .map((item) => String(item || "").trim().toLowerCase())
        .filter(Boolean)
    ),
  ];
}

function mapFirebaseProviderId(providerId) {
  const value = String(providerId || "").trim().toLowerCase();

  if (value === "google.com") return "google";
  if (value === "password") return "password";
  if (value === "phone") return "phone";

  return value || null;
}

function extractLinkedProvidersFromUser(user) {
  const providerIds = Array.isArray(user?.providerData)
    ? user.providerData
        .map((item) => mapFirebaseProviderId(item?.providerId))
        .filter(Boolean)
    : [];

  return [...new Set(providerIds)];
}

function inferPrimaryProvider(linkedProviders = []) {
  if (linkedProviders.includes("password")) return "password";
  if (linkedProviders.includes("google")) return "google";
  if (linkedProviders.includes("phone")) return "phone";
  return null;
}

async function findUserDocByEmail(email) {
  const cleanEmail = normalizeEmail(email);
  if (!cleanEmail || !validateEmail(email)) return null;

  const snap = await getDocs(
    query(collection(db, "users"), where("email", "==", cleanEmail))
  );

  if (snap.empty) return null;
  return snap.docs[0];
}

async function findUserDocByPhone(phone) {
  const cleanPhone = normalizePhoneNumber(phone);
  if (!cleanPhone) return null;

  const snap = await getDocs(
    query(collection(db, "users"), where("phoneNumber", "==", cleanPhone))
  );

  if (snap.empty) return null;
  return snap.docs[0];
}

function inferProviderFromMethods(methods = []) {
  const cleanMethods = Array.isArray(methods)
    ? methods.map((m) => String(m || "").trim().toLowerCase())
    : [];

  const hasPassword = cleanMethods.includes("password");
  const hasGoogle = cleanMethods.includes("google.com");
  const hasPhone = cleanMethods.includes("phone");

  if (hasPassword && !hasGoogle && !hasPhone) return "password";
  if (hasGoogle && !hasPassword && !hasPhone) return "google";
  if (hasPhone && !hasPassword && !hasGoogle) return "phone";

  if (hasPassword) return "password";
  if (hasGoogle) return "google";
  if (hasPhone) return "phone";

  return null;
}

async function getPreferredProvider(email, fallbackUserData = {}) {
  const cleanEmail = normalizeEmail(email);

  try {
    const methods = await fetchSignInMethodsForEmail(auth, cleanEmail);
    const providerFromAuth = inferProviderFromMethods(methods);
    if (providerFromAuth) return providerFromAuth;
  } catch (error) {
    if (isDevelopment) {
      console.warn("fetchSignInMethodsForEmail failed:", error.message);
    }
  }

  const firestoreProviders = normalizeProviderList(fallbackUserData?.authProviders);

  if (firestoreProviders.includes("password")) return "password";
  if (firestoreProviders.includes("google")) return "google";
  if (firestoreProviders.includes("phone")) return "phone";

  const firestoreProvider = String(fallbackUserData?.authProvider || "").trim().toLowerCase();

  if (firestoreProvider === "password" || firestoreProvider === "google" || firestoreProvider === "phone") {
    return firestoreProvider;
  }

  return null;
}

async function syncIdentityDocFromAuthUser(user, extraFields = {}) {
  if (!user?.uid) {
    throw new Error("Geçersiz kullanıcı.");
  }

  const cleanEmail = normalizeEmail(user.email);
  const userRef = doc(db, "users", user.uid);
  const userSnap = await getDoc(userRef);
  const existing = userSnap.exists() ? userSnap.data() || {} : {};

  const authLinkedProviders = extractLinkedProvidersFromUser(user);
  const existingProviders = normalizeProviderList(existing.authProviders);
  const forcedProviders = normalizeProviderList(extraFields.forceProviders);

  const mergedProviders = Array.from(
    new Set([...existingProviders, ...authLinkedProviders, ...forcedProviders])
  );

  const primaryProvider = extraFields.forcePrimaryProvider || inferPrimaryProvider(mergedProviders);

  const {
    forceProviders,
    forcePrimaryProvider,
    userType: extraUserType,
    ...restExtraFields
  } = extraFields;

  await setDoc(
    userRef,
    {
      uid: user.uid,
      email: cleanEmail || existing.email || null,
      displayName: restExtraFields.displayName ||
        existing.displayName ||
        user.displayName ||
        (cleanEmail ? cleanEmail.split("@")[0] : "Kullanıcı"),
      phoneNumber: restExtraFields.phoneNumber ??
        existing.phoneNumber ??
        user.phoneNumber ??
        null,
      isPhoneVerified: typeof restExtraFields.isPhoneVerified === "boolean"
        ? restExtraFields.isPhoneVerified
        : !!(user.phoneNumber || existing.isPhoneVerified),
      userType: extraUserType || existing.userType || "CLIENT",
      authProvider: primaryProvider || null,
      authProviders: mergedProviders,
      createdAt: existing.createdAt || nowIso(),
      updatedAt: nowIso(),
      lastLoginAt: nowIso(),
      ...restExtraFields,
    },
    { merge: true }
  );

  return {
    linkedProviders: mergedProviders,
    primaryProvider,
  };
}

export async function getEmailIdentityStatus(email) {
  const cleanEmail = normalizeEmail(email);

  if (!cleanEmail || !validateEmail(email)) {
    return {
      email: "",
      existsInUsers: false,
      methods: [],
      providerFromAuth: null,
      preferredProvider: null,
      uid: null,
      userData: null,
    };
  }

  const [userDoc, methods] = await Promise.all([
    findUserDocByEmail(cleanEmail),
    fetchSignInMethodsForEmail(auth, cleanEmail).catch(() => []),
  ]);

  const userData = userDoc?.data?.() || null;
  const providerFromAuth = inferProviderFromMethods(methods);
  const preferredProvider = providerFromAuth || (await getPreferredProvider(cleanEmail, userData || {}));

  return {
    email: cleanEmail,
    existsInUsers: !!userDoc,
    methods,
    providerFromAuth,
    preferredProvider,
    uid: userDoc?.id || null,
    userData,
  };
}

export async function getPhoneIdentityStatus(phone) {
  const cleanPhone = normalizePhoneNumber(phone);

  if (!cleanPhone) {
    return {
      phone: "",
      existsInUsers: false,
      uid: null,
      userData: null,
      canLoginWithPhone: false,
      providers: [],
    };
  }

  const userDoc = await findUserDocByPhone(cleanPhone);
  const userData = userDoc?.data?.() || null;
  const providers = normalizeProviderList(userData?.authProviders);

  return {
    phone: cleanPhone,
    existsInUsers: !!userDoc,
    uid: userDoc?.id || null,
    userData,
    providers,
    canLoginWithPhone: providers.includes("phone"),
  };
}

// DÜZELTİLDİ - registerWithEmail validation eklendi
export async function registerWithEmail({ name, email, password, phone }) {
  const cleanEmail = normalizeEmail(email);
  if (!validateEmail(email)) {
    throw new Error("Geçerli bir e-posta adresi giriniz.");
  }
  if (!validatePassword(password)) {
    throw new Error("Şifre en az 6 karakter olmalıdır.");
  }
  if (name && !validateName(name)) {
    throw new Error("İsim 2-100 karakter arasında olmalıdır.");
  }

  try {
    const cred = await createUserWithEmailAndPassword(auth, cleanEmail, password);
    const user = cred.user;

    if (name) {
      await updateProfile(user, { displayName: name.slice(0, 100) });
    }

    await setDoc(doc(db, "users", user.uid), {
      uid: user.uid,
      displayName: name ? name.slice(0, 100) : cleanEmail.split("@")[0],
      email: cleanEmail,
      phoneNumber: phone ? normalizePhoneNumber(phone) : null,
      isPhoneVerified: false,
      location: null,
      addresses: [],
      userType: "CLIENT",
      ...buildProviderFields("password"),
      createdAt: nowIso(),
      updatedAt: nowIso(),
      lastLoginAt: nowIso(),
    });

    await syncIdentityDocFromAuthUser(user, {
      displayName: name ? name.slice(0, 100) : cleanEmail.split("@")[0],
      phoneNumber: phone ? normalizePhoneNumber(phone) : null,
      isPhoneVerified: false,
      userType: "CLIENT",
    });

    return user;
  } catch (error) {
    if (error.code === "auth/email-already-in-use") {
      throw new Error("Bu e-posta adresi zaten kullanılıyor.");
    }
    if (error.code === "auth/weak-password") {
      throw new Error("Şifre çok zayıf. En az 6 karakter olmalı.");
    }
    if (error.code === "auth/invalid-email") {
      throw new Error("Geçersiz e-posta adresi.");
    }
    throw error;
  }
}

export async function registerExpertDraft({ userData }) {
  return {
    fullName: userData.fullName?.trim() || "",
    email: userData.email?.trim() || "",
    password: userData.password || "",
    phone: normalizePhoneNumber(userData.phone || ""),
  };
}

export async function registerWithEmailDirect({ name, email, password, phone, userType = "CLIENT" }) {
  const cleanEmail = normalizeEmail(email);
  if (!validateEmail(email)) {
    throw new Error("Geçerli bir e-posta adresi giriniz.");
  }
  if (!validatePassword(password)) {
    throw new Error("Şifre en az 6 karakter olmalıdır.");
  }
  if (name && !validateName(name)) {
    throw new Error("İsim 2-100 karakter arasında olmalıdır.");
  }

  await assertRegistrationIdentityAvailable({
    email: cleanEmail,
    phone: phone ? normalizePhoneNumber(phone) : "",
  });

  const cred = await createUserWithEmailAndPassword(auth, cleanEmail, password);
  const user = cred.user;

  if (name) {
    await updateProfile(user, { displayName: name.slice(0, 100) });
  }

  const finalPhone = phone ? normalizePhoneNumber(phone) : null;

  await setDoc(doc(db, "users", user.uid), {
    uid: user.uid,
    displayName: name ? name.slice(0, 100) : cleanEmail.split("@")[0],
    email: cleanEmail,
    phoneNumber: finalPhone,
    isPhoneVerified: true,
    location: null,
    addresses: [],
    userType: userType,
    ...buildProviderFields("password"),
    createdAt: nowIso(),
    updatedAt: nowIso(),
    lastLoginAt: nowIso(),
  });

  await syncIdentityDocFromAuthUser(user, {
    displayName: name ? name.slice(0, 100) : cleanEmail.split("@")[0],
    email: cleanEmail,
    phoneNumber: finalPhone,
    isPhoneVerified: true,
    location: null,
    addresses: [],
    userType: userType,
    ...(userType !== "CLIENT" && { profileCompleted: false }),
  });

  return user;
}


export async function finalizeExpertRegistration({
  confirmationResult,
  code,
  userData,
  userType = "CLIENT",
}) {
  try {
    if (!userData?.email || !userData?.password || !userData?.phone) {
      throw new Error("Kayıt verileri eksik.");
    }

    // 7 mayis modified by Edrees
    await assertRegistrationIdentityAvailable({
      email: userData.email,
      phone: userData.phone,
    });

    const phoneUser = await confirmPhoneOtp(confirmationResult, code);

    const linkedUser = await linkEmailPasswordToPhoneUser({
      fullName: userData.fullName,
      email: userData.email,
      password: userData.password,
    });

    const finalUser = linkedUser || phoneUser;

    await syncIdentityDocFromAuthUser(finalUser, {
      displayName: userData.fullName ? userData.fullName.slice(0, 100) : userData.email.split("@")[0],
      email: normalizeEmail(userData.email),
      phoneNumber: normalizePhoneNumber(userData.phone),
      isPhoneVerified: true,
      location: null,
      addresses: [],
      userType,
      ...(userType !== "CLIENT" && { profileCompleted: false }),
    });

    return {
      success: true,
      uid: finalUser.uid,
      user: finalUser,
      message: "Kayıt başarıyla oluşturuldu.",
    };
  } catch (error) {
    if (error.code === "auth/email-already-in-use") {
      throw new Error("Bu e-posta adresi zaten kullanılıyor.");
    }
    if (error.code === "auth/credential-already-in-use") {
      throw new Error("Bu e-posta başka bir hesapta kullanılıyor.");
    }
    if (error.code === "auth/provider-already-linked") {
      throw new Error("Bu kullanıcıya e-posta/şifre zaten bağlanmış.");
    }
    if (error.code === "auth/invalid-verification-code") {
      throw new Error("Doğrulama kodu hatalı.");
    }
    if (error.code === "auth/code-expired") {
      throw new Error("Doğrulama kodunun süresi dolmuş.");
    }

    if (isDevelopment) {
      console.error("Kayıt tamamlama hatası:", error);
    }
    throw error;
  }
}

export async function completePhoneLogin(confirmationResult, code) {
  if (!confirmationResult) {
    throw new Error("Confirmation result bulunamadı.");
  }

  const cred = await confirmationResult.confirm(String(code).trim());
  const user = cred.user;
  const phone = normalizePhoneNumber(user.phoneNumber || "");

  const userRef = doc(db, "users", user.uid);
  const userSnap = await getDoc(userRef);

  if (userSnap.exists()) {
    await syncIdentityDocFromAuthUser(user, {
      phoneNumber: phone || userSnap.data()?.phoneNumber || null,
      isPhoneVerified: !!phone,
    });

    const redirectPath = await getRedirectPath(user.uid);
    return {
      success: true,
      user,
      redirectPath,
      status: "SIGNED_IN",
    };
  }

  const existingPhoneDoc = phone ? await findUserDocByPhone(phone) : null;

  if (existingPhoneDoc && existingPhoneDoc.id !== user.uid) {
    await signOut(auth).catch(() => {});

    const err = new Error(
      "Bu telefon numarası mevcut bir hesaba ait, ancak telefonla giriş henüz bu hesapta etkin değil. Lütfen önce e-posta veya Google ile giriş yapın, ardından telefon numaranızı hesabınıza bağlayın."
    );
    err.code = "PHONE_ACCOUNT_SPLIT_DETECTED";
    err.phone = phone;
    err.existingUid = existingPhoneDoc.id;
    throw err;
  }

  await syncIdentityDocFromAuthUser(user, {
    phoneNumber: phone || null,
    isPhoneVerified: !!phone,
  });

  const redirectPath = await getRedirectPath(user.uid);

  return {
    success: true,
    user,
    redirectPath,
    status: "SIGNED_IN",
  };
}

// ========== DÜZELTİLMİŞ completeExpertProfile FONKSİYONU ==========
export async function completeExpertProfile({ uid, profileData }) {
  try {
    const userRef = doc(db, "users", uid);
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) throw new Error("Kullanıcı bulunamadı!");

    const providerTypeTr = profileData.providerType === "company" ? "Şirket" : "Şahıs";

    if (profileData.providerType === "company") {
      const taxDigits = String(profileData.taxNumber || "").replace(/\D/g, "");
      if (taxDigits.length !== 10) {
        throw new Error("Vergi numarası 10 haneli olmalıdır.");
      }
    }

    let allFileURLs = [];
    if (profileData.certificateFiles?.length > 0) {
      const uploadPromises = profileData.certificateFiles.map(async (file, index) => {
        const ext = file.name.split(".").pop();
        
        // DOSYA ADINA GÖRE KATEGORİ BELİRLE (güvenilir yöntem)
        const fileNameLower = file.name.toLowerCase();
        let category = "certificate";
        
        if (fileNameLower.includes("identity") || fileNameLower.includes("kimlik")) {
          category = "identity";
        } else if (fileNameLower.includes("tax") || fileNameLower.includes("vergi") || fileNameLower.includes("taxplate")) {
          category = "taxplate";
        }

        const storageRef = ref(
          storage,
          `expert_documents/${uid}/${category}_${index + 1}_${Date.now()}.${ext}`
        );

        await uploadBytes(storageRef, file);
        return await getDownloadURL(storageRef);
      });

      allFileURLs = await Promise.all(uploadPromises);
    }

    const addressesRef = collection(db, "users", uid, "addresses");
    const newAddressRef = await addDoc(addressesRef, {
      addressName: profileData.addressName || "İş Adresi",
      city: profileData.city,
      district: profileData.district || "",
      neighborhood: profileData.neighborhood || "",
      street: profileData.street || "",
      siteName: profileData.siteName || "",
      apartmentName: profileData.apartmentName || "",
      blockName: profileData.blockName || "",
      buildingNo: profileData.buildingNo || "",
      floor: profileData.floor || "",
      doorNo: profileData.doorNo || "",
      lat: profileData.lat || null,
      lng: profileData.lng || null,
      coordSource: profileData.coordSource || "API_Center",
      isMain: true,
      createdAt: nowIso(),
    });

    const addressId = newAddressRef.id;

    await updateDoc(userRef, {
      profileCompleted: true,
      userType: "PROVIDER",
      isActive: true,
      approvalStatus: "APPROVED",
      approvalMethod: "AUTO",
      approvedAt: nowIso(),
      mainAddressId: addressId,
      updatedAt: nowIso(),
      lastLoginAt: nowIso(),
    });

    const normalizedSpecialties = Array.isArray(profileData.specialties)
      ? profileData.specialties
          .map((s) => {
            if (typeof s === "string") {
              const name = String(s || "").trim();
              return name ? { name: name.slice(0, 100), startingPrice: 0 } : null;
            }
            const name = String(s?.name || "").trim();
            const startingPrice = Number(s?.startingPrice) || 0;
            return name ? { name: name.slice(0, 100), startingPrice } : null;
          })
          .filter(Boolean)
      : [];

    const specialtyNames = normalizedSpecialties.map((s) => s.name);

    await setDoc(doc(db, "service_providers", uid), {
      providerId: uid,
      businessName: profileData.businessName.slice(0, 200),
      displayName: profileData.displayName ? profileData.displayName.slice(0, 100) : profileData.businessName.slice(0, 100),
      providerType: providerTypeTr,
      ...(providerTypeTr === "Şirket" && profileData.taxNumber
        ? { taxNumber: String(profileData.taxNumber).replace(/\D/g, "") }
        : {}),
      category: profileData.category.slice(0, 100),
      mainAddressId: addressId,
      city: profileData.city.slice(0, 100),
      district: profileData.district?.slice(0, 100) || "",
      lat: profileData.lat || null,
      lng: profileData.lng || null,
      educationInfo: profileData.educationInfo?.slice(0, 500) || "",
      experienceYears: profileData.experienceYears || 0,
      certificates: allFileURLs,
      isCertified: allFileURLs.length > 0,
      minPrice: profileData.minPrice || 0,
      maxPrice: profileData.maxPrice || 0,
      pricingType: profileData.pricingType,
      specialties: normalizedSpecialties,
      specialtyNames,
      workingHours: profileData.workingHours || {},
      isActive: true,
      profileCompleted: true,
      approvalStatus: "APPROVED",
      approvalMethod: "AUTO",
      approvedAt: nowIso(),
      rating: 0,
      reviewCount: 0,

      // Wallet / Token initial values
      currentTokenCount: 0,
      tokenBalance: 0,
      lifetimeTotalTokens: 0,
      lifetimeTotalSpend: 0,
      
      createdAt: nowIso(),
      updatedAt: nowIso(),
    });

    return { success: true, message: "تم إنشاء وتفعيل ملف الخبير بنجاح." };
  } catch (error) {
    if (isDevelopment) {
      console.error("Profil tamamlama hatası:", error);
    }
    throw error;
  }
}
// ========== DÜZELTME SONU ==========

export async function uploadPortfolioPhoto({ uid, file }) {
  if (file.size > 5 * 1024 * 1024) {
    throw new Error("Dosya boyutu 5MB'dan büyük olamaz.");
  }
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
  if (!allowedTypes.includes(file.type)) {
    throw new Error("Sadece JPEG, PNG veya WEBP dosyaları yüklenebilir.");
  }
  
  const ext = file.name.split(".").pop();
  const fileName = `portfolio/${uid}/${Date.now()}.${ext}`;
  const storageRef = ref(storage, fileName);
  await uploadBytes(storageRef, file);
  return await getDownloadURL(storageRef);
}

export async function getPortfolioPhotos(uid) {
  const folderRef = ref(storage, `portfolio/${uid}`);
  const result = await listAll(folderRef);
  const urls = await Promise.all(result.items.map((item) => getDownloadURL(item)));
  return urls;
}

export async function deletePortfolioPhoto(url) {
  await deleteObject(ref(storage, url));
}

export async function getUserRole(uid) {
  try {
    const userSnap = await getDoc(doc(db, "users", uid));
    if (!userSnap.exists()) return { role: "unknown", data: null };

    const userData = userSnap.data();

    if (userData.userType === "ADMIN") {
      return { role: "admin", data: userData };
    }

    if (userData.userType === "PROVIDER") {
      const providerSnap = await getDoc(doc(db, "service_providers", uid));
      return {
        role: "provider",
        data: {
          ...userData,
          providerData: providerSnap.exists() ? providerSnap.data() : {},
        },
      };
    }

    return { role: "user", data: userData };
  } catch (error) {
    if (isDevelopment) {
      console.error("Rol kontrolü hatası:", error.message);
    }
    throw error;
  }
}

export async function getRedirectPath(uid) {
  try {
    const { role } = await getUserRole(uid);

    if (role === "admin") {
      return "/admin";
    }

    return "/ilanlar";
  } catch {
    return "/ilanlar";
  }
}

// DÜZELTİLDİ - loginWithEmail validation eklendi
export async function loginWithEmail({ email, password }) {
  const cleanEmail = normalizeEmail(email);
  
  await checkLoginEligibility(cleanEmail);

  if (!validateEmail(email)) {
    throw new Error("Geçerli bir e-posta adresi giriniz.");
  }
  if (!password || password.length < 1) {
    throw new Error("Şifre giriniz.");
  }

  try {
    const cred = await signInWithEmailAndPassword(auth, cleanEmail, password);

    const userRef = doc(db, "users", cred.user.uid);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()) {
      await setDoc(
        userRef,
        {
          uid: cred.user.uid,
          displayName: cred.user.displayName || cleanEmail.split("@")[0],
          email: cred.user.email || cleanEmail,
          phoneNumber: cred.user.phoneNumber || null,
          isPhoneVerified: !!cred.user.phoneNumber,
          location: null,
          userType: "CLIENT",
          profileCompleted: true,
          createdAt: nowIso(),
          updatedAt: nowIso(),
          lastLoginAt: nowIso(),
        },
        { merge: true }
      );
    } else {
      await setDoc(
        userRef,
        {
          lastLoginAt: nowIso(),
          updatedAt: nowIso(),
        },
        { merge: true }
      );
    }

    await syncIdentityDocFromAuthUser(cred.user);
    return cred.user;
  } catch (error) {
    if (error?.code === "auth/invalid-credential" ||
        error?.code === "auth/wrong-password" ||
        error?.code === "auth/user-not-found" ||
        error?.code === "auth/invalid-login-credentials") {
      const userDoc = await findUserDocByEmail(cleanEmail);

      if (userDoc) {
        const userData = userDoc.data() || {};
        const providers = normalizeProviderList(userData.authProviders);

        const hasPassword = providers.includes("password");
        const hasGoogle = providers.includes("google");
        const hasPhone = providers.includes("phone");

        const switchedToGoogle = hasGoogle && !hasPassword;
        if (switchedToGoogle) {
          const err = new Error("Bu hesap Google Sign-In ile kayıtlı. Lütfen Google ile giriş yapın.");
          err.code = "ACCOUNT_SWITCHED_TO_GOOGLE";
          err.email = cleanEmail;
          throw err;
        }

        const phoneOnly = hasPhone && !hasPassword && !hasGoogle;
        if (phoneOnly) {
          const err = new Error("Bu hesap telefon numarası ile kayıtlı. Lütfen telefonla giriş yapın.");
          err.code = "PASSWORD_LOGIN_NOT_ALLOWED";
          throw err;
        }
      }
    }

    throw error;
  }
}

export async function continueWithGoogle() {
  try {
    const provider = new GoogleAuthProvider();
    const result = await signInWithPopup(auth, provider);
    const user = result.user;
    const cleanEmail = normalizeEmail(user.email);

    if (!cleanEmail || !validateEmail(user.email)) {
      await signOut(auth).catch(() => {});
      const err = new Error("Could not retrieve a valid email from Google.");
      err.code = "GOOGLE_EMAIL_MISSING";
      throw err;
    }

    try {
      await assertSocialLoginAllowed(cleanEmail, "google");
    } catch (guardError) {
      await signOut(auth).catch(() => {});
      const err = new Error(
        guardError?.message ||
          "Bu hesap silinmiş durumda ve geri yükleme süresi devam ediyor."
      );
      err.code = guardError?.code || "SOCIAL_LOGIN_BLOCKED_DELETED_ACCOUNT";
      err.email = cleanEmail;
      throw err;
    }

    const existingUserDoc = await findUserDocByEmail(cleanEmail);

    if (!existingUserDoc) {
      await setDoc(doc(db, "users", user.uid), {
        uid: user.uid,
        displayName: user.displayName ? user.displayName.slice(0, 100) : cleanEmail.split("@")[0],
        email: cleanEmail,
        phoneNumber: user.phoneNumber || null,
        isPhoneVerified: !!user.phoneNumber,
        location: null,
        addresses: [],
        userType: "CLIENT",
        authProvider: "google",
        authProviders: ["google"],
        createdAt: nowIso(),
        updatedAt: nowIso(),
        lastLoginAt: nowIso(),
      });

      await syncIdentityDocFromAuthUser(user);
      return { status: "NEW_ACCOUNT_CREATED", user };
    }

    if (existingUserDoc.id === user.uid) {
      await setDoc(
        existingUserDoc.ref,
        { lastLoginAt: nowIso(), updatedAt: nowIso() },
        { merge: true }
      );

      await syncIdentityDocFromAuthUser(user);
      return { status: "SIGNED_IN", user };
    }

    await signOut(auth).catch(() => {});

    return {
      status: "MERGE_REQUIRED",
      email: cleanEmail,
      pendingCredential: null,
      existingUid: existingUserDoc.id,
      existingDisplayName: existingUserDoc.data()?.displayName || null,
      googleDisplayName: user.displayName || null,
    };
  } catch (error) {
    if (error?.code === "auth/account-exists-with-different-credential") {
      const pendingCredential = GoogleAuthProvider.credentialFromError(error);
      const email = normalizeEmail(error?.customData?.email || "");
      await signOut(auth).catch(() => {});
      return { status: "MERGE_REQUIRED", email, pendingCredential };
    }

    if (error?.code === "auth/popup-closed-by-user") {
      const e = new Error("Google sign-in window was closed.");
      e.code = "GOOGLE_POPUP_CLOSED";
      throw e;
    }
    if (error?.code === "auth/popup-blocked") {
      const e = new Error("Google popup was blocked by the browser.");
      e.code = "GOOGLE_POPUP_BLOCKED";
      throw e;
    }
    if (error?.code === "auth/cancelled-popup-request") {
      const e = new Error("Google sign-in request was cancelled.");
      e.code = "GOOGLE_POPUP_CANCELLED";
      throw e;
    }

    throw error;
  }
}

export async function mergeGoogleWithExistingPasswordAccount({
  email,
  password,
  pendingGoogleCredential,
}) {
  const cleanEmail = normalizeEmail(email);

  if (!cleanEmail || !validateEmail(email)) throw new Error("Geçerli bir e-posta adresi gerekli.");
  if (!password || password.length < 1) throw new Error("Lütfen mevcut hesabınızın şifresini girin.");

  try {
    const cred = await signInWithEmailAndPassword(auth, cleanEmail, password);

    if (pendingGoogleCredential) {
      await linkWithCredential(cred.user, pendingGoogleCredential);
      await syncIdentityDocFromAuthUser(cred.user);
      return {
        success: true,
        user: cred.user,
        message: "Hesabınız Google ile başarıyla bağlandı.",
      };
    }

    const provider = new GoogleAuthProvider();
    try {
      const linkResult = await linkWithPopup(cred.user, provider);
      await syncIdentityDocFromAuthUser(linkResult.user);
      return {
        success: true,
        user: linkResult.user,
        message: "Hesabınız Google ile başarıyla bağlandı.",
      };
    } catch (linkError) {
      if (linkError?.code === "auth/provider-already-linked") {
        await syncIdentityDocFromAuthUser(cred.user);
        return {
          success: true,
          user: cred.user,
          message: "Google zaten bu hesaba bağlıydı.",
        };
      }
      throw linkError;
    }
  } catch (error) {
    if (isDevelopment) {
      console.error("Google merge error:", error);
    }

    if (error?.code === "auth/invalid-credential") {
      throw new Error("Birleştirme bilgisi geçersiz. Lütfen tekrar deneyin.");
    }
    if (error?.code === "auth/wrong-password") {
      throw new Error("Girdiğiniz şifre hatalı.");
    }
    if (error?.code === "auth/invalid-login-credentials") {
      throw new Error("E-posta veya şifre hatalı.");
    }
    if (error?.code === "auth/user-not-found") {
      throw new Error("Bu e-posta adresine ait kullanıcı bulunamadı.");
    }

    throw error;
  }
}

export async function linkGoogleToCurrentUser() {
  const currentUser = auth.currentUser;

  if (!currentUser) {
    throw new Error("Önce hesabınıza giriş yapmalısınız.");
  }

  const currentEmail = normalizeEmail(currentUser.email || "");

  if (!isGmailAddress(currentEmail)) {
    const customError = new Error(
      "Sadece Gmail adresi ile kayıt olan kullanıcılar Google hesabı bağlayabilir."
    );
    customError.code = "GOOGLE_LINK_ONLY_FOR_GMAIL_USERS";
    throw customError;
  }

  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({
    login_hint: currentEmail,
    prompt: "select_account",
  });

  try {
    const result = await linkWithPopup(currentUser, provider);
    let linkedUser = result.user;

    try {
      await linkedUser.reload();
      linkedUser = auth.currentUser || linkedUser;
    } catch (_) {}

    const googleProviderData = Array.isArray(linkedUser?.providerData)
      ? linkedUser.providerData.find((item) => item?.providerId === "google.com")
      : null;

    const selectedGoogleEmail = normalizeEmail(
      googleProviderData?.email || result?.user?.email || ""
    );

    if (!selectedGoogleEmail) {
      try {
        await unlink(linkedUser, "google.com");
      } catch (_) {}

      const customError = new Error(
        "Bağlanılan Google hesabının e-posta bilgisi alınamadı."
      );
      customError.code = "GOOGLE_EMAIL_NOT_RESOLVED";
      throw customError;
    }

    if (!isSameGoogleIdentity(currentEmail, selectedGoogleEmail)) {
      try {
        await unlink(linkedUser, "google.com");
      } catch (_) {}

      const customError = new Error(
        `Sadece ${currentEmail} adresine ait Google hesabı bağlanabilir. Seçilen hesap: ${selectedGoogleEmail}`
      );
      customError.code = "GOOGLE_ACCOUNT_EMAIL_MISMATCH";
      throw customError;
    }

    await syncIdentityDocFromAuthUser(linkedUser, {
      forceProviders: ["password", "google"],
      forcePrimaryProvider: "password",
    });

    return {
      success: true,
      user: linkedUser,
      message: "Google hesabı başarıyla bağlandı.",
    };
  } catch (error) {
    if (isDevelopment) {
      console.error("Google bağlama hatası:", error);
    }

    if (error?.code === "auth/popup-closed-by-user") {
      const customError = new Error("Google penceresi kapatıldı.");
      customError.code = "GOOGLE_POPUP_CLOSED";
      throw customError;
    }

    if (error?.code === "auth/popup-blocked") {
      const customError = new Error(
        "Google açılır penceresi engellendi. Lütfen tarayıcıda pop-up izni verin."
      );
      customError.code = "GOOGLE_POPUP_BLOCKED";
      throw customError;
    }

    if (error?.code === "auth/provider-already-linked") {
      const customError = new Error("Google hesabı zaten bu kullanıcıya bağlı.");
      customError.code = "GOOGLE_ALREADY_LINKED";
      throw customError;
    }

    if (error?.code === "auth/credential-already-in-use") {
      const customError = new Error("Bu Google hesabı başka bir kullanıcıya bağlı.");
      customError.code = "GOOGLE_CREDENTIAL_ALREADY_IN_USE";
      throw customError;
    }

    if (error?.code === "GOOGLE_ACCOUNT_EMAIL_MISMATCH") {
      throw error;
    }

    if (error?.code === "GOOGLE_EMAIL_NOT_RESOLVED") {
      throw error;
    }

    throw error;
  }
}

// DÜZELTİLDİ - requestPasswordReset validation eklendi
export async function requestPasswordReset(email) {
  const cleanEmail = normalizeEmail(email);

  if (!cleanEmail || !validateEmail(email)) {
    throw new Error("Lütfen geçerli bir e-posta adresi girin.");
  }

  try {
    const eligibility = await checkPasswordResetEligibility(cleanEmail);

    if (eligibility?.allowed) {
      await sendPasswordResetEmail(auth, cleanEmail, {
        url: `${window.location.origin}/login`,
        handleCodeInApp: false,
      });

      return {
        success: true,
        status: "sent",
        message: "Şifre sıfırlama bağlantısı gönderildi.",
      };
    }

    if (eligibility?.code === "DELETED_ACCOUNT_IN_RETENTION") {
      return {
        success: false,
        status: "deleted_reserved",
        message: "Bu hesap silinmiş durumda ve geri yükleme süresi devam ediyor.",
      };
    }

    return {
      success: true,
      status: "ignored",
      message: "Eğer bu e-posta adresi sistemde aktif bir hesaba aitse, şifre sıfırlama bağlantısı gönderilecektir.",
    };
  } catch (error) {
    if (isDevelopment) {
      console.error("Şifre sıfırlama hatası:", error.message);
    }

    if (error.code === "auth/invalid-email") {
      throw new Error("Geçersiz e-posta adresi.");
    }

    if (error.code === "auth/too-many-requests") {
      throw new Error("Çok fazla deneme yapıldı. Lütfen daha sonra tekrar deneyin.");
    }

    throw new Error("Şifre sıfırlama işlemi başarısız oldu.");
  }
}

export async function logout() {
  await signOut(auth);
}

let recaptchaVerifier = null;
let recaptchaContainerId = null;
let recaptchaRenderPromise = null;

export function initRecaptcha(
  containerId = "recaptcha-container",
  { size = "invisible" } = {}
) {
  if (typeof window === "undefined") return null;

  const existingVerifier = window.__uzm_recaptchaVerifier || null;
  const existingContainerId = window.__uzm_recaptchaContainerId || null;

  if (existingVerifier && existingContainerId === containerId) {
    recaptchaVerifier = existingVerifier;
    recaptchaContainerId = existingContainerId;
    recaptchaRenderPromise = window.__uzm_recaptchaRenderPromise || null;
    return recaptchaVerifier;
  }

  try {
    if (existingVerifier) {
      existingVerifier.clear();
    }
  } catch (_) {}

  const el = document.getElementById(containerId);
  if (!el) {
    throw new Error(`reCAPTCHA container bulunamadı: #${containerId}`);
  }

  if (el.firstChild) {
    const fresh = el.cloneNode(false);
    el.replaceWith(fresh);
  } else {
    el.innerHTML = "";
  }

  auth.languageCode = "ar";

  const params = {
    size,
    callback: () => {},
    "expired-callback": () => {},
  };

  recaptchaVerifier = new RecaptchaVerifier(auth, containerId, params);
  recaptchaContainerId = containerId;
  window.__uzm_recaptchaVerifier = recaptchaVerifier;
  window.__uzm_recaptchaContainerId = containerId;

  recaptchaRenderPromise = recaptchaVerifier
    .render()
    .then((id) => {
      if (window.__uzm_recaptchaVerifier === recaptchaVerifier) {
        window.__uzm_recaptchaWidgetId = id;
      }
      return id;
    })
    .finally(() => {
      if (window.__uzm_recaptchaRenderPromise === recaptchaRenderPromise) {
        window.__uzm_recaptchaRenderPromise = null;
      }
    });
  window.__uzm_recaptchaRenderPromise = recaptchaRenderPromise;

  return recaptchaVerifier;
}

export async function sendPhoneOtp(
  phoneE164,
  { blockExistingPhone = false } = {}
) {
  if (!recaptchaVerifier && typeof window !== "undefined") {
    recaptchaVerifier = window.__uzm_recaptchaVerifier || null;
  }

  if (!recaptchaVerifier) {
    throw new Error("reCAPTCHA başlatılmamış.");
  }

  const normalized = normalizePhoneNumber(phoneE164);
  if (!normalized) {
    throw new Error("Geçerli bir telefon numarası giriniz.");
  }

  const existingPhoneDoc = await findUserDocByPhone(normalized);

  if (existingPhoneDoc) {
    if (blockExistingPhone) {
      const err = new Error("Bu telefon numarası ile zaten bir kayıt bulunmaktadır.");
      err.code = "PHONE_ALREADY_REGISTERED";
      err.field = "phoneNumber";
      err.phone = normalized;
      err.existingUid = existingPhoneDoc.id;
      throw err;
    }

    const userData = existingPhoneDoc.data() || {};
    const providers = normalizeProviderList(userData.authProviders);

    if (!providers.includes("phone")) {
      const err = new Error(
        "Bu telefon numarası mevcut bir hesaba ait, ancak telefonla giriş henüz etkin değil. Lütfen önce e-posta veya Google ile giriş yapın ve ardından telefon numaranızı hesabınıza bağlayın."
      );
      err.code = "PHONE_LINK_REQUIRED";
      err.phone = normalized;
      err.existingUid = existingPhoneDoc.id;
      throw err;
    }
  }

  try {
    return await signInWithPhoneNumber(auth, normalized, recaptchaVerifier);
  } catch (error) {
    if (error?.code === "auth/invalid-app-credential") {
      clearRecaptcha();
    }
    throw error;
  }
}

export async function confirmPhoneOtp(confirmationResult, code) {
  if (!confirmationResult) {
    throw new Error("Confirmation result bulunamadı.");
  }

  const cred = await confirmationResult.confirm(String(code).trim());
  return cred.user;
}

export function clearRecaptcha() {
  const containerIdToClear =
    recaptchaContainerId ||
    (typeof window !== "undefined" ? window.__uzm_recaptchaContainerId : null) ||
    "recaptcha-container";

  try {
    if (recaptchaVerifier) {
      recaptchaVerifier.clear();
    }
  } catch (_) {}

  recaptchaRenderPromise = null;
  recaptchaVerifier = null;
  recaptchaContainerId = null;

  if (typeof window !== "undefined") {
    window.__uzm_recaptchaVerifier = null;
    window.__uzm_recaptchaWidgetId = null;
    window.__uzm_recaptchaContainerId = null;
    window.__uzm_recaptchaRenderPromise = null;

    const el = document.getElementById(containerIdToClear);
    if (el) {
      const fresh = el.cloneNode(false);
      el.replaceWith(fresh);
    }
  }
}

export async function linkEmailPasswordToPhoneUser({
  fullName,
  email,
  password,
}) {
  const user = auth.currentUser;
  if (!user) {
    throw new Error("Giriş yapmış kullanıcı bulunamadı.");
  }

  await linkWithCredential(
    user,
    EmailAuthProvider.credential(normalizeEmail(email), password)
  );

  if (fullName) {
    await updateProfile(user, { displayName: fullName.slice(0, 100) });
  }

  await syncIdentityDocFromAuthUser(user, {
    displayName: fullName ? fullName.slice(0, 100) : user.displayName || null,
  });

  return user;
}

export async function startPhoneLinking(phoneE164) {
  const currentUser = auth.currentUser;

  if (!currentUser) {
    throw new Error("Önce hesabınıza giriş yapmalısınız.");
  }

  if (!recaptchaVerifier && typeof window !== "undefined") {
    recaptchaVerifier = window.__uzm_recaptchaVerifier || null;
  }

  if (!recaptchaVerifier) {
    throw new Error("reCAPTCHA başlatılmamış.");
  }

  const normalized = normalizePhoneNumber(phoneE164);

  if (!normalized) {
    throw new Error("Geçerli bir telefon numarası giriniz.");
  }

  const currentPhone = normalizePhoneNumber(currentUser.phoneNumber || "");

  if (currentPhone && currentPhone === normalized) {
    const err = new Error("Bu telefon numarası zaten hesabınıza bağlı.");
    err.code = "PHONE_ALREADY_LINKED_TO_CURRENT_USER";
    throw err;
  }

  const existingPhoneDoc = await findUserDocByPhone(normalized);

  if (existingPhoneDoc && existingPhoneDoc.id !== currentUser.uid) {
    const err = new Error("Bu telefon numarası başka bir hesapta kullanılıyor.");
    err.code = "PHONE_ALREADY_IN_USE";
    err.phone = normalized;
    err.existingUid = existingPhoneDoc.id;
    throw err;
  }

  const hasPhoneProvider =
    Array.isArray(currentUser.providerData) &&
    currentUser.providerData.some((provider) => provider?.providerId === "phone");

  try {
    if (hasPhoneProvider) {
      const phoneProvider = new PhoneAuthProvider(auth);
      const verificationId = await phoneProvider.verifyPhoneNumber(
        normalized,
        recaptchaVerifier
      );

      return {
        mode: "UPDATE_PHONE",
        verificationId,
        phoneNumber: normalized,
      };
    }

    const confirmationResult = await linkWithPhoneNumber(
      currentUser,
      normalized,
      recaptchaVerifier
    );

    return {
      mode: "LINK_PHONE",
      confirmationResult,
      phoneNumber: normalized,
    };
  } catch (error) {
    if (error?.code === "auth/invalid-app-credential") {
      clearRecaptcha();
    }

    throw error;
  }
}

export async function confirmPhoneLinking(phoneVerificationSession, code) {
  if (!phoneVerificationSession) {
    throw new Error("Confirmation result bulunamadı.");
  }

  const cleanCode = String(code || "").trim();

  if (!cleanCode) {
    throw new Error("Doğrulama kodu gerekli.");
  }

  const currentUser = auth.currentUser;

  if (!currentUser) {
    throw new Error("Önce hesabınıza giriş yapmalısınız.");
  }

  let user = currentUser;

  if (phoneVerificationSession.mode === "UPDATE_PHONE") {
    const credential = PhoneAuthProvider.credential(
      phoneVerificationSession.verificationId,
      cleanCode
    );

    await updatePhoneNumber(currentUser, credential);

    try {
      await currentUser.reload();
      user = auth.currentUser || currentUser;
    } catch (_) {}

    const normalizedPhone = normalizePhoneNumber(
      user.phoneNumber || phoneVerificationSession.phoneNumber || ""
    );

    await syncIdentityDocFromAuthUser(user, {
      phoneNumber: normalizedPhone,
      isPhoneVerified: !!normalizedPhone,
      forceProviders: ["phone"],
    });

    return {
      success: true,
      user,
      message: "Telefon numarası başarıyla güncellendi.",
    };
  }

  const result = await phoneVerificationSession.confirmationResult.confirm(cleanCode);
  user = result.user;

  try {
    await user.reload();
    user = auth.currentUser || user;
  } catch (_) {}

  const normalizedPhone = normalizePhoneNumber(
    user.phoneNumber || phoneVerificationSession.phoneNumber || ""
  );

  await syncIdentityDocFromAuthUser(user, {
    phoneNumber: normalizedPhone,
    isPhoneVerified: !!normalizedPhone,
    forceProviders: ["phone"],
  });

  return {
    success: true,
    user,
    message: "Telefon numarası başarıyla bağlandı.",
  };
}

export function getCurrentUserProviderFlags() {
  const currentUser = auth.currentUser;

  if (!currentUser) {
    return {
      isLoggedIn: false,
      hasPassword: false,
      hasGoogle: false,
      hasPhone: false,
    };
  }

  const providerIds = Array.isArray(currentUser.providerData)
    ? currentUser.providerData.map((p) => p?.providerId)
    : [];

  return {
    isLoggedIn: true,
    hasPassword: providerIds.includes("password"),
    hasGoogle: providerIds.includes("google.com"),
    hasPhone: providerIds.includes("phone"),
  };
}

export async function startGoogleUnionFlow() {
  try {
    const provider = new GoogleAuthProvider();
    const result = await signInWithPopup(auth, provider);
    const googleUser = result.user;
    const cleanEmail = normalizeEmail(googleUser.email);

    if (!cleanEmail || !validateEmail(googleUser.email)) {
      await signOut(auth).catch(() => {});
      const err = new Error("Google hesabından geçerli bir e-posta alınamadı.");
      err.code = "GOOGLE_EMAIL_MISSING";
      throw err;
    }

    try {
      await assertSocialLoginAllowed(cleanEmail, "google");
    } catch (guardError) {
      await signOut(auth).catch(() => {});
      const err = new Error(
        guardError?.message ||
          "Bu hesap silinmiş durumda ve geri yükleme süresi devam ediyor."
      );
      err.code = guardError?.code || "SOCIAL_LOGIN_BLOCKED_DELETED_ACCOUNT";
      err.email = cleanEmail;
      throw err;
    }

    const existingUserDoc = await findUserDocByEmail(cleanEmail);
    const pendingGoogleCredential = GoogleAuthProvider.credentialFromResult(result) || null;

    if (!existingUserDoc) {
      await syncIdentityDocFromAuthUser(googleUser, {
        forceProviders: ["google"],
      });

      return {
        status: "NEW_ACCOUNT_CREATED",
        user: googleUser,
      };
    }

    if (existingUserDoc.id === googleUser.uid) {
      await syncIdentityDocFromAuthUser(googleUser, {
        forceProviders: ["google"],
      });

      return {
        status: "SIGNED_IN",
        user: googleUser,
      };
    }

    const existingData = existingUserDoc.data() || {};
    const existingProviders = normalizeProviderList(existingData.authProviders);

    const methods = await fetchSignInMethodsForEmail(auth, cleanEmail).catch(() => []);

    const hasPasswordMethod = methods.includes("password") || existingProviders.includes("password");
    const hasPhoneMethod = methods.includes("phone") || existingProviders.includes("phone");

    await signOut(auth).catch(() => {});

    if (hasPasswordMethod || hasPhoneMethod) {
      return {
        status: "PASSWORD_ACCOUNT_LINK_REQUIRED",
        email: cleanEmail,
        pendingGoogleCredential,
        existingUid: existingUserDoc.id,
      };
    }

    return {
      status: "MERGE_REQUIRED",
      email: cleanEmail,
      pendingGoogleCredential,
      existingUid: existingUserDoc.id,
    };
  } catch (error) {
    if (error?.code === "auth/account-exists-with-different-credential") {
      const pendingGoogleCredential = GoogleAuthProvider.credentialFromError(error);
      const email = normalizeEmail(error?.customData?.email || "");
      await signOut(auth).catch(() => {});
      return {
        status: "PASSWORD_ACCOUNT_LINK_REQUIRED",
        email,
        pendingGoogleCredential,
      };
    }

    if (error?.code === "auth/popup-closed-by-user") {
      const e = new Error("Google penceresi kapatıldı.");
      e.code = "GOOGLE_POPUP_CLOSED";
      throw e;
    }

    if (error?.code === "auth/popup-blocked") {
      const e = new Error("Google popup engellendi.");
      e.code = "GOOGLE_POPUP_BLOCKED";
      throw e;
    }

    if (error?.code === "auth/cancelled-popup-request") {
      const e = new Error("Google isteği iptal edildi.");
      e.code = "GOOGLE_POPUP_CANCELLED";
      throw e;
    }

    throw error;
  }
}

export async function finishGoogleUnionWithPassword({
  email,
  password,
  pendingGoogleCredential,
}) {
  const cleanEmail = normalizeEmail(email);

  if (!cleanEmail || !validateEmail(email)) {
    throw new Error("Geçerli bir e-posta gerekli.");
  }

  if (!password || password.length < 1) {
    throw new Error("Lütfen mevcut hesabın şifresini girin.");
  }

  try {
    const cred = await signInWithEmailAndPassword(auth, cleanEmail, password);

    if (pendingGoogleCredential) {
      await linkWithCredential(cred.user, pendingGoogleCredential);
    } else {
      const provider = new GoogleAuthProvider();
      await linkWithPopup(cred.user, provider);
    }

    let finalUser = cred.user;

    try {
      await finalUser.reload();
      finalUser = auth.currentUser || finalUser;
    } catch (_) {}

    await syncIdentityDocFromAuthUser(finalUser, {
      forceProviders: ["password", "google"],
      forcePrimaryProvider: "password",
    });

    return {
      success: true,
      user: finalUser,
      message: "Google hesabı mevcut hesaba başarıyla bağlandı.",
    };
  } catch (error) {
    if (error?.code === "auth/provider-already-linked") {
      const currentUser = auth.currentUser;
      if (currentUser) {
        await syncIdentityDocFromAuthUser(currentUser, {
          forceProviders: ["password", "google"],
          forcePrimaryProvider: "password",
        });
      }

      return {
        success: true,
        user: currentUser,
        message: "Google zaten bu hesaba bağlıydı.",
      };
    }

    if (error?.code === "auth/wrong-password") {
      throw new Error("Girdiğiniz şifre hatalı.");
    }

    if (error?.code === "auth/invalid-login-credentials") {
      throw new Error("E-posta veya şifre hatalı.");
    }

    if (error?.code === "auth/credential-already-in-use") {
      throw new Error(
        "Bu Google hesabı başka bir UID'ye bağlı. Önce eski split hesabı temizlemelisiniz."
      );
    }

    throw error;
  }
}

// 7 mayis modified by Edrees ( making the system not able to recieve more that one phone number/email per account)
export async function assertRegistrationIdentityAvailable({ email, phone }) {
  const cleanEmail = normalizeEmail(email);
  const cleanPhone = normalizePhoneNumber(phone);

  if (cleanEmail) {
    const [userDoc, methods] = await Promise.all([
      findUserDocByEmail(cleanEmail),
      fetchSignInMethodsForEmail(auth, cleanEmail).catch(() => []),
    ]);

    if (userDoc || methods.length > 0) {
      const err = new Error("Bu e-posta adresi zaten kullanılıyor.");
      err.code = "EMAIL_ALREADY_REGISTERED";
      err.field = "email";
      err.email = cleanEmail;
      throw err;
    }
  }

  if (cleanPhone) {
    const phoneDoc = await findUserDocByPhone(cleanPhone);

    if (phoneDoc) {
      const err = new Error("Bu telefon numarası ile zaten bir kayıt bulunmaktadır.");
      err.code = "PHONE_ALREADY_REGISTERED";
      err.field = "phoneNumber";
      err.phone = cleanPhone;
      err.existingUid = phoneDoc.id;
      throw err;
    }
  }

  return {
    email: cleanEmail,
    phone: cleanPhone,
  };
}

/*
===============================================================================
ARCHIVED MANUAL PROVIDER APPROVAL FLOW — authService.js (completeExpertProfile)
The Arabic Firebase project now activates completed experts automatically.
When completeExpertProfile() runs successfully, the user is immediately a
full PROVIDER with isActive: true. No administrator action is required.
Code below is preserved for reference only and is never executed.
===============================================================================

// ─── 1. Old users/{uid} update (manual approval state) ───
//
// The original updateDoc call wrote PENDING_PROVIDER as the userType, keeping
// the expert in a limbo state until an administrator promoted them in the
// admin dashboard. isActive was not set to true here.
//
//   await updateDoc(userRef, {
//     profileCompleted: true,
//     userType: "PENDING_PROVIDER",   // ← changed to "PROVIDER"
//     mainAddressId: addressId,
//     updatedAt: nowIso(),
//     lastLoginAt: nowIso(),
//   });
//
// Replacement (auto-approval):
//   await updateDoc(userRef, {
//     profileCompleted: true,
//     userType: "PROVIDER",
//     isActive: true,
//     approvalStatus: "APPROVED",
//     approvalMethod: "AUTO",
//     approvedAt: nowIso(),
//     mainAddressId: addressId,
//     updatedAt: nowIso(),
//     lastLoginAt: nowIso(),
//   });

// ─── 2. Old service_providers/{uid} isActive field ───
//
// The service_providers document was created with isActive: false so that
// the ExpertProtectedRoute and all provider guards would block the user from
// accessing expert-only pages until an administrator flipped the flag.
//
//   isActive: false,   // ← changed to true
//
// Replacement (auto-approval):
//   isActive: true,
//   profileCompleted: true,
//   approvalStatus: "APPROVED",
//   approvalMethod: "AUTO",
//   approvedAt: nowIso(),

// ─── 3. Old return message ───
//
// The old success message was a Turkish string that explicitly told the caller
// admin approval was pending. The frontend showed this in a waiting-screen UI.
//
//   return { success: true, message: "Profil tamamlandı! Admin onayı bekleniyor." };
//
// Replacement:
//   return { success: true, message: "تم إنشاء وتفعيل ملف الخبير بنجاح." };

===============================================================================
END ARCHIVED MANUAL PROVIDER APPROVAL FLOW
===============================================================================
*/