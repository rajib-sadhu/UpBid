import { config } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

// Load the repo-root .env. In dev the server runs with cwd = ./server (so the
// root file is one level up); production hosts (systemd, Passenger) usually
// launch from the app root itself — try both. dotenv never overrides vars that
// are already set, so real environment variables always win.
config({ path: resolve(process.cwd(), "../.env") });
config({ path: resolve(process.cwd(), ".env") });

const envSchema = z.object({
  NODE_ENV: z.string().default("development"),
  PORT: z.coerce.number().default(4000),
  CLIENT_ORIGIN: z.string().default("http://localhost:5173"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  JWT_SECRET: z.string().min(1, "JWT_SECRET is required"),
  JWT_EXPIRES_IN: z.string().default("7d"),
  PEPPER: z.string().default(""),
  UPLOAD_DIR: z.string().default("../uploads"),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error("[env] Invalid environment configuration:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

const e = parsed.data;

// Refuse to boot production with placeholder or missing secrets: a guessable
// JWT_SECRET forges any session, and an empty PEPPER silently voids the
// "leaked DB can't be brute-forced" guarantee (retrofitting one later would
// invalidate every existing password hash).
if (e.NODE_ENV === "production") {
  const placeholders = ["change-me-in-production", "dev-only-change-me"];
  if (placeholders.includes(e.JWT_SECRET) || e.JWT_SECRET.length < 16) {
    console.error("[env] JWT_SECRET is a placeholder or shorter than 16 chars — set a strong secret");
    process.exit(1);
  }
  if (e.PEPPER.length === 0) {
    console.error("[env] PEPPER must be set in production before any account is created");
    process.exit(1);
  }
}

export const env = {
  nodeEnv: e.NODE_ENV,
  port: e.PORT,
  clientOrigins: e.CLIENT_ORIGIN.split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  databaseUrl: e.DATABASE_URL,
  jwtSecret: e.JWT_SECRET,
  jwtExpiresIn: e.JWT_EXPIRES_IN,
  pepper: e.PEPPER,
  // Absolute path to the upload dir. Resolved against the server package dir
  // (this file lives in server/src or server/dist) rather than process.cwd(),
  // so the default "../uploads" = <app-root>/uploads no matter which directory
  // the host launches Node from (npm start at the root, systemd, Passenger…).
  uploadDir: resolve(dirname(fileURLToPath(import.meta.url)), "..", e.UPLOAD_DIR),
} as const;
