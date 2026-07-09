// adminService.js file code

import { auth } from "./firebaseClient";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000";

const isDevelopment = process.env.NODE_ENV === 'development';

// DÜZELTİLDİ - Gerçek sanitizasyon eklendi
const sanitizeText = (text) => {
  if (!text) return '';
  // Sadece zararlı karakterleri temizle
  return String(text).replace(/[<>]/g, '').slice(0, 1000);
};

async function parseApiResponse(res) {
  const contentType = res.headers.get("content-type") || "";
  const isJson = contentType.includes("application/json");

  const payload = isJson ? await res.json() : await res.text();

  if (!res.ok) {
    let msg = "İstek başarısız.";

    if (isJson && payload?.message) {
      msg = payload.message;
    } else if (typeof payload === "string" && payload.trim()) {
      msg = `İstek başarısız. HTTP ${res.status}`;
    }

    throw new Error(msg);
  }

  return payload;
}

async function adminFetch(method, path, body) {
  const user = auth.currentUser;
  if (!user) throw new Error("Oturum bulunamadı.");

  const token = await user.getIdToken();

  const res = await fetch(`${API_BASE_URL}${path}`, {
    method,
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  return await parseApiResponse(res);
}

async function getAuthHeaders() {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error("Oturum bulunamadı.");
  }

  const token = await currentUser.getIdToken(true);

  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

export async function getDeletedClients() {
  const headers = await getAuthHeaders();

  const response = await fetch(`${API_BASE_URL}/api/admin/deleted-accounts/clients`, {
    method: "GET",
    headers,
  });

  const data = await response.json().catch(() => []);

  if (!response.ok) {
    throw new Error(data?.message || "Silinen kullanıcı hesapları yüklenemedi.");
  }

  return Array.isArray(data) ? data : [];
}

export async function restoreDeletedClient(clientId) {
  const headers = await getAuthHeaders();

  const response = await fetch(
    `${API_BASE_URL}/api/admin/deleted-accounts/${clientId}/restore-client`,
    {
      method: "POST",
      headers,
    }
  );

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data?.message || "Kullanıcı hesabı geri yüklenemedi.");
  }

  return data;
}

export const getAdminListingReportsCount = () =>
  adminFetch("GET", "/api/admin/listing-reports/count");

export const getAdminListingReports = () => adminFetch("GET", "/api/admin/listing-reports");

export const markAdminListingReportSeen = (reportId) => {
  const id = String(reportId || "").trim();
  if (!id) return Promise.reject(new Error("Bildirim kimliği gerekli."));
  return adminFetch("POST", `/api/admin/listing-reports/${encodeURIComponent(id)}/mark-seen`);
};

export const markAdminListingReportAction = (reportId) => {
  const id = String(reportId || "").trim();
  if (!id) return Promise.reject(new Error("Bildirim kimliği gerekli."));
  return adminFetch("POST", `/api/admin/listing-reports/${encodeURIComponent(id)}/mark-action`);
};

export const getPendingExperts = () => adminFetch("GET", "/api/admin/experts/pending");
export const getApprovedExperts = () => adminFetch("GET", "/api/admin/experts/approved");
export const getRejectedExperts = () => adminFetch("GET", "/api/admin/experts/rejected");
export const getExpertDetails = (id) => adminFetch("GET", `/api/admin/experts/${id}`);
export const getAllClients = () => adminFetch("GET", "/api/admin/clients");
export const getDeletedProviders = () =>
  adminFetch("GET", "/api/admin/deleted-accounts/providers");

export const approveExpert = (id) =>
  adminFetch("POST", `/api/admin/experts/${id}/approve`);

// DÜZELTİLDİ - reason validation eklendi
export const rejectExpert = (id, reason) => {
  const cleanReason = String(reason || "").trim();
  if (!cleanReason || cleanReason.length < 3 || cleanReason.length > 500) {
    throw new Error("Red sebebi 3-500 karakter arasında olmalıdır.");
  }
  return adminFetch("POST", `/api/admin/experts/${id}/reject`, { reason: sanitizeText(cleanReason) });
};

export const deleteExpert = (id) =>
  adminFetch("DELETE", `/api/admin/experts/${id}`);

export const restoreDeletedProvider = (providerId) =>
  adminFetch("POST", `/api/admin/deleted-accounts/${providerId}/restore-provider`);

export const deleteClient = (id) =>
  adminFetch("DELETE", `/api/admin/clients/${id}`);