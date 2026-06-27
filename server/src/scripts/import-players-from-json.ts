/**
 * Import cricket players from a MongoDB JSON export into the Player table.
 *
 * Source file: a JSON array of the legacy auction app's `players` collection
 * (Mongo extended JSON). Pass its path as the first argument:
 *
 *   npm run import:players-json -- /home/rajib/projects/files/auction_app.players.json
 *   npm run import:players-json -- <file> --dry-run     # preview, no writes/downloads
 *
 * Behaviour:
 *  - Idempotent upsert by `externalRef` ("auction_app:<oid>").
 *  - Photos are REHOSTED locally: each image is downloaded once into
 *    uploads/players/ and `photoUrl` is stored as "/uploads/players/<oid>.<ext>".
 *    Cloudinary (or any) URLs are never persisted. If a download fails, the
 *    photo is left null (we never fall back to a Cloudinary URL).
 *  - battingHand / bowlingHand from the source are dropped (no schema column).
 *  - dateOfBirth is not present in the source and is left null.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import {
  AllRounderType,
  BattingPosition,
  BowlingStyle,
  CricketRole,
  Sport,
} from "@prisma/client";
import { env } from "../env.js";
import { prisma } from "../lib/prisma.js";

const EXTERNAL_PREFIX = "auction_app:";
const PHOTO_SUBDIR = "players";
const PHOTO_DIR = join(env.uploadDir, PHOTO_SUBDIR);

interface MongoPlayer {
  _id: { $oid: string };
  name: string;
  country: string | null;
  photo: string | null;
  playingRole: string | null;
  allRounder: string | null;
  bowlingStyle: string | null;
  battingPosition: string | null;
}

/** Normalize a free-text country to a clean display value ("west_indies" -> "West Indies"). */
function normalizeCountry(country: string | null): string | null {
  const c = country?.trim();
  if (!c) return null;
  return c
    .replace(/_/g, " ")
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function toCricketRole(role: string | null): CricketRole | null {
  switch ((role ?? "").trim().toLowerCase()) {
    case "batsman":
      return CricketRole.BATSMAN;
    case "wicketkeeper":
      return CricketRole.WICKETKEEPER;
    case "bowler":
      return CricketRole.BOWLER;
    case "all-rounder":
    case "allrounder":
      return CricketRole.ALL_ROUNDER;
    default:
      return null;
  }
}

/** Human-readable role label for the free-text `role` column. */
function roleLabel(role: string | null): string | null {
  const r = (role ?? "").trim().toLowerCase();
  if (!r) return null;
  switch (r) {
    case "batsman":
      return "Batsman";
    case "wicketkeeper":
      return "Wicketkeeper";
    case "bowler":
      return "Bowler";
    case "all-rounder":
    case "allrounder":
      return "All-rounder";
    default:
      return r.charAt(0).toUpperCase() + r.slice(1);
  }
}

function toBattingPosition(pos: string | null): BattingPosition | null {
  switch ((pos ?? "").trim().toLowerCase()) {
    case "opener":
      return BattingPosition.OPENER;
    case "middle":
      return BattingPosition.MIDDLE;
    case "lower":
      return BattingPosition.LOWER;
    default:
      return null;
  }
}

function toBowlingStyle(style: string | null): BowlingStyle | null {
  switch ((style ?? "").trim().toLowerCase()) {
    case "fast":
      return BowlingStyle.FAST;
    case "medium fast":
      return BowlingStyle.MEDIUM_FAST;
    case "off spin":
    case "leg spin":
      return BowlingStyle.SPINNER;
    default:
      return null; // "none" / empty
  }
}

function toAllRounderType(value: string | null): AllRounderType | null {
  switch ((value ?? "").trim().toLowerCase()) {
    case "batting":
      return AllRounderType.BATTING;
    case "bowling":
      return AllRounderType.BOWLING;
    case "proper":
      return AllRounderType.ALL_ROUNDER;
    default:
      return null; // null / "null" / ""
  }
}

function extFor(contentType: string | null, url: string): string {
  const ct = (contentType ?? "").toLowerCase();
  if (ct.includes("webp")) return "webp";
  if (ct.includes("png")) return "png";
  if (ct.includes("jpeg") || ct.includes("jpg")) return "jpg";
  if (ct.includes("gif")) return "gif";
  const path = url.split("?")[0] ?? url;
  const m = path.match(/\.(webp|png|jpe?g|gif)$/i);
  return m?.[1] ? m[1].toLowerCase().replace("jpeg", "jpg") : "jpg";
}

/**
 * Download the image at `url` into uploads/players/<oid>.<ext> and return its
 * public path, or null on any failure (we never persist the source URL).
 */
async function downloadPhoto(oid: string, url: string | null): Promise<string | null> {
  const src = url?.trim();
  if (!src) return null;
  try {
    const res = await fetch(src, { headers: { "User-Agent": "auction-app-importer" } });
    if (!res.ok) {
      console.warn(`    ! photo HTTP ${res.status} for ${oid} (${src})`);
      return null;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0) {
      console.warn(`    ! photo empty for ${oid}`);
      return null;
    }
    const ext = extFor(res.headers.get("content-type"), src);
    const filename = `${oid}.${ext}`;
    await writeFile(join(PHOTO_DIR, filename), buf);
    return `/uploads/${PHOTO_SUBDIR}/${filename}`;
  } catch (err) {
    console.warn(`    ! photo download failed for ${oid}: ${(err as Error).message}`);
    return null;
  }
}

interface CliOptions {
  file: string;
  dryRun: boolean;
}

function parseArgs(argv: string[]): CliOptions {
  let file = "";
  let dryRun = false;
  for (const arg of argv) {
    if (arg === "--dry-run") dryRun = true;
    else if (!arg.startsWith("--") && !file) file = arg;
  }
  if (!file) {
    console.error("Usage: npm run import:players-json -- <path-to-json> [--dry-run]");
    process.exit(1);
  }
  return { file, dryRun };
}

async function main(): Promise<void> {
  const { file, dryRun } = parseArgs(process.argv.slice(2));

  const records = JSON.parse(readFileSync(file, "utf8")) as MongoPlayer[];
  console.log(
    `Importing ${records.length} cricket players from ${file}` +
      (dryRun ? " [DRY RUN — no writes/downloads]" : ""),
  );

  if (!dryRun) await mkdir(PHOTO_DIR, { recursive: true });

  let created = 0;
  let updated = 0;
  let withPhoto = 0;
  let photoFailed = 0;

  for (const rec of records) {
    const oid = rec._id?.$oid;
    if (!oid || !rec.name?.trim()) {
      console.warn(`  ! skipping record with missing _id/name`);
      continue;
    }
    const externalRef = `${EXTERNAL_PREFIX}${oid}`;
    const cricketRole = toCricketRole(rec.playingRole);
    const isAllRounder = cricketRole === CricketRole.ALL_ROUNDER;
    const isBowlerType = isAllRounder || cricketRole === CricketRole.BOWLER;

    // Respect the schema invariants: bowlingStyle applies to BOWLER/ALL_ROUNDER;
    // allRounderType applies to ALL_ROUNDER only.
    const bowlingStyle = isBowlerType ? toBowlingStyle(rec.bowlingStyle) : null;
    const allRounderType = isAllRounder ? toAllRounderType(rec.allRounder) : null;

    let photoUrl: string | null = null;
    if (!dryRun) {
      photoUrl = await downloadPhoto(oid, rec.photo);
      if (photoUrl) withPhoto++;
      else if (rec.photo?.trim()) photoFailed++;
    } else if (rec.photo?.trim()) {
      withPhoto++;
    }

    const fields = {
      name: rec.name.trim(),
      sport: Sport.CRICKET,
      role: roleLabel(rec.playingRole),
      nationality: normalizeCountry(rec.country),
      photoUrl,
      cricketRole,
      battingPosition: toBattingPosition(rec.battingPosition),
      bowlingStyle,
      allRounderType,
      externalRef,
    };

    if (dryRun) {
      created++; // count as would-process
      continue;
    }

    const existing = await prisma.player.findFirst({
      where: { externalRef },
      select: { id: true },
    });
    if (existing) {
      await prisma.player.update({ where: { id: existing.id }, data: fields });
      updated++;
    } else {
      await prisma.player.create({ data: fields });
      created++;
    }
  }

  if (dryRun) {
    console.log(`\nDry run: ${created} players would be imported, ${withPhoto} have a photo URL.`);
  } else {
    console.log(
      `\nDone. ${created} created, ${updated} updated. ` +
        `Photos: ${withPhoto} rehosted to /uploads/${PHOTO_SUBDIR}/, ${photoFailed} failed (left null).`,
    );
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
