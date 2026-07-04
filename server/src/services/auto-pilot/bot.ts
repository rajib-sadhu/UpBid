import { type Money } from "../../lib/money.js";
import {
  canAcceptBid,
  requiredNextBid,
  type ReserveInput,
  type IncrementTier,
} from "../reserve.js";

// ===========================================================================
// Auto-pilot bid decision — PURE. Given the lot's live state and each bot team's
// precomputed valuation (from valuation.ts) plus its tallies, decide who, if
// anyone, places the next legal bid. The engine (Phase C) calls this in a loop:
// it commits the returned bid, re-reads state, and calls again until it returns
// null — at which point the lot is sold to the leader (or unsold if no leader).
//
// A team bids the exact requiredNextBid iff ALL hold:
//   - it is not already the leader (no bidding against yourself)
//   - it has a free squad slot AND the reserve math accepts the amount
//   - its private valuation for this player >= the required amount
// The highest-valuation eligible team is chosen, so price climbs in legal
// increments until only the keenest bidder remains.
// ===========================================================================

export interface BotRules {
  creditPerTeam: Money;
  minPlayersPerTeam: number;
  maxPlayersPerTeam: number;
  unsoldPrice: Money;
}

export interface BotCandidate {
  teamId: string;
  committedAmount: Money;
  playerCount: number;
  /** This team's private maximum for the lot (from valuePlayer). */
  valuation: Money;
  /** True if this team is currently leading the lot. */
  isLeader: boolean;
}

export interface LotBidState {
  /** null before the first bid (next required = basePrice). */
  currentPrice: Money | null;
  basePrice: Money;
}

export interface NextBid {
  teamId: string;
  amount: Money;
}

/**
 * The next bot bid to place, or null if no eligible challenger remains (→ the
 * engine finalizes the lot). Deterministic: ties on valuation break by teamId.
 */
export function chooseNextBidder(
  state: LotBidState,
  candidates: BotCandidate[],
  rules: BotRules,
  tiers: IncrementTier[],
): NextBid | null {
  const amount = requiredNextBid(state.currentPrice, state.basePrice, tiers);

  let best: BotCandidate | null = null;
  for (const c of candidates) {
    if (c.isLeader) continue;
    if (c.valuation.lessThan(amount)) continue;

    const reserve: ReserveInput = {
      creditPerTeam: rules.creditPerTeam,
      committedAmount: c.committedAmount,
      minPlayersPerTeam: rules.minPlayersPerTeam,
      maxPlayersPerTeam: rules.maxPlayersPerTeam,
      playerCount: c.playerCount,
      unsoldPrice: rules.unsoldPrice,
    };
    if (!canAcceptBid(reserve, amount)) continue;

    if (
      best === null ||
      c.valuation.greaterThan(best.valuation) ||
      (c.valuation.equals(best.valuation) && c.teamId < best.teamId)
    ) {
      best = c;
    }
  }

  return best ? { teamId: best.teamId, amount } : null;
}
