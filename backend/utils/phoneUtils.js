// backend/utils/phoneUtils.js
// Utility for parsing and normalizing Turkish phone numbers to E.164 format.

/**
 * normalizeTrPhoneToE164
 *
 * Cleans non-digits, trims leading '0' or '90', validates 10 digits starting with '5',
 * and returns '+905xxxxxxxxx'. Returns empty string if invalid.
 */
function normalizeTrPhoneToE164(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";

  let core = digits;

  if (core.length === 11 && core.startsWith("0")) {
    core = core.slice(1);
  }

  if (core.length === 12 && core.startsWith("90")) {
    core = core.slice(2);
  }

  if (core.length !== 10) return "";
  if (!core.startsWith("5")) return "";

  return `+90${core}`;
}

module.exports = { normalizeTrPhoneToE164 };
