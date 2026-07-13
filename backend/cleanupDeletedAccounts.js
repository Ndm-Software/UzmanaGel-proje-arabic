// cleanupDeletedAccounts.js

const { admin, db } = require("./firebaseAdmin");

const isDevelopment = process.env.NODE_ENV === "development";

async function deleteStoragePrefix(bucket, prefix, failedItems = []) {
  try {
    const [files] = await bucket.getFiles({ prefix });

    for (const file of files) {
      await file.delete();
    }

    return files.length;
  } catch (error) {
    failedItems.push(`${prefix}: ${error?.message || error}`);
    return 0;
  }
}

async function cleanupDeletedAccounts() {
  try {
    const now = new Date();

    const snapshot = await db
      .collection("deleted_accounts")
      .where("pendingPermanentDeletion", "==", true)
      .where("restorationRequested", "==", false)
      .where("scheduledPermanentDeletionAt", "<=", now)
      .get();

    if (snapshot.empty) {
      if (isDevelopment) {
        console.log("No deleted accounts ready for permanent cleanup.");
      }
      return;
    }

    const bucket = admin.storage().bucket();
    const batch = db.batch();

    for (const docSnap of snapshot.docs) {
      const data = docSnap.data() || {};
      const uid = data.uid || docSnap.id;
      const userType = data.userType || null;
      const failedItems = [];

      let deletedFileCount = 0;

      deletedFileCount += await deleteStoragePrefix(
        bucket,
        `profile_photos/${uid}`,
        failedItems
      );

      if (userType === "PROVIDER") {
        deletedFileCount += await deleteStoragePrefix(
          bucket,
          `expert_documents/${uid}/`,
          failedItems
        );

        deletedFileCount += await deleteStoragePrefix(
          bucket,
          `portfolio/${uid}/`,
          failedItems
        );

        const deletedListings = Array.isArray(data.deletedListings)
          ? data.deletedListings
          : [];

        for (const listing of deletedListings) {
          const listingId = String(listing?.id || "").trim();
          if (!listingId) continue;

          deletedFileCount += await deleteStoragePrefix(
            bucket,
            `service_images/${listingId}/`,
            failedItems
          );
        }
      }

      if (failedItems.length > 0) {
        await docSnap.ref.set(
          {
            permanentCleanupStorageErrors: failedItems,
            permanentCleanupAttemptedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );

        if (isDevelopment) {
          console.warn(
            `Storage cleanup had errors for ${uid}:`,
            failedItems
          );
        }
      }

      try {
        await admin.auth().deleteUser(uid);
        } catch (error) {
        if (error?.code !== "auth/user-not-found") {
          failedItems.push(`auth/${uid}: ${error?.message || error}`);
        }
      }

      batch.delete(docSnap.ref);

      if (isDevelopment) {
        console.log(
          `Scheduled permanent cleanup for ${uid}. Deleted files: ${deletedFileCount}`
        );
      }
    }

    await batch.commit();

    if (isDevelopment) {
      console.log(
        `Permanent cleanup completed. Deleted ${snapshot.size} account archive document(s).`
      );
    }
  } catch (error) {
    if (isDevelopment) {
      console.error(
        "cleanupDeletedAccounts failed:",
        error?.message || error
      );
    }
  }
}

module.exports = { cleanupDeletedAccounts };