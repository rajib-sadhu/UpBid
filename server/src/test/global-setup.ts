import { execSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { itestDatabaseUrl } from "./db-url.js";

const serverRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

/** Single-connection pool: SET FOREIGN_KEY_CHECKS is session state, and a
 *  pooled adapter would run the TRUNCATEs on different connections. */
function singleConnAdapter(url: string): PrismaMariaDb {
  const u = new URL(url);
  return new PrismaMariaDb({
    host: u.hostname,
    port: Number(u.port || 3306),
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: u.pathname.slice(1),
    connectionLimit: 1,
  });
}


/**
 * Vitest global setup for the integration suite: sync the Prisma schema onto
 * the dedicated `_itest` database (created on first run), then empty every
 * table so each run starts clean. Refuses to touch the primary DATABASE_URL.
 */
export default async function setup(): Promise<void> {
  const testUrl = itestDatabaseUrl();
  const dbName = new URL(testUrl).pathname.slice(1);
  if (!dbName.endsWith("_itest")) {
    throw new Error(`Refusing to run integration tests against non-itest database "${dbName}"`);
  }
  console.log(`[itest] syncing schema onto ${dbName}`);
  execSync("npx prisma db push --skip-generate", {
    cwd: serverRoot,
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: testUrl },
  });

  console.log(`[itest] emptying ${dbName}`);
  const prisma = new PrismaClient({ adapter: singleConnAdapter(testUrl) });
  try {
    // CAST: the mariadb driver adapter returns information_schema identifiers
    // as raw bytes; force them to text.
    const tables = await prisma.$queryRaw<{ TABLE_NAME: string }[]>`
      SELECT CAST(TABLE_NAME AS CHAR) AS TABLE_NAME FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = ${dbName} AND TABLE_TYPE = 'BASE TABLE'
        AND TABLE_NAME <> '_prisma_migrations'`;
    await prisma.$executeRawUnsafe("SET FOREIGN_KEY_CHECKS = 0");
    for (const t of tables) {
      await prisma.$executeRawUnsafe(`TRUNCATE TABLE \`${t.TABLE_NAME}\``);
    }
    await prisma.$executeRawUnsafe("SET FOREIGN_KEY_CHECKS = 1");
  } finally {
    await prisma.$disconnect();
  }
}
