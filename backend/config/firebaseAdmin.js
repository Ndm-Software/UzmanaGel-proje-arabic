// backend/config/firebaseAdmin.js
// Canonical location for Firebase Admin SDK initialization.
// The root-level firebaseAdmin.js is a compatibility bridge pointing here.

const admin = require("firebase-admin");

const isDevelopment = process.env.NODE_ENV === "development";

function getFirebaseConfigFromEnv() {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKeyRaw = process.env.FIREBASE_PRIVATE_KEY;

  if (!projectId || !clientEmail || !privateKeyRaw) {
    throw new Error(
      "Missing Firebase Admin env vars. Required: FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY."
    );
  }

  return {
    projectId,
    clientEmail,
    privateKey: privateKeyRaw.replace(/\\n/g, "\n"),
  };
}

if (!admin.apps.length) {
  const cert = getFirebaseConfigFromEnv();
  const storageBucket =
    String(process.env.FIREBASE_STORAGE_BUCKET || "").trim() ||
    (cert.projectId ? `${cert.projectId}.appspot.com` : "");

  admin.initializeApp(
    storageBucket
      ? { credential: admin.credential.cert(cert), storageBucket }
      : { credential: admin.credential.cert(cert) }
  );
}

const db = admin.firestore();

module.exports = { admin, db };
