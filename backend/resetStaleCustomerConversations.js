const { admin, db } = require("./firebaseAdmin");
const { archiveConversationToInactive } = require("./chatArchive");

const isDevelopment = process.env.NODE_ENV === "development";

function normalizeServiceId(value) {
  return String(value || "").trim();
}

function appointmentMatchesService(appointmentData, serviceId) {
  const appointmentServiceId = normalizeServiceId(
    appointmentData?.listingId || appointmentData?.serviceId
  );
  return (
    appointmentServiceId &&
    appointmentServiceId === normalizeServiceId(serviceId)
  );
}

function parseAppointmentEndMs(appointmentData) {
  const dateStr = String(appointmentData?.date || "").trim();
  const endStr = String(appointmentData?.end || "23:59").trim();
  if (!dateStr) return null;
  const d = new Date(`${dateStr}T${endStr}`);
  const ms = d.getTime();
  return Number.isNaN(ms) ? null : ms;
}

function hasActiveApprovedAppointment(appointments, serviceId, nowMs) {
  return (appointments || []).some((a) => {
    if (!a) return false;
    if (a.status !== "approved") return false;
    if (!appointmentMatchesService(a, serviceId)) return false;
    const endMs = parseAppointmentEndMs(a);
    return typeof endMs === "number" && endMs >= nowMs;
  });
}

function pickLatestRelevantAppointment(appointments, serviceId) {
  let best = null;
  let bestEnd = -1;

  (appointments || []).forEach((a) => {
    if (!a) return;
    if (!appointmentMatchesService(a, serviceId)) return;
    const endMs = parseAppointmentEndMs(a);
    if (typeof endMs !== "number") return;
    if (endMs > bestEnd) {
      bestEnd = endMs;
      best = a;
    }
  });

  return best ? { appointment: best, endMs: bestEnd } : null;
}

function isCustomerStaleStatus(status) {
  const s = String(status || "").trim();
  if (!s) return false;

  // “Uzman gitti, müşteri yok, kod eşleşmedi” senaryosunda genelde completed'a ulaşmıyor.
  // Ayrıca approved/expired/cancelled_by_customer gibi müşteri kaynaklı veya “açıkta kalmış”
  // durumları da ertesi gün resetlemek istiyoruz.
  return [
    "approved",
    "expired",
    "cancelled_by_customer",
    "reschedule_rejected_by_customer",
    "expert_at_door",
    "in_progress",
    "finishing",
  ].includes(s);
}

async function deleteConversationWithMessages(conversationId) {
  const conversationRef = db.collection("conversations").doc(conversationId);
  const messagesRef = conversationRef.collection("messages");

  // messages alt-koleksiyonunu sayfalı olarak sil (batch <= 500)
  while (true) {
    const snap = await messagesRef.limit(400).get();
    if (snap.empty) break;

    const batch = db.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }

  await conversationRef.delete();
}

async function resetStaleCustomerConversations({
  dryRun = false,
  pageSize = 200,
  maxToDelete = 2000,
} = {}) {
  const nowMs = Date.now();
  const docId = admin.firestore.FieldPath.documentId();

  let lastDoc = null;
  let scanned = 0;
  let archived = 0;
  let kept = 0;
  let skipped = 0;

  while (true) {
    let q = db.collection("conversations").orderBy(docId).limit(pageSize);
    if (lastDoc) q = q.startAfter(lastDoc);

    const snapshot = await q.get();
    if (snapshot.empty) break;

    for (const docSnap of snapshot.docs) {
      scanned += 1;
      lastDoc = docSnap;

      const conv = docSnap.data() || {};
      const conversationId = docSnap.id;

      const clientUid = String(conv.clientUid || "").trim();
      const providerUid = String(conv.providerUid || "").trim();
      const serviceId = String(conv.serviceId || "").trim();

      if (!clientUid || !providerUid || !serviceId) {
        skipped += 1;
        continue;
      }

      let appointmentDocs = [];
      try {
        const appointmentSnap = await db
          .collection("appointments")
          .where("clientId", "==", clientUid)
          .where("expertId", "==", providerUid)
          .limit(50)
          .get();
        appointmentDocs = appointmentSnap.docs.map((d) => d.data() || {});
      } catch (error) {
        skipped += 1;
        if (isDevelopment) {
          console.warn(
            "[CHAT RESET] appointments read failed:",
            conversationId,
            error?.message || error
          );
        }
        continue;
      }

      if (hasActiveApprovedAppointment(appointmentDocs, serviceId, nowMs)) {
        kept += 1;
        continue;
      }

      const latest = pickLatestRelevantAppointment(appointmentDocs, serviceId);
      if (!latest) {
        kept += 1;
        continue;
      }

      const status = String(latest.appointment?.status || "").trim();
      if (status === "completed") {
        kept += 1;
        continue;
      }

      if (!(latest.endMs < nowMs)) {
        kept += 1;
        continue;
      }

      if (!isCustomerStaleStatus(status)) {
        kept += 1;
        continue;
      }

      if (deleted >= maxToDelete) {
        if (isDevelopment) {
          console.log(
            `[CHAT RESET] maxToDelete reached (${maxToDelete}), stopping early.`
          );
        }
        return { scanned, archived, kept, skipped, stoppedByLimit: true };
      }

      if (dryRun) {
        archived += 1;
        if (isDevelopment) {
          console.log("[CHAT RESET][DRY RUN] would archive:", {
            conversationId,
            clientUid,
            providerUid,
            serviceId,
            latestStatus: status,
            latestEndMs: latest.endMs,
          });
        }
        continue;
      }

      try {
        await archiveConversationToInactive({
          conversationId,
          reason: "customer_stale",
          latestAppointment: {
            ...latest.appointment,
            endMs: latest.endMs,
            status,
          },
        });
        archived += 1;
      } catch (error) {
        skipped += 1;
        if (isDevelopment) {
          console.warn(
            "[CHAT RESET] archive failed:",
            conversationId,
            error?.message || error
          );
        }
      }
    }
  }

  return { scanned, archived, kept, skipped, stoppedByLimit: false };
}

module.exports = { resetStaleCustomerConversations };

