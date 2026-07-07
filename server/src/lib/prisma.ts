import { PrismaClient } from "@prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";

// Single PrismaClient across the process (and across HMR reloads in dev, where
// the module graph is re-evaluated and would otherwise leak connections).
// Queries run through the pure-JS mariadb driver adapter (no Rust query
// engine): shared hosts (CloudLinux LVE limits) kill the native engines.
// DATABASE_URL is loaded by src/env.ts (or the test setup) before this module.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    // The placeholder keeps construction valid where no DB is configured
    // (unit tests) — the pool only connects on the first real query.
    adapter: new PrismaMariaDb(
      process.env.DATABASE_URL ?? "mariadb://unset:unset@localhost:3306/unset",
    ),
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
