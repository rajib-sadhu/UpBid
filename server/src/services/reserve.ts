import { add, sub, mul, lte, type Money } from "../lib/money.js";

// ===========================================================================
// Credit-reserve math — the heart of the server-authoritative bid pipeline.
// PURE functions over Decimal money + plain numbers; no DB, no socket. This is
// a mandatory unit-test target (build-plan §6). See docs/architecture.md §6.1.
//
//   maxBid = creditPerTeam - committedAmount
//          - max(0, minPlayersPerTeam - (playerCount + 1)) * unsoldPrice
//   accept B  ⟺  B <= maxBid  AND  playerCount < maxPlayersPerTeam
//
// The (playerCount + 1) term reserves enough budget to still fill the squad to
// minPlayersPerTeam at unsoldPrice AFTER winning the lot being bid on.
// ===========================================================================

export interface ReserveInput {
  creditPerTeam: Money;
  committedAmount: Money;
  minPlayersPerTeam: number;
  maxPlayersPerTeam: number;
  playerCount: number;
  unsoldPrice: Money;
}

/** Highest amount this team may legally commit to the lot it is bidding on. */
export function maxBid(input: ReserveInput): Money {
  const slotsToReserve = Math.max(0, input.minPlayersPerTeam - (input.playerCount + 1));
  const reserve = mul(input.unsoldPrice, slotsToReserve);
  return sub(sub(input.creditPerTeam, input.committedAmount), reserve);
}

/** Reserve + squad-cap check combined (the step-5/6 gate of the pipeline). */
export function canAcceptBid(input: ReserveInput, amount: Money): boolean {
  if (input.playerCount >= input.maxPlayersPerTeam) return false;
  return lte(amount, maxBid(input));
}

export interface IncrementTier {
  fromAmount: Money;
  increment: Money;
}

/**
 * Increment that applies at `currentPrice` = the increment of the tier with the
 * greatest `fromAmount <= currentPrice`. Falls back to the lowest-threshold tier
 * if none qualifies (defensive; a well-formed set includes a fromAmount=0 tier).
 */
export function requiredIncrement(currentPrice: Money, tiers: IncrementTier[]): Money {
  if (tiers.length === 0) throw new Error("No bid-increment tiers configured");
  let chosen: IncrementTier | null = null;
  let lowest: IncrementTier = tiers[0]!;
  for (const t of tiers) {
    if (t.fromAmount.lessThan(lowest.fromAmount)) lowest = t;
    if (lte(t.fromAmount, currentPrice)) {
      if (chosen === null || t.fromAmount.greaterThan(chosen.fromAmount)) chosen = t;
    }
  }
  return (chosen ?? lowest).increment;
}

/**
 * The exact amount the next bid must equal: the base price for the first bid on
 * a lot (currentPrice == null), otherwise currentPrice + the applicable
 * increment. Bids must match this exactly (no "≥").
 */
export function requiredNextBid(
  currentPrice: Money | null,
  basePrice: Money,
  tiers: IncrementTier[],
): Money {
  if (currentPrice === null) return basePrice;
  return add(currentPrice, requiredIncrement(currentPrice, tiers));
}
