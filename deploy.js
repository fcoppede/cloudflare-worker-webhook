import { execSync } from "child_process";
import dotenv from "dotenv";

dotenv.config(); // loads .env into process.env

const secrets = ["SIGNING_KEY"]; // list of env vars to sync
for (const key of secrets) {
  if (process.env[key]) {
    try {
      execSync(
        `echo ${process.env[key]} | npx wrangler secret put ${key}`,
        { stdio: "inherit" }
      );
      console.log(`🔐 Secret ${key} synced`);
    } catch (err) {
      console.error(`❌ Failed to sync secret ${key}`, err);
    }
  }
}

try {
  execSync("npx wrangler deploy", { stdio: "inherit" });
  console.log("🚀 Deployment complete!");
} catch (err) {
  console.error("❌ Deployment failed", err);
}
