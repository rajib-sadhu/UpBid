import { describe, it, expect } from "vitest";
import { money } from "../../lib/money.js";
import type { IncrementTier } from "../reserve.js";
import { chooseNextBidder, type BotCandidate, type BotRules, type LotBidState } from "./bot.js";

const tiers: IncrementTier[] = [{ fromAmount: money("0"), increment: money("0.5") }];

const rules: BotRules = {
  creditPerTeam: money("100"),
  minPlayersPerTeam: 1,
  maxPlayersPerTeam: 25,
  unsoldPrice: money("0.5"),
};

const cand = (over: Partial<BotCandidate>): BotCandidate => ({
  teamId: "T",
  committedAmount: money("0"),
  playerCount: 0,
  valuation: money("10"),
  isLeader: false,
  ...over,
});

const fresh: LotBidState = { currentPrice: null, basePrice: money("2") };

describe("chooseNextBidder", () => {
  it("opens at base price with the highest-valuation team", () => {
    const next = chooseNextBidder(
      fresh,
      [cand({ teamId: "A", valuation: money("5") }), cand({ teamId: "B", valuation: money("9") })],
      rules,
      tiers,
    );
    expect(next).toEqual({ teamId: "B", amount: money("2") });
  });

  it("breaks valuation ties by teamId", () => {
    const next = chooseNextBidder(
      fresh,
      [cand({ teamId: "B", valuation: money("9") }), cand({ teamId: "A", valuation: money("9") })],
      rules,
      tiers,
    );
    expect(next?.teamId).toBe("A");
  });

  it("never bids against the current leader", () => {
    // Leader B is keenest but already winning; only A may raise.
    const state: LotBidState = { currentPrice: money("2"), basePrice: money("2") };
    const next = chooseNextBidder(
      state,
      [
        cand({ teamId: "A", valuation: money("3") }),
        cand({ teamId: "B", valuation: money("9"), isLeader: true }),
      ],
      rules,
      tiers,
    );
    expect(next).toEqual({ teamId: "A", amount: money("2.5") });
  });

  it("returns null when no challenger values the next increment", () => {
    const state: LotBidState = { currentPrice: money("3"), basePrice: money("2") };
    const next = chooseNextBidder(
      state,
      [
        cand({ teamId: "A", valuation: money("3"), isLeader: true }),
        cand({ teamId: "B", valuation: money("3.2") }), // < 3.5 required
      ],
      rules,
      tiers,
    );
    expect(next).toBeNull();
  });

  it("never bids a slot-disciplined team (valuation 0)", () => {
    // The engine sets valuation 0 for a depth player when every spare slot is
    // reserved for an unmet role need — such a team must never be chosen.
    const next = chooseNextBidder(
      fresh,
      [
        cand({ teamId: "A", valuation: money("0") }),
        cand({ teamId: "B", valuation: money("0") }),
      ],
      rules,
      tiers,
    );
    expect(next).toBeNull();
  });

  it("excludes a full squad", () => {
    const next = chooseNextBidder(
      fresh,
      [cand({ teamId: "A", playerCount: 25, valuation: money("9") })],
      rules,
      tiers,
    );
    expect(next).toBeNull();
  });

  it("excludes a team the reserve math can't afford", () => {
    // Committed 99.8 of 100, min 1 met → maxBid = 0.2 < base 2.
    const next = chooseNextBidder(
      fresh,
      [
        cand({
          teamId: "A",
          committedAmount: money("99.8"),
          playerCount: 1,
          valuation: money("9"),
        }),
      ],
      rules,
      tiers,
    );
    expect(next).toBeNull();
  });

  it("caps a needed bid by the reserve even when valuation is high", () => {
    // min 12, unsold 0.5, committed 97, playerCount 6 → maxBid for 7th = 0.5.
    // Base price 2 > 0.5 → cannot bid despite huge valuation.
    const reserveRules: BotRules = { ...rules, minPlayersPerTeam: 12 };
    const next = chooseNextBidder(
      fresh,
      [cand({ teamId: "A", committedAmount: money("97"), playerCount: 6, valuation: money("50") })],
      reserveRules,
      tiers,
    );
    expect(next).toBeNull();
  });
});
