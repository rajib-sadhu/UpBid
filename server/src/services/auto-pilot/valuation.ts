import { money, mul, ZERO, type Money } from "../../lib/money.js";

// ===========================================================================
// Auto-pilot valuation — a bot team's PRIVATE maximum willingness to pay for a
// player, in crore units. Pure: no DB, no reserve/budget (the bid decision in
// bot.ts applies the reserve cap separately), no global randomness — variety
// comes from a deterministic per-(team,player) jitter passed in.
//
// Shape of the model:
//   slotsRemaining <= 0          → 0 (squad full, never bid)
//   fills an unmet role need     → basePrice × NEED_MULT, boosted by how many
//                                  needs it covers and by role scarcity
//   depth only (no unmet need)   → basePrice × FILLER_MULT, hard-capped so bots
//                                  never splurge on a player they don't need
//   × jitter (±JITTER/2) for non-identical team behaviour
//
// Competition then pushes the live price up in legal increments until only the
// highest-valuation team remains, so a contested/scarce player sells dear and a
// filler sells near base — all within the reserve math.
// ===========================================================================

const NEED_MULT = 3; // a player that fills an unmet minimum is worth ~3× base…
const NEED_PER_EXTRA = 0.5; // …+50% for each ADDITIONAL unmet bucket it covers
const FILLER_MULT = 1.25; // depth players are worth a little over base
const FILLER_CAP_MULT = 3; // …but never more than 3× base
const JITTER = 0.3; // ±15% spread between teams

export interface ValuationInput {
  /** The lot's base price (lower bound of any sale). */
  basePrice: Money;
  /** maxPlayersPerTeam − playerCount: 0 ⇒ no room ⇒ value 0. */
  slotsRemaining: number;
  /** Unmet role buckets this player covers for the team (0 ⇒ depth only). */
  needScore: number;
  /** Role scarcity multiplier (≥1; 1 = neutral). Rarer roles value higher. */
  scarcity: number;
  /** Deterministic per-(team,player) value in [0, 1) for inter-team variety. */
  jitter: number;
}

/** A bot team's private maximum bid for a player (crore units). */
export function valuePlayer(input: ValuationInput): Money {
  if (input.slotsRemaining <= 0) return ZERO;

  const jitterFactor = 1 + (input.jitter - 0.5) * JITTER;
  const scarcity = Math.max(1, input.scarcity);

  if (input.needScore > 0) {
    const needFactor = NEED_MULT * (1 + NEED_PER_EXTRA * (input.needScore - 1));
    return money(mul(input.basePrice, needFactor * scarcity * jitterFactor));
  }

  // Depth/filler: modest premium over base, hard-capped.
  const raw = mul(input.basePrice, FILLER_MULT * jitterFactor);
  const cap = mul(input.basePrice, FILLER_CAP_MULT);
  return money(raw.greaterThan(cap) ? cap : raw);
}

/**
 * Deterministic jitter in [0, 1) for a (team, player) pair — a tiny FNV-1a hash
 * so each team values each player slightly differently, reproducibly, with no
 * Math.random (keeps the engine resumable/testable).
 */
export function jitterFor(teamId: string, playerId: string): number {
  const s = `${teamId}:${playerId}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  // >>> 0 → unsigned; divide by 2^32 for [0, 1).
  return (h >>> 0) / 0x100000000;
}
