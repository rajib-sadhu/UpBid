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
] as const;
export type AuctionStatus = (typeof AUCTION_STATUSES)[number];

export const BIDDING_MODES = ["ORGANIZER", "FRANCHISE"] as const;
export type BiddingMode = (typeof BIDDING_MODES)[number];

export const AUCTION_ROUNDS = ["MAIN", "RE_AUCTION", "ASSIGNMENT"] as const;
export type AuctionRound = (typeof AUCTION_ROUNDS)[number];

export const LOT_STATUSES = ["PENDING", "ON_BLOCK", "SOLD", "UNSOLD", "ASSIGNED"] as const;
export type LotStatus = (typeof LOT_STATUSES)[number];

// ---- Auction ---------------------------------------------------------------

export const createAuctionSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  biddingMode: z.enum(BIDDING_MODES).default("FRANCHISE"),
});
export type CreateAuctionInput = z.infer<typeof createAuctionSchema>;

export const updateAuctionSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  biddingMode: z.enum(BIDDING_MODES),
});
export type UpdateAuctionInput = z.infer<typeof updateAuctionSchema>;

// ---- Rules -----------------------------------------------------------------

export const auctionRulesSchema = z
  .object({
    creditPerTeam: positiveMoneyString,
    minPlayersPerTeam: z.coerce.number().int().min(1),
    maxPlayersPerTeam: z.coerce.number().int().min(1),
    unsoldPrice: moneyString,
    defaultBasePrice: positiveMoneyString,
    defaultLotDurationSec: z.coerce.number().int().min(5).max(600).default(30),
  })
  .refine((v) => v.maxPlayersPerTeam >= v.minPlayersPerTeam, {
    message: "Max players must be ≥ min players",
    path: ["maxPlayersPerTeam"],
  });
export type AuctionRulesInput = z.infer<typeof auctionRulesSchema>;

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
export type IncrementTiersInput = z.infer<typeof incrementTiersSchema>;

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
export type LineupRulesInput = z.infer<typeof lineupRulesSchema>;

// ---- DTOs ------------------------------------------------------------------

export interface AuctionRulesDTO {
  creditPerTeam: string;
  minPlayersPerTeam: number;
  maxPlayersPerTeam: number;
  unsoldPrice: string;
  defaultBasePrice: string;
  defaultLotDurationSec: number;
}

export interface IncrementTierDTO {
  id: string;
  fromAmount: string;
  increment: string;
}

export interface LineupRulesDTO {
  startingSize: number;
  overseasCapEnabled: boolean;
  maxOverseasInXI: number | null;
  requireWicketkeeper: boolean;
  requireCaptain: boolean;
  requireViceCaptain: boolean;
  requireFirstBowler: boolean;
  requireSecondBowler: boolean;
  requireFullBattingOrder: boolean;
  benchSize: number | null;
  editableAfterLockByOwner: boolean;
}

export interface Auction {
  id: string;
  name: string;
  seasonId: string;
  status: AuctionStatus;
  biddingMode: BiddingMode;
  round: AuctionRound;
  createdAt: string;
  teamCount?: number;
  lotCount?: number;
}

/** Full auction config for the DRAFT setup screen. */
export interface AuctionDetail extends Auction {
  sport: import("./sports.js").Sport;
  leagueId: string;
  rules: AuctionRulesDTO | null;
  lineupRules: LineupRulesDTO | null;
  incrementTiers: IncrementTierDTO[];
  allowedFormationIds: string[];
}
