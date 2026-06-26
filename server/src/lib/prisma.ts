import { PrismaClient } from "@prisma/client";

// Single PrismaClient across the process (and across HMR reloads in dev, where
// the module graph is re-evaluated and would otherwise leak connections).
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
