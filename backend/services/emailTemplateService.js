// backend/services/emailTemplateService.js
// Generates professional, responsive HTML emails with icons, branding, and CTA buttons.

/**
 * Generates an HTML string for Email Verification.
 * @param {Object} params
 * @param {string} params.displayName User's display name or email prefix
 * @param {string} params.verificationLink The URL link to verify email
 * @returns {string} HTML content
 */
function getVerificationEmailHtml({ displayName = "العزيز", verificationLink }) {
  const safeName = displayName || "عزيزنا المستخدم";

  return `
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>تأكيد البريد الإلكتروني - منصة خبير</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      background-color: #0f172a;
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      color: #e2e8f0;
      direction: rtl;
    }
    .email-container {
      max-width: 600px;
      margin: 30px auto;
      background: #1e293b;
      border: 1px solid rgba(214, 178, 94, 0.3);
      border-radius: 20px;
      overflow: hidden;
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4);
    }
    .email-header {
      background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
      padding: 35px 25px;
      text-align: center;
      border-bottom: 2px solid rgba(214, 178, 94, 0.3);
    }
    .brand-logo-badge {
      display: inline-block;
      width: 64px;
      height: 64px;
      line-height: 64px;
      border-radius: 50%;
      background: linear-gradient(135deg, #d6b25e 0%, #b8860b 100%);
      color: #0f172a;
      font-size: 32px;
      margin-bottom: 12px;
      box-shadow: 0 8px 20px rgba(214, 178, 94, 0.4);
    }
    .email-header h1 {
      margin: 0;
      font-size: 24px;
      color: #ffffff;
      font-weight: 800;
    }
    .email-header p {
      margin: 6px 0 0;
      color: #d6b25e;
      font-size: 14px;
      font-weight: 600;
    }
    .email-body {
      padding: 35px 30px;
    }
    .greeting {
      font-size: 20px;
      font-weight: 700;
      color: #ffffff;
      margin-bottom: 16px;
    }
    .description {
      font-size: 15px;
      line-height: 1.8;
      color: #cbd5e1;
      margin-bottom: 30px;
    }
    .cta-box {
      text-align: center;
      margin: 35px 0;
    }
    .cta-button {
      display: inline-block;
      padding: 16px 36px;
      background: linear-gradient(135deg, #d6b25e 0%, #b8860b 100%);
      color: #0b0f19 !important;
      text-decoration: none !important;
      font-size: 16px;
      font-weight: 800;
      border-radius: 40px;
      box-shadow: 0 10px 25px rgba(214, 178, 94, 0.35);
    }
    .features-card {
      background: rgba(15, 23, 42, 0.6);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 14px;
      padding: 20px;
      margin-top: 30px;
    }
    .feature-item {
      display: flex;
      align-items: flex-start;
      margin-bottom: 14px;
    }
    .feature-item:last-child {
      margin-bottom: 0;
    }
    .feature-icon {
      font-size: 20px;
      margin-left: 12px;
    }
    .feature-text {
      font-size: 14px;
      color: #94a3b8;
      line-height: 1.5;
    }
    .fallback-link {
      word-break: break-all;
      font-size: 12px;
      color: #64748b;
      background: rgba(0, 0, 0, 0.2);
      padding: 12px;
      border-radius: 8px;
      margin-top: 25px;
      direction: ltr;
      text-align: left;
    }
    .email-footer {
      background: #0f172a;
      padding: 25px;
      text-align: center;
      font-size: 13px;
      color: #64748b;
      border-top: 1px solid rgba(255, 255, 255, 0.06);
    }
    .footer-brand {
      color: #d6b25e;
      font-weight: 700;
    }
  </style>
</head>
<body>
  <div class="email-container">
    <div class="email-header">
      <div class="brand-logo-badge">✨</div>
      <h1>منصة خبير - KHABEER</h1>
      <p>منصة الخدمات والصيانة الموثوقة في سوريا</p>
    </div>

    <div class="email-body">
      <div class="greeting">أهلاً بك، ${safeName} 👋</div>
      
      <p class="description">
        شكراً لتسجيلك في منصة خبير! لإكمال خطوات التفعيل والبدء باستخدام حسابك بأمان والاستفادة من كافة خدمات المنصة، يرجى تأكيد صحة بريدك الإلكتروني بالضغط على الزر أدناه:
      </p>

      <div class="cta-box">
        <a href="${verificationLink}" class="cta-button" target="_blank">
          ✉️ تأكيد البريد الإلكتروني الآن
        </a>
      </div>

      <div class="features-card">
        <div class="feature-item">
          <span class="feature-icon">🛡️</span>
          <div class="feature-text">
            <strong>أمان حسابك:</strong> هذا الرابط مخصص لك فقط وصالح للاستخدام لمرة واحدة.
          </div>
        </div>
        <div class="feature-item">
          <span class="feature-icon">⚡</span>
          <div class="feature-text">
            <strong>تفعيل فوري:</strong> بمجرد الضغط على الزر سيتم تفعيل حسابك مباشرة.
          </div>
        </div>
        <div class="feature-item">
          <span class="feature-icon">🔒</span>
          <div class="feature-text">
            <strong>سرية البيانات:</strong> فريق خبير لن يطلب منك أبداً كلمة المرور الخاصة بك.
          </div>
        </div>
      </div>

      <p style="font-size: 13px; color: #94a3b8; margin-top: 25px;">
        إذا لم تظهر الاستجابة عند الضغط على الزر، يمكنك نسخ الرابط التالي ولصقه في متصفحك:
      </p>
      <div class="fallback-link">
        ${verificationLink}
      </div>
    </div>

    <div class="email-footer">
      جميع الحقوق محفوظة © 2026 <span class="footer-brand">منصة خبير</span> | سوريا
      <br>
      إذا لم تقم بإنشاء هذا الحساب، يمكنك إهمال هذه الرسالة بأمان.
    </div>
  </div>
</body>
</html>
  `;
}

/**
 * Generates an HTML string for Password Reset.
 * @param {Object} params
 * @param {string} params.displayName
 * @param {string} params.resetLink
 * @returns {string} HTML content
 */
function getPasswordResetEmailHtml({ displayName = "العزيز", resetLink }) {
  const safeName = displayName || "عزيزنا المستخدم";

  return `
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>إعادة تعيين كلمة المرور - منصة خبير</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      background-color: #0f172a;
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      color: #e2e8f0;
      direction: rtl;
    }
    .email-container {
      max-width: 600px;
      margin: 30px auto;
      background: #1e293b;
      border: 1px solid rgba(214, 178, 94, 0.3);
      border-radius: 20px;
      overflow: hidden;
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4);
    }
    .email-header {
      background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
      padding: 35px 25px;
      text-align: center;
      border-bottom: 2px solid rgba(214, 178, 94, 0.3);
    }
    .brand-logo-badge {
      display: inline-block;
      width: 64px;
      height: 64px;
      line-height: 64px;
      border-radius: 50%;
      background: linear-gradient(135deg, #d6b25e 0%, #b8860b 100%);
      color: #0f172a;
      font-size: 32px;
      margin-bottom: 12px;
      box-shadow: 0 8px 20px rgba(214, 178, 94, 0.4);
    }
    .email-header h1 {
      margin: 0;
      font-size: 24px;
      color: #ffffff;
      font-weight: 800;
    }
    .email-header p {
      margin: 6px 0 0;
      color: #d6b25e;
      font-size: 14px;
      font-weight: 600;
    }
    .email-body {
      padding: 35px 30px;
    }
    .greeting {
      font-size: 20px;
      font-weight: 700;
      color: #ffffff;
      margin-bottom: 16px;
    }
    .description {
      font-size: 15px;
      line-height: 1.8;
      color: #cbd5e1;
      margin-bottom: 30px;
    }
    .cta-box {
      text-align: center;
      margin: 35px 0;
    }
    .cta-button {
      display: inline-block;
      padding: 16px 36px;
      background: linear-gradient(135deg, #d6b25e 0%, #b8860b 100%);
      color: #0b0f19 !important;
      text-decoration: none !important;
      font-size: 16px;
      font-weight: 800;
      border-radius: 40px;
      box-shadow: 0 10px 25px rgba(214, 178, 94, 0.35);
    }
    .fallback-link {
      word-break: break-all;
      font-size: 12px;
      color: #64748b;
      background: rgba(0, 0, 0, 0.2);
      padding: 12px;
      border-radius: 8px;
      margin-top: 25px;
      direction: ltr;
      text-align: left;
    }
    .email-footer {
      background: #0f172a;
      padding: 25px;
      text-align: center;
      font-size: 13px;
      color: #64748b;
      border-top: 1px solid rgba(255, 255, 255, 0.06);
    }
    .footer-brand {
      color: #d6b25e;
      font-weight: 700;
    }
  </style>
</head>
<body>
  <div class="email-container">
    <div class="email-header">
      <div class="brand-logo-badge">🔑</div>
      <h1>منصة خبير - KHABEER</h1>
      <p>طلب إعادة تعيين كلمة المرور</p>
    </div>

    <div class="email-body">
      <div class="greeting">مرحباً، ${safeName} 👋</div>
      
      <p class="description">
        لقد استلمنا طلباً لإعادة تعيين كلمة المرور الخاصة بحسابك على منصة خبير. اضغط على الزر أدناه لتعيين كلمة مرور جديدة:
      </p>

      <div class="cta-box">
        <a href="${resetLink}" class="cta-button" target="_blank">
          🔒 تعيين كلمة مرور جديدة
        </a>
      </div>

      <p style="font-size: 13px; color: #94a3b8;">
        إذا لم تطلب تعيين كلمة المرور، يمكنك تجاهل هذا الإيميل وسيظل حسابك آمناً.
      </p>

      <div class="fallback-link">
        ${resetLink}
      </div>
    </div>

    <div class="email-footer">
      جميع الحقوق محفوظة © 2026 <span class="footer-brand">منصة خبير</span> | سوريا
    </div>
  </div>
</body>
</html>
  `;
}

module.exports = {
  getVerificationEmailHtml,
  getPasswordResetEmailHtml,
};
