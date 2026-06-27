import { maxBid } from "../../services/reserve.js";
import { sub, moneyToWire, ZERO, type Money } from "../../lib/money.js";

// Pure budget/headroom math for the monitor read models. Reuses the reserve
// math (services/reserve.ts) so the monitor's "max bid" matches what the bid
// pipeline will actually accept. No DB, no I/O — unit-tested.

export interface TeamSummaryInput {
  creditPerTeam: Money;
  committedAmount: Money;
  unsoldPrice: Money;
  minPlayersPerTeam: number;
  maxPlayersPerTeam: number;
  playerCount: number;
}

export interface TeamSummary {
  remainingCredit: string;
  maxBid: string;
  slotsRemaining: number;
  belowMinimum: boolean;
}

/** Derive the budget headroom row shown per team in the monitor. */
export function summarizeTeam(input: TeamSummaryInput): TeamSummary {
  const remaining = sub(input.creditPerTeam, input.committedAmount);
  const cap = maxBid({
    creditPerTeam: input.creditPerTeam,
    committedAmount: input.committedAmount,
    minPlayersPerTeam: input.minPlayersPerTeam,
    maxPlayersPerTeam: input.maxPlayersPerTeam,
    playerCount: input.playerCount,
    unsoldPrice: input.unsoldPrice,
  });
  return {
    remainingCredit: moneyToWire(remaining),
    // A full squad (or one that can't reserve its minimum) has no legal bid → clamp display to 0.
    maxBid: moneyToWire(
      cap.isNegative() || input.playerCount >= input.maxPlayersPerTeam ? ZERO : cap,
    ),
    slotsRemaining: Math.max(0, input.maxPlayersPerTeam - input.playerCount),
    belowMinimum: input.playerCount < input.minPlayersPerTeam,
  };
}
