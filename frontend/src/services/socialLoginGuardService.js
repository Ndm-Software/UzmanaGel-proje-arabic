// socialLoginGuardServices.js file code 

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

if (!API_BASE_URL && process.env.NODE_ENV === 'production') {
  throw new Error('VITE_API_BASE_URL is not defined');
}

const isDevelopment = process.env.NODE_ENV === 'development';

export async function checkSocialLoginEligibility({ email, provider = "google" }) {
  const response = await fetch(
    `${API_BASE_URL}/api/registration/check-social-login-eligibility`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, provider }),
    }
  );

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(
      data?.message || "تعذر التحقق من إمكانية تسجيل الدخول الاجتماعي."
    );
    error.code = data?.code || "SOCIAL_LOGIN_ELIGIBILITY_FAILED";
    error.field = data?.field || null;
    error.provider = data?.provider || provider;
    throw error;
  }

  return data;
}
