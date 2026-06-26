import { describe, it, expect } from "vitest";
import type { FootballPosition } from "shared";
import {
  validateLineup,
  type ValidatorMember,
  type ValidatorRules,
  type ValidatorFormation,
} from "./lineup-validator.js";

function member(over: Partial<ValidatorMember> = {}): ValidatorMember {
  return {
    teamPlayerId: "tp",
    inSquad: true,
    membership: "STARTER",
    battingOrder: null,
    isWicketkeeper: false,
    isFirstBowler: false,
    isSecondBowler: false,
    isCaptain: false,
    isViceCaptain: false,
    assignedPosition: null,
    isOverseas: false,
    footballPosition: null,
    ...over,
  };
}

const codes = (ctx: Parameters<typeof validateLineup>[0]) => validateLineup(ctx).map((v) => v.code);

// ---------------------------------------------------------------------------
// Cricket
// ---------------------------------------------------------------------------

const cricketRules: ValidatorRules = {
  startingSize: 11,
  overseasCapEnabled: false,
  maxOverseasInXI: null,
  requireWicketkeeper: true,
  requireCaptain: true,
  requireViceCaptain: true,
  requireFirstBowler: true,
  requireSecondBowler: true,
  requireFullBattingOrder: true,
  benchSize: null,
};

function cricketStarters(): ValidatorMember[] {
  const arr = Array.from({ length: 11 }, (_, i) =>
    member({ teamPlayerId: `tp${i + 1}`, battingOrder: i + 1 }),
  );
  arr[0]!.isCaptain = true;
  arr[1]!.isViceCaptain = true;
  arr[2]!.isWicketkeeper = true;
  arr[3]!.isFirstBowler = true;
  arr[4]!.isSecondBowler = true;
  return arr;
}

const ctxC = (members: ValidatorMember[], rulesOver: Partial<ValidatorRules> = {}) => ({
  sport: "CRICKET" as const,
  rules: { ...cricketRules, ...rulesOver },
  formation: null,
  formationAllowed: true,
  members,
});

describe("cricket validation", () => {
  it("accepts a fully valid XI", () => {
    expect(validateLineup(ctxC(cricketStarters()))).toEqual([]);
  });

  it("XI_SIZE when starter count is wrong", () => {
    const m = cricketStarters().slice(0, 10);
    expect(codes(ctxC(m))).toContain("XI_SIZE");
  });

  it("BATTING_ORDER on a duplicated order", () => {
    const m = cricketStarters();
    m[1]!.battingOrder = 1;
    expect(codes(ctxC(m))).toContain("BATTING_ORDER");
  });

  it("MISSING_WK / CAPTAIN / VICE / FIRST / SECOND when absent", () => {
    const m = cricketStarters();
    m[0]!.isCaptain = false;
    m[1]!.isViceCaptain = false;
    m[2]!.isWicketkeeper = false;
    m[3]!.isFirstBowler = false;
    m[4]!.isSecondBowler = false;
    const c = codes(ctxC(m));
    expect(c).toEqual(
      expect.arrayContaining([
        "MISSING_WK",
        "MISSING_CAPTAIN",
        "MISSING_VICE_CAPTAIN",
        "MISSING_FIRST_BOWLER",
        "MISSING_SECOND_BOWLER",
      ]),
    );
  });

  it("ROLE_NOT_IN_XI when a role flag sits on a non-starter", () => {
    const m = cricketStarters();
    m.push(member({ teamPlayerId: "res1", membership: "RESERVE", isWicketkeeper: true }));
    expect(codes(ctxC(m))).toContain("ROLE_NOT_IN_XI");
  });

  it("CAPTAIN_EQ_VICE_CAPTAIN when one player holds both", () => {
    const m = cricketStarters();
    m[1]!.isViceCaptain = false;
    m[0]!.isViceCaptain = true; // player 1 is captain AND vice
    expect(codes(ctxC(m))).toContain("CAPTAIN_EQ_VICE_CAPTAIN");
  });

  it("FIRST_EQ_SECOND_BOWLER when one player holds both", () => {
    const m = cricketStarters();
    m[4]!.isSecondBowler = false;
    m[3]!.isSecondBowler = true; // player 4 is 1st AND 2nd bowler
    expect(codes(ctxC(m))).toContain("FIRST_EQ_SECOND_BOWLER");
  });

  it("WK_IS_BOWLER when the keeper also bowls", () => {
    const m = cricketStarters();
    m[3]!.isFirstBowler = false;
    m[2]!.isFirstBowler = true; // wicketkeeper is also the 1st bowler
    expect(codes(ctxC(m))).toContain("WK_IS_BOWLER");
  });

  it("OVERSEAS_CAP when overseas starters exceed the cap", () => {
    const m = cricketStarters();
    m[5]!.isOverseas = true;
    m[6]!.isOverseas = true;
    m[7]!.isOverseas = true;
    const c = codes(ctxC(m, { overseasCapEnabled: true, maxOverseasInXI: 2 }));
    expect(c).toContain("OVERSEAS_CAP");
  });

  it("NOT_IN_SQUAD when a member is not in the team's squad", () => {
    const m = cricketStarters();
    m[0]!.inSquad = false;
    expect(codes(ctxC(m))).toContain("NOT_IN_SQUAD");
  });

  it("allowed overlap: captain who is also the keeper and a bowler is valid", () => {
    const m = cricketStarters();
    // Make the captain also the WK (allowed) — move WK off player 3.
    m[2]!.isWicketkeeper = false;
    m[0]!.isWicketkeeper = true;
    expect(validateLineup(ctxC(m))).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Football
// ---------------------------------------------------------------------------

const footballRules: ValidatorRules = {
  startingSize: 11,
  overseasCapEnabled: false,
  maxOverseasInXI: null,
  requireWicketkeeper: false,
  requireCaptain: true,
  requireViceCaptain: true,
  requireFirstBowler: false,
  requireSecondBowler: false,
  requireFullBattingOrder: false,
  benchSize: null,
};

const f442: ValidatorFormation = { numGK: 1, numDef: 4, numMid: 4, numFwd: 2 };

function footballStarters(): ValidatorMember[] {
  const slots: FootballPosition[] = [
    "GK",
    "DEF",
    "DEF",
    "DEF",
    "DEF",
    "MID",
    "MID",
    "MID",
    "MID",
    "FWD",
    "FWD",
  ];
  const arr = slots.map((pos, i) =>
    member({
      teamPlayerId: `f${i + 1}`,
      assignedPosition: pos,
      footballPosition: pos === "GK" ? "GK" : "DEF",
    }),
  );
  arr[1]!.isCaptain = true;
  arr[2]!.isViceCaptain = true;
  return arr;
}

const ctxF = (
  members: ValidatorMember[],
  opts: {
    rulesOver?: Partial<ValidatorRules>;
    formation?: ValidatorFormation | null;
    allowed?: boolean;
  } = {},
) => ({
  sport: "FOOTBALL" as const,
  rules: { ...footballRules, ...opts.rulesOver },
  formation: opts.formation === undefined ? f442 : opts.formation,
  formationAllowed: opts.allowed ?? true,
  members,
});

describe("football validation", () => {
  it("accepts a valid 4-4-2", () => {
    expect(validateLineup(ctxF(footballStarters()))).toEqual([]);
  });

  it("FORMATION_REQUIRED when none chosen", () => {
    const m = footballStarters();
    expect(codes(ctxF(m, { formation: null }))).toContain("FORMATION_REQUIRED");
  });

  it("FORMATION_NOT_ALLOWED when the formation isn't permitted", () => {
    const m = footballStarters();
    expect(codes(ctxF(m, { allowed: false }))).toContain("FORMATION_NOT_ALLOWED");
  });

  it("FORMATION_SIZE when the formation doesn't sum to N", () => {
    const m = footballStarters();
    const small: ValidatorFormation = { numGK: 1, numDef: 4, numMid: 4, numFwd: 1 }; // 10
    expect(codes(ctxF(m, { formation: small }))).toContain("FORMATION_SIZE");
  });

  it("SLOT_DISTRIBUTION when slot counts don't match the formation", () => {
    const m = footballStarters();
    m[10]!.assignedPosition = "MID"; // 5 MID / 1 FWD instead of 4 / 2
    expect(codes(ctxF(m))).toContain("SLOT_DISTRIBUTION");
  });

  it("GK_SLOT_INVALID when a non-GK fills the GK slot", () => {
    const m = footballStarters();
    m[0]!.footballPosition = "DEF";
    expect(codes(ctxF(m))).toContain("GK_SLOT_INVALID");
  });

  it("MISSING_CAPTAIN / VICE when absent", () => {
    const m = footballStarters();
    m[1]!.isCaptain = false;
    m[2]!.isViceCaptain = false;
    const c = codes(ctxF(m));
    expect(c).toEqual(expect.arrayContaining(["MISSING_CAPTAIN", "MISSING_VICE_CAPTAIN"]));
  });

  it("CAPTAIN_EQ_VICE_CAPTAIN when one player holds both", () => {
    const m = footballStarters();
    m[2]!.isViceCaptain = false;
    m[1]!.isViceCaptain = true;
    expect(codes(ctxF(m))).toContain("CAPTAIN_EQ_VICE_CAPTAIN");
  });

  it("ROLE_NOT_IN_XI when a captain flag sits on a reserve", () => {
    const m = footballStarters();
    m.push(member({ teamPlayerId: "fb1", membership: "BENCH", isCaptain: true }));
    expect(codes(ctxF(m))).toContain("ROLE_NOT_IN_XI");
  });

  it("BENCH_SIZE when bench count differs from the rule", () => {
    const m = footballStarters();
    m.push(member({ teamPlayerId: "fb1", membership: "BENCH" }));
    expect(codes(ctxF(m, { rulesOver: { benchSize: 3 } }))).toContain("BENCH_SIZE");
  });

  it("OVERSEAS_CAP when overseas starters exceed the cap", () => {
    const m = footballStarters();
    m[3]!.isOverseas = true;
    m[4]!.isOverseas = true;
    const c = codes(ctxF(m, { rulesOver: { overseasCapEnabled: true, maxOverseasInXI: 1 } }));
    expect(c).toContain("OVERSEAS_CAP");
  });
});
