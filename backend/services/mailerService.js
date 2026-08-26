// backend/services/mailerService.js
// Handles sending ready HTML emails with Nodemailer and Firebase Admin generated links.

const nodemailer = require("nodemailer");
const { admin } = require("../config/firebaseAdmin");
const { getVerificationEmailHtml, getPasswordResetEmailHtml } = require("./emailTemplateService");

/**
 * Creates Nodemailer transporter based on ENV vars
 */
function createTransporter() {
  const host = process.env.SMTP_HOST || "smtp.gmail.com";
  const port = Number(process.env.SMTP_PORT) || 465;
  const user = process.env.SMTP_USER || process.env.GMAIL_USER || "";
  const pass = process.env.SMTP_PASS || process.env.GMAIL_APP_PASSWORD || "";

  if (!user || !pass) {
    console.warn("[Mailer] SMTP_USER / SMTP_PASS not set. Emails will be logged to console in dev.");
    return null;
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465, // true for 465, false for other ports
    auth: { user, pass },
  });
}

/**
 * Sends custom HTML verification email to user
 * @param {Object} params
 * @param {string} params.email
 * @param {string} [params.displayName]
 */
async function sendCustomVerificationEmail({ email, displayName }) {
  try {
    const actionCodeSettings = {
      url: process.env.FRONTEND_URL || "https://localhost:5173/login",
      handleCodeInApp: true,
    };

    // Generate Firebase link from Admin SDK
    const verificationLink = await admin.auth().generateEmailVerificationLink(email, actionCodeSettings);

    const htmlContent = getVerificationEmailHtml({ displayName, verificationLink });
    const transporter = createTransporter();

    const mailOptions = {
      from: `"${process.env.EMAIL_FROM_NAME || "منصة خبير - KHABEER"}" <${process.env.SMTP_USER || "noreply@khabeer.app"}>`,
      to: email,
      subject: "✨ تأكيد البريد الإلكتروني وتفعيل حسابك - منصة خبير",
      html: htmlContent,
    };

    if (transporter) {
      const info = await transporter.sendMail(mailOptions);
      console.log(`[Mailer] Custom verification email sent to ${email}: ${info.messageId}`);
      return { success: true, messageId: info.messageId, link: verificationLink };
    } else {
      console.log(`[Mailer DEV] Simulating email send to ${email}. Verification Link:\n${verificationLink}`);
      return { success: true, simulated: true, link: verificationLink };
    }
  } catch (error) {
    console.error("[Mailer] Failed to send verification email:", error);
    throw error;
  }
}

/**
 * Sends custom HTML password reset email to user
 * @param {Object} params
 * @param {string} params.email
 * @param {string} [params.displayName]
 */
async function sendCustomPasswordResetEmail({ email, displayName }) {
  try {
    const actionCodeSettings = {
      url: process.env.FRONTEND_URL || "https://localhost:5173/login",
      handleCodeInApp: true,
    };

    const resetLink = await admin.auth().generatePasswordResetLink(email, actionCodeSettings);
    const htmlContent = getPasswordResetEmailHtml({ displayName, resetLink });
    const transporter = createTransporter();

    const mailOptions = {
      from: `"${process.env.EMAIL_FROM_NAME || "منصة خبير - KHABEER"}" <${process.env.SMTP_USER || "noreply@khabeer.app"}>`,
      to: email,
      subject: "🔑 طلب إعادة تعيين كلمة المرور - منصة خبير",
      html: htmlContent,
    };

    if (transporter) {
      const info = await transporter.sendMail(mailOptions);
      console.log(`[Mailer] Custom password reset email sent to ${email}: ${info.messageId}`);
      return { success: true, messageId: info.messageId, link: resetLink };
    } else {
      console.log(`[Mailer DEV] Simulating password reset send to ${email}. Link:\n${resetLink}`);
      return { success: true, simulated: true, link: resetLink };
    }
  } catch (error) {
    console.error("[Mailer] Failed to send password reset email:", error);
    throw error;
  }
}

module.exports = {
  sendCustomVerificationEmail,
  sendCustomPasswordResetEmail,
};
