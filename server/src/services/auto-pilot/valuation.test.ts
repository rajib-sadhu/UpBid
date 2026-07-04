import { describe, it, expect } from "vitest";
import { money } from "../../lib/money.js";
import { valuePlayer, jitterFor, type ValuationInput } from "./valuation.js";

const base = (over: Partial<ValuationInput> = {}): ValuationInput => ({
  basePrice: money("2"),
  slotsRemaining: 10,
  needScore: 0,
  scarcity: 1,
  jitter: 0.5, // neutral → no jitter offset
  ...over,
});

describe("valuePlayer", () => {
  it("values a full squad at zero (no slots)", () => {
    expect(valuePlayer(base({ slotsRemaining: 0 })).toFixed(2)).toBe("0.00");
  });

  it("values a needed player well above a filler", () => {
    const filler = valuePlayer(base({ needScore: 0 }));
    const needed = valuePlayer(base({ needScore: 1 }));
    expect(needed.greaterThan(filler)).toBe(true);
    // needScore 1 at neutral jitter/scarcity → 3× base = 6.0
    expect(needed.toFixed(2)).toBe("6.00");
    // filler → 1.25× base = 2.5
    expect(filler.toFixed(2)).toBe("2.50");
  });

  it("pays more when a player covers multiple unmet needs", () => {
    const one = valuePlayer(base({ needScore: 1 }));
    const two = valuePlayer(base({ needScore: 2 }));
    expect(two.greaterThan(one)).toBe(true);
  });

  it("scales a needed player up with scarcity", () => {
    const normal = valuePlayer(base({ needScore: 1, scarcity: 1 }));
    const scarce = valuePlayer(base({ needScore: 1, scarcity: 2 }));
    expect(scarce.greaterThan(normal)).toBe(true);
  });

  it("never lets a filler exceed the 3× hard cap even with high jitter", () => {
    const v = valuePlayer(base({ needScore: 0, jitter: 0.999 }));
    expect(v.lessThanOrEqualTo(money("6"))).toBe(true); // 3 × base(2)
  });

  it("keeps a needed valuation above base under the lowest jitter", () => {
    const v = valuePlayer(base({ needScore: 1, jitter: 0 }));
    expect(v.greaterThan(money("2"))).toBe(true);
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
