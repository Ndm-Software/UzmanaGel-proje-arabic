// backend/services/storageService.js
// Firebase Storage upload logic for listing cover images.
// Extracted from app.js (Step 5).
//
// Uses the admin SDK via config/firebaseAdmin.js.
// Tries all bucket candidates in order, stopping on the first success.

const crypto = require("crypto");
const { admin } = require("../config/firebaseAdmin");

/**
 * getStorageBucketCandidates()
 *
 * Returns an ordered list of bucket names to attempt, derived from env vars.
 * Prefer FIREBASE_STORAGE_BUCKET if set; fall back to project-based names.
 */
function getStorageBucketCandidates() {
  const projectId = String(process.env.FIREBASE_PROJECT_ID || "").trim();
  const envBucket = String(process.env.FIREBASE_STORAGE_BUCKET || "").trim();
  const candidates = [];

  if (envBucket) candidates.push(envBucket);

  if (projectId) {
    candidates.push(`${projectId}.appspot.com`);
    candidates.push(`${projectId}.firebasestorage.app`);
  }

  return [...new Set(candidates)];
}

/**
 * uploadListingImageFromDataUrl({ listingId, dataUrl })
 *
 * Uploads a base64 data-URL image to Firebase Storage under:
 *   service_images/<listingId>/cover.<ext>
 *
 * Returns { imageUrl, fileName, bucketName }.
 * Throws if upload fails on all bucket candidates.
 */
async function uploadListingImageFromDataUrl({ listingId, dataUrl }) {
  const mimeMatch = String(dataUrl || "").match(/^data:(image\/\w+);base64,/);
  const mimeType = mimeMatch ? mimeMatch[1] : "image/jpeg";
  const ext = mimeType.split("/")[1];

  const buffer = Buffer.from(
    String(dataUrl).replace(/^data:image\/\w+;base64,/, ""),
    "base64"
  );

  const fileName = `service_images/${listingId}/cover.${ext}`;
  const bucketCandidates = getStorageBucketCandidates();
  const downloadToken = crypto.randomUUID();

  let bucket = null;
  let lastUploadError = null;

  const bucketsToTry = bucketCandidates.length ? bucketCandidates : [null];

  for (const bucketName of bucketsToTry) {
    try {
      bucket = bucketName
        ? admin.storage().bucket(bucketName)
        : admin.storage().bucket();

      const file = bucket.file(fileName);

      await file.save(buffer, {
        contentType: mimeType,
        metadata: {
          metadata: {
            firebaseStorageDownloadTokens: downloadToken,
          },
        },
      });

      lastUploadError = null;
      break;
    } catch (error) {
      lastUploadError = error;
      bucket = null;
    }
  }

  if (!bucket) {
    throw new Error(
      `Storage upload failed: ${lastUploadError?.message || "unknown"}`
    );
  }

  const imageUrl = `https://firebasestorage.googleapis.com/v0/b/${
    bucket.name
  }/o/${encodeURIComponent(fileName)}?alt=media&token=${downloadToken}`;

  return { imageUrl, fileName, bucketName: bucket.name };
}

module.exports = { getStorageBucketCandidates, uploadListingImageFromDataUrl };
