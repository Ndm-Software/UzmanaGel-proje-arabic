// backend/scripts/resetUserPassword.js

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

const { admin, db } = require("../firebaseAdmin");

async function getAuthUser(identifier) {
  const value = String(identifier || "").trim();

  if (!value) {
    throw new Error("User email or uid is required.");
  }

  if (value.includes("@")) {
    return admin.auth().getUserByEmail(value);
  }

  return admin.auth().getUser(value);
}

async function resetUserPassword() {
  const identifier = process.argv[2]; // email or uid
  const newPassword = process.argv[3]; // new password
  const expectedUserType = process.argv[4]
    ? String(process.argv[4]).trim().toUpperCase()
    : null;

  if (!identifier || !newPassword) {
    throw new Error(
      "Usage: node scripts/resetUserPassword.js <email-or-uid> <new-password> [CLIENT|PROVIDER|ADMIN]"
    );
  }

  const authUser = await getAuthUser(identifier);

  const userSnap = await db.collection("users").doc(authUser.uid).get();
  const firestoreUser = userSnap.exists ? userSnap.data() : null;
  const actualUserType = String(firestoreUser?.userType || "").toUpperCase();

  if (expectedUserType && actualUserType !== expectedUserType) {
    throw new Error(
      `User type mismatch. Expected ${expectedUserType}, but found ${actualUserType || "UNKNOWN"}.`
    );
  }

  await admin.auth().updateUser(authUser.uid, {
    password: newPassword,
  });

  console.log("Password updated successfully.");
  console.log({
    uid: authUser.uid,
    email: authUser.email,
    displayName: authUser.displayName || null,
    userType: actualUserType || null,
  });
}

resetUserPassword().catch((error) => {
  console.error("Failed to update password:", error.message);
  process.exit(1);
});