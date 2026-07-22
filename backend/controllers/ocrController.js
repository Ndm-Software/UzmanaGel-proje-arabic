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
      return res.status(400).json({ error: "لم يتم العثور على الملف." });
    }

    const isHealthy = await checkOcrServiceHealth();
    if (!isHealthy) {
      if (isDevelopment) console.log("OCR servisi çalışmıyor, otomatik onay simüle ediliyor.");
      return res.json({
        verdict: "approved",
        reason: "موافقة تلقائية (تجاوز الخدمة)",
      });
    }

    const result = await analyzeFile(req.file.buffer, req.file.originalname);
    res.json(result);
  } catch (error) {
    if (isDevelopment) console.error("OCR analyze hatası:", error.message);
    res.status(500).json({
      error: "تعذر تحليل المستند.",
    });
  }
};

exports.analyzeBatch = async (req, res) => {
  try {
    const isHealthy = await checkOcrServiceHealth();
    if (!isHealthy) {
      if (isDevelopment) console.log("OCR servisi çalışmıyor, otomatik onay simüle ediliyor.");
      
      const certFiles = req.files["certificates"] || [];
      const taxFile = req.files["taxPlate"]?.[0];

      const results = {
        identity: null, // identity check has been disabled in the frontend
        certificates: certFiles.map(() => ({
          verdict: "approved",
          reason: "موافقة تلقائية (تجاوز الخدمة)"
        })),
        taxPlate: taxFile ? {
          verdict: "approved",
          reason: "موافقة تلقائية (تجاوز الخدمة)"
        } : null
      };

      return res.json({
        results,
        allApproved: {
          approved: true,
          reason: "تمت الموافقة على المستندات (تجاوز)"
        }
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
      error: "تعذر تحليل المستندات.",
    });
  }
};
