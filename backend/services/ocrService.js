// backend/services/ocrService.js
// Extracted during Step 9.
const axios = require("axios");
const FormData = require("form-data");

const OCR_SERVICE_URL = process.env.OCR_SERVICE_URL || "http://127.0.0.1:8000";

async function analyzeFile(fileBuffer, filename) {
  const formData = new FormData();
  formData.append("file", fileBuffer, { filename });

  const response = await axios.post(`${OCR_SERVICE_URL}/analyze`, formData, {
    headers: { ...formData.getHeaders() },
    timeout: 60000,
  });

  return response.data;
}

async function checkOcrServiceHealth() {
  try {
    await axios.get(`${OCR_SERVICE_URL}/health`, { timeout: 3000 });
    return true;
  } catch (error) {
    return false;
  }
}

function checkAllDocumentsApproved(results) {
  if (!results.identity) {
    return { approved: false, reason: "Kimlik belgesi yüklenmedi" };
  }

  if (results.identity.verdict === "rejected") {
    return {
      approved: false,
      reason: `Kimlik belgesi REDDEDİLDİ: ${results.identity.reason || "Belge geçersiz"}`,
    };
  }

  if (!results.certificates || results.certificates.length === 0) {
    return { approved: false, reason: "En az bir sertifika yüklenmeli" };
  }

  const hasRejectedCert = results.certificates.some(
    (cert) => cert.verdict === "rejected"
  );

  if (hasRejectedCert) {
    const rejectedReasons = results.certificates
      .filter((c) => c.verdict === "rejected")
      .map((c) => c.reason)
      .join(", ");
    return {
      approved: false,
      reason: `Bazı sertifikalar REDDEDİLDİ: ${rejectedReasons}`,
    };
  }

  if (results.taxPlate && results.taxPlate.verdict === "rejected") {
    return {
      approved: false,
      reason: `Vergi levhası REDDEDİLDİ: ${results.taxPlate.reason || "Belge geçersiz"}`,
    };
  }

  const needsReview =
    results.identity.verdict === "manual_review" ||
    results.certificates.some((c) => c.verdict === "manual_review") ||
    (results.taxPlate && results.taxPlate.verdict === "manual_review");

  if (needsReview) {
    return {
      approved: true,
      reason: "Belgeler incelenmeye alındı. Admin onayı bekleniyor.",
      needsManualReview: true,
    };
  }

  return {
    approved: true,
    reason: "Belgeler onaylandı",
  };
}

module.exports = {
  OCR_SERVICE_URL,
  analyzeFile,
  checkOcrServiceHealth,
  checkAllDocumentsApproved,
};
