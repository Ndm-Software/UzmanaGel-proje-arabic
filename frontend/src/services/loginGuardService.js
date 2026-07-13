// loginGuardService.js file code

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

export async function checkLoginEligibility(email) {
  const response = await fetch(
    `${API_BASE_URL}/api/registration/check-login-eligibility`,
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
      data?.message || "تعذر التحقق من إمكانية تسجيل الدخول."
    );
    error.code = data?.code || "LOGIN_ELIGIBILITY_FAILED";
    error.field = data?.field || null;
    throw error;
  }

  return data;
}
