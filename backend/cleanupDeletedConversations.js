const { db } = require("./firebaseAdmin");

const isDevelopment = process.env.NODE_ENV === 'development';

async function cleanupDeletedConversations() {
  try {
    const now = new Date();

    const snapshot = await db
      .collection("deleted_conversations")
      .where("pendingPermanentDeletion", "==", true)
      .where("expiresAt", "<=", now)
      .limit(400)
      .get();

    if (snapshot.empty) {
      if (isDevelopment) {
        console.log("No deleted conversations ready for permanent cleanup.");
      }
      return;
    }

    const batch = db.batch();

    snapshot.docs.forEach((docSnap) => {
      batch.delete(docSnap.ref);
    });

    await batch.commit();

    if (isDevelopment) {
      console.log(
        `Deleted conversations cleanup completed. Deleted ${snapshot.size} item(s).`
      );
    }
  } catch (error) {
    if (isDevelopment) {
      console.error(
        "cleanupDeletedConversations failed:",
        error?.message || error
      );
    }
  }
}

module.exports = { cleanupDeletedConversations };
