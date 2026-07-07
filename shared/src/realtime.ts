import { z } from "zod";
import { moneyString } from "./money.js";
import type { AuctionStatus, BiddingMode, AuctionRound, LotStatus } from "./auctions.js";
import type { Sport } from "./sports.js";
import type { CricketRole, BowlingStyle, BattingPosition, AllRounderType } from "./players.js";
import type { FootballPosition, FootballDetailPosition } from "./sports.js";

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
  BID_UNDO: "BID_UNDO",
  BID_RESET: "BID_RESET",
  LOT_OPEN: "LOT_OPEN",
  LOT_SELL: "LOT_SELL",
  LOT_MARK_UNSOLD: "LOT_MARK_UNSOLD",
  LOT_REBID: "LOT_REBID",
  SALE_REVERSE: "SALE_REVERSE",
  TIMER_ADD: "TIMER_ADD",
  TIMER_PAUSE: "TIMER_PAUSE",
  TIMER_RESUME: "TIMER_RESUME",
  PHASE_ADVANCE: "PHASE_ADVANCE",
  ASSIGN_PLAYER: "ASSIGN_PLAYER",
  // Organizer toggles a team out of / back into the assignment pick rotation
  // (an absent team must not stall everyone else's turns).
  ASSIGN_SKIP: "ASSIGN_SKIP",
  // Auto-pilot: organizer hands the whole auction to the server bot engine.
  // AUTO_STOP freezes the bots immediately (the auction stays LIVE and the
  // organizer takes manual control; AUTO_START may resume later, even mid-lot).
  // AUCTION_SUSPEND / AUCTION_CANCEL remain the whole-auction kill-switch.
  AUTO_START: "AUTO_START",
  AUTO_STOP: "AUTO_STOP",
  // Whole-auction lifecycle (organizer; broadcast a fresh snapshot).
  AUCTION_SUSPEND: "AUCTION_SUSPEND",
  AUCTION_RESUME: "AUCTION_RESUME",
  AUCTION_CANCEL: "AUCTION_CANCEL",
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
  // Assignment pick rotation changed without a player moving (organizer skip).
  ASSIGN_TURN: "ASSIGN_TURN",
  TIMER_PAUSED: "TIMER_PAUSED",
  TIMER_RESUMED: "TIMER_RESUMED",
  PHASE_CHANGED: "PHASE_CHANGED",
  // Auto-pilot finished (reached COMPLETED or stopped short); carries the
  // best-effort squad-composition report.
  AUTO_FINISHED: "AUTO_FINISHED",
  // Auto-pilot was stopped by the organizer mid-run: bots freeze in place, the
  // auction stays live and manual control returns (no report — nothing ended).
  AUTO_STOPPED: "AUTO_STOPPED",
  // Connection-quality probe: emitted per socket with an ack callback the
  // client must invoke immediately; the round trip is the user's latency.
  PRESENCE_PING: "PRESENCE_PING",
  // Per-auction connection report, sent only to the auction's organizer/admin
  // sockets every few seconds. No seq — display-only, not auction state.
  PRESENCE: "PRESENCE",
  ERROR: "ERROR",
} as const;
export type ServerEvent = (typeof SERVER_EVENTS)[keyof typeof SERVER_EVENTS];

// ---- Shared enums ----------------------------------------------------------

export const ACQUISITION_TYPES = [
  "AUCTION",
  "REAUCTION",
  "CHOSEN",
  "FORCE_ASSIGNED",
  "RETAINED",
] as const;
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

export const assignSkipSchema = z.object({
  auctionId: z.string().min(1),
  teamId: z.string().min(1),
});
export type AssignSkipPayload = z.infer<typeof assignSkipSchema>;

export const autoStartSchema = z.object({ auctionId: z.string().min(1) });
export type AutoStartPayload = z.infer<typeof autoStartSchema>;

export const autoStopSchema = z.object({ auctionId: z.string().min(1) });
export type AutoStopPayload = z.infer<typeof autoStopSchema>;

// ---- Server → client DTOs --------------------------------------------------

export interface SnapshotAuction {
  id: string;
  name: string;
  status: AuctionStatus;
  round: AuctionRound;
  biddingMode: BiddingMode;
  sport: Sport;
  /** True while the server bot engine is driving this auction (UI is view-only). */
  autoPilot: boolean;
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
  /** Player attributes for the on-the-block board card (display only). */
  sport: Sport;
  nationality: string | null;
  role: string | null;
  cricketRole: CricketRole | null;
  battingPosition: BattingPosition | null;
  bowlingStyle: BowlingStyle | null;
  allRounderType: AllRounderType | null;
  footballPosition: FootballPosition | null;
  footballDetailPosition: FootballDetailPosition | null;
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

/**
 * ASSIGNMENT-phase pick rotation. Teams take players one at a time in a fixed
 * order (most free slots at phase entry first, alphabetical on ties), cycling
 * round by round; every player received (self-pick or force-assign) consumes
 * the team's turn. Only teams still able to receive a player (below the squad
 * cap, can afford the unsold price, not skipped) are listed — index 0 picks
 * now. Server-computed; franchise self-picks are rejected out of turn.
 */
export interface AssignmentState {
  pickQueue: string[];
  /** Teams the organizer skipped out of the rotation (force-assign still works). */
  skipped: string[];
}

export interface LotCounts {
  PENDING: number;
  ON_BLOCK: number;
  SOLD: number;
  UNSOLD: number;
  ASSIGNED: number;
  /** Pre-auction retentions; never in the bidding queue. */
  RETAINED: number;
}

export interface StateSnapshot {
  seq: number;
  auction: SnapshotAuction;
  rules: SnapshotRules | null;
  incrementTiers: SnapshotTier[];
  teams: SnapshotTeam[];
  currentLot: CurrentLot | null;
  lots: { counts: LotCounts; items: LiveLot[] };
  /** Pick rotation; non-null only while the auction is in ASSIGNMENT. */
  assignment: AssignmentState | null;
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
  /** Rotation after this assignment (the receiving team's free slots shrank). */
  assignment: AssignmentState;
}

export interface AssignTurnEvent {
  seq: number;
  assignment: AssignmentState;
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
  /** Fresh pick rotation when entering ASSIGNMENT; null otherwise. */
  assignment: AssignmentState | null;
}

// ---- Auto-pilot report -----------------------------------------------------

/** A single squad-composition role line in the best-effort auto-pilot report. */
export const SQUAD_ROLE_KEYS = [
  "WICKETKEEPER",
  "BATSMAN",
  "OPENER",
  "PACE_BOWLER",
  "SPINNER",
  "ALL_ROUNDER",
] as const;
export type SquadRoleKey = (typeof SQUAD_ROLE_KEYS)[number];

export interface SquadRoleReport {
  role: SquadRoleKey;
  required: number;
  got: number;
  /** max(0, required - got) — how many of this role the team fell short by. */
  short: number;
}

export interface TeamSquadReport {
  teamId: string;
  teamName: string;
  playerCount: number;
  /** Whether the team reached minPlayersPerTeam (a hard requirement). */
  minPlayersMet: boolean;
  roles: SquadRoleReport[];
}

export interface AutoFinishedEvent {
  seq: number;
  status: AuctionStatus;
  round: AuctionRound;
  /** True if the run reached COMPLETED; false if it stopped short (pool too small / aborted). */
  completed: boolean;
  report: TeamSquadReport[];
}

/** Auto-pilot stopped by the organizer; a fresh STATE_SNAPSHOT follows. */
export interface AutoStoppedEvent {
  seq: number;
}

/**
 * Who is connected to the auction room and how good their connection is.
 * Key = userId, value = last measured round-trip in ms (null = connected but
 * not yet measured). A user absent from the map is offline / not joined.
 */
export interface PresenceEvent {
  users: Record<string, number | null>;
}

/** Sent only to the offending socket — a protocol/authz fault. */
export interface SocketErrorEvent {
  code: string;
  message: string;
}
