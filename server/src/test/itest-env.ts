import { itestDatabaseUrl } from "./db-url.js";

// Runs before each integration-test file is imported: repoint the Prisma
// singleton (src/lib/prisma.ts reads DATABASE_URL at construction) at the
// dedicated `_itest` database prepared by global-setup.
process.env.DATABASE_URL = itestDatabaseUrl();
process.env.NODE_ENV = "test";
