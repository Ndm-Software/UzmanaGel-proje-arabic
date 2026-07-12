import { auth } from "../firebase/firebaseClient";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

if (!API_BASE_URL && process.env.NODE_ENV === 'production') {
  throw new Error('VITE_API_BASE_URL is not defined');
}

const isDevelopment = process.env.NODE_ENV === 'development';

async function authHeaders(userArg) {
  const user = userArg || auth.currentUser;
  if (!user) {
    throw new Error("يرجى تسجيل الدخول أولاً.");
  }

  const token = await user.getIdToken();
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

async function safeJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export async function fetchFavorites(user) {
  const url = `${API_BASE_URL}/api/favorites?t=${Date.now()}`;
  const response = await fetch(url, {
    method: "GET",
    headers: await authHeaders(user),
    cache: "no-store",
  });

  if (response.status === 304) {
    const retry = await fetch(`${API_BASE_URL}/api/favorites?retry=${Date.now()}`, {
      method: "GET",
      headers: await authHeaders(user),
      cache: "no-store",
    });
    if (!retry.ok) {
      const payload = await safeJson(retry);
      throw new Error(payload?.message || "تعذر تحميل المفضلة.");
    }
    return retry.json();
  }

  if (!response.ok) {
    const payload = await safeJson(response);
    throw new Error(payload?.message || "تعذر تحميل المفضلة.");
  }

  return response.json();
}

export async function addFavorite(id, user) {
  const response = await fetch(`${API_BASE_URL}/api/favorites/${id}`, {
    method: "POST",
    headers: await authHeaders(user),
  });

  if (!response.ok) {
    const payload = await safeJson(response);
    throw new Error(payload?.message || "تعذر إضافة الإعلان إلى المفضلة.");
  }
}

export async function removeFavorite(id, user) {
  const response = await fetch(`${API_BASE_URL}/api/favorites/${id}`, {
    method: "DELETE",
    headers: await authHeaders(user),
  });

  if (!response.ok) {
    const payload = await safeJson(response);
    throw new Error(payload?.message || "تعذر إزالة الإعلان من المفضلة.");
  }
}
