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
    LOT_OPEN: "LOT_OPEN",
    LOT_SELL: "LOT_SELL",
    LOT_MARK_UNSOLD: "LOT_MARK_UNSOLD",
    TIMER_ADD: "TIMER_ADD",
    TIMER_PAUSE: "TIMER_PAUSE",
    TIMER_RESUME: "TIMER_RESUME",
    PHASE_ADVANCE: "PHASE_ADVANCE",
    ASSIGN_PLAYER: "ASSIGN_PLAYER",
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
    TIMER_PAUSED: "TIMER_PAUSED",
    TIMER_RESUMED: "TIMER_RESUMED",
    PHASE_CHANGED: "PHASE_CHANGED",
    ERROR: "ERROR",
};
// ---- Shared enums ----------------------------------------------------------
export const ACQUISITION_TYPES = ["AUCTION", "REAUCTION", "CHOSEN", "FORCE_ASSIGNED"];
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
