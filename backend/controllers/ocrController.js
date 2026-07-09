// backend/controllers/ocrController.js
// Express route handlers for OCR operations.
// Extracted from app.js (Step 9).

const {
  analyzeFile,
  checkOcrServiceHealth,
  checkAllDocumentsApproved,
} = require("../services/ocrService");

const isDevelopment = process.env.NODE_ENV === "development";

exports.analyzeSingle = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "Dosya bulunamadi" });
    }

    const isHealthy = await checkOcrServiceHealth();
    if (!isHealthy) {
      if (isDevelopment) console.log("OCR servisi çalışmıyor, 503 döndürülüyor.");
      return res.status(503).json({
        error: "Belge doğrulama servisi şu anda kullanılamıyor. Lütfen daha sonra tekrar deneyin.",
        code: "OCR_SERVICE_UNAVAILABLE",
      });
    }

    const result = await analyzeFile(req.file.buffer, req.file.originalname);
    res.json(result);
  } catch (error) {
    if (isDevelopment) console.error("OCR analyze hatası:", error.message);
    res.status(500).json({
      error: "Belge analiz edilemedi",
    });
  }
};

exports.analyzeBatch = async (req, res) => {
  try {
    const isHealthy = await checkOcrServiceHealth();
    if (!isHealthy) {
      if (isDevelopment) console.log("OCR servisi çalışmıyor, 503 döndürülüyor.");
      return res.status(503).json({
        error: "Belge doğrulama servisi şu anda kullanılamıyor. Lütfen daha sonra tekrar deneyin.",
        code: "OCR_SERVICE_UNAVAILABLE",
      });
    }

    const identityFile = req.files["identity"]?.[0];
    const certFiles = req.files["certificates"] || [];
    const taxFile = req.files["taxPlate"]?.[0];

    const [identityResult, ...certResults] = await Promise.all([
      identityFile
        ? analyzeFile(identityFile.buffer, identityFile.originalname)
        : Promise.resolve(null),
      ...certFiles.map((cert) => analyzeFile(cert.buffer, cert.originalname)),
    ]);

    const taxResult = taxFile
      ? await analyzeFile(taxFile.buffer, taxFile.originalname)
      : null;

    const results = {
      identity: identityResult,
      certificates: certResults,
      taxPlate: taxResult,
    };

    const allApproved = checkAllDocumentsApproved(results);

    res.json({ results, allApproved });
  } catch (error) {
    if (isDevelopment) console.error("Toplu OCR hatası:", error.message);
    res.status(500).json({
      error: "Belgeler analiz edilemedi",
    });
  }
};
