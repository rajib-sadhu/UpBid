/**
 * Import real cricket players from TheSportsDB into the Player table.
 *
 * Source: https://www.thesportsdb.com  (free "test" API key `3`, no signup).
 * Strategy: for each configured league, list its teams, then list every player
 * on each team. Players are upserted by `externalRef` so the import is
 * idempotent and a player appearing in multiple leagues collapses to one row.
 *
 * Run (from repo root or /server):
 *   npm run import:cricket                 # default leagues, writes to DB
 *   npm run import:cricket -- --dry-run     # preview, no writes
 *   npm run import:cricket -- --leagues "Indian Premier League,Big Bash League"
 *
 * TheSportsDB does not expose batting/bowling style on the free tier, so those
 * structured columns are left null; `role` + `cricketRole` are derived from the
 * player's `strPosition`. Photo URLs are stored as remote links (not downloaded).
 */
import { CricketRole, Sport } from "@prisma/client";
import { prisma } from "../lib/prisma.js";

const API_KEY = process.env.THESPORTSDB_KEY ?? "3";
const BASE_URL = `https://www.thesportsdb.com/api/v1/json/${API_KEY}`;

// Be polite to the free tier: pause between HTTP calls.
const REQUEST_DELAY_MS = 400;

// Default set of cricket leagues to walk. Override with --leagues "a,b,c".
const DEFAULT_LEAGUES = [
  "Indian Premier League",
  "Big Bash League",
  "Pakistan Super League",
  "Caribbean Premier League",
  "The Hundred",
  "Bangladesh Premier League",
];

const EXTERNAL_PREFIX = "thesportsdb:";

interface SdbTeam {
  idTeam: string;
  strTeam: string;
}

interface SdbPlayer {
  idPlayer: string;
  strPlayer: string;
  strNationality: string | null;
  dateBorn: string | null;
  strThumb: string | null;
  strCutout: string | null;
  strPosition: string | null;
  strSport: string | null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getJson<T>(url: string): Promise<T> {
  await sleep(REQUEST_DELAY_MS);
  const res = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": "auction-app-importer" },
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${url}`);
  }
  return (await res.json()) as T;
}

/** Map TheSportsDB free-text position to our CricketRole enum. */
function toCricketRole(position: string | null): CricketRole | null {
  if (!position) return null;
  const p = position.toLowerCase();
  if (p.includes("wicket")) return CricketRole.WICKETKEEPER;
  if (p.includes("all")) return CricketRole.ALL_ROUNDER; // "all-rounder" / "allrounder"
  if (p.includes("bowl")) return CricketRole.BOWLER;
  if (p.includes("bat")) return CricketRole.BATSMAN;
  return null;
}

/** Parse "YYYY-MM-DD" (or empty) into a Date, or null. */
function toDate(dateBorn: string | null): Date | null {
  if (!dateBorn) return null;
  const trimmed = dateBorn.trim();
  if (!trimmed || trimmed === "0000-00-00") return null;
  const d = new Date(trimmed);
  return Number.isNaN(d.getTime()) ? null : d;
}

async function listTeams(league: string): Promise<SdbTeam[]> {
  const url = `${BASE_URL}/search_all_teams.php?l=${encodeURIComponent(league)}`;
  const data = await getJson<{ teams: SdbTeam[] | null }>(url);
  return (data.teams ?? []).filter((t) => t.idTeam && t.strTeam);
}

async function listPlayers(teamId: string): Promise<SdbPlayer[]> {
  const url = `${BASE_URL}/lookup_all_players.php?id=${encodeURIComponent(teamId)}`;
  const data = await getJson<{ player: SdbPlayer[] | null }>(url);
  // Keep cricket only — some teams in TheSportsDB are multi-sport.
  return (data.player ?? []).filter(
    (p) => p.idPlayer && p.strPlayer && (p.strSport === "Cricket" || !p.strSport),
  );
}

interface CliOptions {
  dryRun: boolean;
  leagues: string[];
}

function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = { dryRun: false, leagues: DEFAULT_LEAGUES };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--dry-run") {
      opts.dryRun = true;
    } else if (arg === "--leagues") {
      const value = argv[++i];
      if (value) {
        opts.leagues = value
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
      }
    }
  }
  return opts;
}

async function upsertPlayer(p: SdbPlayer, dryRun: boolean): Promise<"created" | "updated"> {
  const externalRef = `${EXTERNAL_PREFIX}${p.idPlayer}`;
  const fields = {
    name: p.strPlayer.trim(),
    sport: Sport.CRICKET,
    role: p.strPosition?.trim() || null,
    nationality: p.strNationality?.trim() || null,
    dateOfBirth: toDate(p.dateBorn),
    photoUrl: p.strThumb?.trim() || p.strCutout?.trim() || null,
    cricketRole: toCricketRole(p.strPosition),
    externalRef,
  };

  // externalRef is not a unique column in the schema, so emulate upsert.
  const existing = await prisma.player.findFirst({
    where: { externalRef },
    select: { id: true },
  });

  if (dryRun) return existing ? "updated" : "created";

  if (existing) {
    await prisma.player.update({ where: { id: existing.id }, data: fields });
    return "updated";
  }
  await prisma.player.create({ data: fields });
  return "created";
}

async function main(): Promise<void> {
  const { dryRun, leagues } = parseArgs(process.argv.slice(2));

  console.log(
    `Importing cricket players from TheSportsDB (key=${API_KEY === "3" ? "test" : "custom"})` +
      (dryRun ? " [DRY RUN — no writes]" : ""),
  );
  console.log(`Leagues: ${leagues.join(", ")}\n`);

  const seen = new Set<string>();
  let created = 0;
  let updated = 0;
  let skippedDupes = 0;

  for (const league of leagues) {
    let teams: SdbTeam[];
    try {
      teams = await listTeams(league);
    } catch (err) {
      console.warn(`  ! Failed to list teams for "${league}": ${(err as Error).message}`);
      continue;
    }
    console.log(`League "${league}" — ${teams.length} team(s)`);

    for (const team of teams) {
      let players: SdbPlayer[];
      try {
        players = await listPlayers(team.idTeam);
      } catch (err) {
        console.warn(`    ! Failed players for ${team.strTeam}: ${(err as Error).message}`);
        continue;
      }

      let teamNew = 0;
      for (const player of players) {
        if (seen.has(player.idPlayer)) {
          skippedDupes++;
          continue;
        }
        seen.add(player.idPlayer);
        try {
          const result = await upsertPlayer(player, dryRun);
          if (result === "created") {
            created++;
            teamNew++;
          } else {
            updated++;
          }
        } catch (err) {
          console.warn(`    ! Failed to save ${player.strPlayer}: ${(err as Error).message}`);
        }
      }
      console.log(`    ${team.strTeam}: ${players.length} player(s), ${teamNew} new`);
    }
  }

  console.log(
    `\nDone. ${created} created, ${updated} updated, ${skippedDupes} cross-league dupes skipped, ` +
      `${seen.size} unique players processed.`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
