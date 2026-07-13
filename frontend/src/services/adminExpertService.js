// adminExpertService.js

import { auth } from "../firebase/firebaseClient";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

if (!API_BASE_URL && process.env.NODE_ENV === "production") {
  throw new Error("VITE_API_BASE_URL is not defined");
}

export async function deleteExpertByAdmin(expertId) {
  const currentUser = auth.currentUser;

  if (!currentUser) {
    throw new Error("Oturum bulunamadı.");
  }

  const idToken = await currentUser.getIdToken(true);

  const response = await fetch(
    `${API_BASE_URL}/api/admin/experts/${encodeURIComponent(expertId)}`,
    {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${idToken}`,
      },
    }
  );

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data?.message || "Uzman silinemedi.");
  }

  return data;
}