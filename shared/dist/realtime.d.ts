import { z } from "zod";
import type { AuctionStatus, BiddingMode, AuctionRound, LotStatus } from "./auctions.js";
import type { Sport } from "./sports.js";
import type { CricketRole, BowlingStyle, BattingPosition, AllRounderType } from "./players.js";
import type { FootballPosition, FootballDetailPosition } from "./sports.js";
/** Client → server events (proposals; the server decides). */
export declare const CLIENT_EVENTS: {
    readonly AUCTION_JOIN: "AUCTION_JOIN";
    readonly AUCTION_LEAVE: "AUCTION_LEAVE";
    readonly BID_PLACE: "BID_PLACE";
    readonly BID_UNDO: "BID_UNDO";
    readonly BID_RESET: "BID_RESET";
    readonly LOT_OPEN: "LOT_OPEN";
    readonly LOT_SELL: "LOT_SELL";
    readonly LOT_MARK_UNSOLD: "LOT_MARK_UNSOLD";
    readonly LOT_REBID: "LOT_REBID";
    readonly SALE_REVERSE: "SALE_REVERSE";
    readonly TIMER_ADD: "TIMER_ADD";
    readonly TIMER_PAUSE: "TIMER_PAUSE";
    readonly TIMER_RESUME: "TIMER_RESUME";
    readonly PHASE_ADVANCE: "PHASE_ADVANCE";
    readonly ASSIGN_PLAYER: "ASSIGN_PLAYER";
    readonly AUTO_START: "AUTO_START";
    readonly AUCTION_SUSPEND: "AUCTION_SUSPEND";
    readonly AUCTION_RESUME: "AUCTION_RESUME";
    readonly AUCTION_CANCEL: "AUCTION_CANCEL";
};
export type ClientEvent = (typeof CLIENT_EVENTS)[keyof typeof CLIENT_EVENTS];
/** Server → client events (past-tense facts; carry a monotonic `seq`). */
export declare const SERVER_EVENTS: {
    readonly STATE_SNAPSHOT: "STATE_SNAPSHOT";
    readonly LOT_OPENED: "LOT_OPENED";
    readonly BID_ACCEPTED: "BID_ACCEPTED";
    readonly BID_REJECTED: "BID_REJECTED";
    readonly LOT_TIMER_EXPIRED: "LOT_TIMER_EXPIRED";
    readonly LOT_SOLD: "LOT_SOLD";
    readonly LOT_UNSOLD: "LOT_UNSOLD";
    readonly PLAYER_ASSIGNED: "PLAYER_ASSIGNED";
    readonly TIMER_PAUSED: "TIMER_PAUSED";
    readonly TIMER_RESUMED: "TIMER_RESUMED";
    readonly PHASE_CHANGED: "PHASE_CHANGED";
    readonly AUTO_FINISHED: "AUTO_FINISHED";
    readonly ERROR: "ERROR";
};
export type ServerEvent = (typeof SERVER_EVENTS)[keyof typeof SERVER_EVENTS];
export declare const ACQUISITION_TYPES: readonly ["AUCTION", "REAUCTION", "CHOSEN", "FORCE_ASSIGNED"];
export type AcquisitionType = (typeof ACQUISITION_TYPES)[number];
/** The three timer states of a lot on the block (§7 of architecture.md). */
export type TimerState = "BIDDING" | "FROZEN" | "PAUSED";
/** Phases the organizer can advance to over the socket (DRAFT→LIVE is REST). */
export declare const PHASE_TARGETS: readonly ["RE_AUCTION", "ASSIGNMENT", "COMPLETED"];
export type PhaseTarget = (typeof PHASE_TARGETS)[number];
export declare const auctionIdSchema: z.ZodObject<{
    auctionId: z.ZodString;
}, "strip", z.ZodTypeAny, {
    auctionId: string;
}, {
    auctionId: string;
}>;
export type AuctionIdPayload = z.infer<typeof auctionIdSchema>;
export declare const lotRefSchema: z.ZodObject<{
    auctionId: z.ZodString;
    auctionPlayerId: z.ZodString;
}, "strip", z.ZodTypeAny, {
    auctionId: string;
    auctionPlayerId: string;
}, {
    auctionId: string;
    auctionPlayerId: string;
}>;
export type LotRefPayload = z.infer<typeof lotRefSchema>;
export declare const bidPlaceSchema: z.ZodObject<{
    auctionId: z.ZodString;
    auctionPlayerId: z.ZodString;
    teamId: z.ZodString;
    amount: z.ZodEffects<z.ZodString, string, string>;
    version: z.ZodNumber;
    clientBidId: z.ZodString;
}, "strip", z.ZodTypeAny, {
    auctionId: string;
    auctionPlayerId: string;
    teamId: string;
    amount: string;
    version: number;
    clientBidId: string;
}, {
    auctionId: string;
    auctionPlayerId: string;
    teamId: string;
    amount: string;
    version: number;
    clientBidId: string;
}>;
export type BidPlacePayload = z.infer<typeof bidPlaceSchema>;
export declare const timerAddSchema: z.ZodObject<{
    auctionId: z.ZodString;
    seconds: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    auctionId: string;
    seconds: number;
}, {
    auctionId: string;
    seconds: number;
}>;
export type TimerAddPayload = z.infer<typeof timerAddSchema>;
export declare const phaseAdvanceSchema: z.ZodObject<{
    auctionId: z.ZodString;
    to: z.ZodEnum<["RE_AUCTION", "ASSIGNMENT", "COMPLETED"]>;
}, "strip", z.ZodTypeAny, {
    auctionId: string;
    to: "RE_AUCTION" | "ASSIGNMENT" | "COMPLETED";
}, {
    auctionId: string;
    to: "RE_AUCTION" | "ASSIGNMENT" | "COMPLETED";
}>;
export type PhaseAdvancePayload = z.infer<typeof phaseAdvanceSchema>;
export declare const assignPlayerSchema: z.ZodObject<{
    auctionId: z.ZodString;
    auctionPlayerId: z.ZodString;
    teamId: z.ZodString;
}, "strip", z.ZodTypeAny, {
    auctionId: string;
    auctionPlayerId: string;
    teamId: string;
}, {
    auctionId: string;
    auctionPlayerId: string;
    teamId: string;
}>;
export type AssignPlayerPayload = z.infer<typeof assignPlayerSchema>;
export declare const autoStartSchema: z.ZodObject<{
    auctionId: z.ZodString;
}, "strip", z.ZodTypeAny, {
    auctionId: string;
}, {
    auctionId: string;
}>;
export type AutoStartPayload = z.infer<typeof autoStartSchema>;
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
    lots: {
        counts: LotCounts;
        items: LiveLot[];
    };
    /** Server clock for client skew correction. ISO. */
    serverTime: string;
}
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
    bid: {
        teamId: string;
        bidderUserId: string;
        amount: string;
        createdAt: string;
    };
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
/** A single squad-composition role line in the best-effort auto-pilot report. */
export declare const SQUAD_ROLE_KEYS: readonly ["WICKETKEEPER", "BATSMAN", "OPENER", "PACE_BOWLER", "SPINNER", "ALL_ROUNDER"];
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
/** Sent only to the offending socket — a protocol/authz fault. */
export interface SocketErrorEvent {
    code: string;
    message: string;
}
