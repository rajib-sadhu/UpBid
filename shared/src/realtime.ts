import { z } from "zod";
import { moneyString } from "./money.js";
import type { AuctionStatus, BiddingMode, AuctionRound, LotStatus } from "./auctions.js";
import type { Sport } from "./sports.js";
import type { CricketRole, BowlingStyle } from "./players.js";

// ===========================================================================
// Real-time auction protocol (Phase 5/6). Shared by the Socket.io gateway
// (server) and the useAuctionRoom hook (client) so both validate and type the
// same shapes. Money fields are STRINGS in crore units (never JS numbers).
// See docs/architecture.md for the full design.
// ===========================================================================

// ---- Event names -----------------------------------------------------------

/** Client → server events (proposals; the server decides). */
export const CLIENT_EVENTS = {
  AUCTION_JOIN: "AUCTION_JOIN",
  AUCTION_LEAVE: "AUCTION_LEAVE",
  BID_PLACE: "BID_PLACE",
  LOT_OPEN: "LOT_OPEN",
  LOT_SELL: "LOT_SELL",
  LOT_MARK_UNSOLD: "LOT_MARK_UNSOLD",
  TIMER_ADD: "TIMER_ADD",
  TIMER_PAUSE: "TIMER_PAUSE",
  TIMER_RESUME: "TIMER_RESUME",
  PHASE_ADVANCE: "PHASE_ADVANCE",
  ASSIGN_PLAYER: "ASSIGN_PLAYER",
} as const;
export type ClientEvent = (typeof CLIENT_EVENTS)[keyof typeof CLIENT_EVENTS];

/** Server → client events (past-tense facts; carry a monotonic `seq`). */
export const SERVER_EVENTS = {
  STATE_SNAPSHOT: "STATE_SNAPSHOT",
  LOT_OPENED: "LOT_OPENED",
  BID_ACCEPTED: "BID_ACCEPTED",
  BID_REJECTED: "BID_REJECTED",
  LOT_TIMER_EXPIRED: "LOT_TIMER_EXPIRED",
  LOT_SOLD: "LOT_SOLD",
  LOT_UNSOLD: "LOT_UNSOLD",
  PLAYER_ASSIGNED: "PLAYER_ASSIGNED",
  TIMER_PAUSED: "TIMER_PAUSED",
  TIMER_RESUMED: "TIMER_RESUMED",
  PHASE_CHANGED: "PHASE_CHANGED",
  ERROR: "ERROR",
} as const;
export type ServerEvent = (typeof SERVER_EVENTS)[keyof typeof SERVER_EVENTS];

// ---- Shared enums ----------------------------------------------------------

export const ACQUISITION_TYPES = ["AUCTION", "REAUCTION", "CHOSEN", "FORCE_ASSIGNED"] as const;
export type AcquisitionType = (typeof ACQUISITION_TYPES)[number];

/** The three timer states of a lot on the block (§7 of architecture.md). */
export type TimerState = "BIDDING" | "FROZEN" | "PAUSED";

/** Phases the organizer can advance to over the socket (DRAFT→LIVE is REST). */
export const PHASE_TARGETS = ["RE_AUCTION", "ASSIGNMENT", "COMPLETED"] as const;
export type PhaseTarget = (typeof PHASE_TARGETS)[number];

// ---- Client → server payload schemas (validated server-side) ---------------

export const auctionIdSchema = z.object({ auctionId: z.string().min(1) });
export type AuctionIdPayload = z.infer<typeof auctionIdSchema>;

export const lotRefSchema = z.object({
  auctionId: z.string().min(1),
  auctionPlayerId: z.string().min(1),
});
export type LotRefPayload = z.infer<typeof lotRefSchema>;

export const bidPlaceSchema = z.object({
  auctionId: z.string().min(1),
  auctionPlayerId: z.string().min(1),
  teamId: z.string().min(1),
  amount: moneyString,
  version: z.number().int().min(0),
  clientBidId: z.string().min(1).max(64),
});
export type BidPlacePayload = z.infer<typeof bidPlaceSchema>;

export const timerAddSchema = z.object({
  auctionId: z.string().min(1),
  seconds: z.number().int().min(1).max(600),
});
export type TimerAddPayload = z.infer<typeof timerAddSchema>;

export const phaseAdvanceSchema = z.object({
  auctionId: z.string().min(1),
  to: z.enum(PHASE_TARGETS),
});
export type PhaseAdvancePayload = z.infer<typeof phaseAdvanceSchema>;

export const assignPlayerSchema = z.object({
  auctionId: z.string().min(1),
  auctionPlayerId: z.string().min(1),
  teamId: z.string().min(1),
});
export type AssignPlayerPayload = z.infer<typeof assignPlayerSchema>;

// ---- Server → client DTOs --------------------------------------------------

export interface SnapshotAuction {
  id: string;
  name: string;
  status: AuctionStatus;
  round: AuctionRound;
  biddingMode: BiddingMode;
  sport: Sport;
}

export interface SnapshotRules {
  creditPerTeam: string;
  minPlayersPerTeam: number;
  maxPlayersPerTeam: number;
  unsoldPrice: string;
  defaultLotDurationSec: number;
}

export interface SnapshotTier {
  fromAmount: string;
  increment: string;
}

export interface SnapshotTeam {
  id: string;
  name: string;
  shortName: string | null;
  primaryColor: string | null;
  secondaryColor: string | null;
  logoUrl: string | null;
  ownerUserId: string | null;
  committedAmount: string;
  playerCount: number;
  /** Server-computed reserve cap for this team (display only; re-checked on bid). */
  maxBid: string;
}

/** Lightweight per-team tally embedded in deltas after a finalize/assignment. */
export interface TeamTally {
  id: string;
  committedAmount: string;
  playerCount: number;
  maxBid: string;
}

export interface CurrentLot {
  auctionPlayerId: string;
  playerId: string;
  playerName: string;
  photoUrl: string | null;
  isOverseas: boolean;
  basePrice: string;
  status: LotStatus;
  round: AuctionRound;
  /** null before the first bid → the next required bid is basePrice. */
  currentPrice: string | null;
  leadingTeamId: string | null;
  /** Server-computed: currentPrice + increment, or basePrice for the first bid. */
  requiredNextBid: string;
  version: number;
  timerState: TimerState;
  /** ISO; null when FROZEN or PAUSED. */
  endsAt: string | null;
  /** ms left, set only when PAUSED. */
  remainingMs: number | null;
}

/** A lot as shown in the queue/board and assignment list. */
export interface LiveLot {
  auctionPlayerId: string;
  playerId: string;
  playerName: string;
  photoUrl: string | null;
  isOverseas: boolean;
  basePrice: string;
  status: LotStatus;
  round: AuctionRound;
  lotOrder: number | null;
  soldPrice: string | null;
  soldToTeamId: string | null;
  /** Cricket attributes for section-wise grouping; null for non-cricket players. */
  cricketRole: CricketRole | null;
  bowlingStyle: BowlingStyle | null;
}

export interface LotCounts {
  PENDING: number;
  ON_BLOCK: number;
  SOLD: number;
  UNSOLD: number;
  ASSIGNED: number;
}

export interface StateSnapshot {
  seq: number;
  auction: SnapshotAuction;
  rules: SnapshotRules | null;
  incrementTiers: SnapshotTier[];
  teams: SnapshotTeam[];
  currentLot: CurrentLot | null;
  lots: { counts: LotCounts; items: LiveLot[] };
  /** Server clock for client skew correction. ISO. */
  serverTime: string;
}

// ---- Delta event payloads (server → room) ----------------------------------

export interface LotOpenedEvent {
  seq: number;
  currentLot: CurrentLot;
}

export interface BidAcceptedEvent {
  seq: number;
  auctionPlayerId: string;
  currentPrice: string;
  leadingTeamId: string;
  version: number;
  endsAt: string | null;
  requiredNextBid: string;
  bid: { teamId: string; bidderUserId: string; amount: string; createdAt: string };
  team: TeamTally;
}

/** Sent only to the bidding socket — a normal race outcome, not a fault. */
export interface BidRejectedEvent {
  seq: number;
  clientBidId: string;
  code: string;
  message: string;
}

export interface LotTimerExpiredEvent {
  seq: number;
  auctionPlayerId: string;
}

export interface LotSoldEvent {
  seq: number;
  auctionPlayerId: string;
  soldToTeamId: string;
  soldPrice: string;
  team: TeamTally;
  lotCounts: LotCounts;
  lot: LiveLot;
}

export interface LotUnsoldEvent {
  seq: number;
  auctionPlayerId: string;
  lotCounts: LotCounts;
  lot: LiveLot;
}

export interface PlayerAssignedEvent {
  seq: number;
  auctionPlayerId: string;
  teamId: string;
  price: string;
  acquiredVia: AcquisitionType;
  team: TeamTally;
  lotCounts: LotCounts;
  lot: LiveLot;
}

export interface TimerPausedEvent {
  seq: number;
  auctionPlayerId: string;
  remainingMs: number;
}

export interface TimerResumedEvent {
  seq: number;
  auctionPlayerId: string;
  endsAt: string;
}

export interface PhaseChangedEvent {
  seq: number;
  status: AuctionStatus;
  round: AuctionRound;
}

/** Sent only to the offending socket — a protocol/authz fault. */
export interface SocketErrorEvent {
  code: string;
  message: string;
}
