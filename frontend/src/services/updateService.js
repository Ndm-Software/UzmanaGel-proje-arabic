// updateService.js file code 

import {
  updatePassword,
  EmailAuthProvider,
  reauthenticateWithCredential,
} from "firebase/auth";
import { ref, uploadBytes, getDownloadURL, listAll } from "firebase/storage";
import { auth, db, storage } from "../firebase/firebaseClient";
import { doc, getDoc, updateDoc } from "firebase/firestore";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

if (!API_BASE_URL && process.env.NODE_ENV === 'production') {
  throw new Error('VITE_API_BASE_URL is not defined');
}

const isDevelopment = process.env.NODE_ENV === 'development';

function nowIso() {
  return new Date().toISOString();
}

async function safeJson(response) {
  try { return await response.json(); } catch { return null; }
}

async function extractErrorMessage(response, fallback) {
  const json = await safeJson(response);
  if (json?.message) return json.message;
  try {
    const text = await response.text();
    if (text && text.trim()) return text.trim().slice(0, 220);
  } catch { /* noop */ }
  return fallback;
}

export async function updateMyDisplayName(user, { firstName, lastName }) {
  if (!user) throw new Error("يرجى تسجيل الدخول أولاً.");
  const token = await user.getIdToken();
  const response = await fetch(`${API_BASE_URL}/api/users/me/display-name`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ firstName, lastName }),
  });
  if (!response.ok) throw new Error(await extractErrorMessage(response, "تعذر تحديث الاسم الكامل."));
  return response.json();
}

export async function updateMyPhoneNumber(user, { phoneNumber }) {
  if (!user) throw new Error("يرجى تسجيل الدخول أولاً.");
  const token = await user.getIdToken();
  const response = await fetch(`${API_BASE_URL}/api/users/me/phone`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ phoneNumber }),
  });
  if (!response.ok) throw new Error(await extractErrorMessage(response, "تعذر تحديث رقم الهاتف."));
  return response.json();
}

export async function updateUserPassword({ currentPassword, newPassword }) {
  const user = auth.currentUser;
  if (!user) throw new Error("لم يتم العثور على جلسة نشطة.");
  const credential = EmailAuthProvider.credential(user.email, currentPassword);
  await reauthenticateWithCredential(user, credential);
  await updatePassword(user, newPassword);
  return { success: true };
}

export async function updatePhoneNumber({ uid, phoneNumber }) {
  const normalized = String(phoneNumber || "").replace(/[^\d+]/g, "");
  if (!normalized) throw new Error("يرجى إدخال رقم هاتف صالح.");
  await updateDoc(doc(db, "users", uid), { phoneNumber: normalized, updatedAt: nowIso() });
  return { success: true };
}

export async function updateWorkingHours({ uid, workingHours }) {
  await updateDoc(doc(db, "service_providers", uid), { workingHours, updatedAt: nowIso() });
  return { success: true };
}

export async function uploadProfilePhoto({ uid, file }) {
  const fileName = `profile_${Date.now()}.jpg`;
  const storageRef = ref(storage, `profile_photos/${uid}/${fileName}`);
  await uploadBytes(storageRef, file);
  const url = await getDownloadURL(storageRef);
  await updateDoc(doc(db, "users", uid), { profilePhotoUrl: url, updatedAt: nowIso() });
  return url;
}

function pickProfilePhotoUrl(data = {}) {
  return (
    data.profilePhotoUrl ||
    data.photoURL ||
    data.profilePhoto ||
    data.photoUrl ||
    null
  );
}

export async function getProfilePhoto(uid) {
  if (!uid) return null;

  try {
    const userDoc = await getDoc(doc(db, "users", uid));
    if (userDoc.exists()) {
      const userPhoto = pickProfilePhotoUrl(userDoc.data());
      if (userPhoto) return userPhoto;
    }

    const providerDoc = await getDoc(doc(db, "service_providers", uid));
    if (providerDoc.exists()) {
      const providerPhoto = pickProfilePhotoUrl(providerDoc.data());
      if (providerPhoto) return providerPhoto;
    }

    const listRef = ref(storage, `profile_photos/${uid}`);
    const result = await listAll(listRef);
    if (result.items.length === 0) return null;

    const latestItem = [...result.items].sort((a, b) =>
      b.name.localeCompare(a.name)
    )[0];

    return await getDownloadURL(latestItem);
  } catch {
    return null;
  }
}
