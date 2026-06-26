import type { Sport, FootballPosition, LineupMembership, Violation } from "shared";

// ===========================================================================
// Lineup validator — pure, in-memory, fully unit-tested against
// docs/lineup-design.md. Returns a list of Violations; an empty list means the
// lineup is lockable. Run inside the save transaction so a lock can't slip
// through on stale data (see lineups controller).
// ===========================================================================

export interface ValidatorMember {
  teamPlayerId: string;
  /** false → the referenced TeamPlayer is not in this team's squad. */
  inSquad: boolean;
  membership: LineupMembership;
  battingOrder: number | null;
  isWicketkeeper: boolean;
  isFirstBowler: boolean;
  isSecondBowler: boolean;
  isCaptain: boolean;
  isViceCaptain: boolean;
  assignedPosition: FootballPosition | null;
  isOverseas: boolean;
  footballPosition: FootballPosition | null;
}

export interface ValidatorRules {
  startingSize: number;
  overseasCapEnabled: boolean;
  maxOverseasInXI: number | null;
  requireWicketkeeper: boolean;
  requireCaptain: boolean;
  requireViceCaptain: boolean;
  requireFirstBowler: boolean;
  requireSecondBowler: boolean;
  requireFullBattingOrder: boolean;
  benchSize: number | null;
}

export interface ValidatorFormation {
  numGK: number;
  numDef: number;
  numMid: number;
  numFwd: number;
}

export interface ValidatorContext {
  sport: Sport;
  rules: ValidatorRules;
  /** Football: the chosen formation (null if none chosen). */
  formation: ValidatorFormation | null;
  /** Football: whether the chosen formation is permitted for this auction. */
  formationAllowed: boolean;
  members: ValidatorMember[];
}

/** The set of `1..n` as a sorted array, for batting-order completeness checks. */
function isExactRange(values: (number | null)[], n: number): boolean {
  if (values.length !== n) return false;
  const seen = new Set<number>();
  for (const v of values) {
    if (v == null || v < 1 || v > n || seen.has(v)) return false;
    seen.add(v);
  }
  return seen.size === n;
}

export function validateLineup(ctx: ValidatorContext): Violation[] {
  const out: Violation[] = [];
  const add = (code: Violation["code"], detail?: string) =>
    out.push(detail ? { code, detail } : { code });

  const { rules, members } = ctx;
  const starters = members.filter((m) => m.membership === "STARTER");
  const N = rules.startingSize;

  // ---- Shared rules -------------------------------------------------------
  if (members.some((m) => !m.inSquad)) add("NOT_IN_SQUAD");
  if (starters.length !== N) add("XI_SIZE", `${starters.length} of ${N} starters`);
  if (rules.overseasCapEnabled && rules.maxOverseasInXI != null) {
    const overseas = starters.filter((s) => s.isOverseas).length;
    if (overseas > rules.maxOverseasInXI) {
      add("OVERSEAS_CAP", `${overseas} of max ${rules.maxOverseasInXI}`);
    }
  }

  if (ctx.sport === "FOOTBALL") validateFootball(ctx, starters, add);
  else validateCricket(ctx, starters, add);

  return out;
}

function validateCricket(
  ctx: ValidatorContext,
  starters: ValidatorMember[],
  add: (code: Violation["code"], detail?: string) => void,
): void {
  const { rules, members } = ctx;

  if (rules.requireFullBattingOrder) {
    if (
      !isExactRange(
        starters.map((s) => s.battingOrder),
        rules.startingSize,
      )
    ) {
      add("BATTING_ORDER", "Starters must have batting order 1..N with no gaps or duplicates");
    }
  }

  // Required roles — each enabled role must be held by at least one starter.
  if (rules.requireWicketkeeper && !starters.some((s) => s.isWicketkeeper)) add("MISSING_WK");
  if (rules.requireCaptain && !starters.some((s) => s.isCaptain)) add("MISSING_CAPTAIN");
  if (rules.requireViceCaptain && !starters.some((s) => s.isViceCaptain))
    add("MISSING_VICE_CAPTAIN");
  if (rules.requireFirstBowler && !starters.some((s) => s.isFirstBowler))
    add("MISSING_FIRST_BOWLER");
  if (rules.requireSecondBowler && !starters.some((s) => s.isSecondBowler)) {
    add("MISSING_SECOND_BOWLER");
  }

  // No role flag may sit on a non-starter.
  const nonStarters = members.filter((m) => m.membership !== "STARTER");
  if (
    nonStarters.some(
      (m) =>
        m.isWicketkeeper || m.isFirstBowler || m.isSecondBowler || m.isCaptain || m.isViceCaptain,
    )
  ) {
    add("ROLE_NOT_IN_XI");
  }

  // Distinctness / overlap (the only hard exclusions).
  if (starters.some((s) => s.isCaptain && s.isViceCaptain)) add("CAPTAIN_EQ_VICE_CAPTAIN");
  if (starters.some((s) => s.isFirstBowler && s.isSecondBowler)) add("FIRST_EQ_SECOND_BOWLER");
  if (starters.some((s) => s.isWicketkeeper && (s.isFirstBowler || s.isSecondBowler))) {
    add("WK_IS_BOWLER");
  }
}

function validateFootball(
  ctx: ValidatorContext,
  starters: ValidatorMember[],
  add: (code: Violation["code"], detail?: string) => void,
): void {
  const { rules, formation, members } = ctx;
  const N = rules.startingSize;

  if (!formation) {
    add("FORMATION_REQUIRED");
  } else {
    if (!ctx.formationAllowed) add("FORMATION_NOT_ALLOWED");
    const sum = formation.numGK + formation.numDef + formation.numMid + formation.numFwd;
    if (sum !== N) add("FORMATION_SIZE", `Formation sums to ${sum}, expected ${N}`);

    const count = (pos: FootballPosition) =>
      starters.filter((s) => s.assignedPosition === pos).length;
    if (
      count("GK") !== formation.numGK ||
      count("DEF") !== formation.numDef ||
      count("MID") !== formation.numMid ||
      count("FWD") !== formation.numFwd
    ) {
      add("SLOT_DISTRIBUTION", "Starter slot counts must match the formation");
    }

    // Only the GK slot is position-locked.
    if (starters.some((s) => s.assignedPosition === "GK" && s.footballPosition !== "GK")) {
      add("GK_SLOT_INVALID");
    }
  }

  if (rules.requireCaptain && !starters.some((s) => s.isCaptain)) add("MISSING_CAPTAIN");
  if (rules.requireViceCaptain && !starters.some((s) => s.isViceCaptain))
    add("MISSING_VICE_CAPTAIN");
  if (starters.some((s) => s.isCaptain && s.isViceCaptain)) add("CAPTAIN_EQ_VICE_CAPTAIN");

  const nonStarters = members.filter((m) => m.membership !== "STARTER");
  if (nonStarters.some((m) => m.isCaptain || m.isViceCaptain)) add("ROLE_NOT_IN_XI");

  if (rules.benchSize != null) {
    const bench = members.filter((m) => m.membership === "BENCH").length;
    if (bench !== rules.benchSize) add("BENCH_SIZE", `${bench} of ${rules.benchSize} bench`);
  }
}
