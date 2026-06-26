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
];
export const BIDDING_MODES = ["ORGANIZER", "FRANCHISE"];
export const AUCTION_ROUNDS = ["MAIN", "RE_AUCTION", "ASSIGNMENT"];
export const LOT_STATUSES = ["PENDING", "ON_BLOCK", "SOLD", "UNSOLD", "ASSIGNED"];
// ---- Auction ---------------------------------------------------------------
export const createAuctionSchema = z.object({
    name: z.string().trim().min(1, "Name is required").max(120),
    biddingMode: z.enum(BIDDING_MODES).default("FRANCHISE"),
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
    minTeams: z.coerce.number().int().min(2),
    maxTeams: z.coerce.number().int().min(2),
    unsoldPrice: moneyString,
    defaultLotDurationSec: z.coerce.number().int().min(5).max(600).default(30),
})
    .refine((v) => v.maxPlayersPerTeam >= v.minPlayersPerTeam, {
    message: "Max players must be ≥ min players",
    path: ["maxPlayersPerTeam"],
})
    .refine((v) => v.maxTeams >= v.minTeams, {
    message: "Max teams must be ≥ min teams",
    path: ["maxTeams"],
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
