// chatService.js file code 

const { admin, db } = require("../config/firebaseAdmin");
const { moderateMessage } = require("./chatModeration");
const { archiveConversationToInactive } = require("./chatArchive");

const isDevelopment = process.env.NODE_ENV === 'development';
const DELETED_CONVERSATION_RETENTION_DAYS = 30;

function buildParticipantKey(uid1, uid2) {
  return [uid1, uid2].sort().join("_");
}

// 13-05 Edrees solved
function buildConversationKey(clientUid, providerUid, serviceId, appointmentId) {
  const participantKey = buildParticipantKey(clientUid, providerUid);
  return `${participantKey}__${serviceId}__${appointmentId}`;
}

function normalizeServiceId(value) {
  return String(value || "").trim();
}

function appointmentMatchesConversationService(appointmentData, serviceId) {
  const appointmentServiceId = normalizeServiceId(
    appointmentData?.listingId || appointmentData?.serviceId
  );
  return appointmentServiceId && appointmentServiceId === normalizeServiceId(serviceId);
}

function parseAppointmentEndMs(appointmentData) {
  const dateStr = String(appointmentData?.date || "").trim();
  const endStr = String(appointmentData?.end || "23:59").trim();
  if (!dateStr) return null;
  const d = new Date(`${dateStr}T${endStr}`);
  const ms = d.getTime();
  return Number.isNaN(ms) ? null : ms;
}

function isActiveAppointmentStatus(status) {
  const s = String(status || "").trim();
  return ["approved", "in_progress", "finishing", "expert_at_door"].includes(s);
}

function pickLatestRelevantAppointment(appointments, serviceId) {
  let best = null;
  let bestEnd = -1;

  (appointments || []).forEach((a) => {
    if (!a) return;
    if (!appointmentMatchesConversationService(a, serviceId)) return;
    const endMs = parseAppointmentEndMs(a);
    if (typeof endMs !== "number") return;
    if (endMs > bestEnd) {
      bestEnd = endMs;
      best = a;
    }
  });

  return best ? { appointment: best, endMs: bestEnd } : null;
}

async function loadAndValidateAppointment({
  appointmentId,
  clientUid,
  providerUid,
  serviceId,
  requireActive = true,
}) {
  const finalAppointmentId = String(appointmentId || "").trim();

  if (!finalAppointmentId || finalAppointmentId.length > 150) {
    throw new Error("Geçersiz appointmentId");
  }

  const appointmentDoc = await db
    .collection("appointments")
    .doc(finalAppointmentId)
    .get();

  if (!appointmentDoc.exists) {
    throw new Error("Randevu bulunamadi.");
  }

  const appointmentData = appointmentDoc.data() || {};

  if (String(appointmentData.clientId || "") !== String(clientUid || "")) {
    throw new Error("Bu randevu bu müşteriye ait değil.");
  }

  if (String(appointmentData.expertId || "") !== String(providerUid || "")) {
    throw new Error("Bu randevu bu uzmana ait değil.");
  }

  if (!appointmentMatchesConversationService(appointmentData, serviceId)) {
    throw new Error("Randevu ile hizmet bilgisi eşleşmiyor.");
  }

  const endMs = parseAppointmentEndMs(appointmentData);

  if (requireActive) {
    if (!isActiveAppointmentStatus(appointmentData.status)) {
      throw new Error("Sohbet başlatmak için aktif/onaylanmış randevu gereklidir.");
    }

    if (typeof endMs !== "number" || endMs < Date.now()) {
      throw new Error("Randevu tarihi geçmiş. Sohbet başlatılamaz.");
    }
  }

  return {
    appointmentId: finalAppointmentId,
    appointmentData,
    endMs,
  };
}

function getDeletedConversationExpiryTimestamp() {
  const expiresAt = new Date(
    Date.now() + DELETED_CONVERSATION_RETENTION_DAYS * 24 * 60 * 60 * 1000
  );
  return admin.firestore.Timestamp.fromDate(expiresAt);
}

function getMessagePreviewText(messageData) {
  if (!messageData) return "";

  if (messageData.isDeleted === true || messageData.type === "deleted") {
    return "Bu mesaj silindi";
  }

  return String(messageData.text || "").trim();
}

async function createModerationLog({
  conversationId,
  senderUid,
  originalText,
  sanitizedText,
  moderation,
}) {
  try {
    await db.collection("chat_moderation_logs").add({
      conversationId,
      senderUid,
      originalText: String(originalText || ""),
      sanitizedText: String(sanitizedText || ""),
      riskLevel: moderation.riskLevel || "low",
      action: moderation.action || "allow",
      matchedHardBlocked: moderation.matchedHardBlocked || [],
      matchedSensitive: moderation.matchedSensitive || [],
      entityMatches: moderation.entityMatches || {
        phones: [],
        emails: [],
        urls: [],
        usernames: [],
      },
      normalizedText: moderation.normalizedText || "",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch (error) {
    if (isDevelopment) console.error("createModerationLog error:", error.message);
  }
}

async function enforceRateLimit({ conversationId, senderUid }) {
  const messagesRef = db
    .collection("conversations")
    .doc(conversationId)
    .collection("messages");

  const sinceDate = new Date(Date.now() - 10 * 1000);
  const sinceTimestamp = admin.firestore.Timestamp.fromDate(sinceDate);

  const snapshot = await messagesRef
    .where("senderUid", "==", senderUid)
    .where("createdAt", ">=", sinceTimestamp)
    .get();

  if (snapshot.size >= 5) {
    throw new Error("Cok hizli mesaj gonderiyorsunuz. Lutfen biraz bekleyin.");
  }
}

async function getOrCreateConversation({
  clientUid,
  providerUid,
  serviceId,
  serviceTitle = "",
  appointmentId = "",
}) {
  const normalizedAppointmentId = String(appointmentId || "").trim();

  if (clientUid === providerUid) {
    throw new Error("Kullanici kendisiyle sohbet baslatamaz.");
  }

  if (!serviceId || typeof serviceId !== "string" || serviceId.length > 100) {
    throw new Error("Geçersiz serviceId");
  }

  if (!normalizedAppointmentId || normalizedAppointmentId.length > 150) {
    throw new Error("Geçersiz appointmentId");
  }

  const [clientDoc, providerDoc, serviceDoc] = await Promise.all([
    db.collection("users").doc(clientUid).get(),
    db.collection("users").doc(providerUid).get(),
    db.collection("services").doc(serviceId).get(),
  ]);

  if (!clientDoc.exists) {
    throw new Error("Ilk kullanici bulunamadi.");
  }

  if (!providerDoc.exists) {
    throw new Error("Ikinci kullanici bulunamadi.");
  }

  if (!serviceDoc.exists) {
    throw new Error("Hizmet bulunamadi.");
  }

  const clientData = clientDoc.data() || {};
  const providerData = providerDoc.data() || {};
  const serviceData = serviceDoc.data() || {};

  let actualClientUid;
  let actualProviderUid;
  let actualClientData;
  let actualProviderData;
  let isProviderToProvider = false;

  if (clientData.userType === "PROVIDER" && providerData.userType === "CLIENT") {
    actualClientUid = providerUid;
    actualProviderUid = clientUid;
    actualClientData = providerData;
    actualProviderData = clientData;
  } else if (clientData.userType === "CLIENT" && providerData.userType === "PROVIDER") {
    actualClientUid = clientUid;
    actualProviderUid = providerUid;
    actualClientData = clientData;
    actualProviderData = providerData;
  } else if (clientData.userType === "PROVIDER" && providerData.userType === "PROVIDER") {
    actualClientUid = clientUid;
    actualProviderUid = providerUid;
    actualClientData = clientData;
    actualProviderData = providerData;
    isProviderToProvider = true;
  } else {
    throw new Error("Sohbet baslatabilmek icin uygun kullanici turleri gerekli.");
  }

  if (!["CLIENT", "PROVIDER"].includes(actualClientData.userType)) {
    throw new Error("Sadece CLIENT veya PROVIDER kullanici sohbet baslatabilir.");
  }

  if (actualProviderData.userType !== "PROVIDER") {
    throw new Error("Secilen kullanici PROVIDER degil.");
  }

  if (String(serviceData.providerId || "") !== String(actualProviderUid || "")) {
    throw new Error("Bu hizmet secilen uzmana ait degil.");
  }

  let validatedAppointment = null;

  if (!isProviderToProvider) {
    validatedAppointment = await loadAndValidateAppointment({
      appointmentId: normalizedAppointmentId,
      clientUid: actualClientUid,
      providerUid: actualProviderUid,
      serviceId,
      requireActive: true,
    });
  }

  const participantKey = buildParticipantKey(actualClientUid, actualProviderUid);

  const conversationKey = buildConversationKey(
    actualClientUid,
    actualProviderUid,
    serviceId,
    normalizedAppointmentId
  );

  const existingSnapshot = await db
    .collection("conversations")
    .where("conversationKey", "==", conversationKey)
    .limit(1)
    .get();

  if (!existingSnapshot.empty) {
    const existingDoc = existingSnapshot.docs[0];
    const existingData = existingDoc.data() || {};

    if (String(existingData.status || "").trim() === "inactive") {
      const now = admin.firestore.FieldValue.serverTimestamp();

      await existingDoc.ref.set(
        {
          status: "active",
          updatedAt: now,
          reopenedAt: now,
          appointmentId: normalizedAppointmentId,
          appointmentDate: validatedAppointment?.appointmentData?.date || existingData.appointmentDate || "",
          appointmentStart: validatedAppointment?.appointmentData?.start || existingData.appointmentStart || "",
          appointmentEnd: validatedAppointment?.appointmentData?.end || existingData.appointmentEnd || "",
          inactiveReason: null,
          archivedAt: null,
          closedAt: null,
        },
        { merge: true }
      );

      return {
        conversationId: existingDoc.id,
        ...existingData,
        status: "active",
        appointmentId: normalizedAppointmentId,
        isNew: false,
        reactivated: true,
      };
    }

    return {
      conversationId: existingDoc.id,
      ...existingData,
      isNew: false,
    };
  }

  const resolvedServiceTitle =
    String(serviceData.title || "").trim() ||
    String(serviceTitle || "").trim() ||
    "Hizmet";

  const now = admin.firestore.FieldValue.serverTimestamp();
  const conversationRef = db.collection("conversations").doc();

  const conversationData = {
    clientUid: actualClientUid,
    providerUid: actualProviderUid,
    participants: [actualClientUid, actualProviderUid],
    participantKey,
    conversationKey,

    appointmentId: normalizedAppointmentId,
    appointmentDate: validatedAppointment?.appointmentData?.date || "",
    appointmentStart: validatedAppointment?.appointmentData?.start || "",
    appointmentEnd: validatedAppointment?.appointmentData?.end || "",

    clientName: actualClientData.displayName || "",
    providerName: actualProviderData.displayName || "",
    clientEmail: actualClientData.email || "",
    providerEmail: actualProviderData.email || "",

    serviceId,
    serviceTitle: resolvedServiceTitle,
    serviceCategory: serviceData.category || "",

    createdAt: now,
    updatedAt: now,
    lastMessage: "",
    lastMessageAt: now,
    status: "active",
    unreadCountClient: 0,
    unreadCountProvider: 0,
    lastSenderUid: null,
  };

  await conversationRef.set(conversationData);

  return {
    conversationId: conversationRef.id,
    ...conversationData,
    isNew: true,
  };
}

async function getUserConversations(uid) {
  const snapshot = await db
    .collection("conversations")
    .where("participants", "array-contains", uid)
    .get();

  const conversations = snapshot.docs.map((doc) => ({
    conversationId: doc.id,
    ...doc.data(),
  }));

  const results = await Promise.all(
    conversations.map(async (conv) => {
      if (String(conv?.status || "").trim() === "inactive") {
        return null;
      }

      if (conv.appointmentId) {
  try {
    const validated = await loadAndValidateAppointment({
      appointmentId: conv.appointmentId,
      clientUid: conv.clientUid,
      providerUid: conv.providerUid,
      serviceId: conv.serviceId,
      requireActive: true,
    });

    return {
      ...conv,
      appointmentDate: validated.appointmentData?.date || conv.appointmentDate || "",
      appointmentStart: validated.appointmentData?.start || conv.appointmentStart || "",
      appointmentEnd: validated.appointmentData?.end || conv.appointmentEnd || "",
    };
  } catch (error) {
    archiveConversationToInactive({
      conversationId: conv.conversationId,
      reason: "appointment_not_active",
      latestAppointment: {
        appointmentId: conv.appointmentId,
        error: error?.message || "",
      },
    }).catch(() => {});

        return null;
      }
    }

      const appointmentSnap = await db
        .collection("appointments")
        .where("clientId", "==", conv.clientUid)
        .where("expertId", "==", conv.providerUid)
        .limit(20)
        .get();

      const serviceAppointments = appointmentSnap.docs
        .map((d) => d.data() || {})
        .filter((data) =>
          appointmentMatchesConversationService(data, conv.serviceId)
        );

      const nowMs = Date.now();
      const hasActiveAppointment = serviceAppointments.some((data) => {
        if (!isActiveAppointmentStatus(data.status)) return false;
        const endMs = parseAppointmentEndMs(data);
        return typeof endMs === "number" && endMs >= nowMs;
      });

      if (hasActiveAppointment) return conv;

      const latest = pickLatestRelevantAppointment(serviceAppointments, conv.serviceId);
      const latestStatus = String(latest?.appointment?.status || "").trim();
      const latestEndMs = latest?.endMs ?? null;

      let reason = "no_active_appointment";
      if (latestStatus === "completed") reason = "appointment_completed";
      else if (latestStatus === "expired") reason = "appointment_expired";
      else if (latestStatus && latestEndMs && latestEndMs < nowMs) reason = "appointment_expired";

      archiveConversationToInactive({
        conversationId: conv.conversationId,
        reason,
        latestAppointment: latest
          ? { ...latest.appointment, endMs: latestEndMs, status: latestStatus }
          : null,
      }).catch(() => {});
      return null;
    })
  );

  const active = results.filter(Boolean);

  active.sort((a, b) => {
    const aTime = a.updatedAt?.toMillis ? a.updatedAt.toMillis() : 0;
    const bTime = b.updatedAt?.toMillis ? b.updatedAt.toMillis() : 0;
    return bTime - aTime;
  });

  return active;
}

async function getConversationMessages({ conversationId, currentUid }) {
  const conversationRef = db.collection("conversations").doc(conversationId);
  const conversationDoc = await conversationRef.get();

  if (!conversationDoc.exists) {
    throw new Error("Conversation bulunamadi.");
  }

  const conversationData = conversationDoc.data();

  if (!conversationData.participants.includes(currentUid)) {
    throw new Error("Forbidden");
  }

  const messagesSnapshot = await conversationRef
    .collection("messages")
    .orderBy("createdAt", "asc")
    .get();

  return messagesSnapshot.docs.map((doc) => ({
    messageId: doc.id,
    ...doc.data(),
  }));
}

async function sendMessage({
  conversationId,
  senderUid,
  text,
  replyToMessageId = null,
}) {
  const trimmedText = String(text || "").trim();

  if (!trimmedText) {
    throw new Error("Mesaj bos olamaz.");
  }

  const conversationRef = db.collection("conversations").doc(conversationId);
  const conversationDoc = await conversationRef.get();

  if (!conversationDoc.exists) {
    throw new Error("Conversation bulunamadi.");
  }

  const conversationData = conversationDoc.data();

  if (!conversationData.participants.includes(senderUid)) {
    throw new Error("Forbidden");
  }

  if (String(conversationData.status || "").trim() === "inactive") {
    throw new Error("Bu sohbet pasif. Mesaj gonderilemez.");
  }

  const { clientUid: convClientUid, providerUid: convProviderUid } = conversationData;
  
  const clientDoc = await db.collection("users").doc(convClientUid).get();
  const providerDoc = await db.collection("users").doc(convProviderUid).get();
  const isProviderToProvider = clientDoc.exists && providerDoc.exists && 
    clientDoc.data()?.userType === "PROVIDER" && providerDoc.data()?.userType === "PROVIDER";

  if (!isProviderToProvider) {
  if (conversationData.appointmentId) {
    await loadAndValidateAppointment({
      appointmentId: conversationData.appointmentId,
      clientUid: convClientUid,
      providerUid: convProviderUid,
      serviceId: conversationData.serviceId,
      requireActive: true,
    });
  } else {
    // LEGACY FALLBACK:
    // هذا الجزء يبقى فقط للمحادثات القديمة التي لا تحتوي appointmentId.
    const appointmentCheckSnap = await db
      .collection("appointments")
      .where("clientId", "==", convClientUid)
      .where("expertId", "==", convProviderUid)
      .get();

    const checkNow = new Date();

    const hasActiveAppointment = appointmentCheckSnap.docs.some((d) => {
      const data = d.data();

      if (!isActiveAppointmentStatus(data.status)) return false;

      if (!appointmentMatchesConversationService(data, conversationData.serviceId)) {
        return false;
      }

      const dateStr = data.date || "";
      const endStr = data.end || "23:59";

      if (!dateStr) return false;

      const appointmentEnd = new Date(`${dateStr}T${endStr}`);
      return appointmentEnd >= checkNow;
    });

    if (!hasActiveAppointment) {
      throw new Error(
        "Randevu tarihi gecmis veya aktif onaylanmis randevunuz bulunmuyor. Mesaj gonderilemiyor."
      );
    }
  }
}

  await enforceRateLimit({ conversationId, senderUid });

  const moderation = moderateMessage(trimmedText);

  if (!moderation.allowed) {
    await createModerationLog({
      conversationId,
      senderUid,
      originalText: trimmedText,
      sanitizedText: "",
      moderation,
    });

    throw new Error(moderation.reason || "Mesaj uygun degil.");
  }

  let replyTo = null;

  if (replyToMessageId) {
    const replyRef = conversationRef.collection("messages").doc(replyToMessageId);
    const replyDoc = await replyRef.get();

    if (!replyDoc.exists) {
      throw new Error("Reply yapilacak mesaj bulunamadi.");
    }

    const replyData = replyDoc.data() || {};

    replyTo = {
      messageId: replyDoc.id,
      senderUid: replyData.senderUid || null,
      text: getMessagePreviewText(replyData),
      createdAt: replyData.createdAt || null,
      type: replyData.type || "text",
      isDeleted: replyData.isDeleted === true || replyData.type === "deleted",
    };
  }

  const now = admin.firestore.FieldValue.serverTimestamp();
  const messageRef = conversationRef.collection("messages").doc();
  const finalText = moderation.sanitizedText;

  const messageData = {
    senderUid,
    text: finalText,
    createdAt: now,
    readBy: [senderUid],
    type: "text",
    replyTo,
    isDeleted: false,
    deletedAt: null,
    deletedBy: null,
    moderation: {
      action: moderation.action,
      riskLevel: moderation.riskLevel,
      matchedHardBlocked: moderation.matchedHardBlocked,
      matchedSensitive: moderation.matchedSensitive,
      entityMatches: moderation.entityMatches,
      normalizedText: moderation.normalizedText,
      filteredAt: now,
    },
  };

  await messageRef.set(messageData);

  const updateData = {
    lastMessage: finalText,
    lastMessageAt: now,
    updatedAt: now,
    lastSenderUid: senderUid,
  };

  if (senderUid === conversationData.clientUid) {
    updateData.unreadCountProvider =
      (conversationData.unreadCountProvider || 0) + 1;
  }

  if (senderUid === conversationData.providerUid) {
    updateData.unreadCountClient =
      (conversationData.unreadCountClient || 0) + 1;
  }

  await conversationRef.update(updateData);

  if (moderation.action !== "allow") {
    await createModerationLog({
      conversationId,
      senderUid,
      originalText: trimmedText,
      sanitizedText: finalText,
      moderation,
    });
  }

  return {
    messageId: messageRef.id,
    ...messageData,
  };
}

async function deleteMessage({ conversationId, messageId, currentUid }) {
  const conversationRef = db.collection("conversations").doc(conversationId);
  const messageRef = conversationRef.collection("messages").doc(messageId);

  const [conversationDoc, messageDoc] = await Promise.all([
    conversationRef.get(),
    messageRef.get(),
  ]);

  if (!conversationDoc.exists) {
    throw new Error("Conversation bulunamadi.");
  }

  const conversationData = conversationDoc.data();

  if (!conversationData.participants.includes(currentUid)) {
    throw new Error("Forbidden");
  }

  if (!messageDoc.exists) {
    throw new Error("Mesaj bulunamadi.");
  }

  const messageData = messageDoc.data() || {};

  if (messageData.senderUid !== currentUid) {
    throw new Error("Forbidden");
  }

  if (messageData.isDeleted === true || messageData.type === "deleted") {
    throw new Error("Mesaj zaten silinmis.");
  }

  const now = admin.firestore.FieldValue.serverTimestamp();
  const deletedRef = db.collection("deleted_conversations").doc();

  await deletedRef.set({

    // 13-05 Edrees solved
    appointmentId: conversationData.appointmentId || null,
    appointmentDate: conversationData.appointmentDate || "",
    appointmentStart: conversationData.appointmentStart || "",
    appointmentEnd: conversationData.appointmentEnd || "",

    conversationId,
    originalMessageId: messageId,
    deletedBy: currentUid,
    deletedAt: now,
    expiresAt: getDeletedConversationExpiryTimestamp(),
    retentionDays: DELETED_CONVERSATION_RETENTION_DAYS,
    pendingPermanentDeletion: true,
    participants: conversationData.participants || [],
    clientUid: conversationData.clientUid || null,
    providerUid: conversationData.providerUid || null,
    serviceId: conversationData.serviceId || null,
    serviceTitle: conversationData.serviceTitle || "",
    originalMessage: {
      ...messageData,
    },
  });

  await messageRef.update({
    text: "",
    type: "deleted",
    isDeleted: true,
    deletedAt: now,
    deletedBy: currentUid,
  });

  const latestMessageSnapshot = await conversationRef
    .collection("messages")
    .orderBy("createdAt", "desc")
    .limit(1)
    .get();

  const conversationUpdate = {
    updatedAt: now,
  };

  if (
    !latestMessageSnapshot.empty &&
    latestMessageSnapshot.docs[0].id === messageId
  ) {
    conversationUpdate.lastMessage = "Bu mesaj silindi";
    conversationUpdate.lastMessageAt = now;
    conversationUpdate.lastSenderUid = messageData.senderUid || null;
  }

  await conversationRef.update(conversationUpdate);

  return {
    success: true,
    messageId,
    status: "deleted",
  };
}

async function markConversationAsRead({ conversationId, currentUid }) {
  const conversationRef = db.collection("conversations").doc(conversationId);
  const conversationDoc = await conversationRef.get();

  if (!conversationDoc.exists) {
    throw new Error("Conversation bulunamadi.");
  }

  const conversationData = conversationDoc.data();

  if (!conversationData.participants.includes(currentUid)) {
    throw new Error("Forbidden");
  }

  const updateData = {};

  if (currentUid === conversationData.clientUid) {
    updateData.unreadCountClient = 0;
  }

  if (currentUid === conversationData.providerUid) {
    updateData.unreadCountProvider = 0;
  }

  await conversationRef.update(updateData);

  return { success: true };
}

async function closeConversation({ conversationId, currentUid }) {
  const id = String(conversationId || "").trim();
  if (!id) throw new Error("Geçersiz conversationId.");

  const conversationRef = db.collection("conversations").doc(id);
  const conversationDoc = await conversationRef.get();

  if (!conversationDoc.exists) {
    throw new Error("Conversation bulunamadi.");
  }

  const data = conversationDoc.data() || {};
  if (!Array.isArray(data.participants) || !data.participants.includes(currentUid)) {
    throw new Error("Forbidden");
  }

  const result = await archiveConversationToInactive({
    conversationId: id,
    reason: "manual_close",
    latestAppointment: data.latestAppointment || null,
  });

  if (!result?.ok) {
    throw new Error(result?.message || "Sohbet kapatilamadi.");
  }

  return { success: true };
}

module.exports = {
  getOrCreateConversation,
  getUserConversations,
  getConversationMessages,
  sendMessage,
  deleteMessage,
  markConversationAsRead,
  closeConversation,
};