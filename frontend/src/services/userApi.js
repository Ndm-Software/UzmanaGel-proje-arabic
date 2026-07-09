const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000";

async function safeJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function extractErrorMessage(response, fallback) {
  const json = await safeJson(response);
  if (json?.message) return json.message;

  try {
    const text = await response.text();
    if (text && text.trim()) return text.trim().slice(0, 220);
  } catch {
    // noop
  }

  return fallback;
}

export async function updateMyDisplayName(user, { firstName, lastName }) {
  if (!user) {
    throw new Error("No authenticated user.");
  }

  const token = await user.getIdToken();
  const response = await fetch(`${API_BASE_URL}/api/users/me/display-name`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ firstName, lastName }),
  });

  if (!response.ok) {
    throw new Error(await extractErrorMessage(response, "Ad soyad güncellenemedi."));
  }

  return response.json();
}

export async function updateMyPhoneNumber(user, { phoneNumber }) {
  if (!user) {
    throw new Error("No authenticated user.");
  }

  const token = await user.getIdToken();
  const response = await fetch(`${API_BASE_URL}/api/users/me/phone`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ phoneNumber }),
  });

  if (!response.ok) {
    throw new Error(await extractErrorMessage(response, "Telefon güncellenemedi."));
  }

  return response.json();
}
