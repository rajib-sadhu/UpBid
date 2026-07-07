import { config } from "dotenv";
import { resolve } from "node:path";

/**
 * Resolve the integration-test database URL. Integration tests never run
 * against the real DATABASE_URL: unless ITEST_DATABASE_URL is set explicitly,
 * the database name is suffixed with `_itest` (created and force-reset by the
 * vitest global setup). Loads the repo-root .env the same way src/env.ts does.
 */
export function itestDatabaseUrl(): string {
  config({ path: resolve(process.cwd(), "../.env") });

  const explicit = process.env.ITEST_DATABASE_URL;
  if (explicit) return explicit;

  const base = process.env.DATABASE_URL;
  if (!base) {
    throw new Error("DATABASE_URL is required to derive the integration-test database");
  }
  const url = new URL(base);
  const dbName = url.pathname.replace(/^\//, "");
  if (!dbName) throw new Error(`DATABASE_URL has no database name: ${base}`);
  url.pathname = `/${dbName}_itest`;
  return url.toString();
}
