import { defineConfig, devices } from "@playwright/test";
import { config } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { e2eDatabaseUrl } from "./fixtures.js";

// E2E happy paths (build-plan Phase 9) against the production single-server:
// prepare.ts builds all workspaces + seeds the dedicated `<db>_e2e` database,
// then Express serves the built SPA, /api and Socket.io from one port — the
// same topology as a real deployment (Phase 10).

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
config({ path: resolve(root, ".env") });

const PORT = 4123;
const dbUrl = e2eDatabaseUrl(process.env.DATABASE_URL);

export default defineConfig({
  testDir: ".",
  testMatch: "**/*.spec.ts",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  // The two specs share one seeded database — keep them serial.
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["github"]] : [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npx tsx e2e/prepare.ts && node server/dist/index.js",
    cwd: root,
    url: `http://localhost:${PORT}/api/health`,
    timeout: 300_000,
    reuseExistingServer: false,
    env: {
      NODE_ENV: "production",
      PORT: String(PORT),
      DATABASE_URL: dbUrl,
      CLIENT_ORIGIN: `http://localhost:${PORT}`,
      // Dedicated secrets satisfying the production boot guards (the root .env
      // dev values may be placeholders the server now refuses).
      JWT_SECRET: "e2e-only-jwt-secret-0123456789",
      PEPPER: process.env.PEPPER || "e2e-only-pepper",
      UPLOAD_DIR: resolve(root, "uploads"),
    },
  },
});
