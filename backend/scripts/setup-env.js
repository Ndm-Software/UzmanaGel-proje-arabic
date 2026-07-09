const fs = require("fs");
const path = require("path");

const rootDir = path.resolve(__dirname, "..");
const envPath = path.join(rootDir, ".env");
const envExamplePath = path.join(rootDir, ".env.example");

function fail(message) {
  console.error(`setup-env error: ${message}`);
  process.exit(1);
}

if (!fs.existsSync(envExamplePath)) {
  fail(".env.example not found in backend root.");
}

if (fs.existsSync(envPath)) {
  console.log(".env already exists. Skipping.");
  process.exit(0);
}

fs.copyFileSync(envExamplePath, envPath);
console.log("Created .env from .env.example");
console.log("Fill FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY before running the server.");
