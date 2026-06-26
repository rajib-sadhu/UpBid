import { config } from "dotenv";
import { resolve } from "node:path";
import { z } from "zod";

// Load the repo-root .env (server runs with cwd = ./server).
config({ path: resolve(process.cwd(), "../.env") });

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
  // Absolute path to the upload dir (relative to the server cwd = ./server).
  uploadDir: resolve(process.cwd(), e.UPLOAD_DIR),
} as const;
