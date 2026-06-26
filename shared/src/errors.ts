// Stable error codes shared across the wire. Bid + lineup validation add their own
// codes in later phases; these are the cross-cutting auth/CRUD ones.
export const ERROR_CODES = {
  VALIDATION_ERROR: "VALIDATION_ERROR",
  UNAUTHENTICATED: "UNAUTHENTICATED",
  INVALID_CREDENTIALS: "INVALID_CREDENTIALS",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  EMAIL_TAKEN: "EMAIL_TAKEN",
  CONFLICT: "CONFLICT",
  SPORT_MISMATCH: "SPORT_MISMATCH",
  INVALID_STATE: "INVALID_STATE",
  INTERNAL: "INTERNAL",

  // Live-auction bid pipeline (Phase 5). Returned over the socket via
  // BID_REJECTED (normal race outcomes) or ERROR (protocol/authz faults).
  LOT_NOT_LIVE: "LOT_NOT_LIVE", // lot not ON_BLOCK, or timer FROZEN/PAUSED
  BAD_AMOUNT: "BAD_AMOUNT", // amount != required base / next increment
  TEAM_FULL: "TEAM_FULL", // playerCount >= maxPlayersPerTeam
  RESERVE_EXCEEDED: "RESERVE_EXCEEDED", // amount > maxBid (reserve math)
  OUTBID: "OUTBID", // lost the optimistic compare-and-set race
  STALE_VERSION: "STALE_VERSION", // client lot version behind current
  DUPLICATE_BID: "DUPLICATE_BID", // idempotent replay of a clientBidId
  NO_LEADER: "NO_LEADER", // LOT_SELL with no bid on the lot
  MIN_NOT_MET: "MIN_NOT_MET", // complete attempted while a team is below minimum
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

/** Typed error response body returned by every endpoint on failure. */
export interface ApiError {
  code: ErrorCode | string;
  message: string;
  details?: unknown;
}
