// backend/scripts/resetAdminPassword.js

require("dotenv").config({ path: require("path").join(__dirname, "../.env") });

const { admin } = require("../firebaseAdmin");

async function resetAdminPassword() {
  const uid = "2F4xncPhBKe44lEAQse2Le05X1T2";

  await admin.auth().updateUser(uid, {
    password: "adminDeneme.11",
  });

  console.log("Admin password updated successfully.");
}

resetAdminPassword().catch((error) => {
  console.error("Failed to update password:", error);
  process.exit(1);
});