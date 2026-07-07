import { execSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { PrismaClient } from "@prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import bcrypt from "bcryptjs";
import { E2E, e2eDatabaseUrl } from "./fixtures.js";

// One-shot e2e environment prep, run by Playwright's webServer command before
// the production server boots: build all workspaces, sync the dedicated
// `<db>_e2e` database, wipe it, and seed the two deterministic scenarios the
// specs drive through the real UI.

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
config({ path: resolve(root, ".env") });

const dbUrl = e2eDatabaseUrl(process.env.DATABASE_URL);
if (!new URL(dbUrl).pathname.endsWith("_e2e")) {
  throw new Error(`Refusing to run e2e against a non-e2e database: ${new URL(dbUrl).pathname}`);
}

function sh(cmd: string, cwd = root): void {
  console.log(`[e2e-prepare] ${cmd}`);
  execSync(cmd, {
    cwd,
    stdio: "inherit",
    // Force same-origin API/socket URLs into the SPA build: the root .env may
    // point VITE_* at the dev server, but e2e serves everything from one port.
    env: { ...process.env, DATABASE_URL: dbUrl, VITE_API_URL: "", VITE_SOCKET_URL: "" },
  });
}

const hash = (password: string) => bcrypt.hashSync(password + (process.env.PEPPER ?? ""), 12);

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


async function seed(): Promise<void> {
  const prisma = new PrismaClient({ adapter: singleConnAdapter(dbUrl) });
  try {
    const dbName = new URL(dbUrl).pathname.slice(1);
    // CAST: the mariadb driver adapter returns information_schema identifiers
    // as raw bytes; force them to text.
    const tables = await prisma.$queryRaw<{ TABLE_NAME: string }[]>`
      SELECT CAST(TABLE_NAME AS CHAR) AS TABLE_NAME FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = ${dbName} AND TABLE_TYPE = 'BASE TABLE'
        AND TABLE_NAME <> '_prisma_migrations'`;
    await prisma.$executeRawUnsafe("SET FOREIGN_KEY_CHECKS = 0");
    for (const t of tables) await prisma.$executeRawUnsafe(`TRUNCATE TABLE \`${t.TABLE_NAME}\``);
    await prisma.$executeRawUnsafe("SET FOREIGN_KEY_CHECKS = 1");

    const organizer = await prisma.user.create({
      data: {
        email: E2E.organizer.email,
        name: E2E.organizer.name,
        passwordHash: hash(E2E.organizer.password),
        role: "ORGANIZER",
        status: "ACTIVE",
      },
    });
    const owner = await prisma.user.create({
      data: {
        email: E2E.owner.email,
        name: E2E.owner.name,
        passwordHash: hash(E2E.owner.password),
        role: "FRANCHISE",
        status: "ACTIVE",
        createdById: organizer.id,
      },
    });

    const league = await prisma.league.create({
      data: {
        name: E2E.league.name,
        shortName: E2E.league.shortName,
        sport: "CRICKET",
        organizerId: organizer.id,
      },
    });
    const season = await prisma.season.create({
      data: { name: E2E.season.name, leagueId: league.id },
    });

    const franchises = [];
    for (const [i, f] of E2E.franchises.entries()) {
      franchises.push(
        await prisma.franchise.create({
          data: {
            leagueId: league.id,
            name: f.name,
            shortName: f.shortName,
            primaryColor: f.primaryColor,
            // The owner user owns the first franchise (drives the lineup spec).
            ownerUserId: i === 0 ? owner.id : null,
          },
        }),
      );
    }
    for (const f of franchises) {
      await prisma.seasonFranchise.create({ data: { seasonId: season.id, franchiseId: f.id } });
    }

    // ---- Scenario A: fully configured DRAFT auction, ORGANIZER bidding mode.
    // The spec takes it live in the UI, runs both lots, and completes it.
    const live = await prisma.auction.create({
      data: {
        name: E2E.liveAuction.name,
        seasonId: season.id,
        status: "DRAFT",
        biddingMode: "ORGANIZER",
        rules: {
          create: {
            creditPerTeam: "100",
            minPlayersPerTeam: 1,
            maxPlayersPerTeam: 3,
            unsoldPrice: "0.5",
            defaultLotDurationSec: 120,
          },
        },
        incrementTiers: { create: [{ fromAmount: "0", increment: "0.5" }] },
      },
    });
    for (const [i, name] of E2E.livePlayers.entries()) {
      const player = await prisma.player.create({
        data: { name, sport: "CRICKET", cricketRole: "BATSMAN" },
      });
      await prisma.auctionPlayer.create({
        data: { auctionId: live.id, playerId: player.id, basePrice: "2", lotOrder: i + 1 },
      });
    }

    // ---- Scenario B: COMPLETED auction with a full squad for the owner's
    // franchise, ready for XI building. Squad composition satisfies every
    // cricket validator toggle (keeper, bowlers, full batting order).
    const done = await prisma.auction.create({
      data: {
        name: E2E.lineupAuction.name,
        seasonId: season.id,
        status: "COMPLETED",
        rules: {
          create: {
            creditPerTeam: "100",
            minPlayersPerTeam: 1,
            maxPlayersPerTeam: E2E.squadSize,
            unsoldPrice: "0.5",
            defaultLotDurationSec: 60,
          },
        },
        incrementTiers: { create: [{ fromAmount: "0", increment: "0.5" }] },
        lineupRules: { create: {} }, // schema defaults: XI of 11, all toggles on
      },
    });
    const squadTeam = await prisma.team.create({
      data: {
        auctionId: done.id,
        franchiseId: franchises[0]!.id,
        committedAmount: String(E2E.squadSize * 2),
        playerCount: E2E.squadSize,
      },
    });
    // Other participating team so the auction looks real in monitors.
    await prisma.team.create({ data: { auctionId: done.id, franchiseId: franchises[1]!.id } });

    for (let i = 0; i < E2E.squadSize; i++) {
      // 1 keeper + 5 batsmen + 3 pace + 2 spin + 1 all-rounder = 12.
      const attrs =
        i === 0
          ? { cricketRole: "WICKETKEEPER" as const }
          : i <= 5
            ? {
                cricketRole: "BATSMAN" as const,
                battingPosition: i <= 2 ? ("OPENER" as const) : ("MIDDLE" as const),
              }
            : i <= 8
              ? { cricketRole: "BOWLER" as const, bowlingStyle: "FAST" as const }
              : i <= 10
                ? { cricketRole: "BOWLER" as const, bowlingStyle: "SPINNER" as const }
                : { cricketRole: "ALL_ROUNDER" as const, allRounderType: "BATTING" as const };
      const player = await prisma.player.create({
        data: { name: `E2E Squad ${String(i + 1).padStart(2, "0")}`, sport: "CRICKET", ...attrs },
      });
      const lot = await prisma.auctionPlayer.create({
        data: {
          auctionId: done.id,
          playerId: player.id,
          basePrice: "2",
          status: "SOLD",
          soldToTeamId: squadTeam.id,
          soldPrice: "2",
          lotOrder: i + 1,
        },
      });
      await prisma.teamPlayer.create({
        data: {
          teamId: squadTeam.id,
          auctionPlayerId: lot.id,
          playerId: player.id,
          price: "2",
          acquiredVia: "AUCTION",
        },
      });
    }

    console.log("[e2e-prepare] seeded scenarios A (live) and B (lineup)");
  } finally {
    await prisma.$disconnect();
  }
}

sh("npm run build");
sh("npx prisma db push --skip-generate", resolve(root, "server"));
await seed();
