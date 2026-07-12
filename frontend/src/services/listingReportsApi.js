import { auth } from "../firebase/firebaseClient";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000";

/**
 * İlan bildirimini backend üzerinden Firestore'a yazar (Admin SDK — istemci kurallarından bağımsız).
 */
export async function submitListingReport({ listingId, reasons, description }) {
  const user = auth.currentUser;
  if (!user) {
    throw new Error("يجب تسجيل الدخول أولاً.");
  }

  let idToken;
  try {
    idToken = await user.getIdToken();
  } catch {
    throw new Error("تعذر التحقق من الجلسة. يرجى تسجيل الدخول مرة أخرى.");
  }

  let res;
  try {
    res = await fetch(`${API_BASE_URL}/api/listing-reports`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({
        listingId: String(listingId),
        reasons,
        description: description ?? "",
      }),
    });
  } catch {
    throw new Error(
      "تعذر الوصول إلى الخادم. يرجى التأكد من تشغيل الخادم وصحة إعداد VITE_API_BASE_URL."
    );
  }

  let data = {};
  try {
    data = await res.json();
  } catch {
    // noop
  }

  if (!res.ok) {
    const msg =
      (data && typeof data.message === "string" && data.message) ||
      (res.status === 401
        ? "قد تكون الجلسة منتهية. يرجى تسجيل الدخول مرة أخرى."
        : "تعذر الإرسال. يرجى التحقق من الاتصال والمحاولة مرة أخرى.");
    throw new Error(msg);
  }

  return data;
}
