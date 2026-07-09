// passwordrestGuardServices.js file code

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

if (!API_BASE_URL && process.env.NODE_ENV === 'production') {
  throw new Error('VITE_API_BASE_URL is not defined');
}

const isDevelopment = process.env.NODE_ENV === 'development';

export async function checkPasswordResetEligibility(email) {
  const response = await fetch(
    `${API_BASE_URL}/api/account/check-password-reset-eligibility`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email }),
    }
  );

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(
      data?.message || "Şifre sıfırlama uygunluk kontrolü başarısız oldu."
    );
    error.code = data?.code || "PASSWORD_RESET_ELIGIBILITY_FAILED";
    throw error;
  }

  return data;
}