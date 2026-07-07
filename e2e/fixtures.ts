// Deterministic identities shared by e2e/prepare.ts (seeding) and the specs
// (selectors + logins). Everything lives in the dedicated `_e2e` database.

export const E2E = {
  organizer: { email: "organizer@e2e.local", password: "e2e-password-1", name: "E2E Organizer" },
  owner: { email: "owner@e2e.local", password: "e2e-password-2", name: "E2E Owner" },

  league: { name: "E2E League", shortName: "EEL" },
  season: { name: "E2E Season" },

  // Spec A — tiny live auction (ORGANIZER bidding mode, 2 teams, 2 lots).
  liveAuction: { name: "E2E Tiny Auction" },
  franchises: [
    { name: "E2E Alpha", shortName: "ALP", primaryColor: "#e11d48" },
    { name: "E2E Bravo", shortName: "BRV", primaryColor: "#2563eb" },
  ],
  livePlayers: ["E2E Anil Kapoor", "E2E Bharat Singh"],

  // Spec B — completed auction with a full squad, ready for lineup building.
  lineupAuction: { name: "E2E Lineup Auction" },
  squadSize: 12,
} as const;

/** Derive the dedicated e2e database URL (`<db>_e2e`) from DATABASE_URL. */
export function e2eDatabaseUrl(base: string | undefined): string {
  if (process.env.E2E_DATABASE_URL) return process.env.E2E_DATABASE_URL;
  if (!base) throw new Error("DATABASE_URL is required to derive the e2e database");
  const url = new URL(base);
  const dbName = url.pathname.replace(/^\//, "");
  if (!dbName) throw new Error(`DATABASE_URL has no database name: ${base}`);
  // Idempotent: under Playwright the webServer env already carries the derived
  // URL, and prepare.ts derives again — never double-append the suffix.
  if (!dbName.endsWith("_e2e")) url.pathname = `/${dbName}_e2e`;
  return url.toString();
}
