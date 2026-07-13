// chatTermsStorage.js file code

const CHAT_TERMS_PREFIX = "chat_terms_accepted";

const normalizeKeyPart = (value) => {
  return String(value || "").trim();
};

export const buildChatTermsStorageKey = ({
  currentUid,
  providerUid,
  serviceId,
  appointmentId,
}) => {
  return [
    CHAT_TERMS_PREFIX,
    normalizeKeyPart(currentUid) || "guest",
    normalizeKeyPart(providerUid),
    normalizeKeyPart(serviceId),
    normalizeKeyPart(appointmentId),
  ].join(":");
};

export const hasAcceptedChatTerms = ({
  currentUid,
  providerUid,
  serviceId,
  appointmentId,
}) => {
  const key = buildChatTermsStorageKey({
    currentUid,
    providerUid,
    serviceId,
    appointmentId,
  });

  return localStorage.getItem(key) === "true";
};

export const saveChatTermsAccepted = ({
  currentUid,
  providerUid,
  serviceId,
  appointmentId,
}) => {
  const key = buildChatTermsStorageKey({
    currentUid,
    providerUid,
    serviceId,
    appointmentId,
  });

  localStorage.setItem(key, "true");
};