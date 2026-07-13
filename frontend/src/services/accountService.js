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
    throw new Error("لم يتم العثور على جلسة نشطة.");
  }

  if (!currentUser.email) {
    throw new Error("لا يمكن استخدام التحقق بكلمة المرور لهذا الحساب.");
  }

  const cleanPassword = String(password || "").trim();

  if (!cleanPassword) {
    throw new Error("كلمة المرور مطلوبة.");
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
      throw new Error("كلمة المرور غير صحيحة.");
    }

    if (error?.code === "auth/too-many-requests") {
      throw new Error(
        "تم إجراء محاولات كثيرة غير ناجحة. يرجى المحاولة بعد قليل."
      );
    }

    if (error?.code === "auth/requires-recent-login") {
      throw new Error("لأسباب أمنية يرجى تسجيل الدخول مرة أخرى.");
    }

    throw new Error("فشل التحقق من كلمة المرور.");
  }

  return currentUser;
}

async function reauthenticateWithGoogle(currentUser) {
  if (!currentUser) {
    throw new Error("لم يتم العثور على جلسة نشطة.");
  }

  const currentEmail = normalizeEmail(currentUser.email || "");
  if (!currentEmail) {
    throw new Error("لم يتم العثور على بريد إلكتروني صالح لهذا الحساب.");
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
        "تعذر الحصول على بريد حساب Google المحدد."
      );
      err.code = "GOOGLE_EMAIL_NOT_RESOLVED";
      throw err;
    }

    if (!isSameGoogleIdentity(currentEmail, selectedGoogleEmail)) {
      const err = new Error(
        `يمكن استخدام حساب Google المرتبط بالبريد ${currentEmail} فقط. الحساب المحدد: ${selectedGoogleEmail}`
      );
      err.code = "GOOGLE_ACCOUNT_EMAIL_MISMATCH";
      throw err;
    }

    return reauthedUser;
  } catch (error) {
    if (error?.code === "auth/popup-closed-by-user") {
      throw new Error("تم إغلاق نافذة التحقق من Google.");
    }

    if (error?.code === "auth/popup-blocked") {
      throw new Error(
        "منع المتصفح نافذة التحقق من Google."
      );
    }

    if (error?.code === "auth/cancelled-popup-request") {
      throw new Error("تم إلغاء طلب التحقق من Google.");
    }

    if (error?.code === "auth/user-mismatch") {
      throw new Error("حساب Google المحدد لا يطابق الجلسة الحالية.");
    }

    if (error?.code === "auth/requires-recent-login") {
      throw new Error("لأسباب أمنية يرجى تسجيل الدخول مرة أخرى.");
    }

    if (error?.code === "GOOGLE_ACCOUNT_EMAIL_MISMATCH") {
      throw error;
    }

    if (error?.code === "GOOGLE_EMAIL_NOT_RESOLVED") {
      throw error;
    }

    throw new Error("فشل إعادة التحقق باستخدام Google.");
  }
}

async function reauthenticateCurrentUser(passwordOrOptions) {
  const currentUser = auth.currentUser;

  if (!currentUser) {
    throw new Error("لم يتم العثور على جلسة نشطة.");
  }

  const options = normalizeDeleteOptions(passwordOrOptions);

  const hasPassword = hasProvider(currentUser, "password");
  const hasGoogle = hasProvider(currentUser, "google.com");
  const hasPhone = hasProvider(currentUser, "phone");

  if (options.useGoogle) {
    if (!hasGoogle) {
      throw new Error("لا يمكن استخدام التحقق عبر Google لهذا الحساب.");
    }

    return reauthenticateWithGoogle(currentUser);
  }

  if (options.password) {
    if (!hasPassword) {
      throw new Error("لا يمكن استخدام التحقق بكلمة المرور لهذا الحساب.");
    }

    return reauthenticateWithPassword(currentUser, options.password);
  }

  if (!hasPassword && hasGoogle) {
    return reauthenticateWithGoogle(currentUser);
  }

  if (hasPassword) {
    throw new Error("كلمة المرور مطلوبة.");
  }

  if (hasPhone && !hasGoogle && !hasPassword) {
    throw new Error(
      "هذا الحساب يستخدم تسجيل الدخول عبر الهاتف. يجب إضافة دعم تحقق الهاتف لهذا الإجراء."
    );
  }

  throw new Error("لم يتم العثور على طريقة تحقق مناسبة لهذا الحساب.");
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
      data?.message || "فشلت عملية تعطيل الحساب."
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
