import { describe, it, expect } from "vitest";
import {
  playerRoles,
  squadCounts,
  roleNeeds,
  needScore,
  reserveSlotCount,
  roleCapExceeded,
  roleReport,
  type CricketAttrs,
  type SquadTargets,
} from "./roles.js";

const p = (over: Partial<CricketAttrs>): CricketAttrs => ({
  cricketRole: null,
  battingPosition: null,
  bowlingStyle: null,
  ...over,
});

const targets: SquadTargets = {
  minWicketkeepers: 1,
  minBatsmen: 3,
  minOpeners: 2,
  minPaceBowlers: 2,
  minSpinners: 1,
  minAllRounders: 1,
};

const allZero: SquadTargets = {
  minWicketkeepers: 0,
  minBatsmen: 0,
  minOpeners: 0,
  minPaceBowlers: 0,
  minSpinners: 0,
  minAllRounders: 0,
};

describe("playerRoles", () => {
  it("buckets a keeper-opener into both WK and OPENER", () => {
    expect(playerRoles(p({ cricketRole: "WICKETKEEPER", battingPosition: "OPENER" }))).toEqual([
      "WICKETKEEPER",
      "OPENER",
    ]);
  });

  it("buckets a batsman-opener into both BATSMAN and OPENER", () => {
    expect(playerRoles(p({ cricketRole: "BATSMAN", battingPosition: "OPENER" }))).toEqual([
      "BATSMAN",
      "OPENER",
    ]);
  });

  it("splits bowlers by style", () => {
    expect(playerRoles(p({ cricketRole: "BOWLER", bowlingStyle: "FAST" }))).toEqual([
      "PACE_BOWLER",
    ]);
    expect(playerRoles(p({ cricketRole: "BOWLER", bowlingStyle: "MEDIUM_FAST" }))).toEqual([
      "PACE_BOWLER",
    ]);
    expect(playerRoles(p({ cricketRole: "BOWLER", bowlingStyle: "SPINNER" }))).toEqual(["SPINNER"]);
  });

  it("buckets an all-rounder by role", () => {
    expect(playerRoles(p({ cricketRole: "ALL_ROUNDER", battingPosition: "MIDDLE" }))).toEqual([
      "ALL_ROUNDER",
    ]);
  });
});

describe("squadCounts + roleNeeds", () => {
  it("counts overlapping buckets and computes unmet needs", () => {
    const squad = [
      p({ cricketRole: "WICKETKEEPER", battingPosition: "OPENER" }), // WK + opener
      p({ cricketRole: "BATSMAN", battingPosition: "OPENER" }), // batsman + opener
      p({ cricketRole: "BATSMAN", battingPosition: "MIDDLE" }), // batsman
      p({ cricketRole: "BOWLER", bowlingStyle: "FAST" }), // pace
    ];
    const counts = squadCounts(squad);
    expect(counts).toEqual({
      wicketkeepers: 1,
      batsmen: 2,
      openers: 2,
      paceBowlers: 1,
      spinners: 0,
      allRounders: 0,
    });

    const needs = roleNeeds(counts, targets);
    expect(needs.wicketkeepers).toBe(0); // 1/1 met
    expect(needs.batsmen).toBe(1); // 2/3
    expect(needs.openers).toBe(0); // 2/2 met
    expect(needs.paceBowlers).toBe(1); // 1/2
    expect(needs.spinners).toBe(1); // 0/1
    expect(needs.allRounders).toBe(1); // 0/1
    expect(needs.total).toBe(4);
  });
});

describe("needScore", () => {
  const counts = squadCounts([]); // empty squad → everything unmet
  const needs = roleNeeds(counts, targets);

  it("scores a batsman-opener as 2 when both buckets are needed", () => {
    expect(needScore(p({ cricketRole: "BATSMAN", battingPosition: "OPENER" }), needs)).toBe(2);
  });

  it("scores 0 for a role with no remaining need", () => {
    const fullSpin = roleNeeds(
      squadCounts([p({ cricketRole: "BOWLER", bowlingStyle: "SPINNER" })]),
      targets,
    );
    expect(needScore(p({ cricketRole: "BOWLER", bowlingStyle: "SPINNER" }), fullSpin)).toBe(0);
  });
});

describe("reserveSlotCount", () => {
  it("is zero when nothing is needed", () => {
    expect(reserveSlotCount(roleNeeds(squadCounts([]), allZero))).toBe(0);
  });

  it("counts one slot per need, openers folded into batsmen", () => {
    // Empty squad vs the standard targets: wk1+bat3+pace2+spin1+ar1 = 8;
    // openers(2) ⊆ batsmen(3) so they add no extra slots.
    expect(reserveSlotCount(roleNeeds(squadCounts([]), targets))).toBe(8);
  });

  it("charges a slot for openers that exceed the batsmen target", () => {
    // bat1 but open3 → 2 surplus openers need their own slots.
    const t: SquadTargets = { ...allZero, minBatsmen: 1, minOpeners: 3 };
    expect(reserveSlotCount(roleNeeds(squadCounts([]), t))).toBe(1 + 2);
  });
});

describe("roleCapExceeded", () => {
  const bat = p({ cricketRole: "BATSMAN", battingPosition: "MIDDLE" });

  it("caps a role at target + 2", () => {
    // minBatsmen 3 → cap 5. Four batsmen: not capped; five: capped.
    const four = squadCounts(Array.from({ length: 4 }, () => bat));
    const five = squadCounts(Array.from({ length: 5 }, () => bat));
    expect(roleCapExceeded(bat, four, targets)).toBe(false);
    expect(roleCapExceeded(bat, five, targets)).toBe(true);
  });

  it("is not capped when ANY of the player's buckets still has room", () => {
    // Five middle-order batsmen (batsmen capped) but zero openers — a
    // batsman-opener still passes because the OPENER bucket has room.
    const counts = squadCounts(Array.from({ length: 5 }, () => bat));
    const opener = p({ cricketRole: "BATSMAN", battingPosition: "OPENER" });
    expect(roleCapExceeded(opener, counts, targets)).toBe(false);
  });

  it("never caps a player with no cricket buckets", () => {
    expect(roleCapExceeded(p({}), squadCounts([]), targets)).toBe(false);
  });
});

describe("roleReport", () => {
  it("emits required/got/short for every role", () => {
    const counts = squadCounts([p({ cricketRole: "WICKETKEEPER" })]);
    const report = roleReport(counts, targets);
    const wk = report.find((r) => r.role === "WICKETKEEPER")!;
    const bat = report.find((r) => r.role === "BATSMAN")!;
    expect(wk).toEqual({ role: "WICKETKEEPER", required: 1, got: 1, short: 0 });
    expect(bat).toEqual({ role: "BATSMAN", required: 3, got: 0, short: 3 });
    expect(report).toHaveLength(6);
  });
});
