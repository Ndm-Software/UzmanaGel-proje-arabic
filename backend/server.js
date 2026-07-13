// backend/server.js
// Process entry point — environment loading and HTTP listen only.
// All application logic (middleware, routes, cron) lives in app.js.

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });

const app = require("./app");
const { startJobs } = require("./jobs");

const PORT = process.env.PORT || 5000;
const isDevelopment = process.env.NODE_ENV === "development";

app.listen(PORT, () => {
  if (isDevelopment) console.log(`API listening on http://localhost:${PORT}`);
  startJobs();
});