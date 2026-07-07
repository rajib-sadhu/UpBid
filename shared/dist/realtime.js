import { z } from "zod";
import { moneyString } from "./money.js";
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
};
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
};
// ---- Shared enums ----------------------------------------------------------
export const ACQUISITION_TYPES = [
    "AUCTION",
    "REAUCTION",
    "CHOSEN",
    "FORCE_ASSIGNED",
    "RETAINED",
];
/** Phases the organizer can advance to over the socket (DRAFT→LIVE is REST). */
export const PHASE_TARGETS = ["RE_AUCTION", "ASSIGNMENT", "COMPLETED"];
// ---- Client → server payload schemas (validated server-side) ---------------
export const auctionIdSchema = z.object({ auctionId: z.string().min(1) });
export const lotRefSchema = z.object({
    auctionId: z.string().min(1),
    auctionPlayerId: z.string().min(1),
});
export const bidPlaceSchema = z.object({
    auctionId: z.string().min(1),
    auctionPlayerId: z.string().min(1),
    teamId: z.string().min(1),
    amount: moneyString,
    version: z.number().int().min(0),
    clientBidId: z.string().min(1).max(64),
});
export const timerAddSchema = z.object({
    auctionId: z.string().min(1),
    seconds: z.number().int().min(1).max(600),
});
export const phaseAdvanceSchema = z.object({
    auctionId: z.string().min(1),
    to: z.enum(PHASE_TARGETS),
});
export const assignPlayerSchema = z.object({
    auctionId: z.string().min(1),
    auctionPlayerId: z.string().min(1),
    teamId: z.string().min(1),
});
export const assignSkipSchema = z.object({
    auctionId: z.string().min(1),
    teamId: z.string().min(1),
});
export const autoStartSchema = z.object({ auctionId: z.string().min(1) });
export const autoStopSchema = z.object({ auctionId: z.string().min(1) });
// ---- Auto-pilot report -----------------------------------------------------
/** A single squad-composition role line in the best-effort auto-pilot report. */
export const SQUAD_ROLE_KEYS = [
    "WICKETKEEPER",
    "BATSMAN",
    "OPENER",
    "PACE_BOWLER",
    "SPINNER",
    "ALL_ROUNDER",
];
