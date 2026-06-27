import { describe, it, expect } from "vitest";
import { money } from "../../lib/money.js";
import { summarizeTeam, type TeamSummaryInput } from "./monitor.service.js";

// Same worked-example auction as reserve.test.ts: 100 credit, min 12, unsold 0.5.
const base = (over: Partial<TeamSummaryInput> = {}): TeamSummaryInput => ({
  creditPerTeam: money("100"),
  committedAmount: money("0"),
  unsoldPrice: money("0.5"),
  minPlayersPerTeam: 12,
  maxPlayersPerTeam: 25,
  playerCount: 0,
  ...over,
});

describe("summarizeTeam (monitor headroom)", () => {
  it("fresh team: full credit remaining, maxBid reserves 11 slots, 25 slots open", () => {
    const s = summarizeTeam(base());
    expect(s.remainingCredit).toBe("100.00");
    expect(s.maxBid).toBe("94.50"); // 100 - 11*0.5
    expect(s.slotsRemaining).toBe(25);
    expect(s.belowMinimum).toBe(true);
  });

  it("mirrors the reserve worked example: 6 bought for 97 → maxBid 0.5", () => {
    const s = summarizeTeam(base({ committedAmount: money("97"), playerCount: 6 }));
    expect(s.remainingCredit).toBe("3.00");
    expect(s.maxBid).toBe("0.50");
    expect(s.slotsRemaining).toBe(19);
    expect(s.belowMinimum).toBe(true);
  });

  it("at/above the minimum the team is no longer belowMinimum", () => {
    const s = summarizeTeam(base({ committedAmount: money("40"), playerCount: 12 }));
    expect(s.maxBid).toBe("60.00"); // reserve term zero
    expect(s.belowMinimum).toBe(false);
  });

  it("a full squad shows zero maxBid and zero slots remaining", () => {
    const s = summarizeTeam(base({ committedAmount: money("90"), playerCount: 25 }));
    expect(s.maxBid).toBe("0.00");
    expect(s.slotsRemaining).toBe(0);
    expect(s.belowMinimum).toBe(false);
  });

  it("clamps a negative reserve cap to zero (over-committed edge)", () => {
    // committed 99.9, 1 player, still owes 10 slots * 0.5 = 5 reserve → cap negative.
    const s = summarizeTeam(base({ committedAmount: money("99.9"), playerCount: 1 }));
    expect(s.maxBid).toBe("0.00");
    expect(s.remainingCredit).toBe("0.10");
  });
});
