import { describe, it, expect } from "vitest";
import { money } from "../lib/money.js";
import {
  maxBid,
  canAcceptBid,
  requiredIncrement,
  requiredNextBid,
  type ReserveInput,
  type IncrementTier,
} from "./reserve.js";

// Standard worked-example auction: 100 credit, min 12 players, unsold 0.5.
const base = (over: Partial<ReserveInput> = {}): ReserveInput => ({
  creditPerTeam: money("100"),
  committedAmount: money("0"),
  minPlayersPerTeam: 12,
  maxPlayersPerTeam: 25,
  playerCount: 0,
  unsoldPrice: money("0.5"),
  ...over,
});

describe("maxBid (reserve math)", () => {
  // The architecture.md §6.1 anchor: 6 players already bought for 97.0 total,
  // bidding on the 7th → must keep 5 * 0.5 = 2.5 in reserve → maxBid = 0.5.
  it("caps the 7th-player bid at 0.5 (the worked example)", () => {
    const m = maxBid(base({ committedAmount: money("97"), playerCount: 6 }));
    expect(m.toFixed(2)).toBe("0.50");
  });

  it("first player on an empty team reserves 11 slots: 100 - 5.5 = 94.5", () => {
    const m = maxBid(base({ committedAmount: money("0"), playerCount: 0 }));
    expect(m.toFixed(2)).toBe("94.50");
  });

  it("once the minimum is met the reserve term is zero (full remaining credit)", () => {
    // playerCount 12 → max(0, 12 - 13) = 0 → maxBid = credit - committed.
    const m = maxBid(base({ committedAmount: money("40"), playerCount: 12 }));
    expect(m.toFixed(2)).toBe("60.00");
  });

  it("reserve never goes negative when already past the minimum", () => {
    const m = maxBid(base({ committedAmount: money("10"), playerCount: 20 }));
    expect(m.toFixed(2)).toBe("90.00");
  });

  it("handles a zero unsold price (no reserve held back)", () => {
    const m = maxBid(
      base({ committedAmount: money("30"), playerCount: 2, unsoldPrice: money("0") }),
    );
    expect(m.toFixed(2)).toBe("70.00");
  });
});

describe("canAcceptBid (reserve + squad cap)", () => {
  const input = base({ committedAmount: money("97"), playerCount: 6 }); // maxBid 0.5

  it("accepts a bid at exactly maxBid", () => {
    expect(canAcceptBid(input, money("0.5"))).toBe(true);
  });

  it("rejects a bid above maxBid", () => {
    // Money is capped at 2 decimals, so 0.51 is the smallest amount over the 0.5 cap.
    expect(canAcceptBid(input, money("0.51"))).toBe(false);
  });

  it("rejects any bid once the squad is full, even with credit left", () => {
    const full = base({ committedAmount: money("0"), playerCount: 25, maxPlayersPerTeam: 25 });
    expect(canAcceptBid(full, money("1"))).toBe(false);
  });
});

describe("requiredIncrement", () => {
  const tiers: IncrementTier[] = [
    { fromAmount: money("0"), increment: money("0.1") },
    { fromAmount: money("2"), increment: money("0.25") },
    { fromAmount: money("5"), increment: money("0.5") },
  ];

  it("picks the tier with the greatest fromAmount <= currentPrice", () => {
    expect(requiredIncrement(money("0.5"), tiers).toFixed(2)).toBe("0.10");
    expect(requiredIncrement(money("2"), tiers).toFixed(2)).toBe("0.25");
    expect(requiredIncrement(money("4.75"), tiers).toFixed(2)).toBe("0.25");
    expect(requiredIncrement(money("9"), tiers).toFixed(2)).toBe("0.50");
  });

  it("falls back to the lowest tier below the first threshold", () => {
    const sparse: IncrementTier[] = [{ fromAmount: money("1"), increment: money("0.2") }];
    expect(requiredIncrement(money("0.5"), sparse).toFixed(2)).toBe("0.20");
  });
});

describe("requiredNextBid", () => {
  const tiers: IncrementTier[] = [
    { fromAmount: money("0"), increment: money("0.1") },
    { fromAmount: money("2"), increment: money("0.25") },
  ];

  it("the first bid must equal the base price", () => {
    expect(requiredNextBid(null, money("2"), tiers).toFixed(2)).toBe("2.00");
  });

  it("subsequent bids add the applicable increment", () => {
    expect(requiredNextBid(money("2"), money("2"), tiers).toFixed(2)).toBe("2.25");
    expect(requiredNextBid(money("0.5"), money("0.5"), tiers).toFixed(2)).toBe("0.60");
  });
});
