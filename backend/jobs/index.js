// backend/jobs/index.js
// Extracted cron job scheduling (Step 10).

const cron = require("node-cron");
const { cleanupDeletedAccounts } = require("../cleanupDeletedAccounts");
const { cleanupDeletedConversations } = require("../cleanupDeletedConversations");
const { resetStaleCustomerConversations } = require("../resetStaleCustomerConversations");

const isDevelopment = process.env.NODE_ENV === "development";

let jobsStarted = false;

function startJobs() {
  if (jobsStarted) {
    if (isDevelopment) console.log("Cron jobs already started. Skipping duplicate start.");
    return;
  }

  if (isDevelopment) console.log("Starting cron jobs...");

  cron.schedule("0 3 * * *", async () => {
    if (isDevelopment) console.log("Running deleted accounts cleanup job...");
    await cleanupDeletedAccounts();
    if (isDevelopment) console.log("Running deleted conversations cleanup job...");
    await cleanupDeletedConversations();
  });

  cron.schedule(
    "0 0 * * *",
    async () => {
      if (isDevelopment) console.log("Running stale customer chat reset job...");
      const result = await resetStaleCustomerConversations({ dryRun: false });
      if (isDevelopment) console.log("Stale customer chat reset result:", result);
    },
    { timezone: "Europe/Istanbul" }
  );

  jobsStarted = true;
}

module.exports = { startJobs };
