// accountService.js file code

import {
  EmailAuthProvider,
  GoogleAuthProvider,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  signOut,
} from "firebase/auth";
import { auth } from "../firebase/firebaseClient";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

if (!API_BASE_URL && process.env.NODE_ENV === 'production') {
  throw new Error('VITE_API_BASE_URL is not defined');
}

const isDevelopment = process.env.NODE_ENV === 'development';

function hasProvider(user, providerId) {
  return (
    Array.isArray(user?.providerData) &&
    user.providerData.some((item) => item?.providerId === providerId)
  );
}

function normalizeDeleteOptions(passwordOrOptions) {
  if (typeof passwordOrOptions === "string") {
    return {
      password: String(passwordOrOptions || "").trim(),
      useGoogle: false,
    };
  }

  return {
    password: String(passwordOrOptions?.password || "").trim(),
    useGoogle: passwordOrOptions?.useGoogle === true,
  };
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
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

function getGoogleEmailFromUser(user) {
  if (!user) return "";

  const googleProvider = Array.isArray(user.providerData)
    ? user.providerData.find((item) => item?.providerId === "google.com")
    : null;

  return normalizeEmail(googleProvider?.email || user.email || "");
}

async function reauthenticateWithPassword(currentUser, password) {
  if (!currentUser) {
    throw new Error("Oturum bulunamadı.");
  }

  if (!currentUser.email) {
    throw new Error("Bu hesap için şifre doğrulaması kullanılamıyor.");
  }

  const cleanPassword = String(password || "").trim();

  if (!cleanPassword) {
    throw new Error("Şifre zorunludur.");
  }

  try {
    const credential = EmailAuthProvider.credential(
      currentUser.email,
      cleanPassword
    );
    await reauthenticateWithCredential(currentUser, credential);
  } catch (error) {
    if (
      error?.code === "auth/wrong-password" ||
      error?.code === "auth/invalid-credential"
    ) {
      throw new Error("Şifre hatalı.");
    }

    if (error?.code === "auth/too-many-requests") {
      throw new Error(
        "Çok fazla başarısız deneme yapıldı. Lütfen biraz sonra tekrar deneyin."
      );
    }

    if (error?.code === "auth/requires-recent-login") {
      throw new Error("Güvenlik nedeniyle lütfen tekrar giriş yapın.");
    }

    throw new Error("Şifre doğrulaması başarısız oldu.");
  }

  return currentUser;
}

async function reauthenticateWithGoogle(currentUser) {
  if (!currentUser) {
    throw new Error("Oturum bulunamadı.");
  }

  const currentEmail = normalizeEmail(currentUser.email || "");
  if (!currentEmail) {
    throw new Error("Bu hesap için geçerli bir e-posta bulunamadı.");
  }

  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({
    login_hint: currentEmail,
    prompt: "select_account",
  });

  try {
    const result = await reauthenticateWithPopup(currentUser, provider);
    const reauthedUser = result?.user || auth.currentUser || currentUser;

    const selectedGoogleEmail = getGoogleEmailFromUser(reauthedUser);

    if (!selectedGoogleEmail) {
      const err = new Error(
        "Seçilen Google hesabının e-posta bilgisi alınamadı."
      );
      err.code = "GOOGLE_EMAIL_NOT_RESOLVED";
      throw err;
    }

    if (!isSameGoogleIdentity(currentEmail, selectedGoogleEmail)) {
      const err = new Error(
        `Sadece ${currentEmail} adresine ait Google hesabı kullanılabilir. Seçilen hesap: ${selectedGoogleEmail}`
      );
      err.code = "GOOGLE_ACCOUNT_EMAIL_MISMATCH";
      throw err;
    }

    return reauthedUser;
  } catch (error) {
    if (error?.code === "auth/popup-closed-by-user") {
      throw new Error("Google doğrulama penceresi kapatıldı.");
    }

    if (error?.code === "auth/popup-blocked") {
      throw new Error(
        "Google doğrulama penceresi tarayıcı tarafından engellendi."
      );
    }

    if (error?.code === "auth/cancelled-popup-request") {
      throw new Error("Google doğrulama isteği iptal edildi.");
    }

    if (error?.code === "auth/user-mismatch") {
      throw new Error("Seçilen Google hesabı mevcut oturumla eşleşmiyor.");
    }

    if (error?.code === "auth/requires-recent-login") {
      throw new Error("Güvenlik nedeniyle lütfen tekrar giriş yapın.");
    }

    if (error?.code === "GOOGLE_ACCOUNT_EMAIL_MISMATCH") {
      throw error;
    }

    if (error?.code === "GOOGLE_EMAIL_NOT_RESOLVED") {
      throw error;
    }

    throw new Error("Google ile yeniden doğrulama başarısız oldu.");
  }
}

async function reauthenticateCurrentUser(passwordOrOptions) {
  const currentUser = auth.currentUser;

  if (!currentUser) {
    throw new Error("Oturum bulunamadı.");
  }

  const options = normalizeDeleteOptions(passwordOrOptions);

  const hasPassword = hasProvider(currentUser, "password");
  const hasGoogle = hasProvider(currentUser, "google.com");
  const hasPhone = hasProvider(currentUser, "phone");

  if (options.useGoogle) {
    if (!hasGoogle) {
      throw new Error("Bu hesap için Google doğrulaması kullanılamıyor.");
    }

    return reauthenticateWithGoogle(currentUser);
  }

  if (options.password) {
    if (!hasPassword) {
      throw new Error("Bu hesap için şifre doğrulaması kullanılamıyor.");
    }

    return reauthenticateWithPassword(currentUser, options.password);
  }

  if (!hasPassword && hasGoogle) {
    return reauthenticateWithGoogle(currentUser);
  }

  if (hasPassword) {
    throw new Error("Şifre zorunludur.");
  }

  if (hasPhone && !hasGoogle && !hasPassword) {
    throw new Error(
      "Bu hesap telefon ile giriş yapıyor. Bu akış için ayrıca telefon doğrulama desteği eklenmelidir."
    );
  }

  throw new Error("Bu hesap için uygun bir doğrulama yöntemi bulunamadı.");
}

async function deleteAccountRequest(endpoint, passwordOrOptions) {
  const currentUser = await reauthenticateCurrentUser(passwordOrOptions);
  const idToken = await currentUser.getIdToken(true);

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      data?.message || "Hesap devre dışı bırakma işlemi başarısız oldu."
    );
  }

  await signOut(auth);
  return data;
}

export async function deleteProviderAccount(passwordOrOptions) {
  return deleteAccountRequest("/api/account/delete-provider", passwordOrOptions);
}

export async function deleteClientAccount(passwordOrOptions) {
  return deleteAccountRequest("/api/account/delete-client", passwordOrOptions);
}