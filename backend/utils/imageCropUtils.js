// backend/utils/imageCropUtils.js
// Utility for normalizing the imageCrop payload stored on listings.
// Extracted from app.js (Step 5).

/**
 * normalizeImageCropPayload(rawCrop)
 *
 * Accepts any value and returns a safe { x, y, scale } object.
 *   x, y  — clamped to [0, 100], default 50
 *   scale — clamped to [1, 2.5], default 1
 */
function normalizeImageCropPayload(rawCrop) {
  if (!rawCrop || typeof rawCrop !== "object") {
    return { x: 50, y: 50, scale: 1 };
  }

  const x = Number(rawCrop.x);
  const y = Number(rawCrop.y);
  const scale = Number(rawCrop.scale);

  return {
    x: Number.isFinite(x) ? Math.min(100, Math.max(0, x)) : 50,
    y: Number.isFinite(y) ? Math.min(100, Math.max(0, y)) : 50,
    scale: Number.isFinite(scale) ? Math.min(2.5, Math.max(1, scale)) : 1,
  };
}

module.exports = { normalizeImageCropPayload };
