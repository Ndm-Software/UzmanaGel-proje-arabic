const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

if (!API_BASE_URL && process.env.NODE_ENV === 'production') {
  throw new Error('VITE_API_BASE_URL is not defined');
}

const isDevelopment = process.env.NODE_ENV === 'development';

async function safeJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export async function fetchUserRole(user) {
  if (!user) {
    throw new Error("يرجى تسجيل الدخول أولاً.");
  }

  const token = await user.getIdToken();
  const response = await fetch(`${API_BASE_URL}/api/auth/role`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const payload = await safeJson(response);
    throw new Error(payload?.message || "تعذر جلب دور المستخدم.");
  }

  return response.json();
}
