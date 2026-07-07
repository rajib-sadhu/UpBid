import { money, mul, maxMoney, ZERO, type Money } from "../../lib/money.js";

// ===========================================================================
// Auto-pilot valuation — a bot team's PRIVATE maximum willingness to pay for a
// player, in crore units. Pure: no DB, no reserve math (the bid decision in
// bot.ts applies the reserve cap separately), no global randomness — variety
// comes from deterministic hashes passed in.
//
// The anchor is the team's PAR PRICE — its remaining credit divided by its
// remaining squad slots — not the lot's base price. That is what makes teams
// actually USE their budget: a team that under-spends early sees its par rise,
// so it bids bigger later; a team that splurged sees par (and the reserve cap)
// pull it back. Aggregate spend lands in the 80–95% band naturally.
//
// Shape of the model:
//   slotsRemaining <= 0          → 0 (squad full, never bid)
//   fills an unmet role need     → par × needFactor × star × √scarcity, floored
//                                  above the opening price so required roles
//                                  always find a buyer while supply lasts
//   depth only (no unmet need)   → par × (0.35–1.25 by quality): only players
//                                  the team rates clear the opening price, so
//                                  weak fits get passed and lots go UNSOLD
//   × quality  — shared per-player "market perception": a few stars are worth
//                multiples of par, most players are ordinary (quality² skew)
//   × personality — AGGRESSIVE / BALANCED / FRUGAL so teams behave differently
//   × jitter   — per-(team,player) disagreement about a player's worth
// ===========================================================================

const NEED_BASE = 1.0; // a needed player is worth about par…
const NEED_PER_EXTRA = 0.3; // …+30% per ADDITIONAL unmet bucket it covers
const NEED_FLOOR_MULT = 1.1; // …and never below 1.1× the opening price
const JITTER = 0.5; // ±25% disagreement between teams

// Star factor from shared per-player quality q∈[0,1): quality² skew makes most
// players ordinary and a handful genuinely expensive.
const STAR_MIN = 0.6;
const STAR_SPAN = 1.6; // star factor ∈ [0.6, 2.2)

// Depth/filler appetite, relative to par: weak fits fall under the opening
// price and get passed — the source of natural UNSOLD lots.
const FILLER_MIN = 0.35;
const FILLER_SPAN = 0.9; // filler factor ∈ [0.35, 1.25) × par before jitter

/** Bot team bidding styles — assigned round-robin so every league has variety. */
export const PERSONALITIES = ["AGGRESSIVE", "BALANCED", "FRUGAL"] as const;
export type Personality = (typeof PERSONALITIES)[number];

const PERSONALITY_MULT: Record<Personality, number> = {
  AGGRESSIVE: 1.2, // chases the players it wants well past the market
  BALANCED: 1.0,
  FRUGAL: 0.85, // hunts bargains, drops out of wars early
};

export interface ValuationInput {
  /** Where bidding starts for this lot (base price, or unsold price in the
   * re-auction round) — the pass/bid threshold and the floor unit. */
  openingPrice: Money;
  /** The team's budget anchor: remaining credit / remaining slots (≥ opening). */
  parPrice: Money;
  /** maxPlayersPerTeam − playerCount: 0 ⇒ no room ⇒ value 0. */
  slotsRemaining: number;
  /** Unmet role buckets this player covers for the team (0 ⇒ depth only). */
  needScore: number;
  /** Role scarcity multiplier (≥1). Dampened by √ before applying. */
  scarcity: number;
  /** Shared per-player market perception in [0, 1) — the "star" signal. */
  quality: number;
  /** This team's bidding style. */
  personality: Personality;
  /** Deterministic per-(team,player) value in [0, 1) for inter-team variety. */
  jitter: number;
}

/** A bot team's private maximum bid for a player (crore units). */
export function valuePlayer(input: ValuationInput): Money {
  if (input.slotsRemaining <= 0) return ZERO;

  const jitterFactor = 1 + (input.jitter - 0.5) * JITTER;
  const starFactor = STAR_MIN + STAR_SPAN * input.quality * input.quality;
  const style = PERSONALITY_MULT[input.personality];

  if (input.needScore > 0) {
    const needFactor = NEED_BASE + NEED_PER_EXTRA * (input.needScore - 1);
    const scarcity = Math.sqrt(Math.max(1, input.scarcity));
    const raw = mul(input.parPrice, needFactor * starFactor * scarcity * style * jitterFactor);
    const floor = mul(input.openingPrice, NEED_FLOOR_MULT);
    return maxMoney(money(raw), money(floor));
  }

  // Depth/filler: only a player the team rates clears the opening price; the
  // rest are passed (valuation < opening ⇒ the bot never bids ⇒ UNSOLD).
  const fillerFactor = FILLER_MIN + FILLER_SPAN * input.quality * input.quality;
  return money(mul(input.parPrice, fillerFactor * style * jitterFactor));
}

/** Tiny FNV-1a over a string → [0, 1). Deterministic, no Math.random. */
function hash01(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  // >>> 0 → unsigned; divide by 2^32 for [0, 1).
  return (h >>> 0) / 0x100000000;
}

/**
 * Deterministic jitter in [0, 1) for a (team, player) pair so each team values
 * each player slightly differently, reproducibly (keeps the engine resumable).
 */
export function jitterFor(teamId: string, playerId: string): number {
  return hash01(`${teamId}:${playerId}`);
}

/**
 * Shared per-player market perception in [0, 1): every team sees roughly the
 * same handful of "stars" (and agrees the rest are ordinary), which is what
 * turns good players into multi-team bidding wars.
 */
export function qualityFor(playerId: string): number {
  return hash01(`q:${playerId}`);
}

/** Round-robin style by the team's stable position in the auction. */
export function personalityFor(teamIndex: number): Personality {
  return PERSONALITIES[teamIndex % PERSONALITIES.length]!;
}
