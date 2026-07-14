// frontend/src/firebase/firebaseClient.js

import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

// WEB PROJESİ - Ana proje
const webFirebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

// MOBİL PROJESİ - İkinci proje
const mobileFirebaseConfig = {
  apiKey: import.meta.env.VITE_MOBILE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_MOBILE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_MOBILE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_MOBILE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_MOBILE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_MOBILE_FIREBASE_APP_ID,
};

// Ana uygulama (web)
const app = initializeApp(webFirebaseConfig, "web-app");

// İkinci uygulama (mobile)
const mobileApp = initializeApp(mobileFirebaseConfig, "mobile-app");

export const auth = getAuth(app);
export const db = getFirestore(app);
export const mobileDb = getFirestore(mobileApp);
export const storage = getStorage(app);

// Sadece local development için: Firebase ID Token almak amacıyla
if (import.meta.env.DEV) {
  console.log("WEB FIREBASE RUNTIME CONFIG:", {
    projectId: app.options.projectId,
    authDomain: app.options.authDomain,
    storageBucket: app.options.storageBucket,
    messagingSenderId: app.options.messagingSenderId,
    appId: app.options.appId,
    apiKeyPrefix: app.options.apiKey?.slice(0, 12),
  });

  console.log("MOBILE FIREBASE RUNTIME CONFIG:", {
    projectId: mobileApp.options.projectId,
    authDomain: mobileApp.options.authDomain,
    appId: mobileApp.options.appId,
    apiKeyPrefix: mobileApp.options.apiKey?.slice(0, 12),
  });
}