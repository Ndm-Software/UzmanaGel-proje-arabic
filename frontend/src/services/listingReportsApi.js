import { auth } from "../firebase/firebaseClient";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000";

/**
 * İlan bildirimini backend üzerinden Firestore'a yazar (Admin SDK — istemci kurallarından bağımsız).
 */
export async function submitListingReport({ listingId, reasons, description }) {
  const user = auth.currentUser;
  if (!user) {
    throw new Error("Giriş yapmalısınız.");
  }

  let idToken;
  try {
    idToken = await user.getIdToken();
  } catch {
    throw new Error("Oturum doğrulanamadı. Lütfen tekrar giriş yapın.");
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
      "Sunucuya ulaşılamadı. Backend (ör. localhost:5000) çalışıyor mu ve VITE_API_BASE_URL doğru mu kontrol edin."
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
        ? "Oturum süresi dolmuş olabilir. Tekrar giriş yapın."
        : "Gönderilemedi. Bağlantınızı kontrol edip tekrar deneyin.");
    throw new Error(msg);
  }

  return data;
}
