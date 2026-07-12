// chatApi.js file code 

import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../firebase/firebaseClient";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:5000";

const API_BASE = `${API_BASE_URL}/api/chat`;

if (!API_BASE_URL && import.meta.env.PROD) {
  throw new Error("VITE_API_BASE_URL is not defined");
}

const isDevelopment = import.meta.env.DEV;

const INVALID_APPOINTMENT_MESSAGE = "معلومات الموعد غير صالحة.";
const NO_SUITABLE_APPOINTMENT_MESSAGE = "لم يتم العثور على موعد مناسب.";
const GENERIC_CHAT_ERROR_MESSAGE = "تعذر بدء المحادثة. يرجى المحاولة مرة أخرى لاحقاً.";

function translateChatErrorMessage(message) {
  const text = String(message || "").trim();
  if (!text) return "";

  const lower = text.toLowerCase();
  const isAppointmentError =
    lower.includes("appointmentid") ||
    lower.includes("randevu") ||
    lower.includes("geçersiz") ||
    lower.includes("gecersiz") ||
    lower.includes("geã§ersiz");

  if (
    lower.includes("bu, bir sorundur") ||
    lower.includes("sorundur") ||
    lower.includes("uygun randevu")
  ) {
    return NO_SUITABLE_APPOINTMENT_MESSAGE;
  }

  if (
    isAppointmentError &&
    lower.includes("geçersiz") ||
    lower.includes("gecersiz") ||
    lower.includes("geã§ersiz") ||
    lower.includes("invalid")
  ) {
    return INVALID_APPOINTMENT_MESSAGE;
  }

  if (
    isAppointmentError &&
    lower.includes("gereklidir") ||
    lower.includes("eksik") ||
    lower.includes("missing") ||
    lower.includes("required")
  ) {
    return "معلومات الموعد مطلوبة.";
  }

  if (isAppointmentError && lower.includes("bulunamad")) {
    return NO_SUITABLE_APPOINTMENT_MESSAGE;
  }

  const isTurkishOrGenericChatError =
    lower.includes("bu, bir sorundur") ||
    lower.includes("sorundur") ||
    lower.includes("sorun") ||
    lower.includes("problem") ||
    lower.includes("kullanici") ||
    lower.includes("kullanıcı") ||
    lower.includes("sohbet") ||
    lower.includes("konuşma") ||
    lower.includes("konusma") ||
    lower.includes("hizmet") ||
    lower.includes("sunucu") ||
    lower.includes("hata") ||
    lower.includes("bulunamadi") ||
    lower.includes("bulunamadı") ||
    lower.includes("gereklidir") ||
    lower.includes("provideruid") ||
    lower.includes("serviceid");

  if (isTurkishOrGenericChatError) {
    return GENERIC_CHAT_ERROR_MESSAGE;
  }

  return text;
}

async function waitForCurrentUser(timeoutMs = 3000) {
  if (auth.currentUser) {
    return auth.currentUser;
  }

  return await new Promise((resolve, reject) => {
    let unsubscribe = () => {};

    const timer = setTimeout(() => {
      unsubscribe();
      resolve(null);
    }, timeoutMs);

    unsubscribe = onAuthStateChanged(
      auth,
      (user) => {
        clearTimeout(timer);
        unsubscribe();
        resolve(user || null);
      },
      (error) => {
        clearTimeout(timer);
        unsubscribe();
        reject(error);
      }
    );
  });
}

async function getAuthToken() {
  const user = auth.currentUser || (await waitForCurrentUser());

  if (!user) {
    throw new Error("يرجى تسجيل الدخول أولاً.");
  }

  return await user.getIdToken();
}

async function parseJsonResponse(response) {
  const text = await response.text();

  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    if (isDevelopment) {
      console.error(
        `Server JSON yerine bunu dondurdu: ${text.slice(0, 200)}`
      );
    }
    throw new Error("حدث خطأ في الخادم. يرجى المحاولة مرة أخرى لاحقاً.");
  }

  if (!response.ok) {
    throw new Error(
      translateChatErrorMessage(data.message) ||
        "حدث خطأ في الخادم. يرجى المحاولة مرة أخرى لاحقاً."
    );
  }

  return data;
}

export async function getOrCreateConversation(
  providerUid,
  serviceId,
  serviceTitle = "",
  // 13-05 Edrees solved
  appointmentId = ""
) {
  const finalServiceId = String(serviceId || "").trim();
  // Syria Arabic launch: appointment system disabled; keep legacy value commented.
  // const finalAppointmentId = String(appointmentId || "").trim();

  // Syria Arabic launch: appointment system disabled, direct chat no longer needs appointmentId.
  // if (!finalAppointmentId) {
  //   throw new Error("معلومات الموعد مطلوبة.");
  // }

  if (!providerUid) {
    throw new Error("لم يتم العثور على معلومات الخبير.");
  }

  if (!finalServiceId) {
    throw new Error("لم يتم العثور على معلومات الخدمة.");
  }

  const token = await getAuthToken();

  const payload = {
    providerUid,
    serviceId: finalServiceId,
    listingId: finalServiceId,
    serviceTitle,
  };

  /* Syria Arabic launch: appointmentId must not be sent for direct chat.
  if (finalAppointmentId) {
    payload.appointmentId = finalAppointmentId;
  }
  */

  const response = await fetch(`${API_BASE}/conversations/get-or-create`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  return await parseJsonResponse(response);
}

export async function fetchMyConversations() {
  const token = await getAuthToken();

  const response = await fetch(`${API_BASE}/conversations`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  return await parseJsonResponse(response);
}

export async function fetchConversationMessages(conversationId) {
  const token = await getAuthToken();

  const response = await fetch(
    `${API_BASE}/conversations/${conversationId}/messages`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  return await parseJsonResponse(response);
}

export async function sendConversationMessage(
  conversationId,
  text,
  replyToMessageId = null
) {
  const token = await getAuthToken();

  const response = await fetch(
    `${API_BASE}/conversations/${conversationId}/messages`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ text, replyToMessageId }),
    }
  );

  return await parseJsonResponse(response);
}

export async function markConversationAsRead(conversationId) {
  const token = await getAuthToken();

  const response = await fetch(`${API_BASE}/conversations/${conversationId}/read`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  return await parseJsonResponse(response);
}

export async function deleteConversationMessage(conversationId, messageId) {
  const token = await getAuthToken();

  const response = await fetch(
    `${API_BASE}/conversations/${conversationId}/messages/${messageId}`,
    {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  return await parseJsonResponse(response);
}

export async function closeConversation(conversationId) {
  const token = await getAuthToken();

  const response = await fetch(`${API_BASE}/conversations/${conversationId}/close`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  return await parseJsonResponse(response);
}
