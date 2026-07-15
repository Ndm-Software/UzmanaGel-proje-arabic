/**
 * HOW TO RUN THIS SCRIPT:
 * 
 * 1. Navigate to your backend directory:
 *    cd backend
 * 
 * 2. Run the script with Node (loading your env variables):
 *    node --env-file=.env scripts/setAdminClaims.js admin@hotmail.com
 * 
 * Note: The targeted user must log out and log back in for changes to take effect.
 */
const { admin, db } = require("../config/firebaseAdmin");

async function setAdminClaims(email) {
  try {
    if (!email) {
      throw new Error("email is required");
    }
    // 1. Fetch the user automatically via their email
    const userRecord = await admin.auth().getUserByEmail(email);
    const uid = userRecord.uid;

    await admin.auth().setCustomUserClaims(uid, {
      admin: true,
      isAdmin: true,
      userType: "ADMIN", // Changed from true to "ADMIN"
    });

    await db.collection("users").doc(uid).set(
      {
        userType: "ADMIN", // Replaced the undefined 'role' variable with "ADMIN"
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );

    console.log(`Custom claims updated for ${uid}:`, {
      admin: true,
      isAdmin: true,
      userType: "ADMIN",
    });
  } catch (error) {
    console.error("Failed to set admin claims:", error);
    process.exitCode = 1;
  }
}

const email = process.argv[2];

if (!email) {
  console.error("Usage: node scripts/setAdminClaims.js <admin-email>");
  process.exit(1);
}

setAdminClaims(email);