// // registrationGuardServices.js file code 


const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

if (!API_BASE_URL && process.env.NODE_ENV === 'production') {
  throw new Error('VITE_API_BASE_URL is not defined');
}

const isDevelopment = process.env.NODE_ENV === 'development';

export async function checkRegistrationEligibility({ email, phoneNumber }) {
  const response = await fetch(
    `${API_BASE_URL}/api/registration/check-registration-eligibility`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, phoneNumber }),
    }
  );

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(
      data?.message || "تعذر التحقق من إمكانية إنشاء الحساب."
    );
    error.code = data?.code || "REGISTRATION_ELIGIBILITY_FAILED";
    error.field = data?.field || null;
    throw error;
  }

  return data;
}
