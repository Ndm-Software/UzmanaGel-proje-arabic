const { admin, db } = require("../config/firebaseAdmin");

const isDevelopment = process.env.NODE_ENV === "development";

function normalizeArchiveReason(value) {
  const r = String(value || "").trim();
  return r || "inactive";
}

async function archiveConversationToInactive({
  conversationId,
  reason,
  latestAppointment = null,
} = {}) {
  const id = String(conversationId || "").trim();
  if (!id) throw new Error("conversationId gereklidir.");

  const archiveReason = normalizeArchiveReason(reason);

  const conversationRef = db.collection("conversations").doc(id);
  const inactiveRef = db.collection("inactive_conversations").doc(id);

  const conversationDoc = await conversationRef.get();
  if (!conversationDoc.exists) return { ok: false, code: "NOT_FOUND" };

  const conversationData = conversationDoc.data() || {};

  if (String(conversationData.status || "").trim() === "inactive") {
    return { ok: true, code: "ALREADY_INACTIVE" };
  }

  try {
    const existingInactive = await inactiveRef.get();
    if (!existingInactive.exists) {
      const messagesSnap = await conversationRef.collection("messages").get();
      const messages = messagesSnap.docs.map((d) => ({
        messageId: d.id,
        ...d.data(),
      }));

      await inactiveRef.set({
        conversationId: id,
        ...conversationData,
        messages,
        archivedAt: admin.firestore.FieldValue.serverTimestamp(),
        archiveReason,
        latestAppointment: latestAppointment || null,
        source: "conversations",
      });
    }

    await conversationRef.set(
      {
        status: "inactive",
        archivedAt: admin.firestore.FieldValue.serverTimestamp(),
        archiveReason,
        latestAppointment: latestAppointment || null,
      },
      { merge: true }
    );

    return { ok: true, code: "ARCHIVED" };
  } catch (error) {
    if (isDevelopment) {
      console.error("[CHAT ARCHIVE] failed:", {
        conversationId: id,
        reason: archiveReason,
        message: error?.message || String(error),
      });
    }
    return { ok: false, code: "FAILED", message: error?.message || String(error) };
  }
}

module.exports = { archiveConversationToInactive };

