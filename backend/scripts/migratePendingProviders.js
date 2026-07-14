/**
 * migratePendingProviders.js
 *
 * One-time migration: converts completed PENDING_PROVIDER accounts to active PROVIDER accounts.
 *
 * TARGETS: Arabic Firebase project (khabiir) ONLY.
 * SAFETY: Dry-run mode by default. Pass --apply to apply changes.
 *
 * Criteria to migrate:
 *   users/{uid}.userType === "PENDING_PROVIDER"
 *   users/{uid}.profileCompleted === true
 *
 * Changes to users/{uid}:
 *   userType         -> "PROVIDER"
 *   isActive         -> true
 *   approvalStatus   -> "APPROVED"
 *   approvalMethod   -> "AUTO"
 *   approvedAt       -> current ISO timestamp
 *   updatedAt        -> current ISO timestamp
 *
 * Changes to service_providers/{uid} (if document exists):
 *   isActive         -> true
 *   profileCompleted -> true
 *   approvalStatus   -> "APPROVED"
 *   approvalMethod   -> "AUTO"
 *   approvedAt       -> current ISO timestamp
 *   updatedAt        -> current ISO timestamp
 *
 * Usage:
 *   # Dry run (no changes applied):
 *   node backend/scripts/migratePendingProviders.js
 *
 *   # Apply changes:
 *   node backend/scripts/migratePendingProviders.js --apply
 *
 * IMPORTANT: Set GOOGLE_APPLICATION_CREDENTIALS to your Arabic Firebase
 * service-account JSON path (do NOT commit the key file to the repo).
 *
 * Example:
 *   $env:GOOGLE_APPLICATION_CREDENTIALS="C:\keys\khabiir-arabic-sa.json"
 *   node backend/scripts/migratePendingProviders.js --apply
 */

const admin = require("firebase-admin");

const DRY_RUN = !process.argv.includes("--apply");

if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  console.error(
    "ERROR: GOOGLE_APPLICATION_CREDENTIALS environment variable is not set.\n" +
      "Set it to the path of your Arabic Firebase service-account JSON file.\n" +
      "Do NOT commit the key file to the repository."
  );
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
});

const db = admin.firestore();

async function migrate() {
  const now = new Date().toISOString();
  const mode = DRY_RUN ? "[DRY RUN]" : "[APPLY]";

  console.log(`\n${mode} Starting migration at ${now}`);
  if (DRY_RUN) {
    console.log(
      "  NOTE: No changes will be written. Pass --apply to apply changes.\n"
    );
  }

  // Query: users where userType == "PENDING_PROVIDER" AND profileCompleted == true
  const usersSnap = await db
    .collection("users")
    .where("userType", "==", "PENDING_PROVIDER")
    .where("profileCompleted", "==", true)
    .get();

  if (usersSnap.empty) {
    console.log("No completed PENDING_PROVIDER accounts found. Nothing to migrate.");
    await admin.app().delete();
    return;
  }

  console.log(`Found ${usersSnap.size} completed PENDING_PROVIDER account(s) to migrate:\n`);

  let successCount = 0;
  let skipCount = 0;
  let errorCount = 0;

  for (const userDoc of usersSnap.docs) {
    const uid = userDoc.id;
    const data = userDoc.data();

    // Safety: double-check criteria (Firestore index may not be immediately consistent)
    if (data.userType !== "PENDING_PROVIDER" || data.profileCompleted !== true) {
      console.log(`  SKIP uid=${uid} — criteria not met (userType=${data.userType}, profileCompleted=${data.profileCompleted})`);
      skipCount++;
      continue;
    }

    // Also skip CLIENT or ADMIN accounts (should not happen given query, but be safe)
    if (data.userType === "CLIENT" || data.userType === "ADMIN") {
      console.log(`  SKIP uid=${uid} — is a ${data.userType} account, not modifying.`);
      skipCount++;
      continue;
    }

    const userUpdate = {
      userType: "PROVIDER",
      isActive: true,
      approvalStatus: "APPROVED",
      approvalMethod: "AUTO",
      approvedAt: now,
      updatedAt: now,
    };

    const providerUpdate = {
      isActive: true,
      profileCompleted: true,
      approvalStatus: "APPROVED",
      approvalMethod: "AUTO",
      approvedAt: now,
      updatedAt: now,
    };

    console.log(`  ${mode} uid=${uid} (${data.displayName || data.email || "unknown"})`);
    console.log(`    users update:             ${JSON.stringify(userUpdate)}`);

    try {
      // Check if service_providers document exists
      const providerSnap = await db.collection("service_providers").doc(uid).get();
      const hasProviderDoc = providerSnap.exists;

      if (hasProviderDoc) {
        console.log(`    service_providers update: ${JSON.stringify(providerUpdate)}`);
      } else {
        console.log(`    service_providers/{uid}: document NOT FOUND — will skip provider update.`);
      }

      if (!DRY_RUN) {
        const batch = db.batch();

        batch.update(db.collection("users").doc(uid), userUpdate);

        if (hasProviderDoc) {
          batch.update(db.collection("service_providers").doc(uid), providerUpdate);
        }

        await batch.commit();
        console.log(`    ✓ DONE`);
      } else {
        console.log(`    ✓ Would update (dry run)`);
      }

      successCount++;
    } catch (error) {
      console.error(`    ✗ ERROR for uid=${uid}: ${error.message}`);
      errorCount++;
    }
  }

  console.log(`\n${mode} Migration summary:`);
  console.log(`  Total found:   ${usersSnap.size}`);
  console.log(`  Migrated:      ${successCount}`);
  console.log(`  Skipped:       ${skipCount}`);
  console.log(`  Errors:        ${errorCount}`);

  if (DRY_RUN) {
    console.log(`\n  To apply these changes, run with --apply flag.`);
  } else {
    console.log(`\n  Migration complete.`);
  }

  await admin.app().delete();
}

migrate().catch((error) => {
  console.error("Fatal migration error:", error);
  process.exit(1);
});
