// backend/config/multerConfig.js
// Multer (multipart/form-data) configuration extracted from server.js.
// Used by OCR routes for file uploads.

const multer = require("multer");

const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/jpg",
      "application/pdf",
    ];

    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Sadece resim ve PDF dosyaları yüklenebilir."));
    }
  },
});

module.exports = { upload };
