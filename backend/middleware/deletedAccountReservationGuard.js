// deletedAccountReservationGuard.js file code

const { db } = require("../config/firebaseAdmin");

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeTrPhoneToE164(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";

  // Check if it is a Syrian number format
  let syrianCore = digits;
  if (syrianCore.length === 10 && syrianCore.startsWith("0")) {
    syrianCore = syrianCore.slice(1);
  }
  if (syrianCore.length === 12 && syrianCore.startsWith("963")) {
    syrianCore = syrianCore.slice(3);
  }
  if (syrianCore.length === 9 && syrianCore.startsWith("9")) {
    return `+963${syrianCore}`;
  }
  // Check for test number with 10 digits starting with 5 (e.g. +963 5555555555)
  if (syrianCore.length === 13 && syrianCore.startsWith("963")) {
    const checkCore = syrianCore.slice(3);
    if (checkCore.length === 10 && checkCore.startsWith("5")) {
      return `+963${checkCore}`;
    }
  }
  if (syrianCore.length === 10 && syrianCore.startsWith("5")) {
    return `+963${syrianCore}`;
  }

  // Turkey format
  let core = digits;
  if (core.length === 11 && core.startsWith("0")) {
    core = core.slice(1);
  }
  if (core.length === 12 && core.startsWith("90")) {
    core = core.slice(2);
  }
  if (core.length === 10 && core.startsWith("5")) {
    return `+90${core}`;
  }

  // Generic fallback if it's already an E.164 phone number
  if (String(value || "").startsWith("+")) {
    return `+${digits}`;
  }

  return "";
}

function toDate(value) {
  if (!value) return null;

  if (typeof value.toDate === "function") {
    return value.toDate();
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isDeletedAccountStillReserved(data) {
  if (!data || typeof data !== "object") return false;

  if (data.pendingPermanentDeletion !== true) return false;

  const scheduledDate = toDate(data.scheduledPermanentDeletionAt);

  // Güvenli davran: tarih yoksa hâlâ rezerve kabul et
  if (!scheduledDate) return true;

  return scheduledDate.getTime() > Date.now();
}

async function findReservedDeletedByField(field, value) {
  if (!value) return null;

  const snap = await db
    .collection("deleted_accounts")
    .where(field, "==", value)
    .limit(1)
    .get();

  if (snap.empty) return null;

  const docSnap = snap.docs[0];
  const data = docSnap.data() || {};

  if (!isDeletedAccountStillReserved(data)) return null;

  return {
    id: docSnap.id,
    data,
    field,
    value,
  };
}

async function findReservedDeletedAccountByEmail(email) {
  const cleanEmail = normalizeEmail(email);
  if (!cleanEmail) return null;

  const fields = [
    "userData.email",
    "reservedEmail",
    "authSnapshot.email",
  ];

  for (const field of fields) {
    const result = await findReservedDeletedByField(field, cleanEmail);
    if (result) return result;
  }

  return null;
}

async function findReservedDeletedAccountByPhone(phoneNumber) {
  const cleanPhone = normalizeTrPhoneToE164(phoneNumber);
  if (!cleanPhone) return null;

  const fields = [
    "userData.phoneNumber",
    "reservedPhoneNumber",
    "authSnapshot.phoneNumber",
  ];

  for (const field of fields) {
    const result = await findReservedDeletedByField(field, cleanPhone);
    if (result) return result;
  }

  return null;
}

async function assertNoReservedDeletedAccount({ email, phoneNumber }) {
  const emailConflict = await findReservedDeletedAccountByEmail(email);

  if (emailConflict) {
    const err = new Error(
      "Bu e-posta, silinmiş ancak geri yükleme süresi devam eden bir hesaba aittir."
    );
    err.code = "DELETED_EMAIL_RESERVED";
    err.field = "email";
    err.conflict = emailConflict;
    throw err;
  }

  const phoneConflict = await findReservedDeletedAccountByPhone(phoneNumber);

  if (phoneConflict) {
    const err = new Error(
      "Bu telefon numarası, silinmiş ancak geri yükleme süresi devam eden bir hesaba aittir."
    );
    err.code = "DELETED_PHONE_RESERVED";
    err.field = "phoneNumber";
    err.conflict = phoneConflict;
    throw err;
  }

  return true;
}

module.exports = {
  normalizeEmail,
  normalizeTrPhoneToE164,
  isDeletedAccountStillReserved,
  findReservedDeletedAccountByEmail,
  findReservedDeletedAccountByPhone,
  assertNoReservedDeletedAccount,
};