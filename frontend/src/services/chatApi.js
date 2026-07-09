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
    throw new Error("Kullanici girisi bulunamadi.");
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
    throw new Error("Sunucu hatasi. Lütfen daha sonra tekrar deneyin.");
  }

  if (!response.ok) {
    throw new Error(data.message || "Sunucu hatasi. Lütfen daha sonra tekrar deneyin.");
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
  // 13-05 Edrees solved
  const finalAppointmentId = String(appointmentId || "").trim();

  if (!finalAppointmentId) {
  throw new Error("appointmentId gereklidir.");
  }

  if (!providerUid) {
    throw new Error("providerUid gereklidir.");
  }

  if (!finalServiceId) {
    throw new Error("serviceId gereklidir.");
  }

  const token = await getAuthToken();

  const response = await fetch(`${API_BASE}/conversations/get-or-create`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      providerUid,
      serviceId: finalServiceId,
      listingId: finalServiceId,
      serviceTitle,
      // 13-05 Edrees solved
      appointmentId: finalAppointmentId,
    }),
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