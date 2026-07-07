import { describe, it, expect } from "vitest";
import { money } from "../../lib/money.js";
import {
  valuePlayer,
  jitterFor,
  qualityFor,
  personalityFor,
  type ValuationInput,
} from "./valuation.js";

// Opening 2, par 8 — a typical mid-auction budget anchor (e.g. 96 credit left
// over 12 slots). The par, not the base price, is what drives spending.
const base = (over: Partial<ValuationInput> = {}): ValuationInput => ({
  openingPrice: money("2"),
  parPrice: money("8"),
  slotsRemaining: 10,
  needScore: 0,
  scarcity: 1,
  quality: 0.5, // mid-market player
  personality: "BALANCED",
  jitter: 0.5, // neutral → no jitter offset
  ...over,
});

describe("valuePlayer", () => {
  it("values a full squad at zero (no slots)", () => {
    expect(valuePlayer(base({ slotsRemaining: 0 })).toFixed(2)).toBe("0.00");
  });

  it("anchors a needed player to the par price, not the base price", () => {
    // needScore 1, quality .5 → par × 1 × (0.6 + 1.6×0.25) = 8 × 1.0 = 8.0
    expect(valuePlayer(base({ needScore: 1 })).toFixed(2)).toBe("8.00");
  });

  it("scales with the team's budget: double the par, double the bid ceiling", () => {
    const poor = valuePlayer(base({ needScore: 1, parPrice: money("4") }));
    const rich = valuePlayer(base({ needScore: 1, parPrice: money("8") }));
    expect(rich.dividedBy(poor).toNumber()).toBeCloseTo(2, 5);
  });

  it("values a weak-fit filler BELOW the opening price so the bot passes", () => {
    // quality .1 filler → par × (0.35 + 0.9×0.01) = 8 × 0.359 = 2.87 — above a
    // par-rich threshold? No: with par 4 → 1.44 < opening 2 → pass.
    const v = valuePlayer(base({ needScore: 0, quality: 0.1, parPrice: money("4") }));
    expect(v.lessThan(money("2"))).toBe(true);
  });

  it("buys quality depth when budget allows", () => {
    // quality .9 filler on par 8 → 8 × (0.35 + 0.9×0.81) ≈ 8.63 > opening.
    const v = valuePlayer(base({ needScore: 0, quality: 0.9 }));
    expect(v.greaterThan(money("2"))).toBe(true);
  });

  it("makes stars far more valuable than ordinary players when needed", () => {
    const ordinary = valuePlayer(base({ needScore: 1, quality: 0.2 }));
    const star = valuePlayer(base({ needScore: 1, quality: 0.95 }));
    expect(star.dividedBy(ordinary).toNumber()).toBeGreaterThan(2.5);
  });

  it("pays more when a player covers multiple unmet needs", () => {
    const one = valuePlayer(base({ needScore: 1 }));
    const two = valuePlayer(base({ needScore: 2 }));
    expect(two.greaterThan(one)).toBe(true);
  });

  it("scales a needed player up with scarcity (√-dampened)", () => {
    const normal = valuePlayer(base({ needScore: 1, scarcity: 1 }));
    const scarce = valuePlayer(base({ needScore: 1, scarcity: 4 }));
    expect(scarce.dividedBy(normal).toNumber()).toBeCloseTo(2, 5); // √4 = 2
  });

  it("keeps a needed valuation above the opening price even for a dud", () => {
    // Worst case: broke team (par = opening), quality 0, frugal, lowest jitter —
    // the 1.1× opening floor guarantees required roles stay buyable.
    const v = valuePlayer(
      base({
        needScore: 1,
        quality: 0,
        parPrice: money("2"),
        personality: "FRUGAL",
        jitter: 0,
      }),
    );
    expect(v.greaterThanOrEqualTo(money("2.2"))).toBe(true);
  });

  it("uses the unsold price as the floor unit in the re-auction", () => {
    // Re-auction lot: opening 0.5. A needed dud floors at 1.1 × 0.5 = 0.55.
    const v = valuePlayer(
      base({
        openingPrice: money("0.5"),
        parPrice: money("0.5"),
        needScore: 1,
        quality: 0,
        personality: "FRUGAL",
        jitter: 0,
      }),
    );
    expect(v.toFixed(2)).toBe("0.55");
  });

  it("orders personalities: aggressive > balanced > frugal", () => {
    const agg = valuePlayer(base({ needScore: 1, personality: "AGGRESSIVE" }));
    const bal = valuePlayer(base({ needScore: 1, personality: "BALANCED" }));
    const fru = valuePlayer(base({ needScore: 1, personality: "FRUGAL" }));
    expect(agg.greaterThan(bal)).toBe(true);
    expect(bal.greaterThan(fru)).toBe(true);
  });
});

describe("jitterFor", () => {
  it("is deterministic and in [0, 1)", () => {
    const a = jitterFor("teamA", "playerX");
    const b = jitterFor("teamA", "playerX");
    expect(a).toBe(b);
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThan(1);
  });

  it("differs across teams for the same player", () => {
    expect(jitterFor("teamA", "playerX")).not.toBe(jitterFor("teamB", "playerX"));
  });
});

describe("qualityFor", () => {
  it("is deterministic, per-player, and in [0, 1)", () => {
    expect(qualityFor("playerX")).toBe(qualityFor("playerX"));
    expect(qualityFor("playerX")).not.toBe(qualityFor("playerY"));
    expect(qualityFor("playerX")).toBeGreaterThanOrEqual(0);
    expect(qualityFor("playerX")).toBeLessThan(1);
  });

  it("differs from the (team, player) jitter for the same player", () => {
    expect(qualityFor("playerX")).not.toBe(jitterFor("teamA", "playerX"));
  });
});

describe("personalityFor", () => {
  it("assigns styles round-robin so a league always has variety", () => {
    expect(personalityFor(0)).toBe("AGGRESSIVE");
    expect(personalityFor(1)).toBe("BALANCED");
    expect(personalityFor(2)).toBe("FRUGAL");
    expect(personalityFor(3)).toBe("AGGRESSIVE");
  });
});
