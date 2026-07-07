import type {
  CricketRole,
  BattingPosition,
  BowlingStyle,
  SquadRoleKey,
  SquadRoleReport,
} from "shared";

// ===========================================================================
// Auto-pilot cricket squad-composition logic — PURE functions over plain player
// attributes + target numbers. No DB, no money, no randomness. Drives the bot
// engine's "does this team still need this kind of player?" decisions and the
// best-effort end-of-run report. Unit-tested in roles.test.ts.
//
// Bucket rules (a player may fall in MORE than one — openers ⊆ batsmen):
//   WICKETKEEPER → cricketRole = WICKETKEEPER
//   BATSMAN      → cricketRole = BATSMAN
//   OPENER       → battingPosition = OPENER (any role — a keeper who opens counts)
//   PACE_BOWLER  → cricketRole = BOWLER, bowlingStyle = FAST | MEDIUM_FAST
//   SPINNER      → cricketRole = BOWLER, bowlingStyle = SPINNER
//   ALL_ROUNDER  → cricketRole = ALL_ROUNDER
// ===========================================================================

/** The cricket attributes the buckets depend on (subset of Player). */
export interface CricketAttrs {
  cricketRole: CricketRole | null;
  battingPosition: BattingPosition | null;
  bowlingStyle: BowlingStyle | null;
}

/** Per-auction composition targets (structural; matches CricketSquadTargets). */
export interface SquadTargets {
  minWicketkeepers: number;
  minBatsmen: number;
  minOpeners: number;
  minPaceBowlers: number;
  minSpinners: number;
  minAllRounders: number;
}

/** Count of squad members in each (possibly overlapping) role bucket. */
export interface SquadCounts {
  wicketkeepers: number;
  batsmen: number;
  openers: number;
  paceBowlers: number;
  spinners: number;
  allRounders: number;
}

/** Unmet portion of each target: max(0, target - have). `total` sums them. */
export interface RoleNeeds extends SquadCounts {
  total: number;
}

/** Which role buckets a single player qualifies for (may be several). */
export function playerRoles(p: CricketAttrs): SquadRoleKey[] {
  const roles: SquadRoleKey[] = [];
  if (p.cricketRole === "WICKETKEEPER") roles.push("WICKETKEEPER");
  if (p.cricketRole === "BATSMAN") roles.push("BATSMAN");
  if (p.battingPosition === "OPENER") roles.push("OPENER");
  if (p.cricketRole === "BOWLER") {
    if (p.bowlingStyle === "FAST" || p.bowlingStyle === "MEDIUM_FAST") roles.push("PACE_BOWLER");
    else if (p.bowlingStyle === "SPINNER") roles.push("SPINNER");
  }
  if (p.cricketRole === "ALL_ROUNDER") roles.push("ALL_ROUNDER");
  return roles;
}

/** Tally a squad (or any player list) into the role buckets. */
export function squadCounts(players: CricketAttrs[]): SquadCounts {
  const c: SquadCounts = {
    wicketkeepers: 0,
    batsmen: 0,
    openers: 0,
    paceBowlers: 0,
    spinners: 0,
    allRounders: 0,
  };
  for (const p of players) {
    for (const r of playerRoles(p)) {
      if (r === "WICKETKEEPER") c.wicketkeepers++;
      else if (r === "BATSMAN") c.batsmen++;
      else if (r === "OPENER") c.openers++;
      else if (r === "PACE_BOWLER") c.paceBowlers++;
      else if (r === "SPINNER") c.spinners++;
      else if (r === "ALL_ROUNDER") c.allRounders++;
    }
  }
  return c;
}

const clampNeed = (target: number, have: number): number => Math.max(0, target - have);

/** Unmet role requirements for a squad given the targets. */
export function roleNeeds(counts: SquadCounts, targets: SquadTargets): RoleNeeds {
  const needs = {
    wicketkeepers: clampNeed(targets.minWicketkeepers, counts.wicketkeepers),
    batsmen: clampNeed(targets.minBatsmen, counts.batsmen),
    openers: clampNeed(targets.minOpeners, counts.openers),
    paceBowlers: clampNeed(targets.minPaceBowlers, counts.paceBowlers),
    spinners: clampNeed(targets.minSpinners, counts.spinners),
    allRounders: clampNeed(targets.minAllRounders, counts.allRounders),
  };
  const total =
    needs.wicketkeepers +
    needs.batsmen +
    needs.openers +
    needs.paceBowlers +
    needs.spinners +
    needs.allRounders;
  return { ...needs, total };
}

/**
 * How many squad SLOTS a team must keep free to still fill its unmet role needs.
 * Openers are a subset of batsmen, so opener needs are satisfied within batsmen
 * slots wherever possible — only the surplus openers (beyond the batsmen still
 * needed) cost their own slot. Used to stop a bot from spending its last slots on
 * depth players while required roles are still unfilled.
 */
export function reserveSlotCount(needs: RoleNeeds): number {
  const extraOpeners = Math.max(0, needs.openers - needs.batsmen);
  return (
    needs.wicketkeepers +
    needs.batsmen +
    needs.paceBowlers +
    needs.spinners +
    needs.allRounders +
    extraOpeners
  );
}

/**
 * How many of a player's buckets the team still needs — the "need score" the
 * valuation uses. 0 means the player fills no unmet requirement (depth only).
 */
export function needScore(p: CricketAttrs, needs: RoleNeeds): number {
  let score = 0;
  for (const r of playerRoles(p)) {
    if (r === "WICKETKEEPER" && needs.wicketkeepers > 0) score++;
    else if (r === "BATSMAN" && needs.batsmen > 0) score++;
    else if (r === "OPENER" && needs.openers > 0) score++;
    else if (r === "PACE_BOWLER" && needs.paceBowlers > 0) score++;
    else if (r === "SPINNER" && needs.spinners > 0) score++;
    else if (r === "ALL_ROUNDER" && needs.allRounders > 0) score++;
  }
  return score;
}

const ROLE_TARGET: Record<SquadRoleKey, keyof SquadTargets> = {
  WICKETKEEPER: "minWicketkeepers",
  BATSMAN: "minBatsmen",
  OPENER: "minOpeners",
  PACE_BOWLER: "minPaceBowlers",
  SPINNER: "minSpinners",
  ALL_ROUNDER: "minAllRounders",
};

export const ROLE_COUNT: Record<SquadRoleKey, keyof SquadCounts> = {
  WICKETKEEPER: "wicketkeepers",
  BATSMAN: "batsmen",
  OPENER: "openers",
  PACE_BOWLER: "paceBowlers",
  SPINNER: "spinners",
  ALL_ROUNDER: "allRounders",
};

export const SQUAD_ROLES: SquadRoleKey[] = [
  "WICKETKEEPER",
  "BATSMAN",
  "OPENER",
  "PACE_BOWLER",
  "SPINNER",
  "ALL_ROUNDER",
];

/** Extra players of one role a team may hold beyond its target while other
 * roles are still short (the soft balance cap). */
export const DEPTH_MARGIN = 2;

/**
 * Soft per-role depth cap: true when EVERY bucket this player fills already has
 * target + DEPTH_MARGIN members. The engine zeroes the valuation when this
 * holds while any role is still short — so a team can lean batting-heavy, but
 * can't hoard 8 batsmen while it still lacks a spinner.
 */
export function roleCapExceeded(
  p: CricketAttrs,
  counts: SquadCounts,
  targets: SquadTargets,
): boolean {
  const roles = playerRoles(p);
  if (roles.length === 0) return false;
  return roles.every((r) => counts[ROLE_COUNT[r]] >= targets[ROLE_TARGET[r]] + DEPTH_MARGIN);
}

/** Build the per-role required/got/short report lines for one team. */
export function roleReport(counts: SquadCounts, targets: SquadTargets): SquadRoleReport[] {
  return SQUAD_ROLES.map((role) => {
    const required = targets[ROLE_TARGET[role]];
    const got = counts[ROLE_COUNT[role]];
    return { role, required, got, short: Math.max(0, required - got) };
  });
}
