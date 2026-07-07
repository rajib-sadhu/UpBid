import { z } from "zod";
import { moneyString, positiveMoneyString } from "./money.js";
// Mirror Prisma enums (string values) so the client never imports @prisma/client.
export const AUCTION_STATUSES = [
    "DRAFT",
    "LIVE",
    "PAUSED",
    "RE_AUCTION",
    "ASSIGNMENT",
    "COMPLETED",
    "SUSPENDED",
    "CANCELLED",
];
export const BIDDING_MODES = ["ORGANIZER", "FRANCHISE"];
export const AUCTION_ROUNDS = ["MAIN", "RE_AUCTION", "ASSIGNMENT"];
export const LOT_STATUSES = [
    "PENDING",
    "ON_BLOCK",
    "SOLD",
    "UNSOLD",
    "ASSIGNED",
    "RETAINED",
];
// ---- Auction ---------------------------------------------------------------
export const createAuctionSchema = z.object({
    name: z.string().trim().min(1, "Name is required").max(120),
    biddingMode: z.enum(BIDDING_MODES).default("FRANCHISE"),
    // Optional template: copy settings (rules, increment tiers, squad targets,
    // lineup rules, formations) from another auction of the SAME league. The lot
    // list is never copied. Empty string = no template (HTML select convenience).
    cloneFromAuctionId: z.string().trim().optional(),
});
export const updateAuctionSchema = z.object({
    name: z.string().trim().min(1, "Name is required").max(120),
    biddingMode: z.enum(BIDDING_MODES),
});
// ---- Rules -----------------------------------------------------------------
export const auctionRulesSchema = z
    .object({
    creditPerTeam: positiveMoneyString,
    minPlayersPerTeam: z.coerce.number().int().min(1),
    maxPlayersPerTeam: z.coerce.number().int().min(1),
    unsoldPrice: moneyString,
    defaultBasePrice: positiveMoneyString,
    defaultLotDurationSec: z.coerce.number().int().min(5).max(600).default(30),
    maxRetentionsPerTeam: z.coerce.number().int().min(0).max(100).default(0),
})
    .refine((v) => v.maxPlayersPerTeam >= v.minPlayersPerTeam, {
    message: "Max players must be ≥ min players",
    path: ["maxPlayersPerTeam"],
});
// ---- Bid-increment tiers ---------------------------------------------------
export const incrementTierSchema = z.object({
    fromAmount: moneyString,
    increment: positiveMoneyString,
});
export const incrementTiersSchema = z.object({
    tiers: z
        .array(incrementTierSchema)
        .min(1, "Add at least one tier")
        .max(50)
        // fromAmount must be unique within the set.
        .refine((arr) => new Set(arr.map((t) => t.fromAmount)).size === arr.length, {
        message: "Tier thresholds must be unique",
    }),
});
// ---- Lineup rules ----------------------------------------------------------
export const lineupRulesSchema = z
    .object({
    startingSize: z.coerce.number().int().min(1).max(23).default(11),
    overseasCapEnabled: z.coerce.boolean().default(false),
    maxOverseasInXI: z.coerce.number().int().min(0).max(23).optional(),
    requireWicketkeeper: z.coerce.boolean().default(true),
    requireCaptain: z.coerce.boolean().default(true),
    requireViceCaptain: z.coerce.boolean().default(true),
    requireFirstBowler: z.coerce.boolean().default(true),
    requireSecondBowler: z.coerce.boolean().default(true),
    requireFullBattingOrder: z.coerce.boolean().default(true),
    benchSize: z.coerce.number().int().min(0).max(15).optional(),
    editableAfterLockByOwner: z.coerce.boolean().default(false),
})
    .refine((v) => !v.overseasCapEnabled || typeof v.maxOverseasInXI === "number", {
    message: "Set the max overseas in XI when the cap is enabled",
    path: ["maxOverseasInXI"],
});
// ---- Cricket squad targets (auto-pilot) ------------------------------------
// Auto-pilot squad-composition targets. Openers are a SUBSET of batsmen, so the
// opener target may not exceed the total batsmen target.
export const cricketSquadTargetsSchema = z
    .object({
    minWicketkeepers: z.coerce.number().int().min(0).max(11).default(1),
    minBatsmen: z.coerce.number().int().min(0).max(11).default(3),
    minOpeners: z.coerce.number().int().min(0).max(11).default(2),
    minPaceBowlers: z.coerce.number().int().min(0).max(11).default(2),
    minSpinners: z.coerce.number().int().min(0).max(11).default(1),
    minAllRounders: z.coerce.number().int().min(0).max(11).default(1),
})
    .refine((v) => v.minOpeners <= v.minBatsmen, {
    message: "Openers cannot exceed the total batsmen target",
    path: ["minOpeners"],
});
